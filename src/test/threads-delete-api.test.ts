/**
 * Teambox conversation removal API.
 *
 * Drives the REAL /api/messaging/threads/$threadId DELETE handler. The route
 * must stay profile-scoped: a rep can remove a conversation for the profile
 * they are authorized to manage, but a wrong-profile delete cannot reach across
 * stores.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
let savedPassword: string | undefined

async function deleteViaApi(
  threadId: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = { 'content-type': 'application/json' },
) {
  const { Route } = await import('@/routes/api/messaging/threads.$threadId')
  const handler = Route.options.server.handlers.DELETE
  const req = new Request(`http://localhost/api/messaging/threads/${threadId}`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify(body),
  })
  const res = await handler({ request: req, params: { threadId } } as never)
  return {
    status: res.status,
    body: (await res.json()) as { ok: boolean; thread_id?: string; error?: string },
  }
}

beforeEach(async () => {
  savedPassword = process.env.HERMES_PASSWORD
  delete process.env.HERMES_PASSWORD
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'threads-delete-api-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const store = await import('@/server/messaging-hub-store')
  store._resetForTests()
  const bus = await import('@/server/messaging-hub-bus')
  bus._resetMessagingBus()
})

afterEach(() => {
  vi.restoreAllMocks()
  if (savedPassword === undefined) delete process.env.HERMES_PASSWORD
  else process.env.HERMES_PASSWORD = savedPassword
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('/api/messaging/threads/$threadId DELETE', () => {
  it('deletes a profile-owned thread and removes it from the list', async () => {
    const { appendMessage, getOrCreateThread, getThread, listThreads } =
      await import('@/server/messaging-hub-store')
    const thread = getOrCreateThread({
      profile: 'serra-honda',
      domain: 'sales',
      channel: 'chat',
      contact_handle: 'visitor-1',
    })
    appendMessage({
      thread_id: thread.id,
      direction: 'inbound',
      role: 'user',
      channel: 'chat',
      content: 'Please delete this conversation.',
      author: 'visitor-1',
    })

    const res = await deleteViaApi(thread.id, { profile: 'serra-honda' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.thread_id).toBe(thread.id)
    expect(getThread('serra-honda', thread.id)).toBeNull()
    expect(listThreads({ profile: 'serra-honda' })).toHaveLength(0)
  })

  it('does not allow a wrong profile to delete another store thread', async () => {
    const { getOrCreateThread, getThread } = await import(
      '@/server/messaging-hub-store'
    )
    const thread = getOrCreateThread({
      profile: 'store-a',
      domain: 'sales',
      channel: 'sms',
      contact_handle: '+15555550100',
    })

    const res = await deleteViaApi(thread.id, { profile: 'store-b' })

    expect(res.status).toBe(404)
    expect(res.body.ok).toBe(false)
    expect(getThread('store-a', thread.id)).not.toBeNull()
  })

  it('rejects missing JSON content type and unauthenticated protected mode', async () => {
    const { getOrCreateThread } = await import('@/server/messaging-hub-store')
    const thread = getOrCreateThread({
      profile: 'serra-honda',
      domain: 'sales',
      channel: 'chat',
      contact_handle: 'visitor-2',
    })

    const badContentType = await deleteViaApi(thread.id, { profile: 'serra-honda' }, {})
    expect(badContentType.status).toBe(415)

    process.env.HERMES_PASSWORD = 'gate-on'
    const unauthenticated = await deleteViaApi(thread.id, { profile: 'serra-honda' })
    expect(unauthenticated.status).toBe(403)
    expect(unauthenticated.body.ok).toBe(false)
  })
})
