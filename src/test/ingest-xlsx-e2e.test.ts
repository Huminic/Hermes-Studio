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

const ROI_HEADER = ['Dealer', 'Lead_Source', 'Total_Leads', 'Good_Leads', 'Sold_from_Leads']
const roiWb = (totalLeads: number) =>
  makeXlsx([
    { name: 'Report', rows: [ROI_HEADER, ['Serra Honda of Sylacauga', 'Repeat Customer', totalLeads, totalLeads, 24]] },
    { name: 'Filters', rows: [['Base Report Name', 'Lead Source ROI'], ['Dealers', 'Serra Honda'], ['Date Range', '2026-09-01 - 2026-09-07']] },
    { name: 'Sheet3', rows: [] },
  ])

const CAGE_HEADER = ['User', 'Total Leads', 'Good Leads', 'Bad Leads', 'Sold from Leads', 'Total Calls', 'Total Emails', 'Total Texts', 'Total Facebook', 'Total Comms In', 'Total Comms Out', 'Total Comms', 'Active Tasks', 'Completed Tasks', 'Dismissed Tasks', 'Inactive Tasks', 'Missed Tasks', 'Deals from Leads', 'Leads Eligible for Deals', 'Deals from Leads %', 'Deals Created in Time Frame']
const cageRow: Array<Cell> = ['Jane', 40, 30, 10, 5, 49, 526, 713, 3, 100, 200, 300, 2, 8, 1, 0, 3, 4, 10, '40%', 4]

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
})
