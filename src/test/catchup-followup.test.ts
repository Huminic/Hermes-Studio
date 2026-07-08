import { describe, expect, it } from 'vitest'
import {
  gatherFollowupCandidates,
  FOLLOWUP_AFTER_MS,
  type FollowupGatherDeps,
} from '../server/catchup-followup'
import type { StudioConfig } from '../lib/studio-config'

const CONFIG = {
  branding: { persona_name: 'Serra Honda' },
  federation: { read_scopes: ['vin'] },
  vin: { org_id: '24d64f99-ba04-4b43-af35-fd06f555ac86' },
  comms: {
    business_hours: { tz: 'America/Chicago', start: '08:00', end: '21:00' },
  },
} as unknown as StudioConfig

// 2026-07-08 12:00 CDT — inside the A2P follow-up window.
const NOW = Date.parse('2026-07-08T12:00:00-05:00')

type Lead = Record<string, unknown>

function fakeCall(
  leads: Lead[],
  contacts: Record<string, { firstName?: string; phone?: string }>,
): FollowupGatherDeps['call'] {
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
            ContactInformation: c.phone ? { Phones: [{ PhoneType: 'Cell', Phone: c.phone }] } : {},
          },
        },
      } as any
    }
    return { ok: false, error: `unexpected ${tool}` } as any
  }
}

function lead(
  id: number,
  statusType: string,
  contactId: number,
  createdMsAgo: number,
  leadType = 'INTERNET',
): Lead {
  return {
    leadId: id,
    contact: `https://api.vinsolutions.com/contacts/id/${contactId}?dealerid=21043`,
    leadStatusType: statusType,
    leadType,
    createdUtc: new Date(NOW - createdMsAgo).toISOString(),
  }
}

const H = 60 * 60_000

describe('gatherFollowupCandidates', () => {
  it('selects ACTIVE leads whose 24h anniversary has passed; drops too-new + non-active', async () => {
    const leads = [
      lead(1, 'ACTIVE', 101, 30 * H), // 30h ago → due
      lead(2, 'ACTIVE', 102, 10 * H), // 10h ago → NOT due
      lead(3, 'BAD', 103, 48 * H), // bad → excluded (not active)
      lead(4, 'ACTIVE', 104, 25 * H), // 25h ago → due
    ]
    const contacts = {
      '101': { firstName: 'Ann', phone: '7313946907' },
      '104': { firstName: 'Bob', phone: '2055550104' },
    }
    const res = await gatherFollowupCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      deps: { call: fakeCall(leads, contacts), hasRun: () => false },
    })
    expect(res.polledTotal).toBe(4)
    expect(res.activeCount).toBe(3)
    expect(res.dueCount).toBe(2)
    expect(res.candidates.map((c) => c.phone).sort()).toEqual(['+12055550104', '+17313946907'])
    expect(res.windowOpen).toBe(true)
  })

  it('excludes SERVICE/PARTS leads by default (sales-only follow-up)', async () => {
    const leads = [
      lead(1, 'ACTIVE', 101, 30 * H, 'INTERNET'),
      lead(2, 'ACTIVE', 102, 30 * H, 'SERVICE'),
      lead(3, 'ACTIVE', 103, 30 * H, 'PARTS_ORDER'),
      lead(4, 'ACTIVE', 104, 30 * H, 'PHONE'),
    ]
    const contacts = {
      '101': { firstName: 'Ann', phone: '7313946907' },
      '104': { firstName: 'Bob', phone: '2055550104' },
    }
    const res = await gatherFollowupCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      deps: { call: fakeCall(leads, contacts), hasRun: () => false },
    })
    expect(res.candidates.map((c) => c.phone).sort()).toEqual(['+12055550104', '+17313946907'])
    expect(res.dropped.map((d) => d.reason).sort()).toEqual([
      'excluded: parts_order lead (sales follow-up)',
      'excluded: service lead (sales follow-up)',
    ])
  })

  it('includes SERVICE leads when salesOnly:false', async () => {
    const leads = [lead(1, 'ACTIVE', 101, 30 * H, 'SERVICE')]
    const res = await gatherFollowupCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      salesOnly: false,
      deps: { call: fakeCall(leads, { '101': { firstName: 'Sam', phone: '7313946907' } }), hasRun: () => false },
    })
    expect(res.candidates.map((c) => c.phone)).toEqual(['+17313946907'])
  })

  it('does NOT apply the Vapi/Tavus exclude — follow-up goes to all sales leads', async () => {
    // Even a lead that would be agent-handled for immediate still gets the follow-up.
    const leads = [lead(1, 'ACTIVE', 101, 30 * H)]
    const res = await gatherFollowupCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      deps: {
        call: fakeCall(leads, { '101': { firstName: 'Ann', phone: '7313946907' } }),
        hasRun: () => false,
      },
    })
    expect(res.candidates.map((c) => c.phone)).toEqual(['+17313946907'])
  })

  it('is idempotent — drops leads already followed up', async () => {
    const leads = [lead(1, 'ACTIVE', 101, 30 * H), lead(2, 'ACTIVE', 102, 30 * H)]
    const contacts = {
      '101': { firstName: 'Ann', phone: '7313946907' },
      '102': { firstName: 'Bob', phone: '2055550104' },
    }
    const done = new Set(['+17313946907'])
    const res = await gatherFollowupCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      deps: { call: fakeCall(leads, contacts), hasRun: (h) => done.has(h) },
    })
    expect(res.candidates.map((c) => c.phone)).toEqual(['+12055550104'])
    expect(res.dropped).toContainEqual({
      leadId: '1',
      phone: '+17313946907',
      reason: 'already followed up (dedup ledger)',
    })
  })

  it('computes the anniversary as created + 24h', async () => {
    const created = NOW - 30 * H
    const leads = [lead(1, 'ACTIVE', 101, 30 * H)]
    const res = await gatherFollowupCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      deps: { call: fakeCall(leads, { '101': { phone: '7313946907' } }), hasRun: () => false },
    })
    expect(res.candidates[0].anniversaryMs).toBe(created + FOLLOWUP_AFTER_MS)
  })

  it('reports the follow-up window CLOSED outside A2P daytime', async () => {
    const night = Date.parse('2026-07-08T22:30:00-05:00') // 10:30pm CT — closed
    const res = await gatherFollowupCandidates({
      profile: 'serra-honda',
      now: night,
      config: CONFIG,
      deps: { call: fakeCall([], {}), hasRun: () => false },
    })
    expect(res.windowOpen).toBe(false)
    expect(res.nextOpenMs).toBe(Date.parse('2026-07-09T08:00:00-05:00'))
  })
})
