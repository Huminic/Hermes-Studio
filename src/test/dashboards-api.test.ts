import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
const PROFILE = 'serra-honda'

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboards-api-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    'branding:\n  persona_name: Serra Honda\n',
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

async function handlers() {
  const { Route } = await import('@/routes/api/customer/dashboards')
  return Route.options.server.handlers
}

describe('/api/customer/dashboards', () => {
  it('GET returns empty cards + the available sources', async () => {
    const h = await handlers()
    const res = await h.GET({
      request: new Request(
        `http://localhost/api/customer/dashboards?profile=${PROFILE}`,
      ),
    } as never)
    const body = (await res.json()) as {
      ok: boolean
      dashboards: Array<unknown>
      sources: Array<string>
    }
    expect(body.ok).toBe(true)
    expect(body.dashboards).toEqual([])
    expect(body.sources).toContain('calls')
    expect(body.sources).toContain('leads')
    expect(body.sources).toContain('federated')
  })

  it('PUT persists cards to studio.yaml (other keys intact) and GET reads back', async () => {
    const h = await handlers()
    const put = await h.PUT({
      request: new Request('http://localhost/api/customer/dashboards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          dashboards: [
            {
              title: 'Calls this week',
              source: 'calls',
              visualization: 'bar',
              display: 'detail',
            },
            { title: 'New leads', source: 'leads' },
            {
              title: 'Customer engagement',
              source: 'federated',
              sources: ['calls', 'sms', 'chat'],
              visualization: 'table',
              display: 'detail',
            },
          ],
        }),
      }),
    } as never)
    expect(put.status).toBe(200)

    const yaml = fs.readFileSync(
      path.join(tmpHome, '.hermes', 'profiles', PROFILE, 'studio.yaml'),
      'utf8',
    )
    expect(yaml).toContain('persona_name: Serra Honda')
    expect(yaml).toContain('Calls this week')

    const res = await h.GET({
      request: new Request(
        `http://localhost/api/customer/dashboards?profile=${PROFILE}`,
      ),
    } as never)
    const body = (await res.json()) as {
      dashboards: Array<{
        title: string
        source: string
        visualization: string
        display: string
      }>
    }
    expect(body.dashboards.map((c) => c.source)).toEqual([
      'calls',
      'leads',
      'federated',
    ])
    expect(body.dashboards[0]).toMatchObject({
      visualization: 'bar',
      display: 'detail',
    })
    expect(body.dashboards[1]).toMatchObject({
      visualization: 'number',
      display: 'summary',
    })
    expect(body.dashboards[2]).toMatchObject({
      sources: ['calls', 'sms', 'chat'],
      visualization: 'table',
      display: 'detail',
    })
  })

  it('PUT rejects an unknown source', async () => {
    const h = await handlers()
    const put = await h.PUT({
      request: new Request('http://localhost/api/customer/dashboards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          dashboards: [{ title: 'Bad', source: 'crypto_prices' }],
        }),
      }),
    } as never)
    expect(put.status).toBe(400)
  })

  it('PUT rejects a combined card with fewer than two sources', async () => {
    const h = await handlers()
    const put = await h.PUT({
      request: new Request('http://localhost/api/customer/dashboards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          dashboards: [
            {
              title: 'Too thin',
              source: 'federated',
              sources: ['calls'],
            },
          ],
        }),
      }),
    } as never)
    expect(put.status).toBe(400)
  })
})
