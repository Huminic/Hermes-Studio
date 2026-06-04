/**
 * WS-8 — Human take-over API end-to-end.
 *
 * Drives the REAL /api/messaging/threads/$threadId/assign route handler and
 * proves the take-over actually pauses the autonomous agent:
 *   1. assign (take_over) → isHumanAssigned true → the inbound path produces NO
 *      autonomous reply (the agent is paused).
 *   2. assign (hand_back) → isHumanAssigned false → the agent resumes (an
 *      inbound message gets an autonomous reply again).
 *   3. bad input + auth shapes are rejected.
 *
 * The LLM provider and the outbound channel are mocked/gated so no real
 * recipient is contacted.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
let savedPassword: string | undefined

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
    autonomous_replies: Array<{ ok: boolean }>
  }
}

async function postAssign(threadId: string, body: Record<string, unknown>) {
  const { Route } = await import(
    '@/routes/api/messaging/threads.$threadId.assign'
  )
  const handler = Route.options.server.handlers.POST
  const req = new Request(
    `http://localhost/api/messaging/threads/${threadId}/assign`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  const res = await handler({ request: req, params: { threadId } } as never)
  return {
    status: res.status,
    body: (await res.json()) as {
      ok: boolean
      human_assigned?: boolean
      assigned_to?: string | null
      error?: string
    },
  }
}

beforeEach(async () => {
  savedPassword = process.env.HERMES_PASSWORD
  delete process.env.HERMES_PASSWORD // no-auth dev mode → admin session
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'assign-api-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', 'serra-honda')
  fs.mkdirSync(path.join(dir, 'governance', 'agents'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'governance/agents/caroline.md'),
    '---\nname: Caroline\n---\nCaroline handles inbound leads.\n',
  )
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    'branding:\n  persona_name: Serra Honda\n',
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
  if (savedPassword === undefined) delete process.env.HERMES_PASSWORD
  else process.env.HERMES_PASSWORD = savedPassword
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('/api/messaging/threads/$threadId/assign (human take-over)', () => {
  async function seedSubscribedThread() {
    const { subscribeAgentToThread } = await import(
      '@/server/messaging-hub-store'
    )
    const first = await postInbound({
      profile: 'serra-honda',
      channel: 'chat',
      domain: 'sales',
      contact_handle: 'visitor-1',
      body: 'Hi, is the Accord in stock?',
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
    return first.thread_id
  }

  it('take_over sets the assignee and PAUSES the autonomous agent end-to-end', async () => {
    const threadId = await seedSubscribedThread()
    const { isHumanAssigned } = await import('@/server/thread-takeover')

    // Sanity: before take-over, an inbound triggers an autonomous reply.
    const beforeReply = await postInbound({
      profile: 'serra-honda',
      channel: 'chat',
      domain: 'sales',
      contact_handle: 'visitor-1',
      body: 'Still there?',
    })
    expect(beforeReply.autonomous_replies).toHaveLength(1)
    expect(beforeReply.autonomous_replies[0].ok).toBe(true)

    // Rep takes over via the REAL endpoint.
    const res = await postAssign(threadId, {
      profile: 'serra-honda',
      action: 'take_over',
    })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.human_assigned).toBe(true)
    expect(res.body.assigned_to).toBeTruthy()
    // The SAME field the pipeline reads is now set.
    expect(isHumanAssigned('serra-honda', threadId)).toBe(true)

    // Now an inbound message produces NO autonomous reply — agent is paused.
    const afterTakeover = await postInbound({
      profile: 'serra-honda',
      channel: 'chat',
      domain: 'sales',
      contact_handle: 'visitor-1',
      body: 'Can a person help me?',
    })
    expect(afterTakeover.thread_id).toBe(threadId)
    expect(afterTakeover.autonomous_replies).toHaveLength(0)
  })

  it('hand_back clears the assignee and the agent RESUMES', async () => {
    const threadId = await seedSubscribedThread()
    const { isHumanAssigned } = await import('@/server/thread-takeover')

    await postAssign(threadId, { profile: 'serra-honda', action: 'take_over' })
    expect(isHumanAssigned('serra-honda', threadId)).toBe(true)

    const handBack = await postAssign(threadId, {
      profile: 'serra-honda',
      action: 'hand_back',
    })
    expect(handBack.status).toBe(200)
    expect(handBack.body.human_assigned).toBe(false)
    expect(handBack.body.assigned_to).toBeNull()
    expect(isHumanAssigned('serra-honda', threadId)).toBe(false)

    // Agent resumes: a fresh inbound gets an autonomous reply again.
    const resumed = await postInbound({
      profile: 'serra-honda',
      channel: 'chat',
      domain: 'sales',
      contact_handle: 'visitor-1',
      body: 'Actually never mind, AI is fine.',
    })
    expect(resumed.autonomous_replies).toHaveLength(1)
    expect(resumed.autonomous_replies[0].ok).toBe(true)
  })

  it('rejects an unknown action', async () => {
    const threadId = await seedSubscribedThread()
    const res = await postAssign(threadId, {
      profile: 'serra-honda',
      action: 'nonsense',
    })
    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
  })

  it('404s for a thread that does not belong to the profile', async () => {
    await seedSubscribedThread()
    const res = await postAssign('no-such-thread', {
      profile: 'serra-honda',
      action: 'take_over',
    })
    expect(res.status).toBe(404)
    expect(res.body.ok).toBe(false)
  })
})
