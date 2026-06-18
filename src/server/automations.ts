/**
 * Marketing automations engine (Phase 1 — Marketing).
 *
 * This is the execution layer behind the Marketing → Automations builder. It is
 * deliberately NOT a new send mechanism: it maps each active automation row onto
 * the SAME gated outbound path every other producer uses (`dispatchOutbound` →
 * CommGate: kill switch, business-hours, blacklist/DNC, rate caps), persists the
 * outbound through the messaging hub (so it lands in Teambox), and records the
 * fire to the Brain/InfoStore. It reuses vin-watcher's render helpers + the
 * pre-launch allowlist + the stop-on-reply signal (`hasInboundSince`).
 *
 * Two trigger types in v1, matching the two seeded Serra Honda automations:
 *   - new_lead       → immediate send when a lead is created outside the
 *                      workspace (the VIN/CRM feed). Mirrors vin-watcher's
 *                      first-touch, but channel + agent come from the automation.
 *   - lead_followup  → enrolls the lead and sends after `wait_hours`, unless the
 *                      lead has replied in the meantime (stop-on-reply).
 *
 * Status is authoritative: only `active` automations fire. `draft` and `paused`
 * never send and never enroll — verified by tests and by the live check.
 */

import { readStudioConfig } from './studio-config'
import { dispatchOutbound, type AdapterResult } from './messaging-adapters'
import { allowedByPrelaunchLock } from './prelaunch-lock'
import { renderImmediate, renderCheckin } from './lead-templates'
import {
  getOrCreateThread,
  appendMessage,
  hasInboundSince,
  listAutomations,
  getAutomation,
  createAutomation,
  updateAutomation,
  hasAutomationRun,
  createAutomationRun,
  listDueAutomationRuns,
  updateAutomationRunStatus,
  type MarketingAutomation,
} from './messaging-hub-store'
import { insertEvent } from './brain-record-families'
import type { StudioConfig } from '../lib/studio-config'

export const AUTOMATION_AUTHOR = 'automation'
/** DSG-gate actor identity for Brain/InfoStore writes (must be a known form). */
const AUTOMATION_BRAIN_ACTOR = 'system:automation'

/** Channels an automation may send on (each rides the gated adapter). */
export const AUTOMATION_CHANNELS = ['sms', 'email', 'voice'] as const
export type AutomationChannel = (typeof AUTOMATION_CHANNELS)[number]

/** The two store communications agents (per spec: Caroline sales, Nancy service). */
export const SALES_AGENT_ID = 'caroline'
export const SERVICE_AGENT_ID = 'nancy-gaston'

type Dispatch = typeof dispatchOutbound

/** A lead handed to the engine — channel-agnostic handle bag + light context. */
export type AutomationLead = {
  /** Primary dedup handle (phone for sms/voice, email for email). */
  contact_handle: string
  /** Resolved per-channel handles: {sms?, voice?, email?}. */
  handles: Record<string, string>
  first_name?: string | null
  vehicle?: string | null
  /** Where the lead came from — used only for audit/Brain context. */
  source?: string | null
}

/** Map an agent id to the hub domain its threads live under. */
export function agentDomain(agentId: string): 'sales' | 'service' {
  return agentId === SERVICE_AGENT_ID ? 'service' : 'sales'
}

/** Resolve the dealership name a send speaks as (mirrors campaign-worker). */
function resolveDealerName(profile: string, config: StudioConfig): string {
  return (
    config.vin?.watcher?.dealer_name ?? config.branding?.persona_name ?? profile
  )
}

/** Pick the outbound handle for a channel from the lead's handle bag. */
function handleForChannel(
  handles: Record<string, string>,
  channel: string,
): string | null {
  if (channel === 'email') return handles.email ?? null
  if (channel === 'voice' || channel === 'phone') {
    return handles.voice ?? handles.sms ?? null
  }
  return handles.sms ?? null
}

export type AutomationOutcome = {
  automation_id: string
  name: string
  trigger: MarketingAutomation['trigger']
  action: 'sent' | 'enrolled' | 'replied' | 'blocked' | 'failed' | 'skipped'
  reason: string
  channel?: string
  thread_id?: string | null
}

/** Best-effort Brain/InfoStore record of an automation fire. Never throws. */
function recordBrain(input: {
  profile: string
  automation: MarketingAutomation
  action: string
  channel: string
  handle: string
  thread_id: string | null
  status: string
}): void {
  try {
    insertEvent({
      profile: input.profile,
      actor: AUTOMATION_BRAIN_ACTOR,
      type: 'marketing.automation.fired',
      source: 'automation',
      subject_type: 'automation',
      subject_id: input.automation.id,
      payload: {
        name: input.automation.name,
        trigger: input.automation.trigger,
        action: input.action,
        channel: input.channel,
        status: input.status,
        thread_id: input.thread_id,
      },
      source_refs: input.thread_id
        ? [{ kind: 'thread', value: input.thread_id }]
        : [{ kind: 'agent', value: input.automation.agent_id }],
    })
  } catch {
    // Brain write is audit-only — a gate/policy block must never abort the send.
  }
}

/** Send one automation message through the gated adapter + persist to the hub. */
async function gatedSend(input: {
  profile: string
  automation: MarketingAutomation
  handle: string
  firstName: string | null
  dealer: string
  vehicle: string | null
  isFirst: boolean
  dispatch: Dispatch
}): Promise<{ status: AdapterResult['status']; via: string; thread_id: string }> {
  const { profile, automation, handle, firstName, dealer, vehicle, isFirst, dispatch } =
    input
  const name = firstName ?? 'there'
  const content = isFirst
    ? renderImmediate(name, dealer, vehicle)
    : renderCheckin(name, dealer, vehicle)

  const thread = getOrCreateThread({
    profile,
    domain: agentDomain(automation.agent_id),
    channel: automation.channel,
    contact_handle: handle,
    subject: `automation · ${automation.name}`,
    assigned_agent_id: automation.agent_id,
  })

  // Pre-launch allowlist — never broadcast (mirrors vin-watcher / lead-flow).
  if (!allowedByPrelaunchLock(handle)) {
    appendMessage({
      thread_id: thread.id,
      direction: 'outbound',
      role: 'assistant',
      channel: automation.channel,
      content,
      author: AUTOMATION_AUTHOR,
      metadata: {
        automation_id: automation.id,
        adapter_status: 'blocked',
        reason: 'prelaunch-locked',
      },
    })
    return { status: 'blocked', via: `${automation.channel}-prelaunch`, thread_id: thread.id }
  }

  let res: AdapterResult
  try {
    res = await dispatch({
      profile,
      channel: automation.channel,
      thread,
      content,
    })
  } catch (err) {
    res = {
      status: 'failed',
      via: automation.channel,
      error: err instanceof Error ? err.message : 'dispatch error',
    }
  }
  appendMessage({
    thread_id: thread.id,
    direction: 'outbound',
    role: 'assistant',
    channel: automation.channel,
    content,
    author: AUTOMATION_AUTHOR,
    metadata: {
      automation_id: automation.id,
      adapter_status: res.status,
      via: res.via,
      gate_rule: res.gate_rule ?? null,
      error: res.error ?? null,
    },
  })
  return { status: res.status, via: res.via, thread_id: thread.id }
}

/**
 * Process a freshly-detected lead against every ACTIVE automation. Immediate
 * (new_lead) automations send now; follow-up (lead_followup) automations enroll
 * the lead for a send after `wait_hours`. Draft/paused automations are ignored.
 */
export async function processNewLead(input: {
  profile: string
  lead: AutomationLead
  now?: number
  config?: StudioConfig
  deps?: { dispatch?: Dispatch }
}): Promise<Array<AutomationOutcome>> {
  const now = input.now ?? Date.now()
  const dispatch = input.deps?.dispatch ?? dispatchOutbound
  const config = input.config ?? readStudioConfig(input.profile).config
  const dealer = resolveDealerName(input.profile, config)
  const outcomes: Array<AutomationOutcome> = []

  const active = listAutomations(input.profile).filter((a) => a.status === 'active')

  for (const automation of active) {
    const base = {
      automation_id: automation.id,
      name: automation.name,
      trigger: automation.trigger,
    }
    const handle = handleForChannel(input.lead.handles, automation.channel)
    if (!handle) {
      outcomes.push({
        ...base,
        action: 'skipped',
        reason: `lead has no ${automation.channel} handle`,
      })
      continue
    }
    // Dedup: one enrollment/fire per (automation, contact).
    if (hasAutomationRun(input.profile, automation.id, input.lead.contact_handle)) {
      outcomes.push({ ...base, action: 'skipped', reason: 'already processed for this lead' })
      continue
    }

    if (automation.trigger === 'lead_followup') {
      const dueAt = now + Math.max(0, automation.wait_hours) * 60 * 60_000
      createAutomationRun({
        profile: input.profile,
        automation_id: automation.id,
        contact_handle: input.lead.contact_handle,
        handles: input.lead.handles,
        first_name: input.lead.first_name ?? null,
        vehicle: input.lead.vehicle ?? null,
        dealer,
        due_at: dueAt,
      })
      outcomes.push({
        ...base,
        action: 'enrolled',
        reason: `follow-up scheduled in ${automation.wait_hours}h`,
        channel: automation.channel,
      })
      continue
    }

    // new_lead → immediate gated send. Record the run (so re-detection dedups).
    const run = createAutomationRun({
      profile: input.profile,
      automation_id: automation.id,
      contact_handle: input.lead.contact_handle,
      handles: input.lead.handles,
      first_name: input.lead.first_name ?? null,
      vehicle: input.lead.vehicle ?? null,
      dealer,
      due_at: now,
    })
    const sent = await gatedSend({
      profile: input.profile,
      automation,
      handle,
      firstName: input.lead.first_name ?? null,
      dealer,
      vehicle: input.lead.vehicle ?? null,
      isFirst: true,
      dispatch,
    })
    const action: AutomationOutcome['action'] =
      sent.status === 'sent'
        ? 'sent'
        : sent.status === 'blocked'
          ? 'blocked'
          : sent.status === 'failed'
            ? 'failed'
            : 'skipped'
    updateAutomationRunStatus(
      input.profile,
      run.id,
      action === 'sent' ? 'sent' : action === 'failed' ? 'failed' : 'skipped',
    )
    if (action === 'sent') {
      updateAutomation(input.profile, automation.id, { last_triggered_at: now })
    }
    recordBrain({
      profile: input.profile,
      automation,
      action,
      channel: automation.channel,
      handle,
      thread_id: sent.thread_id,
      status: sent.status,
    })
    outcomes.push({
      ...base,
      action,
      reason: `immediate send via ${sent.via} (${sent.status})`,
      channel: automation.channel,
      thread_id: sent.thread_id,
    })
  }
  return outcomes
}

export type AutomationTickResult = {
  profile: string
  due: number
  sent: number
  stopped: number
  outcomes: Array<AutomationOutcome>
}

/**
 * Advance every due follow-up run one step. Stop-on-reply first; otherwise send
 * via the gated path. An automation that was paused/deleted after enrollment
 * does NOT fire — its pending runs are marked skipped.
 */
export async function tickAutomations(input: {
  profile: string
  now?: number
  config?: StudioConfig
  deps?: { dispatch?: Dispatch }
}): Promise<AutomationTickResult> {
  const now = input.now ?? Date.now()
  const dispatch = input.deps?.dispatch ?? dispatchOutbound
  const config = input.config ?? readStudioConfig(input.profile).config
  const dealer = resolveDealerName(input.profile, config)
  const result: AutomationTickResult = {
    profile: input.profile,
    due: 0,
    sent: 0,
    stopped: 0,
    outcomes: [],
  }

  for (const run of listDueAutomationRuns(input.profile, now)) {
    result.due++
    const automation = getAutomation(input.profile, run.automation_id)
    const base = {
      automation_id: run.automation_id,
      name: automation?.name ?? '(deleted)',
      trigger: automation?.trigger ?? ('lead_followup' as const),
    }
    // Only active automations fire — paused/deleted pending runs are retired.
    if (!automation || automation.status !== 'active') {
      updateAutomationRunStatus(input.profile, run.id, 'skipped')
      result.outcomes.push({
        ...base,
        action: 'skipped',
        reason: automation ? `automation is ${automation.status}` : 'automation deleted',
      })
      continue
    }
    // Stop-on-reply: any inbound since enrollment means the conversation is live.
    if (hasInboundSince(input.profile, Object.values(run.handles), run.enrolled_at)) {
      updateAutomationRunStatus(input.profile, run.id, 'replied')
      result.stopped++
      result.outcomes.push({
        ...base,
        action: 'replied',
        reason: 'lead replied — follow-up stopped',
      })
      continue
    }
    const handle = handleForChannel(run.handles, automation.channel)
    if (!handle) {
      updateAutomationRunStatus(input.profile, run.id, 'skipped')
      result.outcomes.push({
        ...base,
        action: 'skipped',
        reason: `no ${automation.channel} handle`,
      })
      continue
    }
    const sent = await gatedSend({
      profile: input.profile,
      automation,
      handle,
      firstName: run.first_name,
      dealer: run.dealer ?? dealer,
      vehicle: run.vehicle,
      isFirst: false,
      dispatch,
    })
    const action: AutomationOutcome['action'] =
      sent.status === 'sent'
        ? 'sent'
        : sent.status === 'blocked'
          ? 'blocked'
          : sent.status === 'failed'
            ? 'failed'
            : 'skipped'
    updateAutomationRunStatus(
      input.profile,
      run.id,
      action === 'sent' ? 'sent' : action === 'failed' ? 'failed' : 'skipped',
    )
    if (action === 'sent') {
      result.sent++
      updateAutomation(input.profile, automation.id, { last_triggered_at: now })
    }
    recordBrain({
      profile: input.profile,
      automation,
      action,
      channel: automation.channel,
      handle,
      thread_id: sent.thread_id,
      status: sent.status,
    })
    result.outcomes.push({
      ...base,
      action,
      reason: `follow-up via ${sent.via} (${sent.status})`,
      channel: automation.channel,
      thread_id: sent.thread_id,
    })
  }
  return result
}

/**
 * The two Serra Honda automations the spec requires, seeded as DRAFT (they do
 * not fire until activated). Idempotent: an automation already present by name
 * is left untouched, so re-running never duplicates or re-arms.
 */
export const DEFAULT_AUTOMATIONS: Array<{
  name: string
  trigger: MarketingAutomation['trigger']
  channel: string
  agent_id: string
  wait_hours: number
}> = [
  {
    name: 'Instant SMS for new leads',
    trigger: 'new_lead',
    channel: 'sms',
    agent_id: SALES_AGENT_ID,
    wait_hours: 0,
  },
  {
    name: '24-hour follow-up for all leads',
    trigger: 'lead_followup',
    channel: 'sms',
    agent_id: SALES_AGENT_ID,
    wait_hours: 24,
  },
]

export function seedDefaultAutomations(profile: string): Array<MarketingAutomation> {
  const existing = listAutomations(profile)
  const created: Array<MarketingAutomation> = []
  for (const def of DEFAULT_AUTOMATIONS) {
    if (existing.some((a) => a.name === def.name)) continue
    created.push(
      createAutomation({
        profile,
        name: def.name,
        trigger: def.trigger,
        channel: def.channel,
        agent_id: def.agent_id,
        wait_hours: def.wait_hours,
        status: 'draft',
      }),
    )
  }
  return created
}
