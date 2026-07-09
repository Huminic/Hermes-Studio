import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Serra Honda business hours: America/Chicago 08:00–21:00.
const IN_WINDOW = Date.UTC(2026, 6, 9, 17, 0, 0) // 12:00 CDT
const OUT_WINDOW = Date.UTC(2026, 6, 9, 8, 0, 0) // 03:00 CDT (before open)
const RELEASE_WINDOW = Date.UTC(2026, 6, 9, 14, 0, 0) // 09:00 CDT (open)

let tmpHome: string
const PROFILE = 'sh'

function writeWiki(rel: string, fm: Record<string, string>, body: string): void {
  const front = ['---', ...Object.entries(fm).map(([k, v]) => `${k}: ${v}`), '---'].join('\n')
  const full = path.join(tmpHome, '.hermes', 'profiles', PROFILE, 'company-wiki', rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, `${front}\n\n${body}\n`)
}

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
  fs.mkdirSync(path.join(dir, 'governance', 'agents'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'governance/agents/caroline.md'),
    '---\nname: Caroline\nrole: sales\n---\nCaroline handles sales.\n',
  )
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    [
      'branding:',
      '  persona_name: Serra Honda',
      'autonomous_reply_defaults:',
      '  enabled: true',
      '  max_agent_turns: 5',
      '  channels: [sms]',
      'comms:',
      '  outbound_enabled: true',
      '  business_hours:',
      "    tz: America/Chicago",
      "    start: '08:00'",
      "    end: '21:00'",
      '',
    ].join('\n'),
  )
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
  const bus = await import('@/server/messaging-hub-bus')
  bus._resetMessagingBus()
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

async function setup(opts: { content: string; reply: { ok: true; reply: string; via: 'mock' } | { ok: false; reason: string } }) {
  const store = await import('@/server/messaging-hub-store')
  const ar = await import('@/server/agent-autonomous-reply')
  ar.setAutonomousReplyProvider(async () => opts.reply)
  const thread = store.getOrCreateThread({
    profile: PROFILE,
    domain: 'sales',
    channel: 'sms',
    contact_handle: '+12055551212',
  })
  const inbound = store.appendMessage({
    thread_id: thread.id,
    direction: 'inbound',
    role: 'user',
    channel: 'sms',
    content: opts.content,
    author: 'lead',
  })
  store.subscribeAgentToThread({
    thread_id: thread.id,
    agent_id: 'caroline',
    profile: PROFILE,
    channel: 'sms',
    mode: 'reply',
    rules: {},
    created_at: Date.now(),
  })
  return { store, ar, thread, inbound }
}

describe('Semantic Guardian — hold on unbacked fact-ask', () => {
  it('HOLDS (no send) when the model asserts inventory with no canonical backing', async () => {
    const { store, ar, thread, inbound } = await setup({
      content: 'do you have a 2026 Prologue?',
      reply: { ok: true, reply: 'Yes, we have a 2026 Prologue in stock in mercury silver!', via: 'mock' },
    })
    const results = await ar.maybeAutonomousReply({
      profile: PROFILE, threadId: thread.id, inboundMessageId: inbound.id, now: IN_WINDOW,
    })
    expect(results[0].ok).toBe(false)
    expect((results[0] as { reason: string }).reason).toBe('held:unbacked')
    // No outbound message went out.
    expect(store.getThread(PROFILE, thread.id)?.messages).toHaveLength(1)
    const hold = store.getGuardianHold(PROFILE, inbound.id, 'caroline')
    expect(hold?.reason).toBe('unbacked')
    expect(hold?.status).toBe('held')
    expect(store.findReplyJob(PROFILE, thread.id, inbound.id, 'caroline')?.status).toBe('held')
  })

  it('SENDS when the answer is backed by a canonical, domain-matched node', async () => {
    writeWiki(
      'sales/test-drive.md',
      { id: 'sales.td', canonical_name: 'Test Drive Scheduling', node_type: 'knowledge', domain: 'sales', status: 'canonical', source_of_truth: 'ops', owner: 'ops' },
      '# Test Drive Scheduling\nHow to book a test drive appointment for a customer.',
    )
    const { store, ar, thread, inbound } = await setup({
      content: 'can I book a test drive?',
      reply: { ok: true, reply: 'Absolutely — what day works for your test drive?', via: 'mock' },
    })
    const results = await ar.maybeAutonomousReply({
      profile: PROFILE, threadId: thread.id, inboundMessageId: inbound.id, now: IN_WINDOW,
    })
    expect(results[0].ok).toBe(true)
    expect(store.getThread(PROFILE, thread.id)?.messages).toHaveLength(2)
    expect(store.getGuardianHold(PROFILE, inbound.id, 'caroline')).toBeNull()
  })
})

describe('Text-gate — out-of-window queue-and-release, exactly once', () => {
  it('DEFERS outside the window, then releases once at window open (and never twice)', async () => {
    const { store, ar, thread, inbound } = await setup({
      content: 'still interested, when can I come by?',
      reply: { ok: true, reply: 'Great! When are you free to stop in?', via: 'mock' },
    })
    // 03:00 CT — before the window opens.
    const deferred = await ar.maybeAutonomousReply({
      profile: PROFILE, threadId: thread.id, inboundMessageId: inbound.id, now: OUT_WINDOW,
    })
    expect((deferred[0] as { reason: string }).reason).toBe('deferred:outside-window')
    expect(store.getThread(PROFILE, thread.id)?.messages).toHaveLength(1) // not sent
    const hold = store.getGuardianHold(PROFILE, inbound.id, 'caroline')
    expect(hold?.reason).toBe('outside-window')
    expect(hold?.pending_reply).toContain('stop in')

    const sched = await import('@/server/comms-scheduler')
    // 09:00 CT — window open → release exactly one.
    const r1 = await sched.tickReplyHolds({ profile: PROFILE, now: RELEASE_WINDOW })
    expect(r1.released).toBe(1)
    expect(store.getThread(PROFILE, thread.id)?.messages).toHaveLength(2)
    expect(store.getGuardianHold(PROFILE, inbound.id, 'caroline')?.status).toBe('released')

    // Second tick → no double-send.
    const r2 = await sched.tickReplyHolds({ profile: PROFILE, now: RELEASE_WINDOW + 60_000 })
    expect(r2.released).toBe(0)
    expect(store.getThread(PROFILE, thread.id)?.messages).toHaveLength(2)
  })

  it('does NOT release an outside-window hold while still closed', async () => {
    const { store, ar, thread, inbound } = await setup({
      content: 'hello?', reply: { ok: true, reply: 'Hi! When can you come in?', via: 'mock' },
    })
    await ar.maybeAutonomousReply({ profile: PROFILE, threadId: thread.id, inboundMessageId: inbound.id, now: OUT_WINDOW })
    const sched = await import('@/server/comms-scheduler')
    const r = await sched.tickReplyHolds({ profile: PROFILE, now: OUT_WINDOW + 60_000 }) // still 03:01 CT
    expect(r.released).toBe(0)
    expect(store.getThread(PROFILE, thread.id)?.messages).toHaveLength(1)
  })
})

describe('Idempotency — duplicate inbound / opt-out / human takeover', () => {
  it('a duplicate inbound does not enqueue a second job or double-send', async () => {
    const { store, ar, thread, inbound } = await setup({
      content: 'hey', reply: { ok: true, reply: 'Hi there! How can I help?', via: 'mock' },
    })
    await ar.maybeAutonomousReply({ profile: PROFILE, threadId: thread.id, inboundMessageId: inbound.id, now: IN_WINDOW })
    const again = await ar.maybeAutonomousReply({ profile: PROFILE, threadId: thread.id, inboundMessageId: inbound.id, now: IN_WINDOW })
    expect((again[0] as { reason: string }).reason).toMatch(/^duplicate-skip:/)
    expect(store.getThread(PROFILE, thread.id)?.messages).toHaveLength(2) // 1 inbound + 1 outbound
  })

  it('opt-out (STOP) before release cancels the hold — never sends', async () => {
    const { store, ar, thread, inbound } = await setup({
      content: 'maybe later', reply: { ok: true, reply: 'No problem — when works?', via: 'mock' },
    })
    await ar.maybeAutonomousReply({ profile: PROFILE, threadId: thread.id, inboundMessageId: inbound.id, now: OUT_WINDOW })
    const bl = await import('@/server/comms-blacklist')
    bl.addToBlacklist(PROFILE, thread.contact_handle, 'STOP')
    const sched = await import('@/server/comms-scheduler')
    const r = await sched.tickReplyHolds({ profile: PROFILE, now: RELEASE_WINDOW })
    expect(r.released).toBe(0)
    expect(store.getThread(PROFILE, thread.id)?.messages).toHaveLength(1)
    expect(store.getGuardianHold(PROFILE, inbound.id, 'caroline')?.status).toBe('cancelled')
  })

  it('human takeover before release cancels the hold — never sends', async () => {
    const { store, ar, thread, inbound } = await setup({
      content: 'anyone there?', reply: { ok: true, reply: 'Yes! When can you visit?', via: 'mock' },
    })
    await ar.maybeAutonomousReply({ profile: PROFILE, threadId: thread.id, inboundMessageId: inbound.id, now: OUT_WINDOW })
    const takeover = await import('@/server/thread-takeover')
    takeover.assignThreadToHuman(PROFILE, thread.id, 'rep@dealer')
    const sched = await import('@/server/comms-scheduler')
    const r = await sched.tickReplyHolds({ profile: PROFILE, now: RELEASE_WINDOW })
    expect(r.released).toBe(0)
    expect(store.getThread(PROFILE, thread.id)?.messages).toHaveLength(1)
    expect(store.getGuardianHold(PROFILE, inbound.id, 'caroline')?.status).toBe('cancelled')
  })
})

describe('Store — hold dedup + release-exactly-once', () => {
  it('createGuardianHold is idempotent on (profile,message_id,agent_id)', async () => {
    const store = await import('@/server/messaging-hub-store')
    const a = store.createGuardianHold({ profile: PROFILE, thread_id: 't1', message_id: 'm1', agent_id: 'caroline', channel: 'sms', reason: 'unbacked', now: 1 })
    const b = store.createGuardianHold({ profile: PROFILE, thread_id: 't1', message_id: 'm1', agent_id: 'caroline', channel: 'sms', reason: 'unbacked', now: 2 })
    expect(a.created).toBe(true)
    expect(b.created).toBe(false)
    expect(a.hold.id).toBe(b.hold.id)
  })

  it('claimHoldForRelease succeeds once, then fails (release-exactly-once)', async () => {
    const store = await import('@/server/messaging-hub-store')
    const { hold } = store.createGuardianHold({ profile: PROFILE, thread_id: 't2', message_id: 'm2', agent_id: 'caroline', channel: 'sms', reason: 'outside-window', pending_reply: 'hi', now: 1 })
    expect(store.claimHoldForRelease(PROFILE, hold.id)).toBe(true)
    expect(store.claimHoldForRelease(PROFILE, hold.id)).toBe(false)
  })

  it('enqueued_at is stamped on the reply job', async () => {
    const store = await import('@/server/messaging-hub-store')
    const job = store.enqueueAgentReplyJob({ thread_id: 't3', message_id: 'm3', agent_id: 'caroline', channel: 'sms', profile: PROFILE, now: 12345 })
    expect(store.getReplyJobById(PROFILE, job.id)?.enqueued_at).toBe(12345)
  })
})

describe('Crash recovery — hold stuck in releasing', () => {
  it('finalizes a stale releasing hold whose job already sent (no double-send)', async () => {
    const store = await import('@/server/messaging-hub-store')
    const job = store.enqueueAgentReplyJob({ thread_id: 't4', message_id: 'm4', agent_id: 'caroline', channel: 'sms', profile: PROFILE, now: 0 })
    store.updateReplyJob(PROFILE, job.id, { status: 'sent', sent_at: 1 })
    const { hold } = store.createGuardianHold({ profile: PROFILE, thread_id: 't4', message_id: 'm4', agent_id: 'caroline', channel: 'sms', reason: 'outside-window', pending_reply: 'hi', reply_job_id: job.id, now: 0 })
    store.claimHoldForRelease(PROFILE, hold.id) // held → releasing (crash before mark)
    const sched = await import('@/server/comms-scheduler')
    await sched.tickReplyHolds({ profile: PROFILE, now: 5 * 60_000 }) // > staleness
    expect(store.getGuardianHold(PROFILE, 'm4', 'caroline')?.status).toBe('released')
  })

  it('re-opens a stale releasing hold whose job did not send', async () => {
    const store = await import('@/server/messaging-hub-store')
    const job = store.enqueueAgentReplyJob({ thread_id: 't5', message_id: 'm5', agent_id: 'caroline', channel: 'sms', profile: PROFILE, now: 0 })
    store.updateReplyJob(PROFILE, job.id, { status: 'deferred' })
    const { hold } = store.createGuardianHold({ profile: PROFILE, thread_id: 't5', message_id: 'm5', agent_id: 'caroline', channel: 'sms', reason: 'outside-window', pending_reply: 'hi', reply_job_id: job.id, now: 0 })
    store.claimHoldForRelease(PROFILE, hold.id)
    const sched = await import('@/server/comms-scheduler')
    // Thread t5 does not exist as a real thread → releaseHeldReply will cancel it
    // after re-open; assert it is no longer stuck in 'releasing'.
    await sched.tickReplyHolds({ profile: PROFILE, now: 5 * 60_000 })
    expect(store.getGuardianHold(PROFILE, 'm5', 'caroline')?.status).not.toBe('releasing')
  })
})
