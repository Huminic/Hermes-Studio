/**
 * Focused tests for the M1R real-data E2E lib + polished card + committed identity manifest.
 * PII-FREE: every fixture is hand-built; the real (local-only) workbooks are never needed here.
 *
 * Covers: lane classification, identity/report-kind binding, strict technical-pass (incl. watchdog
 * reconciliation and required-metrics), provisional non-promotion pass, missing≠zero + wrong
 * dealer/period/schema-style negatives, card model consuming receipt cells, and the aggregate-only
 * identity manifest invariants (18 unique, 9 ACCEPT / 9 QUARANTINE, family/dealer bound).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  MANIFEST,
  STRICT_FAMILIES,
  PROVISIONAL_FAMILIES,
  DEALER_IDS,
  buildCrossFamilyReconciliation,
  laneFor,
  expectedStateFor,
  cadenceFor,
  periodHintString,
  expectedReportKind,
  dealerMatches,
  reconcileWatchdog,
  buildStrictCell,
  buildProvisionalCell,
  summarize,
  type ManifestCell,
  type HoldOutcome,
  type PromoteOutcome,
  type StrictReaderView,
  type ProvisionalView,
  type IdentityBinding,
  type E2ECell,
} from '../server/reports/e2e/real-data-e2e'
import { buildHaloPreviewCard, buildExternalCard, renderHaloPreviewHtml, PREVIEW_LABEL } from '../server/reports/e2e/halo-preview-card'

// ── hand-built fixtures ───────────────────────────────────────────────────────
const SHA = 'a'.repeat(64)
const src = (): E2ECell['source'] => ({ filename: 'f.xlsx', path: '.local-fixtures/f.xlsx', sha256: SHA, size_bytes: 100 })
const ident = (): IdentityBinding => ({ expected_sha256: SHA, expected_size: 100, sha256_match: true, size_match: true, ledger_status: 'ACCEPT' })
const WEEK = { start: '2026-08-24', end: '2026-08-30' }

const apptWatchdog = () => ({
  profile: 'serra-honda', period: WEEK,
  metrics: [
    { metric_id: 'appt.show_rate', value: 0.571, count: 8 },
    { metric_id: 'appt.no_show_rate', value: 0.357, count: 5 },
    { metric_id: 'appt.confirmed_rate', value: 0.5, count: 7 },
    { metric_id: 'appt.cancel_rate', value: 0.071, count: 1 },
    { metric_id: 'appt.reschedule_rate', value: 0.143, count: 2 },
  ],
})
const apptReader = (): StrictReaderView => ({
  available: true, reader: 'readAppointments', acceptedRows: 14,
  metrics: { 'appt.total': 14, 'appt.show': 8, 'appt.no_show': 5, 'appt.confirmed': 7, 'appt.completed': 8, 'appt.cancelled': 1, 'appt.rescheduled': 2 },
  withheld: [],
})
const heldAppt = (over: Partial<HoldOutcome> = {}): HoldOutcome => ({
  outcome: 'held', validation_state: 'held', report_kind: 'appointments', dealer: 'Serra Honda',
  period: { ...WEEK }, quarantine_reason: null, detail: null, receipt_id: 'r', hold_path: 'p', provenance_envelope: 'dev-test', ...over,
})
const promoted = (over: Partial<PromoteOutcome> = {}): PromoteOutcome => ({
  outcome: 'promoted', delivery_id: 'd', accepted_rows: 14, analytics_db: 'db', abort_reason: null, watchdog: apptWatchdog(), ...over,
})
const apptCell: ManifestCell = { profile: 'serra-honda', family: 'appointments', filename: 'f.xlsx' }

describe('lane classification + period binding', () => {
  it('strict vs provisional families', () => {
    expect(laneFor('appointments')).toBe('strict-governed')
    expect(laneFor('lead_source_roi')).toBe('provisional-preview')
    expect(expectedStateFor('crm_sales_gross')).toBe('accepted')
    expect(expectedStateFor('cage_kpi')).toBe('quarantined')
  })
  it('daily comm period_hint is a SINGLE date, never a degenerate range', () => {
    expect(periodHintString('sales_comm_log')).toBe('2026-08-29')
    expect(periodHintString('appointments')).toBe('2026-08-24/2026-08-30')
    expect(cadenceFor('sales_comm_log')).toBe('daily')
  })
  it('report_kind + dealer binding helpers', () => {
    expect(expectedReportKind('appointments')).toBe('appointments')
    expect(dealerMatches('Serra Honda', 'Serra Honda 21043')).toBe(true)
    expect(dealerMatches('Serra Honda', 'Serra Nissan')).toBe(false)
  })
})

describe('reconcileWatchdog', () => {
  it('appointments rates reconcile with counts-derived rates', () => {
    const r = reconcileWatchdog('appointments', apptReader().metrics, apptWatchdog(), 'serra-honda', 14)
    expect(r.ok).toBe(true)
  })
  it('fails when watchdog is null', () => {
    const r = reconcileWatchdog('appointments', apptReader().metrics, null, 'serra-honda', 14)
    expect(r.checked).toBe(false)
    expect(r.ok).toBe(false)
  })
  it('fails when a rate value disagrees with the reader count', () => {
    const bad = apptWatchdog()
    bad.metrics[0].value = 0.99 // show_rate wrong
    const r = reconcileWatchdog('appointments', apptReader().metrics, bad, 'serra-honda', 14)
    expect(r.ok).toBe(false)
  })
  it('gross reconciles total_sum + reconciliation_mismatches + count', () => {
    const wd = { profile: 'serra-honda', period: WEEK, metrics: [
      { metric_id: 'gross.total_sum', value: 14185.2, count: 5 },
      { metric_id: 'gross.reconciliation_mismatches', value: 0, count: 5 },
    ] }
    const reader = { 'gross.total_sum': 14185.2, 'gross.row_count': 5, 'gross.reconciliation_mismatches': 0 }
    expect(reconcileWatchdog('crm_sales_gross', reader, wd, 'serra-honda', 5).ok).toBe(true)
    expect(reconcileWatchdog('crm_sales_gross', { ...reader, 'gross.total_sum': 99 }, wd, 'serra-honda', 5).ok).toBe(false)
  })
  it('dashboard section_markers must be internally consistent with accepted rows', () => {
    const wd = { profile: 'serra-honda', period: WEEK, metrics: [{ metric_id: 'dashboard.section_markers', value: 11, count: 40 }] }
    expect(reconcileWatchdog('dealership_performance', {}, wd, 'serra-honda', 40).ok).toBe(true)
    expect(reconcileWatchdog('dealership_performance', {}, wd, 'serra-honda', 41).ok).toBe(false) // count≠accepted
  })
})

describe('buildStrictCell technical pass (stronger than agrees)', () => {
  it('passes when held + bound + promoted + all required metrics + watchdog reconciled', () => {
    const c = buildStrictCell(apptCell, src(), ident(), heldAppt(), promoted(), apptReader())
    expect(c.technical_pass).toBe(true)
    expect(c.preview_lane).toBe('strict-governed')
    expect(c.watchdog_reconciliation?.ok).toBe(true)
  })
  it('FAILS when promote aborted even though hold agrees', () => {
    const c = buildStrictCell(apptCell, src(), ident(), heldAppt(), promoted({ outcome: 'aborted', abort_reason: 'x', watchdog: null }), apptReader())
    expect(c.agrees).toBe(true) // held===accepted
    expect(c.technical_pass).toBe(false) // but promote failed
  })
  it('FAILS when a required metric is null (missing is not zero)', () => {
    const reader = { ...apptReader(), metrics: { ...apptReader().metrics, 'appt.total': null } }
    const c = buildStrictCell(apptCell, src(), ident(), heldAppt(), promoted(), reader)
    expect(c.technical_pass).toBe(false)
  })
  it('FAILS on wrong dealer / wrong period / wrong report_kind binding', () => {
    expect(buildStrictCell(apptCell, src(), ident(), heldAppt({ dealer: 'Serra Nissan' }), promoted(), apptReader()).technical_pass).toBe(false)
    expect(buildStrictCell(apptCell, src(), ident(), heldAppt({ period: { start: '2026-08-17', end: '2026-08-23' } }), promoted(), apptReader()).technical_pass).toBe(false)
    expect(buildStrictCell(apptCell, src(), ident(), heldAppt({ report_kind: 'crm_sales_gross' }), promoted(), apptReader()).technical_pass).toBe(false)
  })
})

describe('buildProvisionalCell non-promotion pass', () => {
  const roiCell: ManifestCell = { profile: 'serra-honda', family: 'lead_source_roi', filename: 'roi.xlsx' }
  const qHold = (over: Partial<HoldOutcome> = {}): HoldOutcome => ({
    outcome: 'quarantined', validation_state: 'quarantined', report_kind: 'lead_source_roi', dealer: 'Serra Honda',
    period: { start: null, end: null }, quarantine_reason: 'non-sales-lead-type', detail: 'hidden Lead Intent', receipt_id: 'r', hold_path: 'p', provenance_envelope: 'dev-test', ...over,
  })
  const aborted = (): PromoteOutcome => ({ outcome: 'aborted', delivery_id: null, accepted_rows: null, analytics_db: null, abort_reason: 'no held delivery', watchdog: null })
  const prov = (over: Partial<ProvisionalView> = {}): ProvisionalView => ({
    available: true, rowsObserved: 10, serviceRowsExcluded: 0,
    reconciliation: { checked: true, reconciles: true, detail: 'ok' },
    metrics: [{ id: 'roi.total_leads', value: 113 }, { id: 'roi.actual_roi', value: null }], ...over,
  })
  it('passes when quarantined + promote attempted & aborted + adapter reconciles', () => {
    const c = buildProvisionalCell(roiCell, src(), ident(), qHold(), aborted(), prov())
    expect(c.technical_pass).toBe(true)
    expect(c.promote?.outcome).toBe('aborted')
    expect(c.strict_state).toBe('quarantined')
  })
  it('FAILS if the family somehow promoted (leaked into the strict ledger)', () => {
    const leaked: PromoteOutcome = { outcome: 'promoted', delivery_id: 'd', accepted_rows: 5, analytics_db: 'db', abort_reason: null, watchdog: {} }
    expect(buildProvisionalCell(roiCell, src(), ident(), qHold(), leaked, prov()).technical_pass).toBe(false)
  })
  it('FAILS if provisional reconciliation is not checked/does not reconcile', () => {
    expect(buildProvisionalCell(roiCell, src(), ident(), qHold(), aborted(), prov({ reconciliation: { checked: false, reconciles: null, detail: '' } })).technical_pass).toBe(false)
    expect(buildProvisionalCell(roiCell, src(), ident(), qHold(), aborted(), prov({ reconciliation: { checked: true, reconciles: false, detail: '' } })).technical_pass).toBe(false)
  })
  it('missing is not zero: an absent metric is recorded null + withheld, never 0', () => {
    const c = buildProvisionalCell(roiCell, src(), ident(), qHold(), aborted(), prov())
    expect(c.metrics_emitted['roi.actual_roi']).toBeNull()
    expect(c.metrics_withheld).toContain('roi.actual_roi')
  })
  // ── component reconciliations gate technical_pass (not merely recorded) ──
  const cageCellM = { profile: 'serra-honda', family: 'cage_kpi', filename: 'cage.xlsx' } as ManifestCell
  const cageHold = (): HoldOutcome => ({ outcome: 'quarantined', validation_state: 'quarantined', report_kind: 'cage_kpi', dealer: 'Serra Honda', period: { start: null, end: null }, quarantine_reason: 'non-sales-lead-type', detail: null, receipt_id: 'r', hold_path: 'p', provenance_envelope: 'dev-test' })
  const cageProv = (comps: ProvisionalView['componentReconciliations']): ProvisionalView => ({
    available: true, rowsObserved: 35, serviceRowsExcluded: 0, reconciliation: { checked: true, reconciles: true, detail: '' },
    componentReconciliations: comps, metrics: [{ id: 'cage.total_comms', value: 1473 }],
  })
  it('PASSES when all component reconciliations are checked & reconcile', () => {
    const comps = [
      { name: 'cage.comms_components', checked: true, reconciles: true, detail: '' },
      { name: 'cage.comms_direction', checked: true, reconciles: true, detail: '' },
      { name: 'cage.comms_grand_total', checked: true, reconciles: true, detail: '' },
    ]
    expect(buildProvisionalCell(cageCellM, src(), ident(), cageHold(), aborted(), cageProv(comps)).technical_pass).toBe(true)
  })
  it('FAILS on an arithmetic mismatch (reconciles=false) — e.g. calls+emails+texts+fb ≠ Total Comms', () => {
    const comps = [
      { name: 'cage.comms_components', checked: true, reconciles: false, detail: 'calls+emails+texts+fb=1472 vs Total Comms=1473' },
      { name: 'cage.comms_direction', checked: true, reconciles: true, detail: '' },
      { name: 'cage.comms_grand_total', checked: true, reconciles: true, detail: '' },
    ]
    const c = buildProvisionalCell(cageCellM, src(), ident(), cageHold(), aborted(), cageProv(comps))
    expect(c.technical_pass).toBe(false)
    expect(c.technical_pass_detail).toMatch(/cage\.comms_components/)
  })
  it('FAILS on a missing component/channel (checked=false) — e.g. absent Comm Channel column', () => {
    const comm = { profile: 'serra-honda', family: 'sales_comm_log', filename: 'comm.xlsx' } as ManifestCell
    const commHold: HoldOutcome = { ...cageHold(), report_kind: 'sales_comm_log' }
    const comps = [{ name: 'comm.channel_sum', checked: false, reconciles: null, detail: 'email+call+text+facebook=null vs included=69' }]
    const view: ProvisionalView = { available: true, rowsObserved: 69, serviceRowsExcluded: 0, reconciliation: { checked: true, reconciles: true, detail: '' }, componentReconciliations: comps, metrics: [{ id: 'comm.sales_communications', value: 69 }] }
    expect(buildProvisionalCell(comm, src(), ident(), commHold, aborted(), view).technical_pass).toBe(false)
  })
  it('FAILS when required components are UNDEFINED (a CAGE cell must emit its 3 checks)', () => {
    const c = buildProvisionalCell(cageCellM, src(), ident(), cageHold(), aborted(), cageProv(undefined))
    expect(c.technical_pass).toBe(false)
    expect(c.technical_pass_detail).toMatch(/missing:cage\.comms_components/)
  })
  it('FAILS when required components are an EMPTY array', () => {
    expect(buildProvisionalCell(cageCellM, src(), ident(), cageHold(), aborted(), cageProv([])).technical_pass).toBe(false)
  })
  it('FAILS on a DUPLICATE component name', () => {
    const comps = [
      { name: 'cage.comms_components', checked: true, reconciles: true, detail: '' },
      { name: 'cage.comms_components', checked: true, reconciles: true, detail: '' }, // duplicate
      { name: 'cage.comms_direction', checked: true, reconciles: true, detail: '' },
      { name: 'cage.comms_grand_total', checked: true, reconciles: true, detail: '' },
    ]
    const c = buildProvisionalCell(cageCellM, src(), ident(), cageHold(), aborted(), cageProv(comps))
    expect(c.technical_pass).toBe(false)
    expect(c.technical_pass_detail).toMatch(/duplicate:cage\.comms_components/)
  })
  it('FAILS on an UNEXPECTED extra component name', () => {
    const comps = [
      { name: 'cage.comms_components', checked: true, reconciles: true, detail: '' },
      { name: 'cage.comms_direction', checked: true, reconciles: true, detail: '' },
      { name: 'cage.comms_grand_total', checked: true, reconciles: true, detail: '' },
      { name: 'cage.bogus_extra', checked: true, reconciles: true, detail: '' }, // unexpected
    ]
    const c = buildProvisionalCell(cageCellM, src(), ident(), cageHold(), aborted(), cageProv(comps))
    expect(c.technical_pass).toBe(false)
    expect(c.technical_pass_detail).toMatch(/unexpected:cage\.bogus_extra/)
  })
})

describe('summarize surfaces technical failures', () => {
  it('counts a failed promotion as a technical failure', () => {
    const good = buildStrictCell(apptCell, src(), ident(), heldAppt(), promoted(), apptReader())
    const bad = buildStrictCell(apptCell, src(), ident(), heldAppt(), promoted({ outcome: 'aborted', abort_reason: 'x', watchdog: null }), apptReader())
    const s = summarize([good, bad])
    expect(s.technical_pass).toBe(1)
    expect(s.technical_failures).toBe(1)
    expect(s.technical_failure_details[0].family).toBe('appointments')
  })
})

describe('polished Halo preview card consumes receipt cells', () => {
  const cells: E2ECell[] = [
    buildStrictCell({ profile: 'serra-honda', family: 'crm_sales_gross', filename: 'g.xlsx' }, src(), ident(),
      heldAppt({ report_kind: 'crm_sales_gross' }),
      promoted({ accepted_rows: 5, watchdog: { profile: 'serra-honda', period: WEEK, metrics: [{ metric_id: 'gross.total_sum', value: 14185.2, count: 5 }, { metric_id: 'gross.reconciliation_mismatches', value: 0, count: 5 }] } }),
      { available: true, reader: 'readCrmSalesGross', acceptedRows: 5, metrics: { 'gross.row_count': 5, 'gross.total_sum': 14185.2 }, withheld: [] }),
    buildStrictCell(apptCell, src(), ident(), heldAppt(), promoted(), apptReader()),
  ]
  it('renders positive headings, subtle label, and real totals from the receipt (no hard-coded)', () => {
    const card = buildHaloPreviewCard('Serra Honda', cells, 'Week of 2026-08-24 – 2026-08-30')
    expect(card.label).toBe(PREVIEW_LABEL)
    expect(card.label).not.toMatch(/not strict m1r acceptance/i) // not the loud prototype banner
    const html = renderHaloPreviewHtml(card)
    expect(html).toContain('$14,185') // total gross flows from the receipt cell
    expect(html).toContain('5 vehicles delivered this week')
    expect(html).toContain('Executive Snapshot')
    expect(html).toContain('Suggested Coverage')
  })
  it('missing is not zero: a withheld gross yields NO fabricated $0 snapshot line', () => {
    const noGross = [buildStrictCell(apptCell, src(), ident(), heldAppt(), promoted(), apptReader())]
    const card = buildHaloPreviewCard('Serra Honda', noGross, 'Week of ...')
    const html = renderHaloPreviewHtml(card)
    expect(html).not.toContain('$0')
    expect(html).not.toMatch(/0 vehicles delivered/)
  })
  it('when service_parts_excluded=0 the card says "0 visible ... detected", never "Sales-only isolated"/"excluded"', () => {
    const roiQHold: HoldOutcome = { outcome: 'quarantined', validation_state: 'quarantined', report_kind: 'lead_source_roi', dealer: 'Serra Honda', period: { start: null, end: null }, quarantine_reason: 'non-sales-lead-type', detail: null, receipt_id: 'r', hold_path: 'p', provenance_envelope: 'dev-test' }
    const roiAborted: PromoteOutcome = { outcome: 'aborted', delivery_id: null, accepted_rows: null, analytics_db: null, abort_reason: 'no held', watchdog: null }
    const roiProv: ProvisionalView = { available: true, rowsObserved: 8, serviceRowsExcluded: 0, reconciliation: { checked: true, reconciles: true, detail: '' }, metrics: [{ id: 'roi.total_leads', value: 113 }, { id: 'roi.duplicate_rate', value: 0.23 }] }
    const roiCell = buildProvisionalCell({ profile: 'serra-honda', family: 'lead_source_roi', filename: 'roi.xlsx' }, src(), ident(), roiQHold, roiAborted, roiProv)
    const html = renderHaloPreviewHtml(buildHaloPreviewCard('Serra Honda', [roiCell], 'Week of ...'))
    expect(html).toContain('0 visible Service/Parts-coded rows detected')
    expect(html).not.toMatch(/Sales-only sources isolated/i)
    expect(html).not.toMatch(/0 excluded/i)
  })
})

describe('cross-family reconciliation (no winner; visible caveat)', () => {
  const mkStrict = (profile: string, family: 'crm_sales_gross' | 'dealership_performance', metrics: Record<string, number | null>): E2ECell =>
    buildStrictCell({ profile, family, filename: `${family}.xlsx` }, src(), ident(), heldAppt({ report_kind: family }),
      promoted({ watchdog: null }), { available: true, reader: `read_${family}`, acceptedRows: null, metrics, withheld: [] })
  const mkCage = (profile: string, metrics: Array<{ id: string; value: number | null }>): E2ECell => {
    const qHold: HoldOutcome = { outcome: 'quarantined', validation_state: 'quarantined', report_kind: 'cage_kpi', dealer: 'x', period: { start: null, end: null }, quarantine_reason: 'non-sales-lead-type', detail: null, receipt_id: 'r', hold_path: 'p', provenance_envelope: 'dev-test' }
    const aborted: PromoteOutcome = { outcome: 'aborted', delivery_id: null, accepted_rows: null, analytics_db: null, abort_reason: 'no held', watchdog: null }
    return buildProvisionalCell({ profile, family: 'cage_kpi', filename: 'cage.xlsx' }, src(), ident(), qHold, aborted,
      { available: true, rowsObserved: 35, serviceRowsExcluded: 0, reconciliation: { checked: true, reconciles: true, detail: '' }, metrics })
  }
  it('Ford: 7 delivered rows vs 6 dashboard sold does NOT reconcile (caveat, no winner); gross dollars DO reconcile', () => {
    const cells = [
      mkStrict('tony-serra-ford', 'crm_sales_gross', { 'gross.row_count': 7, 'gross.total_sum': 1600.99 }),
      mkStrict('tony-serra-ford', 'dealership_performance', { 'dp.sold_in_period': 6, 'dp.total_gross': 1600.9900000000002 }),
      mkCage('tony-serra-ford', [{ id: 'cage.total_gross', value: 1600.99 }]),
    ]
    const cf = buildCrossFamilyReconciliation('tony-serra-ford', cells)
    expect(cf.strict_ok).toBe(false)
    const delivered = cf.checks.find((c) => c.name === 'delivered_rows_vs_dashboard_sold')!
    expect(delivered.reconciles).toBe(false)
    expect(delivered.a.value).toBe(7)
    expect(delivered.b.value).toBe(6)
    expect(delivered.caveat).toMatch(/neither treated as authoritative/)
    expect(cf.checks.find((c) => c.name === 'gross_total_vs_dashboard_gross')!.reconciles).toBe(true) // dollars within tolerance
    expect(cf.checks.find((c) => c.name === 'cage_provisional_gross_vs_strict_gross')!.directional).toBe(true)
  })
  it('Honda/Nissan: delivered rows == dashboard sold reconciles (strict_ok true)', () => {
    for (const [profile, n] of [['serra-honda', 5], ['serra-nissan', 6]] as const) {
      const cells = [
        mkStrict(profile, 'crm_sales_gross', { 'gross.row_count': n, 'gross.total_sum': 100 }),
        mkStrict(profile, 'dealership_performance', { 'dp.sold_in_period': n, 'dp.total_gross': 100 }),
      ]
      expect(buildCrossFamilyReconciliation(profile, cells).strict_ok).toBe(true)
    }
  })
  it('a directional CAGE-gross mismatch never fails the profile', () => {
    const cells = [
      mkStrict('serra-honda', 'crm_sales_gross', { 'gross.row_count': 5, 'gross.total_sum': 100 }),
      mkStrict('serra-honda', 'dealership_performance', { 'dp.sold_in_period': 5, 'dp.total_gross': 100 }),
      mkCage('serra-honda', [{ id: 'cage.total_gross', value: 999 }]), // wildly different, but directional
    ]
    const cf = buildCrossFamilyReconciliation('serra-honda', cells)
    expect(cf.strict_ok).toBe(true)
    expect(cf.checks.find((c) => c.name === 'cage_provisional_gross_vs_strict_gross')!.reconciles).toBe(false)
  })
})

describe('card: Ford delivered-count caveat + retrospective appointment opportunity', () => {
  const strictReader = (family: string, metrics: Record<string, number | null>): StrictReaderView => ({ available: true, reader: `read_${family}`, acceptedRows: null, metrics, withheld: [] })
  const mkStrict = (profile: string, family: string, metrics: Record<string, number | null>, wd: Record<string, unknown> | null = null): E2ECell =>
    buildStrictCell({ profile, family: family as any, filename: `${family}.xlsx` }, src(), ident(), heldAppt({ report_kind: family }), promoted({ watchdog: wd }), strictReader(family, metrics))
  it('Ford card says "delivered-sale rows" + Dashboard sold, with a discrepancy footnote — never "7 vehicles delivered"', () => {
    const cells = [
      mkStrict('tony-serra-ford', 'crm_sales_gross', { 'gross.row_count': 7, 'gross.total_sum': 1600.99, 'gross.front_sum': 1400, 'gross.back_sum': 200.99 }),
      mkStrict('tony-serra-ford', 'dealership_performance', { 'dp.sold_in_period': 6, 'dp.total_gross': 1600.99, 'dp.leads': 37, 'dp.appts_set': 6, 'dp.appts_show': 2 }),
    ]
    const html = renderHaloPreviewHtml(buildHaloPreviewCard('Tony Serra Ford', cells, 'wk'))
    expect(html).toContain('7 delivered-sale rows in CRM Sales Gross')
    expect(html).toContain('Dashboard reports 6 sold')
    expect(html).not.toMatch(/7 vehicles delivered/)
    expect(html).toMatch(/neither is treated as authoritative/)
  })
  it('Honda card (delivered == sold) keeps the clean "5 vehicles delivered" wording', () => {
    const cells = [
      mkStrict('serra-honda', 'crm_sales_gross', { 'gross.row_count': 5, 'gross.total_sum': 14185.2 }),
      mkStrict('serra-honda', 'dealership_performance', { 'dp.sold_in_period': 5, 'dp.total_gross': 14185.2 }),
    ]
    const html = renderHaloPreviewHtml(buildHaloPreviewCard('Serra Honda', cells, 'wk'))
    expect(html).toContain('5 vehicles delivered this week')
    expect(html).not.toMatch(/delivered-sale rows/)
  })
  it('appointment-confirm opportunity is retrospective, not an actionable "confirm the N"', () => {
    const cells = [mkStrict('serra-honda', 'appointments', { 'appt.total': 14, 'appt.show': 8, 'appt.no_show': 5, 'appt.confirmed': 7, 'appt.completed': 8, 'appt.cancelled': 1, 'appt.rescheduled': 2 })]
    const card = buildHaloPreviewCard('Serra Honda', cells, 'wk')
    const html = renderHaloPreviewHtml(card)
    expect(html).toMatch(/7 of 14 appointment records were not marked confirmed during the week/)
    expect(html).not.toMatch(/Confirm the 7 unconfirmed/)
    expect(card.footnotes.some((f) => /not necessarily presently actionable/.test(f.text))).toBe(true)
  })
})

describe('external customer-facing card', () => {
  const strictReader = (family: string, metrics: Record<string, number | null>): StrictReaderView => ({ available: true, reader: `read_${family}`, acceptedRows: null, metrics, withheld: [] })
  const mkStrict = (profile: string, family: string, metrics: Record<string, number | null>): E2ECell =>
    buildStrictCell({ profile, family: family as any, filename: `${family}.xlsx` }, src(), ident(), heldAppt({ report_kind: family }), promoted({ watchdog: null }), strictReader(family, metrics))
  const cageProvCell = (profile: string, metrics: Array<{ id: string; value: number | null }>): E2ECell => {
    const qHold: HoldOutcome = { outcome: 'quarantined', validation_state: 'quarantined', report_kind: 'cage_kpi', dealer: 'x', period: { start: null, end: null }, quarantine_reason: 'non-sales-lead-type', detail: null, receipt_id: 'r', hold_path: 'p', provenance_envelope: 'dev-test' }
    const aborted: PromoteOutcome = { outcome: 'aborted', delivery_id: null, accepted_rows: null, analytics_db: null, abort_reason: 'no held', watchdog: null }
    return buildProvisionalCell({ profile, family: 'cage_kpi', filename: 'cage.xlsx' }, src(), ident(), qHold, aborted, { available: true, rowsObserved: 35, serviceRowsExcluded: 0, reconciliation: { checked: true, reconciles: true, detail: '' }, componentReconciliations: [{ name: 'cage.comms_components', checked: true, reconciles: true, detail: '' }, { name: 'cage.comms_direction', checked: true, reconciles: true, detail: '' }, { name: 'cage.comms_grand_total', checked: true, reconciles: true, detail: '' }], metrics })
  }
  const fordCells = [
    mkStrict('tony-serra-ford', 'crm_sales_gross', { 'gross.row_count': 7, 'gross.total_sum': 1600.99, 'gross.front_sum': -2267, 'gross.back_sum': 3868 }),
    mkStrict('tony-serra-ford', 'dealership_performance', { 'dp.sold_in_period': 6, 'dp.total_gross': 1600.99, 'dp.leads': 37, 'dp.appts_set': 6, 'dp.appts_show': 2 }),
    mkStrict('tony-serra-ford', 'appointments', { 'appt.total': 7, 'appt.show': 3, 'appt.no_show': 4, 'appt.confirmed': 3, 'appt.completed': 3, 'appt.cancelled': 0, 'appt.rescheduled': 2 }),
    cageProvCell('tony-serra-ford', [{ id: 'cage.total_comms', value: 510 }, { id: 'cage.total_calls', value: 219 }, { id: 'cage.total_emails', value: 89 }, { id: 'cage.total_texts', value: 202 }, { id: 'cage.rep_count', value: 12 }]),
  ]
  const html = renderHaloPreviewHtml(buildExternalCard('Tony Serra Ford', fordCells, 'Week of 2026-08-24 – 2026-08-30'))
  it('omits internal artifacts: provenance, family slugs, lanes, checksums, and M1R/governed/quarantine language', () => {
    expect(html).not.toMatch(/Data Provenance/i)
    expect(html).not.toMatch(/checksum/i)
    expect(html).not.toMatch(/provisional|quarantin|governed|M1R|strict/i)
    expect(html).not.toMatch(/crm_sales_gross|cage_kpi|lead_source_roi|sales_comm_log|dealership_performance/)
    expect(html).not.toMatch(/Service\/Parts/i)
  })
  it('translates the provisional caveat to customer language (directional CRM signal, pending refinement)', () => {
    expect(html).toMatch(/Directional CRM signal/i)
    expect(html).toMatch(/pending refinement/i)
  })
  it('retains the Ford delivered/sold discrepancy in plain language (no winner)', () => {
    expect(html).toMatch(/7 recorded sales this week · dashboard shows 6/)
    expect(html).toMatch(/both are shown while the figures are being reconciled/i)
  })
  it('uses sales-oriented next-step wording, not "Suggested — not activated"', () => {
    expect(html).toMatch(/Recommended pilot|Available next step/)
    expect(html).not.toMatch(/not activated, scheduled, or sent/i)
    expect(html).toMatch(/Recommended Next Steps/)
  })
  it('footer carries NO internal workflow status (no "internal review" / "not yet sent")', () => {
    expect(html).not.toMatch(/internal review/i)
    expect(html).not.toMatch(/not yet sent/i)
    expect(html).toMatch(/directional CRM signals under active refinement\.<\/footer>/) // footer ends here
  })
  it('still shows real CAGE totals from the receipt (510 total communications)', () => {
    expect(html).toContain('510 total communications')
    expect(html).toContain('219 calls, 89 emails, 202 texts')
  })
})

describe('committed aggregate-only identity manifest invariants', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve('docs/halo/contract/vin18-source-identity.json'), 'utf8')) as {
    files: Array<{ filename: string; sha256: string; size_bytes: number; ledger_status: string; family_slug: string; dealer_id: string }>
    accepted: number; quarantined: number
  }
  it('has exactly 18 unique entries, 9 ACCEPT / 9 QUARANTINE', () => {
    expect(manifest.files.length).toBe(18)
    expect(new Set(manifest.files.map((f) => f.filename)).size).toBe(18)
    expect(new Set(manifest.files.map((f) => f.sha256)).size).toBe(18)
    expect(manifest.files.filter((f) => f.ledger_status === 'ACCEPT').length).toBe(9)
    expect(manifest.files.filter((f) => f.ledger_status === 'QUARANTINE').length).toBe(9)
  })
  it('every MANIFEST cell is bound to a ledger entry with matching family/dealer/status', () => {
    const byName = new Map(manifest.files.map((f) => [f.filename, f]))
    for (const m of MANIFEST) {
      const rec = byName.get(m.filename)
      expect(rec, `ledger entry for ${m.filename}`).toBeTruthy()
      expect(rec!.family_slug).toBe(m.family)
      expect(rec!.dealer_id).toBe(DEALER_IDS[m.profile])
      const expectedStatus = STRICT_FAMILIES.includes(m.family) ? 'ACCEPT' : 'QUARANTINE'
      expect(rec!.ledger_status).toBe(expectedStatus)
    }
  })
  it('contains no path/PII fields (aggregate-safe only)', () => {
    const raw = fs.readFileSync(path.resolve('docs/halo/contract/vin18-source-identity.json'), 'utf8')
    expect(raw).not.toMatch(/\/(Users|home)\//) // no filesystem paths
    expect(raw).not.toMatch(/"filters"|"report_rows"|"customer"/i) // no ledger row/filter detail
  })
  it('sanity: 6 families × 3 dealers present', () => {
    expect(new Set(manifest.files.map((f) => f.family_slug)).size).toBe(6)
    expect(new Set(manifest.files.map((f) => f.dealer_id)).size).toBe(3)
    expect(PROVISIONAL_FAMILIES.every((f) => manifest.files.some((x) => x.family_slug === f))).toBe(true)
  })
})
