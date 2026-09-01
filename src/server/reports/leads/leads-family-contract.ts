/**
 * VinSolutions Custom Reporting — "Leads" browser-export family CONTRACT (M1R).
 *
 * A NEW, fail-closed ingest family for the authenticated, read-only VinSolutions
 * Custom Reporting "Leads" browser export (Excel Flat XLSX). It is intentionally
 * SEPARATE from:
 *   - the CSV ROI/KPI `report-ingest` path (which writes Brain and rejects XLSX), and
 *   - the response-times browser contract (VinConnect dashboard host).
 *
 * This module is the single source of truth for the family's declared shape:
 * exact source host, 57-column schema, sheet name, Sales-only filter declarations,
 * per-rooftop identity, and provenance requirements. The machine-readable mirror
 * lives at docs/halo/contract/vinsolutions-custom-reporting-leads-contract.json
 * and a test asserts the two never drift.
 *
 * Nothing here writes, promotes, or mutates the governed store / ledgers / /srv.
 * Missing is never zero: this module only DECLARES; coercion (in the reader) maps
 * blank cells to null, never to 0.
 */

export const LEADS_FAMILY = 'vinsolutions_custom_reporting_leads' as const

// ── Provenance hosts ────────────────────────────────────────────────────────
// The exact official Custom Reporting host for the Leads export. This is a
// DIFFERENT host from the VinConnect dashboard host used by the response-times
// browser contract, and must never be rewritten to it in provenance.
export const REPORTING_HOST =
  'reporting-vinsolutions.app.coxautoinc.com' as const
// The VinConnect dashboard host (kept here only so both official hosts are
// admitted by the generic provenance guard; it is NOT a valid Leads source).
export const DASHBOARD_HOST = 'vinsolutions.app.coxautoinc.com' as const
/** Both exact official Cox Automotive hosts admitted anywhere in browser provenance. */
export const ADMITTED_HOSTS: ReadonlyArray<string> = [
  REPORTING_HOST,
  DASHBOARD_HOST,
]
/** The Custom Reporting report path prefix (InfoGo report center). */
export const LEADS_SOURCE_PATH_PREFIX = '/InfoGo/' as const

/** Normalize a full URL or bare host to a lowercase hostname, or null if the
 *  input is not a clean host/URL. Rejects embedded slashes/whitespace/@/ports on
 *  bare-host input so "host:8765" or "a/b" can never slip through. */
export function parseHost(urlOrHost: string | null | undefined): string | null {
  const raw = (urlOrHost ?? '').trim()
  if (!raw) return null
  try {
    const host = new URL(raw).hostname.toLowerCase()
    // A scheme-less "host:port" parses as protocol "host:" with an empty hostname.
    return host === '' ? null : host
  } catch {
    if (/[/\\\s@:]/.test(raw)) return null
    return raw.toLowerCase()
  }
}

/** Admit ONLY the two exact official Cox hosts. Arbitrary subdomains
 *  ("evil.reporting-vinsolutions.app.coxautoinc.com"), suffix attacks
 *  ("...coxautoinc.com.evil.com"), ports, and malformed input all fail closed. */
export function admitReportingHost(urlOrHost: string): boolean {
  const host = parseHost(urlOrHost)
  return host !== null && ADMITTED_HOSTS.includes(host)
}

/** Admit a Leads source URL: https + EXACT reporting host + InfoGo report path.
 *  The dashboard host is deliberately NOT accepted for this family. */
export function admitLeadsSourceUrl(url: string | null | undefined): boolean {
  const raw = (url ?? '').trim()
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  if (u.hostname.toLowerCase() !== REPORTING_HOST) return false
  return u.pathname.startsWith(LEADS_SOURCE_PATH_PREFIX)
}

// ── Container shape ─────────────────────────────────────────────────────────
export const LEADS_SHEET_NAME = 'Export' as const
/** XLSX is a ZIP; the first four bytes are the local-file-header magic. */
export const XLSX_MAGIC: ReadonlyArray<number> = [0x50, 0x4b, 0x03, 0x04]

/** The exact, ordered 57-column Excel-Flat header schema (verified against the
 *  three real 2026-08-24..2026-08-30 rooftop exports; byte-identical across all
 *  three). Any deviation (count, name, order) fails closed. */
export const LEADS_HEADERS: ReadonlyArray<string> = [
  'Lead ID',
  'Dealer',
  'Customer',
  'Lead Source',
  'Lead Type',
  'Lead Source Group',
  'Lead Status',
  'Lead Status Custom',
  'Lead Status Type',
  'Actual Response Time (Min)',
  'Adjusted Response Time (Min)',
  'Actionable Response Datetime',
  'Contacted Indicator',
  'ADF/XML Indicator',
  'Has Vehicle Of Interest',
  'Sales Rep',
  'Sales Rep - User Group',
  'BD Agent',
  'BD Agent - User Group',
  'Created User',
  'Created User - User Group',
  'Last Modified User',
  'Last Modified User - User Group',
  'Originated After Hours',
  'Inventory Type',
  'Stock Number',
  'VIN',
  'Year',
  'Make',
  'Model',
  'Trim',
  'Vehicle Memo',
  'Initial Vehicle Year',
  'Initial Vehicle Make',
  'Initial Vehicle Model',
  'Lead Origination Date',
  'Dealer ID',
  'Lead Last Modified Date',
  'First Contact Attempt',
  'Last Attempted Contact',
  'Last Attempted Email Contact',
  'Last Attempted Phone Contact',
  'Last Attempted Text Contact Datetime',
  'Last Customer Contact',
  'Last Attempted or Actual Contact',
  'First Customer Contact',
  'Hot Lead',
  'Trade 1 Year',
  'Trade 1 Make',
  'Trade 1 Model',
  'Trade 1 Memo',
  'Trade 2 Year',
  'Trade 2 Make',
  'Trade 2 Model',
  'Trade 2 Memo',
  'Sold Datetime',
  'CoBuyer Full Name',
]
export const LEADS_COLUMN_COUNT = LEADS_HEADERS.length // 57

/** Column names used by the classifier/reader (must exist in LEADS_HEADERS). */
export const LEADS_KEY_COLUMNS = {
  leadId: 'Lead ID',
  dealer: 'Dealer',
  dealerId: 'Dealer ID',
  leadSource: 'Lead Source',
  leadType: 'Lead Type',
  leadStatusType: 'Lead Status Type',
  originationDate: 'Lead Origination Date',
  actualResponseMin: 'Actual Response Time (Min)',
  contactedIndicator: 'Contacted Indicator',
  soldDatetime: 'Sold Datetime',
} as const

// ── Sales-only filter declaration ───────────────────────────────────────────
/** The declared Lead Type allow-list from the saved report Filters. */
export const ALLOWED_LEAD_TYPES: ReadonlyArray<string> = [
  'Import',
  'Internet',
  'Phone',
  'PreviousCustomer',
  'Referral',
  'Walk-in',
  'WebsiteChat',
  'Wholesale',
]
/** The declared Lead Source exclusions (Not In List) — governed service sources. */
export const EXCLUDED_LEAD_SOURCES: ReadonlyArray<string> = [
  'Service',
  'Service Appraisal',
  'Service Dept',
  'Service Referral',
  'SERVICE TO SALES APPT CONFIRMATION',
]
/** Row-scan guard: no Sales lead source may contain a Service/Parts token. This
 *  is a belt-and-suspenders scan on top of the declared exclusion list, so a
 *  future un-listed service source still fails closed. */
export const SERVICE_PARTS_TOKEN = /\b(service|parts)\b/i
/** All categorical text columns scanned fail-closed for Service/Parts evidence.
 *  ANY hit in ANY of these quarantines the whole workbook. */
export const CATEGORICAL_SERVICE_SCAN_COLUMNS: ReadonlyArray<string> = [
  'Lead Type',
  'Lead Source',
  'Lead Source Group',
  'Lead Status',
  'Lead Status Custom',
  'Inventory Type',
]

/** VinSolutions exports business-local dates; this is the declared business
 *  timezone used to interpret Excel serial datetimes as calendar dates. */
export const BUSINESS_TIMEZONE = 'America/New_York' as const

// ── Per-rooftop identity (one export = exactly one rooftop) ──────────────────
export type LeadsProfile = 'serra-honda' | 'serra-nissan' | 'tony-serra-ford'
export const DEALER_IDENTITY: Record<
  LeadsProfile,
  { dealer_id: string; dealer_name: string }
> = {
  'serra-honda': {
    dealer_id: '21043',
    dealer_name: 'Serra Honda of Sylacauga',
  },
  'serra-nissan': {
    dealer_id: '21044',
    dealer_name: 'Serra Nissan of Sylacauga',
  },
  'tony-serra-ford': { dealer_id: '21047', dealer_name: 'Tony Serra Ford' },
}
export const LEADS_PROFILES = Object.keys(
  DEALER_IDENTITY,
) as Array<LeadsProfile>

/** Capture-id shape: VIN-LEADS-YYYYMMDD-<dealerId>. */
export const CAPTURE_ID_RE = /^VIN-LEADS-\d{8}-(\d{5})$/

/** The provenance fields required for every Leads capture (browser export).
 *  A missing item is exposed as an unproven contract gap (held-but-unproven),
 *  never fabricated. A present-but-wrong item fails closed in the classifier. */
export const REQUIRED_PROVENANCE_FIELDS: ReadonlyArray<string> = [
  'capture_id',
  'profile',
  'dealer_id',
  'dealer_name',
  'source_url',
  'captured_at',
  'declared_report_kind',
  'filter_evidence',
  'reporting_period',
  'declared_rows',
  'declared_sha256',
  'filename',
]
export const EXPECTED_DATASET_KIND = 'Leads' as const
/** The per-file declared_report_kind must equal the family slug. */
export const EXPECTED_REPORT_KIND = LEADS_FAMILY

/** The full ordered list of classifier checks a held workbook passes. Single
 *  source of truth shared by the classifier result and the JSON contract mirror. */
export const LEADS_CLASSIFIER_CHECKS: ReadonlyArray<string> = [
  'magic_bytes',
  'declared_sha256',
  'profile',
  'dealer_identity',
  'capture_id',
  'source_url_host',
  'declared_report_kind',
  'captured_at_timezone',
  'reporting_window',
  'filename_period',
  'single_sheet',
  'sheet_name',
  'no_formulas',
  'schema',
  'extra_columns',
  'row_count',
  'one_rooftop',
  'dealer_name',
  'lead_id',
  'period_rows',
  'sales_only_lead_type',
  'sales_only_source',
  'sales_only_scan',
]
/** captured_at must be ISO-8601 carrying an explicit timezone (Z or ±hh:mm). */
export const TZ_OFFSET_RE = /(?:Z|[+-]\d{2}:\d{2})$/

/** Evaluate provenance completeness. Returns the list of required items that are
 *  ABSENT/unproven, plus notes on what evidence the controller must supply.
 *  Presence only — value correctness is enforced by the classifier's checks.
 *  Special case: `captured_at` must carry an explicit timezone offset; a
 *  timestamp without one leaves `captured_at_timezone` unproven. */
export function evaluateProvenanceCompleteness(prov: Record<string, unknown>): {
  gaps: Array<string>
  needed: Record<string, string>
} {
  const present = (k: string): boolean => {
    const v = prov[k]
    if (v == null) return false
    if (typeof v === 'string') return v.trim() !== ''
    if (Array.isArray(v)) return v.length > 0
    if (typeof v === 'object') return Object.keys(v).length > 0
    return true
  }
  const gaps = REQUIRED_PROVENANCE_FIELDS.filter((k) => !present(k))
  // captured_at present but without an explicit tz offset → tz still unproven.
  const capturedAt = prov.captured_at
  if (
    present('captured_at') &&
    (typeof capturedAt !== 'string' || !TZ_OFFSET_RE.test(capturedAt))
  )
    gaps.push('captured_at_timezone')
  const needs: Record<string, string> = {
    captured_at:
      'per-file capture timestamp (when the authenticated browser download completed)',
    captured_at_timezone: `explicit timezone offset on captured_at (declared business tz ${BUSINESS_TIMEZONE}, e.g. -04:00)`,
    source_url: `full per-file source URL on ${REPORTING_HOST}${LEADS_SOURCE_PATH_PREFIX}...`,
    declared_report_kind: `declared report kind (expected "${EXPECTED_REPORT_KIND}")`,
    filter_evidence:
      'the applied Lead Type / Lead Source filter lists as captured evidence',
  }
  const needed: Record<string, string> = {}
  for (const g of gaps) if (needs[g]) needed[g] = needs[g]
  return { gaps, needed }
}

/** Enforce that a candidate file is one of the exact manifest-allowlisted
 *  captures (by filename + SHA-256 + byte size). Rejects any non-manifest file
 *  (e.g. a rejected/contaminated or pre-gate workbook in the same directory).
 *  Never globs. */
export type AllowlistEntry = { filename: string; sha256: string; bytes: number }
export function isManifestAllowlisted(
  candidate: { filename: string; sha256: string; bytes: number },
  allowlist: ReadonlyArray<AllowlistEntry>,
): boolean {
  return allowlist.some(
    (a) =>
      a.filename === candidate.filename &&
      a.sha256 === candidate.sha256 &&
      a.bytes === candidate.bytes,
  )
}
