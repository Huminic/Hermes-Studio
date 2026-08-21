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
const CAGE_HEADER = ['User', 'Total Leads', 'Good Leads', 'Bad Leads', 'Sold from Leads', 'Total Calls', 'Total Emails', 'Total Texts', 'Total Facebook', 'Total Comms In', 'Total Comms Out', 'Total Comms', 'Active Tasks', 'Completed Tasks', 'Dismissed Tasks', 'Inactive Tasks', 'Missed Tasks', 'Deals from Leads', 'Leads Eligible for Deals', 'Deals from Leads %', 'Deals Created in Time Frame']
const ROI_HEADER = ['Dealer', 'Lead_Source', 'Total_Leads', 'Good_Leads', 'Sold_from_Leads']
const GROSS_HEADER = ['Dealer', 'Dealer ID', 'Sold Date', 'Sale ID', 'Deal Number', 'Delivered status', 'Front Gross', 'Back Gross', 'Total Gross']
const APPT_HEADER = ['Appointment ID', 'Dealer', 'Dealer ID', 'Appointment Start Date', 'Appointment Status', 'Is Confirmed', 'Rescheduled Date', 'Completed Date', 'Is Show', 'Is No Show', 'Appointment Reason']

describe('per-family accepted-row retention (workbook → store → readback)', () => {
  it('Lead Source ROI retains its row data', () => {
    const { kind, active } = ingestReadback([
      { name: 'Report', rows: [ROI_HEADER, [HONDA_ROW, 'Repeat Customer', 79, 79, 24]] },
      { name: 'Filters', rows: [['Dealers', 'Serra Honda'], ['Date Range', '2026-08-04 - 2026-08-10']] },
    ], 'roi')
    expect(kind).toBe('lead_source_roi')
    expect(active).toHaveLength(1)
    expect(active[0].row).toEqual([HONDA_ROW, 'Repeat Customer', '79', '79', '24'])
  })

  it('CAGE KPI retains its 21 fields', () => {
    const row: Array<Cell> = ['Jane', 40, 30, 10, 5, 49, 526, 713, 3, 100, 200, 300, 2, 8, 1, 0, 3, 4, 10, '40%', 4]
    const { kind, active } = ingestReadback([
      { name: 'Report', rows: [CAGE_HEADER, row] },
      { name: 'Filters', rows: [['Base Report Name', 'Enterprise Performance'], ['Dealers', 'Serra Honda'], ['Lead Types', 'Internet, Phone, Walk-in']] },
    ], 'cage')
    expect(kind).toBe('cage_kpi')
    expect(active[0].row).toHaveLength(21)
    expect(active[0].row[0]).toBe('Jane')
    expect(active[0].row[20]).toBe('4')
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
      { name: 'Sheet1', rows: [APPT_HEADER, ['A1', HONDA_ROW, '123', { date: '2026-08-06' }, 'Scheduled', 'TRUE', '', '', 'FALSE', 'FALSE', 'Sales Appointment']] },
    ], 'appt')
    expect(kind).toBe('appointments')
    expect(active[0].row[3]).toBe('2026-08-06')
    expect(active[0].row[10]).toBe('Sales Appointment')
  })
})
