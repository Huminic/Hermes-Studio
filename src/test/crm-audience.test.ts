import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCrmAudience } from '@/server/crm-audience'

let tmpHome: string
const PROFILE = 'serra-honda'

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-audience-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
  fs.mkdirSync(dir, { recursive: true })
  // vin.org_id present so resolveVinOrgId succeeds; the broker call is injected.
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    'branding:\n  persona_name: Serra Honda\nvin:\n  org_id: test-org-123\n',
  )
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('buildCrmAudience', () => {
  it('imports CRM leads into a saved list and documents the MCP limits', async () => {
    const call = vi.fn(async () => ({
      ok: true as const,
      data: {
        leads: [
          { firstName: 'Jordan', phone: '+14155550100', email: 'j@example.com' },
          { firstName: 'Riley', cellPhone: '+14155550101' },
          { firstName: 'NoContact' }, // dropped — no phone/email
        ],
      },
    }))
    const res = await buildCrmAudience({
      profile: PROFILE,
      days: 30,
      deps: { call },
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.imported).toBe(2)
    expect(res.polled).toBe(3)
    expect(res.limits).toMatch(/date window/i)
    expect(call).toHaveBeenCalledWith(
      'vin_query_leads',
      expect.objectContaining({ orgId: 'test-org-123' }),
    )
  })

  it('drops DNC / opted-out leads before saving', async () => {
    const { addToBlacklist } = await import('@/server/comms-blacklist')
    addToBlacklist(PROFILE, '+14155550111', 'STOP')
    const call = vi.fn(async () => ({
      ok: true as const,
      data: {
        leads: [
          { firstName: 'Allowed', phone: '+14155550100' },
          { firstName: 'OptedOut', phone: '+14155550111' },
        ],
      },
    }))
    const res = await buildCrmAudience({ profile: PROFILE, deps: { call } })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.dnc_blocked).toBe(1)
    expect(res.imported).toBe(1)
  })

  it('returns an error (not a throw) when the broker is unavailable', async () => {
    const call = vi.fn(async () => ({ ok: false as const, error: 'broker down' }))
    const res = await buildCrmAudience({ profile: PROFILE, deps: { call } })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toMatch(/broker down/)
  })
})
