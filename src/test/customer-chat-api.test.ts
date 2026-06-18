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
let providerRequests: Array<{
  messages?: Array<{ role: string; content: string }>
}>

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
  providerRequests = []
  globalThis.fetch = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/v1/chat/completions')) {
        if (typeof init?.body === 'string') {
          providerRequests.push(
            JSON.parse(init.body) as {
              messages?: Array<{ role: string; content: string }>
            },
          )
        }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'reply-from-mock' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return realFetch(url as RequestInfo)
    },
  ) as typeof fetch
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
    const lastProviderRequest = providerRequests.at(-1)
    expect(
      lastProviderRequest?.messages?.some(
        (m) => m.role === 'user' && m.content === 'hello',
      ),
    ).toBe(true)
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

  async function chat(body: Record<string, unknown>) {
    const { Route } = await import('@/routes/api/customer/chat')
    const handler = Route.options.server.handlers.POST
    const res = await handler({
      request: new Request('http://localhost/api/customer/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    } as never)
    return (await res.json()) as { ok: boolean; session_id: string }
  }

  it('new_session starts a fresh thread; an explicit session_id continues it', async () => {
    const a = await chat({
      profile: 'fictitious',
      agent_id: 'fictitious',
      new_session: true,
      message: 'first chat',
    })
    const b = await chat({
      profile: 'fictitious',
      agent_id: 'fictitious',
      new_session: true,
      message: 'second chat',
    })
    // Switching/new chat never resumes the previous thread.
    expect(a.session_id).toBeTruthy()
    expect(b.session_id).toBeTruthy()
    expect(b.session_id).not.toBe(a.session_id)

    // Continuing with an explicit id stays on the same thread.
    const c = await chat({
      profile: 'fictitious',
      agent_id: 'fictitious',
      session_id: a.session_id,
      message: 'more on first',
    })
    expect(c.session_id).toBe(a.session_id)
    const { getThread } = await import('@/server/messaging-hub-store')
    expect(getThread('fictitious', a.session_id)?.messages).toHaveLength(4)
  })

  it('empty interactions create no session (thread only on first send)', async () => {
    const { listChatSessions } = await import(
      '@/server/customer-chat-sessions'
    )
    // No sends yet → no sessions.
    expect(listChatSessions('fictitious')).toHaveLength(0)
    await chat({
      profile: 'fictitious',
      agent_id: 'fictitious',
      new_session: true,
      message: 'now there is one',
    })
    expect(listChatSessions('fictitious')).toHaveLength(1)
  })

  it('a fresh session is bound to the agent it was started with', async () => {
    // Add a second profile agent.
    fs.mkdirSync(
      path.join(tmpHome, '.hermes', 'profiles', 'fictitious', 'governance', 'agents'),
      { recursive: true },
    )
    fs.writeFileSync(
      path.join(
        tmpHome,
        '.hermes',
        'profiles',
        'fictitious',
        'governance',
        'agents',
        'nova.md',
      ),
      `# Nova\n\nYou are Nova, a second test agent.\n`,
    )
    const first = await chat({
      profile: 'fictitious',
      agent_id: 'fictitious',
      new_session: true,
      message: 'to fictitious',
    })
    const nova = await chat({
      profile: 'fictitious',
      agent_id: 'nova',
      new_session: true,
      message: 'to nova',
    })
    expect(nova.session_id).not.toBe(first.session_id)
    const { listChatSessions } = await import(
      '@/server/customer-chat-sessions'
    )
    const novaSessions = listChatSessions('fictitious', { agentId: 'nova' })
    expect(novaSessions).toHaveLength(1)
    expect(novaSessions[0].id).toBe(nova.session_id)
    const ficSessions = listChatSessions('fictitious', {
      agentId: 'fictitious',
    })
    expect(ficSessions.map((s) => s.id)).not.toContain(nova.session_id)
  })
})
