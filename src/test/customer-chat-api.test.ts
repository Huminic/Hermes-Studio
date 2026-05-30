/**
 * AC.2.5 — Studio chat round-trip test for /api/customer/chat. Mocks the
 * provider call so the test does not depend on Hermes or OpenAI.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
let restoreFetch: () => void

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cchat-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  // Seed a profile with a SOUL so the agent picker finds something.
  const profileDir = path.join(tmpHome, '.hermes', 'profiles', 'fictitious')
  fs.mkdirSync(profileDir, { recursive: true })
  fs.writeFileSync(
    path.join(profileDir, 'SOUL.md'),
    `# Fictitious build-time agent\n\nYou are the test agent for the validation harness.\n`,
  )
  // studio.yaml: empty visible_agents → all profile agents allowed
  fs.writeFileSync(
    path.join(profileDir, 'studio.yaml'),
    `version: 1\nbranding:\n  persona_name: Fictitious\n  accent_color: "#1e40af"\n`,
  )
  // Patch fetch to return a predictable assistant reply.
  const realFetch = globalThis.fetch
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url)
    if (u.includes('/v1/chat/completions')) {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'reply-from-mock' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return realFetch(url as RequestInfo)
  }) as typeof fetch
  restoreFetch = () => {
    globalThis.fetch = realFetch
  }
  // Need a hermes key to enter the provider call path.
  process.env.API_SERVER_KEY = 'test-key'
  // Reset store
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  restoreFetch()
  delete process.env.API_SERVER_KEY
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('/api/customer/agents', () => {
  it('returns 400 when profile is missing', async () => {
    const { Route } = await import('@/routes/api/customer/agents')
    const request = new Request('http://localhost/api/customer/agents')
    const handler = Route.options.server.handlers.GET
    const res = await handler({ request } as never)
    expect(res.status).toBe(400)
  })

  it('returns 403 when not authorized for the profile', async () => {
    process.env.HERMES_PASSWORD = 'gate-on'
    try {
      const { Route } = await import('@/routes/api/customer/agents')
      const request = new Request(
        'http://localhost/api/customer/agents?profile=fictitious',
      )
      const handler = Route.options.server.handlers.GET
      const res = await handler({ request } as never)
      expect(res.status).toBe(403)
    } finally {
      delete process.env.HERMES_PASSWORD
    }
  })

  it('returns the profile roster when no password protection is on', async () => {
    const { Route } = await import('@/routes/api/customer/agents')
    const request = new Request(
      'http://localhost/api/customer/agents?profile=fictitious',
    )
    const handler = Route.options.server.handlers.GET
    const res = await handler({ request } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; agents: Array<{ id: string }> }
    expect(body.ok).toBe(true)
    expect(body.agents.map((a) => a.id)).toContain('fictitious')
  })
})

describe('/api/customer/chat', () => {
  it('rejects missing fields', async () => {
    const { Route } = await import('@/routes/api/customer/chat')
    const handler = Route.options.server.handlers.POST
    const request = new Request('http://localhost/api/customer/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'fictitious' }),
    })
    const res = await handler({ request } as never)
    expect(res.status).toBe(400)
  })

  it('round-trips with the mocked provider and persists messages', async () => {
    const { Route } = await import('@/routes/api/customer/chat')
    const handler = Route.options.server.handlers.POST
    const request = new Request('http://localhost/api/customer/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: 'fictitious',
        agent_id: 'fictitious',
        message: 'hello',
      }),
    })
    const res = await handler({ request } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      reply: string
      session_id: string
      via: string
    }
    expect(body.ok).toBe(true)
    expect(body.reply).toBe('reply-from-mock')
    expect(body.session_id).toBeTruthy()
    expect(body.via).toBe('hermes')
    // Persistence check: the thread should now have two messages.
    const { getThread } = await import('@/server/messaging-hub-store')
    const thread = getThread('fictitious', body.session_id)
    expect(thread?.messages).toHaveLength(2)
    expect(thread?.messages[0].direction).toBe('inbound')
    expect(thread?.messages[1].direction).toBe('outbound')
    expect(thread?.domain).toBe('chat')
    expect(thread?.channel).toBe('chat')
  })

  it('returns 404 for an unknown agent', async () => {
    const { Route } = await import('@/routes/api/customer/chat')
    const handler = Route.options.server.handlers.POST
    const request = new Request('http://localhost/api/customer/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: 'fictitious',
        agent_id: 'not-a-real-agent',
        message: 'hello',
      }),
    })
    const res = await handler({ request } as never)
    expect(res.status).toBe(404)
  })
})
