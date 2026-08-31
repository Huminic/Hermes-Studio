/**
 * INTERNAL PROTOTYPE Halo Data card — unit tests (pure builder + HTML renderer).
 *
 * Uses synthetic strict-reader results + synthetic provisional results (no store, no
 * fixtures, no PII). Covers: watermark/labeling, numbered footnotes/endnotes, inert
 * recommendations, strict-vs-provisional provenance tiers, and PII-absence in the output.
 */
import { describe, it, expect } from 'vitest'
import {
  buildPrototypeCard,
  renderPrototypeCardHtml,
  PROTOTYPE_WATERMARK,
  type ProvisionalReaders,
  type StrictReaders,
} from '../server/reports/provisional/provisional-prototype-card'
import type { DataFreshness } from '../server/reports/data-freshness'
import type { ProvisionalResult } from '../server/reports/provisional/provisional-adapter'

const freshness: DataFreshness = { dataThrough: '2026-08-30', dataThroughLabel: 'Aug 30, 2026', ageDays: 1, ageLabel: 'Data through Aug 30, 2026 · updated yesterday', state: 'current' }

const strict: StrictReaders = {
  dp: { available: true, source: 'dealership_performance', provenance: { deliveryId: 'd1', checksum: 'c'.repeat(64), parserVersion: 'vin-xlsx-1', period: { start: '2026-08-24', end: '2026-08-30' }, acceptedRows: 40, reportKind: 'dealership_performance' }, summary: { leads: 100, apptsSet: 20, apptsShow: 12, totalVisits: 30, visitsSold: 8, soldInPeriod: 8, frontGross: null, backGross: null, totalGross: null, avgTotalGross: null, responseTimeAdjustedAvgMin: null, responseTimeActualAvgMin: null }, byInventoryType: [] },
  appt: { available: true, source: 'appointments', provenance: { deliveryId: 'd2', checksum: 'e'.repeat(64), parserVersion: 'vin-xlsx-1', period: { start: '2026-08-24', end: '2026-08-30' }, acceptedRows: 14, reportKind: 'appointments' }, total: 14, completed: 8, confirmed: 5, show: 7, noShow: 4, cancelled: 1, rescheduled: 0, byStatus: {} },
  gross: { available: true, source: 'crm_sales_gross', provenance: { deliveryId: 'd3', checksum: 'f'.repeat(64), parserVersion: 'vin-xlsx-1', period: { start: '2026-08-24', end: '2026-08-30' }, acceptedRows: 5, reportKind: 'crm_sales_gross' }, rowCount: 5, frontSum: 8000, backSum: 6000, totalSum: 14000, reconciliationMismatches: 0 },
}

const provResult = (family: ProvisionalResult['provenance']['family'], metrics: Array<{ id: string; label: string; value: number | null; footnoteCodes: any[] }>, svcExcl = 0): ProvisionalResult => ({
  available: true,
  provenance: { sourceFilename: `synthetic_${family}.xlsx`, checksumSha256: '1'.repeat(64), profile: 'serra-honda', dealer: 'Serra Honda of Sylacauga', family, period: { start: '2026-08-24', end: '2026-08-30' }, strictStatus: 'quarantined', provisional: true, limitationCodes: ['NOT_STRICT_ACCEPTANCE', 'HIDDEN_LEAD_INTENT_AGGREGATE'] },
  rowsObserved: 20, serviceRowsExcluded: svcExcl, salesRowsIncluded: 20 - svcExcl,
  reconciliation: { checked: true, reconciles: true, detail: 'ok' },
  metrics: metrics.map((m) => ({ ...m, unit: 'count' as const, basis: 'synthetic' })),
})

const prov: ProvisionalReaders = {
  roi: provResult('lead_source_roi', [
    { id: 'roi.total_leads', label: 'Total leads across sources', value: 67, footnoteCodes: ['HIDDEN_LEAD_INTENT_AGGREGATE', 'SINGLE_PERIOD_BASELINE', 'NO_CAUSALITY'] },
    { id: 'roi.sold_from_leads', label: 'Sold from leads', value: 4, footnoteCodes: ['HIDDEN_LEAD_INTENT_AGGREGATE'] },
    { id: 'roi.total_gross', label: 'Total gross across sources', value: 26448, footnoteCodes: ['HIDDEN_LEAD_INTENT_AGGREGATE'] },
    { id: 'roi.duplicate_rate', label: 'Duplicate-lead rate', value: 0.1, footnoteCodes: ['HIDDEN_LEAD_INTENT_AGGREGATE'] },
  ]),
  cage: provResult('cage_kpi', [
    { id: 'cage.rep_count', label: 'Active sales reps in period', value: 17, footnoteCodes: ['HIDDEN_LEAD_INTENT_AGGREGATE'] },
    { id: 'cage.total_leads', label: 'Total leads worked', value: 67, footnoteCodes: ['HIDDEN_LEAD_INTENT_AGGREGATE'] },
    { id: 'cage.appts_set', label: 'Appointments set', value: 2, footnoteCodes: ['HIDDEN_LEAD_INTENT_AGGREGATE'] },
    { id: 'cage.appts_shown', label: 'Appointments shown', value: 2, footnoteCodes: ['HIDDEN_LEAD_INTENT_AGGREGATE'] },
  ]),
  comm: provResult('sales_comm_log', [
    { id: 'comm.sales_communications', label: 'Sales communications logged', value: 246, footnoteCodes: ['HIDDEN_LEAD_INTENT_ROWLEVEL_RESIDUAL', 'SERVICE_ROWS_EXCLUDED', 'NO_CAUSALITY'] },
    { id: 'comm.inbound', label: 'Inbound customer messages', value: 28, footnoteCodes: ['HIDDEN_LEAD_INTENT_ROWLEVEL_RESIDUAL'] },
    { id: 'comm.outbound', label: 'Outbound rep messages', value: 218, footnoteCodes: ['HIDDEN_LEAD_INTENT_ROWLEVEL_RESIDUAL'] },
  ]),
}

describe('prototype card — watermark + labeling', () => {
  const card = buildPrototypeCard('serra-honda', 'Serra Honda', strict, freshness, prov)
  it('carries the exact Internal-Prototype watermark and a positive title (no "limitation" heading)', () => {
    expect(card.watermark).toBe(PROTOTYPE_WATERMARK)
    expect(card.watermark).toBe('Internal Prototype — Not Strict M1R Acceptance')
    expect(card.title).toBe('Serra Honda Sales Performance and Growth Report')
    for (const s of card.sections) expect(s.heading.toLowerCase()).not.toMatch(/limitation|caveat|quarantine|unavailable/)
  })
  it('renders the watermark into the HTML (banner + ghost + title + footer) and endnotes', () => {
    const html = renderPrototypeCardHtml(card)
    expect(html.split(PROTOTYPE_WATERMARK).length - 1).toBeGreaterThanOrEqual(3)
    expect(html).toContain('Endnotes')
    expect(html).toContain('Serra Honda Sales Performance and Growth Report')
  })
})

describe('prototype card — numbered footnotes / endnotes', () => {
  const card = buildPrototypeCard('serra-honda', 'Serra Honda', strict, freshness, prov)
  it('numbers footnotes 1..n uniquely and every referenced note exists', () => {
    const nums = card.footnotes.map((f) => f.n)
    expect(nums).toEqual(Array.from({ length: nums.length }, (_, i) => i + 1))
    const valid = new Set(nums)
    const refs = [...card.sections.flatMap((s) => s.items), ...card.opportunities].flatMap((i) => i.notes)
    expect(refs.length).toBeGreaterThan(0)
    for (const r of refs) expect(valid.has(r)).toBe(true)
    // the hidden-lead-intent aggregate caveat is present in the endnotes
    expect(card.footnotes.some((f) => /hidden Lead Intent/i.test(f.text))).toBe(true)
  })
})

describe('prototype card — inert recommendations (nothing activated)', () => {
  const card = buildPrototypeCard('serra-honda', 'Serra Honda', strict, freshness, prov)
  it('has manager / sales-manager / salesperson recommendations, all INERT', () => {
    const audiences = card.recommendations.map((r) => r.audience)
    expect(audiences).toEqual(['Manager', 'Sales Manager', 'Salesperson'])
    for (const r of card.recommendations) expect(r.status).toMatch(/INERT/)
    const html = renderPrototypeCardHtml(card)
    expect(html).toMatch(/INERT/)
    expect(html).not.toMatch(/\bsend\b|\bactivate\b|\benabled\b/i)
  })
})

describe('prototype card — provenance tiers + PII absence', () => {
  const card = buildPrototypeCard('serra-honda', 'Serra Honda', strict, freshness, prov)
  it('separates strict-accepted (3) from provisional-quarantined (3) with checksums only', () => {
    const strictRows = card.provenance.filter((p) => p.tier === 'strict-accepted')
    const provRows = card.provenance.filter((p) => p.tier === 'provisional-quarantined')
    expect(strictRows.map((r) => r.family).sort()).toEqual(['appointments', 'crm_sales_gross', 'dealership_performance'])
    expect(provRows.map((r) => r.family).sort()).toEqual(['cage_kpi', 'lead_source_roi', 'sales_comm_log'])
    for (const r of provRows) { expect(r.strictStatus).toBe('quarantined'); expect(r.provisional).toBe(true) }
    for (const r of card.provenance) expect(r.checksum12.length).toBeLessThanOrEqual(12)
  })
  it('never emits raw-row / PII columns into the rendered HTML', () => {
    const html = renderPrototypeCardHtml(card)
    for (const banned of ['Message Content', 'DO-NOT-READ', 'Customer Name']) expect(html).not.toContain(banned)
    expect(html).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i) // no email addresses
    expect(html).not.toMatch(/\b\d{3}[-.]\d{3}[-.]\d{4}\b/) // no phone numbers
    // aggregate counts ARE present (proves we render numbers, not rows)
    expect(html).toContain('246')
  })
})
