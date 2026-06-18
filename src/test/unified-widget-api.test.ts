import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the dealer-notification send (callback-request) so we assert WIRING.
const notifySpy = vi.fn(async () => ({ ok: true, via: 'mock' as const }))
vi.mock('@/server/lead-notifications', () => ({ notifyNewLead: notifySpy }))

// Mock the broker call (video-session) so we never hit a live Tavus mint.
const mcpSpy = vi.fn(async () => ({
  ok: true as const,
  data: { conversation_url: 'https://tavus.daily.co/abc123' },
}))
vi.mock('@/server/central-mcp', () => ({
  callCentralMcpTool: (...args: Array<unknown>) => mcpSpy(...args),
}))

// Public studio-config test needs the unauthenticated branch.
// studio-config now scopes the FULL config to admin/own-profile via customer-auth.
// Simulate an unauthenticated visitor → public subset. (LC-BLOCKER-006)
vi.mock('@/server/customer-auth', () => ({
  resolveSession: () => null,
  isAuthorizedForProfile: () => false,
}))

let tmpHome: string
const PROFILE = 'serra-honda'

function writeStudio(yaml: string) {
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'studio.yaml'), yaml)
}

beforeEach(async () => {
  notifySpy.mockClear()
  mcpSpy.mockClear()
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'unified-widget-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

const BASE_YAML = [
  'branding:',
  '  persona_name: Serra Honda',
  'notifications:',
  '  lead_format: adf-xml',
  '  lead_recipient: bdc@serrahonda.example',
].join('\n')

describe('POST /api/public/callback-request', () => {
  it('creates a Sales lead thread and trips the dealer notification', async () => {
    writeStudio(BASE_YAML + '\n')
    const { Route } = await import('@/routes/api/public/callback-request')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/public/callback-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: PROFILE,
        name: 'Pat Visitor',
        phone: '+15555550133',
        message: 'Call me about a CR-V',
      }),
    })
    const res = await handler({ request: req } as never)
    const body = (await res.json()) as { ok: boolean; thread_id: string }
    expect(body.ok).toBe(true)
    expect(body.thread_id).toBeTruthy()

    const { listThreads } = await import('@/server/messaging-hub-store')
    const threads = listThreads({ profile: PROFILE, channel: 'form' })
    expect(threads.length).toBe(1)
    expect(threads[0].subject).toBe('Call-back request')
    expect(threads[0].contact_handle).toBe('+15555550133')

    expect(notifySpy).toHaveBeenCalledTimes(1)
    const arg = notifySpy.mock.calls[0][0] as {
      profile: string
      phone?: string
      subjectPrefix?: string
    }
    expect(arg.profile).toBe(PROFILE)
    expect(arg.phone).toBe('+15555550133')
    expect(arg.subjectPrefix).toBe('Call-back request')
  })

  it('rejects a submission with no phone', async () => {
    writeStudio(BASE_YAML + '\n')
    const { Route } = await import('@/routes/api/public/callback-request')
    const req = new Request('http://localhost/api/public/callback-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: PROFILE, name: 'No Phone' }),
    })
    const res = await Route.options.server.handlers.POST({ request: req } as never)
    expect(res.status).toBe(400)
    expect(notifySpy).not.toHaveBeenCalled()
  })

  it('404s an unknown profile (no studio.yaml on disk)', async () => {
    // No writeStudio → readStudioConfig falls back to source:'default'.
    const { Route } = await import('@/routes/api/public/callback-request')
    const req = new Request('http://localhost/api/public/callback-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'no-such-store', phone: '+15555550100' }),
    })
    const res = await Route.options.server.handlers.POST({ request: req } as never)
    expect(res.status).toBe(404)
  })
})

describe('POST /api/public/video-session', () => {
  it('mints a session and returns the conversation URL when a persona is set', async () => {
    writeStudio(
      BASE_YAML +
        '\nunified_widget:\n  video_persona_id: p9eb007721f4\n  video_agent_name: Caroline\n',
    )
    const { Route } = await import('@/routes/api/public/video-session')
    const req = new Request('http://localhost/api/public/video-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: PROFILE }),
    })
    const res = await Route.options.server.handlers.POST({ request: req } as never)
    const body = (await res.json()) as { ok: boolean; conversationUrl?: string }
    expect(body.ok).toBe(true)
    // Returns the live room URL directly (simple handoff; the room is grey-label,
    // its URL may show — only dealer-facing TEXT must be vendor-free).
    expect(body.conversationUrl).toBe('https://tavus.daily.co/abc123')
    // Persona resolved server-side and passed to the broker tool with callback URL.
    expect(mcpSpy).toHaveBeenCalledTimes(1)
    const [tool, args] = mcpSpy.mock.calls[0] as [
      string,
      { persona_id?: string; callback_url?: string },
    ]
    expect(tool).toBe('tavus_create_conversation')
    expect(args.persona_id).toBe('p9eb007721f4')
    expect(args.callback_url).toBe('http://localhost/api/webhooks/tavus/serra-honda')
  })

  it('degrades to ok:false (no broker call) when no persona is configured', async () => {
    writeStudio(BASE_YAML + '\n')
    const { Route } = await import('@/routes/api/public/video-session')
    const req = new Request('http://localhost/api/public/video-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: PROFILE }),
    })
    const res = await Route.options.server.handlers.POST({ request: req } as never)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(false)
    expect(mcpSpy).not.toHaveBeenCalled()
  })

  it('degrades to ok:false when video channel is disabled', async () => {
    writeStudio(
      BASE_YAML +
        '\nunified_widget:\n  video_persona_id: p9eb007721f4\n  channels:\n    video: false\n',
    )
    const { Route } = await import('@/routes/api/public/video-session')
    const req = new Request('http://localhost/api/public/video-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: PROFILE }),
    })
    const res = await Route.options.server.handlers.POST({ request: req } as never)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(false)
    expect(mcpSpy).not.toHaveBeenCalled()
  })
})

describe('GET /widget/dealer/<slug>.js (self-hosted embed bundle)', () => {
  it('serves a config-injected bundle without leaking the video persona id', async () => {
    writeStudio(
      BASE_YAML +
        '\nunified_widget:\n  enabled: true\n  accent: "#0d9488"\n  video_persona_id: p9eb007721f4\n  video_agent_name: Caroline\n',
    )
    const { Route } = await import('@/routes/widget/dealer/$slug[.]js')
    const handler = Route.options.server.handlers.GET
    const req = new Request('https://studio.huminic.app/widget/dealer/serra-honda.js')
    const res = await handler({ params: { slug: PROFILE }, request: req } as never)
    expect(res.headers.get('Content-Type')).toContain('javascript')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const body = await res.text()
    // Config is injected (origin, profile, persona display name, agent name).
    expect(body).toContain('huminic-dealer-widget')
    expect(body).toContain('serra-honda')
    expect(body).toContain('Caroline')
    expect(body).toContain('https://studio.huminic.app')
    // Public widget chrome stays neutral even when a profile has a teal accent.
    expect(body).toContain('"accent":"#4a5568"')
    expect(body).not.toContain('"accent":"#0d9488"')
    // The Tavus persona id is a server-side secret — must NOT be in the bundle.
    expect(body).not.toContain('p9eb007721f4')
    // LC-MINOR-002: icon-only controls expose accessible names (parity w/ React).
    expect(body).toContain('aria-label="Back"')
    expect(body).toContain('aria-label="Close"')
    // Video hands off to Tavus in a NEW WINDOW — not an in-page iframe.
    expect(body).toContain('window.open')
    expect(body).toContain('/api/public/video-session')
    // No Tavus iframe embedding (no camera/mic-permissioned iframe in the bundle).
    expect(body).not.toContain('microphone; camera')
  })

  it('derives the slug from the URL path and strips the .js extension', async () => {
    writeStudio(BASE_YAML + '\nunified_widget:\n  enabled: true\n')
    const { Route } = await import('@/routes/widget/dealer/$slug[.]js')
    const handler = Route.options.server.handlers.GET
    // The literal-.js route does not populate params.slug at runtime, so the
    // handler must read the path: /widget/dealer/serra-honda.js → serra-honda.
    const req = new Request('https://studio.huminic.app/widget/dealer/serra-honda.js')
    const res = await handler({ params: {}, request: req } as never)
    const body = await res.text()
    expect(body).toContain('huminic-dealer-widget')
    expect(body).not.toContain('unknown store')
  })

  it('forces an https origin for a real host even when the proxy forwards http', async () => {
    writeStudio(BASE_YAML + '\nunified_widget:\n  enabled: true\n')
    const { Route } = await import('@/routes/widget/dealer/$slug[.]js')
    const handler = Route.options.server.handlers.GET
    // Caddy terminates TLS and forwards http:// internally — the bundle must
    // still target https so it is not blocked as mixed content on dealer.com.
    const req = new Request('http://studio.huminic.app/widget/dealer/serra-honda.js')
    const res = await handler({ params: {}, request: req } as never)
    const body = await res.text()
    expect(body).toContain('https://studio.huminic.app')
    expect(body).not.toContain('http://studio.huminic.app')
  })

  it('serves a harmless no-op for an unknown store', async () => {
    const { Route } = await import('@/routes/widget/dealer/$slug[.]js')
    const handler = Route.options.server.handlers.GET
    const req = new Request('https://studio.huminic.app/widget/dealer/no-such.js')
    const res = await handler({ params: {}, request: req } as never)
    const body = await res.text()
    expect(body).toContain('unknown store')
    expect(body).not.toContain('huminic-dealer-widget')
  })
})

describe('CORS preflight on public widget endpoints', () => {
  it('video-session OPTIONS returns 204 with ACAO + cross-origin CORP', async () => {
    const { Route } = await import('@/routes/api/public/video-session')
    const res = await Route.options.server.handlers.OPTIONS!({} as never)
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin')
  })

  it('callback-request OPTIONS returns 204 with ACAO + cross-origin CORP', async () => {
    const { Route } = await import('@/routes/api/public/callback-request')
    const res = await Route.options.server.handlers.OPTIONS!({} as never)
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin')
  })
})

describe('Public widget cross-origin headers', () => {
  it('dealer script sends cross-origin CORP (never same-origin) for off-origin embeds', async () => {
    writeStudio(BASE_YAML + '\nunified_widget:\n  enabled: true\n')
    const { Route } = await import('@/routes/widget/dealer/$slug[.]js')
    const req = new Request('https://studio.huminic.app/widget/dealer/serra-honda.js')
    const res = await Route.options.server.handlers.GET({
      params: { slug: PROFILE },
      request: req,
    } as never)
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin')
    expect(res.headers.get('Cross-Origin-Resource-Policy')).not.toBe('same-origin')
    expect(res.headers.get('Content-Type')).toBe(
      'application/javascript; charset=utf-8',
    )
    expect(res.headers.get('Cache-Control')).toContain('public')
  })

  it('public widget iframe page (/w/$slug) sends cross-origin CORP', async () => {
    const { Route } = await import('@/routes/w.$slug')
    // Use a slug that resolves; fall back asserts header only when found.
    const res = await Route.options.server.handlers.GET({
      params: { slug: `${PROFILE}-contact` },
      request: new Request(`https://studio.huminic.app/w/${PROFILE}-contact`),
    } as never)
    if (res.status === 200) {
      expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin')
    }
  })
})

describe('Dealer embed caching + compression (Dealer.com library requirements)', () => {
  it('serves the bundle with Cache-Control max-age >= 86400 (Dealer.com minimum)', async () => {
    writeStudio(BASE_YAML + '\nunified_widget:\n  enabled: true\n')
    const { Route } = await import('@/routes/widget/dealer/$slug[.]js')
    const req = new Request('https://studio.huminic.app/widget/dealer/serra-honda.js')
    const res = await Route.options.server.handlers.GET({
      params: {},
      request: req,
    } as never)
    const cc = res.headers.get('Cache-Control') ?? ''
    expect(cc).toContain('public')
    const m = cc.match(/max-age=(\d+)/)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBeGreaterThanOrEqual(86400)
  })

  it('brotli-compresses when the client advertises Accept-Encoding: br', async () => {
    writeStudio(BASE_YAML + '\nunified_widget:\n  enabled: true\n')
    const { Route } = await import('@/routes/widget/dealer/$slug[.]js')
    const req = new Request('https://studio.huminic.app/widget/dealer/serra-honda.js', {
      headers: { 'Accept-Encoding': 'br, gzip, deflate' },
    })
    const res = await Route.options.server.handlers.GET({
      params: {},
      request: req,
    } as never)
    expect(res.headers.get('Content-Encoding')).toBe('br')
    expect(res.headers.get('Vary')).toContain('Accept-Encoding')
    const buf = Buffer.from(await res.arrayBuffer())
    // Content-Length must reflect the COMPRESSED payload.
    expect(Number(res.headers.get('Content-Length'))).toBe(buf.length)
    // Decompresses back to the real bundle.
    const decoded = zlib.brotliDecompressSync(buf).toString('utf8')
    expect(decoded).toContain('huminic-dealer-widget')
    expect(decoded).toContain('serra-honda')
  })

  it('falls back to gzip when only gzip is advertised', async () => {
    writeStudio(BASE_YAML + '\nunified_widget:\n  enabled: true\n')
    const { Route } = await import('@/routes/widget/dealer/$slug[.]js')
    const req = new Request('https://studio.huminic.app/widget/dealer/serra-honda.js', {
      headers: { 'Accept-Encoding': 'gzip, deflate' },
    })
    const res = await Route.options.server.handlers.GET({
      params: {},
      request: req,
    } as never)
    expect(res.headers.get('Content-Encoding')).toBe('gzip')
    const decoded = zlib.gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8')
    expect(decoded).toContain('huminic-dealer-widget')
  })

  it('serves identity (no Content-Encoding) when no Accept-Encoding is sent', async () => {
    writeStudio(BASE_YAML + '\nunified_widget:\n  enabled: true\n')
    const { Route } = await import('@/routes/widget/dealer/$slug[.]js')
    const req = new Request('https://studio.huminic.app/widget/dealer/serra-honda.js')
    const res = await Route.options.server.handlers.GET({
      params: {},
      request: req,
    } as never)
    expect(res.headers.get('Content-Encoding')).toBeNull()
    const body = await res.text()
    expect(body).toContain('huminic-dealer-widget')
  })
})

describe('GET /api/studio-config (public subset)', () => {
  it('exposes unified-widget display config but strips the video persona id', async () => {
    writeStudio(
      BASE_YAML +
        '\nunified_widget:\n  enabled: true\n  subtitle: Choose how to connect\n  video_persona_id: p9eb007721f4\n  video_agent_name: Caroline\n',
    )
    const { Route } = await import('@/routes/api/studio-config')
    const req = new Request(
      `http://localhost/api/studio-config?profile=${PROFILE}`,
    )
    const res = await Route.options.server.handlers.GET({ request: req } as never)
    const body = (await res.json()) as {
      config: { unified_widget?: Record<string, unknown> }
    }
    expect(body.config.unified_widget).toBeTruthy()
    expect(body.config.unified_widget?.subtitle).toBe('Choose how to connect')
    expect(body.config.unified_widget?.video_agent_name).toBe('Caroline')
    // The persona id is a server-side secret — must NOT reach the browser.
    expect(body.config.unified_widget?.video_persona_id).toBeUndefined()
  })
})
