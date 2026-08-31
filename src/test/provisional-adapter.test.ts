/**
 * Interim PROVISIONAL (non-promoting) adapter — unit tests.
 *
 * All inputs are SYNTHETIC, hand-built sheets with fabricated non-PII values. The suite
 * never reads the local-only workbooks, so it keeps passing after those fixtures are
 * removed. Covers: service-row exclusion, missing-is-not-zero, fail-closed dealer/period/
 * schema, provenance/footnote codes, source reconciliation, and strict-ledger nonmutation.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { computeProvisional, expectedPeriodFor, type ProvisionalFamily } from '../server/reports/provisional/provisional-adapter'
import type { XlsxSheet } from '../server/reports/provisional/xlsx-reader'

const DAILY = { start: '2026-08-29', end: '2026-08-29' }

// ── helpers ──────────────────────────────────────────────────────────────
const filtersSheet = (o: { dealer?: string; begin?: string; end?: string; intents?: string } = {}): XlsxSheet => ({
  name: 'Filters',
  rows: [
    ['Filter Name', 'Number Selected', 'Selected Values'],
    ['Dealers', '1', o.dealer ?? 'Serra Honda of Sylacauga'],
    ['Date Range Begin', '1', o.begin ?? 'Aug 24 2026 12:00AM'],
    ['Date Range End', '1', o.end ?? 'Aug 30 2026 11:59PM'],
    ['Lead Intents', '4', o.intents ?? 'Parts, Sales, Service, Unknown'],
  ],
})
const report = (header: string[], rows: string[][]): XlsxSheet => ({ name: 'Report', rows: [header, ...rows] })
const opts = (family: ProvisionalFamily, over: Partial<{ profile: string; expectedPeriod?: { start: string; end: string } }> = {}) => ({
  profile: over.profile ?? 'serra-honda',
  sourceFilename: `synthetic_${family}.xlsx`,
  checksumSha256: 'a'.repeat(64),
  expectedPeriod: 'expectedPeriod' in over ? over.expectedPeriod : family === 'sales_comm_log' ? undefined : { start: '2026-08-24', end: '2026-08-30' },
})

const COMM_HEADER = ['Dealer', 'User', 'Direction', 'Comm Type', 'Lead Type', 'Lead Source', 'Customer', 'Message Content']
// Customer / Message Content columns are present in the schema but the adapter must NEVER read them.
const commRow = (o: { dir: string; commType?: string; leadType?: string; source?: string }): string[] =>
  ['Serra Honda', 'RepX', o.dir, o.commType ?? 'Sales', o.leadType ?? 'Internet', o.source ?? 'Internet', 'DO-NOT-READ-NAME', 'DO-NOT-READ-BODY']

const ROI_HEADER = ['Lead Source', 'Total Leads', 'Good Leads', 'Bad Leads', 'Duplicate Leads', 'Sold from Leads', 'Total Gross', 'Total Cost', 'Profit']
const roiRow = (src: string, leads: number, sold: number, dup: number, gross: number, cost = 0): string[] =>
  [src, String(leads), String(leads - dup), String(dup), String(dup), String(sold), String(gross), String(cost), String(gross - cost)]

const CAGE_HEADER = ['Dealer', 'Lead Type', 'User', 'Total Leads', 'Sold from Leads', 'Appts Set', 'Appts Shown', 'Total Gross']

describe('provisional adapter — Sales Communication service-row exclusion', () => {
  it('excludes AND counts every Service/Parts-coded row (via Lead Type / Comm Type / Lead Source) before calculation', () => {
    const rows = [
      commRow({ dir: 'Outbound' }),
      commRow({ dir: 'Inbound' }),
      commRow({ dir: 'Outbound', leadType: 'Service' }), // service via Lead Type
      commRow({ dir: 'Outbound', source: 'Service Dept' }), // named service source
      commRow({ dir: 'Inbound', commType: 'Parts' }), // parts via Comm Type
    ]
    const r = computeProvisional('sales_comm_log', [report(COMM_HEADER, rows), filtersSheet()], opts('sales_comm_log'))
    expect(r.available).toBe(true)
    if (!r.available) return
    expect(r.rowsObserved).toBe(5)
    expect(r.serviceRowsExcluded).toBe(3)
    expect(r.salesRowsIncluded).toBe(2)
    const byId = new Map(r.metrics.map((m) => [m.id, m]))
    expect(byId.get('comm.sales_communications')!.value).toBe(2) // computed on the 2 sales rows ONLY
    expect(byId.get('comm.service_rows_excluded')!.value).toBe(3)
    expect(byId.get('comm.outbound')!.value).toBe(1) // only the 1 sales outbound (service outbounds excluded)
    expect(byId.get('comm.inbound')!.value).toBe(1)
    expect(r.reconciliation.reconciles).toBe(true) // excluded + included == observed
  })
})

describe('provisional adapter — missing is never zero', () => {
  it('fails closed (available:false) on wrong dealer — no zeroed metrics', () => {
    const r = computeProvisional('cage_kpi', [report(CAGE_HEADER, [['Serra Honda', 'Internet', 'RepX', '10', '2', '3', '2', '1000']]), filtersSheet({ dealer: 'Serra Nissan' })], opts('cage_kpi'))
    expect(r.available).toBe(false)
    if (r.available) return
    expect(r.failClosed).toBe('WRONG_DEALER')
    expect(r).not.toHaveProperty('metrics')
  })
  it('fails closed on wrong period (weekly family off the pinned window)', () => {
    const r = computeProvisional('lead_source_roi', [report(ROI_HEADER, [roiRow('Internet', 10, 2, 1, 1000)]), filtersSheet({ begin: 'Aug 17 2026 12:00AM', end: 'Aug 23 2026 11:59PM' })], opts('lead_source_roi'))
    expect(r.available).toBe(false)
    if (r.available) return
    expect(r.failClosed).toBe('WRONG_PERIOD')
  })
  it('returns null (not 0) for a metric whose source column is absent', () => {
    const noGross = ['Lead Source', 'Total Leads', 'Good Leads', 'Bad Leads', 'Duplicate Leads', 'Sold from Leads'] // Total Gross absent
    const r = computeProvisional('lead_source_roi', [report(noGross, [['Internet', '10', '9', '1', '1', '2']]), filtersSheet()], opts('lead_source_roi'))
    expect(r.available).toBe(true)
    if (!r.available) return
    const gross = r.metrics.find((m) => m.id === 'roi.total_gross')!
    expect(gross.value).toBeNull() // missing column → null, NOT 0
    expect(r.metrics.find((m) => m.id === 'roi.total_leads')!.value).toBe(10)
  })
  it('fails closed (missing, not zero) when there are zero data rows', () => {
    const r = computeProvisional('sales_comm_log', [report(COMM_HEADER, []), filtersSheet()], opts('sales_comm_log'))
    expect(r.available).toBe(false)
  })
  it('fails closed on schema mismatch (Report sheet absent)', () => {
    const r = computeProvisional('cage_kpi', [filtersSheet()], opts('cage_kpi'))
    expect(r.available).toBe(false)
    if (r.available) return
    expect(r.failClosed).toBe('SCHEMA_MISMATCH')
  })
})

describe('provisional adapter — row-level tenant gate (shadow bug 1)', () => {
  it('CAGE: a leaf row with a WRONG Dealer fails closed WRONG_DEALER even when the Filters dealer is correct', () => {
    const rows = [
      ['Serra Honda', 'Internet', 'RepA', '6', '1', '2', '1', '600'],
      ['Serra Nissan', 'Phone', 'RepB', '4', '1', '1', '1', '400'], // stray wrong-dealer leaf
      ['TOTAL', '', '', '10', '2', '3', '2', '1000'],
    ]
    const r = computeProvisional('cage_kpi', [report(CAGE_HEADER, rows), filtersSheet()], opts('cage_kpi'))
    expect(r.available).toBe(false)
    if (r.available) return
    expect(r.failClosed).toBe('WRONG_DEALER')
  })
  it('CAGE: a BLANK leaf Dealer fails closed WRONG_DEALER', () => {
    const rows = [['', 'Internet', 'RepA', '6', '1', '2', '1', '600'], ['TOTAL', '', '', '6', '1', '2', '1', '600']]
    const r = computeProvisional('cage_kpi', [report(CAGE_HEADER, rows), filtersSheet()], opts('cage_kpi'))
    expect(r.available).toBe(false)
    if (r.available) return
    expect(r.failClosed).toBe('WRONG_DEALER')
  })
  it('Sales Comm: a row with a WRONG Dealer fails closed WRONG_DEALER', () => {
    const rows = [commRow({ dir: 'Outbound' }), ['Serra Nissan', 'RepY', 'Inbound', 'Sales', 'Internet', 'Internet', 'DO-NOT-READ-NAME', 'DO-NOT-READ-BODY']]
    const r = computeProvisional('sales_comm_log', [report(COMM_HEADER, rows), filtersSheet()], opts('sales_comm_log'))
    expect(r.available).toBe(false)
    if (r.available) return
    expect(r.failClosed).toBe('WRONG_DEALER')
  })
})

describe('provisional adapter — pinned daily period (shadow bug 2)', () => {
  it('expectedPeriodFor pins comm to the daily window and weekly families to Aug 24–30', () => {
    expect(expectedPeriodFor('sales_comm_log')).toEqual({ start: '2026-08-29', end: '2026-08-29' })
    expect(expectedPeriodFor('cage_kpi')).toEqual({ start: '2026-08-24', end: '2026-08-30' })
    expect(expectedPeriodFor('lead_source_roi')).toEqual({ start: '2026-08-24', end: '2026-08-30' })
  })
  it('Sales Comm: a wrong-but-parseable day (Aug 28) fails closed WRONG_PERIOD against the pinned daily window', () => {
    const r = computeProvisional('sales_comm_log', [report(COMM_HEADER, [commRow({ dir: 'Outbound' })]), filtersSheet({ begin: 'Aug 28 2026 12:00AM', end: 'Aug 28 2026 11:59PM' })], opts('sales_comm_log', { expectedPeriod: DAILY }))
    expect(r.available).toBe(false)
    if (r.available) return
    expect(r.failClosed).toBe('WRONG_PERIOD')
  })
  it('Sales Comm: the exact pinned daily window (Aug 29) passes the period gate', () => {
    const r = computeProvisional('sales_comm_log', [report(COMM_HEADER, [commRow({ dir: 'Outbound' })]), filtersSheet({ begin: 'Aug 29 2026 12:00AM', end: 'Aug 29 2026 11:59PM' })], opts('sales_comm_log', { expectedPeriod: DAILY }))
    expect(r.available).toBe(true)
  })
})

describe('provisional adapter — present-but-all-blank column is null, not zero (shadow bug 3)', () => {
  it('ROI: a present Sold-from-Leads column with every leaf blank yields null (missing ≠ zero)', () => {
    const rows = [
      ['Internet', '10', '9', '1', '1', '', '1000', '0', '1000'], // Sold from Leads (col 5) blank
      ['Phone', '7', '6', '1', '0', '', '500', '0', '500'],
      ['Total', '17', '15', '2', '1', '', '1500', '0', '1500'],
    ]
    const r = computeProvisional('lead_source_roi', [report(ROI_HEADER, rows), filtersSheet()], opts('lead_source_roi'))
    if (!r.available) throw new Error('expected available')
    expect(r.metrics.find((m) => m.id === 'roi.sold_from_leads')!.value).toBeNull() // NOT 0
    expect(r.metrics.find((m) => m.id === 'roi.total_leads')!.value).toBe(17) // real observations still sum
  })
  it('CAGE: genuine numeric zeros (at least one 0 present) sum to 0, not null', () => {
    const rows = [['Serra Honda', 'Internet', 'RepA', '0', '0', '0', '0', '0'], ['TOTAL', '', '', '0', '0', '0', '0', '0']]
    const r = computeProvisional('cage_kpi', [report(CAGE_HEADER, rows), filtersSheet()], opts('cage_kpi'))
    if (!r.available) throw new Error('expected available')
    expect(r.metrics.find((m) => m.id === 'cage.total_leads')!.value).toBe(0) // genuine measured zero
  })
})

describe('provisional adapter — provenance + footnote codes', () => {
  it('always marks strictStatus=quarantined, provisional=true, and carries family limitation codes', () => {
    const r = computeProvisional('lead_source_roi', [report(ROI_HEADER, [roiRow('Internet', 10, 2, 1, 1000)]), filtersSheet()], opts('lead_source_roi'))
    expect(r.provenance.strictStatus).toBe('quarantined')
    expect(r.provenance.provisional).toBe(true)
    expect(r.provenance.family).toBe('lead_source_roi')
    expect(r.provenance.checksumSha256).toBe('a'.repeat(64))
    expect(r.provenance.period).toEqual({ start: '2026-08-24', end: '2026-08-30' })
    expect(r.provenance.limitationCodes).toContain('NOT_STRICT_ACCEPTANCE')
    expect(r.provenance.limitationCodes).toContain('HIDDEN_LEAD_INTENT_AGGREGATE')
    if (!r.available) return
    // aggregate ROI/CAGE metrics must footnote the hidden-lead-intent aggregate caveat
    for (const m of r.metrics.filter((x) => x.id !== 'roi.actual_roi')) expect(m.footnoteCodes).toContain('HIDDEN_LEAD_INTENT_AGGREGATE')
    // actual ROI withheld (cost zero) → value null, ROI_COST_ZERO code
    const roi = r.metrics.find((m) => m.id === 'roi.actual_roi')!
    expect(roi.value).toBeNull()
    expect(roi.footnoteCodes).toContain('ROI_COST_ZERO')
  })
  it('comm metrics footnote the row-level residual + service-exclusion codes', () => {
    const r = computeProvisional('sales_comm_log', [report(COMM_HEADER, [commRow({ dir: 'Outbound' })]), filtersSheet()], opts('sales_comm_log'))
    if (!r.available) throw new Error('expected available')
    const sales = r.metrics.find((m) => m.id === 'comm.sales_communications')!
    expect(sales.footnoteCodes).toContain('HIDDEN_LEAD_INTENT_ROWLEVEL_RESIDUAL')
    expect(sales.footnoteCodes).toContain('SERVICE_ROWS_EXCLUDED')
  })
})

describe('provisional adapter — source reconciliation', () => {
  it('ROI: Σ per-source Total Leads reconciles against the report TOTAL row', () => {
    const rows = [roiRow('Internet', 10, 2, 1, 1000), roiRow('Phone', 7, 1, 0, 500), ['Total', '17', '16', '1', '1', '3', '1500', '0', '1500']]
    const r = computeProvisional('lead_source_roi', [report(ROI_HEADER, rows), filtersSheet()], opts('lead_source_roi'))
    if (!r.available) throw new Error('expected available')
    expect(r.reconciliation.checked).toBe(true)
    expect(r.reconciliation.reconciles).toBe(true)
    expect(r.metrics.find((m) => m.id === 'roi.total_leads')!.value).toBe(17) // TOTAL row excluded from the sum
  })
  it('ROI: records reconciles=false on a mismatch (never throws)', () => {
    const rows = [roiRow('Internet', 10, 2, 1, 1000), ['Total', '999', '0', '0', '0', '0', '0', '0', '0']]
    const r = computeProvisional('lead_source_roi', [report(ROI_HEADER, rows), filtersSheet()], opts('lead_source_roi'))
    if (!r.available) throw new Error('expected available')
    expect(r.reconciliation.reconciles).toBe(false)
  })
  it('CAGE: sums LEAF rows only (ignores subtotals) and reconciles vs the grand TOTAL row', () => {
    const rows = [
      ['Serra Honda', 'Internet', 'RepA', '6', '1', '2', '1', '600'], // leaf
      ['Serra Honda', 'Phone', 'RepB', '4', '1', '1', '1', '400'], // leaf
      ['Serra Honda', 'Internet', '', '10', '2', '3', '2', '1000'], // Lead Type subtotal (User blank) — MUST be ignored
      ['TOTAL', '', '', '10', '2', '3', '2', '1000'], // grand total
    ]
    const r = computeProvisional('cage_kpi', [report(CAGE_HEADER, rows), filtersSheet()], opts('cage_kpi'))
    if (!r.available) throw new Error('expected available')
    expect(r.metrics.find((m) => m.id === 'cage.total_leads')!.value).toBe(10) // 6+4, NOT 20
    expect(r.metrics.find((m) => m.id === 'cage.rep_count')!.value).toBe(2)
    expect(r.reconciliation.reconciles).toBe(true)
  })
  it('CAGE: excluding a service leaf still reconciles (full-leaf sum vs TOTAL, not the sales subset)', () => {
    const rows = [
      ['Serra Honda', 'Internet', 'RepA', '6', '1', '2', '1', '600'], // sales leaf
      ['Serra Honda', 'Service', 'RepB', '3', '0', '0', '0', '0'], // SERVICE leaf — excluded from metrics, kept for reconciliation
      ['TOTAL', '', '', '9', '1', '2', '1', '600'], // grand total counts all leaves (6+3)
    ]
    const r = computeProvisional('cage_kpi', [report(CAGE_HEADER, rows), filtersSheet()], opts('cage_kpi'))
    if (!r.available) throw new Error('expected available')
    expect(r.serviceRowsExcluded).toBe(1)
    expect(r.metrics.find((m) => m.id === 'cage.total_leads')!.value).toBe(6) // sales-only (service excluded)
    expect(r.reconciliation.reconciles).toBe(true) // full-leaf 9 == TOTAL 9 despite the exclusion
  })
})

describe('provisional adapter — strict-ledger nonmutation (non-promoting by construction)', () => {
  it('every result is quarantined/provisional and NEVER accepted', () => {
    for (const fam of ['lead_source_roi', 'cage_kpi', 'sales_comm_log'] as ProvisionalFamily[]) {
      const rep = fam === 'sales_comm_log' ? report(COMM_HEADER, [commRow({ dir: 'Outbound' })])
        : fam === 'lead_source_roi' ? report(ROI_HEADER, [roiRow('Internet', 10, 2, 1, 1000)])
          : report(CAGE_HEADER, [['Serra Honda', 'Internet', 'RepA', '6', '1', '2', '1', '600']])
      const r = computeProvisional(fam, [rep, filtersSheet()], opts(fam))
      expect(r.provenance.strictStatus).toBe('quarantined')
      expect(r.provenance.provisional).toBe(true)
    }
  })
  it('the adapter source imports NO governed-store / DB / native-reader module (cannot write the ledger)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../server/reports/provisional/provisional-adapter.ts'), 'utf8')
    expect(src).not.toMatch(/brain-store|better-sqlite3|ingest_delivery|ingest_row|promoteHeld|ingest-native-metrics/)
    // read-only file access only (no write/append/unlink APIs)
    expect(src).not.toMatch(/writeFile|appendFile|unlink|rmSync|createWriteStream/)
  })
})
