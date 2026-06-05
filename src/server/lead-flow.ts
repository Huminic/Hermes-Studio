/**
 * Lead follow-up flow engine — the customer-configurable, multi-channel,
 * stop-on-reply escalation that extends the hardcoded VIN-watcher follow-up
 * (WS-2). See docs/launch/NEXXUS_FOLLOWUP_FLOW_SPEC.md.
 *
 * Two entry points, both safety-gated by the SAME machinery the watcher uses
 * (CommGate inside dispatchOutbound + the pre-launch allowlist):
 *
 *   enrollLead()  — called by vin-watcher when a NEW lead arrives in business
 *     hours and a flow is enabled. Sends step 1 and records the enrollment.
 *
 *   tickFlows()   — called every cron cycle by comms-scheduler.runDueWork. For
 *     each active enrollment whose next step is due: stop if the lead replied;
 *     otherwise send the next step (skipping channels with no handle) during
 *     business hours, and schedule the one after.
 *
 * Deterministic by construction: channel + wait + stop-on-reply. No NLP, no
 * content rules. Step 1 speaks the IMMEDIATE template; later steps speak the
 * CHECK-IN template (reused from vin-watcher so the voice is consistent).
 */

import { readStudioConfig } from './studio-config'
import { withinBusinessHours } from './comms-gate'
import { dispatchOutbound, type AdapterResult } from './messaging-adapters'
import {
  getOrCreateThread,
  appendMessage,
  getLeadFlow,
  createFlowEnrollment,
  getActiveFlowEnrollment,
  listActiveFlowEnrollments,
  updateFlowEnrollment,
  hasInboundSince,
  type LeadFlowStep,
  type FlowEnrollment,
} from './messaging-hub-store'
import {
  renderImmediate,
  renderCheckin,
  allowedByPrelaunchLock,
  WATCHER_AGENT_ID,
} from './vin-watcher'
import type { StudioConfig } from '../lib/studio-config'

/** Hub domain + author the flow's outbound sends land under. */
export const FLOW_DOMAIN = 'sales'
export const FLOW_AUTHOR = 'lead-flow'

/** Channels a flow step may use in v1 (video deferred — no inbound handle). */
export const FLOW_CHANNELS = ['sms', 'email', 'voice'] as const
export type FlowChannel = (typeof FLOW_CHANNELS)[number]
export const MAX_FLOW_STEPS = 3

export type NormalizeResult =
  | { ok: true; steps: Array<LeadFlowStep> }
  | { ok: false; error: string }

/**
 * Validate + clean a step list from untrusted input (the config API). Enforces
 * the v1 shape: ≤3 steps, each a known channel with an integer wait ≥ 0.
 */
export function normalizeFlowSteps(input: unknown): NormalizeResult {
  if (!Array.isArray(input)) return { ok: false, error: 'steps must be an array' }
  if (input.length === 0) return { ok: true, steps: [] }
  if (input.length > MAX_FLOW_STEPS) {
    return { ok: false, error: `at most ${MAX_FLOW_STEPS} steps` }
  }
  const steps: Array<LeadFlowStep> = []
  for (let i = 0; i < input.length; i++) {
    const raw = input[i] as Record<string, unknown>
    const channel = raw?.channel
    if (typeof channel !== 'string' || !FLOW_CHANNELS.includes(channel as FlowChannel)) {
      return { ok: false, error: `step ${i + 1}: channel must be one of ${FLOW_CHANNELS.join(', ')}` }
    }
    const waitRaw = i === 0 ? 0 : raw?.wait_hours
    const wait = typeof waitRaw === 'number' ? waitRaw : Number(waitRaw)
    if (!Number.isFinite(wait) || wait < 0) {
      return { ok: false, error: `step ${i + 1}: wait_hours must be a number ≥ 0` }
    }
    steps.push({ channel, wait_hours: i === 0 ? 0 : Math.round(wait) })
  }
  return { ok: true, steps }
}

/** Pick the outbound handle for a step's channel from the enrollment handles. */
export function handleForChannel(
  handles: Record<string, string>,
  channel: string,
): string | null {
  if (channel === 'email') return handles.email ?? null
  if (channel === 'voice' || channel === 'phone') {
    return handles.voice ?? handles.sms ?? null
  }
  return handles.sms ?? null
}

function hours(n: number): number {
  return n * 60 * 60_000
}

type Dispatch = typeof dispatchOutbound

/** Send one step through the gated adapter, persisting the hub message. */
async function sendStep(input: {
  profile: string
  channel: string
  handle: string
  firstName: string | null
  dealer: string
  vehicle: string | null
  isFirst: boolean
  dispatch: Dispatch
}): Promise<{ status: AdapterResult['status']; via: string; thread_id: string }> {
  const name = input.firstName ?? 'there'
  const content = input.isFirst
    ? renderImmediate(name, input.dealer, input.vehicle)
    : renderCheckin(name, input.dealer, input.vehicle)

  const thread = getOrCreateThread({
    profile: input.profile,
    domain: FLOW_DOMAIN,
    channel: input.channel,
    contact_handle: input.handle,
    subject: `lead follow-up · ${name}`,
    assigned_agent_id: WATCHER_AGENT_ID,
  })

  // Pre-launch allowlist — never broadcast (mirrors vin-watcher.send).
  if (!allowedByPrelaunchLock(input.handle)) {
    appendMessage({
      thread_id: thread.id,
      direction: 'outbound',
      role: 'assistant',
      channel: input.channel,
      content,
      author: FLOW_AUTHOR,
      metadata: { flow: true, adapter_status: 'blocked', reason: 'prelaunch-locked' },
    })
    return { status: 'blocked', via: `${input.channel}-prelaunch`, thread_id: thread.id }
  }

  let res: AdapterResult
  try {
    res = await input.dispatch({ profile: input.profile, channel: input.channel, thread, content })
  } catch (err) {
    res = { status: 'failed', via: input.channel, error: err instanceof Error ? err.message : 'dispatch error' }
  }
  appendMessage({
    thread_id: thread.id,
    direction: 'outbound',
    role: 'assistant',
    channel: input.channel,
    content,
    author: FLOW_AUTHOR,
    metadata: {
      flow: true,
      adapter_status: res.status,
      via: res.via,
      gate_rule: res.gate_rule ?? null,
      error: res.error ?? null,
    },
  })
  return { status: res.status, via: res.via, thread_id: thread.id }
}

export type EnrollResult =
  | { enrolled: true; enrollment_id: string; step_status: AdapterResult['status'] }
  | { enrolled: false; reason: string }

/**
 * Enroll a new lead onto the flow and send step 1. Called by vin-watcher at its
 * in-hours IMMEDIATE send point when a flow is enabled. No-op (with reason) when
 * no flow is configured or the lead already has an active enrollment.
 */
export async function enrollLead(input: {
  profile: string
  /** Dedup key — the lead's phone. */
  contact_key: string
  /** Resolved handles: {sms?, voice?, email?}. */
  handles: Record<string, string>
  first_name?: string | null
  vehicle?: string | null
  dealer: string
  now?: number
  deps?: { dispatch?: Dispatch }
}): Promise<EnrollResult> {
  const now = input.now ?? Date.now()
  const dispatch = input.deps?.dispatch ?? dispatchOutbound
  const flow = getLeadFlow(input.profile)
  if (!flow || !flow.enabled || flow.steps.length === 0) {
    return { enrolled: false, reason: 'no active flow' }
  }
  if (getActiveFlowEnrollment(input.profile, input.contact_key)) {
    return { enrolled: false, reason: 'already enrolled' }
  }

  const step0 = flow.steps[0]
  const handle0 = handleForChannel(input.handles, step0.channel)
  if (!handle0) {
    return { enrolled: false, reason: `no ${step0.channel} handle for lead` }
  }

  const sent = await sendStep({
    profile: input.profile,
    channel: step0.channel,
    handle: handle0,
    firstName: input.first_name ?? null,
    dealer: input.dealer,
    vehicle: input.vehicle ?? null,
    isFirst: true,
    dispatch,
  })

  const next = flow.steps[1]
  const enrollment = createFlowEnrollment({
    profile: input.profile,
    contact_key: input.contact_key,
    handles: input.handles,
    first_name: input.first_name ?? null,
    vehicle: input.vehicle ?? null,
    dealer: input.dealer,
    step_index: 0,
    last_step_sent_at: now,
    next_due_at: next ? now + hours(next.wait_hours) : null,
    status: next ? 'active' : 'completed',
  })
  return { enrolled: true, enrollment_id: enrollment.id, step_status: sent.status }
}

export type FlowTickOutcome = {
  enrollment_id: string
  contact_key: string
  action: 'sent' | 'replied' | 'completed' | 'waiting' | 'blocked' | 'failed'
  step_index: number
  channel?: string
  reason: string
}

export type FlowTickResult = {
  profile: string
  due: number
  sent: number
  stopped: number
  outcomes: Array<FlowTickOutcome>
}

/**
 * Advance every due enrollment one move. Idempotent across cycles: an
 * enrollment whose next step isn't due yet is left untouched; one that's out of
 * business hours waits (no queue table); one whose lead has replied is stopped.
 */
export async function tickFlows(input: {
  profile: string
  now?: number
  config?: StudioConfig
  deps?: { dispatch?: Dispatch }
}): Promise<FlowTickResult> {
  const now = input.now ?? Date.now()
  const dispatch = input.deps?.dispatch ?? dispatchOutbound
  const result: FlowTickResult = { profile: input.profile, due: 0, sent: 0, stopped: 0, outcomes: [] }

  const flow = getLeadFlow(input.profile)
  if (!flow || !flow.enabled || flow.steps.length === 0) return result

  const config = input.config ?? readStudioConfig(input.profile).config
  const bh = config.comms.business_hours
  const inHours = withinBusinessHours(bh, now)

  for (const e of listActiveFlowEnrollments(input.profile)) {
    if (e.next_due_at == null || e.next_due_at > now) continue
    result.due++

    // 1. Stop-on-reply — any inbound since the last step went out.
    const since = e.last_step_sent_at ?? e.created_at
    if (hasInboundSince(input.profile, Object.values(e.handles), since)) {
      updateFlowEnrollment(input.profile, e.id, { status: 'replied', next_due_at: null })
      result.stopped++
      result.outcomes.push({
        enrollment_id: e.id,
        contact_key: e.contact_key,
        action: 'replied',
        step_index: e.step_index,
        reason: 'lead replied — flow stopped',
      })
      continue
    }

    // 2. Business hours — hold (retry next cycle), do not queue.
    if (!inHours) {
      result.outcomes.push({
        enrollment_id: e.id,
        contact_key: e.contact_key,
        action: 'waiting',
        step_index: e.step_index,
        reason: 'out of business hours — will retry',
      })
      continue
    }

    // 3. Find the next step that has a usable handle (skip-and-advance).
    let nextIndex = e.step_index + 1
    while (nextIndex < flow.steps.length && !handleForChannel(e.handles, flow.steps[nextIndex].channel)) {
      nextIndex++
    }
    if (nextIndex >= flow.steps.length) {
      updateFlowEnrollment(input.profile, e.id, {
        status: 'completed',
        step_index: flow.steps.length - 1,
        next_due_at: null,
      })
      result.outcomes.push({
        enrollment_id: e.id,
        contact_key: e.contact_key,
        action: 'completed',
        step_index: e.step_index,
        reason: 'no more reachable steps',
      })
      continue
    }

    const step = flow.steps[nextIndex]
    const handle = handleForChannel(e.handles, step.channel) as string
    const sent = await sendStep({
      profile: input.profile,
      channel: step.channel,
      handle,
      firstName: e.first_name,
      dealer: e.dealer ?? config.branding.persona_name,
      vehicle: e.vehicle,
      isFirst: false,
      dispatch,
    })

    const following = flow.steps[nextIndex + 1]
    updateFlowEnrollment(input.profile, e.id, {
      step_index: nextIndex,
      last_step_sent_at: now,
      next_due_at: following ? now + hours(following.wait_hours) : null,
      status: following ? 'active' : 'completed',
    })

    const action: FlowTickOutcome['action'] =
      sent.status === 'blocked' ? 'blocked' : sent.status === 'failed' ? 'failed' : 'sent'
    if (action === 'sent') result.sent++
    result.outcomes.push({
      enrollment_id: e.id,
      contact_key: e.contact_key,
      action,
      step_index: nextIndex,
      channel: step.channel,
      reason: `step ${nextIndex + 1} via ${sent.via} (${sent.status})`,
    })
  }

  return result
}
