/**
 * VinSolutions Custom Reporting "Leads" family READER + metric primitives (M1R).
 *
 * Parse-only. Turns a validated Leads workbook into structured, non-PII lead
 * primitives (counts by lead type / status type / contact state, sold counts,
 * response-time availability, and blank/zero breakdowns). It NEVER writes,
 * promotes, or mutates any store.
 *
 * Missing is never zero: a blank numeric cell coerces to `null` and is EXCLUDED
 * from populated counts and from sums — it is never silently treated as 0. A
 * genuine numeric 0 is counted as a zero, distinctly from a blank.
 *
 * Timezone: date columns are read as RAW Excel serials (rawDates) and converted
 * to a calendar date via the integer day component only (VinSolutions serials are
 * America/New_York business wall-clock, so the day IS the ET business date). No
 * UTC offset is applied and the sub-day fraction can never roll the date.
 */
import { readXlsx } from '../provisional/xlsx-reader'
import {
  LEADS_HEADERS,
  LEADS_KEY_COLUMNS,
  LEADS_SHEET_NAME,
} from './leads-family-contract'

export class LeadsReaderError extends Error {}

const ADJUSTED_RESPONSE_COL = 'Adjusted Response Time (Min)'
const FIRST_CUSTOMER_CONTACT_COL = 'First Customer Contact'

export type LeadRow = {
  lead_id: string
  dealer: string
  dealer_id: string
  lead_source: string
  lead_type: string
  lead_status_type: string
  origination_date: string | null
  actual_response_min: number | null
  adjusted_response_min: number | null
  contacted: boolean | null
  first_customer_contact: string | null
  sold_datetime: string | null
}

type ResponseStat = {
  populated: number
  missing: number
  zeros: number
  sum_min: number | null
  mean_min: number | null
  min_min: number | null
  max_min: number | null
}

export type LeadsMetricPrimitives = {
  total_leads: number
  unique_lead_ids: number
  by_lead_type: Record<string, number>
  by_lead_status_type: Record<string, number>
  sold_count: number
  sold_datetime_populated: number
  service_parts_leakage_rows: number
  contacted_yes: number
  contacted_no: number
  contacted_missing: number
  first_customer_contact_blanks: number
  actual_response: ResponseStat
  adjusted_response: ResponseStat
}

/** Blank/"-" → null; otherwise a finite number, else null. Never 0 for a blank. */
export function coerceLeadNumber(raw: string | undefined): number | null {
  if (raw == null) return null
  const t = raw.replace(/[,\s"]/g, '').trim()
  if (t === '' || t === '-') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** "Yes"/"true"/"1" → true; "No"/"false"/"0" → false; blank/unknown → null. */
export function coerceContacted(raw: string | undefined): boolean | null {
  const t = (raw ?? '').trim().toLowerCase()
  if (t === '') return null
  if (['yes', 'true', '1', 'y'].includes(t)) return true
  if (['no', 'false', '0', 'n'].includes(t)) return false
  return null
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30) // serial 0 = 1899-12-30 (1900 date system)

/** Excel serial → calendar date (YYYY-MM-DD) using only the INTEGER day. No
 *  timezone offset is applied: VinSolutions serials are business wall-clock, so
 *  the integer day is the America/New_York business date, and a sub-day fraction
 *  can never shift it. */
export function excelSerialToBusinessDate(serial: number): string {
  const day = Math.floor(serial)
  return new Date(EXCEL_EPOCH_UTC + day * 86400000).toISOString().slice(0, 10)
}

/** Normalize a date cell to a business calendar date. Accepts a raw Excel serial
 *  (rawDates output) or an already-ISO date/datetime string. Blank → null. */
export function normalizeBusinessDate(raw: string | undefined): string | null {
  const t = (raw ?? '').trim()
  if (t === '') return null
  if (/^\d+(\.\d+)?$/.test(t)) return excelSerialToBusinessDate(Number(t))
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  return null
}

function pickSheet(buf: Buffer): Array<Array<string>> {
  // rawDates: get serials, not UTC-converted ISO, so date interpretation is ours.
  const { sheets } = readXlsx(buf, {}, { rawDates: true })
  // readXlsx guarantees >= 1 sheet (it throws otherwise).
  const sheet = sheets.find((s) => s.name === LEADS_SHEET_NAME) ?? sheets[0]
  return sheet.rows
}

/** Parse a Leads workbook into structured rows. Requires the exact schema header
 *  row (validate with the classifier first for a hold decision); here we only
 *  guard that the key columns are locatable so we never mis-map. */
export function parseLeadRows(buf: Buffer): Array<LeadRow> {
  const rows = pickSheet(buf)
  if (rows.length < 1) throw new LeadsReaderError('empty sheet')
  const headers = rows[0].map((h) => h.trim())
  const idx = (name: string): number => {
    const i = headers.indexOf(name)
    if (i < 0) throw new LeadsReaderError(`missing required column: ${name}`)
    return i
  }
  const K = LEADS_KEY_COLUMNS
  const iId = idx(K.leadId)
  const iDealer = idx(K.dealer)
  const iDealerId = idx(K.dealerId)
  const iSource = idx(K.leadSource)
  const iType = idx(K.leadType)
  const iStatus = idx(K.leadStatusType)
  const iOrig = idx(K.originationDate)
  const iResp = idx(K.actualResponseMin)
  const iAdj = idx(ADJUSTED_RESPONSE_COL)
  const iContacted = idx(K.contactedIndicator)
  const iFirst = idx(FIRST_CUSTOMER_CONTACT_COL)
  const iSold = idx(K.soldDatetime)
  // Bounds-safe accessor: a short row (trailing columns absent) yields '' at
  // runtime rather than an out-of-range read.
  const at = (r: Array<string>, i: number): string =>
    i >= 0 && i < r.length ? r[i] : ''
  const cell = (r: Array<string>, i: number) => at(r, i).trim()

  const out: Array<LeadRow> = []
  for (const r of rows.slice(1)) {
    if (!r.some((c) => c.trim() !== '')) continue // skip fully-blank rows
    out.push({
      lead_id: cell(r, iId),
      dealer: cell(r, iDealer),
      dealer_id: cell(r, iDealerId),
      lead_source: cell(r, iSource),
      lead_type: cell(r, iType),
      lead_status_type: cell(r, iStatus),
      origination_date: normalizeBusinessDate(at(r, iOrig)),
      actual_response_min: coerceLeadNumber(at(r, iResp)),
      adjusted_response_min: coerceLeadNumber(at(r, iAdj)),
      contacted: coerceContacted(at(r, iContacted)),
      first_customer_contact: cell(r, iFirst) || null,
      sold_datetime: cell(r, iSold) || null,
    })
  }
  return out
}

function responseStat(values: Array<number | null>): ResponseStat {
  const present = values.filter((n): n is number => n != null)
  const populated = present.length
  const sum = present.reduce((a, b) => a + b, 0)
  return {
    populated,
    missing: values.length - populated,
    zeros: present.filter((n) => n === 0).length,
    // Missing is never zero: with no populated values, stats are null, not 0.
    sum_min: populated > 0 ? sum : null,
    mean_min: populated > 0 ? sum / populated : null,
    min_min: populated > 0 ? Math.min(...present) : null,
    max_min: populated > 0 ? Math.max(...present) : null,
  }
}

/** Deterministic non-PII metric primitives from parsed lead rows. */
export function computeLeadsPrimitives(
  rows: Array<LeadRow>,
): LeadsMetricPrimitives {
  const tally = (vals: Array<string>): Record<string, number> => {
    const m: Record<string, number> = {}
    for (const v of vals) {
      const k = v || '(blank)'
      m[k] = (m[k] ?? 0) + 1
    }
    return Object.fromEntries(
      Object.entries(m).sort(([a], [b]) => a.localeCompare(b)),
    )
  }
  const ids = rows.map((r) => r.lead_id).filter((v) => v !== '')
  return {
    total_leads: rows.length,
    unique_lead_ids: new Set(ids).size,
    by_lead_type: tally(rows.map((r) => r.lead_type)),
    by_lead_status_type: tally(rows.map((r) => r.lead_status_type)),
    sold_count: rows.filter((r) => r.lead_status_type === 'Sold').length,
    sold_datetime_populated: rows.filter((r) => r.sold_datetime != null).length,
    service_parts_leakage_rows: rows.filter((r) =>
      /\b(service|parts)\b/i.test(r.lead_source),
    ).length,
    contacted_yes: rows.filter((r) => r.contacted === true).length,
    contacted_no: rows.filter((r) => r.contacted === false).length,
    contacted_missing: rows.filter((r) => r.contacted == null).length,
    first_customer_contact_blanks: rows.filter(
      (r) => r.first_customer_contact == null,
    ).length,
    actual_response: responseStat(rows.map((r) => r.actual_response_min)),
    adjusted_response: responseStat(rows.map((r) => r.adjusted_response_min)),
  }
}

export function readLeads(buf: Buffer): {
  rows: Array<LeadRow>
  primitives: LeadsMetricPrimitives
} {
  const rows = parseLeadRows(buf)
  return { rows, primitives: computeLeadsPrimitives(rows) }
}

// Re-export so callers can build both parts from one import.
export { LEADS_HEADERS }
