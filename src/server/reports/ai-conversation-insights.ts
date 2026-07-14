/**
 * "AI Conversation Insights" report.
 *
 * Assembles recent agent↔prospect transcripts from the messaging hub and runs a
 * single grounded LLM pass to surface themes: common questions, objections,
 * sentiment, missed handoffs, and knowledge/FAQ gaps (things Caroline couldn't
 * answer → InfoStore candidates). Verify-first tone; no fabricated metrics.
 *
 * The transcript assembly is pure/testable; the LLM call is INJECTABLE
 * (deps.complete) so tests never hit the network. No provider configured →
 * honest "unavailable" (never a fake analysis). Generic per-profile.
 */

import { listThreads } from '../messaging-hub-store'
import { completeChat, type ChatResult } from '../dashboard-ask'

const DAY_MS = 24 * 60 * 60_000
const DEFAULT_WINDOW_DAYS = 30
const DEFAULT_MAX_THREADS = 60
const MAX_MSGS_PER_THREAD = 12
const MAX_CHARS_PER_MSG = 240

export type ConversationContext = {
  transcript: string
  threadCount: number
  messageCount: number
}

/** Build a compact, model-readable transcript block. Pure aside from store reads. */
export function gatherConversationContext(
  profile: string,
  opts: { now?: number; windowDays?: number; maxThreads?: number } = {},
): ConversationContext {
  const now = opts.now ?? Date.now()
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS
  const sinceMs = now - windowDays * DAY_MS
  const maxThreads = opts.maxThreads ?? DEFAULT_MAX_THREADS

  const threads = listThreads({ profile, limit: 500 }).filter(
    (t) => (t.messages?.length ?? 0) > 0 && (t.updated_at ?? 0) >= sinceMs,
  )
  let messageCount = 0
  const blocks: Array<string> = []
  for (const t of threads.slice(0, maxThreads)) {
    const msgs = t.messages.slice(-MAX_MSGS_PER_THREAD)
    if (msgs.length === 0) continue
    const lines = msgs.map((m) => {
      const who = m.direction === 'inbound' ? 'Customer' : 'Agent'
      const text = (m.content ?? '').replace(/\s+/g, ' ').slice(0, MAX_CHARS_PER_MSG)
      return `${who}: ${text}`
    })
    messageCount += msgs.length
    blocks.push(`--- Conversation (${t.channel}) ---\n${lines.join('\n')}`)
  }
  return { transcript: blocks.join('\n\n'), threadCount: blocks.length, messageCount }
}

export type AiConversationInsightsReport =
  | {
      profile: string
      generated_at: number
      available: true
      window_days: number
      thread_count: number
      message_count: number
      insights: string
      via: string
    }
  | { profile: string; generated_at: number; available: false; reason: string }

export type LlmComplete = (system: string, user: string) => Promise<ChatResult>

const SYSTEM = [
  'You are a dealership conversation analyst. You are given real, recent transcripts between our AI/BDC agents and prospects.',
  'Produce a concise insights brief with these sections (use short headers):',
  '1) Common questions prospects ask',
  '2) Frequent objections / hesitations',
  '3) Overall sentiment (with rough proportion)',
  '4) Missed handoffs or moments we could have advanced the lead',
  '5) Knowledge gaps — questions the agent could not answer well (candidates to add to the knowledge base)',
  'Rules: base every point ONLY on the transcripts provided. Frame as observations to verify, not conclusions. Do not invent numbers or names. No vendor/CRM product names. Keep it under ~400 words.',
].join('\n')

/** Build the report. LLM call is injectable via deps.complete for tests. */
export async function buildAiConversationInsights(
  profile: string,
  opts: { now?: number; windowDays?: number; maxThreads?: number } = {},
  deps: { complete?: LlmComplete } = {},
): Promise<AiConversationInsightsReport> {
  const now = opts.now ?? Date.now()
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS
  const ctx = gatherConversationContext(profile, opts)
  if (ctx.threadCount === 0) {
    return {
      profile,
      generated_at: now,
      available: false,
      reason: `No conversations in the last ${windowDays} days to analyze.`,
    }
  }
  const complete = deps.complete ?? completeChat
  const result = await complete(
    SYSTEM,
    `Transcripts (${ctx.threadCount} conversations, ${ctx.messageCount} messages):\n\n${ctx.transcript}`,
  )
  if (!result.ok) {
    return {
      profile,
      generated_at: now,
      available: false,
      reason: result.unconfigured
        ? 'No inference provider configured for this workspace, so conversation insights cannot be generated yet.'
        : `Insight generation failed: ${result.error}`,
    }
  }
  return {
    profile,
    generated_at: now,
    available: true,
    window_days: windowDays,
    thread_count: ctx.threadCount,
    message_count: ctx.messageCount,
    insights: result.text,
    via: result.via,
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderAiConversationInsightsHtml(report: AiConversationInsightsReport): string {
  const head = (body: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>AI Conversation Insights — ${esc(report.profile)}</title>
<style>
 body{font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:820px;margin:2rem auto;padding:0 1rem}
 h1{font-size:22px;margin:0 0 .25rem}.sub{color:#64748b;margin:0 0 1.25rem}
 .insights{white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:1rem 1.25rem}
 .foot{color:#94a3b8;font-size:12px;margin-top:2rem}
</style></head><body>${body}
<p class="foot">Observations, not conclusions — verify against your own records.</p></body></html>`
  if (!report.available) {
    return head(
      `<h1>AI Conversation Insights — ${esc(report.profile)}</h1><p class="sub">${esc(report.reason)}</p>`,
    )
  }
  return head(`
  <h1>AI Conversation Insights — ${esc(report.profile)}</h1>
  <p class="sub">Based on ${report.thread_count} conversations (${report.message_count} messages) · last ${report.window_days} days</p>
  <div class="insights">${esc(report.insights)}</div>`)
}
