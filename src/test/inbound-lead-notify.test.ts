import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the dealer-notification send so we assert the WIRING (and the
// notify-only-on-new-lead rule), not an actual broker send.
const notifySpy = vi.fn(async () => ({ ok: true, via: 'mock' as const }))
const notifyActiveSpy = vi.fn(async () => ({ ok: true, via: 'mock' as const }))
vi.mock('@/server/lead-notifications', () => ({
  notifyNewLead: notifySpy,
  notifyActiveConversation: notifyActiveSpy,
}))
// SMS webhook fires the autonomous-reply dispatcher; spy so we can assert it is
// SUPPRESSED on a STOP opt-out.
const autoReplySpy = vi.fn(async () => [])
vi.mock('@/server/agent-autonomous-reply', () => ({
  ensureAutonomousSubscription: vi.fn(() => {}),
  maybeAutonomousReply: (...a: Array<unknown>) => autoReplySpy(...a),
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
  vi.resetModules()
  notifySpy.mockReset()
  notifySpy.mockResolvedValue({ ok: true, via: 'mock' as const })
  notifyActiveSpy.mockReset()
  notifyActiveSpy.mockResolvedValue({ ok: true, via: 'mock' as const })
  autoReplySpy.mockReset()
  autoReplySpy.mockResolvedValue([])
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

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('inbound SMS → lead lands + dealer notified ONCE (new thread only)', () => {
  async function postSms(text: string) {
    const { Route } = await import('@/routes/api/webhooks/textmagic.$profile')
    const handler = Route.options.server.handlers.POST
    const req = new Request(
      'http://localhost/api/webhooks/textmagic/serra-honda',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: '+15555550123',
          receiver: '+15550000000',
          text,
        }),
      },
    )
    return (await (
      await handler({ request: req, params: { profile: PROFILE } } as never)
    ).json()) as {
      ok: boolean
      thread_id: string
      new_lead: boolean
      notified: boolean
      opt_out?: boolean
      opt_in?: boolean
    }
  }

  it('treats inbound STOP as opt-out: blacklists the number and suppresses the AI reply', async () => {
    // Open a conversation first so the STOP arrives on an existing thread.
    await postSms('Is the Accord still available?')
    autoReplySpy.mockClear()

    const stop = await postSms('STOP')
    expect(stop.ok).toBe(true)
    expect(stop.opt_out).toBe(true)
    // The AI must NOT reply after an opt-out.
    expect(autoReplySpy).not.toHaveBeenCalled()

    // The number is now on the per-profile outbound blacklist.
    const { isBlacklisted } = await import('@/server/comms-blacklist')
    expect(isBlacklisted(PROFILE, '+15555550123')).toBe(true)

    // A later START clears the opt-out.
    const start = await postSms('START')
    expect(start.opt_in).toBe(true)
    const { isBlacklisted: isBlacklisted2 } =
      await import('@/server/comms-blacklist')
    expect(isBlacklisted2(PROFILE, '+15555550123')).toBe(false)
  })

  it('notifies on the first SMS and NOT on a follow-up from the same number', async () => {
    const first = await postSms('Is the Accord still available?')
    expect(first.ok).toBe(true)
    expect(first.new_lead).toBe(true)
    expect(notifySpy).toHaveBeenCalledTimes(1)
    const arg = notifySpy.mock.calls[0][0] as {
      profile: string
      channel: string
      phone: string
    }
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
  async function postInbound(
    handle: string,
    displayName: string,
    text: string,
  ) {
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
    const first = await postInbound(
      'pat@example.com',
      'Pat Buyer',
      'Looking for an SUV',
    )
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
    // Return a FRESH Response per call — a single shared Response's body can only
    // be read once, so multi-turn tests that call the handler repeatedly would
    // otherwise trip "Body has already been read" on the second inference call.
    vi.spyOn(global, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Happy to help!' } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
  })
  afterEach(() => {
    delete process.env.API_SERVER_KEY
  })

  // P0-1: the lead now fires ONCE, WITH the visitor's phone, the first turn the
  // phone appears — NOT on the anonymous first message (which produced the empty
  // ADF → duplicate blank VIN leads). An anonymous conversation makes no lead.
  async function postChat(
    sessionId: string,
    ip: string,
    history: Array<{ role: string; content: string }>,
  ) {
    const { Route } = await import('@/routes/api/public/widget-chat')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/public/widget-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': ip },
      body: JSON.stringify({
        profile: PROFILE,
        slug: SLUG,
        session_id: sessionId,
        history,
      }),
    })
    const res = await handler({ request: req } as never)
    return (await res.json()) as { ok: boolean; reply: string }
  }

  it('defers the lead on an anonymous message, then fires ONCE with the phone when the visitor provides it', async () => {
    // Turn 1: anonymous question — captured in the Teambox, but NO lead yet.
    const first = await postChat('visitor-abc', '203.0.113.20', [
      { role: 'user', content: 'Do you have any trucks?' },
    ])
    expect(first).toMatchObject({ ok: true, reply: 'Happy to help!' })
    await flushMicrotasks()

    const { listThreads, getThread } =
      await import('@/server/messaging-hub-store')
    let threads = listThreads({ profile: PROFILE, channel: 'chat' })
    expect(threads.length).toBe(1)
    let thread = getThread(PROFILE, threads[0].id)
    expect(thread?.messages[0].direction).toBe('inbound')
    // No lead on the anonymous turn.
    expect(notifySpy).not.toHaveBeenCalled()
    expect(
      thread?.messages.some((m) => m.content.startsWith('Lead notification')),
    ).toBe(false)

    // Turn 2 (same session): the visitor types their phone → lead fires once,
    // carrying the E.164 phone.
    await postChat('visitor-abc', '203.0.113.20', [
      { role: 'user', content: 'Do you have any trucks?' },
      { role: 'assistant', content: 'Happy to help!' },
      { role: 'user', content: 'call me at 678-492-1396' },
    ])
    await flushMicrotasks()

    expect(notifySpy).toHaveBeenCalledTimes(1)
    const arg = notifySpy.mock.calls[0][0] as {
      profile: string
      channel: string
      phone: string
    }
    expect(arg.profile).toBe(PROFILE)
    expect(arg.channel).toBe('website chat')
    expect(arg.phone).toBe('+16784921396')

    thread = getThread(PROFILE, threads[0].id)
    expect(
      thread?.messages.some(
        (m) => m.role === 'system' && m.content.startsWith('Lead notification'),
      ),
    ).toBe(true)

    // Turn 3: a follow-on on the SAME thread must NOT fire a second lead.
    await postChat('visitor-abc', '203.0.113.20', [
      { role: 'user', content: 'Do you have any trucks?' },
      { role: 'assistant', content: 'Happy to help!' },
      { role: 'user', content: 'call me at 678-492-1396' },
      { role: 'assistant', content: 'Will do!' },
      { role: 'user', content: 'thanks' },
    ])
    await flushMicrotasks()
    expect(notifySpy).toHaveBeenCalledTimes(1)
  })

  it('does not block the visitor reply when lead notification is still pending', async () => {
    let resolveNotify: ((value: { ok: true; via: 'mock' }) => void) | undefined
    notifySpy.mockImplementationOnce(
      () =>
        new Promise<{ ok: true; via: 'mock' }>((resolve) => {
          resolveNotify = resolve
        }),
    )
    const { Route } = await import('@/routes/api/public/widget-chat')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/public/widget-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-real-ip': '203.0.113.21',
      },
      body: JSON.stringify({
        profile: PROFILE,
        slug: SLUG,
        session_id: 'visitor-pending-notify',
        // Phone present so the (mocked, pending) lead notify is triggered.
        history: [{ role: 'user', content: 'text me at 731-394-6907 please' }],
      }),
    })
    const res = await Promise.race([
      handler({ request: req } as never),
      new Promise<Response>((_, reject) =>
        setTimeout(
          () => reject(new Error('widget-chat blocked on notify')),
          50,
        ),
      ),
    ])
    const body = (await res.json()) as { ok: boolean; reply: string }
    expect(body).toMatchObject({ ok: true, reply: 'Happy to help!' })
    expect(notifySpy).toHaveBeenCalledTimes(1)

    const { listThreads, getThread } =
      await import('@/server/messaging-hub-store')
    const threads = listThreads({ profile: PROFILE, channel: 'chat' })
    const thread = getThread(PROFILE, threads[0].id)
    expect(
      thread?.messages.some((m) => m.content.startsWith('Lead notification')),
    ).toBe(false)

    resolveNotify?.({ ok: true, via: 'mock' })
    await flushMicrotasks()
    const updatedThread = getThread(PROFILE, threads[0].id)
    expect(
      updatedThread?.messages.some(
        (m) => m.role === 'system' && m.content.startsWith('Lead notification'),
      ),
    ).toBe(true)
  })
})
