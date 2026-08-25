import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readXlsx } from '@/server/ingest/xlsx-reader'
import { evaluateDelivery } from '@/server/ingest/vin-contracts'
import { listActiveRows, recordDelivery } from '@/server/ingest/ingest-delivery-store'
import { makeXlsx, type Cell, type SheetSpec } from './helpers/make-xlsx'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'family-retention-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmp, '.hermes', 'profiles')
})
afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
})

const HONDA_ROW = 'Serra Honda of Sylacauga'

function ingestReadback(sheets: Array<SheetSpec>, checksum: string) {
  const evalR = evaluateDelivery(readXlsx(makeXlsx(sheets)).sheets, { profileDealer: 'Serra Honda' })
  if (evalR.status !== 'accepted') throw new Error(`expected accepted, got ${JSON.stringify(evalR)}`)
  recordDelivery(
    {
      profile: 'serra-honda', dealer: evalR.dealer, report_kind: evalR.kind,
      period_start: evalR.period.start, period_end: evalR.period.end, source_filename: `${checksum}.xlsx`,
      source_filter_metadata: evalR.filters?.raw ?? null, final_filter_metadata: null,
      checksum, parser_version: 'vin-xlsx-1',
      source_row_count: evalR.source_row_count, accepted_row_count: evalR.accepted_row_count, header: evalR.header,
      validation_evidence: evalR.evidence, status: 'accepted', quarantine_reason: null,
    },
    evalR.rows,
    1000,
  )
  return { kind: evalR.kind, active: listActiveRows('serra-honda', { report_kind: evalR.kind }) }
}

const COMM_HEADER = ['Dealer', 'User Group', 'User', 'Customer', 'Activity Date', 'Direction', 'Comm Channel', 'Comm Type', 'Interaction Result', 'Lead Type', 'Lead Status Type', 'Lead Source', 'Lead Created Date', 'Message Content']
const CAGE_HEADER = ['Dealer', 'Lead Type', 'User', 'Total Leads', 'Good Leads', 'Bad Leads', 'Sold from Leads', 'Total Comms', 'Active Tasks']
const ROI_HEADER = ['Lead Source', 'Total Leads', 'Good Leads', 'Bad Leads', 'Duplicate Leads', 'Sold from Leads']
const GROSS_HEADER = ['Dealer', 'Dealer ID', 'Sold Date', 'Sale ID', 'Deal Number', 'Delivered status', 'Front Gross', 'Back Gross', 'Total Gross']
const APPT_HEADER = ['Appointment ID', 'Dealer', 'Dealer ID', 'Appointment Type', 'Appt Reason', 'Appointment Start Date', 'Appointment Start DateTime', 'Appointment Status']
const REAL_FILTERS = (base: string, leadTypes: string): Array<Array<Cell>> => [
  ['Filter Name', 'Number Selected', 'Selected Values'],
  ['Base Report Name', '1', base],
  ['Dealers', '1', HONDA_ROW],
  ['Lead Types', String(leadTypes.split(',').length), leadTypes],
  ['Date Range Begin', '1', 'Aug 17 2026 12:00AM'],
  ['Date Range End', '1', 'Aug 23 2026 11:59PM'],
]
const ROI_EIGHT = 'Import, Internet, Phone, PreviousCustomer, Referral, Walk-in, WebsiteChat, Wholesale'

describe('per-family accepted-row retention (workbook → store → readback)', () => {
  it('Lead Source ROI retains its row data', () => {
    const { kind, active } = ingestReadback([
      { name: 'Report', rows: [ROI_HEADER, ['Repeat Customer', 79, 79, 6, 6, 24]] },
      { name: 'Filters', rows: REAL_FILTERS('Lead Source ROI', ROI_EIGHT) },
      { name: 'Sheet3', rows: [] },
    ], 'roi')
    expect(kind).toBe('lead_source_roi')
    expect(active).toHaveLength(1)
    expect(active[0].row).toEqual(['Repeat Customer', '79', '79', '6', '6', '24'])
  })

  it('CAGE / Enterprise Performance retains its fields', () => {
    const row: Array<Cell> = [HONDA_ROW, 'Internet', 'Jane', 30, 28, 2, 2, 400, 20]
    const { kind, active } = ingestReadback([
      { name: 'Report', rows: [CAGE_HEADER, row] },
      { name: 'Filters', rows: REAL_FILTERS('Enterprise Performance', 'Internet, Phone, Walk-in') },
    ], 'cage')
    expect(kind).toBe('cage_kpi')
    expect(active[0].row).toHaveLength(9)
    expect(active[0].row[0]).toBe(HONDA_ROW)
    expect(active[0].row[2]).toBe('Jane')
  })

  it('Sales Communication Log retains rows incl. ISO-resolved dates', () => {
    const { kind, active } = ingestReadback([
      { name: 'Report', rows: [COMM_HEADER, [HONDA_ROW, 'Sales', 'Jane', 'Cust A', { date: '2026-08-05' }, 'Outbound', 'SMS', 'Text', 'Reached', 'Internet', 'Sales', 'Autoweb', { date: '2026-08-04' }, 'hello']] },
      { name: 'Filters', rows: [['Dealers', 'Serra Honda']] },
    ], 'comm')
    expect(kind).toBe('sales_comm_log')
    expect(active[0].row[4]).toBe('2026-08-05') // Activity Date ISO
    expect(active[0].row[13]).toBe('hello')
  })

  it('CRM Sales Gross (Sheet1-only) retains rows + ISO Sold Date', () => {
    const { kind, active } = ingestReadback([
      { name: 'Sheet1', rows: [GROSS_HEADER, [HONDA_ROW, '123', { date: '2026-08-05' }, 'S1', 'D1', 'Delivered', 1000, 500, 1500]] },
    ], 'gross')
    expect(kind).toBe('crm_sales_gross')
    expect(active[0].row[2]).toBe('2026-08-05')
    expect(active[0].row[8]).toBe('1500')
  })

  it('Appointments (Sheet1-only) retains Sales Appointment rows', () => {
    const { kind, active } = ingestReadback([
      { name: 'Sheet1', rows: [APPT_HEADER, ['145710109', HONDA_ROW, '21043', 'Meeting', 'Sales Appointment', { date: '2026-08-18' }, { date: '2026-08-18' }, 'Cancelled']] },
    ], 'appt')
    expect(kind).toBe('appointments')
    expect(active[0].row[4]).toBe('Sales Appointment') // Appt Reason
    expect(active[0].row[5]).toBe('2026-08-18') // Appointment Start Date (ISO)
  })
})
