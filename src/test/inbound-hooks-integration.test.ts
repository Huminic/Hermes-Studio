/**
 * Inbound-hooks integration test — the "test copies of hooks/integrations"
 * proof. Drives the REAL /api/messaging/inbound route handler end-to-end so
 * the full customer path is exercised: inbound webhook → thread → 2-way
 * autonomous reply → CommGate → outbound adapter. The LLM provider and the
 * outbound channel are mocked/gated so NO real recipient is ever contacted.
 *
 * Covers:
 *   1. Full inbound → 2-way reply → outbound round-trip (chat).
 *   2. CommGate intercepts a regulated outbound (kill switch off) inside the
 *      hook — reply is produced but the send is blocked, never reaching a
 *      provider.
 *   3. Human-takeover pause through the hook (assignedTo → AI stays silent).
 *   4. ADF lead-email ingestion through the hook (channel email-adf + parsed
 *      lead_meta) — the sales lead intake path.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
let savedOutbound: string | undefined
let savedPassword: string | undefined

const ADF_LEAD = `<?xml version="1.0"?>
<adf>
  <prospect>
    <requestdate>2026-06-03T12:00:00-05:00</requestdate>
    <vehicle interest="buy" status="new">
      <year>2026</year><make>Honda</make><model>Accord</model>
    </vehicle>
    <customer>
      <contact>
        <name part="first">Pat</name>
        <name part="last">Buyer</name>
        <email>pat@example.com</email>
        <phone>+15555550123</phone>
      </contact>
      <comments>What's your best price?</comments>
    </customer>
    <vendor><vendorname>AutoTrader</vendorname></vendor>
  </prospect>
</adf>`

function inboundRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/messaging/inbound', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function postInbound(body: Record<string, unknown>) {
  const { Route } = await import('@/routes/api/messaging/inbound')
  const handler = Route.options.server.handlers.POST
  const res = await handler({ request: inboundRequest(body) } as never)
  return (await res.json()) as {
    ok: boolean
    thread_id: string
    channel: string
    lead_meta: unknown
    autonomous_replies: Array<{ ok: boolean; reply?: string; reason?: string }>
  }
}

beforeEach(async () => {
  savedOutbound = process.env.OUTBOUND_LIVE_ENABLED
  savedPassword = process.env.HERMES_PASSWORD
  delete process.env.HERMES_PASSWORD // dev-mode inbound auth (no token configured)
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'inbound-hooks-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', 'serra-honda')
  fs.mkdirSync(path.join(dir, 'governance', 'agents'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'governance/agents/caroline.md'),
    '---\nname: Caroline\n---\nCaroline handles inbound leads.\n',
  )
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    [
      'branding:',
      '  persona_name: Serra Honda',
      // All-day window: this suite exercises the CommGate/kill-switch path, which
      // requires the reply to REACH the gate. Without this, the text-gate would
      // (correctly) defer any regulated reply generated outside business hours,
      // making the gate assertions wall-clock-dependent. Text-gate deferral has
      // its own dedicated coverage in guardian-text-gate.test.ts.
      'comms:',
      '  business_hours:',
      '    tz: America/Chicago',
      "    start: '00:00'",
      "    end: '23:59'",
      '',
    ].join('\n'),
  )
  const store = await import('@/server/messaging-hub-store')
  store._resetForTests()
  const bus = await import('@/server/messaging-hub-bus')
  bus._resetMessagingBus()
  const ar = await import('@/server/agent-autonomous-reply')
  ar.setAutonomousReplyProvider(async () => ({
    ok: true,
    reply: 'Thanks for reaching out — happy to help!',
    via: 'mock-provider',
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
  if (savedOutbound === undefined) delete process.env.OUTBOUND_LIVE_ENABLED
  else process.env.OUTBOUND_LIVE_ENABLED = savedOutbound
  if (savedPassword === undefined) delete process.env.HERMES_PASSWORD
  else process.env.HERMES_PASSWORD = savedPassword
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('inbound hook → 2-way reply → outbound (integration)', () => {
  it('round-trips a chat conversation: create thread, subscribe, auto-reply outbound', async () => {
    const { subscribeAgentToThread, getThread } = await import(
      '@/server/messaging-hub-store'
    )
    // First inbound creates the thread (no subscription yet → no reply).
    const first = await postInbound({
      profile: 'serra-honda',
      channel: 'chat',
      domain: 'sales',
      contact_handle: 'visitor-1',
      body: 'Hi, do you have the Accord in stock?',
    })
    expect(first.ok).toBe(true)
    expect(first.autonomous_replies).toHaveLength(0)

    // Subscribe Caroline in reply mode, then a second inbound triggers the reply.
    subscribeAgentToThread({
      thread_id: first.thread_id,
      agent_id: 'caroline',
      profile: 'serra-honda',
      channel: 'chat',
      mode: 'reply',
      rules: {},
      created_at: Date.now(),
    })
    const second = await postInbound({
      profile: 'serra-honda',
      channel: 'chat',
      domain: 'sales',
      contact_handle: 'visitor-1',
      body: 'Still there?',
    })
    expect(second.thread_id).toBe(first.thread_id)
    expect(second.autonomous_replies).toHaveLength(1)
    expect(second.autonomous_replies[0].ok).toBe(true)

    const thread = getThread('serra-honda', first.thread_id)
    const outbound = thread?.messages.filter((m) => m.direction === 'outbound')
    expect(outbound).toHaveLength(1)
    expect(outbound?.[0].author).toBe('caroline')
    expect(outbound?.[0].metadata.adapter_status).toBe('simulated')
  })

  it('CommGate blocks a regulated (sms) outbound inside the hook when the kill switch is off', async () => {
    delete process.env.OUTBOUND_LIVE_ENABLED // global kill switch engaged
    const { subscribeAgentToThread, getThread } = await import(
      '@/server/messaging-hub-store'
    )
    const first = await postInbound({
      profile: 'serra-honda',
      channel: 'sms',
      domain: 'sales',
      contact_handle: '+15555550100',
      body: 'text me pricing',
    })
    subscribeAgentToThread({
      thread_id: first.thread_id,
      agent_id: 'caroline',
      profile: 'serra-honda',
      channel: 'sms',
      mode: 'reply',
      rules: {},
      created_at: Date.now(),
    })
    await postInbound({
      profile: 'serra-honda',
      channel: 'sms',
      domain: 'sales',
      contact_handle: '+15555550100',
      body: 'you there?',
    })
    const thread = getThread('serra-honda', first.thread_id)
    const outbound = thread?.messages.find((m) => m.direction === 'outbound')
    // The reply was generated, but the send was gated — never hit a provider.
    expect(outbound).toBeTruthy()
    expect(outbound?.metadata.adapter_status).toBe('blocked')
  })

  it('pauses the AI when a human has taken over the thread', async () => {
    const { subscribeAgentToThread, getThread } = await import(
      '@/server/messaging-hub-store'
    )
    const { assignThreadToHuman } = await import('@/server/thread-takeover')
    const first = await postInbound({
      profile: 'serra-honda',
      channel: 'chat',
      domain: 'service',
      contact_handle: 'owner-9',
      body: 'my car is making a noise',
    })
    subscribeAgentToThread({
      thread_id: first.thread_id,
      agent_id: 'caroline',
      profile: 'serra-honda',
      channel: 'chat',
      mode: 'reply',
      rules: {},
      created_at: Date.now(),
    })
    // A human service advisor claims the thread.
    assignThreadToHuman('serra-honda', first.thread_id, 'advisor:dana')
    const second = await postInbound({
      profile: 'serra-honda',
      channel: 'chat',
      domain: 'service',
      contact_handle: 'owner-9',
      body: 'hello?',
    })
    expect(second.autonomous_replies).toHaveLength(0)
    const thread = getThread('serra-honda', first.thread_id)
    expect(thread?.messages.some((m) => m.direction === 'outbound')).toBe(false)
  })

  it('ingests an ADF lead email through the hook (channel email-adf + parsed lead_meta)', async () => {
    const res = await postInbound({
      profile: 'serra-honda',
      channel: 'email',
      domain: 'sales',
      contact_handle: 'pat@example.com',
      body: ADF_LEAD,
    })
    expect(res.ok).toBe(true)
    expect(res.channel).toBe('email-adf')
    expect(res.lead_meta).toBeTruthy()
    const meta = res.lead_meta as { customer?: { name?: string } }
    expect(JSON.stringify(meta)).toMatch(/Pat/)
  })
})
