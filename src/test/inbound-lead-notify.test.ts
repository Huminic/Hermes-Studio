import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the dealer-notification send so we assert the WIRING (and the
// notify-only-on-new-lead rule), not an actual broker send.
const notifySpy = vi.fn(async () => ({ ok: true, via: 'mock' as const }))
vi.mock('@/server/lead-notifications', () => ({ notifyNewLead: notifySpy }))
// SMS webhook fires the autonomous-reply dispatcher; stub it to a no-op.
vi.mock('@/server/agent-autonomous-reply', () => ({
  maybeAutonomousReply: vi.fn(async () => []),
}))

let tmpHome: string
const PROFILE = 'serra-honda'
const SLUG = 'serra-honda-chat'

function writeProfile(): void {
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
  fs.mkdirSync(path.join(dir, 'knowledge', 'widgets'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    [
      'branding:',
      '  persona_name: Serra Honda',
      'notifications:',
      '  lead_format: adf-xml',
      '  lead_recipient: bdc@serrahonda.example',
      'widgets:',
      '  - slug: serra-honda-chat',
      '    mode: chat',
      '    agent: caroline',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(dir, 'knowledge', 'widgets', `${SLUG}.md`),
    '---\nslug: serra-honda-chat\nmode: chat\nagent: caroline\ndomain: sales\ntitle: Chat with Serra Honda\ntype: widget\nstatus: published\n---\nAsk us anything.',
  )
}

beforeEach(async () => {
  notifySpy.mockClear()
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'inbound-notify-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  writeProfile()
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('inbound SMS → lead lands + dealer notified ONCE (new thread only)', () => {
  async function postSms(text: string) {
    const { Route } = await import('@/routes/api/webhooks/textmagic.$profile')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/webhooks/textmagic/serra-honda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: '+15555550123', receiver: '+15550000000', text }),
    })
    return (await (await handler({ request: req, params: { profile: PROFILE } } as never)).json()) as {
      ok: boolean
      thread_id: string
      new_lead: boolean
      notified: boolean
    }
  }

  it('notifies on the first SMS and NOT on a follow-up from the same number', async () => {
    const first = await postSms('Is the Accord still available?')
    expect(first.ok).toBe(true)
    expect(first.new_lead).toBe(true)
    expect(notifySpy).toHaveBeenCalledTimes(1)
    const arg = notifySpy.mock.calls[0][0] as { profile: string; channel: string; phone: string }
    expect(arg.profile).toBe(PROFILE)
    expect(arg.channel).toBe('SMS')
    expect(arg.phone).toBe('+15555550123')

    const second = await postSms('Still there?')
    expect(second.ok).toBe(true)
    expect(second.new_lead).toBe(false)
    // No second notification — same open thread, ongoing conversation.
    expect(notifySpy).toHaveBeenCalledTimes(1)

    // Both messages landed on ONE thread.
    expect(second.thread_id).toBe(first.thread_id)
    const { getThread } = await import('@/server/messaging-hub-store')
    const thread = getThread(PROFILE, first.thread_id)
    // SMS #1 inbound + Slice-A delivery annotation + SMS #2 follow-up inbound.
    expect(thread?.messages.length).toBe(3)
    expect(
      thread?.messages.some(
        (m) => m.role === 'system' && m.content.startsWith('Lead notification'),
      ),
    ).toBe(true)
  })
})

describe('generic /api/messaging/inbound → dealer notified on new lead only', () => {
  async function postInbound(handle: string, displayName: string, text: string) {
    const { Route } = await import('@/routes/api/messaging/inbound')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/messaging/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: PROFILE,
        channel: 'chat',
        domain: 'sales',
        contact_handle: handle,
        contact_identifiers: { email: handle },
        display_name: displayName,
        body: text,
      }),
    })
    return (await (await handler({ request: req } as never)).json()) as {
      ok: boolean
      thread_id: string
    }
  }

  it('notifies once with the lead name+email, not on a follow-up', async () => {
    const first = await postInbound('pat@example.com', 'Pat Buyer', 'Looking for an SUV')
    expect(first.ok).toBe(true)
    expect(notifySpy).toHaveBeenCalledTimes(1)
    const arg = notifySpy.mock.calls[0][0] as {
      profile: string
      channel: string
      name: string
      email: string
    }
    expect(arg.profile).toBe(PROFILE)
    expect(arg.channel).toBe('chat')
    expect(arg.name).toBe('Pat Buyer')
    expect(arg.email).toBe('pat@example.com')

    await postInbound('pat@example.com', 'Pat Buyer', 'Any update?')
    expect(notifySpy).toHaveBeenCalledTimes(1) // same thread, no re-notify
  })
})

describe('public widget-chat → conversation captured in Teambox + dealer alerted', () => {
  beforeEach(() => {
    process.env.API_SERVER_KEY = 'test-hermes-key'
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'Happy to help!' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
  })
  afterEach(() => {
    delete process.env.API_SERVER_KEY
  })

  it('persists the visitor message + agent reply and fires notifyNewLead once', async () => {
    const { Route } = await import('@/routes/api/public/widget-chat')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/public/widget-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: PROFILE,
        slug: SLUG,
        session_id: 'visitor-abc',
        history: [{ role: 'user', content: 'Do you have any trucks?' }],
      }),
    })
    const res = await handler({ request: req } as never)
    const body = (await res.json()) as { ok: boolean; reply: string }
    expect(body.ok).toBe(true)
    expect(body.reply).toBe('Happy to help!')

    // Conversation landed in the Teambox on a chat thread.
    const { listThreads, getThread } = await import('@/server/messaging-hub-store')
    const threads = listThreads({ profile: PROFILE, channel: 'chat' })
    expect(threads.length).toBe(1)
    const thread = getThread(PROFILE, threads[0].id)
    // visitor inbound + agent outbound + Slice-A delivery annotation.
    expect(thread?.messages.length).toBe(3)
    expect(thread?.messages[0].direction).toBe('inbound')
    expect(
      thread?.messages.some(
        (m) => m.direction === 'outbound' && m.content === 'Happy to help!',
      ),
    ).toBe(true)
    expect(
      thread?.messages.some(
        (m) => m.role === 'system' && m.content.startsWith('Lead notification'),
      ),
    ).toBe(true)

    // Dealer alerted exactly once on the first message of the session.
    expect(notifySpy).toHaveBeenCalledTimes(1)
    const arg = notifySpy.mock.calls[0][0] as { profile: string; channel: string }
    expect(arg.profile).toBe(PROFILE)
    expect(arg.channel).toBe('website chat')
  })
})
