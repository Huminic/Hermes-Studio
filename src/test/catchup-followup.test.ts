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
      waitHours: 24,
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
      waitHours: 24,
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
      waitHours: 24,
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
      waitHours: 24,
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
      waitHours: 24,
      deps: { call: fakeCall(leads, contacts), hasRun: (h) => done.has(h) },
    })
    expect(res.candidates.map((c) => c.phone)).toEqual(['+12055550104'])
    expect(res.dropped).toContainEqual({
      leadId: '1',
      phone: '+17313946907',
      reason: 'already followed up (dedup ledger)',
    })
  })

  it('computes the anniversary as created + the due cutoff (72h default)', async () => {
    const created = NOW - 80 * H
    const leads = [lead(1, 'ACTIVE', 101, 80 * H)] // 80h ago → due at the 72h default
    const res = await gatherFollowupCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      deps: { call: fakeCall(leads, { '101': { phone: '7313946907' } }), hasRun: () => false },
    })
    expect(res.waitHours).toBe(72)
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

/** A lead row carrying an explicit createdUtc + optional leadSource href. */
function leadAt(
  id: number,
  contactId: number,
  createdUtc: string,
  opts: { leadType?: string; leadSource?: string } = {},
): Lead {
  return {
    leadId: id,
    contact: `https://api.vinsolutions.com/contacts/id/${contactId}?dealerid=21043`,
    leadStatusType: 'ACTIVE',
    leadType: opts.leadType ?? 'INTERNET',
    ...(opts.leadSource ? { leadSource: opts.leadSource } : {}),
    createdUtc,
  }
}

describe('gatherFollowupCandidates — N1.1 flags', () => {
  it('--since drops leads created before the UTC-midnight floor and overrides the window start', async () => {
    const leads = [
      leadAt(1, 101, '2026-06-28T12:00:00Z'), // before 2026-07-01 floor → dropped
      leadAt(2, 102, '2026-07-05T12:00:00Z'), // after floor + due → candidate
    ]
    const contacts = {
      '101': { firstName: 'Old', phone: '7313946907' },
      '102': { firstName: 'New', phone: '2055550104' },
    }
    const res = await gatherFollowupCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      since: '2026-07-01',
      deps: { call: fakeCall(leads, contacts), hasRun: () => false },
    })
    expect(res.startDate).toBe('2026-07-01T00:00:00.000Z')
    expect(res.candidates.map((c) => c.phone)).toEqual(['+12055550104'])
    expect(res.dropped).toContainEqual(
      expect.objectContaining({ leadId: '1', reason: 'before since floor' }),
    )
  })

  it('--exclude-source drops by resolved source name (case-insensitive), keeps others', async () => {
    const leads = [
      leadAt(1, 101, '2026-07-07T00:00:00Z', {
        leadSource: 'https://api.vinsolutions.com/leadsources/id/555?dealerid=21043',
      }),
      leadAt(2, 102, '2026-07-07T00:00:00Z', {
        leadSource: 'https://api.vinsolutions.com/leadsources/id/777?dealerid=21043',
      }),
    ]
    const contacts = {
      '101': { firstName: 'Ann', phone: '7313946907' },
      '102': { firstName: 'Bob', phone: '2055550104' },
    }
    const res = await gatherFollowupCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      waitHours: 24,
      excludeSources: ['service dept'],
      sourceNames: new Map([
        ['555', 'Service Dept'],
        ['777', 'Cars.com'],
      ]),
      deps: { call: fakeCall(leads, contacts), hasRun: () => false },
    })
    expect(res.candidates.map((c) => c.phone)).toEqual(['+12055550104'])
    expect(res.candidates[0].leadSource).toBe('Cars.com')
    expect(res.dropped).toContainEqual(
      expect.objectContaining({ leadId: '1', reason: 'excluded source: service dept', leadSource: 'Service Dept' }),
    )
  })

  it('--exclude-source falls back to the raw id string when the name is unresolved', async () => {
    const leads = [
      leadAt(1, 101, '2026-07-07T00:00:00Z', {
        leadSource: 'https://api.vinsolutions.com/leadsources/id/999?dealerid=21043',
      }),
    ]
    const res = await gatherFollowupCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      waitHours: 24,
      excludeSources: ['999'],
      deps: {
        call: fakeCall(leads, { '101': { firstName: 'Ann', phone: '7313946907' } }),
        hasRun: () => false,
      },
    })
    expect(res.candidates).toHaveLength(0)
    expect(res.dropped).toContainEqual(
      expect.objectContaining({ leadId: '1', reason: 'excluded source: 999' }),
    )
  })

  it('--skip-texted-since drops a candidate already texted via the reply path', async () => {
    const leads = [
      leadAt(1, 101, '2026-07-06T00:00:00Z'),
      leadAt(2, 102, '2026-07-06T00:00:00Z'),
    ]
    const contacts = {
      '101': { firstName: 'Ann', phone: '7313946907' }, // → +17313946907, already texted
      '102': { firstName: 'Bob', phone: '2055550104' },
    }
    const alreadyTexted = new Set(['+17313946907'])
    const res = await gatherFollowupCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      waitHours: 24,
      skipTextedSince: '2026-08-15',
      deps: {
        call: fakeCall(leads, contacts),
        hasRun: () => false,
        hasTextedSince: (phone) => alreadyTexted.has(phone),
      },
    })
    expect(res.candidates.map((c) => c.phone)).toEqual(['+12055550104'])
    expect(res.dropped).toContainEqual(
      expect.objectContaining({
        leadId: '1',
        phone: '+17313946907',
        reason: 'already texted since 2026-08-15',
      }),
    )
  })

  it('populates salesCount and candidate.leadSource; flags absent ⇒ unchanged behaviour', async () => {
    const leads = [
      leadAt(1, 101, '2026-07-06T00:00:00Z', {
        leadSource: 'https://api.vinsolutions.com/leadsources/id/777?dealerid=21043',
      }),
      leadAt(2, 102, '2026-07-06T00:00:00Z', { leadType: 'SERVICE' }),
    ]
    const contacts = { '101': { firstName: 'Ann', phone: '7313946907' } }
    const res = await gatherFollowupCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      waitHours: 24,
      sourceNames: new Map([['777', 'Cars.com']]),
      deps: { call: fakeCall(leads, contacts), hasRun: () => false },
    })
    // one SERVICE lead dropped by the default sales-only filter → 1 sales lead
    expect(res.salesCount).toBe(1)
    expect(res.candidates).toHaveLength(1)
    expect(res.candidates[0].leadSource).toBe('Cars.com')
  })
})

describe('gatherFollowupCandidates — N4 due cutoff from wait_hours', () => {
  const contacts = { '101': { firstName: 'Ann', phone: '7313946907' } }

  it('a 30h-old lead is NOT due at the 72h default and is COUNTED as not-yet-due', async () => {
    const leads = [lead(1, 'ACTIVE', 101, 30 * H)]
    const res = await gatherFollowupCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      deps: { call: fakeCall(leads, contacts), hasRun: () => false },
    })
    expect(res.waitHours).toBe(72)
    expect(res.dueCount).toBe(0)
    expect(res.candidates).toHaveLength(0)
    expect(res.dropped).toContainEqual(
      expect.objectContaining({ leadId: '1', reason: 'not yet due (72h)' }),
    )
  })

  it('the same 30h-old lead IS due at a 24h wait_hours', async () => {
    const leads = [lead(1, 'ACTIVE', 101, 30 * H)]
    const res = await gatherFollowupCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      waitHours: 24,
      deps: { call: fakeCall(leads, contacts), hasRun: () => false },
    })
    expect(res.waitHours).toBe(24)
    expect(res.dueCount).toBe(1)
    expect(res.candidates.map((c) => c.phone)).toEqual(['+17313946907'])
  })

  it('an 80h-old lead is a candidate at the 72h default', async () => {
    const leads = [lead(1, 'ACTIVE', 101, 80 * H)]
    const res = await gatherFollowupCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      waitHours: 72,
      deps: { call: fakeCall(leads, contacts), hasRun: () => false },
    })
    expect(res.waitHours).toBe(72)
    expect(res.dueCount).toBe(1)
    expect(res.candidates.map((c) => c.phone)).toEqual(['+17313946907'])
  })

  it('falls back to 72h when wait_hours is 0', async () => {
    const leads = [
      lead(1, 'ACTIVE', 101, 80 * H), // due at 72h
      lead(2, 'ACTIVE', 102, 30 * H), // not due at 72h
    ]
    const res = await gatherFollowupCandidates({
      profile: 'serra-honda',
      now: NOW,
      config: CONFIG,
      waitHours: 0,
      deps: { call: fakeCall(leads, contacts), hasRun: () => false },
    })
    expect(res.waitHours).toBe(72)
    expect(res.dueCount).toBe(1)
    expect(res.candidates.map((c) => c.phone)).toEqual(['+17313946907'])
    expect(res.dropped).toContainEqual(
      expect.objectContaining({ leadId: '2', reason: 'not yet due (72h)' }),
    )
  })
})
