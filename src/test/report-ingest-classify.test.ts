import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openBrain } from '@/server/brain-store'
import { classifyHeaders, ingestReport, parseCsv } from '@/server/report-ingest'

let tmpRoot: string
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-classify-test-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmpRoot, '.hermes', 'profiles')
})
afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

const ROI_HEADERS =
  'Dealer,Lead_Source,Total_Leads,Good_Leads,Bad_Leads,Sold_from_Leads,Total_Gross'
const roiRow = (dealer: string, src: string) =>
  `${dealer},${src},50,40,10,5,"$10,000.00"`

describe('classifyHeaders', () => {
  it('detects ROI kind and marks all mapped columns recognized', () => {
    const { kind, recognized, ignored } = classifyHeaders(
      ROI_HEADERS.split(','),
    )
    expect(kind).toBe('lead_source_roi')
    expect(recognized).toContain('Dealer')
    expect(recognized).toContain('Lead_Source')
    expect(recognized).toContain('Total_Leads')
    expect(ignored).toEqual([])
  })

  it('detects KPI kind', () => {
    const { kind } = classifyHeaders(
      'Dealer,Salesperson,Total_Comms,Calls_Out'.split(','),
    )
    expect(kind).toBe('kpi_salesperson')
  })

  it('surfaces an unknown/new column as ignored, still detecting the kind', () => {
    const { kind, recognized, ignored } = classifyHeaders(
      (ROI_HEADERS + ',Mystery_New_Field').split(','),
    )
    expect(kind).toBe('lead_source_roi')
    expect(ignored).toEqual(['Mystery_New_Field'])
    expect(recognized).not.toContain('Mystery_New_Field')
  })

  it('returns kind=null for a non-VIN CSV (everything ignored)', () => {
    const { kind, recognized } = classifyHeaders('foo,bar,baz'.split(','))
    expect(kind).toBeNull()
    expect(recognized).toEqual([])
  })
})

describe('ingestReport with explicit period + unknown-column tolerance', () => {
  it('honors periodStart/periodEnd over the filename date', () => {
    const csv = [ROI_HEADERS, roiRow('Serra Honda of Sylacauga', 'Repeat')].join(
      '\n',
    )
    const res = ingestReport({
      profile: 'serra-honda',
      text: csv,
      filename: 'roi_2026-05-13.csv', // filename says 05-13...
      dealerName: 'Serra Honda',
      checksum: 'chk-1',
      periodStart: '2026-08-04', // ...but the hint wins
      periodEnd: '2026-08-10',
    })
    expect(res.ok).toBe(true)
    const h = openBrain('serra-honda', {})
    const rows = h.all<{ period_start: string; period_end: string }>(
      'SELECT period_start, period_end FROM report_imports',
    )
    expect(rows[0]).toEqual({
      period_start: '2026-08-04',
      period_end: '2026-08-10',
    })
    // The override must also reach the DETAIL rows, not just report_imports.
    const detail = h.all<{ period_start: string; period_end: string }>(
      'SELECT period_start, period_end FROM report_lead_source_roi',
    )
    expect(detail.length).toBeGreaterThan(0)
    for (const d of detail) {
      expect(d).toEqual({ period_start: '2026-08-04', period_end: '2026-08-10' })
    }
  })

  it('ingests known columns even when an unknown column is present', () => {
    const headers = ROI_HEADERS + ',Mystery_New_Field'
    const csv = [
      headers,
      roiRow('Serra Honda of Sylacauga', 'Repeat') + ',surprise',
      roiRow('Serra Honda of Sylacauga', 'Walk-In') + ',surprise2',
    ].join('\n')
    const res = ingestReport({
      profile: 'serra-honda',
      text: csv,
      filename: 'roi_2026-08-10.csv',
      dealerName: 'Serra Honda',
      checksum: 'chk-2',
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.row_count).toBe(2)
  })

  it('filters rows to the configured dealer (no sibling bleed)', () => {
    const csv = [
      ROI_HEADERS,
      roiRow('Serra Honda of Sylacauga', 'Repeat'),
      roiRow('Serra Nissan of Sylacauga', 'Autoweb'),
    ].join('\n')
    const res = ingestReport({
      profile: 'serra-honda',
      text: csv,
      filename: 'roi_2026-08-10.csv',
      dealerName: 'Serra Honda',
      checksum: 'chk-3',
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.row_count).toBe(1)
      expect(res.dealers_in_file.sort()).toEqual([
        'Serra Honda of Sylacauga',
        'Serra Nissan of Sylacauga',
      ])
    }
  })

  it('parseCsv + classifyHeaders agree on a real quoted header row', () => {
    const csv = [ROI_HEADERS, roiRow('Serra Honda of Sylacauga', 'Repeat')].join(
      '\n',
    )
    const first = parseCsv(csv)[0]
    expect(classifyHeaders(first).kind).toBe('lead_source_roi')
  })
})
