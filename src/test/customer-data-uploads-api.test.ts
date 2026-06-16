import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpRoot: string

function mockSession(meta: Record<string, unknown> | null) {
  vi.doMock('@/server/auth-middleware', () => ({
    isPasswordProtectionEnabled: () => true,
    getSessionTokenFromCookie: () => (meta ? 'tok' : null),
    getSessionMetadata: () => meta,
  }))
}

async function handlers() {
  const { Route } = await import('@/routes/api/customer/data-uploads')
  return Route.options.server.handlers
}

describe('/api/customer/data-uploads', () => {
  beforeEach(() => {
    vi.resetModules()
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'customer-data-uploads-'))
    process.env.BRAIN_PROFILES_ROOT = path.join(tmpRoot, '.hermes', 'profiles')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/server/auth-middleware')
    vi.resetModules()
    fs.rmSync(tmpRoot, { recursive: true, force: true })
    delete process.env.BRAIN_PROFILES_ROOT
  })

  it('lets a scoped partner upload and list Data Store files for an in-scope profile', async () => {
    mockSession({
      username: 'durran@example.com',
      is_admin: false,
      is_customer_admin: false,
      scope_profiles: ['serra-service'],
    })
    const h = await handlers()

    const post = await h.POST({
      request: new Request('http://localhost/api/customer/data-uploads', {
        method: 'POST',
        headers: {
          cookie: 'hermes-auth=tok',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profile: 'serra-service',
          filename: 'service-report.csv',
          mime_type: 'text/csv',
          classification: 'data',
          content_base64: Buffer.from('name,total\nCalls,12\n').toString(
            'base64',
          ),
        }),
      }),
    } as never)
    const postText = await post.text()
    expect(post.status, postText).toBe(200)
    const postBody = JSON.parse(postText) as {
      ok: boolean
      upload: { filename: string; classification: string }
      uploads: Array<{ filename: string }>
    }
    expect(postBody.ok).toBe(true)
    expect(postBody.upload).toMatchObject({
      filename: 'service-report.csv',
      classification: 'data',
    })
    expect(postBody.uploads.map((u) => u.filename)).toContain(
      'service-report.csv',
    )

    const get = await h.GET({
      request: new Request(
        'http://localhost/api/customer/data-uploads?profile=serra-service',
        { headers: { cookie: 'hermes-auth=tok' } },
      ),
    } as never)
    const getBody = (await get.json()) as {
      ok: boolean
      uploads: Array<{ filename: string }>
    }
    expect(get.status).toBe(200)
    expect(getBody.ok).toBe(true)
    expect(getBody.uploads.map((u) => u.filename)).toContain(
      'service-report.csv',
    )
  })

  it('rejects out-of-scope profile access', async () => {
    mockSession({
      username: 'durran@example.com',
      is_admin: false,
      is_customer_admin: false,
      scope_profiles: ['serra-service'],
    })
    const h = await handlers()
    const res = await h.GET({
      request: new Request(
        'http://localhost/api/customer/data-uploads?profile=serra-honda',
        { headers: { cookie: 'hermes-auth=tok' } },
      ),
    } as never)
    expect(res.status).toBe(403)
  })
})
