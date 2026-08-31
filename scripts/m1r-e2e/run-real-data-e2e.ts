/**
 * M1R real-data E2E runner (DEV-ONLY, NON-PROMOTING, ISOLATED).
 *
 * Drives the EXACT 18 real VinSolutions workbooks through the closest honest dev pipeline:
 *
 *   real bytes ──▶ hs-ingest-dev landDelivery() ──▶ held | quarantined
 *                     (governed hold gate)              │
 *      strict families (held) ──▶ promoteHeldToAnalytics() ──▶ runVinWatchdog() ──▶ isolated brain.db
 *                                     │                                                    │
 *                                     └────────────▶ this repo's strict readers ◀──────────┘
 *      quarantined families ──▶ provisional non-promoting adapter (directional preview)
 *                                     │
 *   all lanes ──▶ 18-cell machine-readable receipt ──▶ 3 polished Halo preview cards
 *
 * ISOLATION / SAFETY (hard):
 *   - Executes hs-ingest-dev's OWN functions READ-ONLY against isolated TEMP roots
 *     (INGEST_HOLD_ROOT + DEV_ANALYTICS_ROOT under os.tmpdir()). It never touches the
 *     production/dev /srv store, never starts a server, never needs a secret, never
 *     modifies the hs-ingest-dev repo.
 *   - The three quarantined families (ROI/CAGE/Sales-Comm) are NEVER promoted; strict M1
 *     readiness stays false.
 *   - Reads the real workbook bytes from the git-ignored local fixtures only.
 *
 * Run: node_modules/.bin/tsx scripts/m1r-e2e/run-real-data-e2e.ts
 * Env: HS_INGEST_DEV_ROOT (default /home/ubuntu/hs-ingest-dev),
 *      PROVISIONAL_FIXTURES_DIR (default .local-fixtures/vin18-20260830),
 *      E2E_NOW (default 2026-08-31), E2E_KEEP_TMP=1 to retain temp roots.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

import {
  MANIFEST,
  STRICT_FAMILIES,
  PROVISIONAL_FAMILIES,
  DEALER_NAMES,
  DEALER_IDS,
  WEEKLY_PERIOD,
  periodHintFor,
  periodHintString,
  buildStrictCell,
  buildProvisionalCell,
  buildCrossFamilyReconciliation,
  summarize,
  type E2ECell,
  type FamilySlug,
  type HoldOutcome,
  type PromoteOutcome,
  type StrictReaderView,
  type ProvisionalView,
  type IdentityBinding,
} from '../../src/server/reports/e2e/real-data-e2e'
import { buildHaloPreviewCard, buildExternalCard, renderHaloPreviewHtml } from '../../src/server/reports/e2e/halo-preview-card'
import {
  readProvisionalFamilyFile,
  type ProvisionalFamily,
} from '../../src/server/reports/provisional/provisional-adapter'

// ── config ────────────────────────────────────────────────────────────────
const HS_INGEST_DEV = process.env.HS_INGEST_DEV_ROOT ?? '/home/ubuntu/hs-ingest-dev'
const FIXTURES = path.resolve(process.env.PROVISIONAL_FIXTURES_DIR ?? '.local-fixtures/vin18-20260830')
// Pinned DATA-cycle reference day (governs period_hint + the dev-test capture clock) — NOT the
// execution time. The real wall-clock execution time is recorded separately as `executed_at`.
const DATA_REFERENCE_DAY = process.env.E2E_NOW ?? '2026-08-31'
const NOW_DAY = DATA_REFERENCE_DAY
const KEEP_TMP = process.env.E2E_KEEP_TMP === '1'
const OUT_DIR = path.resolve(process.env.E2E_OUT_DIR ?? 'docs/halo/evidence/m1r/e2e')
const CARDS_DIR = path.join(OUT_DIR, 'cards')
const IDENTITY_MANIFEST = path.resolve('docs/halo/contract/vin18-source-identity.json')
// Isolated temp roots are created per-run via fs.mkdtempSync(os.tmpdir()/m1r-e2e-XXXX) in main()
// — never a fixed predictable path, so there is no recursive delete of a guessable location.
let TMP_BASE = ''
let HOLD_ROOT = ''
let ANALYTICS_ROOT = ''

const PROVENANCE_DISCLOSURE =
  'dev-test provenance metadata: workbook BYTES + SHA-256 are the EXACT real VinSolutions files; only the Gmail transport fields (sender/subject/gmail_message_id) are dev-test placeholders so the governed hold gate can run'

// ── cross-repo bridge (the sanctioned Option A seam) ────────────────────────
type LandReceipt = {
  outcome: 'held' | 'quarantined' | 'replay'
  manifest: {
    receipt_id: string
    report_kind: string
    period: { start: string | null; end: string | null }
    validation_state: 'held' | 'quarantined'
    quarantine_reason: string | null
    detail: string | null
    dealer: string
  }
  hold_path: string
}
type HoldStoreMod = {
  landDelivery: (buf: Buffer, meta: Record<string, unknown>, opts: { profileDealer: string; capturedAt: string; includeTransport?: boolean }) => LandReceipt
}
type PromoteMod = {
  promoteHeldToAnalytics: (input: {
    holdRoot: string
    analyticsRoot: string
    profile: string
    sha256: string
    profileDealer: string
    period: { start: string; end: string }
  }) => { outcome: 'promoted' | 'duplicate'; delivery_id: string; accepted_rows: number; metrics: Record<string, unknown>; evidence: { analytics_db: string } }
  PromoteAbort: new (m: string) => Error
}
// this repo's strict readers (read the isolated brain.db via BRAIN_PROFILES_ROOT)
type NativeMod = {
  readAppointments: (profile: string) => any
  readDealershipPerformance: (profile: string) => any
  readCrmSalesGross: (profile: string) => any
}

async function loadBridges() {
  const imp = (rel: string) => import(pathToFileURL(path.join(HS_INGEST_DEV, rel)).href)
  const holdStore = (await imp('src/server/ingest/hold-store.ts')) as HoldStoreMod
  const promote = (await imp('src/server/analytics/promote-held-to-analytics.ts')) as PromoteMod
  const native = (await import(
    pathToFileURL(path.resolve('src/server/ingest-native-metrics.ts')).href
  )) as NativeMod
  return { holdStore, promote, native }
}

// ── helpers ─────────────────────────────────────────────────────────────────
const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex')

const EXPECTED_CONSUMER_HEAD_PREFIX = '4c41df11d'
/** Consumer modules dynamically imported from hs-ingest-dev — pinned by content hash. */
const CONSUMER_FILES = [
  'src/server/ingest/hold-store.ts',
  'src/server/ingest/vin-contracts.ts',
  'src/server/ingest/xlsx-reader.ts',
  'src/server/analytics/promote-held-to-analytics.ts',
  'src/server/watchdog/vin-metrics.ts',
]
type ConsumerPin = {
  root: string
  head: string
  expected_head_prefix: string
  head_matches_expected: boolean
  branch: string
  dirty_file_count: number
  dirty_files: string[]
  dirty_status_digest: string
  dirty_touches_consumer: boolean
  consumer_file_sha256: Record<string, string>
  missing_consumer_files: string[]
  /** blocking reasons — a non-empty list is a fail-before-hold lineage condition. */
  fatal_reasons: string[]
}
/**
 * Pin the EXACT mutable hs-ingest-dev consumer the runner dynamically imports: git HEAD, branch,
 * a digest of the dirty status, and the SHA-256 of each imported module (content hash pins the
 * exact bytes executed regardless of git state) — required for reproducible proof.
 *
 * SAFETY: git is invoked via execFileSync with an argument array (never string interpolation), so
 * a configurable HS_INGEST_DEV is not a shell-injection surface.
 */
function pinConsumer(): ConsumerPin {
  const git = (args: string[]) => execFileSync('git', ['-C', HS_INGEST_DEV, ...args], { encoding: 'utf8' })
  let head = '', branch = '', porcelain = ''
  try { head = git(['rev-parse', 'HEAD']).trim(); branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim(); porcelain = git(['status', '--porcelain']) } catch { /* record what we can */ }
  const dirtyLines = porcelain.split('\n').filter((l) => l.trim())
  const consumer_file_sha256: Record<string, string> = {}
  const missing_consumer_files: string[] = []
  for (const rel of CONSUMER_FILES) {
    try { consumer_file_sha256[rel] = sha256(fs.readFileSync(path.join(HS_INGEST_DEV, rel))) } catch { consumer_file_sha256[rel] = 'MISSING'; missing_consumer_files.push(rel) }
  }
  const head_matches_expected = head.startsWith(EXPECTED_CONSUMER_HEAD_PREFIX)
  const dirty_touches_consumer = dirtyLines.some((l) => CONSUMER_FILES.some((f) => l.includes(f)))
  const fatal_reasons: string[] = []
  if (missing_consumer_files.length) fatal_reasons.push(`missing consumer module(s): ${missing_consumer_files.join(', ')}`)
  if (!head_matches_expected) fatal_reasons.push(`consumer HEAD ${head || '(unknown)'} does not match expected ${EXPECTED_CONSUMER_HEAD_PREFIX}…`)
  if (dirty_touches_consumer) fatal_reasons.push('an uncommitted change touches a pinned consumer module (unreproducible lineage)')
  return {
    root: HS_INGEST_DEV, head, expected_head_prefix: EXPECTED_CONSUMER_HEAD_PREFIX, head_matches_expected, branch,
    dirty_file_count: dirtyLines.length, dirty_files: dirtyLines, dirty_status_digest: sha256(Buffer.from(porcelain)),
    dirty_touches_consumer, consumer_file_sha256, missing_consumer_files, fatal_reasons,
  }
}

type IdentityRecord = { filename: string; sha256: string; size_bytes: number; ledger_status: string; family_slug?: string; dealer_id?: string }
/** Load the committed aggregate-only expected identity (filename → hash/size/status). */
function loadIdentityManifest(): { meta: Record<string, unknown>; byName: Map<string, IdentityRecord> } {
  const raw = JSON.parse(fs.readFileSync(IDENTITY_MANIFEST, 'utf8')) as { files: IdentityRecord[] } & Record<string, unknown>
  const byName = new Map<string, IdentityRecord>()
  for (const f of raw.files) byName.set(f.filename, f)
  return { meta: raw, byName }
}

function rmrf(p: string) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}

/** Dev-test transport envelope. The FILE bytes are real; only these fields are placeholders. */
function holdMeta(profile: string, family: FamilySlug, filename: string, sha12: string) {
  return {
    profile,
    filename,
    source_type: 'gmail_scheduler',
    sender: 'dev-test-e2e@local.invalid',
    subject: `[dev-test] ${family} ${profile} real-data E2E`,
    gmail_message_id: `dev-test-${family}-${sha12}`,
    received_at: `${NOW_DAY}T12:00:00Z`,
    // daily comm MUST be a single date, not a degenerate range.
    period_hint: periodHintString(family),
  }
}

function strictReaderView(family: FamilySlug, native: NativeMod, profile: string): StrictReaderView {
  if (family === 'appointments') {
    const r = native.readAppointments(profile)
    if (!r.available) return { available: false, reason: r.reason, reader: 'readAppointments', acceptedRows: null, metrics: {}, withheld: [] }
    const metrics: Record<string, number | null> = {
      'appt.total': r.total, 'appt.show': r.show, 'appt.no_show': r.noShow,
      'appt.confirmed': r.confirmed, 'appt.completed': r.completed,
      'appt.cancelled': r.cancelled, 'appt.rescheduled': r.rescheduled,
    }
    return { available: true, reader: 'readAppointments', acceptedRows: r.provenance.acceptedRows, metrics, withheld: withheldKeys(metrics) }
  }
  if (family === 'dealership_performance') {
    const r = native.readDealershipPerformance(profile)
    if (!r.available) return { available: false, reason: r.reason, reader: 'readDealershipPerformance', acceptedRows: null, metrics: {}, withheld: [] }
    const s = r.summary
    const metrics: Record<string, number | null> = {
      'dp.leads': s.leads, 'dp.appts_set': s.apptsSet, 'dp.appts_show': s.apptsShow,
      'dp.sold_in_period': s.soldInPeriod, 'dp.total_gross': s.totalGross, 'dp.avg_total_gross': s.avgTotalGross,
    }
    return { available: true, reader: 'readDealershipPerformance', acceptedRows: r.provenance.acceptedRows, metrics, withheld: withheldKeys(metrics) }
  }
  // crm_sales_gross
  const r = native.readCrmSalesGross(profile)
  if (!r.available) return { available: false, reason: r.reason, reader: 'readCrmSalesGross', acceptedRows: null, metrics: {}, withheld: [] }
  const metrics: Record<string, number | null> = {
    'gross.row_count': r.rowCount, 'gross.total_sum': r.totalSum,
    'gross.front_sum': r.frontSum, 'gross.back_sum': r.backSum,
    'gross.reconciliation_mismatches': r.reconciliationMismatches,
  }
  return { available: true, reader: 'readCrmSalesGross', acceptedRows: r.provenance.acceptedRows, metrics, withheld: withheldKeys(metrics) }
}
const withheldKeys = (m: Record<string, number | null>) => Object.entries(m).filter(([, v]) => v === null).map(([k]) => k)

function provisionalView(family: FamilySlug, filePath: string, profile: string): ProvisionalView {
  const r = readProvisionalFamilyFile(filePath, family as ProvisionalFamily, profile)
  if (!r.available) {
    return { available: false, reason: r.reason, rowsObserved: null, serviceRowsExcluded: null, reconciliation: { checked: false, reconciles: null, detail: r.reason }, metrics: [] }
  }
  return {
    available: true,
    rowsObserved: r.rowsObserved,
    serviceRowsExcluded: r.serviceRowsExcluded,
    reconciliation: r.reconciliation,
    componentReconciliations: r.componentReconciliations,
    metrics: r.metrics.map((m) => ({ id: m.id, value: m.value })),
  }
}

function dataThroughLabel(): string {
  return `Week of ${WEEKLY_PERIOD.start} – ${WEEKLY_PERIOD.end} · as of ${NOW_DAY}`
}

const _require = createRequire(import.meta.url)
/**
 * Open each per-profile brain.db in the isolated analytics root and prove ZERO deliveries and
 * ZERO analytical rows exist for any provisional report_kind — the hard non-promotion assertion.
 */
function assertNoProvisionalRows(analyticsRoot: string): {
  passed: boolean
  per_profile: Array<{ profile: string; db_exists: boolean; provisional_deliveries: number; provisional_rows: number; strict_deliveries: number }>
} {
  const Database = _require('better-sqlite3')
  const provList = PROVISIONAL_FAMILIES as ReadonlyArray<string>
  const placeholders = provList.map(() => '?').join(',')
  const per_profile = ['serra-honda', 'serra-nissan', 'tony-serra-ford'].map((profile) => {
    const dbPath = path.join(analyticsRoot, profile, 'brain', 'brain.db')
    if (!fs.existsSync(dbPath)) return { profile, db_exists: false, provisional_deliveries: 0, provisional_rows: 0, strict_deliveries: 0 }
    const db = new Database(dbPath, { readonly: true, fileMustExist: true })
    try {
      const pd = db.prepare(`SELECT COUNT(*) c FROM ingest_delivery WHERE report_kind IN (${placeholders})`).get(...provList) as { c: number }
      const pr = db.prepare(`SELECT COUNT(*) c FROM ingest_row r JOIN ingest_delivery d ON r.delivery_id = d.id WHERE d.report_kind IN (${placeholders})`).get(...provList) as { c: number }
      const sd = db.prepare(`SELECT COUNT(*) c FROM ingest_delivery WHERE report_kind NOT IN (${placeholders})`).get(...provList) as { c: number }
      return { profile, db_exists: true, provisional_deliveries: pd.c, provisional_rows: pr.c, strict_deliveries: sd.c }
    } finally {
      db.close()
    }
  })
  const passed = per_profile.every((p) => p.provisional_deliveries === 0 && p.provisional_rows === 0)
  return { passed, per_profile }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(FIXTURES)) {
    console.error(`FIXTURES ABSENT: ${FIXTURES}\nRe-supply the local-only real workbooks to run the E2E.`)
    process.exit(2)
  }
  // ── identity binding (FAIL BEFORE HOLD) ──
  // Bind the run to the EXACT preserved source set. A fresh hash is only lineage; matching
  // filename + SHA-256 + size to the authoritative committed ledger proves it is the SAME
  // approved workbook. Any mismatch/absent-from-ledger aborts before a single byte is held.
  if (!fs.existsSync(IDENTITY_MANIFEST)) {
    console.error(`IDENTITY MANIFEST ABSENT: ${IDENTITY_MANIFEST}`)
    process.exit(3)
  }
  const identity = loadIdentityManifest()
  const identityByCell = new Map<string, { source: E2ECell['source']; binding: IdentityBinding }>()
  const identityFailures: string[] = []

  // structural gate: exactly 18 unique entries, and each family_slug/dealer_id/ledger_status must
  // match MANIFEST expectations — not just filename/hash/size.
  const manifestNames = new Set(MANIFEST.map((m) => m.filename))
  if (identity.byName.size !== 18) identityFailures.push(`identity ledger has ${identity.byName.size} unique entries, expected exactly 18`)
  for (const name of identity.byName.keys()) {
    if (!manifestNames.has(name)) identityFailures.push(`${name}: present in ledger but not in the 18-cell MANIFEST (unexpected entry)`)
  }
  const expectedLedgerStatus = (family: FamilySlug) => (STRICT_FAMILIES.includes(family) ? 'ACCEPT' : 'QUARANTINE')
  for (const m of MANIFEST) {
    const rec = identity.byName.get(m.filename)
    if (!rec) continue // filename-missing already reported below
    if (rec.family_slug !== m.family) identityFailures.push(`${m.filename}: ledger family_slug '${rec.family_slug}' ≠ expected '${m.family}'`)
    if (rec.dealer_id !== DEALER_IDS[m.profile]) identityFailures.push(`${m.filename}: ledger dealer_id '${rec.dealer_id}' ≠ expected '${DEALER_IDS[m.profile]}'`)
    if (rec.ledger_status !== expectedLedgerStatus(m.family)) identityFailures.push(`${m.filename}: ledger status '${rec.ledger_status}' ≠ expected '${expectedLedgerStatus(m.family)}'`)
  }

  for (const m of MANIFEST) {
    const filePath = path.join(FIXTURES, m.filename)
    if (!fs.existsSync(filePath)) { identityFailures.push(`${m.filename}: file missing from fixtures`); continue }
    const buf = fs.readFileSync(filePath)
    const sha = sha256(buf)
    const size = buf.length
    const exp = identity.byName.get(m.filename)
    if (!exp) { identityFailures.push(`${m.filename}: not present in authoritative identity ledger`); continue }
    const sha256_match = sha === exp.sha256
    const size_match = size === exp.size_bytes
    if (!sha256_match) identityFailures.push(`${m.filename}: SHA-256 ${sha.slice(0, 12)}… ≠ expected ${exp.sha256.slice(0, 12)}…`)
    if (!size_match) identityFailures.push(`${m.filename}: size ${size} ≠ expected ${exp.size_bytes}`)
    identityByCell.set(m.filename, {
      source: { filename: m.filename, path: path.relative(process.cwd(), filePath), sha256: sha, size_bytes: size },
      binding: { expected_sha256: exp.sha256, expected_size: exp.size_bytes, sha256_match, size_match, ledger_status: exp.ledger_status },
    })
  }
  if (identityFailures.length > 0) {
    console.error(`\nIDENTITY BINDING FAILED — refusing to hold (the source set is not the exact approved 18):`)
    for (const f of identityFailures) console.error(`  ✗ ${f}`)
    process.exit(3)
  }
  console.log(`identity binding: all ${MANIFEST.length} workbooks match the authoritative ledger (filename + SHA-256 + size).`)

  // ── consumer pin (FAIL BEFORE HOLD) ──
  // The runner dynamically imports mutable hs-ingest-dev source; pin the exact consumer and refuse
  // to hold if the lineage is not reproducible (missing module, HEAD mismatch, or a dirty change
  // touching a pinned module).
  const consumerPin = pinConsumer()
  if (consumerPin.fatal_reasons.length > 0) {
    console.error(`\nCONSUMER LINEAGE FAILED — refusing to hold (unreproducible consumer):`)
    for (const r of consumerPin.fatal_reasons) console.error(`  ✗ ${r}`)
    process.exit(3)
  }
  console.log(`consumer pin: hs-ingest-dev @ ${consumerPin.head.slice(0, 12)} (${consumerPin.branch}); 5 modules hashed; dirty_touches_consumer=${consumerPin.dirty_touches_consumer}.`)

  const { holdStore, promote, native } = await loadBridges()

  // fresh, UNIQUE isolated roots (mkdtemp — never a fixed predictable path)
  TMP_BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'm1r-e2e-'))
  HOLD_ROOT = path.join(TMP_BASE, 'ingest-hold')
  ANALYTICS_ROOT = path.join(TMP_BASE, 'dev-analytics')
  fs.mkdirSync(HOLD_ROOT, { recursive: true })
  fs.mkdirSync(ANALYTICS_ROOT, { recursive: true })
  process.env.INGEST_HOLD_ROOT = HOLD_ROOT
  const capturedAt = `${NOW_DAY}T12:00:00Z`

  // Attempt the governed promote for a delivery. For quarantined families this is EXPECTED to
  // abort (no held delivery in the held namespace) — proving the non-promotion boundary rather
  // than assuming it.
  const flattenWatchdog = (w: Record<string, unknown> | null): Record<string, unknown> | null => {
    if (!w) return null
    const metrics = Array.isArray(w.metrics) ? (w.metrics as Array<Record<string, unknown>>) : []
    return {
      profile: w.profile, period: w.period,
      metrics: metrics.map((mm) => ({ metric_id: mm.metric_id, value: mm.value, count: mm.count, provisional: mm.provisional })),
      withheld: w.withheld ?? [],
    }
  }
  const attemptPromote = (profile: string, sha: string, profileDealer: string, period: { start: string; end: string }): PromoteOutcome => {
    try {
      const pr = promote.promoteHeldToAnalytics({ holdRoot: HOLD_ROOT, analyticsRoot: ANALYTICS_ROOT, profile, sha256: sha, profileDealer, period })
      return { outcome: pr.outcome === 'duplicate' ? 'duplicate' : 'promoted', delivery_id: pr.delivery_id, accepted_rows: pr.accepted_rows, analytics_db: path.relative(TMP_BASE, pr.evidence.analytics_db), abort_reason: null, watchdog: flattenWatchdog(pr.metrics) }
    } catch (err) {
      return { outcome: 'aborted', delivery_id: null, accepted_rows: null, analytics_db: null, abort_reason: (err as Error).message, watchdog: null }
    }
  }

  const cells: E2ECell[] = []

  for (const m of MANIFEST) {
    const filePath = path.join(FIXTURES, m.filename)
    const buf = fs.readFileSync(filePath)
    const bound = identityByCell.get(m.filename)!
    const source = bound.source
    const sha = source.sha256
    const profileDealer = DEALER_NAMES[m.profile]
    const ph = periodHintFor(m.family)

    // 1) governed hold (all 18)
    const receipt = holdStore.landDelivery(buf, holdMeta(m.profile, m.family, m.filename, sha.slice(0, 12)), { profileDealer, capturedAt, includeTransport: false })
    const hold: HoldOutcome = {
      outcome: receipt.outcome,
      validation_state: receipt.manifest.validation_state,
      report_kind: receipt.manifest.report_kind,
      dealer: receipt.manifest.dealer,
      period: receipt.manifest.period,
      quarantine_reason: receipt.manifest.quarantine_reason,
      detail: receipt.manifest.detail,
      receipt_id: receipt.manifest.receipt_id,
      hold_path: path.relative(TMP_BASE, receipt.hold_path),
      provenance_envelope: PROVENANCE_DISCLOSURE,
    }

    if (STRICT_FAMILIES.includes(m.family)) {
      // 2) strict promote — held only; the period passed is the governed manifest period.
      const period = receipt.manifest.period.start && receipt.manifest.period.end
        ? { start: receipt.manifest.period.start, end: receipt.manifest.period.end }
        : { start: ph.start, end: ph.end }
      const promoteOut = receipt.manifest.validation_state === 'held'
        ? attemptPromote(m.profile, sha, profileDealer, period)
        : { outcome: 'aborted' as const, delivery_id: null, accepted_rows: null, analytics_db: null, abort_reason: `not held (${receipt.manifest.validation_state}: ${receipt.manifest.quarantine_reason ?? '—'})`, watchdog: null }
      // 3) strict reader off the isolated brain.db
      process.env.BRAIN_PROFILES_ROOT = ANALYTICS_ROOT
      const reader = strictReaderView(m.family, native, m.profile)
      cells.push(buildStrictCell(m, source, bound.binding, hold, promoteOut, reader))
    } else {
      // provisional lane: EXPLICITLY attempt promote (must abort — never enters the strict ledger),
      // then the non-promoting adapter supplies the directional preview.
      const promoteOut = attemptPromote(m.profile, sha, profileDealer, { start: ph.start, end: ph.end })
      const prov = provisionalView(m.family, filePath, m.profile)
      cells.push(buildProvisionalCell(m, source, bound.binding, hold, promoteOut, prov))
    }
  }

  // ── NON-PROMOTION ASSERTION: every temp analytics brain.db must contain ZERO rows for any
  //    provisional report_kind (proves the 9 quarantined families never entered the strict store). ──
  const nonPromotion = assertNoProvisionalRows(ANALYTICS_ROOT)

  const summary = summarize(cells)
  const PROFILES = ['serra-honda', 'serra-nissan', 'tony-serra-ford']
  const crossFamily = Object.fromEntries(PROFILES.map((p) => [p, buildCrossFamilyReconciliation(p, cells.filter((c) => c.profile === p))]))
  const receiptOut = {
    artifact: 'm1r-real-data-e2e-receipt' as const,
    version: '1.0.0',
    executed_at: new Date().toISOString(), // REAL wall-clock execution time of this run
    data_reference_day: DATA_REFERENCE_DAY, // pinned data-cycle clock (period_hint + dev-test capture)
    data_period: { weekly: WEEKLY_PERIOD, daily_comm: { start: '2026-08-29', end: '2026-08-29' } },
    scope: 'DEV-ONLY isolated real-data E2E. 18 exact real VinSolutions workbooks (bytes+SHA-256 are the real files). Strict families exercised through the governed hs-ingest-dev hold→promote→watchdog path into an isolated temp store; ROI/CAGE/Sales-Comm quarantined by the governed gate and shown via a NON-PROMOTING provisional preview. No promotion of quarantined families; strict M1 readiness remains false.',
    isolated_roots: {
      base: `${os.tmpdir()}/m1r-e2e-<mkdtemp>`,
      hold_leaf: 'ingest-hold',
      analytics_leaf: 'dev-analytics',
      note: 'unique fs.mkdtempSync dir per run; never committed; removed after the run unless E2E_KEEP_TMP=1. Per-cell hold_path/analytics_db are recorded relative to this base.',
    },
    hs_ingest_dev_root: HS_INGEST_DEV,
    consumer_pin: consumerPin,
    fixtures_dir: path.relative(process.cwd(), FIXTURES),
    source_identity: {
      bound_to: path.relative(process.cwd(), IDENTITY_MANIFEST),
      derived_from: 'operator-staged authoritative Mac validation ledger (git-ignored/temp)',
      ledger_generated_at: identity.meta.ledger_generated_at ?? null,
      all_18_bound: cells.every((c) => c.identity.sha256_match && c.identity.size_match),
      shadow_reconciliation: 'Shadow independently reproduced the authoritative hashes; kept SEPARATE for final reconciliation.',
    },
    non_promotion_assertion: nonPromotion,
    cross_family_reconciliation: crossFamily,
    strict_contract: { accepted: 9 as const, quarantined: 9 as const, readiness: false as const },
    cells,
    summary,
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.mkdirSync(CARDS_DIR, { recursive: true })
  const receiptPath = path.join(OUT_DIR, 'real-data-e2e-receipt.json')
  fs.writeFileSync(receiptPath, JSON.stringify(receiptOut, null, 2))

  // 4) cards consume the receipt cells (no hard-coded totals). Two variants:
  //    - internal audit card (provenance/lanes/checksums) under cards/
  //    - external customer sample (no provenance/slugs/lanes/checksums/M1R language) under cards/external/
  const EXT_DIR = path.join(CARDS_DIR, 'external')
  fs.mkdirSync(EXT_DIR, { recursive: true })
  for (const profile of PROFILES) {
    const profileCells = cells.filter((c) => c.profile === profile)
    fs.writeFileSync(path.join(CARDS_DIR, `${profile}-halo-preview.html`), renderHaloPreviewHtml(buildHaloPreviewCard(DEALER_NAMES[profile], profileCells, dataThroughLabel())))
    fs.writeFileSync(path.join(EXT_DIR, `${profile}-halo-external.html`), renderHaloPreviewHtml(buildExternalCard(DEALER_NAMES[profile], profileCells, dataThroughLabel())))
  }

  // console summary
  console.log(`\n== M1R real-data E2E ==`)
  console.log(`fixtures: ${receiptOut.fixtures_dir}`)
  console.log(`isolated hold_root:      ${HOLD_ROOT}`)
  console.log(`isolated analytics_root: ${ANALYTICS_ROOT}`)
  console.log(`receipt: ${path.relative(process.cwd(), receiptPath)}`)
  for (const c of cells) {
    const tag = c.preview_lane === 'strict-governed' ? 'S' : 'P'
    const flag = c.technical_pass ? 'PASS' : 'FAIL'
    console.log(`  [${tag}] ${c.profile.padEnd(16)} ${c.family.padEnd(24)} hold=${c.hold.validation_state.padEnd(11)} promote=${(c.promote?.outcome ?? '—').padEnd(9)} reader=${c.reader_used.padEnd(34)} ${flag}${c.technical_pass ? '' : ' :: ' + c.technical_pass_detail}`)
  }
  console.log(`\nsummary: held=${summary.held} quarantined=${summary.quarantined} promoted=${summary.promoted} provisional=${summary.provisional_available} disagreements=${summary.disagreements} technical_pass=${summary.technical_pass}/${summary.total} technical_failures=${summary.technical_failures}`)
  if (summary.technical_failures > 0) {
    console.log(`\nTECHNICAL FAILURES:`)
    for (const f of summary.technical_failure_details) console.log(`  ${f.profile} ${f.family}: ${f.reason}`)
  }
  console.log(`\nnon-promotion assertion: ${nonPromotion.passed ? 'PASS' : 'FAIL'} — provisional deliveries/rows in temp analytics DBs:`)
  for (const p of nonPromotion.per_profile) console.log(`  ${p.profile}: strict_deliveries=${p.strict_deliveries} provisional_deliveries=${p.provisional_deliveries} provisional_rows=${p.provisional_rows}`)
  console.log(`\ncross-family reconciliation (strict gross vs dashboard; delivered rows vs sold; CAGE directional):`)
  for (const [p, cf] of Object.entries(crossFamily)) {
    const disc = cf.checks.filter((c) => c.reconciles === false)
    console.log(`  ${p}: strict_ok=${cf.strict_ok}${disc.length ? ' :: ' + disc.map((d) => d.name + (d.directional ? '(directional)' : '') + ' — ' + d.caveat).join('; ') : ''}`)
  }
  console.log(`\nstrict M1 readiness: FALSE (unchanged). Quarantined families NOT promoted.`)

  if (!KEEP_TMP) rmrf(TMP_BASE)
  else console.log(`\n(E2E_KEEP_TMP=1) temp roots retained for inspection: ${TMP_BASE}`)

  // Hard gate: a broken non-promotion boundary or any technical failure is a non-zero exit so
  // artifacts are never mistaken for a clean pass.
  if (!nonPromotion.passed || summary.technical_failures > 0) process.exit(4)
}

main().catch((err) => { console.error(err); process.exit(1) })
