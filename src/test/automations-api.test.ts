import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
const PROFILE = 'serra-honda'

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'automations-api-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
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

async function handlers() {
  const { Route } = await import('@/routes/api/customer/automations')
  return Route.options.server.handlers
}

function jsonReq(method: string, body: unknown) {
  return {
    request: new Request('http://localhost/api/customer/automations', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  } as never
}

describe('/api/customer/automations', () => {
  it('GET seeds the two required Serra drafts and returns the agent roster', async () => {
    const h = await handlers()
    const res = await h.GET({
      request: new Request(
        `http://localhost/api/customer/automations?profile=${PROFILE}`,
      ),
    } as never)
    const body = (await res.json()) as {
      ok: boolean
      automations: Array<{ name: string; status: string; trigger: string }>
      agents: Array<{ id: string; team: string }>
    }
    expect(body.ok).toBe(true)
    expect(body.automations.map((a) => a.name).sort()).toEqual(
      ['24-hour follow-up for all leads', 'Instant SMS for new leads'].sort(),
    )
    expect(body.automations.every((a) => a.status === 'draft')).toBe(true)
    expect(body.agents.map((a) => a.team).sort()).toEqual(['sales', 'service'])
  })

  it('POST creates an automation; CRUD round-trips via PUT + DELETE', async () => {
    const h = await handlers()
    const created = await h.POST(
      jsonReq('POST', {
        profile: PROFILE,
        name: 'Service follow-up',
        trigger: 'lead_followup',
        channel: 'sms',
        agent_id: 'nancy-gaston',
        wait_hours: 48,
      }),
    )
    const cbody = (await created.json()) as {
      ok: boolean
      automation: { id: string; status: string; agent_id: string }
    }
    expect(cbody.ok).toBe(true)
    expect(cbody.automation.status).toBe('draft')
    expect(cbody.automation.agent_id).toBe('nancy-gaston')
    const id = cbody.automation.id

    const activated = await h.PUT(
      jsonReq('PUT', { profile: PROFILE, id, status: 'active' }),
    )
    const abody = (await activated.json()) as {
      ok: boolean
      automation: { status: string }
    }
    expect(abody.automation.status).toBe('active')

    const del = await h.DELETE(jsonReq('DELETE', { profile: PROFILE, id }))
    expect(((await del.json()) as { ok: boolean }).ok).toBe(true)

    const del2 = await h.DELETE(jsonReq('DELETE', { profile: PROFILE, id }))
    expect(del2.status).toBe(404)
  })

  it('POST rejects invalid trigger / channel / agent / status', async () => {
    const h = await handlers()
    const bad = [
      { name: 'x', trigger: 'bogus', channel: 'sms', agent_id: 'caroline' },
      { name: 'x', trigger: 'new_lead', channel: 'fax', agent_id: 'caroline' },
      { name: 'x', trigger: 'new_lead', channel: 'sms', agent_id: 'mallory' },
      {
        name: 'x',
        trigger: 'new_lead',
        channel: 'sms',
        agent_id: 'caroline',
        status: 'live',
      },
    ]
    for (const b of bad) {
      const res = await h.POST(jsonReq('POST', { profile: PROFILE, ...b }))
      expect(res.status).toBe(400)
    }
  })

  it('PUT on a missing automation 404s', async () => {
    const h = await handlers()
    const res = await h.PUT(
      jsonReq('PUT', { profile: PROFILE, id: 'nope', status: 'active' }),
    )
    expect(res.status).toBe(404)
  })
})
