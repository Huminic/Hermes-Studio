import { describe, it, expect } from 'vitest'
import { readXlsx } from '@/server/ingest/xlsx-reader'
import { evaluateDelivery } from '@/server/ingest/vin-contracts'
import { makeXlsx, type Cell, type SheetSpec } from './helpers/make-xlsx'

const HONDA = 'Serra Honda'
const evalX = (sheets: Array<SheetSpec>, dealer = HONDA) =>
  evaluateDelivery(readXlsx(makeXlsx(sheets)).sheets, { profileDealer: dealer })

// A multi-section Dealership Performance Dashboard "Report" sheet — title, then
// several sections with their own column headers + rows (not a flat table).
const DASH_REPORT: Array<Array<Cell>> = [
  ['Dealership Performance Dashboard'],
  [],
  ['Dealership Summary'],
  ['Leads', 'Appts Set', 'Appts Set %', 'Appts Show', 'Appts Show %', 'Sold in Period', 'Front Gross', 'Back Gross', 'Avg Total Gross'],
  [414, 120, '29%', 66, '55%', 19, '$6,070', '$1,200', '$4,991'],
  [],
  ['Lead Type & Inventory Type Summary'],
  ['Leads', 'Appts Set', 'Appts Show', 'Sold in Period'],
  ['Internet', 200, 60, 10],
  ['Phone', 120, 30, 5],
  ['Walk-in', 94, 20, 4],
  [],
  ['Internet Leads'],
  ['Leads', 'Attempted Contact', 'Actual Contact', 'Avg Adjusted Min', 'Avg Actual Min'],
  [200, 180, 150, 4.2, 3.8],
  [],
  ['Communications'],
  ['Channel', 'In', 'Out', 'Total'],
  ['Phone', 100, 200, 300],
  ['Text', 50, 300, 350],
  [],
  ['Visit Summary'],
  ['Total Visits', 'Initial Visits', 'Be Backs', 'Walk Around', 'Demo', 'Writeup', 'C1', 'C7'],
  [42, 42, 0, 30, 20, 19, 5, 1],
]
const nonblankCount = DASH_REPORT.filter((r) => r.some((c) => c != null && String(c).trim() !== '')).length

const goodFilters = (): SheetSpec => ({
  name: 'Filters',
  rows: [
    ['Base Report Name', 'Dealership Performance Dashboard'],
    ['Dealers', 'Serra Honda of Sylacauga'],
    ['Lead Types', 'Internet, Phone, Walk-in'],
    ['Date Range', '2026-08-03 - 2026-08-09'],
  ],
})

describe('Dealership Performance Dashboard (multi-section family)', () => {
  it('accepts, preserving every non-blank section/marker/data row generically', () => {
    const r = evalX([{ name: 'Report', rows: DASH_REPORT }, goodFilters()])
    expect(r.status).toBe('accepted')
    if (r.status === 'accepted') {
      expect(r.kind).toBe('dealership_performance')
      expect(r.header).toEqual([]) // multi-section: no single header
      expect(r.rows.length).toBe(nonblankCount)
      expect(r.source_row_count).toBe(nonblankCount)
      expect(r.accepted_row_count).toBe(nonblankCount)
      expect(r.period).toEqual({ start: '2026-08-03', end: '2026-08-09' })
      // section markers preserved in the rows
      const flat = r.rows.flat()
      expect(flat).toContain('Dealership Summary')
      expect(flat).toContain('Lead Type & Inventory Type Summary')
      expect(flat).toContain('Visit Summary')
    }
  })

  it('classifies even without an explicit title, via section markers', () => {
    const noTitle = DASH_REPORT.slice(2) // drop the title row
    const r = evalX([{ name: 'Report', rows: noTitle }, goodFilters()])
    expect(r).toMatchObject({ status: 'accepted', kind: 'dealership_performance' })
  })

  it('quarantines multi-rooftop (ambiguous-tenant)', () => {
    const r = evalX([
      { name: 'Report', rows: DASH_REPORT },
      { name: 'Filters', rows: [['Base Report Name', 'Dealership Performance Dashboard'], ['Dealers', 'Serra Honda; Serra Nissan'], ['Lead Types', 'Internet, Phone, Walk-in']] },
    ])
    expect(r).toMatchObject({ status: 'quarantined', reason: 'ambiguous-tenant', kind: 'dealership_performance' })
  })

  it('quarantines lead types != exactly the three (incompatible-filter-metadata)', () => {
    const r = evalX([
      { name: 'Report', rows: DASH_REPORT },
      { name: 'Filters', rows: [['Dealers', 'Serra Honda of Sylacauga'], ['Lead Types', 'Internet, Phone']] },
    ])
    expect(r).toMatchObject({ status: 'quarantined', reason: 'incompatible-filter-metadata' })
  })

  it('quarantines a wrong dealer', () => {
    const r = evalX([
      { name: 'Report', rows: DASH_REPORT },
      { name: 'Filters', rows: [['Dealers', 'Serra Nissan of Sylacauga'], ['Lead Types', 'Internet, Phone, Walk-in']] },
    ])
    expect(r).toMatchObject({ status: 'quarantined', reason: 'wrong-dealer' })
  })

  it('quarantines when the Filters tab is missing (fail-closed)', () => {
    const r = evalX([{ name: 'Report', rows: DASH_REPORT }])
    expect(r).toMatchObject({ status: 'quarantined', reason: 'incompatible-filter-metadata' })
  })

  it('quarantines a Service/Parts filter intent (no row-level Sales proof on an aggregate)', () => {
    const r = evalX([
      { name: 'Report', rows: DASH_REPORT },
      { name: 'Filters', rows: [['Dealers', 'Serra Honda of Sylacauga'], ['Lead Types', 'Internet, Phone, Walk-in'], ['Lead Intents', 'Sales, Service']] },
    ])
    expect(r).toMatchObject({ status: 'quarantined', reason: 'non-sales-lead-type' })
  })
})
