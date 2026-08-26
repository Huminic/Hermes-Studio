/**
 * DEV-only, isolated consumer: promote ONE reconcile-ACCEPTED Response Times bundle into a
 * separate dev analytical store (InfoStore) as an IMMUTABLE per-profile readback, with full
 * provenance and idempotent replay.
 *
 * Reads the dry-run bundle + its independent readback verdict READ-ONLY. Writes ONLY an isolated
 * DEV_ANALYTICS_ROOT (never the hold volume, never the dry-run volume, never a production brain
 * root). No listener/route/scheduler/notification/customer action.
 *
 * Fail-closed preconditions (verified BEFORE any write; any mismatch aborts/withholds):
 *  - explicit, absolute, non-production analyticsRoot, distinct + non-nested vs the dry-run root;
 *  - captureId is a safe exact basename (no traversal / separators / control);
 *  - readback verdict === 'accepted' AND readback.profile === input.profile (exact, no fallback);
 *  - manifest schema_version / derivative_version / validation.state are the exact expected values;
 *  - manifest rooftop.profile === input.profile AND rooftop.vin_dealer_id === governed id;
 *  - manifest source.capture_id === input.captureId (exact, no fallback);
 *  - coverage.timezone === America/New_York;
 *  - on-disk derivative re-hashes to manifest.derivative.sha256 AND readback computed.derivative_sha256;
 *  - parsed derivative data-row count === coverage.accepted_rows === readback computed.derivative_rows;
 *  - every metric source column is present; any NON-BLANK non-numeric response time ABORTS.
 *
 * Metric units (real-data corrected): responseTimeActual / responseTimeAdjusted are EXCEL-DAY
 * elapsed values → minutes = value * 1440. responseTimeTarget is CATEGORICAL (Target 1 / Target 2 /
 * Missed / No Contact) — reported as exact category counts; NO within-target claim (undefined by
 * contract). Metrics are null/withheld when their source is unavailable.
 *
 * Evidence integrity: a corrected computation is an ATTRIBUTABLE REVISION — a prior readback of the
 * same bytes under an older analytics schema is archived under superseded/ (never overwritten) and
 * linked via provenance.supersedes.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

export type RtPromoteInput = { dryRunRoot: string; analyticsRoot: string; profile: string; captureId: string }
export class RtPromoteAbort extends Error {}

const GOVERNED: Record<string, string> = { 'serra-honda': '21043', 'serra-nissan': '21044', 'tony-serra-ford': '21047' }
const DERIV_MANIFEST_SCHEMA = 'huminic.vinsolutions.response_times_derivative_manifest.v1'
const DERIV_VERSION = 'huminic.vinsolutions.response_times.canonical.v1'
const VALIDATION_STATE = 'ready_for_isolated_dev'
const ANALYTICS_SCHEMA = 'huminic.vinsolutions.response_times.analytics_readback.v2'
const MIN_PER_DAY = 1440
const TARGET_CATEGORIES = ['Target 1', 'Target 2', 'Missed', 'No Contact'] as const
const SAFE_CAPTURE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const METRIC_COLS = ['responseTimeActual', 'responseTimeAdjusted', 'responseTimeTarget', 'soldDateUtc', 'appointmentUtc', 'unansweredCommunication.taskAgeInDays'] as const

const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_')
const sha256hex = (buf: Buffer) => createHash('sha256').update(buf).digest('hex')
const round2 = (n: number) => Math.round(n * 100) / 100

function assertRoots(dryRunRoot: string, analyticsRoot: string): void {
  for (const [n, v] of [['DRY_RUN_ROOT', dryRunRoot], ['DEV_ANALYTICS_ROOT', analyticsRoot]] as const) {
    if (!v || !v.trim()) throw new RtPromoteAbort(`${n} must be explicitly set`)
    if (!path.isAbsolute(v)) throw new RtPromoteAbort(`${n} must be an absolute path (got "${v}")`)
  }
  const d = path.resolve(dryRunRoot), a = path.resolve(analyticsRoot)
  if (d === a) throw new RtPromoteAbort('DEV_ANALYTICS_ROOT must not equal the dry-run root')
  const nested = (x: string, y: string) => { const r = path.relative(x, y); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)) }
  if (nested(d, a) || nested(a, d)) throw new RtPromoteAbort('DEV_ANALYTICS_ROOT and the dry-run root must not be nested')
  for (const m of [path.join(os.homedir(), '.hermes', 'profiles'), '/root/.hermes/profiles', '/root/.hermes']) {
    const mr = path.resolve(m)
    if (a === mr || a.startsWith(mr + path.sep)) throw new RtPromoteAbort(`DEV_ANALYTICS_ROOT must not be a production brain root (${m})`)
  }
}

/** Minimal RFC4180 CSV parse (quoted fields + embedded commas/quotes/newlines). */
export function parseCsv(text: string): Array<Array<string>> {
  const rows: Array<Array<string>> = []
  let row: Array<string> = [], field = '', q = false
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) { if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* skip */ }
    else field += c
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''))
}

function mean(xs: Array<number>): number | null { return xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null }
function median(xs: Array<number>): number | null { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? round2(s[m]!) : round2((s[m - 1]! + s[m]!) / 2) }

/** Excel-day elapsed → minutes, aborting on a non-blank non-numeric value (never silently null). */
function dayColToMinutes(rows: Array<Array<string>>, header: Array<string>, colName: string): Array<number> {
  const i = header.indexOf(colName)
  const out: Array<number> = []
  for (const r of rows) {
    const v = (r[i] ?? '').trim()
    if (v === '') continue
    const n = Number(v)
    if (!Number.isFinite(n)) throw new RtPromoteAbort(`malformed numeric in ${colName}: "${v}"`)
    out.push(n * MIN_PER_DAY)
  }
  return out
}

function computeMetrics(rows: Array<Array<string>>): Record<string, unknown> {
  const header = rows[0]!
  const missing = METRIC_COLS.filter((c) => header.indexOf(c) < 0)
  if (missing.length) throw new RtPromoteAbort(`derivative missing required metric columns: ${missing.join(', ')}`)
  const data = rows.slice(1)
  const nonBlank = (name: string) => { const i = header.indexOf(name); return data.filter((r) => (r[i] ?? '').trim() !== '').length }

  const actualMin = dayColToMinutes(data, header, 'responseTimeActual')
  const adjustedMin = dayColToMinutes(data, header, 'responseTimeAdjusted')

  const it = header.indexOf('responseTimeTarget')
  const targetCounts: Record<string, number> = { 'Target 1': 0, 'Target 2': 0, 'Missed': 0, 'No Contact': 0, other: 0 }
  let targetCategorized = 0
  for (const r of data) {
    const t = (r[it] ?? '').trim()
    if (t === '') continue
    targetCategorized++
    if ((TARGET_CATEGORIES as ReadonlyArray<string>).includes(t)) targetCounts[t]! += 1
    else targetCounts.other! += 1
  }
  const pct = (n: number) => targetCategorized ? round2((n / targetCategorized) * 100) : null

  return {
    leads_total: data.length,
    responded: actualMin.length,
    response_time_actual_avg_min: mean(actualMin),
    response_time_actual_median_min: median(actualMin),
    response_time_adjusted_responded: adjustedMin.length,
    response_time_adjusted_avg_min: mean(adjustedMin),
    response_time_adjusted_median_min: median(adjustedMin),
    target_categorized: targetCategorized,
    target_category_counts: targetCounts,
    target_category_pct: { 'Target 1': pct(targetCounts['Target 1']!), 'Target 2': pct(targetCounts['Target 2']!), 'Missed': pct(targetCounts['Missed']!), 'No Contact': pct(targetCounts['No Contact']!), other: pct(targetCounts.other!) },
    sold_count: nonBlank('soldDateUtc'),
    appointment_count: nonBlank('appointmentUtc'),
    unanswered_count: nonBlank('unansweredCommunication.taskAgeInDays'),
  }
}

export type RtPromoteResult = { outcome: 'promoted' | 'revised' | 'duplicate'; profile: string; period: { start: string; end: string }; metrics: Record<string, unknown>; provenance: Record<string, unknown>; readback_path: string }

export function promoteResponseTimesToAnalytics(input: RtPromoteInput): RtPromoteResult {
  assertRoots(input.dryRunRoot, input.analyticsRoot)
  const gov = GOVERNED[input.profile]
  if (!gov) throw new RtPromoteAbort(`profile ${input.profile} is not a governed Sales profile`)
  if (!SAFE_CAPTURE.test(input.captureId) || path.basename(input.captureId) !== input.captureId) throw new RtPromoteAbort(`unsafe captureId "${input.captureId}"`)

  // 1. readback verdict (independent reconcile) — accepted, bound to this profile (no fallback)
  const rbPath = path.join(input.dryRunRoot, 'readback', safe(input.profile), `${input.captureId}.readback.json`)
  if (!fs.existsSync(rbPath)) throw new RtPromoteAbort(`no readback for ${input.profile}/${input.captureId}`)
  const rb = JSON.parse(fs.readFileSync(rbPath, 'utf8')) as Record<string, any>
  if (rb.verdict !== 'accepted') throw new RtPromoteAbort(`readback verdict is ${rb.verdict} (not accepted) — withheld`)
  if (String(rb.profile) !== input.profile) throw new RtPromoteAbort(`readback profile ${rb.profile} != ${input.profile}`)

  // 2. manifest (read-only) — exact schema/version/state + rooftop/source bindings (no fallback)
  const capDir = path.join(input.dryRunRoot, 'inbound', safe(input.profile), input.captureId)
  const manPath = path.join(capDir, 'manifest.v1.json')
  if (!fs.existsSync(manPath)) throw new RtPromoteAbort(`no manifest for ${input.profile}/${input.captureId}`)
  const man = JSON.parse(fs.readFileSync(manPath, 'utf8')) as Record<string, any>
  const rooftop = man.rooftop ?? {}, coverage = man.coverage ?? {}, der = man.derivative ?? {}, source = man.source ?? {}, val = man.validation ?? {}
  if (String(man.schema_version) !== DERIV_MANIFEST_SCHEMA) throw new RtPromoteAbort('unexpected schema_version')
  if (String(man.derivative_version) !== DERIV_VERSION) throw new RtPromoteAbort('unexpected derivative_version')
  if (String(val.state) !== VALIDATION_STATE) throw new RtPromoteAbort(`validation.state != ${VALIDATION_STATE}`)
  if (String(rooftop.profile) !== input.profile) throw new RtPromoteAbort(`rooftop.profile ${rooftop.profile} != ${input.profile}`)
  if (String(rooftop.vin_dealer_id ?? '') !== gov) throw new RtPromoteAbort(`rooftop.vin_dealer_id ${rooftop.vin_dealer_id} != governed ${gov}`)
  if (String(source.capture_id) !== input.captureId) throw new RtPromoteAbort(`source.capture_id ${source.capture_id} != ${input.captureId}`)
  if (String(coverage.timezone ?? '') !== 'America/New_York') throw new RtPromoteAbort('coverage.timezone != America/New_York')

  // 3. derivative bytes re-hash == manifest == readback computed
  const derFile = String(der.filename ?? 'response-times-canonical-v1.csv')
  if (!SAFE_CAPTURE.test(derFile.replace(/\.[A-Za-z0-9]+$/, '')) && !/^[A-Za-z0-9][A-Za-z0-9._-]*\.csv$/.test(derFile)) throw new RtPromoteAbort(`unsafe derivative filename "${derFile}"`)
  const derBuf = fs.readFileSync(path.join(capDir, derFile))
  const derSha = sha256hex(derBuf)
  if (derSha !== String(der.sha256 ?? '').toLowerCase()) throw new RtPromoteAbort('derivative sha256 != manifest binding')
  if (derSha !== String(rb.computed?.derivative_sha256 ?? '').toLowerCase()) throw new RtPromoteAbort('derivative sha256 != readback computed')

  // 4. row-count binding: parsed data rows === coverage.accepted_rows === readback derivative_rows
  const parsed = parseCsv(derBuf.toString('utf8'))
  const dataRows = parsed.length - 1
  if (dataRows !== Number(coverage.accepted_rows)) throw new RtPromoteAbort(`parsed rows ${dataRows} != coverage.accepted_rows ${coverage.accepted_rows}`)
  if (dataRows !== Number(rb.computed?.derivative_rows)) throw new RtPromoteAbort(`parsed rows ${dataRows} != readback derivative_rows ${rb.computed?.derivative_rows}`)

  const period = { start: String(coverage.start), end: String(coverage.end) }
  const metrics = computeMetrics(parsed)
  const provenance: Record<string, unknown> = {
    analytics_schema: ANALYTICS_SCHEMA,
    profile: input.profile, vin_dealer_id: gov, rooftop_name: rooftop.name ?? null,
    capture_id: input.captureId, source_capture_id: String(source.capture_id),
    raw_sha256: String(rb.computed?.raw_sha256 ?? ''), derivative_sha256: derSha,
    metric_units: { response_time: 'minutes (excel-day * 1440)', target: 'categorical (Target 1|Target 2|Missed|No Contact)' },
    coverage: { start: period.start, end: period.end, timezone: 'America/New_York', total_rows: coverage.total_rows ?? null, accepted_rows: coverage.accepted_rows ?? null, excluded_out_of_window: coverage.excluded_out_of_window ?? null, reconciles: coverage.reconciles === true },
    readback_verdict: 'accepted', promoted_from: rbPath,
  }

  // 5. immutable, idempotent write — with attributable revision (never overwrite evidence)
  const outDir = path.join(input.analyticsRoot, safe(input.profile), 'response-times', `${period.start}_${period.end}`)
  const outPath = path.join(outDir, 'readback.json')
  fs.mkdirSync(outDir, { recursive: true }); fs.chmodSync(outDir, 0o755)

  if (fs.existsSync(outPath)) {
    const existingRaw = fs.readFileSync(outPath, 'utf8')
    const existing = JSON.parse(existingRaw) as Record<string, any>
    const exSha = String(existing.provenance?.derivative_sha256 ?? '')
    // legacy provisional readbacks used provenance.schema; resolve it for explicit attribution.
    const exSchema = String(existing.provenance?.analytics_schema ?? existing.provenance?.schema ?? '(none)')
    if (exSha !== derSha) throw new RtPromoteAbort(`conflict: existing readback for ${input.profile} ${period.start}_${period.end} has a different derivative sha`)
    if (exSchema === ANALYTICS_SCHEMA) return { outcome: 'duplicate', profile: input.profile, period, metrics, provenance, readback_path: outPath }
    // same bytes, older analytics schema → attributable corrected revision. NEVER delete evidence.
    // Archive the prior readback content-addressed (collision-free + injective vs schema-name
    // sanitization). If it is already archived it MUST be byte-identical (verify, fail closed).
    const supDir = path.join(outDir, 'superseded'); fs.mkdirSync(supDir, { recursive: true }); fs.chmodSync(supDir, 0o755)
    const archivedSha = sha256hex(Buffer.from(existingRaw, 'utf8'))
    const archived = path.join(supDir, `${archivedSha}.readback.json`)
    if (fs.existsSync(archived)) {
      if (fs.readFileSync(archived, 'utf8') !== existingRaw) throw new RtPromoteAbort(`superseded archive content mismatch at ${archived}`)
      // prior evidence already preserved; the redundant current pointer is atomically REPLACED (not deleted) below.
    } else {
      fs.renameSync(outPath, archived) // move prior evidence into the archive (bytes preserved)
      fs.chmodSync(archived, 0o444)    // archived evidence is immutable regardless of the prior pointer's mode
    }
    provenance.supersedes = { analytics_schema: exSchema, derivative_sha256: exSha, archived_sha256: archivedSha, archived_path: path.relative(input.analyticsRoot, archived) }
    writeImmutable(outPath, JSON.stringify({ provenance, metrics }, null, 2)) // rename atomically replaces any redundant pointer
    return { outcome: 'revised', profile: input.profile, period, metrics, provenance, readback_path: outPath }
  }
  writeImmutable(outPath, JSON.stringify({ provenance, metrics }, null, 2))
  return { outcome: 'promoted', profile: input.profile, period, metrics, provenance, readback_path: outPath }
}

function writeImmutable(outPath: string, body: string): void {
  const tmp = outPath + `.tmp-${process.pid}-${process.hrtime.bigint()}`
  fs.writeFileSync(tmp, body); fs.chmodSync(tmp, 0o444); fs.renameSync(tmp, outPath)
}
