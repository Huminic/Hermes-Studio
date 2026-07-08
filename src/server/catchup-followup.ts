/**
 * Catch-up gather for the 24-HOUR FOLLOW-UP text (Script B core).
 *
 * Selects recipients of the follow-up: ALL active VinSolutions leads from the
 * last N days (default 7) whose 24h "anniversary" (createdUtc + 24h) has passed
 * and who have NOT already been followed up (the automation_runs ledger — makes
 * re-runs idempotent, so the script can "catch up" after a pause).
 *
 * Unlike the immediate text, the follow-up goes to ALL leads (operator: "all the
 * leads however get the 24 hour follow up 24 hours later") — so NO Vapi/Tavus
 * exclude is applied here. It is anniversary-timed and only bounded by the A2P
 * daytime window (08:00–21:00 CT).
 *
 * Pure/injectable: the VIN broker call and the ledger check are injectable so the
 * selection logic is unit-tested without a live broker or DB.
 */

import { resolveVinOrgId, resolveLeadNames } from './vin-client'
import { canonicalizeContactHandle } from './phone-handle'
import { hasAutomationRun } from './messaging-hub-store'
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
  createdUtc: string | null
  anniversaryMs: number
}

export type FollowupDrop = { leadId: string | null; phone: string | null; reason: string }

export type FollowupGatherResult = {
  orgId: string | null
  polledTotal: number
  activeCount: number
  dueCount: number
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
}

export async function gatherFollowupCandidates(input: {
  profile: string
  now?: number
  config: StudioConfig
  /** Follow-up (lead_followup/sms) automation id — used by the default dedup check. */
  followupAutomationId?: string
  /** Look-back window in days (default 7). */
  days?: number
  deps?: FollowupGatherDeps
}): Promise<FollowupGatherResult> {
  const now = input.now ?? Date.now()
  const call = input.deps?.call ?? callCentralMcpTool
  const hasRun =
    input.deps?.hasRun ??
    ((handle: string) =>
      input.followupAutomationId
        ? hasAutomationRun(input.profile, input.followupAutomationId, handle)
        : false)

  const days = input.days ?? DEFAULT_DAYS
  const startDate = new Date(now - days * 24 * 60 * 60_000).toISOString()
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

  const resolved = await resolveLeadNames(due, { orgId: org.orgId, cap: due.length, call })

  const candidates: FollowupCandidate[] = []
  const dropped: FollowupDrop[] = []
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
    candidates.push({
      leadId,
      contactId: lead.contactId,
      phone,
      firstName: lead.resolved?.firstName ?? null,
      vehicle: leadVehicle(lead),
      createdUtc: created,
      anniversaryMs: created ? Date.parse(created) + FOLLOWUP_AFTER_MS : now,
    })
  }

  return {
    orgId: org.orgId,
    polledTotal: raw.length,
    activeCount: active.length,
    dueCount: due.length,
    candidates,
    dropped,
    ...base,
  }
}
