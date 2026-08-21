import { describe, it, expect } from 'vitest'
import { readXlsx } from '@/server/ingest/xlsx-reader'
import { evaluateDelivery, parseFilters, PARSER_VERSION } from '@/server/ingest/vin-contracts'
import { makeXlsx, type Cell } from './helpers/make-xlsx'

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

// ── CAGE KPI / Enterprise Performance (21-col, filter-level) ──
const CAGE_HEADER = ['User', 'Total Leads', 'Good Leads', 'Bad Leads', 'Sold from Leads', 'Total Calls', 'Total Emails', 'Total Texts', 'Total Facebook', 'Total Comms In', 'Total Comms Out', 'Total Comms', 'Active Tasks', 'Completed Tasks', 'Dismissed Tasks', 'Inactive Tasks', 'Missed Tasks', 'Deals from Leads', 'Leads Eligible for Deals', 'Deals from Leads %', 'Deals Created in Time Frame']
const cageRow = (): Array<Cell> => ['Jane', 40, 30, 10, 5, 49, 526, 713, 3, 100, 200, 300, 2, 8, 1, 0, 3, 4, 10, '40%', 4]

describe('CAGE KPI / Enterprise Performance', () => {
  it('accepts one dealer + lead types exactly {Internet,Phone,Walk-in}', () => {
    const wb = makeXlsx([
      { name: 'Report', rows: [CAGE_HEADER, cageRow()] },
      { name: 'Filters', rows: [['Base Report Name', 'Enterprise Performance'], ['Dealers', 'Serra Honda'], ['Lead Types', 'Internet, Phone, Walk-in']] },
    ])
    expect(evalXlsx(wb)).toMatchObject({ status: 'accepted', kind: 'cage_kpi' })
  })

  it('quarantines lead types other than exactly the three (incompatible-filter-metadata)', () => {
    const wb = makeXlsx([
      { name: 'Report', rows: [CAGE_HEADER, cageRow()] },
      { name: 'Filters', rows: [['Base Report Name', 'Enterprise Performance'], ['Dealers', 'Serra Honda'], ['Lead Types', 'Internet, Phone']] },
    ])
    expect(evalXlsx(wb)).toMatchObject({ status: 'quarantined', reason: 'incompatible-filter-metadata' })
  })

  it('quarantines multi-rooftop (Report-1838 shape → ambiguous-tenant)', () => {
    const wb = makeXlsx([
      { name: 'Report', rows: [CAGE_HEADER, cageRow()] },
      { name: 'Filters', rows: [['Base Report Name', 'Enterprise Performance'], ['Dealers', 'Serra Honda; Serra Nissan; Tony Serra Ford'], ['Lead Intents', 'Parts, Sales, Service, Unknown']] },
    ])
    expect(evalXlsx(wb)).toMatchObject({ status: 'quarantined', reason: 'ambiguous-tenant' })
  })
})

// ── Lead Source ROI (Report + Filters + blank Sheet3) ──
const ROI_HEADER = ['Dealer', 'Lead_Source', 'Total_Leads', 'Good_Leads', 'Sold_from_Leads']
describe('Lead Source ROI', () => {
  it('accepts Report+Filters with a truly-blank Sheet3', () => {
    const wb = makeXlsx([
      { name: 'Report', rows: [ROI_HEADER, [HONDA_ROW, 'Repeat Customer', 79, 79, 24]] },
      { name: 'Filters', rows: [['Base Report Name', 'Lead Source ROI'], ['Dealers', 'Serra Honda'], ['Date Range', '2026-08-04 - 2026-08-10']] },
      { name: 'Sheet3', rows: [] },
    ])
    expect(evalXlsx(wb)).toMatchObject({ status: 'accepted', kind: 'lead_source_roi' })
  })

  it('quarantines a non-blank uncontracted sheet', () => {
    const wb = makeXlsx([
      { name: 'Report', rows: [ROI_HEADER, [HONDA_ROW, 'Repeat Customer', 79, 79, 24]] },
      { name: 'Filters', rows: [['Dealers', 'Serra Honda']] },
      { name: 'Sheet3', rows: [['unexpected', 'content']] },
    ])
    expect(evalXlsx(wb)).toMatchObject({ status: 'quarantined', reason: 'extra-nonblank-sheet' })
  })

  it('quarantines a Service-coded lead source', () => {
    const wb = makeXlsx([{ name: 'Report', rows: [ROI_HEADER, [HONDA_ROW, 'Service Drive', 5, 5, 0]] }])
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

describe('Appointments (Sheet1-only)', () => {
  const APPT_HEADER = ['Appointment ID', 'Dealer', 'Dealer ID', 'Appointment Start Date', 'Appointment Status', 'Is Confirmed', 'Rescheduled Date', 'Completed Date', 'Is Show', 'Is No Show', 'Appointment Reason']
  const apptRow = (reason: string): Array<Cell> => ['A1', HONDA_ROW, '123', { date: '2026-08-06' }, 'Scheduled', 'TRUE', '', '', 'FALSE', 'FALSE', reason]
  it('accepts Sales Appointment rows', () => {
    const wb = makeXlsx([{ name: 'Sheet1', rows: [APPT_HEADER, apptRow('Sales Appointment')] }])
    expect(evalXlsx(wb)).toMatchObject({ status: 'accepted', kind: 'appointments' })
  })
  it('quarantines a non-Sales appointment reason', () => {
    const wb = makeXlsx([{ name: 'Sheet1', rows: [APPT_HEADER, apptRow('Service Appointment')] }])
    expect(evalXlsx(wb)).toMatchObject({ status: 'quarantined', reason: 'non-sales-appointment-reason' })
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
