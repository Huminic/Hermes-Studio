import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
const PROFILE = 'huminic'

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lead-flow-api-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'studio.yaml'), 'branding:\n  persona_name: Huminic\n')
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

async function handlers() {
  const { Route } = await import('@/routes/api/customer/lead-flow')
  return Route.options.server.handlers
}

function putReq(body: unknown) {
  return new Request('http://localhost/api/customer/lead-flow', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/customer/lead-flow', () => {
  it('GET returns an empty flow + the account master gate', async () => {
    const h = await handlers()
    const res = await h.GET({
      request: new Request(`http://localhost/api/customer/lead-flow?profile=${PROFILE}`),
    } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      flow: { enabled: boolean; steps: Array<unknown> }
      account_enabled: boolean
    }
    expect(body.ok).toBe(true)
    expect(body.flow.enabled).toBe(false)
    expect(body.flow.steps).toEqual([])
    expect(body.account_enabled).toBe(false) // vin.watcher.enabled default OFF
  })

  it('PUT saves a valid flow and GET reads it back', async () => {
    const h = await handlers()
    const put = await h.PUT({
      request: putReq({
        profile: PROFILE,
        enabled: true,
        steps: [
          { channel: 'sms', wait_hours: 0 },
          { channel: 'email', wait_hours: 4 },
          { channel: 'voice', wait_hours: 24 },
        ],
      }),
    } as never)
    expect(put.status).toBe(200)

    const res = await h.GET({
      request: new Request(`http://localhost/api/customer/lead-flow?profile=${PROFILE}`),
    } as never)
    const body = (await res.json()) as { flow: { enabled: boolean; steps: Array<{ channel: string }> } }
    expect(body.flow.enabled).toBe(true)
    expect(body.flow.steps.map((s) => s.channel)).toEqual(['sms', 'email', 'voice'])
  })

  it('PUT rejects more than 3 steps', async () => {
    const h = await handlers()
    const put = await h.PUT({
      request: putReq({
        profile: PROFILE,
        enabled: true,
        steps: [
          { channel: 'sms' },
          { channel: 'email', wait_hours: 1 },
          { channel: 'voice', wait_hours: 2 },
          { channel: 'sms', wait_hours: 3 },
        ],
      }),
    } as never)
    expect(put.status).toBe(400)
  })

  it('PUT rejects an unknown channel', async () => {
    const h = await handlers()
    const put = await h.PUT({
      request: putReq({ profile: PROFILE, enabled: true, steps: [{ channel: 'fax' }] }),
    } as never)
    expect(put.status).toBe(400)
  })
})
