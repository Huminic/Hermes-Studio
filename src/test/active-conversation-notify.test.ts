/**
 * Slice H — active-conversation human-takeover alert.
 *
 * Coverage:
 *   (a) flag default OFF → no notify (no resend send)
 *   (b) flag ON → EMAIL-format alert to the routing recipients with a takeover
 *       link, NEVER ADF — even for an adf-xml profile (Serra)
 *   (c) takeover token validates + assignThreadToHuman called; bad/absent token
 *       rejected (403, no assign)
 *   (d) dedupe — only the FIRST follow-on fires; the second is suppressed
 *
 * The Resend send path is mocked (globalThis.fetch); no real sends.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
let originalFetch: typeof fetch

function writeStudioYaml(profile: string, lines: Array<string>) {
  const dir = path.join(tmpHome, '.hermes', 'profiles', profile)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'studio.yaml'), lines.join('\n') + '\n')
}

function lastResendArgs(fetchMock: ReturnType<typeof vi.fn>) {
  const calls = fetchMock.mock.calls
  const last = calls[calls.length - 1]
  const body = JSON.parse((last[1] as { body: string }).body)
  return body.params.arguments as {
    to: string
    from: string
    subject: string
    html: string
    text: string
    attachments?: Array<{ filename: string; content: string }>
  }
}

beforeEach(() => {
  vi.resetModules()
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'active-convo-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  originalFetch = globalThis.fetch
  globalThis.fetch = vi.fn(async () => {
    return new Response(
      `event: message\ndata: {"result":{"content":[{"text":"{\\"id\\":\\"resend_mock_id\\"}"}]}}\n\n`,
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    )
  }) as typeof fetch
  process.env.CENTRAL_MCP_TOKEN = 'mock-token'
  process.env.TAKEOVER_TOKEN_SECRET = 'test-takeover-secret'
})

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = originalFetch
  delete process.env.CENTRAL_MCP_TOKEN
  delete process.env.TAKEOVER_TOKEN_SECRET
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('notifyActiveConversation — flag default OFF', () => {
  it('does NOT send when active_conversation_alert is absent (defaults false)', async () => {
    writeStudioYaml('ford-of-columbia', [
      'branding:',
      '  persona_name: Ford of Columbia',
      'notifications:',
      '  lead_format: email',
      '  lead_recipient: leads@columbiaford.example.com',
    ])
    const { notifyActiveConversation } = await import('@/server/lead-notifications')
    const result = await notifyActiveConversation({
      profile: 'ford-of-columbia',
      threadId: 'thread-off-1',
      channel: 'sms',
      who: '+15555550100',
      message: 'still there?',
    })
    expect(result.ok).toBe(false)
    expect(result.via).toBe('unconfigured')
    expect(result.reason).toContain('disabled')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('does NOT send when active_conversation_alert is explicitly false', async () => {
    writeStudioYaml('ford-of-columbia', [
      'branding:',
      '  persona_name: Ford of Columbia',
      'notifications:',
      '  lead_recipient: leads@columbiaford.example.com',
      '  active_conversation_alert: false',
    ])
    const { notifyActiveConversation } = await import('@/server/lead-notifications')
    const result = await notifyActiveConversation({
      profile: 'ford-of-columbia',
      threadId: 'thread-off-2',
      channel: 'sms',
    })
    expect(result.ok).toBe(false)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

describe('notifyActiveConversation — flag ON', () => {
  it('sends an EMAIL-format alert with a takeover link to routing recipients', async () => {
    const store = await import('@/server/messaging-hub-store')
    store._resetForTests()
    writeStudioYaml('hyundai-of-columbia', [
      'branding:',
      '  persona_name: Hyundai of Columbia',
      'notifications:',
      '  lead_format: email',
      '  active_conversation_alert: true',
      '  routing:',
      '    - event: all',
      '      to: bdc@hyundai.example.com',
      '      channel: email',
    ])
    const { notifyActiveConversation } = await import('@/server/lead-notifications')
    const result = await notifyActiveConversation({
      profile: 'hyundai-of-columbia',
      threadId: 'thread-on-1',
      channel: 'sms',
      who: '+15555551234',
      message: 'is the Tucson still available?',
    })
    expect(result.ok).toBe(true)
    expect(result.format).toBe('email')
    const args = lastResendArgs(globalThis.fetch as ReturnType<typeof vi.fn>)
    expect(args.to).toBe('bdc@hyundai.example.com')
    expect(args.subject).toBe('AI conversation active — +15555551234')
    // Takeover button present (link to /api/teambox/takeover with a token).
    expect(args.html).toContain('/api/teambox/takeover?token=')
    expect(args.html).toContain('Stop the AI conversation, and I will take it over from here.')
    // No ADF attachment, ever.
    expect(args.attachments).toBeUndefined()
    expect(args.text).toContain('is the Tucson still available?')
  })

  it('uses EMAIL format with NO ADF even for an adf-xml profile (Serra)', async () => {
    const store = await import('@/server/messaging-hub-store')
    store._resetForTests()
    writeStudioYaml('serra-honda', [
      'branding:',
      '  persona_name: Serra Honda',
      'notifications:',
      '  lead_format: adf-xml',
      '  lead_recipient: leads@serra.example.com',
      '  active_conversation_alert: true',
    ])
    const { notifyActiveConversation } = await import('@/server/lead-notifications')
    const { isAdfXml } = await import('@/server/adf-xml')
    const result = await notifyActiveConversation({
      profile: 'serra-honda',
      threadId: 'thread-serra-1',
      channel: 'sms',
      who: '+15555559999',
      message: 'following up',
    })
    expect(result.ok).toBe(true)
    expect(result.format).toBe('email')
    const args = lastResendArgs(globalThis.fetch as ReturnType<typeof vi.fn>)
    // Falls back to lead_recipient when no routing email matches.
    expect(args.to).toBe('leads@serra.example.com')
    // NOT ADF — the body is the styled email, never ADF XML, no .adf.xml attach.
    expect(isAdfXml(args.text)).toBe(false)
    expect(args.attachments).toBeUndefined()
    expect(args.html).toContain('/api/teambox/takeover?token=')
  })
})

describe('notifyActiveConversation — dedupe (once per thread)', () => {
  it('only the FIRST follow-on fires; the second is suppressed', async () => {
    const store = await import('@/server/messaging-hub-store')
    store._resetForTests()
    writeStudioYaml('hyundai-of-columbia', [
      'branding:',
      '  persona_name: Hyundai of Columbia',
      'notifications:',
      '  lead_recipient: bdc@hyundai.example.com',
      '  active_conversation_alert: true',
    ])
    const { notifyActiveConversation } = await import('@/server/lead-notifications')
    const first = await notifyActiveConversation({
      profile: 'hyundai-of-columbia',
      threadId: 'dedupe-thread',
      channel: 'sms',
      who: '+1555',
      message: 'one',
    })
    expect(first.ok).toBe(true)
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    const callsAfterFirst = fetchMock.mock.calls.length
    const second = await notifyActiveConversation({
      profile: 'hyundai-of-columbia',
      threadId: 'dedupe-thread',
      channel: 'sms',
      who: '+1555',
      message: 'two',
    })
    expect(second.ok).toBe(false)
    expect(second.via).toBe('cooldown')
    // No additional send fired for the second follow-on.
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst)
  })
})

describe('takeover token — mint / verify', () => {
  it('round-trips and binds profile+threadId', async () => {
    const { mintTakeoverToken, verifyTakeoverToken } = await import(
      '@/server/lead-notifications'
    )
    const tok = mintTakeoverToken('serra-honda', 'thread-xyz')
    expect(tok).toBeTruthy()
    const v = verifyTakeoverToken(tok as string)
    expect(v).toEqual({ profile: 'serra-honda', threadId: 'thread-xyz' })
    // expectedProfile mismatch is rejected.
    expect(verifyTakeoverToken(tok as string, { expectedProfile: 'other' })).toBeNull()
  })

  it('rejects a tampered or malformed token', async () => {
    const { mintTakeoverToken, verifyTakeoverToken } = await import(
      '@/server/lead-notifications'
    )
    const tok = mintTakeoverToken('p', 't') as string
    // Flip the last char of the signature.
    const tampered = tok.slice(0, -1) + (tok.endsWith('A') ? 'B' : 'A')
    expect(verifyTakeoverToken(tampered)).toBeNull()
    expect(verifyTakeoverToken('not-a-token')).toBeNull()
    expect(verifyTakeoverToken('')).toBeNull()
  })

  it('returns null when no signing secret is configured', async () => {
    delete process.env.TAKEOVER_TOKEN_SECRET
    delete process.env.API_SERVER_KEY
    vi.resetModules()
    const { mintTakeoverToken } = await import('@/server/lead-notifications')
    expect(mintTakeoverToken('p', 't')).toBeNull()
  })
})

describe('GET /api/teambox/takeover endpoint', () => {
  it('valid token → assigns thread to human (AI halts) → 200 confirmation', async () => {
    const { mintTakeoverToken } = await import('@/server/lead-notifications')
    const takeover = await import('@/server/thread-takeover')
    const tok = mintTakeoverToken('serra-honda', 'thread-takeover-1') as string

    const { Route } = await import('@/routes/api/teambox/takeover')
    const handler = Route.options.server.handlers.GET
    const req = new Request(
      `http://localhost/api/teambox/takeover?token=${encodeURIComponent(tok)}`,
    )
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('taken over')
    // The AI-halt: isHumanAssigned now true for that profile+thread.
    expect(takeover.isHumanAssigned('serra-honda', 'thread-takeover-1')).toBe(true)
  })

  it('bad token → 403 and does NOT assign', async () => {
    const takeover = await import('@/server/thread-takeover')
    const { Route } = await import('@/routes/api/teambox/takeover')
    const handler = Route.options.server.handlers.GET
    const req = new Request('http://localhost/api/teambox/takeover?token=bogus.signature')
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(403)
    expect(takeover.isHumanAssigned('serra-honda', 'never-assigned-thread')).toBe(false)
  })

  it('absent token → 403', async () => {
    const { Route } = await import('@/routes/api/teambox/takeover')
    const handler = Route.options.server.handlers.GET
    const req = new Request('http://localhost/api/teambox/takeover')
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(403)
  })
})
