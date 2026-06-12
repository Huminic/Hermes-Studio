import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

/**
 * Dealer-vendor-confidentiality (LC-BLOCKER-008): the public, CORS-open widget
 * endpoints must NEVER name infra/providers in their HTTP response bodies. The
 * internal thread metadata and server logs legitimately keep 'resend' /
 * 'hermes' / 'openai-direct' for diagnostics — this test guards only the wire.
 */

// Tokens that must never appear in a public widget response body.
const BANNED = ['resend', 'openai', 'hermes', 'vapi', 'tavus', 'textmagic']

function assertClean(payload: string, profileSlug: string) {
  const lower = payload.toLowerCase()
  for (const token of BANNED) {
    expect(lower, `banned token "${token}" leaked in: ${payload}`).not.toContain(
      token,
    )
  }
  // Raw profile slug must not be echoed on the public wire.
  expect(payload, `raw profile slug leaked in: ${payload}`).not.toContain(
    profileSlug,
  )
}

let tmpHome: string
const PROFILE = 'serra-honda'

// Mock the dealer-notification send so widget-form returns a known infra `via`
// ('resend') WITHOUT it reaching the response — proves the scrub, not a no-op.
const notifySpy = vi.fn(async () => ({
  ok: true,
  via: 'resend' as const,
  external_id: 'evt_internal_123',
}))
vi.mock('@/server/lead-notifications', () => ({ notifyNewLead: notifySpy }))

// public-widgets captures PROFILES_ROOT from os.homedir() at module load, so
// the home dir must be stable for the whole file (set before the first import).
beforeAll(() => {
  // widget-chat freezes HERMES_KEY / OPENAI_KEY into module-level constants at
  // import time. Set both BEFORE the first dynamic import so the provider
  // branches are reachable in-test (the route is imported lazily per test, but
  // cached after the first import).
  process.env.API_SERVER_KEY = 'test-hermes-key'
  process.env.OPENAI_API_KEY = 'sk-test'
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'public-widget-leak-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
  fs.mkdirSync(path.join(dir, 'knowledge', 'widgets'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    [
      'branding:',
      '  persona_name: Serra Honda',
      'widgets:',
      '  - slug: serra-honda-contact',
      '    mode: form',
      '  - slug: serra-honda-sales-chat',
      '    mode: chat',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(dir, 'knowledge', 'widgets', 'serra-honda-contact.md'),
    '---\nslug: serra-honda-contact\nmode: form\nagent: caroline\ndomain: sales\ntitle: Contact Serra Honda\ntype: widget\nstatus: published\n---\nContact form.',
  )
  fs.writeFileSync(
    path.join(dir, 'knowledge', 'widgets', 'serra-honda-sales-chat.md'),
    '---\nslug: serra-honda-sales-chat\nmode: chat\nagent: caroline\ndomain: sales\ntitle: Chat with Serra Honda\ntype: widget\nstatus: published\n---\nChat body.',
  )
})

beforeEach(async () => {
  notifySpy.mockClear()
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
})

afterAll(() => {
  delete process.env.API_SERVER_KEY
  delete process.env.OPENAI_API_KEY
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('public widget responses do not leak infra/provider names', () => {
  it('widget-form: success body carries no vendor token and no raw slug', async () => {
    const { Route } = await import('@/routes/api/public/widget-form')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/public/widget-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'serra-honda-contact',
        name: 'Jane Shopper',
        email: 'jane@example.com',
        phone: '+15555550100',
        message: 'Interested in an Accord',
      }),
    })
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(200)
    const text = await res.text()
    const body = JSON.parse(text) as { ok: boolean; notified: boolean; via?: unknown }
    // Behaviour preserved: still reports delivery as a neutral boolean.
    expect(body.ok).toBe(true)
    expect(body.notified).toBe(true)
    // The infra identifier must be gone from the wire.
    expect(body.via).toBeUndefined()
    assertClean(text, PROFILE)
  })

  it('widget-chat: reply body carries no vendor token and no raw slug', async () => {
    // Enter the Hermes path with a mocked provider reply.
    const realFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/v1/chat/completions')) {
        return new Response(
          JSON.stringify({ choices: [{ message: { content: 'How can I help?' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return realFetch(url as RequestInfo)
    }) as typeof fetch
    try {
      const { Route } = await import('@/routes/api/public/widget-chat')
      const handler = Route.options.server.handlers.POST
      const req = new Request('http://localhost/api/public/widget-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'serra-honda-sales-chat',
          session_id: 'sess-1',
          history: [{ role: 'user', content: 'hi' }],
        }),
      })
      const res = await handler({ request: req } as never)
      expect(res.status).toBe(200)
      const text = await res.text()
      const body = JSON.parse(text) as { ok: boolean; reply: string; via?: unknown }
      // Behaviour preserved: visitor still gets the reply.
      expect(body.ok).toBe(true)
      expect(body.reply).toBe('How can I help?')
      // The provider/gateway identity must be gone from the wire.
      expect(body.via).toBeUndefined()
      assertClean(text, PROFILE)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('widget-chat: upstream-error body carries no provider name', async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/v1/chat/completions')) {
        // Hermes returns an error so we fall through; OpenAI then errors with a
        // provider-named message that previously echoed straight to the visitor.
        return new Response(
          JSON.stringify({ error: { message: 'OpenAI quota exceeded for org' } }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return realFetch(url as RequestInfo)
    }) as typeof fetch
    try {
      const { Route } = await import('@/routes/api/public/widget-chat')
      const handler = Route.options.server.handlers.POST
      const req = new Request('http://localhost/api/public/widget-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'serra-honda-sales-chat',
          session_id: 'sess-2',
          history: [{ role: 'user', content: 'hi' }],
        }),
      })
      const res = await handler({ request: req } as never)
      expect(res.status).toBe(502)
      const text = await res.text()
      assertClean(text, PROFILE)
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
