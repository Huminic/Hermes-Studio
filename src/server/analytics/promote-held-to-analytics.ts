/**
 * Dev-only, isolated consumer: promote ONE immutable held delivery into a separate
 * dev analytical store and calculate the Semantic Watchdog metrics for a period.
 *
 * This CROSSES the hold_only/no_action boundary on purpose and is therefore kept
 * strictly separate from the hold layer: it reads the hold **read-only**, writes an
 * **isolated** dev analytical store (never the hold volume, never a production brain
 * root), and takes no listener/route/scheduler/notification/customer action.
 *
 * Hard preconditions (all verified BEFORE any analytical write; any mismatch aborts):
 *  - explicit INGEST_HOLD_ROOT + a DISTINCT explicit DEV_ANALYTICS_ROOT; no overlap,
 *    no production default;
 *  - the named held SHA exists with manifest validation_state=held, hold_only=true,
 *    no_action=true, and matching profile / dealer / report_kind / period / checksum;
 *  - the on-disk original bytes re-hash to the checksum;
 *  - re-running readXlsx + evaluateDelivery yields an ACCEPTED (Sales-only) delivery
 *    of the same kind — a Service/Parts/quarantine result aborts before any write.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { readXlsx } from '../ingest/xlsx-reader'
import { evaluateDelivery, type ReportKind } from '../ingest/vin-contracts'
import { recordDelivery, type DeliveryInput } from '../ingest/ingest-delivery-store'
import { runVinWatchdog, type WatchdogRun } from '../watchdog/vin-metrics'

export type PromoteInput = {
  holdRoot: string
  analyticsRoot: string
  profile: string
  sha256: string
  profileDealer: string
  period: { start: string; end: string }
}

export type PromoteResult = {
  outcome: 'promoted' | 'duplicate'
  profile: string
  report_kind: ReportKind
  period: { start: string; end: string }
  delivery_id: string
  accepted_rows: number
  metrics: WatchdogRun
  evidence: {
    hold_root: string
    analytics_root: string
    analytics_db: string
    source_sha256: string
    receipt_id: string
    original_bytes_verified: boolean
  }
}

export class PromoteAbort extends Error {}

const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_')
const sha256hex = (buf: Buffer) => createHash('sha256').update(buf).digest('hex')

const SUPPORTED_KINDS: ReadonlyArray<ReportKind> = ['lead_source_roi', 'cage_kpi', 'sales_comm_log', 'crm_sales_gross', 'appointments', 'dealership_performance']

/** Fail-closed root validation: explicit, absolute, non-overlapping, non-production. */
function assertRoots(holdRoot: string, analyticsRoot: string): void {
  for (const [name, v] of [['INGEST_HOLD_ROOT', holdRoot], ['DEV_ANALYTICS_ROOT', analyticsRoot]] as const) {
    if (!v || !v.trim()) throw new PromoteAbort(`${name} must be explicitly set`)
    if (!path.isAbsolute(v)) throw new PromoteAbort(`${name} must be an absolute path (got "${v}")`)
  }
  const h = path.resolve(holdRoot)
  const a = path.resolve(analyticsRoot)
  if (h === a) throw new PromoteAbort('DEV_ANALYTICS_ROOT must not equal INGEST_HOLD_ROOT')
  const nested = (x: string, y: string) => { const r = path.relative(x, y); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)) }
  if (nested(h, a) || nested(a, h)) throw new PromoteAbort('DEV_ANALYTICS_ROOT and INGEST_HOLD_ROOT must not be nested')
  const prodDefaults = [path.join(os.homedir(), '.hermes', 'profiles'), '/root/.hermes/profiles', '/root/.hermes']
  for (const m of prodDefaults) {
    const mr = path.resolve(m)
    if (a === mr || a.startsWith(mr + path.sep)) throw new PromoteAbort(`DEV_ANALYTICS_ROOT must not be a production brain root (${m})`)
  }
}

type HeldManifest = {
  receipt_id: string
  hold_only: boolean
  no_action: boolean
  profile: string
  dealer: string
  report_kind: string
  period: { start: string | null; end: string | null }
  sha256: string
  parser_version: string
  file_extension: string
  filename: string
  validation_state: string
}

/**
 * Read-only search restricted to the profile's HELD namespace only, under
 * `<holdRoot>/<profile>/held/` (recursively). The quarantine namespace is NEVER
 * searched, so a preserved prior quarantine of the same SHA can never be selected.
 * Returns all matches (sorted, deterministic); the caller fails closed on zero or
 * multiple.
 */
function findHeldDirs(holdRoot: string, profile: string, sha256: string): Array<string> {
  const root = path.join(holdRoot, safe(profile), 'held')
  if (!fs.existsSync(root)) return []
  const out: Array<string> = []
  const stack = [root]
  while (stack.length) {
    const d = stack.pop()!
    let entries: Array<fs.Dirent>
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const p = path.join(d, e.name)
      if (e.name === sha256 && fs.existsSync(path.join(p, 'manifest.json'))) out.push(p) // leaf; do not descend
      else stack.push(p)
    }
  }
  return out.sort()
}

export function promoteHeldToAnalytics(input: PromoteInput): PromoteResult {
  // 1. roots (fail-closed, before touching anything)
  assertRoots(input.holdRoot, input.analyticsRoot)

  // 2. locate + read the held manifest (HELD namespace only; fail closed on 0 or >1)
  const dirs = findHeldDirs(input.holdRoot, input.profile, input.sha256)
  if (dirs.length === 0) throw new PromoteAbort(`no held delivery ${input.sha256} for profile ${input.profile} under ${input.holdRoot}/${safe(input.profile)}/held (quarantine namespace is never promoted)`)
  if (dirs.length > 1) throw new PromoteAbort(`ambiguous: ${dirs.length} held manifests for ${input.sha256} — refusing`)
  const dir = dirs[0]
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as HeldManifest

  // 3. verify the hold contract + identity fields
  if (manifest.validation_state !== 'held') throw new PromoteAbort(`refusing: validation_state=${manifest.validation_state} (not held)`)
  if (manifest.hold_only !== true || manifest.no_action !== true) throw new PromoteAbort('refusing: manifest is not hold_only/no_action')
  if (manifest.profile !== input.profile) throw new PromoteAbort(`profile mismatch: manifest ${manifest.profile} ≠ ${input.profile}`)
  if (manifest.dealer !== input.profileDealer) throw new PromoteAbort(`dealer mismatch: manifest "${manifest.dealer}" ≠ "${input.profileDealer}"`)
  if (!SUPPORTED_KINDS.includes(manifest.report_kind as ReportKind)) throw new PromoteAbort(`unsupported report_kind ${manifest.report_kind}`)
  if (manifest.sha256 !== input.sha256) throw new PromoteAbort('sha256 mismatch between manifest and request')
  if (manifest.period.start !== input.period.start || manifest.period.end !== input.period.end) {
    throw new PromoteAbort(`period mismatch: manifest ${manifest.period.start}/${manifest.period.end} ≠ ${input.period.start}/${input.period.end}`)
  }

  // 4. read the immutable original bytes read-only + verify checksum
  const originalPath = path.join(dir, `original.${manifest.file_extension || 'xlsx'}`)
  const buf = fs.readFileSync(originalPath)
  const actual = sha256hex(buf)
  if (actual !== manifest.sha256) throw new PromoteAbort(`original bytes checksum ${actual} ≠ manifest ${manifest.sha256}`)

  // 5. re-run the pure classifier — Sales-only re-verification. Any quarantine aborts.
  let sheets
  try { sheets = readXlsx(buf).sheets } catch (err) { throw new PromoteAbort(`re-parse failed: ${(err as Error).message}`) }
  const ev = evaluateDelivery(sheets, { profileDealer: input.profileDealer })
  if (ev.status !== 'accepted') throw new PromoteAbort(`re-evaluation quarantined (${ev.reason}: ${ev.detail}) — not promoting`)
  if (ev.kind !== manifest.report_kind) throw new PromoteAbort(`re-evaluation kind ${ev.kind} ≠ manifest ${manifest.report_kind}`)

  // ---- all preconditions satisfied; ONLY NOW do we write the isolated store ----
  const perProfileRoot = path.join(input.analyticsRoot, safe(input.profile))
  const analyticsDb = path.join(perProfileRoot, 'brain', 'brain.db')
  const prevEnv = process.env.BRAIN_PROFILES_ROOT
  process.env.BRAIN_PROFILES_ROOT = input.analyticsRoot
  try {
    const now = Date.now()
    const deliveryInput: DeliveryInput = {
      profile: input.profile,
      dealer: input.profileDealer,
      report_kind: ev.kind,
      period_start: input.period.start,
      period_end: input.period.end,
      source_filename: manifest.filename,
      source_filter_metadata: ev.filters?.raw ?? null,
      final_filter_metadata: ev.filters ? { dealers: ev.filters.dealers, leadTypes: ev.filters.leadTypes, leadIntents: ev.filters.leadIntents } : null,
      checksum: manifest.sha256,
      parser_version: manifest.parser_version,
      source_row_count: ev.source_row_count,
      accepted_row_count: ev.accepted_row_count,
      header: ev.header,
      validation_evidence: { promoted_from_hold: manifest.receipt_id, ...ev.evidence },
      status: 'accepted',
      quarantine_reason: null,
    }
    const rec = recordDelivery(deliveryInput, ev.rows, now)
    const metrics = runVinWatchdog(input.profile, { period_start: input.period.start, period_end: input.period.end, dealer: input.profileDealer })
    return {
      outcome: rec.outcome === 'duplicate' ? 'duplicate' : 'promoted',
      profile: input.profile,
      report_kind: ev.kind,
      period: { start: input.period.start, end: input.period.end },
      delivery_id: rec.id,
      accepted_rows: rec.accepted_rows,
      metrics,
      evidence: {
        hold_root: path.resolve(input.holdRoot),
        analytics_root: path.resolve(input.analyticsRoot),
        analytics_db: analyticsDb,
        source_sha256: manifest.sha256,
        receipt_id: manifest.receipt_id,
        original_bytes_verified: true,
      },
    }
  } finally {
    if (prevEnv === undefined) delete process.env.BRAIN_PROFILES_ROOT
    else process.env.BRAIN_PROFILES_ROOT = prevEnv
  }
}
