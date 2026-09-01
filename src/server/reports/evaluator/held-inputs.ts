/**
 * Gate 2 — held native-scheduled family readers (Sales-only, fail-closed).
 *
 * Consumes ONLY the three HELD families per dealer (Appointments, CRM Sales Gross,
 * Dealership Performance Dashboard) from the fresh capture directory, by an exact
 * filename+sha allowlist — never the nine quarantined ROI/CAGE/Sales-Communication
 * workbooks. Every reader:
 *   - checks the XLSX magic bytes,
 *   - fails closed on any Service/Parts token in the DATA rows (Sales-only rule),
 *   - proves one-rooftop dealer identity, and
 *   - treats blank as null (missing is not zero).
 *
 * The Dashboard "Filters" sheet is provenance metadata, not data: it must AFFIRMATIVELY
 * prove Sales-only (service lead sources in the Excluded list, Appointment Reasons =
 * Sales Appointment) and match the reporting window. Pure compute — I/O lives in the
 * generator/tests.
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

function assertNoServiceParts(cells: Array<string>, where: string): void {
  for (const c of cells) {
    if (SERVICE_PARTS_TOKEN.test(c)) {
      throw new HeldInputError(
        `Service/Parts token in ${where}: "${c.slice(0, 60)}" — fail closed`,
      )
    }
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
}

export function readAppointmentsHeld(
  buf: Buffer,
  expectedDealerId: string,
): AppointmentsHeld {
  if (!hasXlsxMagic(buf))
    throw new HeldInputError('appointments: bad XLSX magic bytes')
  const { sheets } = readXlsx(buf, {}, { rawDates: true })
  const sheet = sheets[0]
  const rows = sheet.rows
  const header = rows[0] ?? []
  const h = (name: string) => header.indexOf(name)
  const iDealerId = h('Dealer ID')
  const iReason = h('Appt Reason')
  const iShow = h('Is Show')
  const iNoShow = h('Is No Show')
  const iConfirmed = h('Is Confirmed')
  const iCompleted = h('Is Completed')
  const iCancelled = h('Is Cancelled')
  const required: Record<string, number> = {
    'Dealer ID': iDealerId,
    'Appt Reason': iReason,
    'Is Show': iShow,
    'Is No Show': iNoShow,
    'Is Confirmed': iConfirmed,
    'Is Completed': iCompleted,
    'Is Cancelled': iCancelled,
  }
  const missing = Object.entries(required)
    .filter(([, i]) => i < 0)
    .map(([k]) => k)
  if (missing.length)
    throw new HeldInputError(
      `appointments missing headers: ${missing.join(', ')}`,
    )

  const data = dataRows(rows)
  const yes = (v: string) => v.trim().toLowerCase() === 'yes'
  const dealerIds = new Set<string>()
  let show = 0,
    noShow = 0,
    confirmed = 0,
    completed = 0,
    cancelled = 0
  for (const r of data) {
    assertNoServiceParts(r, 'appointments data row')
    dealerIds.add((r[iDealerId] ?? '').trim())
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
  }
}

export type CrmHeld = {
  family: 'crm_sales_gross'
  rowCount: number
  newDeals: number
  newNegativeFront: number
  newFrontBlank: number
  dealerIds: Array<string>
}

export function readCrmHeld(buf: Buffer, expectedDealerId: string): CrmHeld {
  if (!hasXlsxMagic(buf))
    throw new HeldInputError('crm_sales_gross: bad XLSX magic bytes')
  const { sheets } = readXlsx(buf, {}, { rawDates: true })
  const rows = sheets[0].rows
  const header = rows[0] ?? []
  const h = (name: string) => header.indexOf(name)
  const iDealerId = h('Dealer ID')
  const iInv = h('Inventory Type')
  const iFront = h('Front Gross')
  const required: Record<string, number> = {
    'Dealer ID': iDealerId,
    'Inventory Type': iInv,
    'Front Gross': iFront,
  }
  const missing = Object.entries(required)
    .filter(([, i]) => i < 0)
    .map(([k]) => k)
  if (missing.length)
    throw new HeldInputError(
      `crm_sales_gross missing headers: ${missing.join(', ')}`,
    )

  const data = dataRows(rows)
  const dealerIds = new Set<string>()
  let newDeals = 0,
    newNegativeFront = 0,
    newFrontBlank = 0
  for (const r of data) {
    assertNoServiceParts(r, 'crm_sales_gross data row')
    dealerIds.add((r[iDealerId] ?? '').trim())
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
  }
}

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

  // Filters is provenance metadata; it must AFFIRMATIVELY prove Sales-only + window.
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
  // Any Service/Parts token in an INCLUSION filter (Lead Types / Inventory Types) fails closed.
  for (const name of ['Lead Types', 'Inventory Types', 'Lead Status Types']) {
    if (SERVICE_PARTS_TOKEN.test(filterVal(name))) {
      throw new HeldInputError(
        `dashboard Filters inclusion "${name}" contains Service/Parts — fail closed`,
      )
    }
  }

  // Data: the "Dealership Summary" TOTAL row. Scan its data rows for Service/Parts.
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
    salesOnlyProof: `Lead Sources Excluded="${excluded}"; Appointment Reasons="${apptReasons}"`,
    dealerName: dealer,
    periodBegin: begin,
    periodEnd: end,
  }
}
