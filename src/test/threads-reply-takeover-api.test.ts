import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PROFILE = 'serra-service'

let tmpHome: string
let threadId: string
let dispatchMock: ReturnType<typeof vi.fn>

async function postReply(content = 'I can help you with that.') {
  const { Route } = await import('@/routes/api/messaging/threads.$threadId.reply')
  const req = new Request(
    `http://localhost/api/messaging/threads/${threadId}/reply`,
    {
      method: 'POST',
      headers: {
        cookie: 'hermes-auth=tok',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile: PROFILE,
        content,
      }),
    },
  )
  return Route.options.server.handlers.POST({
    request: req,
    params: { threadId },
  } as never)
}

describe('/api/messaging/threads/$threadId/reply — takeover gate', () => {
  beforeEach(async () => {
    vi.resetModules()
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-takeover-'))
    vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
    dispatchMock = vi.fn(async () => ({ status: 'simulated', via: 'unit-test' }))
    vi.doMock('@/server/auth-middleware', () => ({
      isPasswordProtectionEnabled: () => true,
      getSessionTokenFromCookie: () => 'tok',
      getSessionMetadata: () => ({
        username: 'rep@example.com',
        profile: PROFILE,
        is_admin: false,
        is_customer_admin: true,
      }),
    }))
    vi.doMock('@/server/messaging-adapters', () => ({
      dispatchOutbound: dispatchMock,
    }))

    const store = await import('@/server/messaging-hub-store')
    store._resetForTests()
    const thread = store.getOrCreateThread({
      profile: PROFILE,
      domain: 'service',
      channel: 'chat',
      contact_handle: 'chat:customer-1',
      subject: 'Website chat - Nancy Gaston',
      assigned_agent_id: 'nancy-gaston',
    })
    threadId = thread.id
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/server/auth-middleware')
    vi.doUnmock('@/server/messaging-adapters')
    vi.resetModules()
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it('rejects a manual reply before human takeover', async () => {
    const res = await postReply()
    const body = (await res.json()) as { ok: boolean; error?: string }

    expect(res.status).toBe(409)
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/take over/i)
    expect(dispatchMock).not.toHaveBeenCalled()
  })

  it('allows a manual reply once the thread is taken over', async () => {
    const { assignThreadToHuman } = await import('@/server/thread-takeover')
    assignThreadToHuman(PROFILE, threadId, 'rep@example.com')

    const res = await postReply('Manual takeover reply.')
    const body = (await res.json()) as { ok: boolean; message?: { content: string } }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.message?.content).toBe('Manual takeover reply.')
    expect(dispatchMock).toHaveBeenCalledOnce()
  })
})
