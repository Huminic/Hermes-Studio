/**
 * VinSolutions workbook contracts + Sales-only quarantine engine (HUM-VIN-006).
 *
 * Pure (no I/O): given parsed sheets + the target dealer, classify the family,
 * read Filters metadata, and decide ACCEPT vs QUARANTINE fail-closed.
 *
 * Two distinct Sales-only decisions:
 *  - CONTRACT VIOLATION → immediate quarantine: multi-rooftop dealer filter /
 *    rows spanning dealers (ambiguous-tenant); CAGE lead types ≠ exactly
 *    {Internet,Phone,Walk-in}; wrong dealer; unrecognized family; extra non-blank
 *    sheet; non-"Sales Appointment" reason.
 *  - SCHEDULE-DEFINITION VULNERABILITY (a Filters tab that selects Service/Parts):
 *    NOT auto-clean. It FORCES exhaustive row-level validation; the delivery may be
 *    accepted only when every data row is explicitly Sales-domain and dealer-correct.
 *    Any Service/Parts-coded or ambiguous row → quarantine the whole delivery.
 */
import { dealerMatches } from '../report-ingest'

export type ReportKind =
  | 'lead_source_roi'
  | 'cage_kpi'
  | 'sales_comm_log'
  | 'crm_sales_gross'
  | 'appointments'
  | 'dealership_performance'

export type QuarantineReason =
  | 'unrecognized-family'
  | 'missing-contracted-sheet'
  | 'extra-nonblank-sheet'
  | 'wrong-dealer'
  | 'ambiguous-tenant'
  | 'non-sales-lead-type'
  | 'non-sales-appointment-reason'
  | 'incompatible-filter-metadata'
  | 'malformed-workbook'

export const PARSER_VERSION = 'vin-xlsx-1'

const SERVICE_PARTS_RE = /\b(service|parts)\b/i
const isServiceParts = (v: string): boolean => SERVICE_PARTS_RE.test(v ?? '')

// ── family signatures (subset of columns that must appear in the header row) ──

type FamilyDef = {
  kind: ReportKind
  /** columns that must ALL be present in the header row to classify. */
  signature: Array<string>
  /** true when the workbook is a single data sheet (no Report/Filters). */
  sheet1Only?: boolean
  /** per-row domain-coded fields to scan for Service/Parts. */
  domainFields?: Array<string>
  /** row date field used to derive the period for Sheet1-only families. */
  dateField?: string
}

const FAMILIES: Array<FamilyDef> = [
  {
    kind: 'sales_comm_log',
    signature: ['Dealer', 'User', 'Activity Date', 'Comm Channel', 'Lead Type', 'Lead Status Type', 'Lead Source', 'Message Content'],
    domainFields: ['Lead Type', 'Lead Status Type', 'Lead Source'],
    dateField: 'Activity Date',
  },
  {
    kind: 'cage_kpi',
    signature: ['User', 'Total Leads', 'Total Comms', 'Deals from Leads', 'Deals Created in Time Frame'],
  },
  {
    kind: 'lead_source_roi',
    signature: ['Dealer', 'Lead_Source', 'Total_Leads', 'Good_Leads', 'Sold_from_Leads'],
    domainFields: ['Lead_Source'],
  },
  {
    kind: 'crm_sales_gross',
    signature: ['Dealer', 'Dealer ID', 'Sold Date', 'Sale ID', 'Deal Number', 'Front Gross', 'Back Gross', 'Total Gross'],
    sheet1Only: true,
    dateField: 'Sold Date',
  },
  {
    kind: 'appointments',
    signature: ['Appointment ID', 'Dealer', 'Dealer ID', 'Appointment Status', 'Is Show', 'Is No Show', 'Appointment Reason'],
    sheet1Only: true,
    domainFields: ['Appointment Reason'],
    dateField: 'Appointment Start Date',
  },
]

// ── Filters metadata ────────────────────────────────────────────────────────

export type FilterMetadata = {
  baseReportName: string | null
  dealers: Array<string>
  leadTypes: Array<string>
  leadIntents: Array<string>
  period: { start: string | null; end: string | null }
  raw: Record<string, string>
}

const splitMulti = (v: string): Array<string> =>
  (v ?? '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)

const FILTER_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** Parse a Filters date cell → ISO YYYY-MM-DD (timezone-safe; no Date()). Accepts
 *  ISO and the VinSolutions "MMM DD YYYY[ h:mmAM]" form (e.g. "Aug 17 2026 12:00AM"). */
export function parseFilterDate(v: string): string | null {
  const s = (v ?? '').trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?!\d)/)
  if (iso) {
    const mo = +iso[2], d = +iso[3]
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
    return `${iso[1]}-${iso[2]}-${iso[3]}`
  }
  const m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/)
  if (m) {
    const mo = FILTER_MONTHS[m[1].slice(0, 3).toLowerCase()]
    const d = +m[2], y = +m[3]
    if (!mo || d < 1 || d > 31) return null
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return null
}

/**
 * Parse the Filters sheet. Two layouts are supported:
 *  - Legacy 2-column `key | value` (value in column B).
 *  - The real VinSolutions 3-column `Filter Name | Number Selected | Selected Values`
 *    (header row present) — the value is read from the "Selected Values" column, NOT
 *    the "Number Selected" count (which would make every value a bare "1"/"3").
 * Period prefers explicit `Date Range Begin`/`Date Range End` rows (VinSolutions),
 * falling back to a single `Date Range` cell carrying two ISO dates (legacy fixtures).
 */
export function parseFilters(rows: Array<Array<string>>): FilterMetadata {
  // Detect the 3-column header and use the "Selected Values" column when present.
  let valueCol = 1
  for (const r of rows) {
    if ((r[0] ?? '').trim().toLowerCase() === 'filter name') {
      const sv = r.findIndex((c) => (c ?? '').trim().toLowerCase() === 'selected values')
      if (sv >= 0) { valueCol = sv; break }
    }
  }
  const raw: Record<string, string> = {}
  for (const r of rows) {
    const key = (r[0] ?? '').trim()
    const val = (r[valueCol] ?? '').trim()
    if (key) raw[key] = val
  }
  const get = (k: RegExp): string => {
    const hit = Object.keys(raw).find((x) => k.test(x))
    return hit ? raw[hit] : ''
  }
  // period: explicit Begin/End rows first, else a legacy single Date Range cell.
  const begin = parseFilterDate(get(/date range begin|start date|^from date$/i))
  const end = parseFilterDate(get(/date range end|^to date$/i))
  let period: { start: string | null; end: string | null }
  if (begin && end) {
    period = { start: begin, end }
  } else {
    const m = get(/date range|time frame|period/i).match(/(\d{4}-\d{2}-\d{2})\D+(\d{4}-\d{2}-\d{2})/)
    period = { start: m ? m[1] : null, end: m ? m[2] : null }
  }
  return {
    baseReportName: get(/base report name/i) || null,
    dealers: splitMulti(get(/^dealers?$/i) || get(/dealership/i)),
    leadTypes: splitMulti(get(/lead type/i)),
    leadIntents: splitMulti(get(/lead intent/i)),
    period,
    raw,
  }
}

// ── header + row helpers ────────────────────────────────────────────────────

function findHeaderRow(
  rows: Array<Array<string>>,
  signature: Array<string>,
): { index: number; map: Map<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const header = rows[i].map((c) => (c ?? '').trim())
    const set = new Set(header)
    if (signature.every((s) => set.has(s))) {
      const map = new Map<string, number>()
      header.forEach((h, c) => map.set(h, c))
      return { index: i, map }
    }
  }
  return null
}

const isBlankSheet = (rows: Array<Array<string>>): boolean =>
  rows.every((r) => r.every((c) => (c ?? '').trim() === ''))

// ── evaluation ────────────────────────────────────────────────────────────

export type Sheet = { name: string; rows: Array<Array<string>> }

export type Evaluation =
  | {
      status: 'accepted'
      kind: ReportKind
      dealer: string
      period: { start: string | null; end: string | null }
      /** the header row (column names). */
      header: Array<string>
      /** accepted data rows (every source cell, ISO-resolved dates), immutable. */
      rows: Array<Array<string>>
      /** observed data rows in the source. */
      source_row_count: number
      /** rows accepted into the analytical store (== source for accepted). */
      accepted_row_count: number
      filters: FilterMetadata | null
      schedule_vulnerability: boolean
      evidence: Record<string, unknown>
    }
  | {
      status: 'quarantined'
      reason: QuarantineReason
      detail: string
      kind: ReportKind | null
      /** observed data rows — preserved even though NONE are accepted. */
      source_row_count: number
      evidence: Record<string, unknown>
    }

const CAGE_LEAD_TYPES = new Set(['internet', 'phone', 'walk-in', 'walkin', 'walk in'])

/** Filters lead types are EXACTLY {Internet, Phone, Walk-in} (CAGE + Dashboard). */
function isExactSalesLeadTypes(leadTypes: Array<string>): boolean {
  const types = leadTypes.map((t) => t.toLowerCase())
  return (
    types.length > 0 &&
    types.every((t) => CAGE_LEAD_TYPES.has(t)) &&
    ['internet', 'phone'].every((r) => types.includes(r)) &&
    types.some((t) => t.startsWith('walk'))
  )
}

/**
 * Multi-section families (e.g. Dealership Performance Dashboard) are NOT a flat
 * header+rows table — classified by title/section markers, validated at the
 * Filters level (dealer + exact 3 lead types), with EVERY non-blank source row
 * (incl. section markers) preserved generically. Sales-only fail-closed.
 */
type MultiSectionFamily = { kind: ReportKind; title: string; sectionMarkers: Array<string> }
const MULTI_SECTION_FAMILIES: Array<MultiSectionFamily> = [
  {
    kind: 'dealership_performance',
    title: 'Dealership Performance Dashboard',
    sectionMarkers: ['Dealership Summary', 'Lead Type & Inventory Type Summary'],
  },
]

function flatten(sheet: Sheet): Array<string> {
  return sheet.rows.flat().map((c) => (c ?? '').trim()).filter(Boolean)
}

function classifyMultiSection(sheets: Array<Sheet>): { fam: MultiSectionFamily; sheet: Sheet } | null {
  for (const fam of MULTI_SECTION_FAMILIES) {
    const candidates = sheets.filter((s) => !/^filters$/i.test(s.name))
    for (const s of candidates) {
      const cells = flatten(s)
      const hasTitle = cells.some((c) => c === fam.title)
      const hasMarkers = fam.sectionMarkers.every((m) => cells.includes(m))
      if (hasTitle || hasMarkers) return { fam, sheet: s }
    }
  }
  return null
}

function evaluateMultiSection(
  fam: MultiSectionFamily,
  reportSheet: Sheet,
  sheets: Array<Sheet>,
  opts: { profileDealer: string },
): Evaluation {
  const nonblank = reportSheet.rows.filter((r) => r.some((c) => (c ?? '').trim() !== ''))
  const q = (reason: QuarantineReason, detail: string, evidence: Record<string, unknown> = {}): Evaluation => ({
    status: 'quarantined', reason, detail, kind: fam.kind, source_row_count: nonblank.length, evidence,
  })

  // only-blank extra sheets tolerated (contracted: this sheet + Filters)
  const filtersSheet = sheets.find((s) => /^filters$/i.test(s.name))
  const contracted = new Set([reportSheet.name.toLowerCase(), ...(filtersSheet ? ['filters'] : [])])
  for (const s of sheets) {
    if (contracted.has(s.name.toLowerCase())) continue
    if (s.rows.some((r) => r.some((c) => (c ?? '').trim() !== ''))) return q('extra-nonblank-sheet', `uncontracted non-blank sheet "${s.name}"`, { sheet: s.name })
  }

  // Filters-level Sales-only validation (aggregate → no per-row proof possible)
  if (!filtersSheet) return q('incompatible-filter-metadata', 'Dealership Performance Dashboard requires a Filters tab')
  const filters = parseFilters(filtersSheet.rows)
  if (filters.dealers.length !== 1) return q('ambiguous-tenant', `expected exactly one dealer, got ${filters.dealers.length}`, { dealers: filters.dealers })
  if (!dealerMatches(opts.profileDealer, filters.dealers[0])) return q('wrong-dealer', `Filters dealer "${filters.dealers[0]}" ≠ target "${opts.profileDealer}"`, { dealer: filters.dealers[0] })
  if (!isExactSalesLeadTypes(filters.leadTypes)) return q('incompatible-filter-metadata', `lead types must be exactly {Internet,Phone,Walk-in}; got [${filters.leadTypes.join(', ')}]`, { leadTypes: filters.leadTypes })
  if ([...filters.leadIntents, ...filters.leadTypes].some(isServiceParts)) return q('non-sales-lead-type', 'Filters select Service/Parts on an aggregate dashboard (no row-level Sales proof possible)', { leadIntents: filters.leadIntents })

  return {
    status: 'accepted',
    kind: fam.kind,
    dealer: filters.dealers[0] || opts.profileDealer,
    period: filters.period,
    header: [], // multi-section: no single header — rows preserved generically
    rows: nonblank,
    source_row_count: nonblank.length,
    accepted_row_count: nonblank.length,
    filters,
    schedule_vulnerability: false,
    evidence: {
      multi_section: true,
      base_report_name: filters.baseReportName,
      section_markers_found: fam.sectionMarkers.filter((m) => flatten(reportSheet).includes(m)),
      rows_preserved: nonblank.length,
    },
  }
}

export function evaluateDelivery(
  sheets: Array<Sheet>,
  opts: { profileDealer: string },
): Evaluation {
  // Multi-section families (Dealership Performance Dashboard) first — they are
  // not a flat table and are classified by title/section markers.
  const ms = classifyMultiSection(sheets)
  if (ms) return evaluateMultiSection(ms.fam, ms.sheet, sheets, opts)

  let sourceRowCount = 0
  const q = (reason: QuarantineReason, detail: string, kind: ReportKind | null, evidence: Record<string, unknown> = {}): Evaluation => ({
    status: 'quarantined', reason, detail, kind, source_row_count: sourceRowCount, evidence,
  })

  // classify: find the data/Report sheet + header row matching a family signature
  let matched: { fam: FamilyDef; sheet: Sheet; header: { index: number; map: Map<string, number> } } | null = null
  for (const fam of FAMILIES) {
    // Report/Sheet1 candidates: prefer a sheet literally named Report, else the first non-Filters sheet
    const candidates = fam.sheet1Only
      ? sheets
      : sheets.filter((s) => /^report/i.test(s.name) || !/^filters$/i.test(s.name))
    for (const s of candidates) {
      const h = findHeaderRow(s.rows, fam.signature)
      if (h) { matched = { fam, sheet: s, header: h }; break }
    }
    if (matched) break
  }
  if (!matched) return q('unrecognized-family', 'no family signature matched any sheet', null)

  const { fam, sheet, header } = matched
  // Observed data rows up front, so source_row_count is preserved on ANY
  // subsequent quarantine (never erased).
  const dataRows = sheet.rows
    .slice(header.index + 1)
    .filter((r) => r.some((c) => (c ?? '').trim() !== ''))
  sourceRowCount = dataRows.length

  const filtersSheet = sheets.find((s) => /^filters$/i.test(s.name))
  const filters = filtersSheet ? parseFilters(filtersSheet.rows) : null

  // extra non-blank sheet guard (only truly-blank extras tolerated)
  const contracted = new Set<string>([sheet.name.toLowerCase()])
  if (filtersSheet) contracted.add('filters')
  for (const s of sheets) {
    if (contracted.has(s.name.toLowerCase())) continue
    if (!isBlankSheet(s.rows)) return q('extra-nonblank-sheet', `uncontracted non-blank sheet "${s.name}"`, fam.kind, { sheet: s.name })
  }

  // Filters-level CONTRACT VIOLATIONS
  if (filters) {
    if (filters.dealers.length > 1) return q('ambiguous-tenant', `Filters select ${filters.dealers.length} rooftops`, fam.kind, { dealers: filters.dealers })
    if (fam.kind === 'cage_kpi') {
      if (!isExactSalesLeadTypes(filters.leadTypes)) return q('incompatible-filter-metadata', `CAGE lead types must be exactly {Internet,Phone,Walk-in}; got [${filters.leadTypes.join(', ')}]`, fam.kind, { leadTypes: filters.leadTypes })
    }
  }

  // schedule-definition vulnerability: a Filters tab selecting Service/Parts.
  const scheduleVulnerability = !!filters && [...filters.leadIntents, ...filters.leadTypes].some(isServiceParts)

  // ROW-LEVEL validation (always, for families with rows): dealer-correct + Sales-domain
  const dealerCol = header.map.get('Dealer')
  const dealersSeen = new Set<string>()
  const periodDates: Array<string> = []
  const dateCol = fam.dateField ? header.map.get(fam.dateField) : undefined
  const domainCols = (fam.domainFields ?? []).map((f) => header.map.get(f)).filter((c): c is number => c != null)
  const reasonCol = fam.kind === 'appointments' ? header.map.get('Appointment Reason') : undefined

  for (const r of dataRows) {
    if (dealerCol != null) {
      const d = (r[dealerCol] ?? '').trim()
      if (d) {
        dealersSeen.add(d)
        if (!dealerMatches(opts.profileDealer, d)) return q('wrong-dealer', `row dealer "${d}" ≠ target "${opts.profileDealer}"`, fam.kind, { rowDealer: d })
      }
    }
    if (reasonCol != null) {
      const reason = (r[reasonCol] ?? '').trim()
      if (reason.toLowerCase() !== 'sales appointment') return q('non-sales-appointment-reason', `Appointment Reason "${reason}" ≠ "Sales Appointment"`, fam.kind, { reason })
    } else {
      for (const c of domainCols) {
        if (isServiceParts(r[c] ?? '')) return q('non-sales-lead-type', `Service/Parts-coded row value "${r[c]}"`, fam.kind, { value: r[c] })
      }
    }
    if (dateCol != null) {
      const dv = (r[dateCol] ?? '').trim().slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(dv)) periodDates.push(dv)
    }
  }
  if (dealersSeen.size > 1) return q('ambiguous-tenant', `rows span ${dealersSeen.size} dealers`, fam.kind, { dealers: [...dealersSeen] })

  // period: Filters range if present, else derived from contracted row date fields
  periodDates.sort()
  const period = filters?.period.start
    ? filters.period
    : { start: periodDates[0] ?? null, end: periodDates[periodDates.length - 1] ?? null }

  const dealer = dealerCol != null && dataRows[0] ? (dataRows[0][dealerCol] ?? opts.profileDealer).trim() || opts.profileDealer : opts.profileDealer

  return {
    status: 'accepted',
    kind: fam.kind,
    dealer,
    period,
    header: sheet.rows[header.index].map((c) => (c ?? '').trim()),
    rows: dataRows,
    source_row_count: dataRows.length,
    accepted_row_count: dataRows.length,
    filters,
    schedule_vulnerability: scheduleVulnerability,
    evidence: {
      report_sheet: sheet.name,
      header_row: header.index + 1,
      base_report_name: filters?.baseReportName ?? null,
      dealers_seen: [...dealersSeen],
      schedule_vulnerability: scheduleVulnerability,
      rows_validated: dataRows.length,
    },
  }
}
