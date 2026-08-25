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

  it('VULNERABLE filter (selects Service/Parts) but all rows Sales → accepted + flag', () => {
    const wb = makeXlsx([
      { name: 'Report', rows: [COMM_HEADER, commRow('Internet')] },
      { name: 'Filters', rows: [['Lead Intents', 'Parts, Sales, Service, Unknown'], ['Dealers', 'Serra Honda']] },
    ])
    const r = evalXlsx(wb)
    expect(r.status).toBe('accepted')
    if (r.status === 'accepted') expect(r.schedule_vulnerability).toBe(true)
  })

  it('VULNERABLE filter AND a Service row → quarantine (never silently clean)', () => {
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
const cageFilters = (o: { dealers?: string; leadTypes?: string } = {}): Array<Array<Cell>> => [
  ['Filter Name', 'Number Selected', 'Selected Values'],
  ['Base Report Name', '1', 'Enterprise Performance'],
  ['Dealers', '1', o.dealers ?? HONDA_ROW],
  ['Lead Types', '3', o.leadTypes ?? 'Internet, Phone, Walk-in'],
  ['Lead Intents', '4', 'Parts, Sales, Service, Unknown'],
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
  ['Lead Intents', '4', 'Parts, Sales, Service, Unknown'],
  ['Lead Sources Excluded', '5', 'Service, Service Appraisal, Service Dept'],
  ['Date Range Begin', '1', 'Aug 17 2026 12:00AM'],
  ['Date Range End', '1', 'Aug 23 2026 11:59PM'],
]
const roiWbC = (o = {}, extraSheet?: SheetSpec) => makeXlsx([{ name: 'Report', rows: [ROI_HEADER, ...roiRows(o)] }, { name: 'Filters', rows: roiFilters(o) }, extraSheet ?? { name: 'Sheet3', rows: [] }])

describe('Lead Source ROI (real schema)', () => {
  it('accepts: Base Report Name + single Filters dealer + governed 8 + Begin/End; Service in exclusions OK + vulnerability flagged', () => {
    const r = evalXlsx(roiWbC())
    expect(r.status).toBe('accepted')
    if (r.status === 'accepted') {
      expect(r.kind).toBe('lead_source_roi')
      expect(r.dealer).toBe(HONDA_ROW)
      expect(r.period).toEqual({ start: '2026-08-17', end: '2026-08-23' })
      expect(r.schedule_vulnerability).toBe(true) // Lead Intents implicitly include Parts/Service — preserved, not disqualifying
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
