import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeXlsx, type Cell } from './helpers/make-xlsx'
import { readXlsx } from '@/server/ingest/xlsx-reader'
import { evaluateDelivery, parseFilters, parseFilterDate } from '@/server/ingest/vin-contracts'
import { landDelivery, governedDealerId, PROFILE_DEALER_IDS, type HoldMetadata } from '@/server/ingest/hold-store'

// Real VinSolutions Dealer Dashboard shape: Report (multi-section) + 3-column Filters.
const DASH_REPORT: Array<Array<Cell>> = [
  ['Dealership Performance Dashboard'],
  ['Dealership Summary'],
  ['', 'Leads', 'Appts Set'],
  ['New', 24, 3],
  ['Lead Type & Inventory Type Summary'],
  ['Internet', 200, 10],
]
const filters3col = (o: { dealer?: string; dealerCount?: string; leadTypes?: string; begin?: string; end?: string } = {}): Array<Array<Cell>> => [
  ['Filter Name', 'Number Selected', 'Selected Values'],
  ['Base Report Name', '1', 'Dealership Performance Dashboard'],
  ['Dealers', o.dealerCount ?? '1', o.dealer ?? 'Serra Nissan of Sylacauga'],
  ['Lead Types', '3', o.leadTypes ?? 'Internet, Phone, Walk-in'],
  ['Lead Sources Excluded', '5', 'Service, Service Appraisal, Service Dept, Service Referral, SERVICE TO SALES APPT CONFIRMATION'],
  ['Appointment Reasons', '1', 'Sales Appointment'],
  ['Date Range', '1', 'Previous Week (Mon-Sun)'],
  ['Date Range Begin', '1', o.begin ?? 'Aug 17 2026 12:00AM'],
  ['Date Range End', '1', o.end ?? 'Aug 23 2026 11:59PM'],
]
const dashWb = (o = {}) => makeXlsx([{ name: 'Report', rows: DASH_REPORT }, { name: 'Filters', rows: filters3col(o) }, { name: 'Sheet3', rows: [] }])
const evalDash = (o = {}, dealer = 'Serra Nissan') => evaluateDelivery(readXlsx(dashWb(o)).sheets, { profileDealer: dealer })

describe('VinSolutions 3-column Filters (Filter Name | Number Selected | Selected Values)', () => {
  // 1) reads dealer/base/lead-types from the Selected Values column; period from Begin/End
  it('1. parseFilters reads column C (Selected Values), not the count', () => {
    const f = parseFilters(filters3col().map((r) => r.map(String)))
    expect(f.dealers).toEqual(['Serra Nissan of Sylacauga'])
    expect(f.baseReportName).toBe('Dealership Performance Dashboard')
    expect(f.leadTypes).toEqual(['Internet', 'Phone', 'Walk-in'])
    expect(f.period).toEqual({ start: '2026-08-17', end: '2026-08-23' })
  })

  // 2) backward-compatible with legacy 2-column Filters fixtures
  it('2. legacy 2-column key|value Filters still parse (backward compatible)', () => {
    const f = parseFilters([['Base Report Name', 'Lead Source ROI'], ['Dealers', 'Serra Honda'], ['Date Range', '2026-08-03 - 2026-08-09']])
    expect(f.dealers).toEqual(['Serra Honda'])
    expect(f.baseReportName).toBe('Lead Source ROI')
    expect(f.period).toEqual({ start: '2026-08-03', end: '2026-08-09' })
  })

  // 3) the real Serra Nissan dashboard now ACCEPTS with correct dealer + weekly period
  it('3. dealership dashboard accepts with correct dealer + exact weekly period', () => {
    const r = evalDash()
    expect(r.status).toBe('accepted')
    if (r.status === 'accepted') {
      expect(r.kind).toBe('dealership_performance')
      expect(r.dealer).toBe('Serra Nissan of Sylacauga')
      expect(r.period).toEqual({ start: '2026-08-17', end: '2026-08-23' })
    }
  })

  // 4) fail-closed dealer + multi-rooftop gates preserved
  it('4. wrong dealer and multi-rooftop still quarantine', () => {
    expect(evalDash({ dealer: 'Serra Honda of Sylacauga' }, 'Serra Nissan')).toMatchObject({ status: 'quarantined', reason: 'wrong-dealer' })
    expect(evalDash({ dealer: 'Serra Nissan of Sylacauga, Serra Honda of Sylacauga', dealerCount: '2' }, 'Serra Nissan')).toMatchObject({ status: 'quarantined', reason: 'ambiguous-tenant' })
  })

  // 5) Lead Type gate preserved; Service in "Lead Sources Excluded" is NOT a violation
  it('5. non-exact Lead Types quarantine; Service-in-exclusions does not', () => {
    expect(evalDash({ leadTypes: 'Internet, Phone' }, 'Serra Nissan')).toMatchObject({ status: 'quarantined', reason: 'incompatible-filter-metadata' })
    // default fixture carries "Lead Sources Excluded: Service…" yet still accepts (Sales-only intact)
    expect(evalDash().status).toBe('accepted')
  })

  // 6) exact date parsing of the VinSolutions "MMM DD YYYY h:mmAM" form
  it('6. parseFilterDate handles "Aug 17 2026 12:00AM" and ISO', () => {
    expect(parseFilterDate('Aug 17 2026 12:00AM')).toBe('2026-08-17')
    expect(parseFilterDate('Aug 23 2026 11:59PM')).toBe('2026-08-23')
    expect(parseFilterDate('Aug 3, 2026')).toBe('2026-08-03')
    expect(parseFilterDate('2026-08-17T00:00:00')).toBe('2026-08-17')
    expect(parseFilterDate('Previous Week (Mon-Sun)')).toBeNull()
  })
})

// 7) hold-layer: period_hint validates/cross-checks — file evidence wins on conflict
describe('3-column dashboard hold-layer period_hint cross-check', () => {
  let tmp: string
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f3-')); process.env.INGEST_HOLD_ROOT = path.join(tmp, 'hold') })
  afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ } ; delete process.env.INGEST_HOLD_ROOT })

  const nMeta = (over: Partial<HoldMetadata> = {}): HoldMetadata => ({
    profile: 'serra-nissan', filename: 'dash.xlsx', sender: 'reportscheduler@motosnap.com',
    subject: 'Dealership Performance Dashboard', gmail_message_id: 'gm-nissan', received_at: '2026-08-24T00:00:00Z', ...over,
  })
  const NOPTS = { profileDealer: 'Serra Nissan', capturedAt: '2026-08-25T00:00:00.000Z' }

  it('7. matching period_hint holds; conflicting hint quarantines (file evidence wins)', () => {
    const ok = landDelivery(dashWb(), nMeta({ period_hint: '2026-08-17/2026-08-23' }), NOPTS)
    expect(ok.outcome).toBe('held')
    expect(ok.manifest.period).toEqual({ start: '2026-08-17', end: '2026-08-23' })

    const conflict = landDelivery(dashWb(), nMeta({ filename: 'dash2.xlsx', period_hint: '2026-08-10/2026-08-16' }), NOPTS)
    expect(conflict.outcome).toBe('quarantined')
    expect(conflict.manifest.quarantine_reason).toBe('unexpected-period')
  })
})

// Real ROI / CAGE / Appointments recognition + governance (hold layer, landDelivery)
const APPT_HEADER = ['Appointment ID', 'Dealer', 'Dealer ID', 'Appointment Type', 'Appt Reason', 'Appointment Start Date', 'Appointment Start DateTime', 'Appointment Status']
const apptRow = (o: { id?: string; dealer?: string; dealerId?: string; reason?: string; date?: string } = {}): Array<Cell> =>
  [o.id ?? '145710109', o.dealer ?? 'Serra Honda of Sylacauga', o.dealerId ?? '21043', 'Meeting', o.reason ?? 'Sales Appointment', o.date ?? '2026-08-18', o.date ?? '2026-08-18', 'Cancelled']
const apptWb = (rows: Array<Array<Cell>>) => makeXlsx([{ name: 'Sheet1', rows: [APPT_HEADER, ...rows] }])

const roi3col = (o: { dealer?: string; leadTypes?: string; leadIntents?: string } = {}) => makeXlsx([
  { name: 'Report', rows: [['Lead Source', 'Total Leads', 'Good Leads', 'Sold from Leads'], ['Thirdparty Honda', 26, 20, 0]] },
  { name: 'Filters', rows: [
    ['Filter Name', 'Number Selected', 'Selected Values'],
    ['Base Report Name', '1', 'Lead Source ROI'],
    ['Dealers', '1', o.dealer ?? 'Serra Honda of Sylacauga'],
    ['Lead Types', '8', o.leadTypes ?? 'Import, Internet, Phone, PreviousCustomer, Referral, Walk-in, WebsiteChat, Wholesale'],
    // Sales-only positive Lead Intent; Service appears ONLY in the exclusions line
    // below (proof of exclusion, not contamination — must still be HELD).
    ['Lead Intents', '1', o.leadIntents ?? 'Sales'],
    ['Lead Sources Excluded', '3', 'Service, Service Dept, Service Referral'],
    ['Date Range Begin', '1', 'Aug 17 2026 12:00AM'],
    ['Date Range End', '1', 'Aug 23 2026 11:59PM'],
  ] },
])

describe('real ROI / CAGE / Appointments hold recognition + governance', () => {
  let tmp2: string
  beforeEach(() => { tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'fam-')); process.env.INGEST_HOLD_ROOT = path.join(tmp2, 'hold') })
  afterEach(() => { try { fs.rmSync(tmp2, { recursive: true, force: true }) } catch { /* ignore */ } ; delete process.env.INGEST_HOLD_ROOT })

  const hMeta = (over: Partial<HoldMetadata> = {}): HoldMetadata => ({ profile: 'serra-honda', filename: 'f.xlsx', sender: 's@motosnap.com', subject: 'x', gmail_message_id: 'g1', received_at: '2026-08-24T00:00:00Z', ...over })
  const HOPTS = { profileDealer: 'Serra Honda', capturedAt: '2026-08-25T00:00:00.000Z' }

  it('governed dealer-ID registry has exactly the three profiles', () => {
    expect(PROFILE_DEALER_IDS).toEqual({ 'serra-honda': '21043', 'serra-nissan': '21044', 'tony-serra-ford': '21047' })
    expect(governedDealerId('serra-honda')).toBe('21043')
    expect(governedDealerId('unknown')).toBeNull()
  })

  it('ROI (spaced, dealer-from-Filters, governed 8) HELD; Service exclusions OK', () => {
    const r = landDelivery(roi3col(), hMeta({ filename: 'roi.xlsx', period_hint: '2026-08-17/2026-08-23' }), HOPTS)
    expect(r.outcome).toBe('held')
    expect(r.manifest.report_kind).toBe('lead_source_roi')
    expect(r.manifest.period).toEqual({ start: '2026-08-17', end: '2026-08-23' })
  })
  it('ROI wrong dealer / non-8 lead types quarantine (bytes kept)', () => {
    expect(landDelivery(roi3col({ dealer: 'Serra Nissan of Sylacauga' }), hMeta({ filename: 'a.xlsx', period_hint: '2026-08-17/2026-08-23' }), HOPTS).manifest.quarantine_reason).toBe('wrong-dealer')
    expect(landDelivery(roi3col({ leadTypes: 'Internet, Phone, Walk-in' }), hMeta({ filename: 'b.xlsx', period_hint: '2026-08-17/2026-08-23' }), HOPTS).manifest.quarantine_reason).toBe('incompatible-filter-metadata')
  })
  it('ROI with a POSITIVE Service Lead Intent quarantines at the hold layer (bytes kept)', () => {
    const r = landDelivery(roi3col({ leadIntents: 'Sales, Service' }), hMeta({ filename: 'roi-vuln.xlsx', period_hint: '2026-08-17/2026-08-23' }), HOPTS)
    expect(r.outcome).toBe('quarantined')
    expect(r.manifest.quarantine_reason).toBe('non-sales-lead-type')
  })

  it('Appointments HELD when dealer IDs match governed profile ID + in period + unique IDs', () => {
    const r = landDelivery(apptWb([apptRow({ id: 'A1' }), apptRow({ id: 'A2', date: '2026-08-20' })]), hMeta({ filename: 'appt.xlsx', period_hint: '2026-08-17/2026-08-23' }), HOPTS)
    expect(r.outcome).toBe('held')
    expect(r.manifest.report_kind).toBe('appointments')
    expect(r.manifest.period).toEqual({ start: '2026-08-17', end: '2026-08-23' })
  })
  it('Appointments quarantine: cross-tenant dealer ID, blank ID, duplicate ID, out-of-period, no hint', () => {
    // wrong dealer ID (Nissan 21044 in a Honda profile)
    expect(landDelivery(apptWb([apptRow({ dealerId: '21044' })]), hMeta({ filename: 'x1.xlsx', period_hint: '2026-08-17/2026-08-23' }), HOPTS).manifest.quarantine_reason).toBe('wrong-dealer')
    // blank dealer ID
    expect(landDelivery(apptWb([apptRow({ dealerId: '' })]), hMeta({ filename: 'x2.xlsx', period_hint: '2026-08-17/2026-08-23' }), HOPTS).manifest.quarantine_reason).toBe('wrong-dealer')
    // duplicate Appointment ID
    expect(landDelivery(apptWb([apptRow({ id: 'DUP' }), apptRow({ id: 'DUP', date: '2026-08-19' })]), hMeta({ filename: 'x3.xlsx', period_hint: '2026-08-17/2026-08-23' }), HOPTS).manifest.quarantine_reason).toBe('unsupported-report')
    // out-of-period appointment
    expect(landDelivery(apptWb([apptRow({ date: '2026-08-30' })]), hMeta({ filename: 'x4.xlsx', period_hint: '2026-08-17/2026-08-23' }), HOPTS).manifest.quarantine_reason).toBe('unexpected-period')
    // no period_hint
    expect(landDelivery(apptWb([apptRow()]), hMeta({ filename: 'x5.xlsx' }), HOPTS).manifest.quarantine_reason).toBe('unexpected-period')
  })
})
