/**
 * CRM-query audience builder (Marketing → Lists).
 *
 * Generates a saved list from the live CRM via the SAME MCP capability the
 * VIN-watcher uses (`vin_query_leads` through the central-mcp broker). It pulls
 * leads for a recent window, upserts each as a hub contact (phone/email), drops
 * DNC/opted-out handles before the list is usable, and saves an audience that
 * targets exactly those contacts.
 *
 * HONEST MCP LIMITS (surfaced to the UI, not hidden):
 *   - The broker exposes `vin_query_leads` with a DATE WINDOW + a row LIMIT. It
 *     does NOT expose arbitrary field predicates (status/source/score) as query
 *     params, so server-side filtering beyond the window is not available — we
 *     pull the window and import what it returns. `limits` in the result states
 *     the window + cap actually applied.
 *   - Name/vehicle enrichment (resolveLeadNames) is rate-capped upstream; this
 *     builder imports the contact handles + any name present on the row, and
 *     does not deep-resolve names (kept light for list building).
 */

import { resolveVinOrgId } from './vin-client'
import { callCentralMcpTool, type CentralMcpResult } from './central-mcp'
import { readStudioConfig } from './studio-config'
import { createAudience, upsertContact } from './messaging-hub-store'
import { isBlacklisted } from './comms-blacklist'
import type { StudioConfig } from '../lib/studio-config'

type CallFn = (
  tool: string,
  args: Record<string, unknown>,
  opts?: { timeoutMs?: number },
) => Promise<CentralMcpResult>

export type CrmAudienceResult =
  | {
      ok: true
      audience: { id: string; name: string }
      imported: number
      dnc_blocked: number
      polled: number
      limits: string
    }
  | { ok: false; error: string }

/** Pull the lead array out of whatever envelope the broker returns. */
function extractLeads(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    for (const key of ['leads', 'rows', 'items', 'results']) {
      if (Array.isArray(o[key])) return o[key] as Array<Record<string, unknown>>
    }
  }
  return []
}

function firstString(
  lead: Record<string, unknown>,
  keys: Array<string>,
): string | null {
  for (const k of keys) {
    const v = lead[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

function normalizePhone(p: string | null): string | null {
  if (!p) return null
  const digits = p.replace(/[^\d+]/g, '')
  return digits || null
}

/**
 * Build (and save) a CRM-query audience. `deps.call` is injectable for tests;
 * the default wires the real broker. Returns documented `limits` either way.
 */
export async function buildCrmAudience(input: {
  profile: string
  name?: string
  /** Look-back window in days (default 30). */
  days?: number
  /** Max rows to import (default 50). */
  limit?: number
  now?: number
  config?: StudioConfig
  deps?: { call?: CallFn }
}): Promise<CrmAudienceResult> {
  const now = input.now ?? Date.now()
  const call = input.deps?.call ?? callCentralMcpTool
  const config = input.config ?? readStudioConfig(input.profile).config

  const org = resolveVinOrgId(input.profile, config)
  if (!org.ok) {
    return { ok: false, error: org.reason }
  }
  const days = Math.max(1, Math.min(input.days ?? 30, 365))
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200))
  const startDate = new Date(now - days * 24 * 60 * 60_000).toISOString()
  const endDate = new Date(now).toISOString()

  const res = await call('vin_query_leads', {
    orgId: org.orgId,
    startDate,
    endDate,
    limit,
  })
  if (!res.ok) {
    return { ok: false, error: `CRM query unavailable: ${res.error}` }
  }
  const leads = extractLeads(res.data).slice(0, limit)

  const contactIds: Array<string> = []
  let dncBlocked = 0
  for (const lead of leads) {
    const phone = normalizePhone(
      firstString(lead, ['phone', 'Phone', 'cellPhone', 'phoneNumber', 'mobile']),
    )
    const emailRaw = firstString(lead, ['email', 'Email', 'emailAddress'])
    const email = emailRaw && emailRaw.includes('@') ? emailRaw : null
    if (!phone && !email) continue

    if ((phone && isBlacklisted(input.profile, phone)) || (email && isBlacklisted(input.profile, email))) {
      dncBlocked++
      continue
    }
    const identifiers: Record<string, string> = {}
    if (phone) identifiers.sms = phone
    if (email) identifiers.email = email
    const name = firstString(lead, [
      'firstName',
      'first_name',
      'name',
      'fullName',
      'displayName',
    ])
    const contact = upsertContact({
      profile: input.profile,
      display_name: name,
      identifiers,
    })
    contactIds.push(contact.id)
  }

  const uniqueIds = Array.from(new Set(contactIds))
  const name = (input.name && input.name.trim()) || `CRM leads · last ${days}d`
  const audience = createAudience({
    profile: input.profile,
    name,
    query: { contact_ids: uniqueIds },
  })

  return {
    ok: true,
    audience: { id: audience.id, name: audience.name },
    imported: uniqueIds.length,
    dnc_blocked: dncBlocked,
    polled: leads.length,
    limits: `vin_query_leads supports a date window + row cap only; imported the last ${days} days (cap ${limit}). Field-level CRM filters (status/source/score) are not exposed by the broker.`,
  }
}
