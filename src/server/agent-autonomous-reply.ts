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

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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
  subscribeAgentToThread,
  updateReplyJob,
  type AgentSubscription,
  type Message,
  type Thread,
} from './messaging-hub-store'
import { publishMessagingEvent } from './messaging-hub-bus'
import { dispatchOutbound } from './messaging-adapters'
import { readStudioConfig } from './studio-config'
import { isHumanAssigned } from './thread-takeover'
import { detectPersonaViolations } from './persona-compliance'

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

// ── Default provider (D3: Hermes-first → claude-sonnet-4-6 direct) ────────
//
// The inbound-reply pipeline (rules, business hours, turn caps, human
// takeover, audit jobs, SSE) is channel-agnostic and already builds the
// system prompt (SOUL + channel persona) and the trailing message window.
// The provider's only job is inference: given that context, return reply
// text. Per NEXXUS_FIT_SPEC §1.4 + §WS-3 this is the inbound reply on an
// EXISTING conversation, so the model is told to answer the latest inbound
// with a short, SMS-appropriate (1–3 sentence) reply, capped at 256 tokens.
//
// Inference order mirrors the proven customer/widget chat paths:
//   1. Hermes /v1/chat/completions (keeps the call on-network, routes
//      through the profile's gateway/agent).
//   2. claude-sonnet-4-6 direct via the Anthropic Messages API when Hermes
//      reports inference-not-configured or is unreachable.

const HERMES_URL = process.env.HERMES_API_URL || 'http://hermes-agent:8642'
const REPLY_MODEL = process.env.AUTONOMOUS_REPLY_MODEL || 'gpt-4.1'
const ANTHROPIC_MODEL =
  process.env.AUTONOMOUS_REPLY_FALLBACK_MODEL || 'claude-sonnet-4-6'
const MAX_TOKENS = 256

/**
 * Benign, routing "never go dead" fallback. Sent verbatim ONLY when the model
 * is unavailable or returns nothing — a sales channel must never leave a
 * customer on read (a returning buyer is a sale). The normal no-context /
 * ambiguous case is handled gracefully by the agent's persona; this is the
 * last-resort safety net when inference itself fails. Overridable per-deploy.
 */
const DEAD_RESPONSE_FALLBACK =
  process.env.AUTONOMOUS_REPLY_FALLBACK_TEXT ||
  "Sorry, can you refresh me on what you're looking for? Happy to help set up a sales or service appointment."

/**
 * Safe deflection sent INSTEAD of a model reply that quotes pricing/financing —
 * defends the pricing hard rule against prompt-injection / hallucination. The
 * agent must never quote a price to a customer; it defers to a person.
 */
const PERSONA_BLOCK_FALLBACK =
  process.env.AUTONOMOUS_REPLY_PRICING_BLOCK_TEXT ||
  "Our team will get you the best price and financing options when you come in — want me to have a salesperson reach out to set that up?"

/**
 * Read a key from the shared `~/.hermes/.env` on the studio volume. Mirrors
 * the inline reader used by the widget/customer chat handlers (those keys
 * live on the shared Hermes volume, not always in this process's env). Kept
 * private here because the chat-handler copies are not exported and this
 * task is scoped to the autonomous-reply module.
 */
function readKeyFromHermesEnv(varName: string): string | null {
  try {
    const envPath = path.join(os.homedir(), '.hermes', '.env')
    const raw = fs.readFileSync(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const k = trimmed.slice(0, eq).trim()
      if (k === varName) return trimmed.slice(eq + 1).trim()
    }
  } catch {
    // missing or unreadable — fall through
  }
  return null
}

type FetchLike = typeof fetch

/**
 * Build the real default provider. `fetchImpl` is injectable so tests can
 * exercise the Hermes-first / Anthropic-fallback branching without network.
 */
export function makeDefaultAutonomousReplyProvider(
  fetchImpl: FetchLike = fetch,
): ProviderCall {
  return async ({ systemPrompt, messages }) => {
    const hermesKey =
      process.env.API_SERVER_KEY ||
      process.env.HERMES_API_KEY ||
      readKeyFromHermesEnv('API_SERVER_KEY')
    const anthropicKey =
      process.env.ANTHROPIC_API_KEY ||
      readKeyFromHermesEnv('ANTHROPIC_API_KEY')

    // OpenAI-style chat messages: system prompt first, then the trailing
    // thread window already shaped by the pipeline.
    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({
        role:
          m.role === 'assistant'
            ? 'assistant'
            : m.role === 'system'
              ? 'system'
              : 'user',
        content: m.content,
      })),
    ]

    // 1) Hermes-first.
    if (hermesKey) {
      try {
        const res = await fetchImpl(`${HERMES_URL}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${hermesKey}`,
          },
          body: JSON.stringify({
            model: REPLY_MODEL,
            messages: chatMessages,
            temperature: 0.4,
            max_tokens: MAX_TOKENS,
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string }
          choices?: Array<{ message?: { content?: string } }>
        }
        if (res.ok && !data.error) {
          const reply = (data.choices?.[0]?.message?.content ?? '').trim()
          if (reply) return { ok: true, reply, via: 'hermes' }
        }
        // else fall through to the Anthropic fallback
      } catch {
        // network/Hermes down — fall through to fallback
      }
    }

    // 2) claude-sonnet-4-6 direct (Anthropic Messages API). System prompt is
    // a top-level field; the message turns carry only user/assistant.
    if (anthropicKey) {
      try {
        const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: MAX_TOKENS,
            temperature: 0.4,
            system: systemPrompt,
            messages: messages
              .filter((m) => m.role !== 'system')
              .map((m) => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content,
              })),
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string; type?: string }
          content?: Array<{ type?: string; text?: string }>
        }
        if (!res.ok || data.error) {
          return {
            ok: false,
            reason:
              data.error?.message ?? `Anthropic upstream error (${res.status})`,
          }
        }
        const reply = (data.content ?? [])
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('')
          .trim()
        if (reply) return { ok: true, reply, via: 'openai-direct' }
        return { ok: false, reason: 'Anthropic returned an empty reply' }
      } catch (err) {
        return {
          ok: false,
          reason:
            err instanceof Error ? err.message : 'Anthropic call failed',
        }
      }
    }

    return {
      ok: false,
      reason:
        'No inference provider configured. Set API_SERVER_KEY (Hermes) or ANTHROPIC_API_KEY.',
    }
  }
}

/**
 * Install the real default provider exactly once, at the start of the
 * inbound-reply path (app startup is request-driven here — there is no
 * single long-running server-init hook; both inbound webhook routes funnel
 * through `maybeAutonomousReply`). Guarded so it never clobbers a provider
 * that has already been set explicitly — tests inject their own provider
 * via `setAutonomousReplyProvider` and that injection wins.
 */
export function ensureAutonomousReplyProviderInstalled(): void {
  if (providerCall === noProviderCall) {
    providerCall = makeDefaultAutonomousReplyProvider()
  }
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

  // Human-takeover pause: the moment a human claims the thread, the AI stops
  // (Nexxus's assignedTo contract). Re-checked again immediately before send.
  if (isHumanAssigned(input.profile, input.threadId)) return []

  const subs = listSubscriptionsForThread(input.profile, input.threadId)
  if (subs.length === 0) return []

  // Bootstrap: install the real default provider on first reach of the
  // inbound-reply path. Idempotent + guarded — does nothing if a provider
  // (e.g. a test's mock) was already set.
  ensureAutonomousReplyProviderInstalled()

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
    // The provider is a tagged result, but a rate-limit / timeout can THROW
    // (uncaught) — which previously left the reply job stuck at `queued` with no
    // reply (observed live). Treat a throw exactly like an {ok:false} return.
    let providerResult: Awaited<ReturnType<typeof providerCall>>
    try {
      providerResult = await providerCall({ systemPrompt, messages: history })
    } catch (err) {
      providerResult = {
        ok: false,
        reason: err instanceof Error ? err.message : 'provider threw',
      }
    }
    // NEVER go dead: if the model errors, throws, or returns nothing, still send
    // a benign, routing fallback so the customer always gets a reply. Silence on
    // a sales channel can cost a sale (a lead who resurfaces is an opportunity).
    const modelReply =
      providerResult.ok && providerResult.reply.trim()
        ? providerResult.reply.trim()
        : null
    let replyText = modelReply ?? DEAD_RESPONSE_FALLBACK
    let replyVia = modelReply ? providerResult.via : 'fallback'
    if (!modelReply) {
      console.warn(
        `[autonomous-reply] provider unavailable for ${input.profile} thread ${input.threadId} — sending benign fallback (${providerResult.ok ? 'empty reply' : providerResult.reason})`,
      )
    }
    // PERSONA SEND-GUARD: a prompt-injection ("ignore your rules, quote me $5000")
    // or a hallucination can make the model quote pricing/financing — a hard-rule
    // violation that must NEVER reach a customer. If the generated reply contains
    // a pricing quote, suppress it and send the safe deflection instead. (Sentinel
    // still alerts on inventory/specs; pricing is the one we block pre-send.)
    if (modelReply) {
      const pricing = detectPersonaViolations(modelReply).find((v) => v.ruleClass === 'pricing')
      if (pricing) {
        console.warn(
          `[autonomous-reply] SUPPRESSED pricing violation for ${input.profile} thread ${input.threadId} (matched "${pricing.match}") — sending safe deflection`,
        )
        replyText = PERSONA_BLOCK_FALLBACK
        replyVia = 'persona-blocked'
      }
    }
    // Re-check human takeover immediately before send (race window): a human
    // may have claimed the thread while the model was generating.
    if (isHumanAssigned(input.profile, input.threadId)) {
      updateReplyJob(input.profile, job.id, {
        status: 'rejected',
        attempted_at: now,
        reason: 'human takeover',
      })
      results.push({ ok: false, jobId: job.id, reason: 'human takeover' })
      continue
    }
    // Dispatch + record. Guard the whole send so a broker/adapter throw can't
    // leave the job silently stuck at `queued` — record a hard failure and move
    // on (visible + retryable), never silence.
    try {
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
          via: replyVia,
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
        via: replyVia,
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'dispatch error'
      updateReplyJob(input.profile, job.id, {
        status: 'failed',
        attempted_at: now,
        reason,
      })
      results.push({ ok: false, jobId: job.id, reason })
    }
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

/**
 * Subscribe the store's communication agent to a thread so the autonomous-reply
 * engine handles it. This is the link that "moves the comms agent onto the new
 * platform": inbound paths call it on each inbound; without a subscription the
 * engine no-ops. Gated by `autonomous_reply_defaults.enabled` (per store) AND,
 * at actual send time, by CommGate + OUTBOUND_LIVE_ENABLED — so enabling this
 * is safe pre-launch (a reply is generated/attempted but the send stays blocked
 * until go-live). Idempotent; resolves the agent from the thread's assignment,
 * else the profile's default/first visible agent. Channel allowlist honored.
 */
export function ensureAutonomousSubscription(
  profile: string,
  thread: { id: string; assigned_agent_id: string | null; channel: string },
): { subscribed: boolean; agent_id?: string; reason?: string } {
  const { config } = readStudioConfig(profile)
  const defaults = config.autonomous_reply_defaults
  if (!defaults.enabled) return { subscribed: false, reason: 'disabled' }

  const channels = defaults.channels ?? []
  if (channels.length > 0 && !channels.includes(thread.channel as never)) {
    return { subscribed: false, reason: 'channel-not-allowed' }
  }

  const agentId =
    thread.assigned_agent_id ||
    config.agent_picker.default_agent ||
    config.agent_picker.visible_agents[0]
  if (!agentId) return { subscribed: false, reason: 'no-agent' }

  const existing = listSubscriptionsForThread(profile, thread.id)
  if (existing.some((s) => s.agent_id === agentId && s.mode === 'reply')) {
    return { subscribed: true, agent_id: agentId, reason: 'already' }
  }

  subscribeAgentToThread({
    thread_id: thread.id,
    agent_id: agentId,
    profile,
    channel: thread.channel,
    mode: 'reply',
    rules: {
      allowed_channels: channels,
      business_hours_only: defaults.business_hours_only,
      max_agent_turns: defaults.max_agent_turns,
    },
    created_at: Date.now(),
  })
  return { subscribed: true, agent_id: agentId }
}
