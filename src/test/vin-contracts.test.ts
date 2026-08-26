import { describe, it, expect } from 'vitest'
import { readXlsx } from '@/server/ingest/xlsx-reader'
import { evaluateDelivery, parseFilters, PARSER_VERSION } from '@/server/ingest/vin-contracts'
import { makeXlsx, type Cell, type SheetSpec } from './helpers/make-xlsx'

const HONDA = 'Serra Honda'
const HONDA_ROW = 'Serra Honda of Sylacauga'
const evalXlsx = (buf: Buffer, dealer = HONDA) =>
  evaluateDelivery(readXlsx(buf).sheets, { profileDealer: dealer })

// ── Sales Communication Log (15-col, row-level Sales-only) ──
const COMM_HEADER = ['Dealer', 'User Group', 'User', 'Customer', 'Activity Date', 'Direction', 'Comm Channel', 'Comm Type', 'Interaction Result', 'Lead Type', 'Lead Status Type', 'Lead Source', 'Lead Created Date', 'Message Content']
const commRow = (leadType: string, source = 'Autoweb'): Array<Cell> =>
  [HONDA_ROW, 'Sales', 'Jane', 'Cust A', { date: '2026-08-05' }, 'Outbound', 'SMS', 'Text', 'Reached', leadType, 'Sales', source, { date: '2026-08-04' }, 'hello']

describe('Sales Communication Log', () => {
  it('accepts an all-Sales, single-dealer delivery', () => {
    const wb = makeXlsx([
      { name: 'Report', rows: [COMM_HEADER, commRow('Internet'), commRow('Phone')] },
      { name: 'Filters', rows: [['Base Report Name', 'Sales Communication Log'], ['Dealers', 'Serra Honda'], ['Date Range', '2026-08-04 - 2026-08-10']] },
    ])
    const r = evalXlsx(wb)
    expect(r.status).toBe('accepted')
    if (r.status === 'accepted') {
      expect(r.kind).toBe('sales_comm_log')
      expect(r.accepted_row_count).toBe(2)
      expect(r.source_row_count).toBe(2)
      expect(r.rows).toHaveLength(2)
      expect(r.header).toContain('Lead Type')
      expect(r.period).toEqual({ start: '2026-08-04', end: '2026-08-10' })
    }
  })

  it('quarantines a Service-coded row (non-sales-lead-type)', () => {
    const wb = makeXlsx([{ name: 'Report', rows: [COMM_HEADER, commRow('Internet'), commRow('Service')] }])
    const r = evalXlsx(wb)
    expect(r).toMatchObject({ status: 'quarantined', reason: 'non-sales-lead-type' })
  })

  it('quarantines a wrong-dealer row', () => {
    const bad = [...commRow('Internet')]
    bad[0] = 'Serra Nissan of Sylacauga'
    const wb = makeXlsx([{ name: 'Report', rows: [COMM_HEADER, bad] }])
    expect(evalXlsx(wb)).toMatchObject({ status: 'quarantined', reason: 'wrong-dealer' })
  })

  // Operator correction 2026-08-25: a POSITIVE Service/Parts selection in the Filters
  // (Lead Type or Lead Intent) is a contaminated schedule definition — it quarantines
  // outright; clean rows do NOT cure it (was previously accept-and-flag).
  it('POSITIVE Service/Parts Filters selection quarantines even with all rows Sales', () => {
    const wb = makeXlsx([
      { name: 'Report', rows: [COMM_HEADER, commRow('Internet')] },
      { name: 'Filters', rows: [['Lead Intents', 'Parts, Sales, Service, Unknown'], ['Dealers', 'Serra Honda']] },
    ])
    expect(evalXlsx(wb)).toMatchObject({ status: 'quarantined', reason: 'non-sales-lead-type' })
  })

  it('POSITIVE Service/Parts filter AND a Service row → still quarantine (never silently clean)', () => {
    const wb = makeXlsx([
      { name: 'Report', rows: [COMM_HEADER, commRow('Service')] },
      { name: 'Filters', rows: [['Lead Intents', 'Parts, Sales, Service'], ['Dealers', 'Serra Honda']] },
    ])
    expect(evalXlsx(wb)).toMatchObject({ status: 'quarantined', reason: 'non-sales-lead-type' })
  })
})

// ── CAGE / Enterprise Performance (real: Dealer|Lead Type|User summary rows) ──
const CAGE_HEADER = ['Dealer', 'Lead Type', 'User', 'Total Leads', 'Good Leads', 'Bad Leads', 'Sold from Leads', 'Total Comms', 'Active Tasks']
const cageRows = (o: { dealer?: string; leadType?: string } = {}): Array<Array<Cell>> => [
  [o.dealer ?? HONDA_ROW, '', '', 62, 55, 7, 3, 992, 73], // dealer summary row (blank Lead Type)
  [o.dealer ?? HONDA_ROW, o.leadType ?? 'Internet', 'Jane', 30, 28, 2, 2, 400, 20], // detail row
]
const cageFilters = (o: { dealers?: string; leadTypes?: string; leadIntents?: string } = {}): Array<Array<Cell>> => [
  ['Filter Name', 'Number Selected', 'Selected Values'],
  ['Base Report Name', '1', 'Enterprise Performance'],
  ['Dealers', '1', o.dealers ?? HONDA_ROW],
  ['Lead Types', '3', o.leadTypes ?? 'Internet, Phone, Walk-in'],
  ['Lead Intents', o.leadIntents ? String(o.leadIntents.split(',').length) : '1', o.leadIntents ?? 'Sales'],
  ['Date Range Begin', '1', 'Aug 17 2026 12:00AM'],
  ['Date Range End', '1', 'Aug 23 2026 11:59PM'],
]
const cageWb = (o = {}) => makeXlsx([{ name: 'Report', rows: [CAGE_HEADER, ...cageRows(o)] }, { name: 'Filters', rows: cageFilters(o) }])

describe('CAGE / Enterprise Performance (real schema)', () => {
  it('accepts single dealer + {Internet,Phone,Walk-in} + Begin/End period', () => {
    const r = evalXlsx(cageWb())
    expect(r.status).toBe('accepted')
    if (r.status === 'accepted') { expect(r.kind).toBe('cage_kpi'); expect(r.period).toEqual({ start: '2026-08-17', end: '2026-08-23' }) }
  })
  it('quarantines lead types != exactly the three (incompatible-filter-metadata)', () => {
    expect(evalXlsx(cageWb({ leadTypes: 'Internet, Phone' }))).toMatchObject({ status: 'quarantined', reason: 'incompatible-filter-metadata' })
  })
  it('quarantines multi-rooftop (ambiguous-tenant)', () => {
    expect(evalXlsx(cageWb({ dealers: `${HONDA_ROW}; Serra Nissan of Sylacauga` }))).toMatchObject({ status: 'quarantined', reason: 'ambiguous-tenant' })
  })
  it('quarantines wrong dealer rows', () => {
    expect(evalXlsx(cageWb({ dealer: 'Serra Nissan of Sylacauga' }))).toMatchObject({ status: 'quarantined', reason: 'wrong-dealer' })
  })
  it('quarantines a Service/Parts-coded Lead Type row', () => {
    expect(evalXlsx(cageWb({ leadType: 'Service' }))).toMatchObject({ status: 'quarantined', reason: 'non-sales-lead-type' })
  })
  // Regression: real Enterprise Performance reports end with a grand-TOTAL summary
  // row (Dealer="TOTAL"). It must NOT be treated as a wrong-dealer tenant row.
  it('accepts a trailing grand-TOTAL summary row (the real 59b012f0/f344bb68 cause)', () => {
    const wb = makeXlsx([{ name: 'Report', rows: [CAGE_HEADER, ...cageRows(), ['TOTAL', '', '', 62, 55, 7, 3, 992, 73]] }, { name: 'Filters', rows: cageFilters() }])
    const r = evalXlsx(wb)
    expect(r.status).toBe('accepted')
    if (r.status === 'accepted') {
      expect(r.kind).toBe('cage_kpi')
      expect(r.evidence.summary_total_rows).toBe(1)
      expect(r.rows).toHaveLength(3) // TOTAL row preserved, not dropped
    }
  })
  it('still quarantines a genuine cross-tenant row (not TOTAL) — fail-closed preserved', () => {
    const wb = makeXlsx([{ name: 'Report', rows: [CAGE_HEADER, ...cageRows(), ['Serra Nissan of Sylacauga', 'Internet', 'Bob', 5, 5, 0, 0, 10, 1]] }, { name: 'Filters', rows: cageFilters() }])
    expect(evalXlsx(wb)).toMatchObject({ status: 'quarantined', reason: 'wrong-dealer' })
  })
})

// ── grand-TOTAL exemption is narrow: cage_kpi + final row + blank Lead Type/User ──
describe('grand-TOTAL summary-row governance (negative conditions all quarantine)', () => {
  const cageWithRows = (extra: Array<Array<Cell>>) => makeXlsx([{ name: 'Report', rows: [CAGE_HEADER, ...cageRows(), ...extra] }, { name: 'Filters', rows: cageFilters() }])
  const TOTAL = (leadType = '', user = ''): Array<Cell> => ['TOTAL', leadType, user, 62, 55, 7, 3, 992, 73]

  it('TOTAL that is NOT the final data row → wrong-dealer', () => {
    const wb = makeXlsx([{ name: 'Report', rows: [CAGE_HEADER, TOTAL(), ...cageRows()] }, { name: 'Filters', rows: cageFilters() }])
    expect(evalXlsx(wb)).toMatchObject({ status: 'quarantined', reason: 'wrong-dealer' })
  })
  it('multiple TOTAL rows → wrong-dealer', () => {
    expect(evalXlsx(cageWithRows([TOTAL(), TOTAL()]))).toMatchObject({ status: 'quarantined', reason: 'wrong-dealer' })
  })
  it('final TOTAL with non-blank Lead Type → wrong-dealer', () => {
    expect(evalXlsx(cageWithRows([TOTAL('Internet', '')]))).toMatchObject({ status: 'quarantined', reason: 'wrong-dealer' })
  })
  it('final TOTAL with non-blank User → wrong-dealer', () => {
    expect(evalXlsx(cageWithRows([TOTAL('', 'Jane')]))).toMatchObject({ status: 'quarantined', reason: 'wrong-dealer' })
  })
  it('TOTAL in a non-CAGE family (sales_comm_log) → wrong-dealer', () => {
    const wb = makeXlsx([
      { name: 'Report', rows: [COMM_HEADER, ['TOTAL', 'Sales', 'Jane', 'Cust', { date: '2026-08-05' }, 'Outbound', 'SMS', 'Text', 'Reached', 'Internet', 'Sales', 'Autoweb', { date: '2026-08-04' }, 'hi']] },
      { name: 'Filters', rows: [['Dealers', 'Serra Honda']] },
    ])
    expect(evalXlsx(wb)).toMatchObject({ status: 'quarantined', reason: 'wrong-dealer' })
  })
})

// ── Lead Source ROI (real: spaced headers, NO Dealer column, dealer from Filters) ──
const ROI_HEADER = ['Lead Source', 'Total Leads', 'Good Leads', 'Bad Leads', 'Duplicate Leads', 'Sold from Leads']
const roiRows = (o: { leadSource?: string } = {}): Array<Array<Cell>> => [[o.leadSource ?? 'Thirdparty Honda', 26, 20, 6, 6, 0]]
const ROI_EIGHT = 'Import, Internet, Phone, PreviousCustomer, Referral, Walk-in, WebsiteChat, Wholesale'
const roiFilters = (o: { dealers?: string; leadTypes?: string } = {}): Array<Array<Cell>> => [
  ['Filter Name', 'Number Selected', 'Selected Values'],
  ['Base Report Name', '1', 'Lead Source ROI'],
  ['Dealers', '1', o.dealers ?? HONDA_ROW],
  ['Lead Types', '8', o.leadTypes ?? ROI_EIGHT],
  ['Lead Intents', '1', 'Sales'],
  ['Lead Sources Excluded', '5', 'Service, Service Appraisal, Service Dept'],
  ['Date Range Begin', '1', 'Aug 17 2026 12:00AM'],
  ['Date Range End', '1', 'Aug 23 2026 11:59PM'],
]
const roiWbC = (o = {}, extraSheet?: SheetSpec) => makeXlsx([{ name: 'Report', rows: [ROI_HEADER, ...roiRows(o)] }, { name: 'Filters', rows: roiFilters(o) }, extraSheet ?? { name: 'Sheet3', rows: [] }])

describe('Lead Source ROI (real schema)', () => {
  it('accepts: Base Report Name + single Filters dealer + governed 8 + Begin/End; Service ONLY in exclusions is OK', () => {
    const r = evalXlsx(roiWbC())
    expect(r.status).toBe('accepted')
    if (r.status === 'accepted') {
      expect(r.kind).toBe('lead_source_roi')
      expect(r.dealer).toBe(HONDA_ROW)
      expect(r.period).toEqual({ start: '2026-08-17', end: '2026-08-23' })
      // "Lead Sources Excluded: Service…" is proof of exclusion, not contamination →
      // accepted; a positive Service/Parts selection would have quarantined (below).
      expect(r.schedule_vulnerability).toBe(false)
    }
  })
  it('quarantines lead types != the governed eight', () => {
    expect(evalXlsx(roiWbC({ leadTypes: 'Internet, Phone, Walk-in' }))).toMatchObject({ status: 'quarantined', reason: 'incompatible-filter-metadata' })
  })
  it('quarantines a wrong Filters dealer', () => {
    expect(evalXlsx(roiWbC({ dealers: 'Serra Nissan of Sylacauga' }))).toMatchObject({ status: 'quarantined', reason: 'wrong-dealer' })
  })
  it('quarantines multi-rooftop', () => {
    expect(evalXlsx(roiWbC({ dealers: `${HONDA_ROW}; Serra Nissan of Sylacauga` }))).toMatchObject({ status: 'quarantined', reason: 'ambiguous-tenant' })
  })
  it('quarantines a Service/Parts-coded Lead Source ROW (not the exclusions)', () => {
    expect(evalXlsx(roiWbC({ leadSource: 'Service Drive' }))).toMatchObject({ status: 'quarantined', reason: 'non-sales-lead-type' })
  })
  it('quarantines a non-blank uncontracted sheet', () => {
    expect(evalXlsx(roiWbC({}, { name: 'Sheet3', rows: [['unexpected', 'content']] }))).toMatchObject({ status: 'quarantined', reason: 'extra-nonblank-sheet' })
  })
})

// ── Positive Service/Parts Filters selection is first-class contamination ──
describe('positive Service/Parts Filters selection → quarantine (operator correction)', () => {
  it('CAGE with a positive Service/Parts Lead Intent quarantines (clean rows do not cure it)', () => {
    const wb = makeXlsx([
      { name: 'Report', rows: [CAGE_HEADER, ...cageRows()] },
      { name: 'Filters', rows: cageFilters({ leadIntents: 'Sales, Service, Parts' }) },
    ])
    expect(evalXlsx(wb)).toMatchObject({ status: 'quarantined', reason: 'non-sales-lead-type' })
  })
  it('ROI with a positive Service Lead Intent quarantines even though exclusions also list Service', () => {
    const wb = makeXlsx([
      { name: 'Report', rows: [ROI_HEADER, ...roiRows()] },
      { name: 'Filters', rows: [
        ['Filter Name', 'Number Selected', 'Selected Values'],
        ['Base Report Name', '1', 'Lead Source ROI'],
        ['Dealers', '1', HONDA_ROW],
        ['Lead Types', '8', ROI_EIGHT],
        ['Lead Intents', '2', 'Sales, Service'],
        ['Lead Sources Excluded', '5', 'Service, Service Appraisal, Service Dept'],
        ['Date Range Begin', '1', 'Aug 17 2026 12:00AM'],
        ['Date Range End', '1', 'Aug 23 2026 11:59PM'],
      ] },
      { name: 'Sheet3', rows: [] },
    ])
    expect(evalXlsx(wb)).toMatchObject({ status: 'quarantined', reason: 'non-sales-lead-type' })
  })
})

// ── Sheet1-only Gross + Appointments ──
describe('CRM Sales Gross (Sheet1-only)', () => {
  const GROSS_HEADER = ['Dealer', 'Dealer ID', 'Sold Date', 'Sale ID', 'Deal Number', 'Delivered status', 'Front Gross', 'Back Gross', 'Total Gross']
  it('accepts and derives period from Sold Date rows', () => {
    const wb = makeXlsx([{ name: 'Sheet1', rows: [
      GROSS_HEADER,
      [HONDA_ROW, '123', { date: '2026-08-05' }, 'S1', 'D1', 'Delivered', 1000, 500, 1500],
      [HONDA_ROW, '123', { date: '2026-08-09' }, 'S2', 'D2', 'Delivered', 900, 400, 1300],
    ] }])
    const r = evalXlsx(wb)
    expect(r.status).toBe('accepted')
    if (r.status === 'accepted') {
      expect(r.kind).toBe('crm_sales_gross')
      expect(r.period).toEqual({ start: '2026-08-05', end: '2026-08-09' })
    }
  })
})

describe('Appointments (Sheet1-only, real schema — evaluateDelivery gates)', () => {
  const APPT_HEADER = ['Appointment ID', 'Dealer', 'Dealer ID', 'Appointment Type', 'Appt Reason', 'Appointment Start Date', 'Appointment Start DateTime', 'Appointment Status']
  const apptRow = (o: { reason?: string; dealer?: string; type?: string } = {}): Array<Cell> =>
    ['145710109', o.dealer ?? HONDA_ROW, '21043', o.type ?? 'Meeting', o.reason ?? 'Sales Appointment', '2026-08-18', '2026-08-18', 'Cancelled']
  const apptWb = (o = {}) => makeXlsx([{ name: 'Sheet1', rows: [APPT_HEADER, apptRow(o)] }])
  it('accepts Sales Appointment rows (dealer matches, Appt Reason column)', () => {
    expect(evalXlsx(apptWb())).toMatchObject({ status: 'accepted', kind: 'appointments' })
  })
  it('quarantines a non-Sales Appt Reason', () => {
    expect(evalXlsx(apptWb({ reason: 'Service Appointment' }))).toMatchObject({ status: 'quarantined', reason: 'non-sales-appointment-reason' })
  })
  it('quarantines a wrong-dealer row', () => {
    expect(evalXlsx(apptWb({ dealer: 'Serra Nissan of Sylacauga' }))).toMatchObject({ status: 'quarantined', reason: 'wrong-dealer' })
  })
  it('quarantines a Service/Parts-coded Appointment Type', () => {
    expect(evalXlsx(apptWb({ type: 'Service' }))).toMatchObject({ status: 'quarantined', reason: 'non-sales-lead-type' })
  })
})

describe('unrecognized family + filters parser', () => {
  it('quarantines an unrecognized workbook', () => {
    const wb = makeXlsx([{ name: 'Sheet1', rows: [['foo', 'bar', 'baz'], ['1', '2', '3']] }])
    expect(evalXlsx(wb)).toMatchObject({ status: 'quarantined', reason: 'unrecognized-family' })
  })
  it('parseFilters extracts base name, dealers, lead types, period', () => {
    const f = parseFilters([['Base Report Name', 'Enterprise Performance'], ['Dealers', 'A; B'], ['Lead Types', 'Internet, Phone'], ['Date Range', '2026-08-04 - 2026-08-10']])
    expect(f.baseReportName).toBe('Enterprise Performance')
    expect(f.dealers).toEqual(['A', 'B'])
    expect(f.leadTypes).toEqual(['Internet', 'Phone'])
    expect(f.period).toEqual({ start: '2026-08-04', end: '2026-08-10' })
  })
  it('has a parser version', () => expect(PARSER_VERSION).toBeTruthy())
})
