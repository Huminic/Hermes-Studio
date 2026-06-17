/**
 * VIN safe-access client — the two-step name resolution (WS-1).
 *
 * THE PECULIARITY (verified against live Nexxus + the central-mcp broker):
 *   `vin_query_leads` returns lead items whose `contact` field is a URL *href*
 *   (`…/contacts/id/{contactId}`) — there is NO name on the lead. To get a real
 *   name you must take a SECOND step:
 *     1. vin_query_leads { orgId, startDate, endDate, limit } → leads (href only)
 *     2. parse the contactId out of the href
 *     3. vin_get_contact { orgId, contactId } → the real contact
 *        (names/phone/email live under `ContactInformation`)
 *
 * orgId is the **Nexxus org UUID**, NOT the VIN dealerId — the broker maps
 * UUID→dealerId internally. It is per-profile config (see resolveVinOrgId).
 *
 * Rate cap: resolve at most N contacts (default 10) per call/cycle — Nexxus
 * throttles otherwise. The cap is a parameter.
 *
 * Nothing here persists VIN data; callers must preserve their own redaction
 * (Brain stores only {redacted, rows: count}, never the rows).
 */

import { callCentralMcpTool } from './central-mcp'
import { readStudioConfig } from './studio-config'
import type { CentralMcpResult } from './central-mcp'
import type { StudioConfig } from '../lib/studio-config'

/** Default per-cycle contact-resolution cap (Nexxus parity). */
export const DEFAULT_NAME_RESOLVE_CAP = 10

export type VinOrgIdResult =
  | { ok: true; orgId: string }
  | { ok: false; unconfigured: true; reason: string }

/**
 * Resolve the per-profile Nexxus org UUID for VIN calls. Order:
 *   1. studio.yaml `vin.org_id` (operator-controlled, preferred)
 *   2. `VIN_ORG_ID` profile env var (deploy-time fallback)
 * Never falls back to the profile slug — passing the slug as orgId silently
 * fails at the broker, so an absent UUID is reported `unconfigured` instead.
 */
export function resolveVinOrgId(profile: string, config?: StudioConfig): VinOrgIdResult {
  const cfg = config ?? readStudioConfig(profile).config
  const fromYaml = cfg.vin.org_id?.trim()
  if (fromYaml) return { ok: true, orgId: fromYaml }
  const fromEnv = process.env.VIN_ORG_ID?.trim()
  if (fromEnv) return { ok: true, orgId: fromEnv }
  return {
    ok: false,
    unconfigured: true,
    // Dealer-facing-typed (flows into lead_funnel.reason) — keep it generic, no
    // CRM/vendor/config internals. The detailed cause is for the server log.
    reason: 'Lead reporting is not enabled for this store yet.',
  }
}

/**
 * Parse the VIN contactId out of a `contact` href like
 * `https://…/contacts/id/12345`. Returns null when the field is absent or not a
 * contact href (e.g. already-resolved leads, or an unexpected shape).
 */
export function parseContactId(href: unknown): string | null {
  if (typeof href !== 'string') return null
  const m = href.match(/\/contacts\/id\/(\d+)/)
  return m ? m[1] : null
}

export type FlatContact = {
  contactId: string | null
  firstName: string | null
  lastName: string | null
  fullName: string | null
  email: string | null
  phone: string | null
}

function asArray(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []
}

function firstString(...vals: Array<unknown>): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return null
}

/**
 * Flatten a raw `vin_get_contact` payload into a stable shape. Names/phone/email
 * live under `ContactInformation`:
 *   - Email: prefer `Emails[]` where `EmailType === 'Primary'`, else the first.
 *   - Phone: prefer `Phones[]` where `PhoneType === 'Cell'`, then `'Home'`,
 *            then the first.
 *   - firstName/lastName sit on the contact (also accept camel/snake variants).
 * Tolerant of the broker unwrapping the contact into `{ contact: {…} }` or
 * `{ Contact: {…} }`.
 */
export function flattenContact(raw: unknown): FlatContact {
  const root = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {})
  const contact = (
    root.contact && typeof root.contact === 'object'
      ? root.contact
      : root.Contact && typeof root.Contact === 'object'
        ? root.Contact
        : root
  ) as Record<string, unknown>

  const ci = (
    contact.ContactInformation && typeof contact.ContactInformation === 'object'
      ? contact.ContactInformation
      : contact.contactInformation && typeof contact.contactInformation === 'object'
        ? contact.contactInformation
        : {}
  ) as Record<string, unknown>

  const firstName = firstString(contact.firstName, contact.FirstName, contact.first_name)
  const lastName = firstString(contact.lastName, contact.LastName, contact.last_name)
  const fullName =
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    firstString(contact.fullName, contact.FullName, contact.name, contact.Name)

  const emails = asArray(ci.Emails ?? ci.emails)
  const primaryEmail = emails.find(
    (e) => String(e.EmailType ?? e.emailType ?? '').toLowerCase() === 'primary',
  )
  const email = firstString(
    primaryEmail?.Email ?? primaryEmail?.email ?? primaryEmail?.Address,
    emails[0]?.Email ?? emails[0]?.email ?? emails[0]?.Address,
    contact.email,
    contact.Email,
  )

  const phones = asArray(ci.Phones ?? ci.phones)
  const phoneType = (p: Record<string, unknown>) =>
    String(p.PhoneType ?? p.phoneType ?? '').toLowerCase()
  const phoneVal = (p?: Record<string, unknown>) =>
    p ? firstString(p.Phone ?? p.phone ?? p.Number ?? p.number) : null
  const phone =
    phoneVal(phones.find((p) => phoneType(p) === 'cell')) ??
    phoneVal(phones.find((p) => phoneType(p) === 'home')) ??
    phoneVal(phones[0]) ??
    firstString(contact.phone, contact.Phone)

  return {
    contactId: firstString(contact.id, contact.Id, contact.contactId, contact.ContactId),
    firstName,
    lastName,
    fullName,
    email,
    phone,
  }
}

/** A lead enriched with the resolved contact (when resolution succeeded). */
export type ResolvedLead = Record<string, unknown> & {
  contactId: string | null
  resolved: FlatContact | null
  resolved_name: string | null
}

export type ResolveLeadNamesResult =
  | { ok: true; orgId: string; resolvedCount: number; leads: Array<ResolvedLead> }
  | { ok: false; unconfigured?: boolean; reason: string; leads: Array<ResolvedLead> }

type CallFn = (
  tool: string,
  args: Record<string, unknown>,
  opts?: { timeoutMs?: number },
) => Promise<CentralMcpResult>

/**
 * Enrich a list of `vin_query_leads` lead items with real contacts via
 * `vin_get_contact`. At most `cap` contacts are resolved (Nexxus throttle
 * parity, default from studio.yaml `vin.name_resolve_cap` → 10); leads beyond
 * the cap pass through with `resolved: null`. Distinct contactIds are
 * de-duplicated so the cap counts unique broker calls, not lead rows.
 *
 * `orgId` is required and must be the Nexxus org UUID — callers resolve it via
 * resolveVinOrgId so an unconfigured profile fails loudly rather than sending a
 * bad orgId. This function never persists anything.
 */
export async function resolveLeadNames(
  leads: Array<Record<string, unknown>>,
  opts: {
    orgId: string
    cap?: number
    /** Injected for tests; defaults to the real broker client. */
    call?: CallFn
    timeoutMs?: number
  },
): Promise<Array<ResolvedLead>> {
  const cap = opts.cap ?? DEFAULT_NAME_RESOLVE_CAP
  const call = opts.call ?? callCentralMcpTool
  const out: Array<ResolvedLead> = leads.map((lead) => ({
    ...lead,
    contactId: parseContactId(lead.contact),
    resolved: null,
    resolved_name: null,
  }))

  // Unique contactIds in first-seen order, capped.
  const order: Array<string> = []
  const seen = new Set<string>()
  for (const l of out) {
    if (l.contactId && !seen.has(l.contactId)) {
      seen.add(l.contactId)
      order.push(l.contactId)
      if (order.length >= cap) break
    }
  }

  const resolvedById = new Map<string, FlatContact>()
  for (const contactId of order) {
    // The broker's vin_get_contact schema requires contactId as a NUMBER; a
    // string is rejected ("Expected number, received string"). contactId is
    // parsed from the lead href as a digit string, so coerce it here.
    const r = await call('vin_get_contact', { orgId: opts.orgId, contactId: Number(contactId) }, {
      timeoutMs: opts.timeoutMs,
    })
    if (r.ok) resolvedById.set(contactId, flattenContact(r.data))
  }

  for (const l of out) {
    if (l.contactId && resolvedById.has(l.contactId)) {
      const c = resolvedById.get(l.contactId)!
      l.resolved = c
      l.resolved_name = c.fullName
    }
  }
  return out
}
