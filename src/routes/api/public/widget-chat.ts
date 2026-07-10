import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { findPublicWidget, readAgentSoul } from '../../../server/public-widgets'
import {
  appendMessage,
  getOrCreateThreadEx,
  recordLeadNotify,
  upsertContact,
  wasLeadNotifiedWithin,
} from '../../../server/messaging-hub-store'
import {
  notifyActiveConversation,
  notifyNewLead,
} from '../../../server/lead-notifications'
import { extractContactFromHistory } from '../../../server/chat-contact-extract'
import { VENDOR_GUARDRAIL, scrubVendorTerms } from '../../../server/dealer-safe'
import { recallCompanyWikiTop } from '../../../server/knowledge-mcp-handlers'

// Information-Store grounding for the PUBLIC widget chat (C). recallCompanyWikiTop
// scores pages by query-term overlap (heading match = 2/term, body = 1/term).
// Require a STRONG match before injecting so thin/boilerplate scaffold pages —
// which match incidental common words — are not force-fed into shopper answers.
// Below the bar we inject nothing and fall back to SOUL + widget body.
const WIDGET_MIN_RECALL_SCORE = 3
const WIDGET_WIKI_PAGE_CHAR_CAP = 1200

const HERMES_URL = process.env.HERMES_API_URL || 'http://hermes-agent:8642'

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

const HERMES_KEY =
  process.env.API_SERVER_KEY ||
  process.env.HERMES_API_KEY ||
  readKeyFromHermesEnv('API_SERVER_KEY')
const OPENAI_KEY =
  process.env.OPENAI_API_KEY || readKeyFromHermesEnv('OPENAI_API_KEY')
const MODEL = process.env.HERMES_MODEL || 'gpt-4.1'

const buckets = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 12
const RATE_WINDOW_MS = 60_000

function rateLimited(key: string): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  b.count++
  if (b.count > RATE_LIMIT) return true
  return false
}

function clientKey(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'anon'
  )
}

/**
 * POST /api/public/widget-chat
 *
 * Anonymous endpoint for the customer-console widget chat. Resolves the
 * widget by slug across all profiles, loads the declared agent's SOUL
 * fragment if present, constructs a system prompt grounded in the widget
 * frontmatter + agent SOUL, dispatches to Hermes chat completions, and
 * returns the reply.
 *
 * Body: { profile, slug, session_id, history: [{role, content}, ...] }
 */
export const Route = createFileRoute('/api/public/widget-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (rateLimited(clientKey(request))) {
          return json(
            { ok: false, error: 'Too many messages — please slow down.' },
            { status: 429 },
          )
        }
        if (!HERMES_KEY) {
          return json(
            { ok: false, error: 'Widget chat is not configured.' },
            { status: 503 },
          )
        }
        let body: {
          profile?: string
          slug?: string
          session_id?: string
          history?: Array<{ role: string; content: string }>
        }
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: 'Invalid JSON.' }, { status: 400 })
        }
        const slug = String(body.slug ?? '')
        if (!slug) {
          return json({ ok: false, error: 'Missing slug.' }, { status: 400 })
        }
        const widget = findPublicWidget(slug)
        if (!widget) {
          return json(
            { ok: false, error: 'Widget not found.' },
            { status: 404 },
          )
        }
        if (body.profile && body.profile !== widget.profile) {
          return json(
            { ok: false, error: 'Widget profile mismatch.' },
            { status: 400 },
          )
        }
        const history = Array.isArray(body.history) ? body.history : []
        if (history.length === 0) {
          return json(
            { ok: false, error: 'No message in history.' },
            { status: 400 },
          )
        }
        // Build system prompt: widget frontmatter + agent SOUL if present
        const fm = widget.frontmatter
        const greeting = String(fm.greeting ?? '')
        const persona = String(fm.title ?? widget.slug)
        const agentId = String(fm.agent ?? '')
        const agentSoul = agentId
          ? readAgentSoul(widget.profile, agentId)
          : null
        // Ground on the store's Information Store (company wiki) when the
        // visitor's latest question matches it strongly enough — same recall
        // the authenticated in-app chat uses, gated by a safe score threshold
        // so generic scaffold content isn't forced into answers (C).
        const latestVisitor = history[history.length - 1]
        const wikiHits =
          latestVisitor && latestVisitor.role !== 'assistant'
            ? recallCompanyWikiTop(
                widget.profile,
                String(latestVisitor.content ?? ''),
                3,
              ).filter((h) => h.score >= WIDGET_MIN_RECALL_SCORE)
            : []
        const systemPrompt = [
          // LC-BLOCKER-008: vendor-name confidentiality guardrail FIRST so it
          // outranks the SOUL/body context that follows.
          VENDOR_GUARDRAIL,
          ``,
          `# Widget context`,
          `Profile: ${widget.profile}`,
          `Slug: ${widget.slug}`,
          `Persona: ${persona}`,
          `Greeting (already shown to visitor): ${greeting}`,
          ``,
          `You are this widget's conversational agent. Keep replies short (1-3 sentences).`,
          `Stay on the topic of the customer profile. If a visitor asks for something outside scope (a price, a deal, a written commitment), offer to connect them to a human via the agent's escalation path. Do not invent specific prices or vehicle availability.`,
          // Brand fidelity — prevents cross-brand hallucination (e.g. a Nissan
          // store's widget describing Honda models). The persona/greeting names
          // the dealership's brand; never drift to another manufacturer.
          `Brand fidelity: You represent ONLY this dealership, whose brand is named in your persona and greeting. NEVER name, list, compare, or recommend vehicles from a DIFFERENT manufacturer. If you are not certain a model belongs to this dealership's brand, do not name it — offer to have the team confirm exact models and availability.`,
          ``,
          // P2-6 — the sales-conversation style, applied to the public widget (it
          // previously used only SOUL and asked yes/no questions / said "I can't").
          `# How you sell — apply to EVERY reply`,
          `1. Champion the team — speak with confidence about how great the sales team is at exactly what this customer needs; never a lukewarm "can help".`,
          `2. Never ask a yes/no question — always an assumptive either/or, kept simple, concrete and near-term ("Is this week or next better to come in?", "Would a call be better this afternoon or tomorrow morning?"). Never "Would you like…?" or "Are you ready?".`,
          `3. Never say "I can't" — reframe every limit as service ("The team has the tools to get you exact numbers fast").`,
          `4. Own the next step — YOU take the action ("I'll have the team reach out and take care of you"); never hand the sale back with "let me know" or "text me whenever".`,
          `5. Serve their journey — leave the prospect feeling personally taken care of and pursued warmly, not processed.`,
          ``,
          agentSoul
            ? `# Agent SOUL (governs your behavior)\n\n${agentSoul}`
            : `# No agent SOUL configured — use the widget body as your only context.`,
          ``,
          `# Widget body (additional context)`,
          widget.body.slice(0, 4000),
          // Information-Store grounding (only when a strong match cleared the
          // threshold). The agent answers from this when relevant; if it does
          // not cover the question it must not invent — offer a human handoff.
          ...(wikiHits.length
            ? [
                ``,
                `# Dealership knowledge (Information Store — answer from this when relevant; if it does not cover the question, do not invent, offer to connect them to the team)`,
                ...wikiHits.flatMap((h) => [
                  ``,
                  `## ${h.path}`,
                  ``,
                  h.content.length > WIDGET_WIKI_PAGE_CHAR_CAP
                    ? h.content.slice(0, WIDGET_WIKI_PAGE_CHAR_CAP) +
                      '\n…(truncated)'
                    : h.content,
                ]),
              ]
            : []),
        ].join('\n')

        // ── Capture the conversation into the Teambox (messaging-hub) ─────────
        // The widget chat was previously stateless: replies were generated but
        // the exchange never landed in the inbox and no lead alert fired. Persist
        // the visitor's message NOW (before inference, so it survives even if the
        // model is unreachable) and alert the dealer ONCE the visitor's contact
        // info appears in the chat. All best-effort — capture/notify must never
        // break the reply.
        //
        // P0-1 FIX (chat→VIN "no name / no phone / two leads"): the lead used to
        // fire on the FIRST message, while the visitor was still anonymous, so
        // the ADF carried an empty <contact>. A contactless ADF cannot be deduped
        // by VinSolutions — it minted a fresh anonymous contact per ingest, which
        // is what produced the junk "two blank leads" the dealer saw. We now scan
        // the accumulated visitor turns for a phone/name and fire the lead EXACTLY
        // ONCE per thread, WITH that identity, as soon as it appears. Deduped via
        // the lead-notify ledger keyed on the thread id (a NEW per-thread key, not
        // the old per-IP cooldown, which could suppress a distinct visitor behind
        // shared NAT). A purely anonymous conversation (visitor never leaves a
        // phone or name) intentionally does NOT create a DMS lead — first-touch
        // awareness still lives in the Teambox + the optional active-conversation
        // alert. See src/server/chat-contact-extract.ts and
        // outputs/p0-1-vin-investigation.md.
        const sessionId = String(body.session_id ?? '') || clientKey(request)
        const chatHandle = `chat:${sessionId}`
        const chatDomain =
          String(fm.domain ?? '') === 'service' ? 'service' : 'sales'
        const lastUser = history[history.length - 1]
        let chatThreadId: string | null = null
        try {
          upsertContact({
            profile: widget.profile,
            display_name: null,
            identifiers: { chat: chatHandle },
          })
          const ex = getOrCreateThreadEx({
            profile: widget.profile,
            domain: chatDomain,
            channel: 'chat',
            contact_handle: chatHandle,
            subject: `chat · ${persona}`,
            assigned_agent_id: agentId || null,
          })
          chatThreadId = ex.thread.id
          if (lastUser && lastUser.role !== 'assistant') {
            appendMessage({
              thread_id: ex.thread.id,
              direction: 'inbound',
              role: 'user',
              channel: 'chat',
              content: String(lastUser.content ?? ''),
              author: chatHandle,
              metadata: {
                via: 'widget-chat',
                slug: widget.slug,
                session_id: sessionId,
              },
            })
          }
          // Slice H — conversation became ACTIVE (visitor sent a follow-on on
          // an EXISTING chat thread, NOT the first message). Gated by the
          // per-profile DEFAULT-OFF `notifications.active_conversation_alert`
          // flag, deduped once per thread, EMAIL format with a takeover button.
          // Best-effort; never blocks the visitor's reply.
          if (!ex.created && lastUser && lastUser.role !== 'assistant') {
            void notifyActiveConversation({
              profile: widget.profile,
              threadId: ex.thread.id,
              channel: 'chat',
              who: persona,
              message: String(lastUser.content ?? ''),
            }).catch((err) => {
              console.warn(
                '[widget-chat] active conversation notification failed',
                err,
              )
            })
          }
          // ── Fire the DMS lead ONCE per thread, WITH captured identity ───────
          // Scan the accumulated visitor turns for a phone/name. Fire the lead
          // the FIRST time identity appears and never again for this thread
          // (per-thread ledger key). Deferring until identity exists is what
          // fixes the empty-ADF → duplicate-VIN-lead P0. A visitor who never
          // leaves contact info produces no DMS lead (by design — see block
          // comment above). Dedupe window is effectively permanent (10y) so a
          // long conversation can never re-fire.
          const { phone: chatPhone, name: chatName } =
            extractContactFromHistory(history)
          if (chatName) {
            // Surface the captured name in the Teambox contact card too.
            try {
              upsertContact({
                profile: widget.profile,
                display_name: chatName,
                identifiers: { chat: chatHandle },
              })
            } catch {
              // best-effort
            }
          }
          // Per-thread reservation key for OUR race guard. Distinct from the
          // key the notifier consumes for its own cooldown (below) so our
          // pre-reservation does not make the notifier see a self-inflicted
          // "within cooldown" and skip the send.
          const leadReserveKey = `chat-lead-fired:${ex.thread.id}`
          const TEN_YEARS_MS = 10 * 365 * 24 * 3_600_000
          if (
            (chatPhone || chatName) &&
            !wasLeadNotifiedWithin(widget.profile, leadReserveKey, TEN_YEARS_MS)
          ) {
            // Reserve the per-thread slot BEFORE the async send so a rapid
            // second message can't race in a duplicate notify. If the send
            // fails we do NOT roll this back — a retry would risk a duplicate
            // DMS lead, which is exactly the P0 we are fixing; the failure is
            // still recorded on the thread for the operator.
            try {
              recordLeadNotify(widget.profile, leadReserveKey)
            } catch {
              // best-effort — if the ledger write fails we still notify once
            }
            void notifyNewLead({
              profile: widget.profile,
              channel: 'website chat',
              contact_handle: chatHandle,
              name: chatName,
              phone: chatPhone,
              message: String(lastUser?.content ?? ''),
              subjectPrefix: 'Website chat',
              // Per-thread cooldown key inside the notifier — one lead per
              // conversation, never the old rotating anonymous handle / per-IP
              // key (which could suppress a distinct visitor behind shared NAT).
              cooldownKey: `chat-lead:${ex.thread.id}`,
            })
              .then((notified) => {
                // Annotate the thread with the delivery outcome (system-role —
                // never rendered to the customer; diagnostics live in metadata).
                // Parity with the voice/video webhooks.
                try {
                  appendMessage({
                    thread_id: ex.thread.id,
                    direction: 'outbound',
                    role: 'system',
                    channel: 'chat',
                    content: `Lead notification: ${notified.ok ? 'sent' : 'not delivered'}`,
                    author: 'system',
                    metadata: {
                      via: 'lead-notification',
                      delivery: notified.via,
                      external_id: notified.external_id ?? null,
                      reason: notified.reason ?? null,
                      lead_phone: chatPhone ?? null,
                      lead_name: chatName ?? null,
                    },
                  })
                } catch {
                  // best-effort diagnostics
                }
              })
              .catch((err) => {
                try {
                  appendMessage({
                    thread_id: ex.thread.id,
                    direction: 'outbound',
                    role: 'system',
                    channel: 'chat',
                    content: 'Lead notification: not delivered',
                    author: 'system',
                    metadata: {
                      via: 'lead-notification',
                      delivery: 'failed',
                      external_id: null,
                      reason:
                        err instanceof Error
                          ? err.message
                          : 'notification failed',
                    },
                  })
                } catch {
                  // best-effort diagnostics
                }
              })
          }
        } catch {
          // best-effort capture/notify — never block the visitor's reply
        }

        // Persist the agent's reply to the same thread (best-effort) so the
        // Teambox shows the full exchange, not just the inbound side.
        const persistReply = (reply: string, via: string): void => {
          if (!chatThreadId || !reply) return
          try {
            appendMessage({
              thread_id: chatThreadId,
              direction: 'outbound',
              role: 'assistant',
              channel: 'chat',
              content: reply,
              author: agentId || persona,
              metadata: { via: `widget-chat:${via}`, slug: widget.slug },
            })
          } catch {
            // best-effort
          }
        }

        const messages: Array<{ role: string; content: string }> = [
          { role: 'system', content: systemPrompt },
          ...history.slice(-20).map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content ?? ''),
          })),
        ]

        // Try Hermes chat-completions first (preferred — keeps the request
        // on-network and routes through the profile's primary agent). Fall
        // back to direct OpenAI when Hermes reports inference-not-configured
        // (the gateway's portable mode is finicky about provider auth — see
        // D-V0-005). The fallback uses the OPENAI_API_KEY that lives in the
        // Hermes .env on the shared volume.
        try {
          if (HERMES_KEY) {
            const res = await fetch(`${HERMES_URL}/v1/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${HERMES_KEY}`,
              },
              body: JSON.stringify({
                model: MODEL,
                messages,
                temperature: 0.5,
                max_tokens: 400,
              }),
            })
            const data = (await res.json()) as {
              error?: { message?: string }
              choices?: Array<{ message?: { content?: string } }>
            }
            if (res.ok && !data.error) {
              // LC-BLOCKER-008 backstop: scrub any vendor term the model emits
              // before it reaches the visitor OR the Teambox.
              const reply = scrubVendorTerms(
                data.choices?.[0]?.message?.content ?? '',
              )
              persistReply(reply, 'hermes')
              // Public response: reply only. The provider/gateway identity
              // ('hermes') stays in thread metadata for diagnostics, never on
              // the wire — dealer-vendor-confidentiality (LC-BLOCKER-008).
              return json({ ok: true, reply })
            }
            // fall through to OpenAI fallback if Hermes returns an error
          }
          if (OPENAI_KEY) {
            const res = await fetch(
              'https://api.openai.com/v1/chat/completions',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${OPENAI_KEY}`,
                },
                body: JSON.stringify({
                  model: MODEL,
                  messages,
                  temperature: 0.5,
                  max_tokens: 400,
                }),
              },
            )
            const data = (await res.json()) as {
              error?: { message?: string }
              choices?: Array<{ message?: { content?: string } }>
            }
            if (!res.ok || data.error) {
              // Neutral, generic message — never surface the upstream
              // provider name or its raw error string to the visitor.
              return json(
                {
                  ok: false,
                  error: 'The assistant is temporarily unavailable.',
                },
                { status: 502 },
              )
            }
            // LC-BLOCKER-008 backstop: scrub any vendor term the model emits
            // before it reaches the visitor OR the Teambox.
            const reply = scrubVendorTerms(
              data.choices?.[0]?.message?.content ?? '',
            )
            persistReply(reply, 'openai-direct')
            // Public response: reply only. The provider identity
            // ('openai-direct') stays in thread metadata for diagnostics,
            // never on the wire — dealer-vendor-confidentiality.
            return json({ ok: true, reply })
          }
          // Generic, non-infra message on the public wire. The specific
          // missing-credential hint (which names the Hermes/OpenAI env vars)
          // is for operators — it must not reach a dealer page or visitor.
          return json(
            {
              ok: false,
              error: 'Widget chat is not configured.',
            },
            { status: 503 },
          )
        } catch (err) {
          // The thrown error can embed the internal gateway hostname
          // (HERMES_URL) — return a neutral message and keep details server-side.
          console.error('[widget-chat] upstream failure', err)
          return json(
            {
              ok: false,
              error: 'The assistant is temporarily unavailable.',
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
