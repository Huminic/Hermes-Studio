/**
 * VIN-watcher (WS-2) — the new-lead follow-up agent that replaces the Nexxus
 * `triggerService.ts`. It is NOT an LLM: the two follow-ups are STATIC templates
 * spoken as the dealership (NEXXUS_FIT_SPEC §1.4 + §WS-2).
 *
 * One `tickVinWatcher({ profile })` pass, per opt-in profile:
 *   1. Opt-in gate — `vin.watcher.enabled` (default OFF). Unconfigured orgId →
 *      skip cleanly (logged, no throw).
 *   2. Poll `vin_query_leads` for a recent window → `resolveLeadNames` (cap 10).
 *   3. IMMEDIATE trigger: lead synced <30 min, created <4 h, has phone; dedup
 *      24h (and skip if the phone already has a hub thread — already texted);
 *      business-hours (store tz, comms.business_hours) → send; else QUEUE for the
 *      next 07:00. Template speaks the dealership name.
 *   4. 24h CHECK-IN trigger: ~1440 min ±30 after the first contact; business-hours
 *      only (out-of-hours = wait, not queued); dedup 48h.
 *   5. SAFE TEST: a pre-launch allowlist (PRELAUNCH_SMS_LOCK + PRELAUNCH_TEST_RECIPIENTS)
 *      gates so a live run only texts the operator's number. Never broadcasts.
 *   6. Every send/queue/skip is recorded with a reason; the outbound is persisted
 *      through the messaging-hub so it lands in the Comms inbox + the audit.
 *
 * The actual SMS goes through `dispatchOutbound({channel:'sms'})`, so CommGate
 * (global kill switch, TCPA business-hours, blacklist, live VIN-DNC, rate caps)
 * applies on top of these gates — fail-closed by construction. This module adds
 * the trigger windows, hub dedup, the queue-for-07:00 behaviour, and the
 * pre-launch test allowlist that CommGate does not itself enforce.
 *
 * Nothing here persists raw VIN rows: only the resolved first name + the spoken
 * template land in the hub (Brain redaction preserved upstream in vin-client).
 *
 * Wired into the existing cadence via comms-scheduler.runDueWork (same place
 * tickCampaigns is invoked) and re-exposed for an explicit cron tick.
 */

import { resolveVinOrgId, resolveLeadNames, type ResolvedLead } from './vin-client'
import { callCentralMcpTool, type CentralMcpResult } from './central-mcp'
import { readStudioConfig } from './studio-config'
import { withinBusinessHours } from './comms-gate'
import { allowedByPrelaunchLock } from './prelaunch-lock'
import { dispatchOutbound, type AdapterResult } from './messaging-adapters'
import {
  listThreads,
  getOrCreateThread,
  appendMessage,
  getLeadFlow,
  hasInboundSince,
} from './messaging-hub-store'
import type { LeadSource } from './sms-triggers'
import { enrollLead } from './lead-flow'
import { openBrain } from './brain-store'
import type { StudioConfig } from '../lib/studio-config'

/** Hub domain the watcher's outbound sales follow-ups live under. */
export const WATCHER_DOMAIN = 'sales'
export const WATCHER_AUTHOR = 'vin-watcher'
/** The sales agent the dealership texts as (per spec: Caroline). */
export const WATCHER_AGENT_ID = 'caroline'

export type TriggerKind = 'immediate' | 'checkin'

/** Outcome of a single lead's evaluation, for the dashboard + audit. */
export type WatcherOutcome = {
  kind: TriggerKind | null
  /** 'sent' | 'queued' | 'skipped' | 'blocked' | 'failed' */
  action: 'sent' | 'queued' | 'skipped' | 'blocked' | 'failed'
  reason: string
  phone: string | null
  first_name: string | null
  thread_id?: string | null
}

export type WatcherTickResult = {
  profile: string
  /** When the profile was not swept at all (opt-out / unconfigured). */
  skipped?: string
  polled: number
  resolved: number
  sent: number
  queued: number
  blocked: number
  failed: number
  skippedLeads: number
  outcomes: Array<WatcherOutcome>
}

type CallFn = (
  tool: string,
  args: Record<string, unknown>,
  opts?: { timeoutMs?: number },
) => Promise<CentralMcpResult>

/**
 * Per-phone trigger ledger — the dedup + first-contact memory. Mirrors the
 * `thread_escalation` table pattern in comms-scheduler. Records the last time a
 * given (phone, kind) trigger fired so the 24h/48h dedup windows hold across
 * cycles, and so the 24h check-in can find when the immediate text went out.
 */
export type TriggerStore = {
  /** Last fire time (ms) for (phone, kind), or null if never. */
  lastFire(phone: string, kind: TriggerKind): number | null
  /** Record that (phone, kind) fired at `ts`. */
  record(phone: string, kind: TriggerKind, ts: number): void
}

function brainTriggerStore(profile: string, profileRoot?: string): TriggerStore {
  function table() {
    const h = openBrain(profile, { profileRoot })
    h.exec(
      `CREATE TABLE IF NOT EXISTS vin_watcher_trigger (
         phone TEXT, kind TEXT, ts INTEGER,
         PRIMARY KEY (phone, kind)
       )`,
    )
    return h
  }
  return {
    lastFire(phone, kind) {
      try {
        const row = table().get<{ ts: number }>(
          `SELECT ts FROM vin_watcher_trigger WHERE phone=? AND kind=?`,
          phone,
          kind,
        )
        return row?.ts ?? null
      } catch {
        return null
      }
    },
    record(phone, kind, ts) {
      try {
        table().run(
          `INSERT INTO vin_watcher_trigger (phone, kind, ts) VALUES (?, ?, ?)
           ON CONFLICT(phone, kind) DO UPDATE SET ts=excluded.ts`,
          phone,
          kind,
          ts,
        )
      } catch {
        // best-effort: a failed ledger write must never abort the sweep
      }
    },
  }
}

/** Dependencies, injectable for tests (defaults wire the real broker + hub). */
export type WatcherDeps = {
  call?: CallFn
  dispatch?: typeof dispatchOutbound
  triggerStore?: TriggerStore
  /** Phones with an existing hub thread/contact — "already texted" dedup. */
  knownPhones?: (profile: string) => Set<string>
}

function normalizePhone(p: unknown): string | null {
  if (typeof p !== 'string') return null
  const t = p.trim()
  if (!t) return null
  // Keep a leading + then digits only, so "+1 (415) 555-0100" and "+14155550100"
  // compare equal across VIN rows and hub handles.
  const digits = t.replace(/[^\d+]/g, '')
  return digits || null
}

/** Phones that already have ANY hub thread for this profile (already engaged). */
function hubKnownPhones(profile: string): Set<string> {
  const set = new Set<string>()
  let threads: Array<{ contact_handle: string }> = []
  try {
    threads = listThreads({ profile, limit: 1000 })
  } catch {
    return set
  }
  for (const t of threads) {
    const n = normalizePhone(t.contact_handle)
    if (n) set.add(n)
  }
  return set
}

/** Best-effort number out of a raw lead row (several shapes seen on VIN). */
function leadPhone(lead: ResolvedLead): string | null {
  if (lead.resolved?.phone) return normalizePhone(lead.resolved.phone)
  return normalizePhone(
    (lead.phone as unknown) ??
      (lead.Phone as unknown) ??
      (lead.cellPhone as unknown) ??
      (lead.phoneNumber as unknown),
  )
}

/** Best-effort email out of a raw lead row (for multi-channel escalation). */
function leadEmail(lead: ResolvedLead): string | null {
  const e =
    (lead.resolved?.email as unknown) ??
    (lead.email as unknown) ??
    (lead.Email as unknown) ??
    (lead.emailAddress as unknown)
  if (typeof e === 'string' && e.trim() && e.includes('@')) return e.trim()
  return null
}

/** Raw lead-source string out of a VIN row (several shapes seen on VIN). */
function leadSourceRaw(lead: ResolvedLead): string | null {
  const s =
    (lead.leadSource as unknown) ??
    (lead.source as unknown) ??
    (lead.leadProvider as unknown) ??
    (lead.provider as unknown) ??
    (lead.leadType as unknown) ??
    (lead.LeadSource as unknown) ??
    (lead.Source as unknown)
  if (typeof s === 'string' && s.trim()) return s.trim()
  return null
}

// Sources that mark a lead as OUR OWN (first-party): leads created through the
// dealer site / our widget / a walk-in / phone — Trigger 1 SKIPS these.
const FIRST_PARTY_SOURCE_RE =
  /website|web ?form|web ?lead|dealer ?site|dealer ?website|dealer\.com|our ?site|walk[- ]?in|showroom|phone|inbound call|live ?chat|chat widget|\bwidget\b|huminic|nexxus/i
// Recognised third-party marketplaces / aggregators — Trigger 1 is FOR these.
const THIRD_PARTY_SOURCE_RE =
  /cars\.com|autotrader|auto trader|cargurus|car ?gurus|kbb|kelley|truecar|true car|edmunds|carfax|carsdirect|dealerrater|capital ?one|true ?car|oem|manufacturer|marketplace|aggregator|third[- ]?party|facebook|fb |google|carscom|carscomlead/i

/**
 * Classify a VIN lead row's source for the Trigger-1 third-party gate (workstream
 * G). Our own first-party leads arrive through the messaging hub (widget/chat/
 * form), NOT through the VIN feed, so a VIN row with a named non-ours source is
 * treated as third-party; an explicitly first-party-looking source is excluded;
 * a row with NO source field stays 'unknown' (fail-closed — Trigger 1 will not
 * fire on it when third_party_only is set).
 *
 * NOTE: the exact authoritative VIN source field is a Duane confirmation item —
 * this heuristic is the launch default and is surfaced for review.
 */
function classifyLeadSource(lead: ResolvedLead): LeadSource {
  const raw = leadSourceRaw(lead)
  if (!raw) return 'unknown'
  if (FIRST_PARTY_SOURCE_RE.test(raw)) return 'first_party'
  if (THIRD_PARTY_SOURCE_RE.test(raw)) return 'third_party'
  // Unrecognised source → fail-closed 'unknown' (Trigger 1 will NOT cold-text
  // it). This avoids accidentally texting a mislabeled first-party lead. The
  // authoritative VIN source taxonomy is a Duane-confirmation item — expand
  // THIRD_PARTY_SOURCE_RE as real third-party source labels are confirmed.
  return 'unknown'
}

function leadVehicle(lead: ResolvedLead): string | null {
  const v =
    (lead.vehicleOfInterest as unknown) ??
    (lead.vehicle as unknown) ??
    (lead.VehicleOfInterest as unknown)
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const parts = [o.year, o.make, o.model, o.Year, o.Make, o.Model]
      .filter((x) => typeof x === 'string' || typeof x === 'number')
      .map(String)
    if (parts.length) return parts.join(' ').trim()
  }
  return null
}

function leadEpoch(lead: ResolvedLead, ...keys: Array<string>): number | null {
  for (const k of keys) {
    const v = lead[k]
    if (typeof v === 'number' && Number.isFinite(v)) {
      // seconds vs ms heuristic
      return v < 1e12 ? v * 1000 : v
    }
    if (typeof v === 'string' && v.trim()) {
      const t = Date.parse(v)
      if (Number.isFinite(t)) return t
    }
  }
  return null
}

/** Render the IMMEDIATE template. */
export function renderImmediate(firstName: string, dealer: string, vehicle: string | null): string {
  const veh = vehicle ? ` regarding your ${vehicle}` : ''
  return `Hi ${firstName}, this is ${dealer}. Thanks for your interest${veh}. Is there a day or time that works for you to swing by? Happy to help line that up.`
}

/** Render the 24h CHECK-IN template. */
export function renderCheckin(firstName: string, dealer: string, vehicle: string | null): string {
  const veh = vehicle ? ` regarding your ${vehicle}` : ''
  return `Hi ${firstName}, this is ${dealer}. We wanted to check in — are you being taken care of? Is there anything we can help with${veh}?`
}

// The pre-launch SAFE-TEST allowlist now lives in ./prelaunch-lock so EVERY
// outbound choke point (CommGate, the comms MCP handlers, lead-flow) enforces
// the same guard — not just this watcher. Re-exported here for existing
// importers (lead-flow, tests).
export { allowedByPrelaunchLock }

/** Note for the queued record: next 07:00 in the profile timezone. */
function nextSevenAmNote(tz: string): string {
  return `queued for next 07:00 ${tz}`
}

export async function tickVinWatcher(input: {
  profile: string
  now?: number
  config?: StudioConfig
  deps?: WatcherDeps
  profileRoot?: string
}): Promise<WatcherTickResult> {
  const now = input.now ?? Date.now()
  const config = input.config ?? readStudioConfig(input.profile).config
  const deps = input.deps ?? {}
  const call = deps.call ?? callCentralMcpTool
  const dispatch = deps.dispatch ?? dispatchOutbound
  const triggerStore =
    deps.triggerStore ?? brainTriggerStore(input.profile, input.profileRoot)
  const knownPhonesFn = deps.knownPhones ?? hubKnownPhones

  const w = config.vin.watcher

  const empty = (skipped: string): WatcherTickResult => ({
    profile: input.profile,
    skipped,
    polled: 0,
    resolved: 0,
    sent: 0,
    queued: 0,
    blocked: 0,
    failed: 0,
    skippedLeads: 0,
    outcomes: [],
  })

  // 1. Opt-in gate (default OFF).
  if (!w.enabled) return empty('watcher disabled (vin.watcher.enabled not true)')

  // Unconfigured orgId → skip this profile cleanly.
  const org = resolveVinOrgId(input.profile, config)
  if (!org.ok) return empty(`unconfigured: ${org.reason}`)

  const dealer =
    w.dealer_name?.trim() || config.branding.persona_name || input.profile
  const bh = config.comms.business_hours
  const inHours = withinBusinessHours(bh, now)

  // 2. Poll vin_query_leads for a recent window, then resolve names (cap).
  const windowMs = w.created_within_hours * 60 * 60_000
  const startDate = new Date(now - windowMs).toISOString()
  const endDate = new Date(now).toISOString()
  const queryRes = await call('vin_query_leads', {
    orgId: org.orgId,
    startDate,
    endDate,
    limit: w.poll_limit,
  })
  if (!queryRes.ok) return empty(`vin_query_leads failed: ${queryRes.error}`)

  const rawLeads = extractLeads(queryRes.data).slice(0, w.poll_limit)
  const cap = config.vin.name_resolve_cap ?? w.poll_limit
  const leads = await resolveLeadNames(rawLeads, { orgId: org.orgId, cap, call })

  const known = knownPhonesFn(input.profile)

  const result: WatcherTickResult = {
    profile: input.profile,
    polled: rawLeads.length,
    resolved: leads.filter((l) => l.resolved_name).length,
    sent: 0,
    queued: 0,
    blocked: 0,
    failed: 0,
    skippedLeads: 0,
    outcomes: [],
  }

  for (const lead of leads) {
    const outcome = await evaluateLead({
      lead,
      now,
      config,
      dealer,
      inHours,
      bh,
      known,
      triggerStore,
      dispatch,
      profile: input.profile,
    })
    result.outcomes.push(outcome)
    switch (outcome.action) {
      case 'sent':
        result.sent++
        break
      case 'queued':
        result.queued++
        break
      case 'blocked':
        result.blocked++
        break
      case 'failed':
        result.failed++
        break
      default:
        result.skippedLeads++
    }
  }
  return result
}

function extractLeads(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    if (Array.isArray(o.leads)) return o.leads as Array<Record<string, unknown>>
    if (Array.isArray(o.rows)) return o.rows as Array<Record<string, unknown>>
    if (Array.isArray(o.items)) return o.items as Array<Record<string, unknown>>
  }
  return []
}

/**
 * Evaluate ONE lead against both triggers. Order: 24h check-in first (it acts on
 * already-contacted leads), then the immediate first-touch. Returns the single
 * outcome (the watcher fires at most one text per lead per cycle).
 */
async function evaluateLead(ctx: {
  lead: ResolvedLead
  now: number
  config: StudioConfig
  dealer: string
  inHours: boolean
  bh: { tz: string; start: string; end: string }
  known: Set<string>
  triggerStore: TriggerStore
  dispatch: typeof dispatchOutbound
  profile: string
}): Promise<WatcherOutcome> {
  const { lead, now, config, dealer, inHours, bh, known, triggerStore } = ctx
  const w = config.vin.watcher
  const phone = leadPhone(lead)
  const firstName = lead.resolved?.firstName ?? null
  const vehicle = leadVehicle(lead)

  const base: Pick<WatcherOutcome, 'phone' | 'first_name'> = {
    phone,
    first_name: firstName,
  }

  if (!phone) {
    return { kind: null, action: 'skipped', reason: 'no phone on lead', ...base }
  }
  if (!firstName) {
    return { kind: null, action: 'skipped', reason: 'name unresolved', ...base }
  }

  // ── 24h CHECK-IN: the phone already got an immediate text ~1440 min ago. ──
  const immediateAt = triggerStore.lastFire(phone, 'immediate')
  if (immediateAt != null) {
    const sinceMin = (now - immediateAt) / 60_000
    const targetLo = w.checkin_after_min - w.checkin_window_min
    const targetHi = w.checkin_after_min + w.checkin_window_min
    const lastCheckin = triggerStore.lastFire(phone, 'checkin')
    const dedupOk =
      lastCheckin == null || now - lastCheckin >= w.checkin_dedup_hours * 60 * 60_000
    if (sinceMin >= targetLo && sinceMin <= targetHi && dedupOk) {
      // STOP-ON-REPLY (workstream G): if the customer already replied after our
      // first text, the conversation is live — the AI reply / human takeover
      // owns it now. Do NOT layer the scheduled 24h check-in on top.
      if (hasInboundSince(ctx.profile, [phone], immediateAt)) {
        return {
          kind: 'checkin',
          action: 'skipped',
          reason: 'customer replied after first contact — stop-on-reply (conversation is active)',
          ...base,
        }
      }
      if (!inHours) {
        // Check-in is business-hours only — wait, do not queue.
        return {
          kind: 'checkin',
          action: 'skipped',
          reason: 'check-in due but out of business hours — will retry next cycle',
          ...base,
        }
      }
      return send({
        ...ctx,
        kind: 'checkin',
        phone,
        firstName,
        contactId: lead.contactId,
        content: renderCheckin(firstName, dealer, vehicle),
      })
    }
    // Already past first-contact but not in the check-in band: nothing else to do.
    return {
      kind: null,
      action: 'skipped',
      reason:
        lastCheckin != null
          ? 'check-in already sent (dedup 48h)'
          : `not in check-in window (${Math.round(sinceMin)}m since first contact)`,
      ...base,
    }
  }

  // ── IMMEDIATE first-touch ──
  // Already texted via the hub (existing thread) = skip (dedup vs the hub).
  if (known.has(phone)) {
    return {
      kind: 'immediate',
      action: 'skipped',
      reason: 'lead already has a hub thread (already contacted)',
      ...base,
    }
  }
  // Trigger 1 is THIRD-PARTY only (workstream G): the immediate text is for
  // marketplace/aggregator leads, not our own widget/system leads. Gated by
  // sms_triggers.trigger1.third_party_only (DEFAULT on). Fail-closed: a lead we
  // cannot classify as third-party is skipped, so we never cold-text a
  // first-party lead we are already engaging through our own surfaces.
  const thirdPartyOnly = config.sms_triggers?.trigger1?.third_party_only ?? true
  if (thirdPartyOnly) {
    const source = classifyLeadSource(lead)
    if (source !== 'third_party') {
      return {
        kind: 'immediate',
        action: 'skipped',
        reason: `trigger1 third-party-only: lead source is ${source}`,
        ...base,
      }
    }
  }
  // Immediate dedup window.
  const lastImmediate = triggerStore.lastFire(phone, 'immediate')
  if (
    lastImmediate != null &&
    now - lastImmediate < w.immediate_dedup_hours * 60 * 60_000
  ) {
    return {
      kind: 'immediate',
      action: 'skipped',
      reason: `immediate already sent within ${w.immediate_dedup_hours}h (dedup)`,
      ...base,
    }
  }
  // Window gates: synced <N min, created <N h.
  const createdAt = leadEpoch(lead, 'createdUtc', 'created_at', 'createdAt', 'CreatedUtc')
  const syncedAt = leadEpoch(
    lead,
    'syncedUtc',
    'synced_at',
    'syncedAt',
    'lastSyncedUtc',
    'updatedUtc',
    'createdUtc',
    'created_at',
  )
  if (createdAt != null && now - createdAt > w.created_within_hours * 60 * 60_000) {
    return {
      kind: 'immediate',
      action: 'skipped',
      reason: `lead created >${w.created_within_hours}h ago`,
      ...base,
    }
  }
  if (syncedAt != null && now - syncedAt > w.synced_within_min * 60_000) {
    return {
      kind: 'immediate',
      action: 'skipped',
      reason: `lead synced >${w.synced_within_min}m ago`,
      ...base,
    }
  }

  if (!inHours) {
    // Out-of-hours immediate trigger → QUEUE for next 07:00. We record the queue
    // intent in the hub (a queued outbound) and do NOT mark the trigger fired, so
    // the next in-hours cycle sends it.
    recordHub({
      profile: ctx.profile,
      phone,
      content: renderImmediate(firstName, dealer, vehicle),
      kind: 'immediate',
      status: 'queued',
      reason: nextSevenAmNote(bh.tz),
    })
    return {
      kind: 'immediate',
      action: 'queued',
      reason: nextSevenAmNote(bh.tz),
      ...base,
    }
  }

  // When the customer has configured a follow-up FLOW, the flow takes over the
  // first touch (and every escalation step after it). The flow path does NOT
  // record a `triggerStore` 'immediate', so the hardcoded 24h check-in branch
  // above stays dormant for flow-enrolled leads — the flow owns the cadence.
  const flow = getLeadFlow(ctx.profile)
  if (flow?.enabled && flow.steps.length > 0) {
    const handles: Record<string, string> = { sms: phone, voice: phone }
    const email = leadEmail(lead)
    if (email) handles.email = email
    const res = await enrollLead({
      profile: ctx.profile,
      contact_key: phone,
      handles,
      first_name: firstName,
      vehicle,
      dealer,
      now,
      deps: { dispatch: ctx.dispatch },
    })
    if (res.enrolled) {
      const action: WatcherOutcome['action'] =
        res.step_status === 'sent'
          ? 'sent'
          : res.step_status === 'blocked'
            ? 'blocked'
            : res.step_status === 'failed'
              ? 'failed'
              : 'skipped'
      return {
        kind: 'immediate',
        action,
        reason: `enrolled in follow-up flow (step 1 ${res.step_status})`,
        ...base,
      }
    }
    return { kind: 'immediate', action: 'skipped', reason: `flow: ${res.reason}`, ...base }
  }

  return send({
    ...ctx,
    kind: 'immediate',
    phone,
    firstName,
    contactId: lead.contactId,
    content: renderImmediate(firstName, dealer, vehicle),
  })
}

/** Dispatch one text, honour the pre-launch allowlist, persist + ledger. */
async function send(ctx: {
  profile: string
  phone: string
  firstName: string
  kind: TriggerKind
  content: string
  now: number
  triggerStore: TriggerStore
  dispatch: typeof dispatchOutbound
  /** VinSolutions contactId for the SMS consent gate (VIN-sourced lead). */
  contactId?: string | number | null
}): Promise<WatcherOutcome> {
  const { profile, phone, firstName, kind, content, now, triggerStore, dispatch, contactId } = ctx
  const base = { phone, first_name: firstName, kind }

  // SAFE TEST: pre-launch allowlist — never broadcast.
  if (!allowedByPrelaunchLock(phone)) {
    recordHub({ profile, phone, content, kind, status: 'blocked', reason: 'prelaunch-locked' })
    return { ...base, action: 'blocked', reason: 'prelaunch allowlist (PRELAUNCH_SMS_LOCK)' }
  }

  const thread = getOrCreateThread({
    profile,
    domain: WATCHER_DOMAIN,
    channel: 'sms',
    contact_handle: phone,
    subject: `lead follow-up · ${firstName}`,
    assigned_agent_id: WATCHER_AGENT_ID,
  })
  let res: AdapterResult
  try {
    res = await dispatch({ profile, channel: 'sms', thread, content, contactId })
  } catch (err) {
    res = { status: 'failed', via: 'sms', error: err instanceof Error ? err.message : 'dispatch error' }
  }

  appendMessage({
    thread_id: thread.id,
    direction: 'outbound',
    role: 'assistant',
    channel: 'sms',
    content,
    author: WATCHER_AUTHOR,
    metadata: {
      trigger: kind,
      adapter_status: res.status,
      via: res.via,
      gate_rule: res.gate_rule ?? null,
      error: res.error ?? null,
    },
  })

  if (res.status === 'sent') {
    triggerStore.record(phone, kind, now)
    return { ...base, action: 'sent', reason: `sent via ${res.via}`, thread_id: thread.id }
  }
  if (res.status === 'blocked') {
    return {
      ...base,
      action: 'blocked',
      reason: `CommGate: ${res.gate_rule ?? res.error ?? 'blocked'}`,
      thread_id: thread.id,
    }
  }
  // unconfigured / simulated / failed
  return {
    ...base,
    action: res.status === 'failed' ? 'failed' : 'skipped',
    reason: `${res.status}${res.error ? `: ${res.error}` : ''} via ${res.via}`,
    thread_id: thread.id,
  }
}

/** Persist a queue/blocked record into the hub so the inbox + audit reflect it. */
function recordHub(input: {
  profile: string
  phone: string
  content: string
  kind: TriggerKind
  status: string
  reason: string
}): void {
  try {
    const thread = getOrCreateThread({
      profile: input.profile,
      domain: WATCHER_DOMAIN,
      channel: 'sms',
      contact_handle: input.phone,
      subject: `lead follow-up`,
      assigned_agent_id: WATCHER_AGENT_ID,
    })
    appendMessage({
      thread_id: thread.id,
      direction: 'outbound',
      role: 'assistant',
      channel: 'sms',
      content: input.content,
      author: WATCHER_AUTHOR,
      metadata: { trigger: input.kind, adapter_status: input.status, reason: input.reason },
    })
  } catch {
    // best-effort audit record
  }
}
