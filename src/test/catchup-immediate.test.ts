import { describe, expect, it } from 'vitest'
import {
  gatherImmediateCandidates,
  localMidnight,
  NEW_LEAD_STATUS,
  type ImmediateGatherDeps,
} from '../server/catchup-immediate'
import type { StudioConfig } from '../lib/studio-config'

// Minimal config with a VIN org + Central business hours (drives window + tz).
const CONFIG = {
  branding: { persona_name: 'Serra Honda' },
  federation: { read_scopes: ['vin'] },
  vin: { org_id: '24d64f99-ba04-4b43-af35-fd06f555ac86' },
  comms: {
    business_hours: { tz: 'America/Chicago', start: '08:00', end: '21:00' },
  },
} as unknown as StudioConfig

// 2026-07-08 19:00 CDT — inside the immediate evening window (6–8pm).
const NOW = Date.parse('2026-07-08T19:00:00-05:00')

type Lead = Record<string, unknown>

/** Build a fake VIN broker: query returns `leads`, get_contact returns contacts. */
function fakeCall(
  leads: Lead[],
  contacts: Record<string, { firstName?: string; phone?: string }>,
): ImmediateGatherDeps['call'] {
  return async (tool, args) => {
    if (tool === 'vin_query_leads') {
      return { ok: true, data: { totalItems: leads.length, items: leads } } as any
    }
    if (tool === 'vin_get_contact') {
      const c = contacts[String(args.contactId)]
      if (!c) return { ok: false, error: 'not found' } as any
      return {
        ok: true,
        data: {
          Contact: {
            id: args.contactId,
            firstName: c.firstName ?? null,
            ContactInformation: c.phone
              ? { Phones: [{ PhoneType: 'Cell', Phone: c.phone }] }
              : {},
          },
        },
      } as any
    }
    return { ok: false, error: `unexpected tool ${tool}` } as any
  }
}

function lead(id: number, status: string, contactId: number): Lead {
  return {
    leadId: id,
    contact: `https://api.vinsolutions.com/contacts/id/${contactId}?dealerid=21043`,
    leadStatus: status,
    leadStatusType: status.startsWith('BAD') ? 'BAD' : 'ACTIVE',
    createdUtc: '2026-07-08T18:00:00+00:00',
  }
}

describe('localMidnight', () => {
  it('returns midnight CT for a CDT afternoon instant', () => {
    expect(localMidnight('America/Chicago', NOW)).toBe(
      Date.parse('2026-07-08T00:00:00-05:00'),
    )
  })
})

describe('gatherImmediateCandidates — selection', () => {
  it('keeps only ACTIVE_NEW_LEAD; drops WAITING and BAD', async () => {
    const leads = [
      lead(1, NEW_LEAD_STATUS, 101),
      lead(2, 'ACTIVE_WAITING_FOR_PROSPECT_RESPONSE', 102),
      lead(3, 'BAD_DUPLICATE_LEAD', 103),
      lead(4, NEW_LEAD_STATUS, 104),
    ]
    const contacts = {
      '101': { firstName: 'Ann', phone: '(731) 394-6907' },
      '104': { firstName: 'Bob', phone: '205-555-0104' },
    }
    const res = await gatherImmediateCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      deps: {
        call: fakeCall(leads, contacts),
        isAgentHandled: () => false,
        hasRun: () => false,
      },
    })
    expect(res.polledTotal).toBe(4)
    expect(res.newLeadCount).toBe(2)
    expect(res.candidates.map((c) => c.phone).sort()).toEqual([
      '+12055550104',
      '+17313946907',
    ])
    expect(res.windowOpen).toBe(true)
  })

  it('excludes agent-handled (vapi/tavus) leads', async () => {
    const leads = [lead(1, NEW_LEAD_STATUS, 101), lead(2, NEW_LEAD_STATUS, 102)]
    const contacts = {
      '101': { firstName: 'Ann', phone: '7313946907' },
      '102': { firstName: 'Bob', phone: '2055550104' },
    }
    const res = await gatherImmediateCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      deps: {
        call: fakeCall(leads, contacts),
        isAgentHandled: (phone) => phone === '+17313946907', // Ann came via Tavus
        hasRun: () => false,
      },
    })
    expect(res.candidates.map((c) => c.phone)).toEqual(['+12055550104'])
    expect(res.dropped).toContainEqual({
      leadId: '1',
      phone: '+17313946907',
      reason: 'excluded: agent-handled (vapi/tavus)',
    })
  })

  it('is idempotent — drops leads already in the dedup ledger', async () => {
    const leads = [lead(1, NEW_LEAD_STATUS, 101), lead(2, NEW_LEAD_STATUS, 102)]
    const contacts = {
      '101': { firstName: 'Ann', phone: '7313946907' },
      '102': { firstName: 'Bob', phone: '2055550104' },
    }
    const alreadySent = new Set(['+17313946907'])
    const res = await gatherImmediateCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      deps: {
        call: fakeCall(leads, contacts),
        isAgentHandled: () => false,
        hasRun: (h) => alreadySent.has(h),
      },
    })
    expect(res.candidates.map((c) => c.phone)).toEqual(['+12055550104'])
    expect(res.dropped).toContainEqual({
      leadId: '1',
      phone: '+17313946907',
      reason: 'already sent (dedup ledger)',
    })
  })

  it('drops leads with no resolvable phone', async () => {
    const leads = [lead(1, NEW_LEAD_STATUS, 101)]
    const res = await gatherImmediateCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      deps: {
        call: fakeCall(leads, { '101': { firstName: 'Ann' } }), // no phone
        isAgentHandled: () => false,
        hasRun: () => false,
      },
    })
    expect(res.candidates).toHaveLength(0)
    expect(res.dropped[0].reason).toBe('no phone on resolved contact')
  })

  it('reports window CLOSED with nextOpen when run outside the immediate window', async () => {
    const midday = Date.parse('2026-07-08T13:00:00-05:00') // 1pm CT — closed (next open 6pm)
    const res = await gatherImmediateCandidates({
      profile: 'serra-honda',
      now: midday,
      config: CONFIG,
      deps: { call: fakeCall([], {}), isAgentHandled: () => false, hasRun: () => false },
    })
    expect(res.windowOpen).toBe(false)
    expect(res.nextOpenMs).toBe(Date.parse('2026-07-08T18:00:00-05:00'))
  })

  it('skips cleanly when the VIN org is unconfigured', async () => {
    const noVin = { ...CONFIG, federation: { read_scopes: [] }, vin: {} } as unknown as StudioConfig
    const res = await gatherImmediateCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: noVin,
      deps: { call: fakeCall([], {}), isAgentHandled: () => false, hasRun: () => false },
    })
    expect(res.skipped).toMatch(/unconfigured VIN org/)
    expect(res.candidates).toHaveLength(0)
  })
})
