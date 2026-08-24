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
import { parsePeriodHint } from '../ingest-auth'

// hold-only-2: Sales Communication daily-period is proven from row-level Activity
// Date values (text m/d/y or ISO), validated/completed by period_hint — never from
// a workbook whose dates don't deterministically prove the supplied daily period.
export const TRANSFORM_VERSION = 'hold-only-2'

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
export type HoldQuarantineReason =
  | QuarantineReason
  | 'missing-required-metadata'
  | 'unexpected-period'
  | 'ineligible-profile'

export type HoldPeriod = { start: string | null; end: string | null }

/** Delivery metadata that Central MCP supplies alongside the bytes. */
export type HoldMetadata = {
  profile: string
  sender: string
  subject: string
  gmail_message_id: string
  filename: string
  received_at?: string | null
  period_hint?: string | null
}

export type HoldManifest = {
  receipt_id: string
  hold_only: true
  no_action: true
  profile: string
  dealer: string
  report_kind: ReportKind | 'unknown'
  period: HoldPeriod
  sender: string
  subject: string
  gmail_message_id: string
  filename: string
  size_bytes: number
  sha256: string
  received_at: string | null
  captured_at: string
  parser_version: string
  transform_version: string
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

function baseManifest(meta: HoldMetadata, dealer: string, sha: string, size: number, capturedAt: string): Omit<HoldManifest, 'report_kind' | 'period' | 'validation_state' | 'quarantine_reason' | 'detail' | 'schedule_vulnerability' | 'evidence'> {
  return {
    receipt_id: `hold_${sha.slice(0, 16)}`,
    hold_only: true,
    no_action: true,
    profile: meta.profile,
    dealer,
    sender: meta.sender,
    subject: meta.subject,
    gmail_message_id: meta.gmail_message_id,
    filename: meta.filename,
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
 * Land a delivery inertly. Preserves bytes + manifest; NEVER computes a metric,
 * runs the Watchdog, populates a dashboard, evaluates a threshold, notifies, or
 * takes a customer action. Quarantines the whole delivery on wrong dealer,
 * Service/Parts, ambiguity, malformed bytes, missing required metadata, or an
 * unexpected period.
 */
export function landDelivery(buf: Buffer, meta: HoldMetadata, opts: LandOptions): HoldReceipt {
  const sha = sha256hex(buf)
  const base = baseManifest(meta, opts.profileDealer, sha, buf.length, opts.capturedAt)

  const quarantine = (
    kind: ReportKind | 'unknown',
    period: HoldPeriod,
    reason: HoldQuarantineReason,
    detail: string,
    evidence: Record<string, unknown>,
  ): HoldReceipt =>
    persist({ ...base, report_kind: kind, period, validation_state: 'quarantined', quarantine_reason: reason, detail, schedule_vulnerability: false, evidence }, buf, null)

  // 1. required transport metadata
  const missing = (['sender', 'subject', 'gmail_message_id'] as const).filter((k) => !String(meta[k] ?? '').trim())
  if (missing.length > 0) {
    return quarantine('unknown', { start: null, end: null }, 'missing-required-metadata', `missing required metadata: ${missing.join(', ')}`, { missing })
  }

  // 2. parse bytes (fail-closed)
  let sheets
  try {
    sheets = readXlsx(buf).sheets
  } catch (err) {
    return quarantine('unknown', { start: null, end: null }, 'malformed-workbook', (err as Error).message, { error: (err as Error).message })
  }

  // 3. classify + Sales-only quarantine (pure; no metrics)
  const ev = evaluateDelivery(sheets, { profileDealer: opts.profileDealer })
  if (ev.status === 'quarantined') {
    return quarantine(ev.kind ?? 'unknown', { start: null, end: null }, ev.reason, ev.detail, ev.evidence)
  }

  // 4. period must be deterministic. Sales Communication is DAILY with per-row
  //    text Activity Dates → prove the day from rows, validated/completed by the
  //    period_hint. Other families keep the Filters/row-derived period + hint check.
  let period: HoldPeriod
  let periodEvidence: Record<string, unknown> = {}
  if (ev.kind === 'sales_comm_log') {
    const v = verifySalesCommDailyPeriod(ev.header, ev.rows, ev.filters?.period ?? null, meta.period_hint ?? undefined)
    if (!v.ok) return quarantine(ev.kind, v.period, 'unexpected-period', v.detail, { ...ev.evidence, ...v.evidence })
    period = v.period
    periodEvidence = v.evidence
  } else {
    if (!ev.period.start || !ev.period.end) {
      return quarantine(ev.kind, { start: null, end: null }, 'unexpected-period', 'no deterministic period derivable from workbook', ev.evidence)
    }
    const hint = parsePeriodHint(meta.period_hint ?? undefined)
    if (hint.periodStart && (hint.periodStart !== ev.period.start || hint.periodEnd !== ev.period.end)) {
      return quarantine(ev.kind, ev.period, 'unexpected-period', `period_hint ${hint.periodStart}/${hint.periodEnd} ≠ workbook ${ev.period.start}/${ev.period.end}`, ev.evidence)
    }
    period = ev.period
  }

  // 5. HELD — optional structural transport payload (NO business metrics).
  const transport = opts.includeTransport
    ? {
        shape: 'transport-only',
        note: 'structural passthrough — no business metric computed',
        kind: ev.kind,
        dealer: ev.dealer,
        period,
        header: ev.header,
        rows: ev.rows,
        source_row_count: ev.source_row_count,
        filters: ev.filters,
        schedule_vulnerability: ev.schedule_vulnerability,
      }
    : null

  return persist(
    { ...base, report_kind: ev.kind, period, validation_state: 'held', quarantine_reason: null, detail: null, schedule_vulnerability: ev.schedule_vulnerability, transport_stored: !!transport, evidence: { ...ev.evidence, ...periodEvidence } },
    buf,
    transport,
  )
}

function manifestDir(m: HoldManifest): string {
  return m.validation_state === 'held'
    ? path.join(holdRoot(), safe(m.profile), 'held', safe(m.report_kind), `${m.period.start}_${m.period.end}`, m.sha256)
    : path.join(holdRoot(), safe(m.profile), 'quarantine', m.sha256)
}

function persist(manifest: HoldManifest, buf: Buffer, transport: object | null): HoldReceipt {
  const dir = manifestDir(manifest)
  const manifestPath = path.join(dir, 'manifest.json')
  const originalPath = path.join(dir, 'original.xlsx')
  const transportPath = transport ? path.join(dir, 'transport.json') : null

  // idempotent replay: identical bytes → same deterministic path → no-op.
  if (fs.existsSync(manifestPath)) {
    const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as HoldManifest
    const tp = path.join(dir, 'transport.json')
    return { outcome: 'replay', manifest: existing, hold_path: dir, original_path: originalPath, manifest_path: manifestPath, transport_path: fs.existsSync(tp) ? tp : null }
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
