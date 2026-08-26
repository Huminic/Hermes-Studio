/**
 * HOLD_ONLY / NO_ACTION landing contract (HUM-VIN-006, revised outcome).
 *
 * Duane has authorized the VinSolutions delivery edge THROUGH verified file
 * landing on Andromeda — but NOT downstream use. This module lands a delivery
 * inertly and does NOTHING else:
 *
 *   HARD GUARD — this module MUST NEVER import or invoke: the analytical store
 *   (recordDelivery / ingest_row), the Watchdog calculation engine (vin-metrics),
 *   report/dashboard population, threshold evaluation, notifications, workflows,
 *   or any customer-facing action. It only: preserves the original bytes
 *   immutably, writes a provenance manifest, optionally writes a structural
 *   transport payload (NO business metrics), and returns a durable receipt.
 *
 * Isolation: held data lives under its own holding root (INGEST_HOLD_ROOT),
 * entirely separate from the per-profile brain.db analytical rows.
 *
 * Reuse (safe, pure only): readXlsx (parse) + evaluateDelivery (classification +
 * Sales-only quarantine). Neither computes a business metric.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { readXlsx } from './xlsx-reader'
import { evaluateDelivery, PARSER_VERSION, type QuarantineReason, type ReportKind } from './vin-contracts'
import { parseCsv, detectCsvKind, classifyCsvHeaders, isServiceParts, dealerMatches, type CsvKind } from './csv-contracts'
import { parsePeriodHint } from '../ingest-auth'

// hold-only-3: multi-format landing edge (.xlsx six-family classification/transport
// unchanged; .csv deterministic ROI/KPI structural transport or unsupported-report
// quarantine; .pdf evidence-only, never OCR; extension↔magic-byte MIME check; unknown
// formats fail closed while retaining original bytes). hold-only-2 Sales Communication
// daily-period proof is retained within the .xlsx path.
export const TRANSFORM_VERSION = 'hold-only-3'

/** Only the three exact Serra profiles are supported by the holding contract. */
export const HOLD_ELIGIBLE = ['serra-honda', 'serra-nissan', 'tony-serra-ford'] as const
export type HoldProfile = (typeof HOLD_ELIGIBLE)[number]
export function isHoldEligible(profile: string): profile is HoldProfile {
  return (HOLD_ELIGIBLE as ReadonlyArray<string>).includes(profile)
}

/** The inert contract, exported for verification/receipts. */
export const HOLD_CONTRACT = {
  hold_only: true,
  no_action: true,
  forbids: [
    'metric_calculation',
    'watchdog_execution',
    'report_or_dashboard_population',
    'threshold_evaluation',
    'notification',
    'workflow',
    'customer_action',
  ],
} as const

export type HoldValidationState = 'held' | 'quarantined'
export type HoldReportKind = ReportKind | CsvKind | 'evidence_pdf' | 'unknown'
export type HoldSourceType = 'gmail_scheduler' | 'browser_export'
/** The exact VinSolutions app host a browser_export capture must originate from. */
export const VINSOLUTIONS_APP_HOST = 'vinsolutions.app.coxautoinc.com'
export type HoldQuarantineReason =
  | QuarantineReason
  | 'missing-required-metadata'
  | 'unexpected-period'
  | 'ineligible-profile'
  | 'mime-extension-mismatch'
  | 'unsupported-report'
  | 'unsupported-format'
  | 'sales-only-unproved'
  | 'invalid-provenance'

export type HoldPeriod = { start: string | null; end: string | null }

/** Delivery metadata that Central MCP supplies alongside the bytes.
 *  Provenance is a union: 'gmail_scheduler' (default; requires Gmail id/sender/
 *  subject) or 'browser_export' (may omit Gmail fields but requires capture_id,
 *  a source_url on the exact VinSolutions app host, and declared_report_kind). */
export type HoldMetadata = {
  profile: string
  filename: string
  received_at?: string | null
  period_hint?: string | null
  // provenance union
  source_type?: HoldSourceType
  // gmail_scheduler
  sender?: string
  subject?: string
  gmail_message_id?: string
  // browser_export
  capture_id?: string
  source_url?: string
  /** UNTRUSTED attribution only — never overrides any check/classifier/gate. */
  declared_report_kind?: string
}

export type HoldManifest = {
  receipt_id: string
  hold_only: true
  no_action: true
  profile: string
  dealer: string
  report_kind: HoldReportKind
  period: HoldPeriod
  source_type: HoldSourceType
  sender: string | null
  subject: string | null
  gmail_message_id: string | null
  capture_id: string | null
  source_url: string | null
  /** UNTRUSTED attribution only — preserved for provenance; never a decision input. */
  declared_report_kind: string | null
  filename: string
  file_extension: string
  media_type: string
  size_bytes: number
  sha256: string
  received_at: string | null
  captured_at: string
  parser_version: string
  transform_version: string
  /** what structural transform was applied: 'xlsx-classified' | 'csv-<kind>' | 'none'. */
  structural_transform: string
  validation_state: HoldValidationState
  quarantine_reason: HoldQuarantineReason | null
  detail: string | null
  schedule_vulnerability: boolean
  /** other checksums already held for the same (profile,kind,period) — a
   *  corrected re-send is separately attributable, never an overwrite. */
  prior_sha256_in_period: Array<string>
  transport_stored: boolean
  evidence: Record<string, unknown>
}

export type HoldReceipt = {
  outcome: 'held' | 'quarantined' | 'replay'
  manifest: HoldManifest
  hold_path: string
  original_path: string
  manifest_path: string
  transport_path: string | null
}

// ── paths ────────────────────────────────────────────────────────────────

export function holdRoot(): string {
  const env = process.env.INGEST_HOLD_ROOT?.trim()
  return env && env.length > 0 ? env : path.join(os.homedir(), '.hermes', 'ingest-hold')
}
const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_')
const sha256hex = (buf: Buffer) => createHash('sha256').update(buf).digest('hex')

/** Never overwrite: bytes/manifests are immutable once landed. */
function writeImmutable(p: string, buf: Buffer): void {
  if (fs.existsSync(p)) return
  fs.writeFileSync(p, buf)
  try { fs.chmodSync(p, 0o444) } catch { /* best-effort immutability flag */ }
}

// ── landing ─────────────────────────────────────────────────────────────

export type LandOptions = {
  profileDealer: string
  capturedAt: string
  includeTransport?: boolean
}

type BaseManifest = Omit<HoldManifest, 'report_kind' | 'period' | 'validation_state' | 'quarantine_reason' | 'detail' | 'schedule_vulnerability' | 'structural_transform' | 'evidence'>

function baseManifest(meta: HoldMetadata, dealer: string, sha: string, size: number, capturedAt: string, ext: string, mediaType: string): BaseManifest {
  return {
    receipt_id: `hold_${sha.slice(0, 16)}`,
    hold_only: true,
    no_action: true,
    profile: meta.profile,
    dealer,
    source_type: meta.source_type ?? 'gmail_scheduler',
    sender: meta.sender?.trim() || null,
    subject: meta.subject?.trim() || null,
    gmail_message_id: meta.gmail_message_id?.trim() || null,
    capture_id: meta.capture_id?.trim() || null,
    source_url: meta.source_url?.trim() || null,
    declared_report_kind: meta.declared_report_kind?.trim() || null,
    filename: meta.filename,
    file_extension: ext,
    media_type: mediaType,
    size_bytes: size,
    sha256: sha,
    received_at: meta.received_at ?? null,
    captured_at: capturedAt,
    parser_version: PARSER_VERSION,
    transform_version: TRANSFORM_VERSION,
    prior_sha256_in_period: [],
    transport_stored: false,
  }
}

// ── format detection + extension↔magic-byte MIME check ─────────────────────

const MEDIA_TYPES: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  pdf: 'application/pdf',
}

type FormatCheck = { ext: string; media_type: string; error?: 'unsupported' | 'mismatch'; detail?: string }

function detectFormat(filename: string, buf: Buffer): FormatCheck {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/)
  const ext = m ? m[1] : ''
  const media_type = MEDIA_TYPES[ext] ?? ''
  if (!media_type) return { ext, media_type: '', error: 'unsupported', detail: `unsupported extension '${ext || '(none)'}'` }
  const startsWith = (sig: Array<number>) => sig.every((b, i) => buf[i] === b)
  const isZip = startsWith([0x50, 0x4b]) // 'PK' (xlsx = zip/OOXML)
  const isPdf = startsWith([0x25, 0x50, 0x44, 0x46]) // '%PDF'
  if (ext === 'xlsx' && !isZip) return { ext, media_type, error: 'mismatch', detail: '.xlsx bytes are not a ZIP/OOXML container' }
  if (ext === 'pdf' && !isPdf) return { ext, media_type, error: 'mismatch', detail: '.pdf bytes do not begin with %PDF' }
  if (ext === 'csv') {
    if (isZip || isPdf) return { ext, media_type, error: 'mismatch', detail: '.csv bytes are a binary (ZIP/PDF) container' }
    const sample = buf.subarray(0, Math.min(buf.length, 8192))
    if (sample.includes(0x00)) return { ext, media_type, error: 'mismatch', detail: '.csv bytes contain NUL (binary, not text)' }
  }
  return { ext, media_type }
}

/**
 * Deterministic calendar-date extraction from a cell (NO timezone math): accepts
 * ISO `YYYY-MM-DD[...]` and US `M/D/YYYY[ ...]` (the VinSolutions text format).
 * Returns the `YYYY-MM-DD` day, or null when it does not deterministically parse.
 */
export function parseRowDate(raw: string): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?!\d)/)
  if (iso) {
    const m = +iso[2], d = +iso[3]
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    return `${iso[1]}-${iso[2]}-${iso[3]}`
  }
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/)
  if (us) {
    const m = +us[1], d = +us[2]
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    return `${us[3]}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return null
}

type PeriodVerdict =
  | { ok: true; period: HoldPeriod; evidence: Record<string, unknown> }
  | { ok: false; period: HoldPeriod; detail: string; evidence: Record<string, unknown> }

/**
 * Sales Communication daily-period proof (hold-only). The report is DAILY and its
 * Activity Date is per-row text (m/d/y or ISO). Hold ONLY when every relevant data
 * row has a parseable date equal to ONE supplied day. The supplied day comes from
 * period_hint (preferred, may complete missing Filters) or a single-day Filters
 * range. Any missing/unparseable, conflicting, multi-day, or out-of-period row —
 * or no supplied day to verify against — quarantines the whole delivery.
 */
function verifySalesCommDailyPeriod(
  header: Array<string>,
  rows: Array<Array<string>>,
  filtersPeriod: { start: string | null; end: string | null } | null,
  periodHint: string | undefined,
): PeriodVerdict {
  const nil: HoldPeriod = { start: null, end: null }
  const ci = header.findIndex((h) => h.trim().toLowerCase() === 'activity date')
  if (ci < 0) return { ok: false, period: nil, detail: 'Activity Date column not found', evidence: {} }
  if (rows.length === 0) return { ok: false, period: nil, detail: 'no data rows to prove the daily period', evidence: {} }

  const days: Array<string> = []
  let unparseable = 0
  for (const r of rows) {
    const d = parseRowDate(r[ci] ?? '')
    if (!d) unparseable++
    else days.push(d)
  }
  if (unparseable > 0) return { ok: false, period: nil, detail: `${unparseable} of ${rows.length} row(s) have a missing/unparseable Activity Date`, evidence: { unparseable_rows: unparseable, rows_total: rows.length } }
  const distinct = [...new Set(days)].sort()
  if (distinct.length > 1) return { ok: false, period: nil, detail: `rows span ${distinct.length} days (${distinct.join(', ')}); a daily report must be one day`, evidence: { days: distinct } }
  const rowDay = distinct[0]

  const hint = parsePeriodHint(periodHint)
  let supplied: string | null = null
  let source = ''
  if (hint.periodStart) {
    if (hint.periodStart !== hint.periodEnd) return { ok: false, period: nil, detail: `period_hint must be a single day for a daily report; got ${hint.periodStart}/${hint.periodEnd}`, evidence: { rows_day: rowDay } }
    supplied = hint.periodStart
    source = 'period_hint'
  } else if (filtersPeriod?.start) {
    if (filtersPeriod.start !== filtersPeriod.end) return { ok: false, period: nil, detail: `Filters period must be a single day; got ${filtersPeriod.start}/${filtersPeriod.end}`, evidence: { rows_day: rowDay } }
    supplied = filtersPeriod.start
    source = 'filters'
  }
  if (!supplied) return { ok: false, period: nil, detail: 'no supplied daily period (period_hint or single-day Filters range) to verify row Activity Dates against', evidence: { rows_day: rowDay } }
  if (supplied !== rowDay) return { ok: false, period: nil, detail: `row Activity Date day ${rowDay} ≠ supplied period ${supplied}`, evidence: { rows_day: rowDay, supplied } }

  return { ok: true, period: { start: rowDay, end: rowDay }, evidence: { period_source: source, rows_verified: rows.length, day: rowDay } }
}

/**
 * Governed hold-contract registry: exact VinSolutions dealer IDs per supported
 * profile. Appointments (Sheet1, no Filters) must prove tenant isolation against
 * these exact IDs — internal consistency alone is NOT sufficient.
 */
export const PROFILE_DEALER_IDS: Record<string, string> = {
  'serra-honda': '21043',
  'serra-nissan': '21044',
  'tony-serra-ford': '21047',
}
export function governedDealerId(profile: string): string | null {
  return PROFILE_DEALER_IDS[profile] ?? null
}

const colIdx = (header: Array<string>, name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase())

type ApptVerdict =
  | { ok: true; period: HoldPeriod; evidence: Record<string, unknown> }
  | { ok: false; period: HoldPeriod; reason: HoldQuarantineReason; detail: string; evidence: Record<string, unknown> }

/**
 * Appointments hold proof (Sheet1, no Filters). Requires — fail-closed — a valid
 * period_hint; every populated Dealer ID equal to the governed profile ID (blank/
 * wrong/inconsistent quarantines); a populated, unique Appointment ID per row; and
 * every Appointment Start Date AND Start DateTime within the period_hint. (Dealer
 * name match, Appt Reason = Sales Appointment, and Service/Parts row scan are already
 * enforced in evaluateDelivery.)
 */
function verifyAppointments(header: Array<string>, rows: Array<Array<string>>, profile: string, periodHint: string | undefined): ApptVerdict {
  const nil: HoldPeriod = { start: null, end: null }
  const expectedId = governedDealerId(profile)
  if (!expectedId) return { ok: false, period: nil, reason: 'ineligible-profile', detail: `no governed dealer ID registered for profile "${profile}"`, evidence: { profile } }
  const hint = parsePeriodHint(periodHint)
  if (!hint.periodStart || !hint.periodEnd) return { ok: false, period: nil, reason: 'unexpected-period', detail: 'appointments require a valid period_hint (YYYY-MM-DD or YYYY-MM-DD/YYYY-MM-DD)', evidence: {} }

  const idCol = colIdx(header, 'Dealer ID'), apptCol = colIdx(header, 'Appointment ID')
  const sdCol = colIdx(header, 'Appointment Start Date'), sdtCol = colIdx(header, 'Appointment Start DateTime')
  if (idCol < 0 || apptCol < 0 || sdCol < 0) return { ok: false, period: nil, reason: 'unsupported-report', detail: 'missing required Appointment columns (Dealer ID / Appointment ID / Appointment Start Date)', evidence: {} }

  const seen = new Set<string>()
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const did = (r[idCol] ?? '').trim()
    if (!did) return { ok: false, period: nil, reason: 'wrong-dealer', detail: `row ${i} has a blank Dealer ID (governed ${profile} ID ${expectedId} required)`, evidence: { expected: expectedId } }
    if (did !== expectedId) return { ok: false, period: nil, reason: 'wrong-dealer', detail: `row Dealer ID "${did}" ≠ governed ${profile} ID ${expectedId}`, evidence: { rowDealerId: did, expected: expectedId } }
    const aid = (r[apptCol] ?? '').trim()
    if (!aid) return { ok: false, period: nil, reason: 'unsupported-report', detail: `row ${i} has a blank Appointment ID`, evidence: {} }
    if (seen.has(aid)) return { ok: false, period: nil, reason: 'unsupported-report', detail: 'duplicate Appointment ID', evidence: {} }
    seen.add(aid)
    const sd = parseRowDate(r[sdCol] ?? '')
    const sdt = sdtCol >= 0 ? parseRowDate(r[sdtCol] ?? '') : sd
    if (!sd || !sdt) return { ok: false, period: nil, reason: 'unexpected-period', detail: `row ${i} has a missing/unparseable Appointment Start Date/DateTime`, evidence: {} }
    if (sd < hint.periodStart || sd > hint.periodEnd || sdt < hint.periodStart || sdt > hint.periodEnd) {
      return { ok: false, period: nil, reason: 'unexpected-period', detail: `row Appointment date ${sd}/${sdt} outside period ${hint.periodStart}..${hint.periodEnd}`, evidence: {} }
    }
  }
  return { ok: true, period: { start: hint.periodStart, end: hint.periodEnd }, evidence: { appointments_verified: rows.length, governed_dealer_id: expectedId, period_source: 'period_hint' } }
}

type GrossVerdict =
  | { ok: true; period: HoldPeriod; evidence: Record<string, unknown> }
  | { ok: false; period: HoldPeriod; reason: HoldQuarantineReason; detail: string; evidence: Record<string, unknown> }

/**
 * CRM Sales Gross COVERAGE-period proof (Sheet1, no Filters). A weekly Gross export
 * has a coverage window (the scheduled e.g. Mon–Sun period) that is NOT the same as
 * its observed sale dates — a week may have sales only Tue–Fri. So (operator
 * correction 2026-08-25) acceptance uses a TRUSTED coverage window from period_hint
 * and requires every populated Sold Date to fall INSIDE it; it does NOT require the
 * observed min/max to equal the window endpoints. The stored period is the coverage
 * window; the observed date range is recorded as evidence. Fail-closed on a missing
 * coverage hint, a missing Sold Date column, an unparseable date, or any Sold Date
 * outside the coverage window.
 */
function verifyCrmGrossPeriod(header: Array<string>, rows: Array<Array<string>>, periodHint: string | undefined): GrossVerdict {
  const nil: HoldPeriod = { start: null, end: null }
  const hint = parsePeriodHint(periodHint)
  if (!hint.periodStart || !hint.periodEnd) return { ok: false, period: nil, reason: 'unexpected-period', detail: 'CRM Sales Gross requires a coverage period_hint (YYYY-MM-DD/YYYY-MM-DD) — the scheduled window, not the observed sale dates', evidence: {} }
  const ci = colIdx(header, 'Sold Date')
  if (ci < 0) return { ok: false, period: nil, reason: 'unsupported-report', detail: 'Sold Date column not found', evidence: {} }
  if (rows.length === 0) return { ok: false, period: nil, reason: 'unsupported-report', detail: 'no data rows to verify against the coverage period', evidence: {} }
  const days: Array<string> = []
  for (let i = 0; i < rows.length; i++) {
    const d = parseRowDate(rows[i][ci] ?? '')
    if (!d) return { ok: false, period: nil, reason: 'unexpected-period', detail: `row ${i} has a missing/unparseable Sold Date`, evidence: {} }
    if (d < hint.periodStart || d > hint.periodEnd) return { ok: false, period: nil, reason: 'unexpected-period', detail: `row Sold Date ${d} is outside the coverage period ${hint.periodStart}..${hint.periodEnd}`, evidence: { out_of_coverage: d } }
    days.push(d)
  }
  days.sort()
  return { ok: true, period: { start: hint.periodStart, end: hint.periodEnd }, evidence: { period_source: 'period_hint_coverage', observed_date_range: { min: days[0], max: days[days.length - 1] }, rows_verified: rows.length } }
}

/**
 * Land a delivery inertly. Preserves bytes + manifest; NEVER computes a metric,
 * runs the Watchdog, populates a dashboard, evaluates a threshold, notifies, or
 * takes a customer action. Quarantines the whole delivery on wrong dealer,
 * Service/Parts, ambiguity, malformed bytes, missing required metadata, or an
 * unexpected period.
 */
function safeHost(u: string): string | null {
  try { return new URL(u).hostname.toLowerCase() } catch { return null }
}

type ProvenanceCheck = { ok: true } | { ok: false; reason: HoldQuarantineReason; detail: string; evidence: Record<string, unknown> }

/**
 * Provenance union gate (fail-closed). gmail_scheduler (default) still requires
 * Gmail id/sender/subject — backward compatible. browser_export may omit Gmail
 * fields but MUST carry a nonempty capture_id, a source_url on the EXACT
 * VinSolutions app host, and a declared_report_kind (untrusted attribution).
 * Unknown source_type, missing required provenance, or a non-VinSolutions URL
 * fails closed (the caller still preserves the already-decoded bytes).
 */
function validateProvenance(meta: HoldMetadata): ProvenanceCheck {
  const st = meta.source_type ?? 'gmail_scheduler'
  if (st === 'gmail_scheduler') {
    const missing = (['sender', 'subject', 'gmail_message_id'] as const).filter((k) => !String(meta[k] ?? '').trim())
    if (missing.length > 0) return { ok: false, reason: 'missing-required-metadata', detail: `missing required metadata: ${missing.join(', ')}`, evidence: { source_type: st, missing } }
    return { ok: true }
  }
  if (st === 'browser_export') {
    const missing: Array<string> = []
    if (!String(meta.capture_id ?? '').trim()) missing.push('capture_id')
    if (!String(meta.source_url ?? '').trim()) missing.push('source_url')
    if (!String(meta.declared_report_kind ?? '').trim()) missing.push('declared_report_kind')
    if (missing.length > 0) return { ok: false, reason: 'invalid-provenance', detail: `browser_export missing required provenance: ${missing.join(', ')}`, evidence: { source_type: st, missing } }
    const host = safeHost(String(meta.source_url))
    if (host !== VINSOLUTIONS_APP_HOST) return { ok: false, reason: 'invalid-provenance', detail: `source_url host "${host ?? '(unparseable)'}" is not the VinSolutions app host ${VINSOLUTIONS_APP_HOST}`, evidence: { source_type: st, source_url_host: host } }
    return { ok: true }
  }
  return { ok: false, reason: 'invalid-provenance', detail: `unknown source_type "${String(st)}"`, evidence: { source_type: st } }
}

const NIL: HoldPeriod = { start: null, end: null }

function quarantineReceipt(base: BaseManifest, buf: Buffer, kind: HoldReportKind, period: HoldPeriod, reason: HoldQuarantineReason, detail: string, evidence: Record<string, unknown>): HoldReceipt {
  return persist({ ...base, report_kind: kind, period, validation_state: 'quarantined', quarantine_reason: reason, detail, schedule_vulnerability: false, structural_transform: 'none', evidence }, buf, null)
}

function heldReceipt(base: BaseManifest, buf: Buffer, f: { report_kind: HoldReportKind; period: HoldPeriod; schedule_vulnerability: boolean; structural_transform: string; evidence: Record<string, unknown> }, transport: object | null): HoldReceipt {
  return persist({ ...base, report_kind: f.report_kind, period: f.period, validation_state: 'held', quarantine_reason: null, detail: null, schedule_vulnerability: f.schedule_vulnerability, structural_transform: f.structural_transform, transport_stored: !!transport, evidence: f.evidence }, buf, transport)
}

export function landDelivery(buf: Buffer, meta: HoldMetadata, opts: LandOptions): HoldReceipt {
  const sha = sha256hex(buf)
  const fmt = detectFormat(meta.filename, buf)
  const base = baseManifest(meta, opts.profileDealer, sha, buf.length, opts.capturedAt, fmt.ext, fmt.media_type)
  const q = (kind: HoldReportKind, reason: HoldQuarantineReason, detail: string, evidence: Record<string, unknown> = {}) =>
    quarantineReceipt(base, buf, kind, NIL, reason, detail, evidence)

  // 1. provenance union (bytes preserved even when quarantined). declared_report_kind
  //    is stored as attribution only — it is NEVER read by any downstream decision.
  const prov = validateProvenance(meta)
  if (!prov.ok) return q('unknown', prov.reason, prov.detail, prov.evidence)

  // 2. format + extension↔magic-byte MIME check (never silently drop/convert)
  if (fmt.error === 'unsupported') return q('unknown', 'unsupported-format', `unknown/unsupported format for ${meta.filename}: ${fmt.detail}`, { ext: fmt.ext })
  if (fmt.error === 'mismatch') return q('unknown', 'mime-extension-mismatch', fmt.detail ?? 'extension/content mismatch', { ext: fmt.ext, media_type: fmt.media_type })

  // 3. dispatch by verified format
  if (fmt.ext === 'xlsx') return landXlsx(buf, meta, opts, base)
  if (fmt.ext === 'csv') return landCsv(buf, meta, opts, base)
  if (fmt.ext === 'pdf') return landPdf(buf, meta, base)
  return q('unknown', 'unsupported-format', `unhandled format '${fmt.ext}'`, { ext: fmt.ext }) // defensive
}

/** .xlsx — six-family classification/transport (hold-only-2 Sales-Comm daily proof retained). */
function landXlsx(buf: Buffer, meta: HoldMetadata, opts: LandOptions, base: BaseManifest): HoldReceipt {
  const q = (kind: HoldReportKind, period: HoldPeriod, reason: HoldQuarantineReason, detail: string, evidence: Record<string, unknown>) =>
    quarantineReceipt(base, buf, kind, period, reason, detail, evidence)

  let sheets
  try { sheets = readXlsx(buf).sheets } catch (err) { return q('unknown', NIL, 'malformed-workbook', (err as Error).message, { error: (err as Error).message }) }

  const ev = evaluateDelivery(sheets, { profileDealer: opts.profileDealer })
  if (ev.status === 'quarantined') return q(ev.kind ?? 'unknown', NIL, ev.reason, ev.detail, ev.evidence)

  let period: HoldPeriod
  let periodEvidence: Record<string, unknown> = {}
  if (ev.kind === 'sales_comm_log') {
    const v = verifySalesCommDailyPeriod(ev.header, ev.rows, ev.filters?.period ?? null, meta.period_hint ?? undefined)
    if (!v.ok) return q(ev.kind, v.period, 'unexpected-period', v.detail, { ...ev.evidence, ...v.evidence })
    period = v.period
    periodEvidence = v.evidence
  } else if (ev.kind === 'appointments') {
    const v = verifyAppointments(ev.header, ev.rows, meta.profile, meta.period_hint ?? undefined)
    if (!v.ok) return q(ev.kind, v.period, v.reason, v.detail, { ...ev.evidence, ...v.evidence })
    period = v.period
    periodEvidence = v.evidence
  } else if (ev.kind === 'crm_sales_gross') {
    const v = verifyCrmGrossPeriod(ev.header, ev.rows, meta.period_hint ?? undefined)
    if (!v.ok) return q(ev.kind, v.period, v.reason, v.detail, { ...ev.evidence, ...v.evidence })
    period = v.period
    periodEvidence = v.evidence
  } else {
    if (!ev.period.start || !ev.period.end) return q(ev.kind, NIL, 'unexpected-period', 'no deterministic period derivable from workbook', ev.evidence)
    const hint = parsePeriodHint(meta.period_hint ?? undefined)
    if (hint.periodStart && (hint.periodStart !== ev.period.start || hint.periodEnd !== ev.period.end)) return q(ev.kind, ev.period, 'unexpected-period', `period_hint ${hint.periodStart}/${hint.periodEnd} ≠ workbook ${ev.period.start}/${ev.period.end}`, ev.evidence)
    period = ev.period
  }

  const transport = opts.includeTransport
    ? { shape: 'transport-only', note: 'structural passthrough — no business metric computed', kind: ev.kind, dealer: ev.dealer, period, header: ev.header, rows: ev.rows, source_row_count: ev.source_row_count, filters: ev.filters, schedule_vulnerability: ev.schedule_vulnerability }
    : null
  return heldReceipt(base, buf, { report_kind: ev.kind, period, schedule_vulnerability: ev.schedule_vulnerability, structural_transform: 'xlsx-classified', evidence: { ...ev.evidence, ...periodEvidence } }, transport)
}

/**
 * .csv — the two deterministic ROI/KPI layouts do NOT carry enough row-level domain
 * evidence to PROVE Sales-only (KPI has no Lead Type/Intent/Source domain column;
 * ROI Lead_Source alone cannot prove Lead Type exclusions or that generic sources
 * contain no Service rows). So a supported CSV is NEVER held on dealer+period+source-
 * name alone: preserve original bytes + parsed structural evidence and QUARANTINE
 * (no transport). More specific quarantines still fire first (unsupported family/
 * schema, wrong dealer, multi-tenant, Service/Parts-coded rows). An unauthenticated
 * caller attestation is NOT trusted here.
 */
function landCsv(buf: Buffer, meta: HoldMetadata, opts: LandOptions, base: BaseManifest): HoldReceipt {
  const q = (kind: HoldReportKind, reason: HoldQuarantineReason, detail: string, evidence: Record<string, unknown> = {}) =>
    quarantineReceipt(base, buf, kind, NIL, reason, detail, evidence)

  const rows = parseCsv(buf.toString('utf8'))
  const header = (rows[0] ?? []).map((h) => h.trim())
  const kind = detectCsvKind(header)
  if (!kind) return q('unknown', 'unsupported-report', 'CSV headers match no known deterministic family (expected lead_source_roi or kpi_salesperson)', { header_columns: header.slice(0, 64) })

  const data = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ''))
  const { recognized, ignored } = classifyCsvHeaders(kind, header)
  // Parsed structural evidence (preserved on the manifest; NOT a transport payload).
  const structural: Record<string, unknown> = {
    csv_family: kind,
    recognized_column_count: recognized.length,
    ignored_column_count: ignored.length,
    source_row_count: data.length,
    claimed_period_hint: meta.period_hint ?? null,
  }
  if (data.length === 0) return q(kind, 'unsupported-report', 'known CSV family but no data rows to verify tenant', structural)

  const di = header.findIndex((h) => h.toLowerCase() === 'dealer')
  if (di < 0) return q(kind, 'unsupported-report', 'known CSV family but required Dealer column absent — cannot verify tenant', structural)

  // dealer gate (never filter): any mismatch or rows spanning dealers → quarantine whole delivery
  const dealersSeen = new Set<string>()
  for (const r of data) {
    const d = (r[di] ?? '').trim()
    if (!d) continue
    dealersSeen.add(d)
    if (!dealerMatches(opts.profileDealer, d)) return q(kind, 'wrong-dealer', `row dealer "${d}" ≠ target "${opts.profileDealer}"`, { ...structural, rowDealer: d })
  }
  if (dealersSeen.size > 1) return q(kind, 'ambiguous-tenant', `rows span ${dealersSeen.size} dealers`, { ...structural, dealers: [...dealersSeen] })

  // Service/Parts-coded evidence (ROI Lead_Source) → more specific quarantine
  if (kind === 'lead_source_roi') {
    const li = header.findIndex((h) => h.toLowerCase() === 'lead_source')
    if (li >= 0) for (const r of data) if (isServiceParts(r[li])) return q(kind, 'non-sales-lead-type', `Service/Parts-coded Lead_Source "${r[li]}"`, { ...structural, value: r[li] })
  }

  // Superficially clean, but NO deterministic embedded Sales-only filter/domain proof
  // exists in these layouts → preserve + quarantine, no transport, no trusted attestation.
  return q(kind, 'sales-only-unproved', `${kind} CSV carries no embedded deterministic Sales-only filter/domain proof (dealer+period+source-name is insufficient); original bytes and parsed structural evidence preserved, no transport`, structural)
}

/**
 * .pdf — evidence-only. An UNPARSED PDF cannot prove dealer, period, or Sales-only
 * row content, so it is PRESERVED IN QUARANTINE (not held), with NO OCR / transform /
 * transport. Claimed profile/period travel only as untrusted attribution until
 * separate governed evidence proves it.
 */
function landPdf(buf: Buffer, meta: HoldMetadata, base: BaseManifest): HoldReceipt {
  return quarantineReceipt(
    base, buf, 'evidence_pdf', NIL, 'sales-only-unproved',
    'evidence-only PDF: unparsed bytes cannot prove dealer, period, or Sales-only content; preserved untrusted pending separate governed evidence',
    { evidence_only: true, structural_transform: 'none', ocr: false, claimed_profile: meta.profile, claimed_period_hint: meta.period_hint ?? null },
  )
}

function manifestDir(m: HoldManifest): string {
  return m.validation_state === 'held'
    ? path.join(holdRoot(), safe(m.profile), 'held', safe(m.report_kind), `${m.period.start ?? 'na'}_${m.period.end ?? 'na'}`, m.sha256)
    : path.join(holdRoot(), safe(m.profile), 'quarantine', m.sha256)
}

function replayReceipt(dir: string, manifest: HoldManifest): HoldReceipt {
  const tp = path.join(dir, 'transport.json')
  return {
    outcome: 'replay',
    manifest,
    hold_path: dir,
    original_path: path.join(dir, `original.${manifest.file_extension || 'bin'}`),
    manifest_path: path.join(dir, 'manifest.json'),
    transport_path: fs.existsSync(tp) ? tp : null,
  }
}

function persist(manifest: HoldManifest, buf: Buffer, transport: object | null): HoldReceipt {
  // The disposition is authoritative from the CURRENT classification. `manifestDir` is keyed by
  // it: held → held/<kind>/<period>/<sha>, quarantine → quarantine/<sha>. Idempotent replay is
  // therefore eligible ONLY at the current disposition's deterministic path — i.e. an
  // authoritative HELD replay requires the CURRENT classification to itself be held at the SAME
  // family/period/dealer(profile)/hash. When the current classification is QUARANTINE under the
  // newer contract, we return/persist the quarantine and WITHHOLD promotion — we NEVER replay a
  // stale held copy of the same SHA (which is preserved untouched as evidence, and vice-versa).
  const dir = manifestDir(manifest)
  const manifestPath = path.join(dir, 'manifest.json')
  const originalPath = path.join(dir, `original.${manifest.file_extension || 'bin'}`)
  const transportPath = transport ? path.join(dir, 'transport.json') : null

  if (fs.existsSync(manifestPath)) {
    const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as HoldManifest
    return replayReceipt(dir, existing)
  }

  // corrections attribution: sibling checksums already held for this period.
  if (manifest.validation_state === 'held') {
    const periodDir = path.dirname(dir)
    manifest.prior_sha256_in_period = fs.existsSync(periodDir)
      ? fs.readdirSync(periodDir).filter((d) => d !== manifest.sha256 && fs.existsSync(path.join(periodDir, d, 'manifest.json')))
      : []
    // If this same SHA was previously quarantined (e.g. under an earlier parser
    // decision), preserve that manifest untouched and attribute it here so
    // readback can distinguish/prefer this accepted decision.
    const qman = path.join(holdRoot(), safe(manifest.profile), 'quarantine', manifest.sha256, 'manifest.json')
    if (fs.existsSync(qman)) {
      try {
        const q = JSON.parse(fs.readFileSync(qman, 'utf8')) as HoldManifest
        manifest.evidence = { ...manifest.evidence, prior_quarantine: { captured_at: q.captured_at, reason: q.quarantine_reason, transform_version: q.transform_version } }
      } catch { /* leave unattributed if unreadable */ }
    }
  }

  fs.mkdirSync(dir, { recursive: true })
  writeImmutable(originalPath, buf)
  if (transportPath && transport) writeImmutable(transportPath, Buffer.from(JSON.stringify(transport, null, 2)))
  writeImmutable(manifestPath, Buffer.from(JSON.stringify(manifest, null, 2)))
  return { outcome: manifest.validation_state === 'held' ? 'held' : 'quarantined', manifest, hold_path: dir, original_path: originalPath, manifest_path: manifestPath, transport_path: transportPath }
}

// ── readback ────────────────────────────────────────────────────────────

function walkManifests(root: string): Array<HoldManifest> {
  const out: Array<HoldManifest> = []
  const stack = [root]
  while (stack.length) {
    const d = stack.pop()!
    let entries: Array<fs.Dirent>
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (e.name === 'manifest.json') {
        try { out.push(JSON.parse(fs.readFileSync(p, 'utf8')) as HoldManifest) } catch { /* skip unreadable */ }
      }
    }
  }
  return out
}

/**
 * Durable readback of a single receipt by checksum. When the same SHA has both an
 * accepted (held) and an earlier quarantine manifest, PREFER the held one; among
 * same state, prefer the newer transform_version then captured_at.
 */
export function readHeldReceipt(profile: string, sha256: string): HoldManifest | null {
  const root = path.join(holdRoot(), safe(profile))
  if (!fs.existsSync(root)) return null
  const matches = walkManifests(root).filter((m) => m.sha256 === sha256)
  if (matches.length === 0) return null
  matches.sort((a, b) => {
    if (a.validation_state !== b.validation_state) return a.validation_state === 'held' ? -1 : 1
    if (a.transform_version !== b.transform_version) return b.transform_version.localeCompare(a.transform_version)
    return b.captured_at.localeCompare(a.captured_at)
  })
  return matches[0]
}

/** Durable readback of all landed deliveries for a profile. */
export function listHeldDeliveries(
  profile: string,
  opts: { state?: HoldValidationState } = {},
): Array<HoldManifest> {
  const root = path.join(holdRoot(), safe(profile))
  if (!fs.existsSync(root)) return []
  const all = walkManifests(root).sort((a, b) => a.sha256.localeCompare(b.sha256))
  return opts.state ? all.filter((m) => m.validation_state === opts.state) : all
}
