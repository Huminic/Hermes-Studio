import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  parseContactId,
  flattenContact,
  resolveLeadNames,
  resolveVinOrgId,
} from '@/server/vin-client'
import type { CentralMcpResult } from '@/server/central-mcp'

afterEach(() => vi.unstubAllEnvs())

describe('parseContactId — the href two-step key', () => {
  it('extracts the numeric id from a contacts href', () => {
    expect(parseContactId('https://api.vin.example/v1/contacts/id/12345')).toBe('12345')
    expect(parseContactId('/contacts/id/7')).toBe('7')
  })
  it('returns null for non-contact hrefs / non-strings', () => {
    expect(parseContactId('https://api.vin.example/leads/id/9')).toBeNull()
    expect(parseContactId(undefined)).toBeNull()
    expect(parseContactId(42)).toBeNull()
    expect(parseContactId(null)).toBeNull()
  })
})

describe('flattenContact — dig ContactInformation', () => {
  const raw = {
    firstName: 'Dana',
    lastName: 'Reyes',
    id: 12345,
    ContactInformation: {
      Emails: [
        { EmailType: 'Work', Email: 'dana.work@example.com' },
        { EmailType: 'Primary', Email: 'dana@example.com' },
      ],
      Phones: [
        { PhoneType: 'Home', Phone: '+15551110000' },
        { PhoneType: 'Cell', Phone: '+15552223333' },
      ],
    },
  }

  it('prefers Primary email and Cell phone', () => {
    const f = flattenContact(raw)
    expect(f).toMatchObject({
      firstName: 'Dana',
      lastName: 'Reyes',
      fullName: 'Dana Reyes',
      email: 'dana@example.com',
      phone: '+15552223333',
      contactId: '12345',
    })
  })

  it('falls back to Home phone when no Cell, first email when no Primary', () => {
    const f = flattenContact({
      firstName: 'Sam',
      ContactInformation: {
        Emails: [{ EmailType: 'Work', Email: 'sam@work.com' }],
        Phones: [{ PhoneType: 'Home', Phone: '+15550001111' }],
      },
    })
    expect(f.email).toBe('sam@work.com')
    expect(f.phone).toBe('+15550001111')
  })

  it('tolerates a broker-wrapped {contact:{…}} payload and missing fields', () => {
    const f = flattenContact({ contact: { FirstName: 'Lee', ContactInformation: {} } })
    expect(f.firstName).toBe('Lee')
    expect(f.email).toBeNull()
    expect(f.phone).toBeNull()
  })

  it('is null-safe on garbage', () => {
    expect(flattenContact(null)).toMatchObject({ firstName: null, email: null, phone: null })
  })
})

describe('resolveVinOrgId — config source + no-slug-fallback', () => {
  const baseConfig = { vin: { name_resolve_cap: 10 } } as never

  it('reads vin.org_id from studio.yaml first', () => {
    const r = resolveVinOrgId('p', { vin: { org_id: 'uuid-yaml' } } as never)
    expect(r).toEqual({ ok: true, orgId: 'uuid-yaml' })
  })
  it('falls back to VIN_ORG_ID env when yaml absent', () => {
    vi.stubEnv('VIN_ORG_ID', 'uuid-env')
    expect(resolveVinOrgId('p', baseConfig)).toEqual({ ok: true, orgId: 'uuid-env' })
  })
  it('reports unconfigured (never the profile slug) when neither is set', () => {
    vi.stubEnv('VIN_ORG_ID', '')
    const r = resolveVinOrgId('serra', baseConfig)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.unconfigured).toBe(true)
      expect(r.reason).not.toContain('serra')
    }
  })
})

describe('resolveLeadNames — query→get_contact sequence + rate cap', () => {
  function contactPayload(id: string, name: string): CentralMcpResult {
    return {
      ok: true,
      data: { firstName: name, id, ContactInformation: { Phones: [], Emails: [] } },
    }
  }

  it('parses href, calls vin_get_contact per lead with orgId, enriches names', async () => {
    const call = vi.fn(async (_tool: string, args: Record<string, unknown>) =>
      contactPayload(String(args.contactId), `Name${args.contactId}`),
    )
    const leads = [
      { contact: '/contacts/id/1', leadId: 'L1' },
      { contact: '/contacts/id/2', leadId: 'L2' },
    ]
    const out = await resolveLeadNames(leads, { orgId: 'org-uuid', call })

    // Exactly one vin_get_contact per unique contact, carrying the org UUID.
    expect(call).toHaveBeenCalledTimes(2)
    for (const c of call.mock.calls) {
      expect(c[0]).toBe('vin_get_contact')
      expect(c[1]).toMatchObject({ orgId: 'org-uuid' })
    }
    expect(out[0].resolved_name).toBe('Name1')
    expect(out[1].resolved_name).toBe('Name2')
    expect(out[0].contactId).toBe('1')
  })

  it('caps resolution at N unique contacts; extra leads pass through unresolved', async () => {
    const call = vi.fn(async (_tool: string, args: Record<string, unknown>) =>
      contactPayload(String(args.contactId), `N${args.contactId}`),
    )
    const leads = Array.from({ length: 15 }, (_, i) => ({ contact: `/contacts/id/${i}` }))
    const out = await resolveLeadNames(leads, { orgId: 'org-uuid', call, cap: 10 })

    expect(call).toHaveBeenCalledTimes(10)
    expect(out.filter((l) => l.resolved_name).length).toBe(10)
    expect(out[14].resolved_name).toBeNull() // beyond the cap
  })

  it('de-duplicates contactIds so the cap counts unique broker calls', async () => {
    const call = vi.fn(async (_tool: string, args: Record<string, unknown>) =>
      contactPayload(String(args.contactId), 'Dup'),
    )
    const leads = [
      { contact: '/contacts/id/9' },
      { contact: '/contacts/id/9' },
      { contact: '/contacts/id/9' },
    ]
    const out = await resolveLeadNames(leads, { orgId: 'o', call, cap: 10 })
    expect(call).toHaveBeenCalledTimes(1)
    expect(out.every((l) => l.resolved_name === 'Dup')).toBe(true)
  })

  it('leaves leads unresolved when get_contact errors (never throws)', async () => {
    const call = vi.fn(async (): Promise<CentralMcpResult> => ({ ok: false, error: 'boom' }))
    const out = await resolveLeadNames([{ contact: '/contacts/id/1' }], { orgId: 'o', call })
    expect(out[0].resolved).toBeNull()
    expect(out[0].resolved_name).toBeNull()
  })
})
