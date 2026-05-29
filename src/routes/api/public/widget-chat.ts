import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { findPublicWidget, readAgentSoul } from '../../../server/public-widgets'

const HERMES_URL = process.env.HERMES_API_URL || 'http://hermes-agent:8642'

function readHermesKey(): string | null {
  const fromEnv = process.env.API_SERVER_KEY || process.env.HERMES_API_KEY
  if (fromEnv) return fromEnv
  // Fallback: read from the agent profile .env (volume-mounted at /root/.hermes)
  try {
    const envPath = path.join(os.homedir(), '.hermes', '.env')
    const raw = fs.readFileSync(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const k = trimmed.slice(0, eq).trim()
      if (k === 'API_SERVER_KEY') return trimmed.slice(eq + 1).trim()
    }
  } catch {
    // missing or unreadable — fall through
  }
  return null
}

const HERMES_KEY = readHermesKey()
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
        const systemPrompt = [
          `# Widget context`,
          `Profile: ${widget.profile}`,
          `Slug: ${widget.slug}`,
          `Persona: ${persona}`,
          `Greeting (already shown to visitor): ${greeting}`,
          ``,
          `You are this widget's conversational agent. Keep replies short (1-3 sentences).`,
          `Stay on the topic of the customer profile. If a visitor asks for something outside scope (a price, a deal, a written commitment), offer to connect them to a human via the agent's escalation path. Do not invent specific prices or vehicle availability.`,
          ``,
          agentSoul
            ? `# Agent SOUL (governs your behavior)\n\n${agentSoul}`
            : `# No agent SOUL configured — use the widget body as your only context.`,
          ``,
          `# Widget body (additional context)`,
          widget.body.slice(0, 4000),
        ].join('\n')

        const messages: Array<{ role: string; content: string }> = [
          { role: 'system', content: systemPrompt },
          ...history.slice(-20).map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content ?? ''),
          })),
        ]

        try {
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
          if (!res.ok || data.error) {
            return json(
              {
                ok: false,
                error: data.error?.message || 'Upstream error.',
              },
              { status: 502 },
            )
          }
          const reply = data.choices?.[0]?.message?.content ?? ''
          return json({ ok: true, reply })
        } catch (err) {
          return json(
            {
              ok: false,
              error:
                err instanceof Error
                  ? err.message
                  : 'Failed to reach upstream.',
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
