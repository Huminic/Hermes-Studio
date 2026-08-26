import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { makeXlsx, type Cell } from './helpers/make-xlsx'

const URL = 'http://127.0.0.1:3510/api/ingest/report'
const SECRET_FILE = '/tmp/ingest-dev-secret'
const hasServer = fs.existsSync(SECRET_FILE)
const SECRET = hasServer ? fs.readFileSync(SECRET_FILE, 'utf8').trim() : ''

async function post(filename: string, buf: Buffer) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: 'serra-honda', filename, content_base64: buf.toString('base64') }),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

// Real Lead Source ROI: SPACED headers, NO Dealer column (dealer + period from
// Filters), governed-eight Lead Types. (Was underscored/no-lead-types — that predated
// the real-schema contract and no longer classifies.)
const ROI_HEADER = ['Lead Source', 'Total Leads', 'Good Leads', 'Sold from Leads']
const ROI_EIGHT = 'Import, Internet, Phone, PreviousCustomer, Referral, Walk-in, WebsiteChat, Wholesale'
// Per-run nonce (benign Filters row) → fresh checksums each run, so the stateful
// duplicate/supersession assertions stay deterministic against the live dev db.
const NONCE = String(Date.now())
const roiWb = (totalLeads: number) =>
  makeXlsx([
    { name: 'Report', rows: [ROI_HEADER, ['Repeat Customer', totalLeads, totalLeads, 24]] },
    { name: 'Filters', rows: [['Base Report Name', 'Lead Source ROI'], ['Dealers', 'Serra Honda'], ['Lead Types', ROI_EIGHT], ['Date Range', '2026-09-01 - 2026-09-07'], ['Run', NONCE]] },
    { name: 'Sheet3', rows: [] },
  ])

// Real Enterprise Performance (CAGE): Dealer | Lead Type | User summary rows.
const CAGE_HEADER = ['Dealer', 'Lead Type', 'User', 'Total Leads', 'Good Leads', 'Bad Leads', 'Sold from Leads', 'Total Comms', 'Active Tasks']
const cageRow: Array<Cell> = ['Serra Honda of Sylacauga', 'Internet', 'Jane', 40, 30, 10, 5, 300, 2]

describe.skipIf(!hasServer)('XLSX ingest E2E (live dev endpoint :3510 → /srv/ingest-dev)', () => {
  it('accepts a valid Honda Lead Source ROI (Report+Filters+blank Sheet3)', async () => {
    const r = await post('roi_2026-09-01_2026-09-07.xlsx', roiWb(79))
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
    expect(r.body.kind).toBe('lead_source_roi')
    expect(r.body.period).toEqual({ start: '2026-09-01', end: '2026-09-07' })
  })

  it('duplicate checksum is a no-op', async () => {
    const buf = roiWb(79) // identical bytes to a prior post in this run
    await post('dup.xlsx', buf)
    const r = await post('dup.xlsx', buf)
    expect(r.body.ok).toBe(true)
    expect(r.body.outcome).toBe('duplicate')
  })

  it('corrected same-period data supersedes (revision bumps)', async () => {
    const r = await post('roi_corrected.xlsx', roiWb(88))
    expect(r.body.ok).toBe(true)
    expect(r.body.outcome).toBe('superseded')
    expect(Number(r.body.revision)).toBeGreaterThanOrEqual(2)
  })

  it('quarantines a multi-rooftop CAGE workbook (ambiguous-tenant, no metrics)', async () => {
    const wb = makeXlsx([
      { name: 'Report', rows: [CAGE_HEADER, cageRow] },
      { name: 'Filters', rows: [['Base Report Name', 'Enterprise Performance'], ['Dealers', 'Serra Honda; Serra Nissan; Tony Serra Ford'], ['Lead Intents', 'Parts, Sales, Service, Unknown']] },
    ])
    const r = await post('report-1838.xlsx', wb)
    expect(r.status).toBe(422)
    expect(r.body.quarantined).toBe(true)
    expect(r.body.reason).toBe('ambiguous-tenant')
  })

  it('quarantines a malformed workbook fail-closed', async () => {
    const r = await post('broken.xlsx', Buffer.from('PK not a real xlsx at all'))
    expect(r.status).toBe(422)
    expect(r.body.reason).toBe('malformed-workbook')
  })

  it('accepts a multi-section Dealership Performance Dashboard, preserving rows', async () => {
    const wb = makeXlsx([
      { name: 'Report', rows: [
        ['Dealership Performance Dashboard'],
        ['Dealership Summary'],
        ['Leads', 'Appts Set', 'Sold in Period', 'Total Gross'],
        [414, 120, 19, '$30,016'],
        ['Lead Type & Inventory Type Summary'],
        ['Internet', 200, 10, '$15,000'],
      ] },
      { name: 'Filters', rows: [['Base Report Name', 'Dealership Performance Dashboard'], ['Dealers', 'Serra Honda of Sylacauga'], ['Lead Types', 'Internet, Phone, Walk-in'], ['Date Range', '2026-08-03 - 2026-08-09'], ['Run', NONCE]] },
    ])
    const r = await post('dash_2026-08-03.xlsx', wb)
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
    expect(r.body.kind).toBe('dealership_performance')
    expect(Number(r.body.accepted_row_count)).toBeGreaterThan(0)
  })
})
