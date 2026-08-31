import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import {
  buildSalesGrowthCard,
  externalForbiddenHits,
  renderExternalCardHtml,
  resolveSalesGrowthCard,
} from '../server/reports/sales-growth-card'
import { computeDataFreshness } from '../server/reports/data-freshness'

const NOW = new Date('2026-08-31T12:00:00Z')
const fresh = computeDataFreshness(['2026-08-30'], NOW)

const DP = (o: Record<string, number | null>) =>
  ({
    available: true, source: 'dealership_performance',
    provenance: { reportKind: 'dealership_performance', period: { start: '2026-08-24', end: '2026-08-30' }, acceptedRows: 40, checksum: 'dpchk' },
    byInventoryType: [],
    summary: { leads: null, apptsSet: null, apptsShow: null, totalVisits: null, visitsSold: null, soldInPeriod: null, frontGross: null, backGross: null, totalGross: null, avgTotalGross: null, ...o },
  }) as never
const AP = (o: { total: number; show?: number; noShow?: number; confirmed?: number; cancelled?: number }) =>
  ({
    available: true, source: 'appointments',
    provenance: { reportKind: 'appointments', period: { start: '2026-08-24', end: '2026-08-30' }, acceptedRows: o.total, checksum: 'apchk' },
    total: o.total, completed: 0, confirmed: o.confirmed ?? 0, show: o.show ?? 0, noShow: o.noShow ?? 0, cancelled: o.cancelled ?? 0, rescheduled: 0, byStatus: {},
  }) as never
const GROSS = (totalSum: number, rowCount: number) =>
  ({
    available: true, source: 'crm_sales_gross',
    provenance: { reportKind: 'crm_sales_gross', period: { start: '2026-08-24', end: '2026-08-30' }, acceptedRows: rowCount, checksum: 'grchk' },
    rowCount, frontSum: totalSum, backSum: 0, totalSum, reconciliationMismatches: 0,
  }) as never
const NA = { available: false, reason: 'x' } as never

describe('sales-growth-card (builder, positive external + separate internal)', () => {
  it('external carries the visible data-through label and no internal vocabulary', () => {
    const { external, internal } = buildSalesGrowthCard('serra-honda', 'Serra Honda',
      { dp: DP({ soldInPeriod: 5, apptsSet: 10, apptsShow: 8, totalVisits: 26, visitsSold: 4 }), appt: AP({ total: 14, show: 8, noShow: 5, confirmed: 7 }), gross: GROSS(14185.2, 5) }, fresh)
    expect(external.title).toBe('Serra Honda Sales Performance and Growth Report')
    expect(external.dataThrough).toBe('Data through Aug 30, 2026 · updated yesterday')
    expect(external).not.toBeNull()
    expect(externalForbiddenHits(external!)).toEqual([])
    // supported metrics surfaced; appointments framed as historical ("recorded this week")
    const flat = JSON.stringify(external)
    expect(flat).toContain('$14,185')
    expect(flat).toContain('vehicles delivered')
    expect(flat).toContain('recorded this week')
    expect(flat).not.toMatch(/on the board|upcoming appointment/i)
    // internal holds provenance + held families + precedence (NOT in external)
    expect(internal.acceptedFamilies.map((f) => f.family).sort()).toEqual(['appointments', 'crm_sales_gross', 'dealership_performance'])
    expect(internal.heldFamilies.map((f) => f.family).sort()).toEqual(['cage_kpi', 'lead_source_roi', 'sales_comm_log'])
    expect(internal.grossSourcePrecedence).toMatch(/CRM Sales Gross \(per-deal, AUTHORITATIVE\)/)
  })

  it('OMITS unsupported metrics cleanly (absent gross/appointments → no gross/appt items, no zeros)', () => {
    const { external } = buildSalesGrowthCard('x', 'Test Dealer', { dp: DP({ soldInPeriod: 3 }), appt: NA, gross: NA }, fresh)
    expect(external).not.toBeNull()
    const flat = JSON.stringify(external)
    expect(flat).not.toContain('gross')
    expect(flat).not.toContain('appointment')
    expect(externalForbiddenHits(external!)).toEqual([])
    // no fabricated zeros
    expect(flat).not.toContain('$0')
  })

  it('STALE freshness FAILS CLOSED: external is null (internal-only), no customer message', () => {
    const staleF = computeDataFreshness(['2026-08-30'], new Date('2026-09-20T12:00:00Z'))
    expect(staleF.state).toBe('stale')
    const { external, internal } = buildSalesGrowthCard('x', 'Test Dealer', { dp: DP({ soldInPeriod: 3 }), appt: NA, gross: NA }, staleF)
    expect(external).toBeNull() // not published; no "Data not yet available" to the customer
    expect(internal.freshnessState).toBe('stale')
  })

  it('MISSING freshness FAILS CLOSED: external is null (internal-only)', () => {
    const missingF = computeDataFreshness([], NOW)
    expect(missingF.state).toBe('missing')
    const { external, internal } = buildSalesGrowthCard('x', 'Test Dealer', { dp: NA, appt: NA, gross: NA }, missingF)
    expect(external).toBeNull()
    expect(internal.freshnessState).toBe('missing')
    expect(internal.dataThrough).toBeNull()
  })
})

// ── Rendered presentation proof against the real promoted store, all three profiles ──
const REAL_ROOT = '/srv/ingest-dev/analytics'
const HAVE = fs.existsSync(`${REAL_ROOT}/serra-honda/brain/brain.db`)
describe.runIf(HAVE)('sales-growth-card rendered presentation (isolated store)', () => {
  const saved = process.env.BRAIN_PROFILES_ROOT
  beforeAll(() => { process.env.BRAIN_PROFILES_ROOT = REAL_ROOT })
  afterAll(() => { if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT; else process.env.BRAIN_PROFILES_ROOT = saved })

  it('all three profiles render a visible "Data through Aug 30, 2026" with a plain age and no internal words', () => {
    for (const [profile, dealer] of [['serra-honda', 'Serra Honda'], ['serra-nissan', 'Serra Nissan'], ['tony-serra-ford', 'Tony Serra Ford']]) {
      const { external } = resolveSalesGrowthCard(profile, NOW)
      const html = renderExternalCardHtml(external)
      expect(html).toContain(`${dealer} Sales Performance and Growth Report`)
      expect(html).toContain('Data through Aug 30, 2026')
      expect(html).toMatch(/updated (today|yesterday|\d+ days ago)/)
      expect(externalForbiddenHits(external)).toEqual([])
    }
  })
})
