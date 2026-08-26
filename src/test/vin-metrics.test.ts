import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { recordDelivery } from '@/server/ingest/ingest-delivery-store'
import { runVinWatchdog, FAST_FOLLOW_MANIFEST } from '@/server/watchdog/vin-metrics'
import type { ReportKind } from '@/server/ingest/vin-contracts'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vin-metrics-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmp, '.hermes', 'profiles')
})
afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
})

const P = 'serra-honda'
const PERIOD = { start: '2026-08-04', end: '2026-08-10' }

function seed(kind: ReportKind, header: Array<string>, rows: Array<Array<string>>, checksum: string, status: 'accepted' | 'quarantined' = 'accepted') {
  recordDelivery(
    {
      profile: P, dealer: 'Serra Honda', report_kind: kind,
      period_start: PERIOD.start, period_end: PERIOD.end, source_filename: `${checksum}.xlsx`,
      source_filter_metadata: null, final_filter_metadata: null, checksum, parser_version: 'vin-xlsx-1',
      source_row_count: rows.length, accepted_row_count: status === 'accepted' ? rows.length : 0,
      header: status === 'accepted' ? header : [], validation_evidence: {}, status,
      quarantine_reason: status === 'quarantined' ? 'ambiguous-tenant' : null,
    },
    status === 'accepted' ? rows : [],
    1000,
  )
}

const APPT_H = ['Appointment ID', 'Dealer', 'Dealer ID', 'Appointment Start Date', 'Appointment Status', 'Is Confirmed', 'Rescheduled Date', 'Completed Date', 'Is Show', 'Is No Show', 'Appointment Reason']
const APPT_ROWS = [
  ['A1', 'Serra Honda', '123', '2026-08-06', 'Scheduled', 'TRUE', '', '2026-08-06', 'TRUE', 'FALSE', 'Sales Appointment'],
  ['A2', 'Serra Honda', '123', '2026-08-07', 'Scheduled', 'TRUE', '', '', 'FALSE', 'TRUE', 'Sales Appointment'],
  ['A3', 'Serra Honda', '123', '2026-08-08', 'Cancelled', 'FALSE', '', '', 'FALSE', 'FALSE', 'Sales Appointment'],
  ['A4', 'Serra Honda', '123', '2026-08-09', 'Rescheduled', 'TRUE', '2026-08-10', '', 'FALSE', 'FALSE', 'Sales Appointment'],
]
const GROSS_H = ['Dealer', 'Dealer ID', 'Sold Date', 'Sale ID', 'Deal Number', 'Delivered status', 'Front Gross', 'Back Gross', 'Total Gross']
const GROSS_ROWS = [
  ['Serra Honda', '123', '2026-08-05', 'S1', 'D1', 'Delivered', '1000', '500', '1500'],
  ['Serra Honda', '123', '2026-08-06', 'S2', 'D2', 'Delivered', '900', '400', '1200'],
]
const ROI_H = ['Dealer', 'Lead_Source', 'Total_Leads', 'Good_Leads', 'Bad_Leads', 'Duplicate_Leads', 'Sold_from_Leads']
const ROI_ROWS = [['Serra Honda', 'Repeat', '79', '79', '0', '0', '24'], ['Serra Honda', 'Autoweb', '20', '15', '5', '3', '2']]
const CAGE_H = ['User', 'Total Leads', 'Total Comms', 'Deals from Leads']
const CAGE_ROWS = [['Jane', '40', '300', '4'], ['Joe', '35', '250', '3']]
const COMM_H = ['Dealer', 'User Group', 'User', 'Customer', 'Activity Date', 'Direction', 'Comm Channel', 'Comm Type', 'Interaction Result', 'Lead Type', 'Lead Status Type', 'Lead Source', 'Lead Created Date', 'Message Content']
const comm = (dir: string, user: string, cust: string, date: string, body: string) => ['Serra Honda', 'Sales', user, cust, date, dir, 'SMS', 'Text', 'Reached', 'Internet', 'Sales', 'Autoweb', '2026-08-04', body]
const COMM_ROWS = [
  comm('Outbound', 'Jane', 'Bob', '2026-08-05T10:00:00Z', 'Hi there'),
  comm('Outbound', 'Joe', 'Bob', '2026-08-05T12:00:00Z', 'Hi there'), // Bob: 2 reps within 24h
  comm('Outbound', 'Jane', 'C3', '2026-08-05T10:00:00Z', 'Hi there'),
  comm('Outbound', 'Jane', 'C4', '2026-08-05T10:00:00Z', 'Hi there'),
  comm('Outbound', 'Jane', 'C5', '2026-08-05T10:00:00Z', 'Hi there'), // 'Hi there' x5 → 1 overused template
  comm('Outbound', 'Jane', 'C6', '2026-08-05T10:00:00Z', 'I need a manager now'), // escalation
  comm('Inbound', 'Jane', 'C7', '2026-08-05T09:00:00Z', 'What is your best price, is it available today?'), // inbound high-intent
  comm('Outbound', 'Jane', 'C8', '2026-08-05T09:30:00Z', 'https://serrahonda.com/vdp/123'), // outbound link-only
]
const DASH_H: Array<string> = []
const DASH_ROWS = [['Dealership Summary'], ['Leads', 'Appts', 'Sold'], ['414', '120', '19'], ['Visit Summary'], ['Total Visits', 'Sold %'], ['42', '45%']]

function seedAll() {
  seed('appointments', APPT_H, APPT_ROWS, 'appt')
  seed('crm_sales_gross', GROSS_H, GROSS_ROWS, 'gross')
  seed('lead_source_roi', ROI_H, ROI_ROWS, 'roi')
  seed('cage_kpi', CAGE_H, CAGE_ROWS, 'cage')
  seed('sales_comm_log', COMM_H, COMM_ROWS, 'comm')
  seed('dealership_performance', DASH_H, DASH_ROWS, 'dash')
}
const byId = (run: ReturnType<typeof runVinWatchdog>) => new Map(run.metrics.map((m) => [m.metric_id, m]))

describe('Semantic Watchdog calculation engine — six-kind safe aggregates', () => {
  it('computes appointment rates', () => {
    seedAll()
    const m = byId(runVinWatchdog(P, { period_start: PERIOD.start, period_end: PERIOD.end, dealer: 'Serra Honda' }))
    expect(m.get('appt.show_rate')).toMatchObject({ value: 0.25, count: 1 })
    expect(m.get('appt.confirmed_rate')).toMatchObject({ value: 0.75, count: 3 })
    expect(m.get('appt.no_show_rate')).toMatchObject({ value: 0.25, count: 1 })
  })

  it('reconciles gross front+back vs total (with row refs)', () => {
    seedAll()
    const m = byId(runVinWatchdog(P, PERIOD_OPTS))
    expect(m.get('gross.reconciliation_mismatches')).toMatchObject({ value: 1, count: 2 })
    expect(m.get('gross.reconciliation_mismatches')!.evidence.row_refs).toEqual([1])
    expect(m.get('gross.total_sum')!.value).toBe(2700)
  })

  it('ROI volume/funnel uses the corrected cost wording and never emits an actual ROI number', () => {
    seedAll()
    const run = runVinWatchdog(P, PERIOD_OPTS)
    const m = byId(run)
    expect(m.get('roi.total_leads')!.value).toBe(99)
    expect(m.get('roi.sold_from_leads')!.value).toBe(26)
    // corrected wording: schema HAS cost/profit fields, but configured costs are zero
    const lim = m.get('roi.total_leads')!.limitations.join(' ')
    expect(lim).toMatch(/includes cost\/profit fields/i)
    expect(lim).toMatch(/configured source costs are zero/i)
    expect(lim).not.toMatch(/carries no cost/i)
    // actual ROI is never a computed metric — it is withheld with a delivery-specific reason
    expect(m.has('roi.actual_roi')).toBe(false)
    const wh = run.withheld.find((w) => w.metric_id === 'roi.actual_roi')
    expect(wh).toBeTruthy()
    expect(wh!.reason).toMatch(/cost\/profit fields/i)
    expect(FAST_FOLLOW_MANIFEST.some((f) => f.metric_id === 'roi.actual_roi')).toBe(true)
  })

  it('CAGE rep baselines', () => {
    seedAll()
    const m = byId(runVinWatchdog(P, PERIOD_OPTS))
    expect(m.get('cage.rep_count')!.value).toBe(2)
    expect(m.get('cage.total_comms')!.value).toBe(550)
  })

  it('comm metrics (incl. new screens) are provisional, PII-safe, and never persist bodies', () => {
    seedAll()
    const run = runVinWatchdog(P, PERIOD_OPTS)
    const m = byId(run)
    expect(m.get('comm.template_overuse')).toMatchObject({ value: 1, provisional: true })
    expect(m.get('comm.escalation_keyword_screen')).toMatchObject({ value: 1, provisional: true })
    expect(m.get('comm.multi_rep_within_24h')).toMatchObject({ value: 1, provisional: true })
    // NEW screens: inbound high-intent + outbound link-only (row_refs only)
    expect(m.get('comm.inbound_high_intent_keywords')).toMatchObject({ value: 1, provisional: true })
    expect(m.get('comm.inbound_high_intent_keywords')!.evidence.row_refs!.length).toBe(1)
    expect(m.get('comm.outbound_link_only')).toMatchObject({ value: 1, provisional: true })
    expect(m.get('comm.outbound_link_only')!.evidence.row_refs!.length).toBe(1)
    // PII: no message body text anywhere in the output (incl. new fixtures)
    const blob = JSON.stringify(run)
    expect(blob).not.toContain('Hi there')
    expect(blob).not.toContain('I need a manager now')
    expect(blob).not.toContain('best price')
    expect(blob).not.toContain('serrahonda.com/vdp/123')
  })

  it('dashboard is surfaced as an aggregate basis, not re-derived', () => {
    seedAll()
    const m = byId(runVinWatchdog(P, PERIOD_OPTS))
    expect(m.get('dashboard.section_markers')!.limitations.join(' ')).toMatch(/not re-derived/i)
  })
})

const PERIOD_OPTS = { period_start: PERIOD.start, period_end: PERIOD.end, dealer: 'Serra Honda' }

describe('contract, contamination guard, unsupported-claims, determinism', () => {
  it('every metric carries the full output contract + no autonomous action', () => {
    seedAll()
    for (const m of runVinWatchdog(P, PERIOD_OPTS).metrics) {
      expect(m.metric_id).toBeTruthy()
      expect(m.period).toEqual(PERIOD)
      expect(m.profile).toBe(P)
      expect(m.dealer).toBe('Serra Honda')
      expect(m.source_kinds.length).toBeGreaterThan(0)
      expect(m.explanation).toBeTruthy()
      expect(m.evidence.delivery_ids.length).toBeGreaterThan(0)
      expect(m.evidence.aggregate_basis).toBeTruthy()
      expect(typeof m.derived).toBe('boolean')
      expect(m.limitations.length).toBeGreaterThan(0)
      expect(m.autonomous_action).toBe(false)
    }
  })

  it('CONTAMINATION: a quarantined/absent source withholds ALL its metrics', () => {
    seed('appointments', APPT_H, APPT_ROWS, 'appt') // only appointments accepted
    seed('crm_sales_gross', GROSS_H, GROSS_ROWS, 'grossQ', 'quarantined') // gross quarantined → no rows
    const run = runVinWatchdog(P, PERIOD_OPTS)
    const ids = new Set(run.metrics.map((m) => m.metric_id))
    expect(ids.has('appt.show_rate')).toBe(true)
    // gross + all unseeded kinds withheld
    const withheldIds = new Set(run.withheld.map((w) => w.metric_id))
    expect(withheldIds.has('gross.total_sum')).toBe(true)
    expect(withheldIds.has('roi.total_leads')).toBe(true)
    expect(run.withheld.every((w) => w.status === 'withheld')).toBe(true)
  })

  it('no metric asserts causality or thread identity', () => {
    seedAll()
    for (const m of runVinWatchdog(P, PERIOD_OPTS).metrics) {
      const lim = m.limitations.join(' ')
      expect(lim).toMatch(/No causal claim|not re-derived|point-in-time|within-row/i)
    }
  })

  it('superseded revision isolation: metrics use only the active revision', () => {
    seed('lead_source_roi', ROI_H, ROI_ROWS, 'roi-v1') // total 99
    seed('lead_source_roi', ROI_H, [['Serra Honda', 'Repeat', '100', '100', '0', '0', '30']], 'roi-v2') // corrected → total 100
    const m = byId(runVinWatchdog(P, PERIOD_OPTS))
    expect(m.get('roi.total_leads')!.value).toBe(100) // v2 only, never 199
  })

  it('deterministic output across runs', () => {
    seedAll()
    expect(JSON.stringify(runVinWatchdog(P, PERIOD_OPTS))).toBe(JSON.stringify(runVinWatchdog(P, PERIOD_OPTS)))
  })

  it('fast-follow manifest enumerates the unsafe cross-family metrics + required keys', () => {
    const ids = FAST_FOLLOW_MANIFEST.map((f) => f.metric_id)
    expect(ids).toContain('cross.lead_to_appointment_to_sale_funnel')
    expect(ids).toContain('comm.response_latency_unanswered')
    for (const f of FAST_FOLLOW_MANIFEST) expect(f.requires.length).toBeGreaterThan(0)
  })
})

describe('ROI Option A: native spaced VinSolutions headers compute (no producer rename)', () => {
  it('spaced ROI headers ("Total Leads", "Sold from Leads", …) compute the same as underscored', () => {
    // The real VinSolutions XLSX export lands with SPACED headers; Codex must not
    // rename them. The consumer recognizes them (space/underscore-insensitive).
    const SPACED = ['Dealer', 'Lead Source', 'Total Leads', 'Good Leads', 'Bad Leads', 'Duplicate Leads', 'Sold from Leads']
    seed('lead_source_roi', SPACED, [['Serra Honda', 'Repeat', '79', '79', '0', '0', '24'], ['Serra Honda', 'Autoweb', '20', '15', '5', '3', '2']], 'roi-spaced')
    const run = runVinWatchdog(P, PERIOD_OPTS)
    const m = byId(run)
    expect(m.get('roi.total_leads')!.value).toBe(99)
    expect(m.get('roi.sold_from_leads')!.value).toBe(26)
    expect(m.get('roi.duplicate_rate')!.count).toBe(3)
    // not withheld for a missing column when the spaced column is present
    expect(run.withheld.find((w) => w.metric_id === 'roi.total_leads')).toBeUndefined()
  })
})

describe('missing/late/unsupported-data-never-zero rule', () => {
  it('an absent required column WITHHOLDS the metric (never emits zero)', () => {
    // ROI export missing the Sold_from_Leads column entirely
    const H = ['Dealer', 'Lead_Source', 'Total_Leads', 'Good_Leads', 'Bad_Leads', 'Duplicate_Leads']
    seed('lead_source_roi', H, [['Serra Honda', 'Repeat', '79', '79', '0', '0']], 'roi-nosold')
    const run = runVinWatchdog(P, PERIOD_OPTS)
    // NOT present as a metric (would have been a misleading 0)
    expect(run.metrics.find((m) => m.metric_id === 'roi.sold_from_leads')).toBeUndefined()
    const wh = run.withheld.find((w) => w.metric_id === 'roi.sold_from_leads')
    expect(wh).toBeTruthy()
    expect(wh!.reason).toMatch(/Sold_from_Leads/)
    expect(wh!.reason).toMatch(/absent/i)
    // volume metric whose columns ARE present still computes
    expect(byId(run).get('roi.total_leads')!.value).toBe(79)
  })

  it('a legitimate source zero remains a real metric (value 0, not withheld)', () => {
    const H = ['Dealer', 'Lead_Source', 'Total_Leads', 'Good_Leads', 'Bad_Leads', 'Duplicate_Leads', 'Sold_from_Leads']
    seed('lead_source_roi', H, [['Serra Honda', 'Repeat', '79', '79', '0', '0', '0']], 'roi-zero-sold')
    const run = runVinWatchdog(P, PERIOD_OPTS)
    const m = byId(run).get('roi.sold_from_leads')
    expect(m).toBeTruthy()
    expect(m!.value).toBe(0) // real zero preserved
    expect(run.withheld.find((w) => w.metric_id === 'roi.sold_from_leads')).toBeUndefined()
  })

  it('an unparseable required value WITHHOLDS the metric with a row-specific reason', () => {
    seed('crm_sales_gross', GROSS_H, [['Serra Honda', '123', '2026-08-05', 'S1', 'D1', 'Delivered', '1000', '500', 'NaN$$']], 'gross-bad')
    const run = runVinWatchdog(P, PERIOD_OPTS)
    const wh = run.withheld.find((w) => w.metric_id === 'gross.total_sum')
    expect(wh).toBeTruthy()
    expect(wh!.reason).toMatch(/unparseable/i)
    expect(run.metrics.find((m) => m.metric_id === 'gross.total_sum')).toBeUndefined()
  })
})
