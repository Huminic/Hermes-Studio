import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTask,
  getTask,
  listTasks,
  setTaskStatus,
} from '@/server/agent-tasks-store'
import { getInstructions, saveInstructions } from '@/server/agent-config-store'
import { listChatSessions } from '@/server/customer-chat-sessions'

let tmpHome: string
const PROFILE = 'serra-honda'

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-chat-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  delete process.env.BRAIN_PROFILES_ROOT
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    'branding:\n  persona_name: Serra Honda\n',
  )
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

// ── agent-tasks-store ───────────────────────────────────────────────────────

describe('agent-tasks-store', () => {
  it('creates a structured one-time task and lists it', () => {
    const res = createTask(PROFILE, {
      agent_id: 'caroline',
      title: 'Send Monday report',
      prompt: 'Summarize last week sales',
      description: 'Weekly recap',
      frequency: 'one_time',
      notification_channel: 'in_app',
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.task.id).toBeTruthy()
    expect(res.task.frequency).toBe('one_time')
    expect(res.task.cadence).toBeNull()
    expect(res.task.status).toBe('active')
    const list = listTasks(PROFILE)
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('Send Monday report')
  })

  it('requires a cadence for recurring tasks', () => {
    const res = createTask(PROFILE, {
      agent_id: 'caroline',
      title: 'Weekly digest',
      prompt: 'Send digest',
      frequency: 'recurring',
      notification_channel: 'email',
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toMatch(/cadence/i)
  })

  it('stores cadence for recurring tasks', () => {
    const res = createTask(PROFILE, {
      agent_id: 'caroline',
      title: 'Weekly digest',
      prompt: 'Send digest',
      frequency: 'recurring',
      cadence: 'every Monday at 9am',
      notification_channel: 'email',
      next_run_at: 123456789,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.task.cadence).toBe('every Monday at 9am')
    expect(res.task.next_run_at).toBe(123456789)
  })

  it('rejects missing required fields', () => {
    expect(
      createTask(PROFILE, {
        agent_id: '',
        title: 'x',
        prompt: 'y',
        frequency: 'one_time',
        notification_channel: 'in_app',
      }).ok,
    ).toBe(false)
  })

  it('pause/resume/complete via setTaskStatus; completed hidden by default', () => {
    const created = createTask(PROFILE, {
      agent_id: 'caroline',
      title: 'T',
      prompt: 'P',
      frequency: 'one_time',
      notification_channel: 'in_app',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const id = created.task.id
    expect(setTaskStatus(PROFILE, id, 'paused').ok).toBe(true)
    expect(getTask(PROFILE, id)?.status).toBe('paused')
    expect(setTaskStatus(PROFILE, id, 'completed').ok).toBe(true)
    // hidden by default
    expect(listTasks(PROFILE)).toHaveLength(0)
    // visible when including completed
    expect(listTasks(PROFILE, { includeCompleted: true })).toHaveLength(1)
  })

  it('scopes tasks by tenant (no cross-profile leak)', () => {
    createTask(PROFILE, {
      agent_id: 'caroline',
      title: 'A',
      prompt: 'P',
      frequency: 'one_time',
      notification_channel: 'in_app',
    })
    const other = path.join(tmpHome, '.hermes', 'profiles', 'other-store')
    fs.mkdirSync(other, { recursive: true })
    expect(listTasks('other-store')).toHaveLength(0)
  })
})

// ── agent-config-store ──────────────────────────────────────────────────────

describe('agent-config-store', () => {
  it('returns empty local instructions before any save', () => {
    const got = getInstructions(PROFILE, 'caroline')
    expect(got.instructions).toBe('')
    expect(got.source).toBe('local')
    expect(got.wiki_ref).toBeNull()
    expect(got.updated_at).toBeNull()
  })

  it('persists instructions across save/get', () => {
    const res = saveInstructions(PROFILE, 'caroline', 'Always greet warmly.')
    expect(res.ok).toBe(true)
    const got = getInstructions(PROFILE, 'caroline')
    expect(got.instructions).toBe('Always greet warmly.')
    expect(got.source).toBe('local')
    expect(got.updated_at).toBeTypeOf('number')
  })
})

// ── route handlers ──────────────────────────────────────────────────────────

async function taskHandlers() {
  const { Route } = await import('@/routes/api/customer/agent-tasks')
  return Route.options.server.handlers
}
async function configHandlers() {
  const { Route } = await import('@/routes/api/customer/agent-config')
  return Route.options.server.handlers
}
async function sessionHandlers() {
  const { Route } = await import('@/routes/api/customer/sessions')
  return Route.options.server.handlers
}

describe('/api/customer/agent-tasks', () => {
  it('POST creates, GET lists, PATCH updates status, DELETE removes', async () => {
    const h = await taskHandlers()
    const post = await h.POST({
      request: new Request('http://localhost/api/customer/agent-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          agent_id: 'caroline',
          title: 'Daily standup',
          prompt: 'Summarize overnight leads',
          frequency: 'recurring',
          cadence: 'every weekday at 8am',
          notification_channel: 'in_app',
        }),
      }),
    } as never)
    const postBody = (await post.json()) as {
      ok: boolean
      task: { id: string; cadence: string }
    }
    expect(postBody.ok).toBe(true)
    expect(postBody.task.cadence).toBe('every weekday at 8am')
    const id = postBody.task.id

    const list = await h.GET({
      request: new Request(
        `http://localhost/api/customer/agent-tasks?profile=${PROFILE}`,
      ),
    } as never)
    const listBody = (await list.json()) as { tasks: Array<unknown> }
    expect(listBody.tasks).toHaveLength(1)

    const patch = await h.PATCH({
      request: new Request('http://localhost/api/customer/agent-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: PROFILE, id, status: 'paused' }),
      }),
    } as never)
    const patchBody = (await patch.json()) as { task: { status: string } }
    expect(patchBody.task.status).toBe('paused')

    const del = await h.DELETE({
      request: new Request('http://localhost/api/customer/agent-tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: PROFILE, id }),
      }),
    } as never)
    expect((await del.json()).ok).toBe(true)
  })

  it('POST rejects a recurring task with no cadence (400)', async () => {
    const h = await taskHandlers()
    const post = await h.POST({
      request: new Request('http://localhost/api/customer/agent-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          agent_id: 'caroline',
          title: 'x',
          prompt: 'y',
          frequency: 'recurring',
          notification_channel: 'in_app',
        }),
      }),
    } as never)
    expect(post.status).toBe(400)
  })
})

describe('/api/customer/agent-config', () => {
  it('GET defaults empty, POST saves, GET reflects', async () => {
    const h = await configHandlers()
    const get0 = await h.GET({
      request: new Request(
        `http://localhost/api/customer/agent-config?profile=${PROFILE}&agent_id=caroline`,
      ),
    } as never)
    expect((await get0.json()).instructions.instructions).toBe('')

    const post = await h.POST({
      request: new Request('http://localhost/api/customer/agent-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          agent_id: 'caroline',
          instructions: 'Speak in plain language.',
        }),
      }),
    } as never)
    expect((await post.json()).ok).toBe(true)

    const get1 = await h.GET({
      request: new Request(
        `http://localhost/api/customer/agent-config?profile=${PROFILE}&agent_id=caroline`,
      ),
    } as never)
    expect((await get1.json()).instructions.instructions).toBe(
      'Speak in plain language.',
    )
  })
})

describe('/api/customer/sessions', () => {
  it('lists only non-empty chat threads for the requested agent', async () => {
    const hub = await import('@/server/messaging-hub-store')
    // Agent A: one real session (has a message)
    const tA = hub.getOrCreateThread({
      profile: PROFILE,
      domain: 'chat',
      channel: 'chat',
      contact_handle: 'customer-admin',
      assigned_agent_id: 'caroline',
      force_new: true,
    })
    hub.appendMessage({
      thread_id: tA.id,
      direction: 'inbound',
      role: 'user',
      channel: 'chat',
      content: 'What are our hours?',
      author: 'customer-admin',
    })
    // Agent B: a different agent's session
    const tB = hub.getOrCreateThread({
      profile: PROFILE,
      domain: 'chat',
      channel: 'chat',
      contact_handle: 'customer-admin',
      assigned_agent_id: 'roger',
      force_new: true,
    })
    hub.appendMessage({
      thread_id: tB.id,
      direction: 'inbound',
      role: 'user',
      channel: 'chat',
      content: 'Roger question',
      author: 'customer-admin',
    })
    // Empty thread (no message) — must NOT surface.
    hub.getOrCreateThread({
      profile: PROFILE,
      domain: 'chat',
      channel: 'chat',
      contact_handle: 'customer-admin',
      assigned_agent_id: 'caroline',
      force_new: true,
    })

    // Store-level: filtered by agent + excludes empty
    const carolineSessions = listChatSessions(PROFILE, { agentId: 'caroline' })
    expect(carolineSessions).toHaveLength(1)
    expect(carolineSessions[0].title).toBe('What are our hours?')

    // Route-level
    const h = await sessionHandlers()
    const res = await h.GET({
      request: new Request(
        `http://localhost/api/customer/sessions?profile=${PROFILE}&agent_id=caroline`,
      ),
    } as never)
    const body = (await res.json()) as {
      ok: boolean
      sessions: Array<{ id: string; agent_id: string }>
    }
    expect(body.ok).toBe(true)
    expect(body.sessions).toHaveLength(1)
    expect(body.sessions[0].agent_id).toBe('caroline')
  })
})
