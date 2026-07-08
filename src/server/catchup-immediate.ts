/**
 * Catch-up gather for the IMMEDIATE lead-engagement text (Script A core).
 *
 * Selects the recipients of the immediate first-touch: NEW VinSolutions leads
 * created today (CT) that have NOT been followed up, EXCLUDING leads already
 * handled by a conversational agent (Vapi/Tavus) and any lead already sent (the
 * automation_runs ledger — makes re-runs idempotent "catch-up" passes).
 *
 * Pure/injectable: the VIN broker call, the agent-handled check, and the ledger
 * check are all injectable so the selection logic is unit-tested without a live
 * broker or DB. The thin CLI (scripts/catchup-immediate.ts) wires the real deps,
 * prints the recipient list (dry-run), and dispatches on --send.
 *
 * "Not yet followed up" == leadStatus 'ACTIVE_NEW_LEAD' (operator-confirmed
 * 2026-07-08). WAITING (already contacted) and BAD_* (bad/duplicate) are dropped.
 */

import { resolveVinOrgId, resolveLeadNames } from './vin-client'
import { canonicalizeContactHandle } from './phone-handle'
import { isAgentHandled as defaultIsAgentHandled } from './immediate-exclude'
import { hasAutomationRun } from './messaging-hub-store'
import { immediateWindowState } from './send-windows'
import type { StudioConfig } from '../lib/studio-config'
import { callCentralMcpTool } from './central-mcp'
import {
  type CallFn,
  fetchLeadsPaged,
  isValidSmsE164,
  leadVehicle,
  localMidnight,
  str,
} from './catchup-common'

export { localMidnight } from './catchup-common'

/** The VinSolutions status that means "new, not yet followed up". */
export const NEW_LEAD_STATUS = 'ACTIVE_NEW_LEAD'

export type ImmediateCandidate = {
  leadId: string | null
  contactId: string | null
  phone: string
  firstName: string | null
  vehicle: string | null
  createdUtc: string | null
}

export type ImmediateDrop = {
  leadId: string | null
  phone: string | null
  reason: string
}

export type ImmediateGatherResult = {
  orgId: string | null
  polledTotal: number
  newLeadCount: number
  candidates: ImmediateCandidate[]
  dropped: ImmediateDrop[]
  windowOpen: boolean
  nextOpenMs: number | null
  startDate: string
  endDate: string
  skipped?: string
}

export type ImmediateGatherDeps = {
  call?: CallFn
  /** Injected agent-handled (Vapi/Tavus) exclude check. */
  isAgentHandled?: (phone: string) => boolean
  /** Injected dedup: has the immediate automation already fired for this handle? */
  hasRun?: (contactHandle: string) => boolean
}

/**
 * Gather immediate-engagement candidates. Does not send — pure selection +
 * window state. Callers dispatch (dry-run prints; --send fires).
 */
export async function gatherImmediateCandidates(input: {
  profile: string
  now?: number
  config: StudioConfig
  /** Immediate (new_lead/sms) automation id — used by the default dedup check. */
  immediateAutomationId?: string
  /** Look back to this instant instead of local midnight (pause-recovery catch-up). */
  sinceMs?: number
  deps?: ImmediateGatherDeps
}): Promise<ImmediateGatherResult> {
  const now = input.now ?? Date.now()
  const call = input.deps?.call ?? callCentralMcpTool
  const isAgentHandled =
    input.deps?.isAgentHandled ??
    ((phone: string) => defaultIsAgentHandled({ profile: input.profile, phone, cfg: input.config.comms }))
  // Default dedup keys on the immediate automation id when provided; without one
  // (or without an injected hasRun) no lead is deduped — the script always passes
  // the resolved id, so this only relaxes in tests/misconfig.
  const hasRun =
    input.deps?.hasRun ??
    ((handle: string) =>
      input.immediateAutomationId
        ? hasAutomationRun(input.profile, input.immediateAutomationId, handle)
        : false)

  const tz = input.config.comms?.business_hours?.tz ?? 'America/Chicago'
  const startMs = input.sinceMs ?? localMidnight(tz, now)
  const startDate = new Date(startMs).toISOString()
  const endDate = new Date(now).toISOString()
  const win = immediateWindowState(input.config.comms, now)

  const org = resolveVinOrgId(input.profile, input.config)
  if (!org.ok) {
    return {
      orgId: null,
      polledTotal: 0,
      newLeadCount: 0,
      candidates: [],
      dropped: [],
      windowOpen: win.open,
      nextOpenMs: win.nextOpenMs,
      startDate,
      endDate,
      skipped: `unconfigured VIN org: ${org.reason}`,
    }
  }

  // Paginate the day's leads.
  const fetched = await fetchLeadsPaged({ call, orgId: org.orgId, startDate, endDate })
  if (!fetched.ok) {
    return {
      orgId: org.orgId,
      polledTotal: fetched.leads.length,
      newLeadCount: 0,
      candidates: [],
      dropped: [],
      windowOpen: win.open,
      nextOpenMs: win.nextOpenMs,
      startDate,
      endDate,
      skipped: fetched.error,
    }
  }
  const raw = fetched.leads

  // Keep only NEW (not-yet-followed-up) leads.
  const newLeads = raw.filter((l) => str(l.leadStatus) === NEW_LEAD_STATUS)
  const resolved = await resolveLeadNames(newLeads, {
    orgId: org.orgId,
    cap: newLeads.length,
    call,
  })

  const candidates: ImmediateCandidate[] = []
  const dropped: ImmediateDrop[] = []
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
    if (isAgentHandled(phone)) {
      dropped.push({ leadId, phone, reason: 'excluded: agent-handled (vapi/tavus)' })
      continue
    }
    if (hasRun(phone)) {
      dropped.push({ leadId, phone, reason: 'already sent (dedup ledger)' })
      continue
    }
    candidates.push({
      leadId,
      contactId: lead.contactId,
      phone,
      firstName: lead.resolved?.firstName ?? null,
      vehicle: leadVehicle(lead),
      createdUtc: str(lead.createdUtc),
    })
  }

  return {
    orgId: org.orgId,
    polledTotal: raw.length,
    newLeadCount: newLeads.length,
    candidates,
    dropped,
    windowOpen: win.open,
    nextOpenMs: win.nextOpenMs,
    startDate,
    endDate,
  }
}
