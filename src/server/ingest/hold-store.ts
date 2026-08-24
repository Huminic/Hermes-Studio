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

export const TRANSFORM_VERSION = 'hold-only-1'

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

  // 4. period must be deterministic + match the hint when supplied
  if (!ev.period.start || !ev.period.end) {
    return quarantine(ev.kind, { start: null, end: null }, 'unexpected-period', 'no deterministic period derivable from workbook', ev.evidence)
  }
  const hint = parsePeriodHint(meta.period_hint ?? undefined)
  if (hint.periodStart && (hint.periodStart !== ev.period.start || hint.periodEnd !== ev.period.end)) {
    return quarantine(ev.kind, ev.period, 'unexpected-period', `period_hint ${hint.periodStart}/${hint.periodEnd} ≠ workbook ${ev.period.start}/${ev.period.end}`, ev.evidence)
  }

  // 5. HELD — optional structural transport payload (NO business metrics).
  const transport = opts.includeTransport
    ? {
        shape: 'transport-only',
        note: 'structural passthrough — no business metric computed',
        kind: ev.kind,
        dealer: ev.dealer,
        period: ev.period,
        header: ev.header,
        rows: ev.rows,
        source_row_count: ev.source_row_count,
        filters: ev.filters,
        schedule_vulnerability: ev.schedule_vulnerability,
      }
    : null

  return persist(
    { ...base, report_kind: ev.kind, period: ev.period, validation_state: 'held', quarantine_reason: null, detail: null, schedule_vulnerability: ev.schedule_vulnerability, transport_stored: !!transport, evidence: ev.evidence },
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

/** Durable readback of a single receipt by checksum. */
export function readHeldReceipt(profile: string, sha256: string): HoldManifest | null {
  const root = path.join(holdRoot(), safe(profile))
  if (!fs.existsSync(root)) return null
  return walkManifests(root).find((m) => m.sha256 === sha256) ?? null
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
