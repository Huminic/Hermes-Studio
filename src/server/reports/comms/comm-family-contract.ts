/**
 * Enhanced Sales Communication Log (WEEKLY browser export) — family CONTRACT (M1R Gate 4C1).
 *
 * A NEW, fail-closed ingest family for the authenticated, read-only VinSolutions VinConnect
 * "Communication Log" WEEKLY browser export (24-column CSV). It is intentionally SEPARATE
 * from — and must NEVER reuse or relax — the existing strict single-day scheduled Sales
 * Communication family (`sales_comm_log`, quarantined). This is a distinct browser-export
 * family with its own provenance, its own 24-column schema, and a restricted-data policy.
 *
 * Governance: the raw CSVs carry customer + employee + message content and are RESTRICTED.
 * They live only in the /tmp handoff, are NEVER git-added/committed/copied into the repo, and
 * downstream evidence NEVER persists Customer, User, Message Content, phone/email, or any
 * name/verbatim content. Person/thread joins use non-reversible goal-scoped pseudonyms only.
 *
 * This module DECLARES the shape only; the reader enforces it. Missing is never zero.
 * Nothing here writes, promotes, or mutates the governed store / ledgers / /srv.
 */

export const COMM_WEEKLY_FAMILY =
  'enhanced_sales_communication_log_weekly' as const

/** The existing STRICT single-day scheduled family — declared here ONLY so the contract can
 *  assert this weekly browser family is a separate slug and never collapses into it. */
export const LEGACY_STRICT_COMM_FAMILY = 'sales_comm_log' as const

// ── Provenance hosts ────────────────────────────────────────────────────────
/** The VinConnect application host (where the authenticated read-only navigation happened). */
export const SOURCE_HOST = 'vinsolutions.app.coxautoinc.com' as const
/** The SEPARATE analytics/reporting host that renders the Communication Log report. */
export const REPORT_HOST = 'reporting-vinsolutions.app.coxautoinc.com' as const
export const ADMITTED_HOSTS: ReadonlyArray<string> = [SOURCE_HOST, REPORT_HOST]

/** The VinConnect source path prefix and the report path prefix (both exact). */
export const SOURCE_PATH_PREFIX = '/vinconnect/' as const
export const REPORT_PATH_PREFIX = '/VinAnalyticsDashboards/' as const

/** Normalize a URL or bare host to a lowercase hostname, rejecting embedded
 *  slashes/whitespace/@/ports on bare-host input. Mirrors the Leads family guard. */
export function parseHost(urlOrHost: string | null | undefined): string | null {
  const raw = (urlOrHost ?? '').trim()
  if (!raw) return null
  try {
    const host = new URL(raw).hostname.toLowerCase()
    return host === '' ? null : host
  } catch {
    if (/[/\\\s@:]/.test(raw)) return null
    return raw.toLowerCase()
  }
}

/**
 * True if the RAW url string carries an explicit port in its authority — INCLUDING the
 * scheme default `:443`, which `new URL(...).port` normalizes away. We inspect the authority
 * substring directly (before any URL normalization) so `https://host:443/…` fails closed as
 * the contract requires. Rejects `host:443`, `host:8443`, `user@host:443`, etc.
 */
export function hasExplicitPort(rawUrl: string): boolean {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(rawUrl.trim())
  if (!m) return false
  const authority = m[1]
  const at = authority.lastIndexOf('@')
  const hostport = at >= 0 ? authority.slice(at + 1) : authority
  // A DNS host followed by ":<digits>" is an explicit port (our hosts are never IPv6/bracketed).
  return /:\d+$/.test(hostport)
}

/** Admit the VinConnect source URL: https + EXACT source host + /vinconnect/ path + NO port. */
export function admitSourceUrl(url: string | null | undefined): boolean {
  const raw = (url ?? '').trim()
  if (hasExplicitPort(raw)) return false
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  return (
    u.protocol === 'https:' &&
    u.hostname.toLowerCase() === SOURCE_HOST &&
    u.pathname.startsWith(SOURCE_PATH_PREFIX)
  )
}

/** Admit the SEPARATE report URL: https + EXACT report host + /VinAnalyticsDashboards/ + NO port. */
export function admitReportUrl(url: string | null | undefined): boolean {
  const raw = (url ?? '').trim()
  if (hasExplicitPort(raw)) return false
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  return (
    u.protocol === 'https:' &&
    u.hostname.toLowerCase() === REPORT_HOST &&
    u.pathname.startsWith(REPORT_PATH_PREFIX)
  )
}

/** Parse the `_YYYY-MM-DD_YYYY-MM-DD.csv` period embedded in a capture filename, or null. */
export function parseFilenamePeriod(
  filename: string,
): { start: string; end: string } | null {
  const m = /_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\.csv$/.exec(filename)
  return m ? { start: m[1], end: m[2] } : null
}

/** Parse the capture-id date + rooftop: VIN-COMM-WEEKLY-YYYYMMDD-<dealerId>, or null. */
export function parseCaptureId(
  captureId: string,
): { date: string; dealer_id: string } | null {
  const m = /^VIN-COMM-WEEKLY-(\d{4})(\d{2})(\d{2})-(\d{5})$/.exec(captureId)
  return m ? { date: `${m[1]}-${m[2]}-${m[3]}`, dealer_id: m[4] } : null
}

/** The business-local calendar date of an ISO timestamp that carries an explicit offset
 *  (the first 10 chars are the local date). Returns '' if not a dated ISO string. */
export function localDateOf(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}T/.test(iso.trim()) ? iso.trim().slice(0, 10) : ''
}

// ── Container shape ─────────────────────────────────────────────────────────
/** The exact, ordered 24-column header schema (verified against the three real
 *  2026-08-24..2026-08-30 rooftop weekly exports; BOM-prefixed, RFC-4180 quoted).
 *  Any deviation (count, name, order) fails closed. */
export const COMM_HEADERS: ReadonlyArray<string> = [
  'Dealer',
  'User Group',
  'User',
  'Customer',
  'Dealer ID',
  'Activity Date',
  'Direction',
  'Comm Channel',
  'Comm Type',
  'Interaction Result',
  'Lead Type',
  'Lead Status Type',
  'Lead Status',
  'Lead Source Group',
  'Lead Source',
  'Lead Created Date',
  'Make',
  'Message Content',
  'Text Attachment',
  'Text Image',
  'Text Video',
  'Global Customer ID',
  'Lead ID',
  'Communication ID',
]
export const COMM_COLUMN_COUNT = COMM_HEADERS.length // 24

/**
 * Per-column data classification (privacy contract).
 *   - RESTRICTED: raw customer/employee/message content — NEVER persisted, NEVER committed,
 *     stripped in-memory. Person/thread joins substitute a non-reversible pseudonym.
 *   - PERMITTED: non-content structural/categorical/timestamp features usable in derived
 *     evidence (aggregate-safe).
 */
export const RESTRICTED_COLUMNS: ReadonlyArray<string> = [
  'Customer', // customer identity — stripped entirely (never joined)
  'User', // employee name — pseudonymized to a rep token, name never kept
  'Message Content', // free-text body — converted in-memory to permitted derived features only
  'Global Customer ID', // person id — pseudonymized only where a person join is necessary
  'Lead ID', // thread id — pseudonymized only where a thread join is necessary
  'Communication ID', // row id — used in-memory for uniqueness; pseudonymized if ever emitted
]
export const PERMITTED_DERIVED_COLUMNS: ReadonlyArray<string> = [
  'Dealer',
  'User Group',
  'Dealer ID',
  'Activity Date',
  'Direction',
  'Comm Channel',
  'Comm Type',
  'Interaction Result',
  'Lead Type',
  'Lead Status Type',
  'Lead Status',
  'Lead Source Group',
  'Lead Source',
  'Lead Created Date',
  'Make',
  'Text Attachment',
  'Text Image',
  'Text Video',
]

/** Columns used by the reader/validator (all must exist in COMM_HEADERS). */
export const COMM_KEY_COLUMNS = {
  dealer: 'Dealer',
  userGroup: 'User Group',
  user: 'User',
  customer: 'Customer',
  dealerId: 'Dealer ID',
  activityDate: 'Activity Date',
  direction: 'Direction',
  commChannel: 'Comm Channel',
  commType: 'Comm Type',
  interactionResult: 'Interaction Result',
  leadType: 'Lead Type',
  leadStatusType: 'Lead Status Type',
  leadStatus: 'Lead Status',
  leadSourceGroup: 'Lead Source Group',
  leadSource: 'Lead Source',
  messageContent: 'Message Content',
  globalCustomerId: 'Global Customer ID',
  leadId: 'Lead ID',
  communicationId: 'Communication ID',
} as const

// ── Sales-only declaration ──────────────────────────────────────────────────
/** Every row's Comm Type must equal exactly this (Sales-only capture). */
export const REQUIRED_COMM_TYPE = 'Sales' as const
/** The eight declared non-Service/non-Parts Lead Types selected in the capture filter. */
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
/** Row-scan guard: no categorical field may contain a Service/Parts token. Belt-and-suspenders
 *  over the Sales-only filter so a future un-listed service value still fails closed. */
export const SERVICE_PARTS_TOKEN = /\b(service|parts)\b/i
/** Categorical text columns scanned fail-closed for Service/Parts — INCLUDES User Group (the
 *  shadow requires User Group in the scan). ANY hit quarantines the whole capture. Message
 *  Content is deliberately EXCLUDED from the scan (never read as text for matching; it is
 *  restricted content). */
export const CATEGORICAL_SERVICE_SCAN_COLUMNS: ReadonlyArray<string> = [
  'User Group',
  'Direction',
  'Comm Channel',
  'Comm Type',
  'Interaction Result',
  'Lead Type',
  'Lead Status Type',
  'Lead Status',
  'Lead Source Group',
  'Lead Source',
  'Make',
]

/** Declared business timezone used to interpret Activity Date timestamps. */
export const BUSINESS_TIMEZONE = 'America/New_York' as const

// ── Per-rooftop identity (one export = exactly one rooftop) ──────────────────
export type CommProfile = 'serra-honda' | 'serra-nissan' | 'tony-serra-ford'
export const DEALER_IDENTITY: Record<
  CommProfile,
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
export const COMM_PROFILES = Object.keys(DEALER_IDENTITY) as Array<CommProfile>

/** Capture-id shape: VIN-COMM-WEEKLY-YYYYMMDD-<dealerId>. */
export const CAPTURE_ID_RE = /^VIN-COMM-WEEKLY-\d{8}-(\d{5})$/

/** Provenance fields required for every weekly Communication Log capture (browser export).
 *  Both the filter-selection evidence hash AND the post-apply result evidence hash are
 *  mandatory (the shadow HOLD required post-apply proof of the applied period + counts). */
export const REQUIRED_PROVENANCE_FIELDS: ReadonlyArray<string> = [
  'capture_id',
  'profile',
  'dealer_id',
  'dealer_name',
  'source_url',
  'report_url',
  'captured_at',
  'declared_report_kind',
  'reporting_period',
  'declared_rows',
  'declared_columns',
  'declared_unique_lead_ids',
  'declared_sha256',
  'filename',
  'filter_evidence_sha256',
  'applied_result_evidence_sha256',
]
/** The per-file declared_report_kind must equal the family slug. */
export const EXPECTED_REPORT_KIND = COMM_WEEKLY_FAMILY

/** captured_at must be ISO-8601 carrying an explicit timezone (Z or ±hh:mm). */
export const TZ_OFFSET_RE = /(?:Z|[+-]\d{2}:\d{2})$/

/** Ordered list of fail-closed classifier checks the reader applies to a held capture. */
export const COMM_CLASSIFIER_CHECKS: ReadonlyArray<string> = [
  'manifest_allowlisted',
  'declared_sha256',
  'profile',
  'dealer_identity',
  'capture_id',
  'source_url_host',
  'report_url_host',
  'declared_report_kind',
  'captured_at_timezone',
  'reporting_window',
  'filename_period',
  'filter_evidence_present',
  'applied_result_evidence_present',
  'schema_exact_24',
  'row_count',
  'column_count',
  'one_rooftop',
  'dealer_name',
  'comm_type_sales_every_row',
  'activity_date_in_window',
  'service_parts_scan',
  'wrong_dealer_rows_zero',
  'communication_id_complete',
  'communication_id_unique',
  'unique_lead_ids',
]

/**
 * The privacy-minimizing transformation version. Any change to which raw fields are read,
 * which derived features are emitted, or the pseudonym construction MUST bump this — the
 * derivative binds it into its lineage so a shadow can detect a silent transform change.
 */
export const TRANSFORM_VERSION = 'comm-weekly-derive-v1' as const

/**
 * Goal-scoped pseudonym salt. FIXED (so the derivative is deterministic + byte-reproducible)
 * and scoped to THIS goal (so a token cannot be cross-linked to any other dataset that uses a
 * different salt). Pseudonyms are one-way truncated SHA-256 over (salt || rooftop || rawId);
 * committed evidence never contains a raw name/id, and per-row pseudonyms are never committed
 * (only aggregate counts are) — the salt exists to make in-memory joins non-reversible and
 * non-cross-linkable, not to protect a committed rainbow-attackable column.
 */
export const PSEUDONYM_SALT =
  'halo-m1r-gate4c1-enhanced-comm-weekly-goal-scope' as const

/** Enforce that a candidate file is one of the exact manifest-allowlisted captures (filename
 *  + SHA-256 + byte size). Never globs. */
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

/** Evaluate provenance completeness (presence only; value correctness is enforced by the
 *  reader's classifier). captured_at must also carry an explicit tz offset. */
export function evaluateProvenanceCompleteness(prov: Record<string, unknown>): {
  gaps: Array<string>
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
  const capturedAt = prov.captured_at
  if (
    present('captured_at') &&
    (typeof capturedAt !== 'string' || !TZ_OFFSET_RE.test(capturedAt))
  )
    gaps.push('captured_at_timezone')
  return { gaps }
}
