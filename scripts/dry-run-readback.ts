/**
 * Dry-run readback + reconciliation (Response Times, isolated dev). Independently
 * re-verifies ONE Codex delivery (raw.csv + derivative.csv + v1 manifest) against the
 * browser-extension contract. Read-only on the delivery; never mutates it.
 *
 *   pnpm tsx scripts/dry-run-readback.ts <deliveryDir>
 *
 * The RAW is authoritative evidence; the derivative is analytical input — so every claim
 * is re-derived from the raw, and every derivative row is bound to the capture:
 *  - EXACT 64-char sha equality on raw + derivative; derivative→raw checksum binding.
 *  - real producer manifest shape (rooftop.vin_dealer_id, coverage.timezone,
 *    source.capture_id/source_url, schema_version) → governed dealer, VinSolutions host, tz.
 *  - derivative: all required-core + per-row provenance columns present; NO customer/rep
 *    names nor assignedUserName; Sales-only.
 *  - per-derivative-row provenance: capture_profile / vin_dealer_id / source_capture_id /
 *    source_raw_sha256 each equal the governed profile / dealer / manifest capture / REAL raw sha.
 *  - RAW Sales-only scanned INDEPENDENTLY (a sanitized derivative cannot hide a Service raw row).
 *  - every DERIVATIVE row's activityDateTimeUtc independently recomputed in-window (NY-local).
 *  - accepted-identity multiset (lead.id, activityDateTimeUtc, multiplicity) raw-in-window == derivative.
 *  - excluded-event multiset (lead.id, activityDateTimeUtc, recomputed local date, reason) raw == manifest.
 *  - independent total/accepted/excluded counts; no blank identities.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { parseCsv } from '../src/server/ingest/csv-contracts'

const GOVERNED: Record<string, string> = { 'serra-honda': '21043', 'serra-nissan': '21044', 'tony-serra-ford': '21047' }
const VIN_HOST = 'vinsolutions.app.coxautoinc.com'
const SERVICE_PARTS = /\b(service|parts)\b/i
const HEX64 = /^[0-9a-f]{64}$/
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

const REQUIRED_CORE = [
  'activityDateTimeUtc', 'lead.id', 'lead.leadTypeName', 'lead.leadStatusTypeName', 'customer.id',
  'responseTimeActual', 'responseTimeAdjusted', 'responseTimeTarget',
  'unansweredCommunication.taskDueDateUtc', 'unansweredCommunication.taskAgeInDays', 'unansweredCommunication.type',
  'appointmentStatus', 'soldDateUtc', 'customerFirstContactedUtc', 'appointmentUtc', 'visitStartTimeUtc', 'visitDurationInMinutes',
]
const PROVENANCE_COLS = ['capture_profile', 'vin_dealer_id', 'source_capture_id', 'source_raw_sha256']
const PII_FORBIDDEN = ['customer.firstName', 'customer.lastName', 'customer.salesRepresentative.firstName', 'customer.salesRepresentative.lastName', 'unansweredCommunication.assignedUserName']
const SALES_ONLY_SCAN = ['lead.leadTypeName', 'lead.leadStatusTypeName', 'lead.leadStatusName', 'lead.leadSourceName', 'appointmentStatus', 'unansweredCommunication.type', 'unansweredCommunication.userGroupName']

function nyDate(iso: string): string | null {
  const t = Date.parse((iso ?? '').trim())
  if (Number.isNaN(t)) return null
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t))
  const y = p.find((x) => x.type === 'year')?.value, m = p.find((x) => x.type === 'month')?.value, d = p.find((x) => x.type === 'day')?.value
  return y && m && d ? `${y}-${m}-${d}` : null
}
/** UTC ISO → ISO-8601 wall time in America/New_York WITH numeric offset: YYYY-MM-DDTHH:mm:ss±HH:MM. */
function nyDateTime(iso: string): string | null {
  const t = Date.parse((iso ?? '').trim())
  if (Number.isNaN(t)) return null
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'longOffset' }).formatToParts(new Date(t))
  const g = (k: string) => p.find((x) => x.type === k)?.value ?? ''
  let hh = g('hour'); if (hh === '24') hh = '00'
  const off = (p.find((x) => x.type === 'timeZoneName')?.value ?? '').match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/)
  const sign = off ? off[1] : '+', oh = off ? off[2].padStart(2, '0') : '00', om = off && off[3] ? off[3] : '00'
  return `${g('year')}-${g('month')}-${g('day')}T${hh}:${g('minute')}:${g('second')}${sign}${oh}:${om}`
}
const multisetEq = (a: Array<string>, b: Array<string>) => { if (a.length !== b.length) return false; const A = [...a].sort(), B = [...b].sort(); return A.every((v, i) => v === B[i]) }

type Check = { name: string; ok: boolean; detail: string }
const dir = process.argv[2]
if (!dir || !fs.existsSync(dir)) { console.error('usage: tsx scripts/dry-run-readback.ts <deliveryDir>'); process.exit(2) }
const checks: Array<Check> = []
const add = (name: string, ok: boolean, detail: string) => { checks.push({ name, ok, detail }) }

// ── manifest (real producer v1 shape) ──
const manPath = ['manifest.v1.json', 'manifest.json'].map((f) => path.join(dir, f)).find(fs.existsSync)
let man: Record<string, any> = {}
if (!manPath) add('manifest', false, 'no manifest.v1.json/manifest.json')
else { try { man = JSON.parse(fs.readFileSync(manPath, 'utf8')); add('manifest', true, path.basename(manPath)) } catch (e) { add('manifest', false, `unparseable: ${(e as Error).message}`) } }
const rooftop = man.rooftop ?? {}, source = man.source ?? {}, cov = man.coverage ?? {}, der = man.derivative ?? {}, capture = man.capture ?? {}
const profile = String(rooftop.profile ?? man.profile ?? '')
const covStart = String(cov.start ?? cov.period_start ?? ''), covEnd = String(cov.end ?? cov.period_end ?? '')
const tz = String(cov.timezone ?? cov.tz ?? '')
const govId = GOVERNED[profile]
const capId = String(source.capture_id ?? capture.capture_id ?? '')
const rawFilename = String(source.raw_filename ?? 'raw.csv'), derFilename = String(der.filename ?? 'derivative.csv')
const rawShaManifest = String(source.raw_sha256 ?? '').toLowerCase(), derShaManifest = String(der.sha256 ?? '').toLowerCase()
const mTotal = Number(cov.total_rows ?? NaN), mAccepted = Number(cov.accepted_rows ?? NaN), mExcludedN = Number(cov.excluded_out_of_window ?? NaN)
const mExcludedRows: Array<any> = Array.isArray(cov.excluded_rows) ? cov.excluded_rows : []

add('schema_version present', !!String(man.schema_version ?? '').trim(), String(man.schema_version ?? '(none)'))
add('coverage.timezone=America/New_York', tz === 'America/New_York', tz || '(none)')
add('rooftop profile governed', !!govId, profile || '(none)')
add('rooftop.vin_dealer_id == governed', !!govId && String(rooftop.vin_dealer_id ?? rooftop.dealer_id ?? '') === govId, `manifest ${rooftop.vin_dealer_id ?? '(none)'} vs governed ${govId ?? '?'}`)
add('capture_id present', !!capId.trim(), capId || '(none)')
let capHost: string | null = null
try { capHost = new URL(String(source.source_url ?? source.final_url ?? capture.source_url ?? '')).hostname.toLowerCase() } catch { capHost = null }
add('source host == VinSolutions app', capHost === VIN_HOST, capHost ?? '(unparseable)')

// ── files + EXACT sha + binding ──
const rawBuf = fs.existsSync(path.join(dir, rawFilename)) ? fs.readFileSync(path.join(dir, rawFilename)) : null
const derBuf = fs.existsSync(path.join(dir, derFilename)) ? fs.readFileSync(path.join(dir, derFilename)) : null
const rawSha = rawBuf ? sha256(rawBuf) : null, derSha = derBuf ? sha256(derBuf) : null
add('raw present', !!rawBuf, rawFilename); add('derivative present', !!derBuf, derFilename)
add('raw sha256 (exact 64)', !!rawSha && HEX64.test(rawShaManifest) && rawSha === rawShaManifest, `computed ${rawSha?.slice(0, 12) ?? '—'}… vs manifest ${rawShaManifest.slice(0, 12) || '—'}…`)
add('derivative sha256 (exact 64)', !!derSha && HEX64.test(derShaManifest) && derSha === derShaManifest, `computed ${derSha?.slice(0, 12) ?? '—'}… vs manifest ${derShaManifest.slice(0, 12) || '—'}…`)
add('derivative↔raw checksum binding', !!rawSha && rawSha === rawShaManifest, 'manifest.source.raw_sha256 must equal the real raw sha256')

// ── DERIVATIVE parse: headers + PII + per-row provenance + Sales-only + per-row in-window + accepted identities ──
const dRows = derBuf ? parseCsv(derBuf.toString('utf8')) : []
const dHead = (dRows[0] ?? []).map((h) => h.trim()); const dData = dRows.slice(1)
const dIdx = (n: string) => dHead.findIndex((h) => h.toLowerCase() === n.toLowerCase())
const dHas = (n: string) => dIdx(n) >= 0
const missingCore = [...REQUIRED_CORE, ...PROVENANCE_COLS].filter((c) => !dHas(c))
add('required-core + provenance headers', missingCore.length === 0, missingCore.length ? `missing: ${missingCore.join(', ')}` : `all present`)
add('PII-minimized', PII_FORBIDDEN.filter(dHas).length === 0, PII_FORBIDDEN.filter(dHas).join(', ') || 'no customer/rep names, no assignedUserName')
// per-row provenance binding
const cp = dIdx('capture_profile'), vd = dIdx('vin_dealer_id'), sc = dIdx('source_capture_id'), sr = dIdx('source_raw_sha256')
let provBad = 0
for (const r of dData) {
  if (cp < 0 || vd < 0 || sc < 0 || sr < 0) { provBad = dData.length; break }
  if ((r[cp] ?? '').trim() !== profile || (r[vd] ?? '').trim() !== (govId ?? '\0') || (r[sc] ?? '').trim() !== capId || (r[sr] ?? '').trim().toLowerCase() !== rawShaManifest) provBad++
}
add('every derivative row bound to capture (profile/dealer/capture/raw-sha)', provBad === 0, `${provBad} row(s) with mismatched per-row provenance`)
// Sales-only (derivative)
const dScan = SALES_ONLY_SCAN.map(dIdx).filter((i) => i >= 0)
let dSvc = 0; for (const r of dData) for (const c of dScan) if (SERVICE_PARTS.test(r[c] ?? '')) { dSvc++; break }
add('Sales-only (derivative)', dSvc === 0, dSvc ? `${dSvc} Service/Parts-coded derivative row(s)` : 'clean')
// per-derivative-row local date recompute + accepted identity tuples (lead.id|activityDateTimeUtc)
const dAdt = dIdx('activityDateTimeUtc'), dLid = dIdx('lead.id')
let dOut = 0, dUnparsed = 0; const dAccept: Array<string> = []
for (const r of dData) {
  const utc = dAdt >= 0 ? (r[dAdt] ?? '').trim() : ''
  const d = nyDate(utc)
  if (!d) { dUnparsed++; continue }
  if (!(covStart && covEnd && d >= covStart && d <= covEnd)) dOut++
  dAccept.push(`${dLid >= 0 ? (r[dLid] ?? '').trim() : ''}|${utc}`)
}
add('every derivative row in-window (recomputed)', dOut === 0 && dUnparsed === 0, `derivative out-of-window ${dOut}, unparseable ${dUnparsed}`)

// ── RAW parse: total / in-window / out-of-window + accepted & excluded identities + INDEPENDENT Sales-only ──
let rTotal = 0, rIn = 0, rOut = 0, rUnparsed = 0, rExclBlank = 0, rSvc = 0
const rAccept: Array<string> = [], rExcl: Array<string> = []
if (rawBuf) {
  const rr = parseCsv(rawBuf.toString('utf8')); const rh = (rr[0] ?? []).map((h) => h.trim()); const rd = rr.slice(1)
  const rIdx = (n: string) => rh.findIndex((h) => h.toLowerCase() === n.toLowerCase())
  const rAdt = rIdx('activityDateTimeUtc'), rLid = rIdx('lead.id')
  const rScan = SALES_ONLY_SCAN.map(rIdx).filter((i) => i >= 0)
  rTotal = rd.length
  for (const r of rd) {
    for (const c of rScan) if (SERVICE_PARTS.test(r[c] ?? '')) { rSvc++; break }
    const utc = rAdt >= 0 ? (r[rAdt] ?? '').trim() : ''
    const id = rLid >= 0 ? (r[rLid] ?? '').trim() : ''
    const d = nyDate(utc)
    if (!d) { rUnparsed++; continue }
    if (covStart && covEnd && d >= covStart && d <= covEnd) { rIn++; rAccept.push(`${id}|${utc}`) }
    else { rOut++; if (!id || !utc) rExclBlank++; rExcl.push(`${id}|${utc}|${d}|out-of-coverage`) }
  }
}
add('Sales-only (RAW — authoritative)', rSvc === 0, rSvc ? `${rSvc} Service/Parts-coded RAW row(s) (a sanitized derivative cannot hide this)` : 'clean')

// ── structural + per-accepted-row native-field comparison (raw is authoritative) ──
const declaredHeaders: Array<string> = Array.isArray(der.headers) ? der.headers.map((h: any) => String(h)) : []
add('derivative headers == manifest.derivative.headers (order, no extras)', declaredHeaders.length > 0 && declaredHeaders.length === dHead.length && declaredHeaders.every((h, i) => h === dHead[i]), declaredHeaders.length ? `declared ${declaredHeaders.length} cols vs actual ${dHead.length}` : 'manifest.derivative.headers not declared')
add('derivative row widths sane', dData.every((r) => r.length === dHead.length), 'every derivative row width == header width')
if (rawBuf) {
  const rr = parseCsv(rawBuf.toString('utf8')); const rh = (rr[0] ?? []).map((h) => h.trim()); const rd = rr.slice(1)
  const rHas = (n: string) => rh.some((h) => h.toLowerCase() === n.toLowerCase())
  const rIdx = (n: string) => rh.findIndex((h) => h.toLowerCase() === n.toLowerCase())
  add('RAW required-core headers', REQUIRED_CORE.every(rHas), REQUIRED_CORE.filter((c) => !rHas(c)).join(', ') || 'all present')
  add('raw row widths sane', rd.every((r) => r.length === rh.length), 'every raw row width == header width')
  add('raw columns == manifest raw_columns', source.raw_columns == null || Number(source.raw_columns) === rh.length, `declared ${source.raw_columns ?? '(n/d)'} vs actual ${rh.length}`)
  const rAdt2 = rIdx('activityDateTimeUtc')
  // Comparable native columns = derivative cols present in the raw, MINUS declared provenance +
  // declared additive-local columns. Compares EVERY retained native field (not only required-core).
  const localFields: Array<any> = Array.isArray(der.local_fields) ? der.local_fields : []
  const localCols = new Set(localFields.map((f) => String(f.local_col ?? f.column ?? '').toLowerCase()))
  const exclude = new Set([...PROVENANCE_COLS.map((s) => s.toLowerCase()), ...localCols])
  const shared = dHead.filter((h) => rHas(h) && !exclude.has(h.toLowerCase()))
  add('comparable native columns present', shared.length >= REQUIRED_CORE.length, `${shared.length} shared native columns`)
  // collision-safe encoding: JSON-array serialization (no in-data delimiter can forge a match)
  const enc = (row: Array<string>, idxOf: (n: string) => number) => JSON.stringify(shared.map((c) => (row[idxOf(c)] ?? '').trim()))
  // FULL retained-field tuple multiset (all shared cols) — duplicate-safe: two differing raw
  // duplicates cannot be replaced by two copies of one row.
  const tupRaw: Array<string> = []
  for (const r of rd) { const utc = (r[rAdt2] ?? '').trim(); const d = nyDate(utc); if (d && covStart && covEnd && d >= covStart && d <= covEnd) tupRaw.push(enc(r, rIdx)) }
  const tupDer: Array<string> = []; let blankKey = 0
  for (const dr of dData) { const id = dLid >= 0 ? (dr[dLid] ?? '').trim() : ''; const utc = dAdt >= 0 ? (dr[dAdt] ?? '').trim() : ''; if (!id || !utc) blankKey++; tupDer.push(enc(dr, dIdx)) }
  add('accepted rows: FULL retained-field multiset raw==derivative (all shared cols + multiplicity)', multisetEq(tupRaw, tupDer), `raw ${tupRaw.length} vs derivative ${tupDer.length} tuples`)
  add('no blank accepted identities', blankKey === 0, `${blankKey} blank accepted identity(ies)`)
  // Additive local fields: recompute each declared local column from its UTC source. 'date' →
  // YYYY-MM-DD; 'datetime' → ISO-8601 NY offset. Unknown kind, missing column, or an undeclared
  // local-looking column ALL FAIL (never a silent pass).
  let localBad = 0
  const declaredLocal = new Set(localFields.map((f) => String(f.local_col ?? f.column ?? '').toLowerCase()))
  for (const f of localFields) {
    const li = dIdx(String(f.local_col ?? f.column ?? '')), ui = dIdx(String(f.utc_col ?? f.source_utc ?? '')), kind = String(f.kind ?? '')
    if (li < 0 || ui < 0) { localBad++; continue }
    const recompute = kind === 'date' ? nyDate : kind === 'datetime' ? nyDateTime : null
    if (!recompute) { localBad++; continue } // unknown/undeclared kind FAILS
    for (const dr of dData) {
      const utc = (dr[ui] ?? '').trim(), local = (dr[li] ?? '').trim()
      if (utc === '') { if (local !== '') localBad++ } // blank UTC MUST have a blank local
      else { const want = recompute(utc); if (want === null || local !== want) localBad++ } // malformed UTC fails; else exact
    }
  }
  const undeclaredLocal = dHead.filter((h) => /local$/i.test(h) && !declaredLocal.has(h.toLowerCase()))
  add('every additive local field declared + recomputed', localBad === 0 && undeclaredLocal.length === 0, `${localBad} recompute/kind failure(s); undeclared local col(s): [${undeclaredLocal.join(', ')}]`)
}
// manifest count / byte reconciliation vs the actual files (reconcile-if-declared)
add('manifest raw rows == actual', cov.total_rows == null || Number(cov.total_rows) === rTotal, `declared ${cov.total_rows} vs actual ${rTotal}`)
add('manifest derivative rows == actual', der.rows == null || Number(der.rows) === dData.length, `declared ${der.rows} vs actual ${dData.length}`)
add('manifest derivative columns == actual', der.columns == null || Number(der.columns) === dHead.length, `declared ${der.columns} vs actual ${dHead.length}`)
add('manifest byte counts == actual', (source.raw_bytes == null || Number(source.raw_bytes) === (rawBuf?.length ?? -1)) && (der.bytes == null || Number(der.bytes) === (derBuf?.length ?? -1)), `raw ${source.raw_bytes ?? '(n/d)'}/${rawBuf?.length}, der ${der.bytes ?? '(n/d)'}/${derBuf?.length}`)

// manifest excluded → canonical tuples (must equal MY recomputed local date + reason)
let mExclBlank = 0
const mExcl = mExcludedRows.map((e) => {
  const id = String(e.lead_id ?? e['lead.id'] ?? '').trim(), utc = String(e.activityDateTimeUtc ?? '').trim()
  const ld = String(e.computed_local_date ?? e.local_date ?? '').trim(), reason = String(e.reason ?? '').trim()
  if (!id || !utc) mExclBlank++
  return `${id}|${utc}|${ld}|${reason}`
})

// ── independent reconciliation ──
add('raw total == manifest total', rTotal === mTotal, `raw ${rTotal} vs manifest ${mTotal}`)
add('raw in-window == manifest accepted == derivative rows', rIn === mAccepted && rIn === dData.length && rUnparsed === 0, `raw in ${rIn}, manifest accepted ${mAccepted}, derivative rows ${dData.length}, raw-unparseable ${rUnparsed}`)
add('accepted-identity multiset raw-in-window == derivative (lead.id,utc)', multisetEq(rAccept, dAccept), `raw {${rAccept.join(' ; ')}} vs derivative {${dAccept.join(' ; ')}}`)
add('raw out-of-window == manifest excluded', rOut === mExcludedN, `raw out ${rOut} vs manifest ${mExcludedN}`)
add('no blank/unparseable excluded identities', rExclBlank === 0 && mExclBlank === 0, `raw blanks ${rExclBlank}, manifest blanks ${mExclBlank}`)
add('excluded-event multiset (id,utc,localDate,reason)', multisetEq(rExcl, mExcl), `raw {${rExcl.join(' ; ')}} vs manifest {${mExcl.join(' ; ')}}`)
add('counts reconcile (independent)', rTotal === rIn + rOut && mTotal === mAccepted + mExcludedN, `raw ${rTotal}=${rIn}+${rOut}; manifest ${mTotal}=${mAccepted}+${mExcludedN}`)

// ── verdict ──
const failed = checks.filter((c) => !c.ok)
const verdict = failed.length === 0 ? 'accepted' : 'quarantined'
const out = {
  verdict, profile, capture_dir: path.basename(dir),
  coverage: { start: covStart, end: covEnd, timezone: tz || null },
  computed: { raw_sha256: rawSha, derivative_sha256: derSha, raw_total: rTotal, raw_in_window: rIn, raw_out_of_window: rOut, derivative_rows: dData.length, accepted_identities: rAccept, excluded_events: rExcl },
  manifest: { total: mTotal, accepted: mAccepted, excluded_out_of_window: mExcludedN, excluded_events: mExcl },
  checks, failed_reasons: failed.map((c) => `${c.name}: ${c.detail}`),
}
const rbDir = path.join('/srv/ingest-dev/dry-run/readback', profile || 'unknown')
fs.mkdirSync(rbDir, { recursive: true })
const rbPath = path.join(rbDir, `${path.basename(dir)}.readback.json`)
fs.writeFileSync(rbPath, JSON.stringify(out, null, 2))
console.log(`[${verdict.toUpperCase()}] ${profile}/${path.basename(dir)} — ${failed.length ? failed.map((c) => c.name).join(', ') : 'all checks pass'}`)
console.log(`  readback: ${rbPath}`)
process.exit(verdict === 'accepted' ? 0 : 1)
