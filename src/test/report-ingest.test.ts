import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openBrain } from '@/server/brain-store'
import {
  parseCsv,
  coerceInt,
  coerceReal,
  coercePct,
  coerceCurrency,
  detectReportKind,
  dealerMatches,
  periodFromFilename,
  ingestReport,
} from '@/server/report-ingest'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'report-ingest-test-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmpRoot, '.hermes', 'profiles')
})

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

// Real-shape fixtures (headers + rows mirror the 2026-05-13 Serra exports,
// including quoted fields with embedded commas and currency/percent cells).
const ROI_HEADERS =
  'Dealer,Lead_Source,Total_Leads,Good_Leads,Bad_Leads,Duplicate_Leads,Bad_Other_Leads,Customers_Influenced,Sold_in_Timeframe,Sold_in_Timeframe_Pct,Sold_from_Leads,Sold_from_Leads_Pct,Avg_Days_to_Sale,Internet_Attempted_Contact,Internet_Attempted_Contact_Pct,Internet_Actual_Contact,Internet_Actual_Contact_Pct,Internet_Avg_Attempts_to_Contact,Appts_Set,Appts_Set_Pct,Appts_Scheduled,Appts_Scheduled_Pct,Appts_Confirmed,Appts_Confirmed_Pct,Appts_Shown,Appts_Shown_Pct,Avg_Days_to_Appt_Set,Total_Visits,Initial_Visits,Be_Back_Visits,Avg_Days_to_Initial_Visit,Avg_Days_Initial_Visit_to_Be_Back,Total_Front_Gross,Avg_Front_Gross,Total_Back_Gross,Avg_Back_Gross,Total_Gross,Avg_Gross,Total_Cost,Cost_Per_Good_Lead,Cost_Per_Sold,Profit'

const ROI_CSV = [
  ROI_HEADERS,
  // Honda row with currency containing commas (quoted).
  'Serra Honda of Sylacauga,Repeat Customer,79,79,0,0,0,0,25,31.65%,24,30.38%,4.0,4,100.00%,4,100.00%,0.0,29,36.71%,27,34.18%,24,88.89%,20,74.07%,5.9,42,42,0,1.5,0.0,"$6,070.91",$242.84,"$23,945.94",$957.84,"$30,016.85","$1,200.67",$0.00,$0.00,$0.00,"$30,016.85"',
  // Honda zero row.
  'Serra Honda of Sylacauga,Expresscta,83,39,44,38,6,23,1,2.56%,1,2.56%,3.0,39,100.00%,30,76.92%,4.0,9,23.08%,9,23.08%,8,88.89%,6,66.67%,13.1,3,3,0,4.0,0.0,$0.00,$0.00,$0.00,$0.00,$0.00,$0.00,$0.00,$0.00,$0.00,$0.00',
  // A DIFFERENT dealer — must be filtered out for serra-honda.
  'Serra Nissan of Sylacauga,Autoweb,50,30,20,5,5,10,3,6.00%,3,6.00%,8.0,30,100.00%,20,66.67%,3.0,5,10.00%,5,10.00%,4,80.00%,3,60.00%,9.0,3,3,0,2.0,0.0,$1.00,$1.00,$1.00,$1.00,$2.00,$1.00,$0.00,$0.00,$0.00,$2.00',
].join('\n')

const KPI_HEADERS =
  'Dealer,Lead_Type,Salesperson,Internet_Leads,Internet_Leads_Sold_Pct,Internet_Actual_Contact,Internet_Actual_Contact_Pct,Appts_Set,Appts_Set_Pct,Appts_Shown,Appts_Shown_Pct,Appts_Shown_Sold,Appts_Shown_Sold_Pct,Calls_Out,Emails_Out,Texts_Out,Total_Comms'

const KPI_CSV = [
  KPI_HEADERS,
  'Serra Honda of Sylacauga,Internet,Brandon Donald,26,12%,24,92%,1,4%,10,91%,3,30%,49,526,713,"1,352"',
  'Serra Honda of Sylacauga,Internet,Caleb Jones,26,0%,19,73%,1,4%,5,71%,0,0%,380,585,682,"1,800"',
  'Serra Nissan of Sylacauga,Internet,Someone Else,5,0%,2,40%,0,0%,0,0%,0,0%,1,2,3,6',
].join('\n')

describe('parseCsv', () => {
  it('handles quoted fields with embedded commas and doubled quotes', () => {
    const m = parseCsv('a,b,c\n1,"2,200","sa ""y"" hi"\n')
    expect(m).toEqual([
      ['a', 'b', 'c'],
      ['1', '2,200', 'sa "y" hi'],
    ])
  })
  it('handles CRLF line endings and a missing trailing newline', () => {
    const m = parseCsv('x,y\r\n1,2\r\n3,4')
    expect(m).toEqual([
      ['x', 'y'],
      ['1', '2'],
      ['3', '4'],
    ])
  })
  it('drops fully-empty rows', () => {
    const m = parseCsv('a,b\n1,2\n\n,\n')
    expect(m).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('coercion', () => {
  it('coerceInt strips commas and rejects blanks', () => {
    expect(coerceInt('1,352')).toBe(1352)
    expect(coerceInt('')).toBeNull()
    expect(coerceInt('-')).toBeNull()
  })
  it('coerceReal parses decimals', () => {
    expect(coerceReal('5.9')).toBe(5.9)
    expect(coerceReal('0.0')).toBe(0)
  })
  it('coercePct returns a 0-1 fraction', () => {
    expect(coercePct('23.08%')).toBeCloseTo(0.2308, 6)
    expect(coercePct('100.00%')).toBe(1)
    expect(coercePct('')).toBeNull()
  })
  it('coerceCurrency strips $ and commas, supports parens-negatives', () => {
    expect(coerceCurrency('$6,070.91')).toBeCloseTo(6070.91, 2)
    expect(coerceCurrency('$0.00')).toBe(0)
    expect(coerceCurrency('($1,200.67)')).toBeCloseTo(-1200.67, 2)
    expect(coerceCurrency('')).toBeNull()
  })
})

describe('detection + dealer matching', () => {
  it('detects report kind from headers', () => {
    expect(detectReportKind(KPI_HEADERS.split(','))).toBe('kpi_salesperson')
    expect(detectReportKind(ROI_HEADERS.split(','))).toBe('lead_source_roi')
    expect(detectReportKind(['foo', 'bar'])).toBeNull()
  })
  it('matches a short configured name against the long CSV dealer', () => {
    expect(dealerMatches('Serra Honda', 'Serra Honda of Sylacauga')).toBe(true)
    expect(dealerMatches('Serra Nissan', 'Serra Honda of Sylacauga')).toBe(false)
    expect(dealerMatches('', 'Serra Honda of Sylacauga')).toBe(false)
  })
  it('derives the period from a dated filename', () => {
    expect(periodFromFilename('SerraAuto_ROI_2026-05-13.csv')).toBe('2026-05-13')
    expect(periodFromFilename('nodate.csv')).toBeNull()
  })
})

describe('ingestReport — lead_source_roi', () => {
  it('ingests only the profile dealer rows with correct coercion', () => {
    const r = ingestReport({
      profile: 'serra-honda',
      text: ROI_CSV,
      filename: 'SerraAuto_LeadSourceROI_Combined_2026-05-13.csv',
      dealerName: 'Serra Honda',
      checksum: 'sum-roi-1',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.report_kind).toBe('lead_source_roi')
    expect(r.row_count).toBe(2) // Nissan row filtered out
    expect(r.dealers_in_file.sort()).toEqual([
      'Serra Honda of Sylacauga',
      'Serra Nissan of Sylacauga',
    ])

    const h = openBrain('serra-honda')
    try {
      const rows = h.all<{
        lead_source: string
        total_leads: number
        sold_from_leads_pct: number
        total_gross: number
        avg_days_to_sale: number
      }>(
        `SELECT lead_source, total_leads, sold_from_leads_pct, total_gross, avg_days_to_sale
         FROM report_lead_source_roi ORDER BY total_leads DESC`,
      )
      expect(rows.length).toBe(2)
      expect(rows.every((x) => x.lead_source)).toBe(true)
      const repeat = rows.find((x) => x.lead_source === 'Repeat Customer')!
      expect(repeat.total_leads).toBe(79)
      expect(repeat.sold_from_leads_pct).toBeCloseTo(0.3038, 4)
      expect(repeat.total_gross).toBeCloseTo(30016.85, 2)
      expect(repeat.avg_days_to_sale).toBe(4)
      // No Nissan leakage.
      const nissan = h.all(
        `SELECT * FROM report_lead_source_roi WHERE dealer LIKE '%Nissan%'`,
      )
      expect(nissan.length).toBe(0)
    } finally {
      h.close()
    }
  })

  it('is idempotent by checksum — re-ingest replaces, never doubles', () => {
    const args = {
      profile: 'serra-honda',
      text: ROI_CSV,
      filename: 'roi_2026-05-13.csv',
      dealerName: 'Serra Honda',
      checksum: 'sum-roi-2',
    }
    ingestReport(args)
    const second = ingestReport(args)
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.replaced_prior).toBe(true)
    const h = openBrain('serra-honda')
    try {
      const n = h.get<{ c: number }>(
        `SELECT COUNT(*) AS c FROM report_lead_source_roi`,
      )
      expect(n?.c).toBe(2)
      const imports = h.get<{ c: number }>(
        `SELECT COUNT(*) AS c FROM report_imports WHERE checksum = 'sum-roi-2'`,
      )
      expect(imports?.c).toBe(1)
    } finally {
      h.close()
    }
  })
})

describe('ingestReport — kpi_salesperson', () => {
  it('ingests salesperson rows scoped to the dealer', () => {
    const r = ingestReport({
      profile: 'serra-honda',
      text: KPI_CSV,
      filename: 'SerraAuto_KPI_MTD_All_Stores_2026-05-13.csv',
      dealerName: 'Serra Honda',
      checksum: 'sum-kpi-1',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.report_kind).toBe('kpi_salesperson')
    expect(r.row_count).toBe(2)

    const h = openBrain('serra-honda')
    try {
      const rows = h.all<{
        salesperson: string
        internet_leads: number
        texts_out: number
        total_comms: number
      }>(
        `SELECT salesperson, internet_leads, texts_out, total_comms
         FROM report_kpi_salesperson ORDER BY salesperson`,
      )
      expect(rows.map((x) => x.salesperson)).toEqual([
        'Brandon Donald',
        'Caleb Jones',
      ])
      const brandon = rows[0]
      expect(brandon.internet_leads).toBe(26)
      expect(brandon.texts_out).toBe(713)
      expect(brandon.total_comms).toBe(1352) // quoted "1,352"
    } finally {
      h.close()
    }
  })
})

describe('ingestReport — rejections', () => {
  it('rejects xlsx', () => {
    const r = ingestReport({
      profile: 'serra-honda',
      text: 'whatever',
      filename: 'report.xlsx',
      dealerName: 'Serra Honda',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('unsupported-format')
  })
  it('rejects an unrecognized CSV', () => {
    const r = ingestReport({
      profile: 'serra-honda',
      text: 'foo,bar\n1,2\n',
      filename: 'random.csv',
      dealerName: 'Serra Honda',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('unrecognized')
  })
  it('rejects when no dealer is configured', () => {
    const r = ingestReport({
      profile: 'serra-honda',
      text: ROI_CSV,
      filename: 'roi.csv',
      dealerName: '',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('no-dealer')
  })
})
