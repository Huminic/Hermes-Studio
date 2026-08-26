import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { makeXlsx, type Cell } from './helpers/make-xlsx'
import {
  landDelivery, readHeldReceipt, listHeldDeliveries, isHoldEligible, parseRowDate,
  HOLD_ELIGIBLE, HOLD_CONTRACT, holdRoot, type HoldMetadata,
} from '@/server/ingest/hold-store'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hold-'))
  process.env.INGEST_HOLD_ROOT = path.join(tmp, 'hold')
})
afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
  delete process.env.INGEST_HOLD_ROOT
})

const DEALER = 'Serra Honda' // studio config dealer name
const CAPTURED = '2026-08-24T00:00:00.000Z'
const OPTS = { profileDealer: DEALER, capturedAt: CAPTURED }

// Real Lead Source ROI: spaced headers, NO Dealer column, dealer/period from 3-col Filters.
const ROI_EIGHT = 'Import, Internet, Phone, PreviousCustomer, Referral, Walk-in, WebsiteChat, Wholesale'
const roiWb = (o: { dealer?: string; total?: number; dealers?: string; period?: [string, string]; source?: string; leadTypes?: string } = {}) => {
  const total = o.total ?? 79
  const [begin, end] = o.period ?? ['2026-08-03', '2026-08-09']
  const rows: Array<Array<Cell>> = [
    ['Lead Source', 'Total Leads', 'Good Leads', 'Sold from Leads'],
    [o.source ?? 'Repeat', total, total, 24],
  ]
  return makeXlsx([
    { name: 'Report', rows },
    { name: 'Filters', rows: [
      ['Filter Name', 'Number Selected', 'Selected Values'],
      ['Base Report Name', '1', 'Lead Source ROI'],
      ['Dealers', '1', o.dealers ?? o.dealer ?? 'Serra Honda of Sylacauga'],
      ['Lead Types', '8', o.leadTypes ?? ROI_EIGHT],
      ['Date Range Begin', '1', begin],
      ['Date Range End', '1', end],
    ] },
  ])
}

const meta = (over: Partial<HoldMetadata> = {}): HoldMetadata => ({
  profile: 'serra-honda', sender: 'reports@vinsolutions.com', subject: 'Lead Source ROI',
  gmail_message_id: 'gmail-abc', filename: 'roi_2026-08-03.xlsx', received_at: '2026-08-24T00:00:00Z', ...over,
})

describe('HOLD_ONLY landing — held happy path', () => {
  it('preserves bytes immutably, writes a full manifest receipt, no action', () => {
    const buf = roiWb()
    const r = landDelivery(buf, meta(), OPTS)
    expect(r.outcome).toBe('held')
    const m = r.manifest
    expect(m.validation_state).toBe('held')
    expect(m.report_kind).toBe('lead_source_roi')
    expect(m.period).toEqual({ start: '2026-08-03', end: '2026-08-09' })
    expect(m.sha256).toHaveLength(64)
    expect(m.size_bytes).toBe(buf.length)
    expect(m.gmail_message_id).toBe('gmail-abc')
    expect(m.sender).toBe('reports@vinsolutions.com')
    expect(m.subject).toBe('Lead Source ROI')
    expect(m.parser_version).toBe('vin-xlsx-1')
    expect(m.transform_version).toBe('hold-only-3')
    expect(m.captured_at).toBe(CAPTURED)
    expect(m.hold_only).toBe(true)
    expect(m.no_action).toBe(true)
    // bytes on disk are byte-identical to the source
    expect(fs.existsSync(r.original_path)).toBe(true)
    expect(fs.readFileSync(r.original_path).equals(buf)).toBe(true)
    expect(fs.existsSync(r.manifest_path)).toBe(true)
    // deterministic layout: profile/held/kind/period/sha
    expect(r.hold_path).toContain(path.join('serra-honda', 'held', 'lead_source_roi', '2026-08-03_2026-08-09'))
  })

  it('idempotent replay is a no-op with the same receipt id', () => {
    const buf = roiWb()
    const first = landDelivery(buf, meta(), OPTS)
    const bytesBefore = fs.readFileSync(first.original_path)
    const second = landDelivery(buf, meta(), OPTS)
    expect(second.outcome).toBe('replay')
    expect(second.manifest.receipt_id).toBe(first.manifest.receipt_id)
    expect(fs.readFileSync(first.original_path).equals(bytesBefore)).toBe(true)
  })

  it('a corrected checksum is stored separately and attributably', () => {
    const r1 = landDelivery(roiWb({ total: 79 }), meta(), OPTS)
    const r2 = landDelivery(roiWb({ total: 88 }), meta({ filename: 'roi_corrected.xlsx' }), OPTS)
    expect(r2.outcome).toBe('held')
    expect(r2.manifest.sha256).not.toBe(r1.manifest.sha256)
    expect(r2.manifest.prior_sha256_in_period).toContain(r1.manifest.sha256)
    expect(fs.existsSync(r1.original_path)).toBe(true) // prior retained, not overwritten
    expect(fs.existsSync(r2.original_path)).toBe(true)
  })
})

// CRM Sales Gross: coverage window (trusted period_hint) ≠ observed sale dates.
const GROSS_HEADER = ['Dealer', 'Dealer ID', 'Sold Date', 'Sale ID', 'Deal Number', 'Delivered status', 'Front Gross', 'Back Gross', 'Total Gross']
const grossWb = (dates: Array<string>) => makeXlsx([{ name: 'Sheet1', rows: [
  GROSS_HEADER,
  ...dates.map((d, i): Array<Cell> => ['Serra Honda of Sylacauga', '21043', { date: d }, `S${i}`, `D${i}`, 'Delivered', 1000, 500, 1500]),
] }])
const grossMeta = (over: Partial<HoldMetadata> = {}): HoldMetadata => meta({ filename: 'gross.xlsx', subject: 'CRM Sales Gross', ...over })

describe('HOLD_ONLY landing — CRM Sales Gross coverage period (operator correction 2026-08-25)', () => {
  it('HELD: coverage = trusted period_hint; sales only mid-week fall INSIDE it (not min/max equality)', () => {
    // scheduled coverage = Mon–Sun; actual sales only Tue + Thu
    const r = landDelivery(grossWb(['2026-08-18', '2026-08-20']), grossMeta({ period_hint: '2026-08-17/2026-08-23' }), OPTS)
    expect(r.outcome).toBe('held')
    expect(r.manifest.report_kind).toBe('crm_sales_gross')
    // stored period is the COVERAGE window, not the observed 08-18..08-20 range
    expect(r.manifest.period).toEqual({ start: '2026-08-17', end: '2026-08-23' })
    expect(r.manifest.evidence.observed_date_range).toEqual({ min: '2026-08-18', max: '2026-08-20' })
    expect(r.manifest.evidence.period_source).toBe('period_hint_coverage')
  })
  it('QUARANTINE: a Sold Date outside the coverage window fails closed', () => {
    const r = landDelivery(grossWb(['2026-08-18', '2026-08-30']), grossMeta({ filename: 'g2.xlsx', period_hint: '2026-08-17/2026-08-23' }), OPTS)
    expect(r.outcome).toBe('quarantined')
    expect(r.manifest.quarantine_reason).toBe('unexpected-period')
  })
  it('QUARANTINE: no coverage period_hint (coverage must come from trusted metadata, not observed rows)', () => {
    const r = landDelivery(grossWb(['2026-08-18']), grossMeta({ filename: 'g3.xlsx' }), OPTS)
    expect(r.outcome).toBe('quarantined')
    expect(r.manifest.quarantine_reason).toBe('unexpected-period')
  })
})

describe('HOLD_ONLY landing — whole-delivery quarantine triggers', () => {
  const q = (buf: Buffer, m = meta(), opts = OPTS) => landDelivery(buf, m, opts)

  it('wrong dealer', () => {
    const r = q(roiWb({ dealer: 'Serra Nissan of Sylacauga' }))
    expect(r.outcome).toBe('quarantined')
    expect(r.manifest.quarantine_reason).toBe('wrong-dealer')
    expect(r.hold_path).toContain(path.join('serra-honda', 'quarantine'))
    expect(fs.existsSync(r.original_path)).toBe(true) // bytes still preserved
  })

  it('Service/Parts intent', () => {
    const r = q(roiWb({ source: 'Service Special' }))
    expect(r.manifest.quarantine_reason).toBe('non-sales-lead-type')
  })

  it('ambiguity (multi-rooftop)', () => {
    const r = q(roiWb({ dealers: 'Serra Honda; Serra Nissan' }))
    expect(r.manifest.quarantine_reason).toBe('ambiguous-tenant')
  })

  it('malformed bytes', () => {
    const r = q(Buffer.from('PK-not-a-real-xlsx'))
    expect(r.manifest.quarantine_reason).toBe('malformed-workbook')
    expect(fs.existsSync(r.original_path)).toBe(true) // raw bytes retained
  })

  it('missing required metadata', () => {
    const r = q(roiWb(), meta({ gmail_message_id: '' }))
    expect(r.manifest.quarantine_reason).toBe('missing-required-metadata')
    expect(r.manifest.detail).toMatch(/gmail_message_id/)
  })

  it('unexpected period (hint disagrees with workbook)', () => {
    const r = q(roiWb(), meta({ period_hint: '2026-01-01' }))
    expect(r.manifest.quarantine_reason).toBe('unexpected-period')
  })
})

describe('HOLD_ONLY — optional transport payload (structural, no metrics)', () => {
  it('stores a structural passthrough with header/rows and NO business metric', () => {
    const buf = roiWb()
    const r = landDelivery(buf, meta(), { ...OPTS, includeTransport: true })
    expect(r.manifest.transport_stored).toBe(true)
    expect(r.transport_path).toBeTruthy()
    const t = JSON.parse(fs.readFileSync(r.transport_path!, 'utf8')) as Record<string, unknown>
    expect(t.shape).toBe('transport-only')
    expect(t.header).toContain('Total Leads')
    expect(Array.isArray(t.rows)).toBe(true)
    // no computed business metric leaked into the transport payload
    const blob = JSON.stringify(t)
    expect(blob).not.toContain('metric_id')
    expect(blob).not.toContain('aggregate_basis')
    expect(blob).not.toContain('autonomous_action')
  })

  it('omits transport by default', () => {
    const r = landDelivery(roiWb(), meta(), OPTS)
    expect(r.manifest.transport_stored).toBe(false)
    expect(r.transport_path).toBeNull()
  })
})

describe('HOLD_ONLY — readback + eligibility', () => {
  it('durable readback by checksum and by profile', () => {
    const r = landDelivery(roiWb(), meta(), OPTS)
    const back = readHeldReceipt('serra-honda', r.manifest.sha256)
    expect(back?.receipt_id).toBe(r.manifest.receipt_id)
    const list = listHeldDeliveries('serra-honda', { state: 'held' })
    expect(list.map((m) => m.sha256)).toContain(r.manifest.sha256)
  })

  it('supports only the three exact Serra profiles', () => {
    expect([...HOLD_ELIGIBLE].sort()).toEqual(['serra-honda', 'serra-nissan', 'tony-serra-ford'])
    expect(isHoldEligible('serra-honda')).toBe(true)
    expect(isHoldEligible('serra-nissan')).toBe(true)
    expect(isHoldEligible('tony-serra-ford')).toBe(true)
    expect(isHoldEligible('serra-automotive')).toBe(false)
    expect(isHoldEligible('ford-of-columbia')).toBe(false)
  })
})

describe('HOLD_ONLY — HARD GUARD (no downstream use)', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(rel), 'utf8')
  const importLines = (src: string) => src.split('\n').filter((l) => /^\s*import\b/.test(l)).join('\n')

  // Guard on IMPORTS + CALL SITES (a `foo(` invocation), not documentation mentions.
  const noBannedImports = (src: string) => expect(importLines(src)).not.toMatch(/vin-metrics|ingest-delivery-store|report-ingest|brain-store|watchdog|notif|workflow/i)
  const noBannedCalls = (src: string) => {
    expect(src).not.toMatch(/\brecordDelivery\s*\(/)
    expect(src).not.toMatch(/\brunVinWatchdog\s*\(/)
    expect(src).not.toMatch(/\blistActiveRows\s*\(/)
  }

  it('the holding store never imports OR invokes metrics/analytical-store/watchdog', () => {
    const src = read('src/server/ingest/hold-store.ts')
    noBannedImports(src)
    noBannedCalls(src)
  })

  it('the holding route never imports OR invokes metrics/analytical-store/watchdog', () => {
    const src = read('src/routes/api/ingest/hold.ts')
    noBannedImports(src)
    noBannedCalls(src)
  })

  it('advertises the inert contract', () => {
    expect(HOLD_CONTRACT.hold_only).toBe(true)
    expect(HOLD_CONTRACT.no_action).toBe(true)
    expect(HOLD_CONTRACT.forbids).toContain('watchdog_execution')
    expect(HOLD_CONTRACT.forbids).toContain('metric_calculation')
    expect(HOLD_CONTRACT.forbids).toContain('notification')
  })

  it('holdRoot honours INGEST_HOLD_ROOT (isolated from brain profiles)', () => {
    expect(holdRoot()).toBe(path.join(tmp, 'hold'))
    expect(holdRoot()).not.toContain('profiles')
  })
})

// ── Sales Communication daily-period proof (the real fixture gap) ─────────────
const SC_H = ['Dealer', 'User Group', 'User', 'Customer', 'Activity Date', 'Direction', 'Comm Channel', 'Comm Type', 'Interaction Result', 'Lead Type', 'Lead Status Type', 'Lead Source', 'Lead Created Date', 'Message Content']
const scRow = (activity: string, o: { dealer?: string; leadType?: string; source?: string } = {}): Array<Cell> => {
  const r: Array<Cell> = new Array(SC_H.length).fill('')
  r[0] = o.dealer ?? 'Serra Honda of Sylacauga'; r[1] = 'Sales'; r[2] = 'Jane'; r[3] = 'Cust'
  r[4] = activity; r[5] = 'Outbound'; r[6] = 'SMS'; r[7] = 'Text'; r[8] = 'Reached'
  r[9] = o.leadType ?? 'Internet'; r[10] = 'Working'; r[11] = o.source ?? 'Autoweb'; r[12] = '2026-08-20'; r[13] = 'hello'
  return r
}
// Report has a TITLE row above the header (header on row 2), like the real workbook.
const scWb = (activities: Array<string>, o: { dealer?: string; leadType?: string; dealers?: string; filters?: Array<Array<Cell>> } = {}) =>
  makeXlsx([
    { name: 'Report', rows: [['Sales Communication Log'], SC_H, ...activities.map((a) => scRow(a, o))] },
    { name: 'Filters', rows: o.filters ?? [['Base Report Name', 'Sales Communication Log'], ['Dealers', o.dealers ?? 'Serra Honda']] },
  ])
const scMeta = (over: Partial<HoldMetadata> = {}): HoldMetadata => meta({ filename: 'Report-2444.xlsx', subject: 'Sales Communication Log | Daily', ...over })

describe('HOLD_ONLY — Sales Communication daily-period proof', () => {
  it('parseRowDate handles the real text representation (m/d/y + time) and ISO', () => {
    expect(parseRowDate('08/22/2026 07:08 PM')).toBe('2026-08-22')
    expect(parseRowDate('8/2/2026')).toBe('2026-08-02')
    expect(parseRowDate('2026-08-22T13:00:00')).toBe('2026-08-22')
    expect(parseRowDate('')).toBeNull()
    expect(parseRowDate('not-a-date')).toBeNull()
    expect(parseRowDate('13/40/2026')).toBeNull()
  })

  it('HELD when every row proves the supplied daily period (period_hint completes missing Filters)', () => {
    const buf = scWb(['08/22/2026 07:08 PM', '08/22/2026 06:00 AM', '08/22/2026 11:59 PM'])
    const r = landDelivery(buf, scMeta({ period_hint: '2026-08-22' }), OPTS)
    expect(r.outcome).toBe('held')
    expect(r.manifest.report_kind).toBe('sales_comm_log')
    expect(r.manifest.period).toEqual({ start: '2026-08-22', end: '2026-08-22' })
    expect(r.manifest.transform_version).toBe('hold-only-3')
    expect(r.manifest.evidence.period_source).toBe('period_hint')
  })

  it('QUARANTINE when no supplied daily period (hint absent, Filters has no date)', () => {
    const r = landDelivery(scWb(['08/22/2026 07:08 PM']), scMeta(), OPTS)
    expect(r.manifest.quarantine_reason).toBe('unexpected-period')
    expect(r.manifest.detail).toMatch(/no supplied daily period/i)
  })

  it('QUARANTINE on multi-day rows', () => {
    const r = landDelivery(scWb(['08/22/2026 07:08 PM', '08/23/2026 08:00 AM']), scMeta({ period_hint: '2026-08-22' }), OPTS)
    expect(r.manifest.quarantine_reason).toBe('unexpected-period')
    expect(r.manifest.detail).toMatch(/span 2 days/i)
  })

  it('QUARANTINE on an out-of-period row (hint disagrees with row day)', () => {
    const r = landDelivery(scWb(['08/22/2026 07:08 PM']), scMeta({ period_hint: '2026-08-21' }), OPTS)
    expect(r.manifest.quarantine_reason).toBe('unexpected-period')
    expect(r.manifest.detail).toMatch(/≠ supplied period 2026-08-21/)
  })

  it('QUARANTINE on a missing/unparseable Activity Date', () => {
    const r = landDelivery(scWb(['08/22/2026 07:08 PM', 'n/a']), scMeta({ period_hint: '2026-08-22' }), OPTS)
    expect(r.manifest.quarantine_reason).toBe('unexpected-period')
    expect(r.manifest.detail).toMatch(/unparseable Activity Date/i)
  })

  it('does NOT weaken the dealer gate', () => {
    const r = landDelivery(scWb(['08/22/2026 07:08 PM'], { dealer: 'Serra Nissan of Sylacauga' }), scMeta({ period_hint: '2026-08-22' }), OPTS)
    expect(r.manifest.quarantine_reason).toBe('wrong-dealer')
  })

  it('does NOT weaken the Service/Parts gate', () => {
    const r = landDelivery(scWb(['08/22/2026 07:08 PM'], { leadType: 'Service' }), scMeta({ period_hint: '2026-08-22' }), OPTS)
    expect(r.manifest.quarantine_reason).toBe('non-sales-lead-type')
  })

  it('same SHA with earlier quarantine: preserves it, attributes it, readback prefers HELD', () => {
    const buf = scWb(['08/22/2026 07:08 PM', '08/22/2026 06:00 AM'])
    const sha = createHash('sha256').update(buf).digest('hex')
    // simulate an earlier hold-only-1 quarantine of the SAME bytes
    const qdir = path.join(holdRoot(), 'serra-honda', 'quarantine', sha)
    fs.mkdirSync(qdir, { recursive: true })
    fs.writeFileSync(path.join(qdir, 'manifest.json'), JSON.stringify({ sha256: sha, validation_state: 'quarantined', quarantine_reason: 'unexpected-period', captured_at: '2026-08-24T07:11:24.703Z', transform_version: 'hold-only-1' }))
    fs.writeFileSync(path.join(qdir, 'original.xlsx'), buf)

    const r = landDelivery(buf, scMeta({ period_hint: '2026-08-22' }), OPTS)
    expect(r.outcome).toBe('held')
    // original quarantine manifest + bytes preserved (not overwritten)
    expect(JSON.parse(fs.readFileSync(path.join(qdir, 'manifest.json'), 'utf8')).transform_version).toBe('hold-only-1')
    // held manifest attributes the prior quarantine
    expect((r.manifest.evidence.prior_quarantine as Record<string, unknown>).reason).toBe('unexpected-period')
    // readback prefers the accepted held manifest
    const back = readHeldReceipt('serra-honda', sha)
    expect(back?.validation_state).toBe('held')
    expect(back?.transform_version).toBe('hold-only-3')
  })
})

// ── Multi-format landing: xlsx (held) / csv+pdf (preserve+quarantine) / mime ──
const roiCsv = (o: { dealer?: string; leadSource?: string; extra?: Array<string> } = {}) =>
  Buffer.from(['Dealer,Lead_Source,Total_Leads,Good_Leads,Sold_from_Leads,Total_Cost,Profit', `${o.dealer ?? 'Serra Honda of Sylacauga'},${o.leadSource ?? 'Autoweb'},79,79,24,0,0`, ...(o.extra ?? [])].join('\n'), 'utf8')
const kpiCsv = () => Buffer.from(['Dealer,Salesperson,Total_Comms,Internet_Leads,Appts_Set', 'Serra Honda of Sylacauga,Jane,300,40,10'].join('\n'), 'utf8')
const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF', 'utf8')
const fmtMeta = (over: Partial<HoldMetadata> = {}): HoldMetadata => meta({ filename: 'report.csv', ...over })

describe('HOLD_ONLY — multi-format landing (xlsx held / csv+pdf preserve+quarantine / mime)', () => {
  it('XLSX regression: still HELD, now with format + transform metadata', () => {
    const r = landDelivery(roiWb(), meta(), OPTS)
    expect(r.outcome).toBe('held')
    expect(r.manifest.file_extension).toBe('xlsx')
    expect(r.manifest.media_type).toContain('spreadsheetml')
    expect(r.manifest.structural_transform).toBe('xlsx-classified')
    expect(r.original_path.endsWith('original.xlsx')).toBe(true)
  })

  it('a superficially clean ROI CSV is PRESERVED but QUARANTINED sales-only-unproved (no transport)', () => {
    const buf = roiCsv()
    const r = landDelivery(buf, fmtMeta({ period_hint: '2026-08-03/2026-08-09' }), { ...OPTS, includeTransport: true })
    expect(r.outcome).toBe('quarantined')
    expect(r.manifest.quarantine_reason).toBe('sales-only-unproved')
    expect(r.manifest.report_kind).toBe('lead_source_roi')
    expect(r.transport_path).toBeNull()
    expect(r.manifest.transport_stored).toBe(false)
    // parsed structural evidence preserved on the manifest (not a transport)
    expect(r.manifest.evidence.csv_family).toBe('lead_source_roi')
    expect(Number(r.manifest.evidence.source_row_count)).toBe(1)
    expect(r.manifest.evidence.claimed_period_hint).toBe('2026-08-03/2026-08-09')
    // original bytes preserved with .csv name, under quarantine
    expect(r.hold_path).toContain(path.join('serra-honda', 'quarantine'))
    expect(r.original_path.endsWith('original.csv')).toBe(true)
    expect(fs.readFileSync(r.original_path).equals(buf)).toBe(true)
  })

  it('a superficially clean KPI CSV is preserved but quarantined sales-only-unproved', () => {
    const r = landDelivery(kpiCsv(), fmtMeta({ filename: 'kpi.csv', period_hint: '2026-08-03' }), OPTS)
    expect(r.manifest.quarantine_reason).toBe('sales-only-unproved')
    expect(r.manifest.report_kind).toBe('kpi_salesperson')
    expect(r.manifest.transport_stored).toBe(false)
  })

  it('Service/Parts-coded ROI CSV quarantines MORE specifically (non-sales-lead-type)', () => {
    const r = landDelivery(roiCsv({ leadSource: 'Service Special' }), fmtMeta({ period_hint: '2026-08-03' }), OPTS)
    expect(r.manifest.quarantine_reason).toBe('non-sales-lead-type')
  })

  it('unsupported CSV family → unsupported-report, bytes retained', () => {
    const buf = Buffer.from('Foo,Bar,Baz\n1,2,3', 'utf8')
    const r = landDelivery(buf, fmtMeta({ filename: 'weird.csv' }), OPTS)
    expect(r.manifest.quarantine_reason).toBe('unsupported-report')
    expect(fs.readFileSync(r.original_path).equals(buf)).toBe(true)
  })

  it('CSV wrong dealer and multi-tenant quarantine (never filter)', () => {
    const wd = landDelivery(roiCsv({ dealer: 'Serra Nissan of Sylacauga' }), fmtMeta({ period_hint: '2026-08-03' }), OPTS)
    expect(wd.manifest.quarantine_reason).toBe('wrong-dealer')
    const mt = landDelivery(roiCsv({ extra: ['Serra Honda,Autoweb,5,5,1,0,0'] }), fmtMeta({ period_hint: '2026-08-03' }), OPTS)
    expect(mt.manifest.quarantine_reason).toBe('ambiguous-tenant')
  })

  it('CSV missing required Dealer column → unsupported-report', () => {
    const buf = Buffer.from('Lead_Source,Total_Leads,Good_Leads\nAutoweb,10,9', 'utf8')
    const r = landDelivery(buf, fmtMeta({ filename: 'noheader.csv' }), OPTS)
    expect(r.manifest.quarantine_reason).toBe('unsupported-report')
    expect(r.manifest.detail).toMatch(/Dealer column absent/)
  })

  it('PDF is evidence-only PRESERVED IN QUARANTINE — never held, no OCR/transport', () => {
    const r = landDelivery(pdfBytes, meta({ filename: 'evidence.pdf', period_hint: '2026-08-03' }), OPTS)
    expect(r.outcome).toBe('quarantined')
    expect(r.manifest.quarantine_reason).toBe('sales-only-unproved')
    expect(r.manifest.report_kind).toBe('evidence_pdf')
    expect(r.manifest.media_type).toBe('application/pdf')
    expect(r.manifest.structural_transform).toBe('none')
    expect(r.manifest.evidence.ocr).toBe(false)
    expect(r.manifest.evidence.claimed_period_hint).toBe('2026-08-03') // attribution only, untrusted
    expect(r.transport_path).toBeNull()
    expect(r.original_path.endsWith('original.pdf')).toBe(true)
    expect(fs.readFileSync(r.original_path).equals(pdfBytes)).toBe(true)
  })

  it('extension↔content MIME mismatch → mime-extension-mismatch, bytes retained', () => {
    const x = landDelivery(Buffer.from('not a zip at all'), meta({ filename: 'fake.xlsx', period_hint: '2026-08-03' }), OPTS)
    expect(x.manifest.quarantine_reason).toBe('mime-extension-mismatch')
    expect(fs.existsSync(x.original_path)).toBe(true)
    const c = landDelivery(Buffer.from('%PDF-1.4 binary'), meta({ filename: 'fake.csv' }), OPTS)
    expect(c.manifest.quarantine_reason).toBe('mime-extension-mismatch')
    const p = landDelivery(Buffer.from('PKzipbytes'), meta({ filename: 'fake.pdf' }), OPTS)
    expect(p.manifest.quarantine_reason).toBe('mime-extension-mismatch')
  })

  it('unknown future format → unsupported-format, original bytes retained', () => {
    const buf = Buffer.from('random docx-ish bytes')
    const r = landDelivery(buf, meta({ filename: 'report.docx', period_hint: '2026-08-03' }), OPTS)
    expect(r.manifest.quarantine_reason).toBe('unsupported-format')
    expect(r.manifest.file_extension).toBe('docx')
    expect(r.original_path.endsWith('original.docx')).toBe(true)
    expect(fs.readFileSync(r.original_path).equals(buf)).toBe(true)
  })

  it('csv-contracts.ts is Brain-free (no relative/server/Brain/Watchdog imports)', () => {
    const src = fs.readFileSync(path.resolve('src/server/ingest/csv-contracts.ts'), 'utf8')
    const imports = src.split('\n').filter((l) => /^\s*import\b/.test(l)).join('\n')
    expect(imports).not.toMatch(/brain-store|report-ingest|vin-metrics|ingest-delivery-store|watchdog|\.\.?\//)
  })
})

// ── provenance union: gmail_scheduler (backward-compat) | browser_export ──────
const browserMeta = (over: Partial<HoldMetadata> = {}): HoldMetadata => ({
  profile: 'serra-honda', filename: 'export.xlsx', source_type: 'browser_export',
  capture_id: 'cap-123', source_url: 'https://vinsolutions.app.coxautoinc.com/reporting/x',
  declared_report_kind: 'lead_source_roi', received_at: '2026-08-24T00:00:00Z', ...over,
})

describe('HOLD_ONLY — provenance union (gmail_scheduler | browser_export)', () => {
  it('backward-compatible Gmail scheduler: default source_type, still requires Gmail fields', () => {
    const r = landDelivery(roiWb(), meta(), OPTS)
    expect(r.outcome).toBe('held')
    expect(r.manifest.source_type).toBe('gmail_scheduler')
    expect(r.manifest.gmail_message_id).toBe('gmail-abc')
    const bad = landDelivery(roiWb(), meta({ gmail_message_id: '' }), OPTS)
    expect(bad.manifest.quarantine_reason).toBe('missing-required-metadata')
  })

  it('valid browser_export provenance is preserved on the manifest (Gmail fields omitted)', () => {
    const r = landDelivery(roiWb(), browserMeta(), OPTS)
    expect(r.outcome).toBe('held') // xlsx ROI still holds under normal rules
    expect(r.manifest.source_type).toBe('browser_export')
    expect(r.manifest.capture_id).toBe('cap-123')
    expect(r.manifest.source_url).toContain('vinsolutions.app.coxautoinc.com')
    expect(r.manifest.declared_report_kind).toBe('lead_source_roi')
    expect(r.manifest.gmail_message_id).toBeNull()
  })

  it('browser_export missing capture_id/source_url/declared_report_kind fails closed (bytes kept)', () => {
    // byte-distinct XLSX per case → distinct SHA, so each failure writes its OWN
    // immutable manifest (never replays/overwrites the first quarantine's detail).
    const cases: Array<[string, Buffer, HoldMetadata]> = [
      ['capture_id', roiWb({ total: 79 }), browserMeta({ capture_id: '' })],
      ['source_url', roiWb({ total: 80 }), browserMeta({ source_url: '' })],
      ['declared_report_kind', roiWb({ total: 81 }), browserMeta({ declared_report_kind: '' })],
    ]
    for (const [field, buf, m] of cases) {
      const r = landDelivery(buf, m, OPTS)
      expect(r.outcome).toBe('quarantined')
      expect(r.manifest.quarantine_reason).toBe('invalid-provenance')
      expect(r.manifest.detail).toContain(field)
      expect(fs.existsSync(r.original_path)).toBe(true)
    }
  })

  it('identical bytes + provenance replay is a no-op (immutable first manifest preserved)', () => {
    const buf = roiWb({ total: 77 })
    const m = browserMeta({ capture_id: '' }) // invalid provenance → quarantine
    const first = landDelivery(buf, m, OPTS)
    expect(first.outcome).toBe('quarantined')
    const detailBefore = first.manifest.detail
    const second = landDelivery(buf, m, OPTS)
    expect(second.outcome).toBe('replay')
    expect(second.manifest.detail).toBe(detailBefore) // first manifest returned unchanged
  })

  it('browser_export non-VinSolutions URL fails closed', () => {
    const r = landDelivery(roiWb(), browserMeta({ source_url: 'https://evil.example.com/vinsolutions.app.coxautoinc.com' }), OPTS)
    expect(r.manifest.quarantine_reason).toBe('invalid-provenance')
    expect(r.manifest.detail).toMatch(/not the VinSolutions app host/)
    expect(fs.existsSync(r.original_path)).toBe(true)
  })

  it('unknown source_type fails closed', () => {
    const r = landDelivery(roiWb(), { ...browserMeta(), source_type: 'evil' as unknown as HoldMetadata['source_type'] }, OPTS)
    expect(r.manifest.quarantine_reason).toBe('invalid-provenance')
    expect(r.manifest.detail).toMatch(/unknown source_type/)
  })

  it('declared_report_kind is untrusted: cannot turn an unsupported/clean CSV into held', () => {
    // an unsupported CSV falsely declared as a known family → still unsupported-report
    const unsupported = landDelivery(Buffer.from('Foo,Bar,Baz\n1,2,3', 'utf8'), browserMeta({ filename: 'x.csv', declared_report_kind: 'lead_source_roi' }), OPTS)
    expect(unsupported.outcome).toBe('quarantined')
    expect(unsupported.manifest.quarantine_reason).toBe('unsupported-report')
    // a clean ROI CSV declared as kpi → classifier wins, still preserve+quarantine, never held
    const clean = landDelivery(roiCsv(), browserMeta({ filename: 'roi.csv', declared_report_kind: 'kpi_salesperson', period_hint: '2026-08-03' }), OPTS)
    expect(clean.outcome).toBe('quarantined')
    expect(clean.manifest.quarantine_reason).toBe('sales-only-unproved')
    expect(clean.manifest.report_kind).toBe('lead_source_roi') // from the classifier, NOT the declared kind
  })
})
