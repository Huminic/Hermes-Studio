/**
 * Agent-autonomous reply dispatcher — AC.5.8.
 *
 * Drives `thread_agent_subscriptions` with `mode: reply` to send agent
 * replies on inbound messages, subject to:
 *   - per-thread rules (rules JSON on the subscription)
 *   - per-profile defaults in studio.yaml.autonomous_reply_defaults
 *
 * Rules supported (small, expandable set):
 *   - business_hours_only: bool — only fire between 9 and 17 UTC offset 0
 *     (profile-local time isn't modeled yet; first pass is UTC).
 *   - max_agent_turns: int — escalate after N consecutive agent turns
 *     (counted by recent messages in the thread).
 *   - allowed_channels: string[] — empty = all permitted.
 *
 * The dispatcher is invoked on inbound message events. It enqueues a
 * job, computes verdict, and either dispatches (calling the chat
 * round-trip path) or marks the job rejected with a reason. Either way
 * an audit-style row lands so the operator can see why an agent did or
 * did not reply.
 */

import { extractFrontmatter } from '../lib/frontmatter'
import {
  readAgentSoulForProfile,
  readChannelPersona,
} from './customer-agents'
import {
  appendMessage,
  enqueueAgentReplyJob,
  getThread,
  listSubscriptionsForThread,
  updateReplyJob,
  type AgentSubscription,
  type Message,
  type Thread,
} from './messaging-hub-store'
import { publishMessagingEvent } from './messaging-hub-bus'
import { dispatchOutbound } from './messaging-adapters'
import { readStudioConfig } from './studio-config'

export type AutonomousReplyResult =
  | { ok: true; jobId: string; reply: string; via: string }
  | { ok: false; jobId: string; reason: string }

type ReplyContext = {
  thread: Thread
  inbound: Message
  subscription: AgentSubscription
}

type ProviderCall = (input: {
  systemPrompt: string
  messages: Array<{ role: string; content: string }>
}) => Promise<
  | { ok: true; reply: string; via: 'hermes' | 'openai-direct' | 'mock' }
  | { ok: false; reason: string }
>

const noProviderCall: ProviderCall = async () => ({
  ok: false,
  reason: 'No provider call function configured',
})

let providerCall: ProviderCall = noProviderCall

export function setAutonomousReplyProvider(fn: ProviderCall): void {
  providerCall = fn
}

function isWithinBusinessHours(ts: number): boolean {
  const date = new Date(ts)
  const hour = date.getUTCHours()
  return hour >= 13 && hour < 22 // ~9am to 5pm Eastern roughly
}

function countConsecutiveAgentTurns(messages: Array<Message>): number {
  let count = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].direction === 'outbound' && messages[i].role === 'assistant') {
      count++
    } else break
  }
  return count
}

export function evaluateAutonomousReplyRules(input: {
  profile: string
  ctx: ReplyContext
  now: number
}): { ok: true } | { ok: false; reason: string } {
  const { config } = readStudioConfig(input.profile)
  const defaults = config.autonomous_reply_defaults

  // Per-profile global enable. If a thread subscribes an agent in mode:reply
  // explicitly, honor that even when defaults.enabled is false — the
  // thread-level subscription is the explicit consent. Channel allowlists
  // and turn caps still apply.
  if (input.ctx.subscription.mode !== 'reply') {
    return { ok: false, reason: 'subscription mode is monitor' }
  }

  const rules = input.ctx.subscription.rules
  const channels = Array.isArray(rules.allowed_channels)
    ? (rules.allowed_channels as Array<string>)
    : defaults.channels
  if (channels.length > 0 && !channels.includes(input.ctx.inbound.channel)) {
    return {
      ok: false,
      reason: `channel ${input.ctx.inbound.channel} not in allowed_channels`,
    }
  }

  const businessHoursOnly =
    typeof rules.business_hours_only === 'boolean'
      ? rules.business_hours_only
      : defaults.business_hours_only
  if (businessHoursOnly && !isWithinBusinessHours(input.now)) {
    return { ok: false, reason: 'outside business hours' }
  }

  const maxTurns =
    typeof rules.max_agent_turns === 'number'
      ? rules.max_agent_turns
      : defaults.max_agent_turns
  if (maxTurns > 0) {
    const consecutive = countConsecutiveAgentTurns(input.ctx.thread.messages)
    if (consecutive >= maxTurns) {
      return {
        ok: false,
        reason: `max agent turns reached (${consecutive} >= ${maxTurns})`,
      }
    }
  }

  return { ok: true }
}

/**
 * Walk every active subscription for this thread, evaluate, dispatch as
 * appropriate. Each subscription's outcome is recorded as an
 * agent_reply_job for the audit trail.
 */
export async function maybeAutonomousReply(input: {
  profile: string
  threadId: string
  inboundMessageId: string
  now?: number
}): Promise<Array<AutonomousReplyResult>> {
  const thread = getThread(input.profile, input.threadId)
  if (!thread) return []
  const inbound = thread.messages.find(
    (m) => m.id === input.inboundMessageId,
  )
  if (!inbound) return []
  if (inbound.direction !== 'inbound') return []

  const subs = listSubscriptionsForThread(input.profile, input.threadId)
  if (subs.length === 0) return []

  const now = input.now ?? Date.now()
  const results: Array<AutonomousReplyResult> = []
  for (const sub of subs) {
    const job = enqueueAgentReplyJob({
      thread_id: thread.id,
      message_id: inbound.id,
      agent_id: sub.agent_id,
      channel: inbound.channel,
      profile: input.profile,
    })
    const verdict = evaluateAutonomousReplyRules({
      profile: input.profile,
      ctx: { thread, inbound, subscription: sub },
      now,
    })
    if (!verdict.ok) {
      updateReplyJob(input.profile, job.id, {
        status: 'rejected',
        attempted_at: now,
        reason: verdict.reason,
      })
      results.push({ ok: false, jobId: job.id, reason: verdict.reason })
      continue
    }
    publishMessagingEvent(input.profile, {
      type: 'agent_replying',
      thread_id: thread.id,
      agent_id: sub.agent_id,
      channel: inbound.channel,
    })
    // Load SOUL + chat persona for the matching channel (if present).
    const soul = readAgentSoulForProfile(input.profile, sub.agent_id) ?? ''
    const persona = readChannelPersona(
      input.profile,
      sub.agent_id,
      inbound.channel,
    )
    const systemPrompt = [
      `Agent: ${sub.agent_id} on channel ${inbound.channel} for profile ${input.profile}.`,
      `Reply to the latest inbound message. Keep replies short (1-3 sentences).`,
      soul ? `\n# SOUL\n${soul}` : '',
      persona ? `\n# Channel persona (${inbound.channel})\n${persona}` : '',
    ].join('\n')
    const history = thread.messages.slice(-10).map((m) => ({
      role:
        m.role === 'assistant'
          ? 'assistant'
          : m.role === 'system'
            ? 'system'
            : 'user',
      content: m.content,
    }))
    const providerResult = await providerCall({
      systemPrompt,
      messages: history,
    })
    if (!providerResult.ok) {
      updateReplyJob(input.profile, job.id, {
        status: 'failed',
        attempted_at: now,
        reason: providerResult.reason,
      })
      results.push({ ok: false, jobId: job.id, reason: providerResult.reason })
      continue
    }
    const replyText = providerResult.reply
    // Dispatch outbound through the channel adapter.
    const adapterResult = await dispatchOutbound({
      profile: input.profile,
      channel: inbound.channel,
      thread,
      content: replyText,
    })
    appendMessage({
      thread_id: thread.id,
      direction: 'outbound',
      role: 'assistant',
      channel: inbound.channel,
      content: replyText,
      author: sub.agent_id,
      metadata: {
        agent_id: sub.agent_id,
        via: providerResult.via,
        adapter_status: adapterResult.status,
        adapter_error: adapterResult.error ?? null,
        autonomous: true,
      },
    })
    updateReplyJob(input.profile, job.id, {
      status: 'sent',
      attempted_at: now,
      sent_at: now,
      reason: null,
    })
    publishMessagingEvent(input.profile, {
      type: 'agent_reply_sent',
      thread_id: thread.id,
      agent_id: sub.agent_id,
      channel: inbound.channel,
    })
    results.push({
      ok: true,
      jobId: job.id,
      reply: replyText,
      via: providerResult.via,
    })
  }
  return results
}

/**
 * Frontmatter on a widget can declare per-widget agent subscription
 * defaults (so that any thread created via the widget gets the same
 * autonomous-reply behavior).
 *
 *   ---
 *   slug: ...
 *   agent: caroline
 *   autonomous_reply:
 *     mode: reply
 *     allowed_channels: [sms, email]
 *     business_hours_only: true
 *   ---
 */
export function parseAutonomousReplyFromFrontmatter(
  raw: string,
): Record<string, unknown> | null {
  const fm = extractFrontmatter(raw)
  if (!fm.frontmatter) return null
  const ar = fm.frontmatter.autonomous_reply
  if (!ar || typeof ar !== 'object') return null
  return ar as Record<string, unknown>
}
