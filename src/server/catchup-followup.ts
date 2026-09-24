/**
 * Catch-up gather for the 24-HOUR FOLLOW-UP text (Script B core).
 *
 * Selects recipients of the follow-up: ALL active VinSolutions leads from the
 * last N days (default 7) whose 24h "anniversary" (createdUtc + 24h) has passed
 * and who have NOT already been followed up (the automation_runs ledger — makes
 * re-runs idempotent, so the script can "catch up" after a pause).
 *
 * Unlike the immediate text, no Vapi/Tavus exclude is applied. It IS restricted to
 * SALES leads by default (`salesOnly`, operator 2026-07-08): the follow-up is spoken
 * by Caroline/sales, so SERVICE/PARTS leads are dropped (they have their own channel).
 * Pass salesOnly:false to include them. Anniversary-timed; bounded by the A2P daytime
 * window (08:00–21:00 CT).
 *
 * Pure/injectable: the VIN broker call and the ledger check are injectable so the
 * selection logic is unit-tested without a live broker or DB.
 */

import { resolveVinOrgId, resolveLeadNames } from './vin-client'
import { canonicalizeContactHandle } from './phone-handle'
import { hasAutomationRun, hasOutboundSmsSince } from './messaging-hub-store'
import { followupWindowState } from './send-windows'
import type { StudioConfig } from '../lib/studio-config'
import { callCentralMcpTool } from './central-mcp'
import { type CallFn, fetchLeadsPaged, isValidSmsE164, leadVehicle, str } from './catchup-common'

/** 24 hours in ms — the follow-up anniversary offset. */
export const FOLLOWUP_AFTER_MS = 24 * 60 * 60_000
const DEFAULT_DAYS = 7

export type FollowupCandidate = {
  leadId: string | null
  contactId: string | null
  phone: string
  firstName: string | null
  vehicle: string | null
  leadType: string | null
  /** Resolved lead-source name (or raw id string when unresolved), null if absent. */
  leadSource: string | null
  createdUtc: string | null
  anniversaryMs: number
}

/** VIN leadType values treated as NON-sales (excluded when salesOnly). */
const SERVICE_LEAD_TYPES = new Set(['SERVICE', 'PARTS_ORDER'])

export type FollowupDrop = {
  leadId: string | null
  phone: string | null
  reason: string
  /** Optional enrichment (populated for the CSV-visible drops only). */
  firstName?: string | null
  leadType?: string | null
  createdUtc?: string | null
  leadSource?: string | null
}

export type FollowupGatherResult = {
  orgId: string | null
  polledTotal: number
  activeCount: number
  dueCount: number
  /** Due, sales-scoped leads that survived the since/exclude filters. */
  salesCount: number
  candidates: FollowupCandidate[]
  dropped: FollowupDrop[]
  windowOpen: boolean
  nextOpenMs: number | null
  startDate: string
  endDate: string
  skipped?: string
}

export type FollowupGatherDeps = {
  call?: CallFn
  /** Injected dedup: has the follow-up automation already fired for this handle? */
  hasRun?: (contactHandle: string) => boolean
  /** Injected `--skip-texted-since` check: any outbound sms to this phone since the floor? */
  hasTextedSince?: (phone: string) => boolean
}

/** Raw lead-source value from a VIN lead row (a URL href, a name, or an id). */
function rawLeadSource(lead: Record<string, unknown>): string | null {
  const v = lead.leadSource ?? lead.lead_source ?? lead.source
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number') return String(v)
  return null
}

/** Numeric VinSolutions lead-source id from a source URL, or null. */
function leadSourceId(raw: string): string | null {
  const m = raw.match(/leadsources\/id\/(\d+)/)
  return m ? m[1] : null
}

/**
 * Resolve a lead's source to a human name the way the rest of the codebase does
 * (id → name via the injected `sourceNames` map), falling back to the raw id
 * string, then to the raw value. Null when the lead carries no source.
 */
export function resolveLeadSourceName(
  lead: Record<string, unknown>,
  sourceNames?: Map<string, string>,
): string | null {
  const raw = rawLeadSource(lead)
  if (!raw) return null
  const id = leadSourceId(raw)
  if (id && sourceNames?.get(id)) return sourceNames.get(id) as string
  if (id) return id
  return raw
}

/** Parse a YYYY-MM-DD date to its UTC-midnight epoch ms, or null when invalid. */
function utcMidnightMs(date?: string): number | null {
  if (!date) return null
  const t = Date.parse(`${date}T00:00:00Z`)
  return Number.isFinite(t) ? t : null
}

export async function gatherFollowupCandidates(input: {
  profile: string
  now?: number
  config: StudioConfig
  /** Follow-up (lead_followup/sms) automation id — used by the default dedup check. */
  followupAutomationId?: string
  /** Look-back window in days (default 7). */
  days?: number
  /** When true (default), exclude SERVICE/PARTS leads — the follow-up is spoken by
   * the SALES agent (Caroline), so service leads should not get a sales check-in. */
  salesOnly?: boolean
  /** Explicit createdUtc floor (YYYY-MM-DD, UTC midnight). Overrides `days` for
   * the query window start; leads older than it are dropped, `before since floor`. */
  since?: string
  /** Lead-source NAMES (case-insensitive) to drop, `excluded source: <name>`. */
  excludeSources?: string[]
  /** YYYY-MM-DD: drop a candidate already texted (outbound sms) on/after this date. */
  skipTextedSince?: string
  /** Injected lead-source id→name map (for exclude/leadSource resolution). */
  sourceNames?: Map<string, string>
  deps?: FollowupGatherDeps
}): Promise<FollowupGatherResult> {
  const salesOnly = input.salesOnly ?? true
  const now = input.now ?? Date.now()
  const call = input.deps?.call ?? callCentralMcpTool
  const hasRun =
    input.deps?.hasRun ??
    ((handle: string) =>
      input.followupAutomationId
        ? hasAutomationRun(input.profile, input.followupAutomationId, handle)
        : false)

  const sinceMs = utcMidnightMs(input.since)
  const skipTextedMs = utcMidnightMs(input.skipTextedSince)
  const hasTextedSince =
    input.deps?.hasTextedSince ??
    ((phone: string) =>
      skipTextedMs != null ? hasOutboundSmsSince(input.profile, [phone], skipTextedMs) : false)
  const excludeMap = new Map((input.excludeSources ?? []).map((s) => [s.toLowerCase(), s]))
  const sourceNames = input.sourceNames

  const days = input.days ?? DEFAULT_DAYS
  const startDate =
    sinceMs != null
      ? new Date(sinceMs).toISOString()
      : new Date(now - days * 24 * 60 * 60_000).toISOString()
  const endDate = new Date(now).toISOString()
  const win = followupWindowState(input.config.comms, now)

  const base = {
    windowOpen: win.open,
    nextOpenMs: win.nextOpenMs,
    startDate,
    endDate,
  }

  const org = resolveVinOrgId(input.profile, input.config)
  if (!org.ok) {
    return {
      orgId: null,
      polledTotal: 0,
      activeCount: 0,
      dueCount: 0,
      salesCount: 0,
      candidates: [],
      dropped: [],
      ...base,
      skipped: `unconfigured VIN org: ${org.reason}`,
    }
  }

  const fetched = await fetchLeadsPaged({ call, orgId: org.orgId, startDate, endDate })
  if (!fetched.ok) {
    return {
      orgId: org.orgId,
      polledTotal: fetched.leads.length,
      activeCount: 0,
      dueCount: 0,
      salesCount: 0,
      candidates: [],
      dropped: [],
      ...base,
      skipped: fetched.error,
    }
  }
  const raw = fetched.leads

  // ALL active leads (any active status) — the follow-up is not new-only.
  const active = raw.filter((l) => str(l.leadStatusType) === 'ACTIVE')
  // Due = 24h anniversary passed.
  const due = active.filter((l) => {
    const created = str(l.createdUtc)
    if (!created) return false
    const t = Date.parse(created)
    return Number.isFinite(t) && t + FOLLOWUP_AFTER_MS <= now
  })

  const dropped: FollowupDrop[] = []

  // Filter the due leads: --since floor → sales-only (SERVICE/PARTS) → --exclude-source.
  const sendable = due.filter((l) => {
    const leadId = str(l.leadId) ?? str(l.id)
    // --since: drop anything created before the explicit floor.
    if (sinceMs != null) {
      const created = str(l.createdUtc)
      const t = created ? Date.parse(created) : NaN
      if (!Number.isFinite(t) || t < sinceMs) {
        dropped.push({
          leadId,
          phone: null,
          reason: 'before since floor',
          leadType: str(l.leadType),
          createdUtc: created,
          leadSource: resolveLeadSourceName(l, sourceNames),
        })
        return false
      }
    }
    // Sales-only: drop SERVICE/PARTS leads (the follow-up is spoken by Caroline/sales).
    if (salesOnly) {
      const lt = (str(l.leadType) ?? '').toUpperCase()
      if (SERVICE_LEAD_TYPES.has(lt)) {
        dropped.push({
          leadId,
          phone: null,
          reason: `excluded: ${lt.toLowerCase()} lead (sales follow-up)`,
        })
        return false
      }
    }
    // --exclude-source: drop by resolved lead-source name (case-insensitive).
    if (excludeMap.size) {
      const name = resolveLeadSourceName(l, sourceNames)
      if (name && excludeMap.has(name.toLowerCase())) {
        dropped.push({
          leadId,
          phone: null,
          reason: `excluded source: ${excludeMap.get(name.toLowerCase())}`,
          leadType: str(l.leadType),
          createdUtc: str(l.createdUtc),
          leadSource: name,
        })
        return false
      }
    }
    return true
  })

  const resolved = await resolveLeadNames(sendable, { orgId: org.orgId, cap: sendable.length, call })

  const candidates: FollowupCandidate[] = []
  for (const lead of resolved) {
    const leadId = str(lead.leadId) ?? str(lead.id)
    const rawPhone = lead.resolved?.phone ?? null
    if (!rawPhone) {
      dropped.push({ leadId, phone: null, reason: 'no phone on resolved contact' })
      continue
    }
    const phone = canonicalizeContactHandle('sms', String(rawPhone))
    if (!isValidSmsE164(phone)) {
      dropped.push({ leadId, phone, reason: 'invalid phone number (not deliverable E.164)' })
      continue
    }
    if (hasRun(phone)) {
      dropped.push({ leadId, phone, reason: 'already followed up (dedup ledger)' })
      continue
    }
    const created = str(lead.createdUtc)
    const firstName = lead.resolved?.firstName ?? null
    const leadType = str(lead.leadType)
    const leadSource = resolveLeadSourceName(lead, sourceNames)
    // --skip-texted-since: drop a customer already reached by outbound sms (reply path).
    if (input.skipTextedSince && hasTextedSince(phone)) {
      dropped.push({
        leadId,
        phone,
        reason: `already texted since ${input.skipTextedSince}`,
        firstName,
        leadType,
        createdUtc: created,
        leadSource,
      })
      continue
    }
    candidates.push({
      leadId,
      contactId: lead.contactId,
      phone,
      firstName,
      vehicle: leadVehicle(lead),
      leadType,
      leadSource,
      createdUtc: created,
      anniversaryMs: created ? Date.parse(created) + FOLLOWUP_AFTER_MS : now,
    })
  }

  return {
    orgId: org.orgId,
    polledTotal: raw.length,
    activeCount: active.length,
    dueCount: due.length,
    salesCount: sendable.length,
    candidates,
    dropped,
    ...base,
  }
}
