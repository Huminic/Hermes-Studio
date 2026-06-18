import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
const PROFILE = 'serra-honda'

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'marketing-lists-'))
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

function jsonReq(url: string, method: string, body: unknown) {
  return {
    request: new Request(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  } as never
}

describe('audiences API — delete + DNC + CRM guard', () => {
  it('DELETE removes a saved list; missing list 404s', async () => {
    const { Route } = await import('@/routes/api/customer/audiences/index')
    const h = Route.options.server.handlers
    const created = await h.POST(
      jsonReq('http://localhost/api/customer/audiences', 'POST', {
        profile: PROFILE,
        name: 'My list',
        query: { channel: 'sms' },
      }),
    )
    const id = ((await created.json()) as { audience: { id: string } }).audience
      .id

    const del = await h.DELETE(
      jsonReq('http://localhost/api/customer/audiences', 'DELETE', {
        profile: PROFILE,
        id,
      }),
    )
    expect(((await del.json()) as { ok: boolean }).ok).toBe(true)

    const del2 = await h.DELETE(
      jsonReq('http://localhost/api/customer/audiences', 'DELETE', {
        profile: PROFILE,
        id,
      }),
    )
    expect(del2.status).toBe(404)
  })

  it('upload enforces DNC: an opted-out phone is dropped before the list is usable', async () => {
    const store = await import('@/server/messaging-hub-store')
    const { addToBlacklist } = await import('@/server/comms-blacklist')
    addToBlacklist(PROFILE, '+14155550111', 'STOP')

    const { Route } = await import('@/routes/api/customer/audiences/upload')
    const h = Route.options.server.handlers
    const csv =
      'name,phone,email\n' +
      'Allowed Person,+14155550100,allowed@example.com\n' +
      'Opted Out,+14155550111,optout@example.com\n'
    const res = await h.POST(
      jsonReq('http://localhost/api/customer/audiences/upload', 'POST', {
        profile: PROFILE,
        name: 'Imported',
        csv,
      }),
    )
    const body = (await res.json()) as {
      ok: boolean
      imported: number
      dnc_blocked: number
      audience: { id: string }
    }
    expect(body.ok).toBe(true)
    expect(body.dnc_blocked).toBe(1)
    expect(body.imported).toBe(1)
    // The saved audience targets only the allowed contact.
    const aud = store.getAudience(PROFILE, body.audience.id)
    expect((aud?.query.contact_ids as Array<string>).length).toBe(1)
  })

  it('crm_query returns a clear error when CRM is not configured for the store', async () => {
    const { Route } = await import('@/routes/api/customer/audiences/index')
    const h = Route.options.server.handlers
    const res = await h.POST(
      jsonReq('http://localhost/api/customer/audiences', 'POST', {
        profile: PROFILE,
        action: 'crm_query',
      }),
    )
    // No vin.org_id in this test profile → resolveVinOrgId fails → 502 + reason.
    expect(res.status).toBe(502)
    const body = (await res.json()) as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(typeof body.error).toBe('string')
  })
})

describe('campaigns API — delete', () => {
  it('DELETE removes a campaign; missing campaign 404s', async () => {
    const store = await import('@/server/messaging-hub-store')
    const aud = store.createAudience({
      profile: PROFILE,
      name: 'aud',
      query: { channel: 'sms' },
    })
    const camp = store.createCampaign({
      profile: PROFILE,
      audience_id: aud.id,
      channel: 'sms',
      message_template: 'hi',
    })
    const { Route } = await import('@/routes/api/customer/campaigns/index')
    const h = Route.options.server.handlers
    const del = await h.DELETE(
      jsonReq('http://localhost/api/customer/campaigns', 'DELETE', {
        profile: PROFILE,
        campaign_id: camp.id,
      }),
    )
    expect(((await del.json()) as { ok: boolean }).ok).toBe(true)
    expect(store.listCampaigns(PROFILE)).toHaveLength(0)

    const del2 = await h.DELETE(
      jsonReq('http://localhost/api/customer/campaigns', 'DELETE', {
        profile: PROFILE,
        campaign_id: camp.id,
      }),
    )
    expect(del2.status).toBe(404)
  })
})
