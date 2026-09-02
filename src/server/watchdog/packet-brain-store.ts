/**
 * PKT-02-01 additive Brain/InfoStore persistence adapter (development only).
 *
 * Moves the ALREADY-ACCEPTED PKT-02-01 packet run (SW-011..015, Serra Honda 21043
 * Sales) from packet-local filesystem evidence into the repo's real per-profile
 * Brain (`~/.hermes/profiles/<profile>/brain/brain.db`), using the established
 * feature-owned watchdog persistence convention (mirrors watchdog-store.ts and
 * notifications-store.ts: `ensure()` + `CREATE TABLE IF NOT EXISTS`, profile-scoped,
 * idempotent by a stable key). It does NOT touch the checksummed brain-schema.ts
 * migration list, does NOT overload the generic `observations`/`outputs` tables, and
 * does NOT replace or weaken the immutable packet evidence — it is purely additive.
 *
 * What it persists (the same record set the accepted engine already produces):
 *   watchdog_packet_run              one row per run_key (identity, hashes, lineage,
 *                                    lifecycle partition, reconciliation, provenance)
 *   watchdog_packet_observation      per-metric observation (missing preserved as NULL)
 *   watchdog_packet_evaluation       per-metric evaluation (grade-target linkage, rating)
 *   watchdog_packet_finding          per-metric finding
 *   watchdog_packet_alert_candidate  UNSENT alert simulation (delivered=0, unsent=1)
 *
 * Invariants (fail-closed — any violation throws PacketBrainStoreError):
 *   - binding sha equals the frozen pin;
 *   - packet_id == PKT-02-01; dealer == 21043; profile == serra-honda;
 *   - content_sha256 recomputes exactly (tamper detection);
 *   - only the five declared metric ids may be persisted (unknown-metric fail-closed);
 *   - source-investigation-pending metrics carry NULL value/numerator/denominator
 *     (missing is never zero);
 *   - the Sales-only proof affirms zero Service/Parts (Service/Parts fail-closed);
 *   - idempotent replay: re-persisting an identical run makes no changes; a run_key
 *     collision with a DIFFERENT content_sha256 is refused.
 *
 * No network, no delivery, no email, no schedule, no production DB. Rollback is
 * deleting the disposable dev profile directory.
 */
import { now as nowMs, openBrain } from '../brain-store'
import { canonicalJson, sha256Hex } from '../reports/packet/canonical'
import { contentSha } from '../reports/packet/store'
import { FROZEN_BINDING_SHA256 } from '../reports/packet/binding'
import { HONDA_DEALER_ID, HONDA_PROFILE } from '../reports/packet/leads-input'
import {
  MEASURED_IDS,
  PACKET_ID,
  PENDING_IDS,
} from '../reports/packet/engine'
import type {
  AlertSimulation,
  Evaluation,
  Finding,
  Observation,
  PacketRun,
  Reconciliation,
  TwoDelta,
} from '../reports/packet/engine'

export class PacketBrainStoreError extends Error {}

/** The exact engine sequence: measured ids first, then pending ids. Array order is
 *  part of the deterministic content-of-record, so reconstruction must honor it. */
const ENGINE_ORDER: ReadonlyArray<string> = [...MEASURED_IDS, ...PENDING_IDS]

/** The exact, closed set of metric ids this packet may persist. */
const ALLOWED_IDS: ReadonlySet<string> = new Set<string>(ENGINE_ORDER)

/**
 * Anchored, affirmative, order-bound grammar for the accepted Sales-only proof:
 *   `<N> rows: one rooftop Dealer ID=21043; zero Service/Parts tokens in categorical columns; …`
 * Anchored at ^ so a negated/contradictory phrase that merely CONTAINS
 * "zero Service/Parts" cannot pass. The single rooftop and the zero-Service/Parts
 * clause must appear in this exact accepted order.
 */
const SALES_ONLY_PROOF_GRAMMAR = new RegExp(
  `^\\d+ rows: one rooftop Dealer ID=${HONDA_DEALER_ID}; ` +
    `zero Service/Parts tokens in categorical columns;`,
)

type Handle = ReturnType<typeof openBrain>

// ── Read-back shapes ─────────────────────────────────────────────────

/** Read-back alert candidate — carries the ACTUAL stored flags (not literals), so
 *  reconstruction is sensitive to delivery-flag tampering. An intact row is
 *  { delivered:false, unsent:true }; any other value diverges the content hash. */
export type StoredAlertCandidate = {
  metric_id: string
  would_fire: boolean
  channel: string
  delivered: boolean
  unsent: boolean
  message: string
}

export type StoredPacketRun = {
  run_key: string
  profile: string
  packet_id: string
  module: number
  dealer_id: string
  period: string
  binding_sha256: string
  source_sha256: string
  engine_version: string
  content_sha256: string
  as_of: string
  persisted_at: number
  lifecycle_partition: Record<string, Array<string>>
  reconciliation: Reconciliation
  report_lineage: TwoDelta
  observations: Array<Observation>
  evaluations: Array<Evaluation>
  findings: Array<Finding>
  alert_candidates: Array<StoredAlertCandidate>
}

export type PersistResult = {
  changed: boolean
  runKey: string
  profile: string
  rows: {
    run: number
    observations: number
    evaluations: number
    findings: number
    alert_candidates: number
  }
}

// ── Schema (feature-owned, additive, profile-scoped) ─────────────────

function ensure(profile: string, profileRoot?: string): Handle {
  const h = openBrain(profile, { profileRoot })
  h.exec(
    `CREATE TABLE IF NOT EXISTS watchdog_packet_run (
       run_key             TEXT PRIMARY KEY,
       profile             TEXT NOT NULL,
       packet_id           TEXT NOT NULL,
       module              INTEGER NOT NULL,
       dealer_id           TEXT NOT NULL,
       period              TEXT NOT NULL,
       binding_sha256      TEXT NOT NULL,
       source_sha256       TEXT NOT NULL,
       engine_version      TEXT NOT NULL,
       content_sha256      TEXT NOT NULL,
       lifecycle_partition TEXT NOT NULL,
       reconciliation      TEXT NOT NULL,
       report_lineage      TEXT NOT NULL,
       as_of               TEXT NOT NULL,
       persisted_at        INTEGER NOT NULL
     )`,
  )
  h.exec(
    `CREATE INDEX IF NOT EXISTS watchdog_packet_run_profile
       ON watchdog_packet_run(profile, period)`,
  )
  h.exec(
    `CREATE TABLE IF NOT EXISTS watchdog_packet_observation (
       run_key              TEXT NOT NULL,
       metric_id            TEXT NOT NULL,
       profile              TEXT NOT NULL,
       period               TEXT NOT NULL,
       status               TEXT NOT NULL,
       calculation_kind     TEXT NOT NULL,
       value                REAL,
       unit                 TEXT NOT NULL,
       numerator            REAL,
       denominator          REAL,
       missing              REAL,
       formula              TEXT,
       source_fields        TEXT NOT NULL,
       source_lineage       TEXT NOT NULL,
       confidence           TEXT NOT NULL,
       gradable             INTEGER NOT NULL,
       detail               TEXT,
       source_investigation TEXT,
       PRIMARY KEY (run_key, metric_id)
     )`,
  )
  h.exec(
    `CREATE INDEX IF NOT EXISTS watchdog_packet_observation_metric
       ON watchdog_packet_observation(profile, period, metric_id)`,
  )
  h.exec(
    `CREATE TABLE IF NOT EXISTS watchdog_packet_evaluation (
       run_key         TEXT NOT NULL,
       metric_id       TEXT NOT NULL,
       profile         TEXT NOT NULL,
       period          TEXT NOT NULL,
       gradable_state  TEXT NOT NULL,
       threshold_id    TEXT,
       comparator      TEXT,
       threshold       REAL,
       reference_id    TEXT,
       grade_target_id TEXT,
       detection_rule  TEXT,
       detection_fired INTEGER,
       rating          TEXT NOT NULL,
       reason          TEXT,
       PRIMARY KEY (run_key, metric_id)
     )`,
  )
  h.exec(
    `CREATE TABLE IF NOT EXISTS watchdog_packet_finding (
       run_key   TEXT NOT NULL,
       metric_id TEXT NOT NULL,
       profile   TEXT NOT NULL,
       period    TEXT NOT NULL,
       severity  TEXT NOT NULL,
       headline  TEXT NOT NULL,
       detail    TEXT NOT NULL,
       PRIMARY KEY (run_key, metric_id)
     )`,
  )
  h.exec(
    `CREATE TABLE IF NOT EXISTS watchdog_packet_alert_candidate (
       run_key    TEXT NOT NULL,
       metric_id  TEXT NOT NULL,
       profile    TEXT NOT NULL,
       period     TEXT NOT NULL,
       would_fire INTEGER NOT NULL,
       channel    TEXT NOT NULL,
       delivered  INTEGER NOT NULL,
       unsent     INTEGER NOT NULL,
       message    TEXT NOT NULL,
       PRIMARY KEY (run_key, metric_id)
     )`,
  )
  return h
}

// ── Fail-closed validation ───────────────────────────────────────────

const bool01 = (b: boolean): number => (b ? 1 : 0)
const intOrNull = (b: boolean | null): number | null =>
  b === null ? null : bool01(b)

/** Fail-closed: a record family must carry EXACTLY the expected id set, each once. */
function assertExactIdSet(
  records: Array<{ metric_id: string }>,
  expected: ReadonlyArray<string>,
  label: string,
): void {
  const ids = records.map((r) => r.metric_id)
  if (new Set(ids).size !== ids.length)
    throw new PacketBrainStoreError(`${label}: duplicate metric id`)
  const got = new Set(ids)
  if (got.size !== expected.length)
    throw new PacketBrainStoreError(
      `${label}: expected exactly ${expected.length} ids [${expected.join(', ')}], got ${ids.length} [${ids.join(', ')}]`,
    )
  for (const id of expected)
    if (!got.has(id))
      throw new PacketBrainStoreError(`${label}: missing declared ${id}`)
}

/** Fail-closed: every record's period must equal the run period. */
function assertPeriods(
  records: Array<{ metric_id: string; period: string }>,
  period: string,
  label: string,
): void {
  for (const r of records)
    if (r.period !== period)
      throw new PacketBrainStoreError(
        `${label} ${r.metric_id}: period ${r.period} != run period ${period}`,
      )
}

/** Independent, fail-closed pre-persist validation. Throws on any breach. */
export function validateForPersist(run: PacketRun, profile: string): void {
  if (run.binding_sha256 !== FROZEN_BINDING_SHA256) {
    throw new PacketBrainStoreError(
      `binding sha drift: ${run.binding_sha256} != frozen ${FROZEN_BINDING_SHA256}`,
    )
  }
  if (run.packet_id !== PACKET_ID) {
    throw new PacketBrainStoreError(
      `wrong packet: ${run.packet_id} != ${PACKET_ID}`,
    )
  }
  if (profile !== HONDA_PROFILE) {
    throw new PacketBrainStoreError(
      `wrong profile: ${profile} != ${HONDA_PROFILE} (fail-closed one-tenant)`,
    )
  }
  if (run.dealer_id !== HONDA_DEALER_ID) {
    throw new PacketBrainStoreError(
      `wrong dealer: ${run.dealer_id} != ${HONDA_DEALER_ID} (fail-closed one-rooftop)`,
    )
  }
  // Tamper detection: the content of record must re-hash to its pinned sha.
  const recomputed = contentSha(run)
  if (recomputed !== run.content_sha256) {
    throw new PacketBrainStoreError(
      `content_sha256 mismatch: recomputed ${recomputed} != ${run.content_sha256} (tamper)`,
    )
  }
  // Sales-only proof must AFFIRMATIVELY match the accepted proof grammar, anchored
  // and order-bound — not merely contain the substring "zero Service/Parts" (which a
  // contradictory phrase could also carry). It must state the row count, the single
  // rooftop Dealer ID=21043, and zero Service/Parts tokens in categorical columns, in
  // that exact accepted order. This protects the first-class Service exclusion.
  const ed = run.two_delta.evidence_delta
  const proof = ed.sales_only_proof
  if (!SALES_ONLY_PROOF_GRAMMAR.test(proof)) {
    throw new PacketBrainStoreError(
      `Sales-only proof failed the anchored zero-Service/Parts grammar (one rooftop Dealer ID=${HONDA_DEALER_ID}; zero Service/Parts tokens in categorical columns): "${proof}"`,
    )
  }
  if (ed.dealer_id !== HONDA_DEALER_ID) {
    throw new PacketBrainStoreError(
      `evidence_delta dealer mismatch: ${ed.dealer_id} != ${HONDA_DEALER_ID}`,
    )
  }
  // Lineage integrity: the evidence delta must describe the SAME period and source
  // bytes as the run it belongs to.
  if (ed.period !== run.period) {
    throw new PacketBrainStoreError(
      `evidence_delta period lineage mismatch: ${ed.period} != run ${run.period}`,
    )
  }
  if (ed.source_sha256 !== run.source_sha256) {
    throw new PacketBrainStoreError(
      `evidence_delta source_sha256 lineage mismatch: ${ed.source_sha256} != run ${run.source_sha256}`,
    )
  }
  // Unknown-metric fail-closed across every record family.
  const ids = new Set<string>()
  for (const o of run.observations) ids.add(o.metric_id)
  for (const e of run.evaluations) ids.add(e.metric_id)
  for (const f of run.findings) ids.add(f.metric_id)
  for (const a of run.alert_simulations) ids.add(a.metric_id)
  for (const bucket of Object.values(run.lifecycle_partition))
    for (const id of bucket) ids.add(id)
  for (const id of ids) {
    if (!ALLOWED_IDS.has(id)) {
      throw new PacketBrainStoreError(
        `unknown metric id not in the frozen packet set: ${id}`,
      )
    }
  }
  // Every record family must carry EXACTLY its declared id set, each once —
  // not observations alone. Measured metrics (and only those) carry alerts.
  const allIds = [...ALLOWED_IDS]
  assertExactIdSet(run.observations, allIds, 'observations')
  assertExactIdSet(run.evaluations, allIds, 'evaluations')
  assertExactIdSet(run.findings, allIds, 'findings')
  assertExactIdSet(run.alert_simulations, [...MEASURED_IDS], 'alert_simulations')
  // Every per-metric record's period must match the run period.
  assertPeriods(run.observations, run.period, 'observation')
  assertPeriods(run.evaluations, run.period, 'evaluation')
  assertPeriods(run.findings, run.period, 'finding')
  // Missing-is-not-zero: pending metrics may not carry a fabricated value.
  for (const o of run.observations) {
    if (o.status === 'source_investigation_pending') {
      if (o.value !== null || o.numerator !== null || o.denominator !== null) {
        throw new PacketBrainStoreError(
          `${o.metric_id} is source_investigation_pending but carries a value/num/den (missing must stay NULL, never zero)`,
        )
      }
    }
  }
  // An alert candidate that reports delivery is a hard boundary breach. Cast to a
  // widened boolean so this stays a real runtime guard (inputs can be malformed at
  // runtime even though the compile-time type pins the literals false/true).
  for (const a of run.alert_simulations) {
    if ((a.delivered as boolean) !== false || (a.unsent as boolean) !== true) {
      throw new PacketBrainStoreError(
        `${a.metric_id} alert candidate reports delivery (delivered must be false, unsent true)`,
      )
    }
  }
}

// ── Persist (idempotent) ─────────────────────────────────────────────

export function persistPacketRun(
  run: PacketRun,
  opts: { profile?: string; profileRoot?: string } = {},
): PersistResult {
  const profile = opts.profile ?? HONDA_PROFILE
  validateForPersist(run, profile)
  const h = ensure(profile, opts.profileRoot)

  const noChange: PersistResult['rows'] = {
    run: 0,
    observations: 0,
    evaluations: 0,
    findings: 0,
    alert_candidates: 0,
  }

  // Idempotence: an existing run_key with identical content is a no-op; a
  // collision with different content is refused (fail-closed, never overwrite).
  const prev = h.get<{ content_sha256: string }>(
    `SELECT content_sha256 FROM watchdog_packet_run WHERE run_key = ?`,
    run.run_key,
  )
  if (prev) {
    if (prev.content_sha256 !== run.content_sha256) {
      throw new PacketBrainStoreError(
        `run_key ${run.run_key} already persisted with different content_sha256 ` +
          `(${prev.content_sha256} != ${run.content_sha256}); refusing to overwrite`,
      )
    }
    return {
      changed: false,
      runKey: run.run_key,
      profile,
      rows: noChange,
    }
  }

  // Atomic: parent + every child row commit together or not at all. A mid-write
  // failure rolls back completely — never a parent-with-partial-children that a
  // later replay would falsely treat as an already-persisted no-op.
  h.exec('BEGIN')
  try {
    persistRows(h, run, profile)
    h.exec('COMMIT')
  } catch (err) {
    h.exec('ROLLBACK')
    throw err
  }

  return {
    changed: true,
    runKey: run.run_key,
    profile,
    rows: {
      run: 1,
      observations: run.observations.length,
      evaluations: run.evaluations.length,
      findings: run.findings.length,
      alert_candidates: run.alert_simulations.length,
    },
  }
}

/** All INSERTs for one run — called inside a transaction by persistPacketRun. */
function persistRows(h: Handle, run: PacketRun, profile: string): void {
  h.run(
    `INSERT INTO watchdog_packet_run
       (run_key, profile, packet_id, module, dealer_id, period, binding_sha256,
        source_sha256, engine_version, content_sha256, lifecycle_partition,
        reconciliation, report_lineage, as_of, persisted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    run.run_key,
    profile,
    run.packet_id,
    run.module,
    run.dealer_id,
    run.period,
    run.binding_sha256,
    run.source_sha256,
    run.engine_version,
    run.content_sha256,
    canonicalJson(run.lifecycle_partition),
    canonicalJson(run.reconciliation),
    canonicalJson(run.two_delta),
    run.as_of,
    nowMs(),
  )

  for (const o of run.observations) {
    h.run(
      `INSERT INTO watchdog_packet_observation
         (run_key, metric_id, profile, period, status, calculation_kind, value, unit,
          numerator, denominator, missing, formula, source_fields, source_lineage,
          confidence, gradable, detail, source_investigation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      run.run_key,
      o.metric_id,
      profile,
      o.period,
      o.status,
      o.calculation_kind,
      o.value,
      o.unit,
      o.numerator,
      o.denominator,
      o.missing,
      o.formula,
      canonicalJson(o.source_fields),
      canonicalJson(o.source_lineage),
      o.confidence,
      bool01(o.gradable),
      o.detail === null ? null : canonicalJson(o.detail),
      o.source_investigation === null
        ? null
        : canonicalJson(o.source_investigation),
    )
  }

  for (const e of run.evaluations) {
    h.run(
      `INSERT INTO watchdog_packet_evaluation
         (run_key, metric_id, profile, period, gradable_state, threshold_id, comparator,
          threshold, reference_id, grade_target_id, detection_rule, detection_fired,
          rating, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      run.run_key,
      e.metric_id,
      profile,
      e.period,
      e.gradable_state,
      e.threshold_id,
      e.comparator,
      e.threshold,
      e.reference_id,
      e.grade_target_id,
      e.detection_rule,
      intOrNull(e.detection_fired),
      e.rating,
      e.reason,
    )
  }

  for (const f of run.findings) {
    h.run(
      `INSERT INTO watchdog_packet_finding
         (run_key, metric_id, profile, period, severity, headline, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      run.run_key,
      f.metric_id,
      profile,
      f.period,
      f.severity,
      f.headline,
      f.detail,
    )
  }

  for (const a of run.alert_simulations) {
    h.run(
      `INSERT INTO watchdog_packet_alert_candidate
         (run_key, metric_id, profile, period, would_fire, channel, delivered, unsent, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      run.run_key,
      a.metric_id,
      profile,
      run.period,
      bool01(a.would_fire),
      a.channel,
      bool01(a.delivered),
      bool01(a.unsent),
      a.message,
    )
  }
}

// ── Read-back ────────────────────────────────────────────────────────

type ObsRow = {
  run_key: string
  metric_id: string
  period: string
  status: Observation['status']
  calculation_kind: string
  value: number | null
  unit: string
  numerator: number | null
  denominator: number | null
  missing: number | null
  formula: string | null
  source_fields: string
  source_lineage: string
  confidence: string
  gradable: number
  detail: string | null
  source_investigation: string | null
}

type EvalRow = {
  metric_id: string
  period: string
  gradable_state: Evaluation['gradable_state']
  threshold_id: string | null
  comparator: string | null
  threshold: number | null
  reference_id: string | null
  grade_target_id: string | null
  detection_rule: string | null
  detection_fired: number | null
  rating: Evaluation['rating']
  reason: string | null
}

type FindingRow = {
  metric_id: string
  period: string
  severity: Finding['severity']
  headline: string
  detail: string
}

type AlertRow = {
  metric_id: string
  would_fire: number
  channel: AlertSimulation['channel']
  delivered: number
  unsent: number
  message: string
}

function parse<T>(s: string): T {
  return JSON.parse(s) as T
}

/** Fully reconstruct a persisted run from the Brain. Returns null if absent. */
export function readPacketRun(
  runKey: string,
  opts: { profile?: string; profileRoot?: string } = {},
): StoredPacketRun | null {
  const profile = opts.profile ?? HONDA_PROFILE
  const h = ensure(profile, opts.profileRoot)
  const r = h.get<{
    run_key: string
    profile: string
    packet_id: string
    module: number
    dealer_id: string
    period: string
    binding_sha256: string
    source_sha256: string
    engine_version: string
    content_sha256: string
    lifecycle_partition: string
    reconciliation: string
    report_lineage: string
    as_of: string
    persisted_at: number
  }>(`SELECT * FROM watchdog_packet_run WHERE run_key = ? AND profile = ?`, runKey, profile)
  if (!r) return null

  const observations = h
    .all<ObsRow>(
      `SELECT * FROM watchdog_packet_observation WHERE run_key = ? ORDER BY metric_id`,
      runKey,
    )
    .map(
      (o): Observation => ({
        metric_id: o.metric_id,
        period: o.period,
        status: o.status,
        calculation_kind: o.calculation_kind,
        value: o.value,
        unit: o.unit,
        numerator: o.numerator,
        denominator: o.denominator,
        missing: o.missing,
        formula: o.formula,
        source_fields: parse(o.source_fields),
        source_lineage: parse(o.source_lineage),
        confidence: o.confidence,
        gradable: o.gradable === 1,
        detail: o.detail === null ? null : parse(o.detail),
        source_investigation:
          o.source_investigation === null ? null : parse(o.source_investigation),
      }),
    )

  const evaluations = h
    .all<EvalRow>(
      `SELECT * FROM watchdog_packet_evaluation WHERE run_key = ? ORDER BY metric_id`,
      runKey,
    )
    .map(
      (e): Evaluation => ({
        metric_id: e.metric_id,
        period: e.period,
        gradable_state: e.gradable_state,
        threshold_id: e.threshold_id,
        comparator: e.comparator,
        threshold: e.threshold,
        reference_id: e.reference_id,
        grade_target_id: e.grade_target_id,
        detection_rule: e.detection_rule,
        detection_fired: e.detection_fired === null ? null : e.detection_fired === 1,
        rating: e.rating,
        reason: e.reason,
      }),
    )

  const findings = h
    .all<FindingRow>(
      `SELECT * FROM watchdog_packet_finding WHERE run_key = ? ORDER BY metric_id`,
      runKey,
    )
    .map(
      (f): Finding => ({
        metric_id: f.metric_id,
        period: f.period,
        severity: f.severity,
        headline: f.headline,
        detail: f.detail,
      }),
    )

  const alert_candidates = h
    .all<AlertRow>(
      `SELECT * FROM watchdog_packet_alert_candidate WHERE run_key = ? ORDER BY metric_id`,
      runKey,
    )
    .map(
      (a): StoredAlertCandidate => ({
        metric_id: a.metric_id,
        would_fire: a.would_fire === 1,
        channel: a.channel,
        // Reconstruct the ACTUAL stored flags — do NOT hardcode. A tampered
        // delivered/unsent value must surface via reconstructedContentSha.
        delivered: a.delivered === 1,
        unsent: a.unsent === 1,
        message: a.message,
      }),
    )

  return {
    run_key: r.run_key,
    profile: r.profile,
    packet_id: r.packet_id,
    module: r.module,
    dealer_id: r.dealer_id,
    period: r.period,
    binding_sha256: r.binding_sha256,
    source_sha256: r.source_sha256,
    engine_version: r.engine_version,
    content_sha256: r.content_sha256,
    as_of: r.as_of,
    persisted_at: r.persisted_at,
    lifecycle_partition: parse(r.lifecycle_partition),
    reconciliation: parse(r.reconciliation),
    report_lineage: parse(r.report_lineage),
    observations,
    evaluations,
    findings,
    alert_candidates,
  }
}

/** List persisted run_keys for a profile (period history, newest first). */
export function listPacketRuns(
  opts: { profile?: string; profileRoot?: string } = {},
): Array<{ run_key: string; period: string; content_sha256: string }> {
  const profile = opts.profile ?? HONDA_PROFILE
  const h = ensure(profile, opts.profileRoot)
  return h.all<{ run_key: string; period: string; content_sha256: string }>(
    `SELECT run_key, period, content_sha256 FROM watchdog_packet_run
      WHERE profile = ? ORDER BY period DESC, persisted_at DESC`,
    profile,
  )
}

/**
 * Rebuild the deterministic content-of-record from the persisted rows and
 * re-hash it. Equals the stored content_sha256 on an untouched Brain; any
 * out-of-band row mutation changes the hash (replay / tamper proof).
 */
export function reconstructedContentSha(
  runKey: string,
  opts: { profile?: string; profileRoot?: string } = {},
): string | null {
  const stored = readPacketRun(runKey, opts)
  if (!stored) return null
  // Canonical JSON preserves array order, so the content-of-record arrays must be
  // re-ordered to the exact engine sequence (measured ids, then pending ids) — the
  // read-back returns them sorted by metric_id, which is a different order.
  const rank = (id: string): number => ENGINE_ORDER.indexOf(id)
  const byRank = <T extends { metric_id: string }>(xs: Array<T>): Array<T> =>
    [...xs].sort((a, b) => rank(a.metric_id) - rank(b.metric_id))
  const content = {
    packet_id: stored.packet_id,
    module: stored.module,
    dealer_id: stored.dealer_id,
    period: stored.period,
    binding_sha256: stored.binding_sha256,
    source_sha256: stored.source_sha256,
    engine_version: stored.engine_version,
    lifecycle_partition: stored.lifecycle_partition,
    observations: byRank(stored.observations),
    evaluations: byRank(stored.evaluations),
    findings: byRank(stored.findings),
    two_delta: stored.report_lineage,
    alert_simulations: byRank(stored.alert_candidates),
    reconciliation: stored.reconciliation,
  }
  return sha256Hex(canonicalJson(content))
}
