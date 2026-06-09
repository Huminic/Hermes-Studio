/**
 * POST /api/customer/chat
 *
 * AC.2.3 + AC.2.4 — Customer chat round-trip. Picks an agent, builds the
 * system prompt from SOUL + chat persona fragment, calls Hermes (or
 * falls back to OpenAI direct when Hermes inference is unavailable),
 * and persists the conversation in the messaging-hub store (channel:chat
 * domain:chat). The Hermes SessionDB write piggybacks on /v1/chat/completions
 * when called against a real Hermes — but the durable record for Comms
 * lives in the messaging-hub tables (C.5).
 *
 * Body: {
 *   profile: string,
 *   agent_id: string,
 *   session_id?: string,   // omit on first turn; server creates one
 *   message: string,
 * }
 * Response: {
 *   ok: true, reply: string, session_id: string, via: 'hermes' | 'openai-direct'
 * }
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  listAgentsForProfile,
  readAgentSoulForProfile,
  readChannelPersona,
} from '../../../server/customer-agents'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import { requireJsonContentType } from '../../../server/rate-limit'
import { VENDOR_GUARDRAIL, scrubVendorTerms } from '../../../server/dealer-safe'
import {
  appendMessage,
  getOrCreateThread,
} from '../../../server/messaging-hub-store'
import { recallCompanyWikiTop, type RecallHit } from '../../../server/knowledge-mcp-handlers'

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
    return null
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

type ChatRequest = {
  profile?: string
  agent_id?: string
  session_id?: string
  message?: string
}

/** Cap each recalled page so the grounding context can't blow the prompt. */
const WIKI_PAGE_CHAR_CAP = 1600

export function buildSystemPrompt(opts: {
  profile: string
  agentName: string
  soul: string | null
  chatPersona: string | null
  /** Whole company-wiki pages recalled for the user's question (the Info-Store). */
  wikiContext?: Array<RecallHit>
}): string {
  const segments: Array<string> = [
    // LC-BLOCKER-008: vendor-name confidentiality guardrail first (outranks the
    // wiki/SOUL that follows). Dealer staff is still a dealer-facing surface.
    VENDOR_GUARDRAIL,
    ``,
    `# Customer chat context`,
    `Profile: ${opts.profile}`,
    `Agent: ${opts.agentName}`,
    ``,
    `You are this profile's agent talking to a logged-in customer-admin on the chat channel. Answer from the COMPANY WIKI below (the organization's knowledge — how this business operates, its policies, procedures, and what you are and are not allowed to do) together with your SOUL and persona. The wiki is the source of truth. If the answer is not in the wiki/SOUL/persona, say you don't have that on record and offer to find out — do NOT invent it. Respect the limits your SOUL defines for you.`,
  ]
  if (opts.soul) {
    segments.push('', '# Agent SOUL (governs your behavior + limits)', '', opts.soul)
  }
  if (opts.chatPersona) {
    segments.push('', '# Chat channel persona', '', opts.chatPersona)
  }
  if (opts.wikiContext && opts.wikiContext.length > 0) {
    segments.push('', '# Company wiki (Info-Store — answer from this)')
    for (const hit of opts.wikiContext) {
      const body = hit.content.length > WIKI_PAGE_CHAR_CAP
        ? hit.content.slice(0, WIKI_PAGE_CHAR_CAP) + '\n…(truncated)'
        : hit.content
      segments.push('', `## ${hit.path}`, '', body)
    }
  }
  return segments.join('\n')
}

export const Route = createFileRoute('/api/customer/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        let body: ChatRequest
        try {
          body = (await request.json()) as ChatRequest
        } catch {
          return json({ ok: false, error: 'Invalid JSON.' }, { status: 400 })
        }
        const profile = String(body.profile ?? '')
        const agentId = String(body.agent_id ?? '')
        const message = String(body.message ?? '').trim()
        if (!profile || !agentId || !message) {
          return json(
            { ok: false, error: 'profile, agent_id, message required.' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json(
            { ok: false, error: 'Unauthorized for this profile.' },
            { status: 403 },
          )
        }

        // Verify the agent exists on this profile.
        const roster = listAgentsForProfile(profile)
        const agent = roster.agents.find((a) => a.id === agentId)
        if (!agent) {
          return json(
            { ok: false, error: 'Agent not found for this profile.' },
            { status: 404 },
          )
        }

        const soul = readAgentSoulForProfile(profile, agentId)
        const chatPersona = readChannelPersona(profile, agentId, 'chat')
        // Ground the agent in the org's Info-Store: recall the most relevant
        // whole wiki pages for this question (every agent reads the wiki).
        const wikiContext = recallCompanyWikiTop(profile, message, 3)

        // Persist inbound message into messaging-hub.
        const thread = getOrCreateThread({
          profile,
          domain: 'chat',
          channel: 'chat',
          existing_thread_id: body.session_id,
          subject: `chat · ${agent.name}`,
          contact_handle:
            session?.username ?? `customer-admin-${profile}`,
          assigned_agent_id: agentId,
        })

        appendMessage({
          thread_id: thread.id,
          direction: 'inbound',
          role: 'user',
          content: message,
          channel: 'chat',
          author: session?.username ?? 'customer-admin',
        })

        // Build provider request: load last 20 turns from the thread.
        const history = thread.messages.slice(-20).map((m) => ({
          role:
            m.role === 'assistant'
              ? 'assistant'
              : m.role === 'system'
                ? 'system'
                : 'user',
          content: m.content,
        }))
        // ensure latest user message present (appendMessage already added it,
        // but reload defensively)
        const messages = [
          {
            role: 'system',
            content: buildSystemPrompt({
              profile,
              agentName: agent.name,
              soul,
              chatPersona,
              wikiContext,
            }),
          },
          ...history,
        ]

        async function callProvider(): Promise<
          | { ok: true; reply: string; via: 'hermes' | 'openai-direct' }
          | { ok: false; error: string; status: number }
        > {
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
                  max_tokens: 600,
                  metadata: {
                    profile,
                    agent_id: agentId,
                    channel: 'chat',
                    domain: 'chat',
                    customer_admin_user: session?.username ?? null,
                    thread_id: thread.id,
                  },
                }),
              })
              const data = (await res.json().catch(() => ({}))) as {
                error?: { message?: string }
                choices?: Array<{ message?: { content?: string } }>
              }
              if (res.ok && !data.error) {
                const reply = scrubVendorTerms(data.choices?.[0]?.message?.content ?? '')
                return { ok: true, reply, via: 'hermes' }
              }
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
                    max_tokens: 600,
                  }),
                },
              )
              const data = (await res.json().catch(() => ({}))) as {
                error?: { message?: string }
                choices?: Array<{ message?: { content?: string } }>
              }
              if (!res.ok || data.error) {
                return {
                  ok: false,
                  status: 502,
                  error: data.error?.message ?? 'Upstream provider error.',
                }
              }
              const reply = scrubVendorTerms(data.choices?.[0]?.message?.content ?? '')
              return { ok: true, reply, via: 'openai-direct' }
            }
            return {
              ok: false,
              status: 503,
              error:
                'No inference provider configured. Set API_SERVER_KEY (Hermes) or OPENAI_API_KEY.',
            }
          } catch (err) {
            return {
              ok: false,
              status: 502,
              error:
                err instanceof Error ? err.message : 'Provider call failed.',
            }
          }
        }

        const result = await callProvider()
        if (!result.ok) {
          return json(
            { ok: false, error: result.error, session_id: thread.id },
            { status: result.status },
          )
        }
        appendMessage({
          thread_id: thread.id,
          direction: 'outbound',
          role: 'assistant',
          content: result.reply,
          channel: 'chat',
          author: agent.name,
          metadata: { agent_id: agentId, via: result.via },
        })
        return json({
          ok: true,
          reply: result.reply,
          session_id: thread.id,
          via: result.via,
        })
      },
    },
  },
})
