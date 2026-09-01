/**
 * Gate 2 — held native-scheduled family readers (Sales-only, fail-closed).
 *
 * Consumes ONLY the three HELD families per dealer (Appointments, CRM Sales Gross,
 * Dealership Performance Dashboard) from the fresh capture directory, by an exact
 * filename+full-sha256 allowlist — never the nine quarantined ROI/CAGE/Comm workbooks.
 *
 * Each reader ENFORCES the governed SCHEMA_CONTRACT gates (not string claims):
 *   - XLSX magic bytes + exact header signature;
 *   - fail-closed on any Service/Parts token in DATA rows;
 *   - one-rooftop dealer identity (governed Dealer ID on every row);
 *   - period binding — every authoritative date parses and falls inside the contracted
 *     window (Appointment Start Date + Start DateTime; CRM Sold Date; Dashboard Filters);
 *   - Appointments: Appt Reason = "Sales Appointment" on every row + unique Appointment ID;
 *   - Dashboard: affirmative Service-source exclusion + Lead Types = {Internet,Phone,Walk-in}.
 * Each returns a `salesOnlyProof` PRODUCED FROM the checks it actually executed — never a
 * hardcoded assertion. Blank is null (missing is not zero). Pure compute.
 */
import { createHash } from 'node:crypto'
import { SERVICE_PARTS_TOKEN, XLSX_MAGIC } from '../leads/leads-family-contract'
import { readXlsx } from '../provisional/xlsx-reader'

export type HeldFamily =
  | 'appointments'
  | 'crm_sales_gross'
  | 'dealership_performance'

export type AllowlistEntry = {
  filename: string
  sha256: string
  family: HeldFamily
  profile: string
}

export type Period = { start: string; end: string }

export class HeldInputError extends Error {}

export function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

export function hasXlsxMagic(buf: Buffer): boolean {
  if (buf.length < XLSX_MAGIC.length) return false
  for (let i = 0; i < XLSX_MAGIC.length; i++) {
    if (buf[i] !== XLSX_MAGIC[i]) return false
  }
  return true
}

/** Admit a file ONLY when (filename, sha256, family, profile) is on the allowlist. */
export function admitHeldFile(
  file: {
    filename: string
    sha256: string
    family: HeldFamily
    profile: string
  },
  allowlist: Array<AllowlistEntry>,
): boolean {
  return allowlist.some(
    (a) =>
      a.filename === file.filename &&
      a.sha256 === file.sha256 &&
      a.family === file.family &&
      a.profile === file.profile,
  )
}

function num(v: string): number | null {
  if (v === '' || v.trim() === '' || v.trim() === '-') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Excel serial (1900 system) -> calendar date (business-local, integer day). */
export function excelSerialToDate(v: string): string | null {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const day = Math.trunc(n)
  const ms = Date.UTC(1899, 11, 30) + day * 86400000
  return new Date(ms).toISOString().slice(0, 10)
}

function inWindow(date: string, period: Period): boolean {
  return date >= period.start && date <= period.end
}

function assertNoServiceParts(cells: Array<string>, where: string): void {
  for (const c of cells) {
    if (SERVICE_PARTS_TOKEN.test(c)) {
      throw new HeldInputError(
        `Service/Parts token in ${where}: "${c.slice(0, 60)}" — fail closed`,
      )
    }
  }
}

function requireHeaders(
  header: Array<string>,
  names: Array<string>,
  family: string,
): void {
  const missing = names.filter((n) => header.indexOf(n) < 0)
  if (missing.length) {
    throw new HeldInputError(
      `${family} missing signature headers: ${missing.join(', ')}`,
    )
  }
}

function dataRows(rows: Array<Array<string>>): Array<Array<string>> {
  return rows.filter((r, i) => i > 0 && r.some((c) => c.trim() !== ''))
}

export type AppointmentsHeld = {
  family: 'appointments'
  total: number
  show: number
  noShow: number
  confirmed: number
  completed: number
  cancelled: number
  dealerIds: Array<string>
  observed: Period
  salesOnlyProof: string
}

export function readAppointmentsHeld(
  buf: Buffer,
  expectedDealerId: string,
  period: Period,
): AppointmentsHeld {
  if (!hasXlsxMagic(buf))
    throw new HeldInputError('appointments: bad XLSX magic bytes')
  const { sheets } = readXlsx(buf, {}, { rawDates: true })
  const rows = sheets[0].rows
  const header = rows[0] ?? []
  requireHeaders(
    header,
    [
      'Appointment ID',
      'Dealer',
      'Dealer ID',
      'Appt Reason',
      'Appointment Start Date',
      'Appointment Start DateTime',
      'Appointment Status',
      'Is Show',
      'Is No Show',
      'Is Confirmed',
      'Is Completed',
      'Is Cancelled',
    ],
    'appointments',
  )
  const h = (name: string) => header.indexOf(name)
  const iId = h('Appointment ID')
  const iDealerId = h('Dealer ID')
  const iReason = h('Appt Reason')
  const iStartDate = h('Appointment Start Date')
  const iStartDT = h('Appointment Start DateTime')
  const iShow = h('Is Show')
  const iNoShow = h('Is No Show')
  const iConfirmed = h('Is Confirmed')
  const iCompleted = h('Is Completed')
  const iCancelled = h('Is Cancelled')

  const data = dataRows(rows)
  const yes = (v: string) => v.trim().toLowerCase() === 'yes'
  const dealerIds = new Set<string>()
  const seenIds = new Set<string>()
  let show = 0,
    noShow = 0,
    confirmed = 0,
    completed = 0,
    cancelled = 0
  let obsStart = '',
    obsEnd = ''
  for (const r of data) {
    assertNoServiceParts(r, 'appointments data row')
    const id = (r[iId] ?? '').trim()
    if (id.length === 0)
      throw new HeldInputError('appointments: blank Appointment ID')
    if (seenIds.has(id))
      throw new HeldInputError(`appointments: duplicate Appointment ID ${id}`)
    seenIds.add(id)
    if ((r[iReason] ?? '').trim() !== 'Sales Appointment') {
      throw new HeldInputError(
        `appointments: non-sales-appointment-reason "${(r[iReason] ?? '').trim()}"`,
      )
    }
    dealerIds.add((r[iDealerId] ?? '').trim())
    const sd = excelSerialToDate(r[iStartDate] ?? '')
    const sdt = excelSerialToDate(r[iStartDT] ?? '')
    if (sd === null || sdt === null) {
      throw new HeldInputError(
        'appointments: Appointment Start Date/DateTime does not parse',
      )
    }
    if (!inWindow(sd, period) || !inWindow(sdt, period)) {
      throw new HeldInputError(
        `appointments: Start Date/DateTime ${sd}/${sdt} outside period ${period.start}..${period.end}`,
      )
    }
    if (obsStart === '' || sd < obsStart) obsStart = sd
    if (obsEnd === '' || sd > obsEnd) obsEnd = sd
    if (yes(r[iShow] ?? '')) show++
    if (yes(r[iNoShow] ?? '')) noShow++
    if (yes(r[iConfirmed] ?? '')) confirmed++
    if (yes(r[iCompleted] ?? '')) completed++
    if (yes(r[iCancelled] ?? '')) cancelled++
  }
  const ids = [...dealerIds]
  if (ids.length !== 1 || ids[0] !== expectedDealerId) {
    throw new HeldInputError(
      `appointments dealer identity: expected only ${expectedDealerId}, saw ${JSON.stringify(ids)}`,
    )
  }
  return {
    family: 'appointments',
    total: data.length,
    show,
    noShow,
    confirmed,
    completed,
    cancelled,
    dealerIds: ids,
    observed: { start: obsStart, end: obsEnd },
    salesOnlyProof:
      `${data.length} rows: every Appt Reason="Sales Appointment"; ` +
      `all Dealer ID=${expectedDealerId} (one rooftop); ${seenIds.size} unique Appointment IDs; ` +
      `all Start Date+DateTime within ${period.start}..${period.end}; zero Service/Parts tokens`,
  }
}

export type CrmHeld = {
  family: 'crm_sales_gross'
  rowCount: number
  newDeals: number
  newNegativeFront: number
  newFrontBlank: number
  dealerIds: Array<string>
  observed: Period
  salesOnlyProof: string
}

export function readCrmHeld(
  buf: Buffer,
  expectedDealerId: string,
  period: Period,
): CrmHeld {
  if (!hasXlsxMagic(buf))
    throw new HeldInputError('crm_sales_gross: bad XLSX magic bytes')
  const { sheets } = readXlsx(buf, {}, { rawDates: true })
  const rows = sheets[0].rows
  const header = rows[0] ?? []
  requireHeaders(
    header,
    [
      'Dealer',
      'Dealer ID',
      'Sold Date',
      'Sale ID',
      'Deal Number',
      'Inventory Type',
      'Front Gross',
      'Back Gross',
      'Total Gross',
    ],
    'crm_sales_gross',
  )
  const h = (name: string) => header.indexOf(name)
  const iDealerId = h('Dealer ID')
  const iSold = h('Sold Date')
  const iInv = h('Inventory Type')
  const iFront = h('Front Gross')

  const data = dataRows(rows)
  const dealerIds = new Set<string>()
  let newDeals = 0,
    newNegativeFront = 0,
    newFrontBlank = 0
  let obsStart = '',
    obsEnd = ''
  for (const r of data) {
    assertNoServiceParts(r, 'crm_sales_gross data row')
    dealerIds.add((r[iDealerId] ?? '').trim())
    const sd = excelSerialToDate(r[iSold] ?? '')
    if (sd === null)
      throw new HeldInputError('crm_sales_gross: Sold Date does not parse')
    if (!inWindow(sd, period)) {
      throw new HeldInputError(
        `crm_sales_gross: Sold Date ${sd} outside coverage window ${period.start}..${period.end}`,
      )
    }
    if (obsStart === '' || sd < obsStart) obsStart = sd
    if (obsEnd === '' || sd > obsEnd) obsEnd = sd
    if ((r[iInv] ?? '').trim().toLowerCase() === 'new') {
      newDeals++
      const fg = num(r[iFront] ?? '')
      if (fg === null) newFrontBlank++
      else if (fg < 0) newNegativeFront++
    }
  }
  const ids = [...dealerIds]
  if (ids.length !== 1 || ids[0] !== expectedDealerId) {
    throw new HeldInputError(
      `crm_sales_gross dealer identity: expected only ${expectedDealerId}, saw ${JSON.stringify(ids)}`,
    )
  }
  return {
    family: 'crm_sales_gross',
    rowCount: data.length,
    newDeals,
    newNegativeFront,
    newFrontBlank,
    dealerIds: ids,
    observed: { start: obsStart, end: obsEnd },
    salesOnlyProof:
      `${data.length} rows: all Dealer ID=${expectedDealerId} (one rooftop); ` +
      `all Sold Date within coverage ${period.start}..${period.end} (observed ${obsStart}..${obsEnd}); ` +
      `zero Service/Parts tokens`,
  }
}

const DASHBOARD_LEAD_TYPES = ['Internet', 'Phone', 'Walk-in']

export type DashboardHeld = {
  family: 'dealership_performance'
  leads: number | null
  apptsSet: number | null
  apptsSetPct: number | null
  soldInPeriod: number | null
  salesOnlyProof: string
  dealerName: string
  periodBegin: string
  periodEnd: string
}

export function readDashboardHeld(
  buf: Buffer,
  expected: {
    dealerName: string
    periodBeginLabel: string
    periodEndLabel: string
  },
): DashboardHeld {
  if (!hasXlsxMagic(buf))
    throw new HeldInputError('dealership_performance: bad XLSX magic bytes')
  const { sheets } = readXlsx(buf, {}, { rawDates: true })
  const report = sheets.find((s) => s.name === 'Report')
  const filters = sheets.find((s) => s.name === 'Filters')
  if (!report) throw new HeldInputError('dashboard: Report sheet not found')
  if (!filters) throw new HeldInputError('dashboard: Filters sheet not found')

  // Recognition (SCHEMA_CONTRACT §3.6): title OR both section markers.
  const flat = report.rows.map((r) => r.join(''))
  const hasTitle = flat.some((s) =>
    s.includes('Dealership Performance Dashboard'),
  )
  const hasMarkers =
    report.rows.some((r) => r.length === 1 && r[0] === 'Dealership Summary') &&
    flat.some((s) => s.includes('Lead Type & Inventory Type Summary'))
  if (!hasTitle && !hasMarkers) {
    throw new HeldInputError(
      'dashboard: neither title nor both section markers present',
    )
  }

  const filterVal = (name: string): string => {
    const row = filters.rows.find((r) => (r[0] ?? '').trim() === name)
    return row ? (row[2] ?? '').trim() : ''
  }
  const dealer = filterVal('Dealers')
  if (dealer !== expected.dealerName) {
    throw new HeldInputError(
      `dashboard Filters Dealers="${dealer}" != expected "${expected.dealerName}"`,
    )
  }
  const begin = filterVal('Date Range Begin')
  const end = filterVal('Date Range End')
  if (begin !== expected.periodBeginLabel || end !== expected.periodEndLabel) {
    throw new HeldInputError(
      `dashboard Filters window ${begin}..${end} != ${expected.periodBeginLabel}..${expected.periodEndLabel}`,
    )
  }
  const excluded = filterVal('Lead Sources Excluded')
  if (!SERVICE_PARTS_TOKEN.test(excluded)) {
    throw new HeldInputError(
      'dashboard Filters: "Lead Sources Excluded" does not affirmatively exclude Service — cannot prove Sales-only',
    )
  }
  const apptReasons = filterVal('Appointment Reasons')
  if (!/sales appointment/i.test(apptReasons)) {
    throw new HeldInputError(
      `dashboard Filters Appointment Reasons="${apptReasons}" is not Sales Appointment`,
    )
  }
  // Lead Types must be EXACTLY {Internet, Phone, Walk-in} (SCHEMA_CONTRACT §3.6).
  const leadTypes = filterVal('Lead Types')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .sort()
  const expectedLeadTypes = [...DASHBOARD_LEAD_TYPES].sort()
  if (JSON.stringify(leadTypes) !== JSON.stringify(expectedLeadTypes)) {
    throw new HeldInputError(
      `dashboard Filters Lead Types=${JSON.stringify(leadTypes)} != ${JSON.stringify(expectedLeadTypes)}`,
    )
  }
  for (const name of ['Lead Types', 'Inventory Types', 'Lead Status Types']) {
    if (SERVICE_PARTS_TOKEN.test(filterVal(name))) {
      throw new HeldInputError(
        `dashboard Filters inclusion "${name}" contains Service/Parts — fail closed`,
      )
    }
  }

  const rows = report.rows
  const secIdx = rows.findIndex(
    (r) => r.length === 1 && r[0] === 'Dealership Summary',
  )
  if (secIdx < 0 || !rows[secIdx + 1])
    throw new HeldInputError('dashboard: Dealership Summary section not found')
  const sHeader = rows[secIdx + 1]
  const col = (name: string) => sHeader.indexOf(name)
  const iLeads = col('Leads')
  const iApptsSet = col('Appts Set')
  const iApptsSetPct = col('Appts Set %')
  const iSold = col('Sold in Period')
  const req: Record<string, number> = {
    Leads: iLeads,
    'Appts Set': iApptsSet,
    'Appts Set %': iApptsSetPct,
    'Sold in Period': iSold,
  }
  const miss = Object.entries(req)
    .filter(([, i]) => i < 0)
    .map(([k]) => k)
  if (miss.length)
    throw new HeldInputError(
      `dashboard summary missing columns: ${miss.join(', ')}`,
    )

  const section: Array<Array<string>> = []
  for (let i = secIdx + 2; i < rows.length; i++) {
    if (rows[i].length <= 1) break
    section.push(rows[i])
  }
  for (const r of section) assertNoServiceParts(r, 'dashboard summary data row')
  const totalRow = section.find((r) => (r[0] ?? '').toUpperCase() === 'TOTAL')
  if (!totalRow)
    throw new HeldInputError(
      'dashboard: Dealership Summary TOTAL row not found',
    )

  return {
    family: 'dealership_performance',
    leads: num(totalRow[iLeads] ?? ''),
    apptsSet: num(totalRow[iApptsSet] ?? ''),
    apptsSetPct: num(totalRow[iApptsSetPct] ?? ''),
    soldInPeriod: num(totalRow[iSold] ?? ''),
    salesOnlyProof:
      `Lead Sources Excluded includes Service; Appointment Reasons="${apptReasons}"; ` +
      `Lead Types={Internet,Phone,Walk-in}; one dealer="${dealer}"; ` +
      `window ${begin}..${end}; zero Service/Parts in summary data`,
    dealerName: dealer,
    periodBegin: begin,
    periodEnd: end,
  }
}
