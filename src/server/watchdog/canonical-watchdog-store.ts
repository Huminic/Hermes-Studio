/**
 * Canonical Semantic Watchdog InfoStore (execution spec §7) — the reusable,
 * PACKET-AGNOSTIC owner.
 *
 * This module knows nothing about PKT-02-01, Honda, SW-011..015, or any global metric
 * set. It persists / reads / reconstructs a fully-declared, validated
 * `CanonicalRunEnvelope` into the versioned canonical tables (brain-schema.ts
 * migration 5). It imports NO packet constants, NO packet validator, and NO binding
 * loader — every packet-specific fact (exact metric-id set + order, source/normalized
 * lineage IDs, versions, and per-metric grade-target authority) arrives as data on the
 * envelope. A thin PKT-02-01 adapter (pkt-02-01-canonical-adapter.ts) builds the
 * envelope from a PacketRun; any future packet builds its own.
 *
 * Guarantees:
 *   - generic fail-closed validation: exact families/cardinalities/order derived from
 *     the envelope; content hash recomputed; inert alerts; Sales-only admission;
 *     and FAIL-CLOSED target authority — a non-null grade_target_id with no supplied
 *     authority row is rejected (no silent approval inference);
 *   - idempotent by (run_key, content_sha256); a collision with different content is
 *     refused; before any changed=false replay the FULL graph is verified;
 *   - a full-graph verified public read (readCanonicalRun) + a separately-named
 *     forensic raw read (readCanonicalRunRawForensic) that bypasses verification only
 *     for diagnosis;
 *   - the same tables/API accept genuinely different packets (disjoint metric sets,
 *     different packet_id) with no overwrite and no new tables.
 *
 * No network, no production DB, no delivery.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { now as nowMs, openBrain } from '../brain-store'
import { canonicalJson, sha256Hex } from '../reports/packet/canonical'
// Type-only imports of the GENERIC metric-record contracts (erased at compile time —
// zero runtime dependency on the packet engine; no constants/values imported).
import type {
  AlertSimulation,
  Evaluation,
  Finding,
  Observation,
  Reconciliation,
  TwoDelta,
} from '../reports/packet/engine'

/** Typed full-graph integrity failure (tamper / missing / extra child rows). */
export class CanonicalWatchdogIntegrityError extends Error {}
/** Typed write-path failure (invalid envelope, collision, nothing to backfill). */
export class CanonicalWatchdogStoreError extends Error {}

// ── Envelope contract (all packet-specific facts arrive as data) ─────

export type MetricDefinitionSpec = {
  metric_id: string
  metric_version: string
  module: number
  business_question?: string | null
  boundary_class?: string | null
  population?: string | null
  calculation_kind: string
  null_missing_behavior?: string | null
  unit: string
  polarity?: string | null
  window?: string | null
  timezone?: string | null
  cadence?: string | null
  formula?: string | null
  numerator_definition?: string | null
  denominator_definition?: string | null
  required_fields?: Array<string> | null
  required_sources?: Array<string> | null
  impact_method?: string | null
  gradable: boolean
  sensitivity_class?: string | null
  effective_start?: string | null
  effective_end?: string | null
  definition_status: string
}

/** Structured per-artifact admission receipt bound to the artifact's identity. Every
 *  field is validated independently against its artifact at persist time (item 3). */
export type StructuredAdmissionReceipt = {
  source_sha256: string
  schema_contract_sha256: string | null
  bytes: number | null
  row_count: number | null
  profile: string
  dealer_id: string
  period: string
  admitted: true
  zero_service_parts: true
  /** Non-empty artifact-bound Sales-only proof (item 4). */
  sales_only_proof: string
  /** free-form provenance (row reconciliation, etc.) — not identity-bound. */
  provenance?: Record<string, unknown>
}

export type SourceArtifactSpec = {
  source_artifact_id: string
  family: string
  source_type: string
  raw_location?: string | null
  source_sha256: string
  dealer_id: string
  period: string
  schema_version?: string | null
  schema_contract_sha256?: string | null
  receipt_sha256?: string | null
  bytes?: number | null
  row_count?: number | null
  dealer_period_result: string
  admission_receipt: StructuredAdmissionReceipt
}

export type NormalizedDatasetSpec = {
  normalized_dataset_id: string
  source_artifact_id: string
  profile: string
  dealer_id: string
  period: string
  normalized_sha256?: string | null
  filter_spec?: string | null
  row_key_set_hash?: string | null
  row_key_set_hash_method?: string | null
  timezone?: string | null
  as_of?: string | null
  join_keys?: string | null
  io_reconciliation?: string | null
  transform_config_hash?: string | null
  transformation_code_hash?: string | null
}

export type DetectionRuleSpec = {
  detection_rule_id: string
  metric_id: string
  metric_version: string
  threshold_id?: string | null
  condition?: string | null
  comparator?: string | null
  threshold?: number | null
  provenance?: string | null
  approval_state?: string | null
  status?: string | null
  evaluation_semantics?: string | null
}

export type GradeTargetSpec = {
  grade_target_id: string
  target_version: string
  metric_id: string
  metric_version: string
  basis?: string | null
  value_or_range?: string | null
  unit?: string | null
  comparator?: string | null
  polarity?: string | null
  source?: string | null
  provenance?: string | null
  publication_date?: string | null
  effective_start?: string | null
  effective_end?: string | null
  valid_period?: string | null
  capability_snapshot_id?: string | null
  inputs?: string | null
  assumptions?: string | null
  minimum_sample?: string | null
  history_ref?: string | null
  confidence?: string | null
  compatibility_result?: string | null
  approval_state: string
  status: string
  derivation_narrative?: string | null
}

export type ComparisonReferenceSpec = {
  reference_id: string
  reference_version: string
  metric_id: string
  metric_version: string
  basis?: string | null
  formula?: string | null
  value_or_range?: string | null
  unit?: string | null
  comparator?: string | null
  polarity?: string | null
  source?: string | null
  publication_date?: string | null
  valid_period?: string | null
  capability_snapshot_id?: string | null
  inputs?: string | null
  assumptions?: string | null
  minimum_sample?: string | null
  history_ref?: string | null
  confidence?: string | null
  compatibility_result?: string | null
  approval_state?: string | null
  status?: string | null
  derivation_narrative?: string | null
}

export type FindingSpec = {
  finding_key: string
  metric_id: string
  period: string
  severity: string
  headline: string
  detail: string
  priority: string
  category?: string
  audience?: string
  evidence_class?: string
  root_cause_class?: string | null
  recommended_action?: string | null
}

export type SalesOnlyAdmission = {
  proof: string
  dealer_id: string
  zero_service_parts: boolean
}

export type ReportRunSpec = {
  report_run_id: string
  report_version?: string | null
  source_cutoff?: string | null
  freshness?: string | null
  report_lineage: TwoDelta
  pdf_artifact_sha256?: string | null
  internal_artifact_sha256?: string | null
  qa_receipt?: string | null
  delivery_state: string
  activation_state?: string | null
}

export type CapabilitySnapshotSpec = {
  capability_snapshot_id: string
  dealer_id: string
  period: string
  revision?: number
  supersedes_id?: string | null
  throughput?: string | null
  workforce?: string | null
  workload_capacity?: string | null
  inventory_context?: string | null
  source_mix?: string | null
  dealer_history?: string | null
  seasonality_flags?: string | null
  manual_potential?: string | null
  provenance?: string | null
}

/** Buckets the lifecycle partition may use — the contract's defined vocabulary only. */
export const LIFECYCLE_BUCKETS = [
  'accepted_measured_ids',
  'accepted_disposition_only_ids',
  'rejected_ids',
  'source_investigation_pending_ids',
  'calculation_pending_ids',
] as const

/** The lifecycle bucket is AUTHORITATIVE (from the binding's lifecycle_bucket). Bucket
 *  validity depends on the pair (disposition, evaluation_state), NOT a one-to-one map
 *  (Amendment 002). This is the set of dispositions each bucket admits; source
 *  _investigation_pending is NEVER accepted_disposition_only; rejected_ids may retain
 *  measured_validated / data_acquired_calculation_pending with measurement_rejected. */
export const BUCKET_ALLOWED_DISPOSITIONS: Record<
  (typeof LIFECYCLE_BUCKETS)[number],
  ReadonlySet<string>
> = {
  accepted_measured_ids: new Set(['measured_validated']),
  calculation_pending_ids: new Set(['data_acquired_calculation_pending']),
  // ONLY source_investigation_pending — crm_available_acquisition_pending is a PROVED
  // state and must NOT be silently absorbed here; it needs its own binding-authorized
  // placement, which no PKT01/02 metric uses.
  source_investigation_pending_ids: new Set(['source_investigation_pending']),
  accepted_disposition_only_ids: new Set([
    'external_source_required',
    'additional_history_required',
    'genuinely_not_available',
    'outside_sales_domain',
  ]),
  rejected_ids: new Set([
    'measured_validated',
    'data_acquired_calculation_pending',
  ]),
}
/** Evaluation states each bucket admits (used with the frozen consistency map). */
export const BUCKET_ALLOWED_EVAL_STATES: Record<
  (typeof LIFECYCLE_BUCKETS)[number],
  ReadonlySet<string>
> = {
  accepted_measured_ids: new Set(['measured_graded', 'measured_unscored']),
  calculation_pending_ids: new Set([
    'not_measured',
    'measured_unscored',
    'measured_abstained',
  ]),
  source_investigation_pending_ids: new Set(['not_measured']),
  accepted_disposition_only_ids: new Set(['not_measured']),
  rejected_ids: new Set(['measurement_rejected']),
}
/** Frozen metric_evaluation_state vocabulary. */
export const EVALUATION_STATES = new Set<string>([
  'not_measured',
  'measured_unscored',
  'measured_graded',
  'measured_abstained',
  'measurement_rejected',
])
/** Frozen disposition → allowed evaluation_state map (disposition_evaluation_consistency). */
export const DISPOSITION_EVAL_CONSISTENCY: Record<
  string,
  ReadonlyArray<string>
> = {
  measured_validated: [
    'measured_graded',
    'measured_unscored',
    'measurement_rejected',
  ],
  data_acquired_calculation_pending: [
    'not_measured',
    'measured_unscored',
    'measured_abstained',
    'measurement_rejected',
  ],
  crm_available_acquisition_pending: ['not_measured'],
  additional_history_required: ['not_measured'],
  external_source_required: ['not_measured'],
  genuinely_not_available: ['not_measured'],
  outside_sales_domain: ['not_measured'],
  source_investigation_pending: ['not_measured'],
}

/** The fully-declared, packet-agnostic unit of persistence. */
export type CanonicalRunEnvelope = {
  profile: string
  packet_id: string
  module: number
  dealer_id: string
  period: string
  run_key: string
  as_of: string
  engine_version: string
  binding_sha256: string
  source_sha256: string
  content_sha256: string
  acceptance_state: string
  definition_version: string
  reference_version: string
  target_version: string
  expected_metric_ids: Array<string>
  measured_metric_ids: Array<string>
  lifecycle_partition: Record<string, Array<string>>
  observations: Array<Observation>
  evaluations: Array<Evaluation>
  findings: Array<Finding>
  alert_simulations: Array<AlertSimulation>
  two_delta: TwoDelta
  reconciliation: Reconciliation
  metric_definitions: Array<MetricDefinitionSpec>
  source_artifacts: Array<SourceArtifactSpec>
  normalized_datasets: Array<NormalizedDatasetSpec>
  detection_rules: Array<DetectionRuleSpec>
  grade_targets: Array<GradeTargetSpec>
  comparison_references: Array<ComparisonReferenceSpec>
  /** Capability snapshots EXPLICITLY supplied + linked to this run (manifest covers
   *  exactly these; never a same-profile/dealer/period sweep). */
  capability_snapshots: Array<CapabilitySnapshotSpec>
  finding_specs: Array<FindingSpec>
  report_run: ReportRunSpec
  sales_only_admission: SalesOnlyAdmission
  /** normalized_dataset_id per metric_id — keys EXACTLY equal expected_metric_ids;
   *  null permitted only for disposition-only / unmeasured metrics. */
  dataset_id_by_metric: Record<string, string | null>
  /** Explicit evaluation→detection_rule identity per metric_id (null when the metric
   *  has no detection rule). No DR-id-by-convention guessing. */
  detection_rule_id_by_metric: Record<string, string | null>
  /** Binding-derived GOVERNED disposition per metric (keys EXACTLY equal expected).
   *  Authoritative vocabulary only (see DISPOSITION_BUCKET). Persisted to
   *  watchdog_metric_observation.disposition. */
  disposition_by_metric: Record<string, string>
  /** Binding-derived MEASUREMENT/evaluation state per metric (keys EXACTLY equal
   *  expected). Distinct from disposition; persisted to
   *  watchdog_metric_evaluation.evaluation_state. */
  evaluation_state_by_metric: Record<string, string>
  /** Frozen-schema exact field: the affirmative finite-investigation evidence ref per
   *  metric (keys EXACTLY equal expected). Non-null+non-empty is REQUIRED for a
   *  genuinely_not_available disposition; null otherwise. Persisted to
   *  watchdog_metric_observation.affirmative_investigation_evidence_ref. */
  affirmative_investigation_evidence_ref_by_metric: Record<
    string,
    string | null
  >
}

// ── Read-back shapes ─────────────────────────────────────────────────

export type StoredAlertCandidate = {
  metric_id: string
  would_fire: boolean
  channel: string
  delivered: boolean
  unsent: boolean
  message: string
}

/** Read-shape version. v1 = engine-shaped record arrays only (legacy). v2 = additive
 *  governed-field maps (disposition / evaluation_state / affirmative_investigation
 *  _evidence_ref) exposed generically. Older code reading only the v1 fields keeps
 *  working (backward compatible). */
export const STORED_CANONICAL_RUN_READ_VERSION = 2 as const

export type StoredCanonicalRun = {
  /** Read-shape version (2). */
  read_shape_version: typeof STORED_CANONICAL_RUN_READ_VERSION
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
  // v2 additive governed read fields (persisted columns the engine shapes cannot hold).
  /** GOVERNED disposition per metric (watchdog_metric_observation.disposition). */
  disposition_by_metric: Record<string, string>
  /** MEASUREMENT state per metric (watchdog_metric_evaluation.evaluation_state). */
  evaluation_state_by_metric: Record<string, string>
  /** Frozen-schema affirmative_investigation_evidence_ref per metric (null when N/A). */
  affirmative_investigation_evidence_ref_by_metric: Record<
    string,
    string | null
  >
}

export type RowCounts = {
  module_run: number
  metric_definition: number
  detection_rule: number
  source_artifact: number
  normalized_dataset: number
  capability_snapshot: number
  grade_target: number
  comparison_reference: number
  observation: number
  evaluation: number
  finding: number
  finding_metric_link: number
  report_run: number
  alert_candidate: number
  // v6 run→lineage + eval→rule link families (item 8: tally all four).
  run_source_link: number
  run_dataset_link: number
  run_capability_link: number
  eval_rule_link: number
}

export type CanonicalPersistResult = {
  changed: boolean
  runKey: string
  profile: string
  graphSha256: string | null
  /** Rows newly INSERTED this persist. */
  rows: RowCounts
  /** Shared immutable-parent rows that already existed and VERIFIED byte-identical. */
  verified: RowCounts
}

type Handle = ReturnType<typeof openBrain>

// ── helpers ──────────────────────────────────────────────────────────
const bool01 = (b: boolean): number => (b ? 1 : 0)
const intOrNull = (b: boolean | null): number | null =>
  b === null ? null : bool01(b)
const jsonOrNull = (v: unknown): string | null =>
  v === null || v === undefined ? null : canonicalJson(v)
const parse = <T>(s: string): T => JSON.parse(s) as T

function orderer(order: ReadonlyArray<string>) {
  const rank = (id: string): number => {
    const i = order.indexOf(id)
    return i === -1 ? order.length : i
  }
  return <T extends { metric_id: string }>(xs: Array<T>): Array<T> =>
    [...xs].sort((a, b) => rank(a.metric_id) - rank(b.metric_id))
}

function ensure(profile: string, profileRoot?: string): Handle {
  return openBrain(profile, { profileRoot })
}

function sameVal(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if ((a === null || a === undefined) && (b === null || b === undefined))
    return true
  return false
}

/**
 * Insert an immutable shared parent, or verify the existing row is byte-for-byte
 * identical. A same-key different-value collision throws (never silently ignored, as
 * INSERT OR IGNORE would). Returns whether the row was inserted or verified.
 */
function upsertImmutable(
  h: Handle,
  table: string,
  keyCols: Array<string>,
  cols: Array<string>,
  vals: Array<unknown>,
): 'inserted' | 'verified' {
  const where = keyCols.map((c) => `${c} = ?`).join(' AND ')
  const keyVals = keyCols.map((c) => vals[cols.indexOf(c)])
  const existing = h.get<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE ${where}`,
    ...keyVals,
  )
  if (!existing) {
    h.run(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      ...vals,
    )
    return 'inserted'
  }
  for (let i = 0; i < cols.length; i++) {
    if (!sameVal(existing[cols[i]], vals[i]))
      throw new CanonicalWatchdogStoreError(
        `${table}: immutable-parent collision on '${cols[i]}' for key (${keyVals.join(', ')}): ` +
          `stored ${JSON.stringify(existing[cols[i]])} != incoming ${JSON.stringify(vals[i])}`,
      )
  }
  return 'verified'
}

// ── content hash (generic, from the envelope) ────────────────────────

function contentOfRecord(env: CanonicalRunEnvelope): unknown {
  const byOrder = orderer(env.expected_metric_ids)
  return {
    packet_id: env.packet_id,
    module: env.module,
    dealer_id: env.dealer_id,
    period: env.period,
    binding_sha256: env.binding_sha256,
    source_sha256: env.source_sha256,
    engine_version: env.engine_version,
    lifecycle_partition: env.lifecycle_partition,
    observations: byOrder(env.observations),
    evaluations: byOrder(env.evaluations),
    findings: byOrder(env.findings),
    two_delta: env.two_delta,
    alert_simulations: byOrder(env.alert_simulations),
    reconciliation: env.reconciliation,
  }
}

/** Recompute the content-of-record hash from the envelope. */
export function envelopeContentSha(env: CanonicalRunEnvelope): string {
  return sha256Hex(canonicalJson(contentOfRecord(env)))
}

// ── generic fail-closed validation ───────────────────────────────────

function assertExactIds(
  ids: Array<string>,
  expected: ReadonlyArray<string>,
  label: string,
  Err: new (m: string) => Error,
): void {
  if (new Set(ids).size !== ids.length)
    throw new Err(`${label}: duplicate metric id [${ids.join(', ')}]`)
  const got = new Set(ids)
  const exp = new Set(expected)
  for (const id of ids)
    if (!exp.has(id))
      throw new Err(`${label}: unexpected/extra metric id ${id}`)
  for (const id of expected)
    if (!got.has(id)) throw new Err(`${label}: missing metric id ${id}`)
}

/** Generic, packet-agnostic pre-persist validation. Throws on any breach. */
export function validateEnvelope(env: CanonicalRunEnvelope): void {
  const E = CanonicalWatchdogStoreError
  if (env.expected_metric_ids.length === 0)
    throw new E('empty expected_metric_ids')
  const expected = env.expected_metric_ids
  const measured = env.measured_metric_ids
  // Unique expected/measured IDs (item 6 exact set logic).
  if (new Set(expected).size !== expected.length)
    throw new E(`expected_metric_ids has duplicates [${expected.join(', ')}]`)
  if (new Set(measured).size !== measured.length)
    throw new E(`measured_metric_ids has duplicates [${measured.join(', ')}]`)
  const expSet = new Set(expected)
  for (const id of measured)
    if (!expSet.has(id)) throw new E(`measured id ${id} not in expected set`)
  // measured EXACTLY equals lifecycle_partition.accepted_measured_ids (item 6).
  const acceptedMeasured = env.lifecycle_partition.accepted_measured_ids ?? []
  const accMSet = new Set(acceptedMeasured)
  if (accMSet.size !== acceptedMeasured.length)
    throw new E('accepted_measured_ids has duplicates')
  if (
    accMSet.size !== measured.length ||
    measured.some((id) => !accMSet.has(id))
  )
    throw new E(
      `measured [${[...measured].sort().join(',')}] != accepted_measured_ids ` +
        `[${[...acceptedMeasured].sort().join(',')}]`,
    )

  assertExactIds(
    env.observations.map((o) => o.metric_id),
    expected,
    'observations',
    E,
  )
  assertExactIds(
    env.evaluations.map((e) => e.metric_id),
    expected,
    'evaluations',
    E,
  )
  assertExactIds(
    env.alert_simulations.map((a) => a.metric_id),
    measured,
    'alert_simulations',
    E,
  )
  // Findings support MULTIPLE per metric/run: every finding's metric must be expected,
  // and every expected metric must be covered by at least one finding (no exact-one).
  for (const f of env.findings)
    if (!expSet.has(f.metric_id))
      throw new E(`findings: unexpected metric id ${f.metric_id}`)
  const coveredByFinding = new Set(env.findings.map((f) => f.metric_id))
  for (const id of expected)
    if (!coveredByFinding.has(id))
      throw new E(`findings: expected metric ${id} has no finding`)
  // Finding-spec keys must be unique per (finding_key, metric_id) and reference an
  // expected metric — the many-to-many link contract.
  const linkSeen = new Set<string>()
  for (const fs of env.finding_specs) {
    if (!expSet.has(fs.metric_id))
      throw new E(`finding_specs: unexpected metric id ${fs.metric_id}`)
    const k = JSON.stringify([fs.finding_key, fs.metric_id])
    if (linkSeen.has(k))
      throw new E(
        `finding_specs: duplicate link (${fs.finding_key}, ${fs.metric_id})`,
      )
    linkSeen.add(k)
  }
  // Item 2: EXACT order-aware bijection between the hashed findings (content-of-record)
  // and the persisted finding_specs (links). Same length, same per-position content, so
  // there is exactly one authoritative finding representation.
  if (env.findings.length !== env.finding_specs.length)
    throw new E(
      `finding bijection: ${env.findings.length} hashed findings != ${env.finding_specs.length} finding_specs`,
    )
  for (let i = 0; i < env.findings.length; i++) {
    const f = env.findings[i]
    const s = env.finding_specs[i]
    if (
      f.metric_id !== s.metric_id ||
      f.period !== s.period ||
      f.severity !== s.severity ||
      f.headline !== s.headline ||
      f.detail !== s.detail
    )
      throw new E(
        `finding bijection: position ${i} content mismatch (finding ${f.metric_id}/${f.headline} != spec ${s.metric_id}/${s.headline})`,
      )
  }

  // Lifecycle partition: EXACTLY the five authoritative bucket keys present; only that
  // vocabulary; buckets mutually exclusive; union EXACTLY equals the expected id set.
  const allowedBuckets = new Set<string>(LIFECYCLE_BUCKETS)
  const bucketKeys = Object.keys(env.lifecycle_partition)
  for (const b of bucketKeys)
    if (!allowedBuckets.has(b))
      throw new E(
        `lifecycle_partition: unknown bucket '${b}' (allowed: ${[...allowedBuckets].join(', ')})`,
      )
  for (const b of LIFECYCLE_BUCKETS)
    if (!(b in env.lifecycle_partition))
      throw new E(`lifecycle_partition: missing required bucket '${b}'`)
  const seenInBucket = new Map<string, string>()
  for (const [bucket, ids] of Object.entries(env.lifecycle_partition)) {
    for (const id of ids) {
      const prior = seenInBucket.get(id)
      if (prior)
        throw new E(
          `lifecycle_partition: ${id} in both '${prior}' and '${bucket}' (not exclusive)`,
        )
      seenInBucket.set(id, bucket)
      if (!expSet.has(id))
        throw new E(`lifecycle_partition: ${id} not in expected set`)
    }
  }
  for (const id of expected)
    if (!seenInBucket.has(id))
      throw new E(
        `lifecycle_partition: expected ${id} in no bucket (union != expected)`,
      )
  // Two binding-derived exact-key maps: GOVERNED disposition and MEASUREMENT state.
  // Keys of each EXACTLY equal expected.
  for (const [label, m] of [
    ['disposition_by_metric', env.disposition_by_metric] as const,
    ['evaluation_state_by_metric', env.evaluation_state_by_metric] as const,
  ]) {
    const keys = Object.keys(m)
    if (keys.length !== expected.length || keys.some((k) => !expSet.has(k)))
      throw new E(
        `${label} keys [${[...keys].sort().join(',')}] != expected [${[...expected].sort().join(',')}]`,
      )
  }
  const obsByMetric = new Map(env.observations.map((o) => [o.metric_id, o]))
  const evalByMetric = new Map(env.evaluations.map((e) => [e.metric_id, e]))
  const isGraded = (mid: string): boolean =>
    (evalByMetric.get(mid)?.gradable_state ?? '') === 'graded'
  for (const [id, bucketStr] of seenInBucket) {
    const bucket = bucketStr as (typeof LIFECYCLE_BUCKETS)[number]
    const disp = env.disposition_by_metric[id]
    const evState = env.evaluation_state_by_metric[id]
    if (!(disp in DISPOSITION_EVAL_CONSISTENCY))
      throw new E(`disposition '${disp}' for ${id} is not frozen vocabulary`)
    if (!EVALUATION_STATES.has(evState))
      throw new E(
        `evaluation_state '${evState}' for ${id} is not frozen vocabulary`,
      )
    // Frozen disposition→evaluation_state consistency map.
    if (!DISPOSITION_EVAL_CONSISTENCY[disp].includes(evState))
      throw new E(
        `${id}: evaluation_state '${evState}' not allowed for disposition '${disp}' ` +
          `(allowed: ${DISPOSITION_EVAL_CONSISTENCY[disp].join(', ')})`,
      )
    // Bucket is AUTHORITATIVE (from the binding). The (disposition, evaluation_state)
    // pair must be admitted by that bucket (Amendment 002) — not a one-to-one map.
    if (!BUCKET_ALLOWED_DISPOSITIONS[bucket].has(disp))
      throw new E(
        `${id}: disposition '${disp}' not admitted by bucket '${bucket}' ` +
          `(allowed: ${[...BUCKET_ALLOWED_DISPOSITIONS[bucket]].join(', ')})`,
      )
    if (!BUCKET_ALLOWED_EVAL_STATES[bucket].has(evState))
      throw new E(
        `${id}: evaluation_state '${evState}' not admitted by bucket '${bucket}' ` +
          `(allowed: ${[...BUCKET_ALLOWED_EVAL_STATES[bucket]].join(', ')})`,
      )
    // graded requires disposition measured_validated + evaluation_state measured_graded.
    if (isGraded(id)) {
      if (disp !== 'measured_validated')
        throw new E(
          `${id}: graded requires disposition measured_validated (got '${disp}')`,
        )
      if (evState !== 'measured_graded')
        throw new E(
          `${id}: graded requires evaluation_state measured_graded (got '${evState}')`,
        )
    }
    const o = obsByMetric.get(id)
    if (!o) continue
    // Value semantics: ONLY accepted_measured may carry a value (value required).
    // calculation_pending MUST be value===null UNCONDITIONALLY and ungraded/withheld —
    // there is NO measured_unscored / measured_abstained value exception (Defect-A
    // superseding correction). Open/terminal buckets must also be NULL
    // (missing≠zero, no fabricated value). Internal evidence prose remains a
    // companion/hypothesis note only — never a promoted value, grade, baseline, or
    // customer projection.
    if (bucket === 'accepted_measured_ids') {
      if (o.value === null)
        throw new E(`${id} accepted_measured requires a non-null value`)
    } else if (bucket === 'calculation_pending_ids') {
      if (isGraded(id))
        throw new E(`${id} calculation_pending may not be graded`)
      // value MUST be null regardless of evaluation_state (no measured_unscored /
      // measured_abstained value carve-out).
      if (o.value !== null)
        throw new E(
          `${id} calculation_pending must have NULL value ` +
            `(ungraded/withheld; no measured_unscored/measured_abstained value exception)`,
        )
    } else {
      // source_investigation_pending / accepted_disposition_only / rejected
      if (o.value !== null)
        throw new E(
          `${id} (${bucket}/${disp}) must have NULL value (no fabricated value)`,
        )
      if (bucket !== 'rejected_ids' && isGraded(id))
        throw new E(`${id} (${bucket}) may not be graded`)
    }
  }

  // Source / normalized-dataset / profile / dealer / period relationships + admission.
  const saById = new Map(
    env.source_artifacts.map((s) => [s.source_artifact_id, s]),
  )
  // Item 3/6: validate EACH admitted artifact independently against a STRUCTURED
  // admission receipt bound to the artifact's sha/schema/bytes/rows/profile/dealer/
  // period/admitted state and zero Service/Parts.
  for (const s of env.source_artifacts) {
    if (s.dealer_id !== env.dealer_id)
      throw new E(
        `source_artifact ${s.source_artifact_id}: dealer ${s.dealer_id} != ${env.dealer_id}`,
      )
    if (s.period !== env.period)
      throw new E(
        `source_artifact ${s.source_artifact_id}: period ${s.period} != ${env.period}`,
      )
    if (s.dealer_period_result !== 'admitted')
      throw new E(
        `source_artifact ${s.source_artifact_id}: not admitted (${s.dealer_period_result})`,
      )
    if (!s.family || !s.source_type)
      throw new E(
        `source_artifact ${s.source_artifact_id}: family/source_type required`,
      )
    const r = s.admission_receipt as
      | StructuredAdmissionReceipt
      | null
      | undefined
    if (r === null || r === undefined || typeof r !== 'object')
      throw new E(
        `source_artifact ${s.source_artifact_id}: missing admission_receipt`,
      )
    const need = (
      cond: boolean,
      field: string,
      got: unknown,
      want: unknown,
    ): void => {
      if (!cond)
        throw new E(
          `admission_receipt ${s.source_artifact_id}: ${field} ${JSON.stringify(got)} != ${JSON.stringify(want)}`,
        )
    }
    need(
      r.source_sha256 === s.source_sha256,
      'source_sha256',
      r.source_sha256,
      s.source_sha256,
    )
    need(r.profile === env.profile, 'profile', r.profile, env.profile)
    need(r.dealer_id === s.dealer_id, 'dealer_id', r.dealer_id, s.dealer_id)
    need(r.period === s.period, 'period', r.period, s.period)
    need(
      r.schema_contract_sha256 === (s.schema_contract_sha256 ?? null),
      'schema_contract_sha256',
      r.schema_contract_sha256,
      s.schema_contract_sha256 ?? null,
    )
    need(r.bytes === (s.bytes ?? null), 'bytes', r.bytes, s.bytes ?? null)
    need(
      r.row_count === (s.row_count ?? null),
      'row_count',
      r.row_count,
      s.row_count ?? null,
    )
    if (r.admitted !== true)
      throw new E(
        `admission_receipt ${s.source_artifact_id}: admitted must be true`,
      )
    if (r.zero_service_parts !== true)
      throw new E(
        `admission_receipt ${s.source_artifact_id}: zero_service_parts must be true`,
      )
    // Item 4: non-empty artifact-bound Sales-only proof + non-null contracted identity.
    if (!r.sales_only_proof || String(r.sales_only_proof).trim().length === 0)
      throw new E(
        `admission_receipt ${s.source_artifact_id}: empty sales_only_proof`,
      )
    for (const [f, val] of [
      ['source_sha256', s.source_sha256],
      ['schema_contract_sha256', s.schema_contract_sha256],
      ['bytes', s.bytes],
      ['row_count', s.row_count],
    ] as const)
      if (val === null || val === undefined)
        throw new E(
          `source_artifact ${s.source_artifact_id}: contracted identity field '${f}' is null`,
        )
  }
  const ndById = new Map(
    env.normalized_datasets.map((n) => [n.normalized_dataset_id, n]),
  )
  for (const n of env.normalized_datasets) {
    if (!saById.has(n.source_artifact_id))
      throw new E(
        `normalized_dataset ${n.normalized_dataset_id}: source_artifact ${n.source_artifact_id} not provided`,
      )
    if (
      n.dealer_id !== env.dealer_id ||
      n.period !== env.period ||
      n.profile !== env.profile
    )
      throw new E(
        `normalized_dataset ${n.normalized_dataset_id}: profile/dealer/period mismatch`,
      )
  }
  // Item 6/correction 4: dataset_id_by_metric keys EXACTLY equal expected_metric_ids.
  const dsKeys = Object.keys(env.dataset_id_by_metric)
  if (dsKeys.length !== expected.length || dsKeys.some((k) => !expSet.has(k)))
    throw new E(
      `dataset_id_by_metric keys [${[...dsKeys].sort().join(',')}] != expected ` +
        `[${[...expected].sort().join(',')}]`,
    )
  for (const [mid, dsId] of Object.entries(env.dataset_id_by_metric)) {
    if (dsId !== null && !ndById.has(dsId))
      throw new E(
        `dataset_id_by_metric[${mid}]: normalized_dataset ${dsId} not provided`,
      )
  }
  // Item 6: EXACT dataset/source mapping — every MEASURED metric maps to a normalized
  // dataset; a null mapping is allowed ONLY for a disposition-only / non-measured metric.
  for (const id of measured) {
    const dsId = env.dataset_id_by_metric[id] ?? null
    if (dsId === null)
      throw new E(
        `measured metric ${id} has no normalized_dataset mapping (only disposition-only metrics may)`,
      )
  }
  // Capability snapshots (correction 3): explicitly supplied + dealer/period match.
  const capIds = new Set<string>()
  for (const c of env.capability_snapshots) {
    if (capIds.has(c.capability_snapshot_id))
      throw new E(
        `capability_snapshot duplicate id ${c.capability_snapshot_id}`,
      )
    capIds.add(c.capability_snapshot_id)
    if (c.dealer_id !== env.dealer_id || c.period !== env.period)
      throw new E(
        `capability_snapshot ${c.capability_snapshot_id}: dealer/period != run`,
      )
  }

  // per-record period consistency
  for (const o of env.observations)
    if (o.period !== env.period)
      throw new E(
        `observation ${o.metric_id}: period ${o.period} != run ${env.period}`,
      )
  for (const ev of env.evaluations)
    if (ev.period !== env.period)
      throw new E(
        `evaluation ${ev.metric_id}: period ${ev.period} != run ${env.period}`,
      )
  for (const f of env.findings)
    if (f.period !== env.period)
      throw new E(
        `finding ${f.metric_id}: period ${f.period} != run ${env.period}`,
      )

  // inert alerts (all packets)
  for (const a of env.alert_simulations)
    if ((a.delivered as boolean) !== false || (a.unsent as boolean) !== true)
      throw new E(
        `alert ${a.metric_id}: not inert (delivered must be false, unsent true)`,
      )

  // Sales-only admission (never weakened for any packet)
  const adm = env.sales_only_admission
  if (adm.zero_service_parts !== true)
    throw new E('sales_only_admission.zero_service_parts must be true')
  if (!adm.proof || adm.proof.trim().length === 0)
    throw new E('sales_only_admission.proof is empty')
  if (adm.dealer_id !== env.dealer_id)
    throw new E(
      `sales_only_admission dealer ${adm.dealer_id} != run ${env.dealer_id}`,
    )

  // FAIL-CLOSED target/reference/rule authority (item 7): a non-null grade_target_id /
  // reference_id / detection_rule used by an evaluation MUST be supplied AND its
  // metric_id + metric_version must EXACTLY match the evaluation's metric (per-metric,
  // per-version authority + explicit evaluation→rule linkage — no cross-metric leakage).
  const defVersion = new Map(
    env.metric_definitions.map((d) => [d.metric_id, d.metric_version]),
  )
  const gtById = new Map(env.grade_targets.map((g) => [g.grade_target_id, g]))
  const refById = new Map(
    env.comparison_references.map((r) => [r.reference_id, r]),
  )
  const ruleById = new Map(
    env.detection_rules.map((dr) => [dr.detection_rule_id, dr]),
  )
  for (const ev of env.evaluations) {
    const ver = defVersion.get(ev.metric_id) ?? env.definition_version
    if (ev.grade_target_id) {
      const g = gtById.get(ev.grade_target_id)
      if (!g)
        throw new E(
          `evaluation ${ev.metric_id}: grade_target_id ${ev.grade_target_id} has no supplied target authority (fail-closed)`,
        )
      if (g.metric_id !== ev.metric_id || g.metric_version !== ver)
        throw new E(
          `evaluation ${ev.metric_id}@${ver}: grade_target ${g.grade_target_id} authority is for ` +
            `${g.metric_id}@${g.metric_version} (metric/version mismatch)`,
        )
      // A graded evaluation may not point at an unapproved target.
      if (ev.gradable_state === 'graded' && g.approval_state !== 'approved')
        throw new E(
          `evaluation ${ev.metric_id}: graded against non-approved target ${g.grade_target_id} (${g.approval_state})`,
        )
    }
    if (ev.reference_id) {
      const r = refById.get(ev.reference_id)
      if (!r)
        throw new E(
          `evaluation ${ev.metric_id}: reference_id ${ev.reference_id} has no supplied comparison reference`,
        )
      if (r.metric_id !== ev.metric_id || r.metric_version !== ver)
        throw new E(
          `evaluation ${ev.metric_id}@${ver}: comparison_reference ${r.reference_id} authority is for ` +
            `${r.metric_id}@${r.metric_version} (metric/version mismatch)`,
        )
    }
    // Item 7 / correction 5: EXPLICIT evaluation→detection-rule identity. A detecting
    // evaluation must name a detection_rule_id (via detection_rule_id_by_metric) that is
    // supplied, matches this metric+version, and whose condition equals the evaluation's.
    const drId = env.detection_rule_id_by_metric[ev.metric_id] ?? null
    if (ev.detection_rule) {
      if (drId === null)
        throw new E(
          `evaluation ${ev.metric_id}: detection_rule present but no detection_rule_id linked`,
        )
      const dr = ruleById.get(drId)
      if (!dr)
        throw new E(
          `evaluation ${ev.metric_id}: detection_rule_id ${drId} not supplied`,
        )
      if (dr.metric_id !== ev.metric_id || dr.metric_version !== ver)
        throw new E(
          `evaluation ${ev.metric_id}@${ver}: detection_rule ${drId} authority is for ` +
            `${dr.metric_id}@${dr.metric_version} (metric/version mismatch)`,
        )
      if (dr.condition !== ev.detection_rule)
        throw new E(
          `evaluation ${ev.metric_id}: detection_rule ${drId} condition "${dr.condition}" ` +
            `!= evaluation condition "${ev.detection_rule}"`,
        )
    } else if (drId !== null) {
      throw new E(
        `evaluation ${ev.metric_id}: detection_rule_id ${drId} linked but no detection condition`,
      )
    }
  }
  // Correction 5.1: detection_rule_id_by_metric keys EXACTLY equal expected_metric_ids
  // — explicit null for a metric with no rule; omission is not an explicit decision.
  const drKeys = Object.keys(env.detection_rule_id_by_metric)
  if (drKeys.length !== expected.length || drKeys.some((k) => !expSet.has(k)))
    throw new E(
      `detection_rule_id_by_metric keys [${[...drKeys].sort().join(',')}] != expected ` +
        `[${[...expected].sort().join(',')}]`,
    )

  // Item 2: EXACTLY one metric definition per expected id; module-consistent.
  const defIds = env.metric_definitions.map((d) => d.metric_id)
  if (new Set(defIds).size !== defIds.length)
    throw new E('metric_definitions: duplicate metric_id')
  if (defIds.length !== expected.length || defIds.some((id) => !expSet.has(id)))
    throw new E(
      `metric_definitions set [${[...defIds].sort().join(',')}] != expected [${[...expected].sort().join(',')}]`,
    )
  for (const d of env.metric_definitions)
    if (d.module !== env.module)
      throw new E(
        `metric_definition ${d.metric_id}: module ${d.module} != run ${env.module}`,
      )

  // Item 5: authorities are version-addressable + UNAMBIGUOUS (unique id in the envelope).
  const dupCheck = (ids: Array<string>, label: string): void => {
    if (new Set(ids).size !== ids.length)
      throw new E(`${label}: ambiguous duplicate id [${ids.join(', ')}]`)
  }
  dupCheck(
    env.detection_rules.map((r) => r.detection_rule_id),
    'detection_rules',
  )
  dupCheck(
    env.grade_targets.map((g) => g.grade_target_id),
    'grade_targets',
  )
  dupCheck(
    env.comparison_references.map((r) => r.reference_id),
    'comparison_references',
  )

  // Item 2: no UNUSED/EXTRA authorities — supplied set exactly equals the linked/used set.
  const setEq = (a: Set<string>, b: Set<string>): boolean =>
    a.size === b.size && [...a].every((x) => b.has(x))
  const linkedRuleIds = new Set(
    Object.values(env.detection_rule_id_by_metric).filter(
      (x): x is string => !!x,
    ),
  )
  if (
    !setEq(
      new Set(env.detection_rules.map((r) => r.detection_rule_id)),
      linkedRuleIds,
    )
  )
    throw new E(
      'detection_rules supplied != linked (unused/extra detection rule)',
    )
  const usedGradeIds = new Set(
    env.evaluations
      .map((e) => e.grade_target_id)
      .filter((x): x is string => !!x),
  )
  if (
    !setEq(
      new Set(env.grade_targets.map((g) => g.grade_target_id)),
      usedGradeIds,
    )
  )
    throw new E('grade_targets supplied != used (unused/extra grade target)')
  const usedRefIds = new Set(
    env.evaluations.map((e) => e.reference_id).filter((x): x is string => !!x),
  )
  if (
    !setEq(
      new Set(env.comparison_references.map((r) => r.reference_id)),
      usedRefIds,
    )
  )
    throw new E(
      'comparison_references supplied != used (unused/extra reference)',
    )

  // Item 5: the detecting evaluation's rule must match threshold_id/comparator/threshold
  // AND be approved+active (not just condition/metric/version).
  for (const ev of env.evaluations) {
    const drId = env.detection_rule_id_by_metric[ev.metric_id]
    if (ev.detection_rule && drId) {
      const dr = ruleById.get(drId)!
      if ((dr.threshold_id ?? null) !== (ev.threshold_id ?? null))
        throw new E(`${ev.metric_id}: detection_rule threshold_id mismatch`)
      if ((dr.comparator ?? null) !== (ev.comparator ?? null))
        throw new E(`${ev.metric_id}: detection_rule comparator mismatch`)
      if ((dr.threshold ?? null) !== (ev.threshold ?? null))
        throw new E(`${ev.metric_id}: detection_rule threshold mismatch`)
      if (dr.approval_state !== 'approved' || dr.status !== 'active')
        throw new E(
          `${ev.metric_id}: detecting rule ${drId} must be approved+active`,
        )
    }
  }

  // Item 6: any target/reference capability_snapshot_id resolves to a SUPPLIED snapshot
  // with compatible dealer/period.
  const capById = new Map(
    env.capability_snapshots.map((c) => [c.capability_snapshot_id, c]),
  )
  const checkCap = (cid: string | null | undefined, who: string): void => {
    if (cid == null) return
    const c = capById.get(cid)
    if (!c)
      throw new E(
        `${who}: capability_snapshot_id ${cid} not supplied/run-linked`,
      )
    if (c.dealer_id !== env.dealer_id || c.period !== env.period)
      throw new E(`${who}: capability ${cid} dealer/period incompatible`)
  }
  for (const g of env.grade_targets)
    checkCap(g.capability_snapshot_id, `grade_target ${g.grade_target_id}`)
  for (const r of env.comparison_references)
    checkCap(r.capability_snapshot_id, `comparison_reference ${r.reference_id}`)

  // Item 7: report inertness — lineage == env.two_delta; undelivered; inactive.
  const rr = env.report_run
  if (canonicalJson(rr.report_lineage) !== canonicalJson(env.two_delta))
    throw new E('report_run.report_lineage != env.two_delta')
  if (rr.delivery_state !== 'undelivered')
    throw new E(
      `report_run delivery_state must be undelivered (got ${rr.delivery_state})`,
    )
  if ((rr.activation_state ?? 'inactive') !== 'inactive')
    throw new E(
      `report_run activation_state must be inactive (got ${rr.activation_state})`,
    )

  // Item 4 (strict): every MAPPED metric's embedded source_lineage requires NON-NULL
  // source_sha256 + schema_contract_sha256 + receipt_sha256, each EXACTLY matching its
  // bound artifact AND that artifact's structured admission receipt. A value-bearing
  // measured_unscored observation must be mapped (non-null dataset lineage).
  for (const o of env.observations) {
    const dsId = env.dataset_id_by_metric[o.metric_id]
    const evState = env.evaluation_state_by_metric[o.metric_id]
    if (o.value !== null && evState === 'measured_unscored' && dsId == null)
      throw new E(
        `${o.metric_id}: measured_unscored value requires non-null dataset lineage`,
      )
    if (dsId == null) continue
    const nd = ndById.get(dsId)!
    const sa = saById.get(nd.source_artifact_id)!
    const rec = sa.admission_receipt
    const sl = o.source_lineage
    if (
      sl.source_sha256 == null ||
      sl.schema_contract_sha256 == null ||
      sl.receipt_sha256 == null
    )
      throw new E(
        `${o.metric_id}: mapped source_lineage requires non-null source/schema/receipt sha`,
      )
    if (
      sl.source_sha256 !== sa.source_sha256 ||
      sl.source_sha256 !== rec.source_sha256
    )
      throw new E(
        `${o.metric_id}: source_lineage source_sha256 != artifact/receipt`,
      )
    if (
      sl.schema_contract_sha256 !== (sa.schema_contract_sha256 ?? null) ||
      sl.schema_contract_sha256 !== rec.schema_contract_sha256
    )
      throw new E(
        `${o.metric_id}: source_lineage schema_contract_sha256 != artifact/receipt`,
      )
    if (sl.receipt_sha256 !== (sa.receipt_sha256 ?? null))
      throw new E(
        `${o.metric_id}: source_lineage receipt_sha256 != artifact receipt_sha256`,
      )
    if (sl.dealer_id !== sa.dealer_id)
      throw new E(`${o.metric_id}: source_lineage dealer != artifact dealer`)
    if (sl.period !== sa.period)
      throw new E(`${o.metric_id}: source_lineage period != artifact period`)
  }

  // Frozen-schema exact field: affirmative_investigation_evidence_ref_by_metric keys
  // EXACTLY equal expected; a genuinely_not_available disposition REQUIRES the exact
  // named non-empty ref (generic source_investigation prose does NOT satisfy this).
  const airKeys = Object.keys(
    env.affirmative_investigation_evidence_ref_by_metric,
  )
  if (airKeys.length !== expected.length || airKeys.some((k) => !expSet.has(k)))
    throw new E(
      `affirmative_investigation_evidence_ref_by_metric keys [${[...airKeys].sort().join(',')}] != expected`,
    )
  // Defect-B strict IFF. genuinely_not_available REQUIRES a trimmed non-empty STRING;
  // EVERY non-GNA metric REQUIRES literal null — undefined, blank ('' / whitespace),
  // and any non-blank string all reject. (A non-string type for GNA also rejects.)
  for (const id of expected) {
    const ref = env.affirmative_investigation_evidence_ref_by_metric[id]
    if (env.disposition_by_metric[id] === 'genuinely_not_available') {
      if (typeof ref !== 'string' || ref.trim().length === 0)
        throw new E(
          `${id}: genuinely_not_available requires a trimmed non-empty string ` +
            `affirmative_investigation_evidence_ref (got ` +
            `${ref === undefined ? 'undefined' : JSON.stringify(ref)})`,
        )
    } else {
      if (ref !== null)
        throw new E(
          `${id}: non-genuinely_not_available disposition requires ` +
            `affirmative_investigation_evidence_ref === null (got ` +
            `${ref === undefined ? 'undefined' : JSON.stringify(ref)})`,
        )
    }
  }

  // content hash must recompute
  const recon = envelopeContentSha(env)
  if (recon !== env.content_sha256)
    throw new E(
      `content_sha256 mismatch: recomputed ${recon} != ${env.content_sha256}`,
    )
}

// ── write ────────────────────────────────────────────────────────────

function zeroRows(): RowCounts {
  return {
    module_run: 0,
    metric_definition: 0,
    detection_rule: 0,
    source_artifact: 0,
    normalized_dataset: 0,
    capability_snapshot: 0,
    grade_target: 0,
    comparison_reference: 0,
    observation: 0,
    evaluation: 0,
    finding: 0,
    finding_metric_link: 0,
    report_run: 0,
    alert_candidate: 0,
    run_source_link: 0,
    run_dataset_link: 0,
    run_capability_link: 0,
    eval_rule_link: 0,
  }
}

/**
 * Deterministic graph sha of an INCOMING envelope — computed by persisting it into an
 * isolated scratch Brain and reconstructing the manifest with the EXACT same function
 * the read path uses (zero alignment risk). Rolled back + removed; nothing durable.
 * Enables item-1 comparison: same run_key/content_sha256 but changed semantic metadata
 * yields a different graph sha and must fail.
 */
function envelopeGraphSha(env: CanonicalRunEnvelope): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-scratch-'))
  try {
    const h = openBrain(env.profile, { profileRoot: tmp })
    h.exec('BEGIN')
    try {
      insertGraph(h, env)
      const manifest = reconstructGraphManifest(
        h,
        env.run_key,
        env.profile,
        env.expected_metric_ids,
      )
      return sha256Hex(canonicalJson(manifest))
    } finally {
      h.exec('ROLLBACK')
      h.close()
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/** Count the persisted graph rows for a run (item 8: replay reports verified, not 0). */
function countGraphRows(h: Handle, runKey: string, profile: string): RowCounts {
  const one = (sql: string, ...p: Array<unknown>): number =>
    h.get<{ n: number }>(sql, ...p)?.n ?? 0
  const rk = runKey
  return {
    module_run: one(
      `SELECT COUNT(*) n FROM watchdog_module_run WHERE run_key=?`,
      rk,
    ),
    metric_definition: one(
      `SELECT COUNT(DISTINCT o.metric_id||'@'||o.metric_version) n FROM watchdog_metric_observation o WHERE o.run_key=?`,
      rk,
    ),
    // exact linked graph: detection rules via the eval→rule LINK table (not condition).
    detection_rule: one(
      `SELECT COUNT(DISTINCT detection_rule_id) n FROM watchdog_evaluation_detection_rule WHERE run_key=?`,
      rk,
    ),
    source_artifact: one(
      `SELECT COUNT(*) n FROM watchdog_run_source_artifact WHERE run_key=?`,
      rk,
    ),
    normalized_dataset: one(
      `SELECT COUNT(*) n FROM watchdog_run_normalized_dataset WHERE run_key=?`,
      rk,
    ),
    capability_snapshot: one(
      `SELECT COUNT(*) n FROM watchdog_run_capability_snapshot WHERE run_key=?`,
      rk,
    ),
    grade_target: one(
      `SELECT COUNT(DISTINCT e.grade_target_id||'@'||e.grade_target_version) n
         FROM watchdog_metric_evaluation e WHERE e.run_key=? AND e.grade_target_id IS NOT NULL`,
      rk,
    ),
    comparison_reference: one(
      `SELECT COUNT(DISTINCT e.reference_id||'@'||e.reference_version) n
         FROM watchdog_metric_evaluation e WHERE e.run_key=? AND e.reference_id IS NOT NULL`,
      rk,
    ),
    observation: one(
      `SELECT COUNT(*) n FROM watchdog_metric_observation WHERE run_key=?`,
      rk,
    ),
    evaluation: one(
      `SELECT COUNT(*) n FROM watchdog_metric_evaluation WHERE run_key=?`,
      rk,
    ),
    finding: one(
      `SELECT COUNT(DISTINCT finding_key) n FROM watchdog_finding_metric_link WHERE run_key=?`,
      rk,
    ),
    finding_metric_link: one(
      `SELECT COUNT(*) n FROM watchdog_finding_metric_link WHERE run_key=?`,
      rk,
    ),
    report_run: one(
      `SELECT COUNT(*) n FROM watchdog_report_run_module_link WHERE run_key=?`,
      rk,
    ),
    alert_candidate: one(
      `SELECT COUNT(*) n FROM watchdog_alert_candidate WHERE run_key=?`,
      rk,
    ),
    run_source_link: one(
      `SELECT COUNT(*) n FROM watchdog_run_source_artifact WHERE run_key=?`,
      rk,
    ),
    run_dataset_link: one(
      `SELECT COUNT(*) n FROM watchdog_run_normalized_dataset WHERE run_key=?`,
      rk,
    ),
    run_capability_link: one(
      `SELECT COUNT(*) n FROM watchdog_run_capability_snapshot WHERE run_key=?`,
      rk,
    ),
    eval_rule_link: one(
      `SELECT COUNT(*) n FROM watchdog_evaluation_detection_rule WHERE run_key=?`,
      rk,
    ),
  }
}

export function persistCanonicalRunEnvelope(
  env: CanonicalRunEnvelope,
  opts: { profileRoot?: string } = {},
): CanonicalPersistResult {
  validateEnvelope(env)
  const profile = env.profile
  const h = ensure(profile, opts.profileRoot)

  const prev = h.get<{ content_sha256: string }>(
    `SELECT content_sha256 FROM watchdog_module_run WHERE run_key = ? AND profile = ?`,
    env.run_key,
    profile,
  )
  if (prev) {
    if (prev.content_sha256 !== env.content_sha256)
      throw new CanonicalWatchdogStoreError(
        `run_key ${env.run_key} already persisted with different content_sha256 ` +
          `(${prev.content_sha256} != ${env.content_sha256}); refusing to overwrite`,
      )
    // Verify the FULL graph (incl. graph manifest/sha) before any no-op replay.
    const verified = readCanonicalRun(env.run_key, {
      profile,
      profileRoot: opts.profileRoot,
    })
    if (!verified)
      throw new CanonicalWatchdogIntegrityError(
        `run_key ${env.run_key} anchor present but graph did not reconstruct`,
      )
    if (verified.content_sha256 !== env.content_sha256)
      throw new CanonicalWatchdogIntegrityError(
        `run_key ${env.run_key} persisted content ${verified.content_sha256} != ${env.content_sha256}`,
      )
    const stored = h.get<{ graph_sha256: string | null }>(
      `SELECT graph_sha256 FROM watchdog_module_run WHERE run_key = ?`,
      env.run_key,
    )?.graph_sha256
    // Item 1: compare the INCOMING complete graph to the stored graph. Same run_key +
    // content hash but CHANGED semantic metadata (approvals, versions, receipts, links)
    // diverges the graph sha and MUST fail — never a false no-op.
    const incomingGraphSha = envelopeGraphSha(env)
    if (stored == null)
      throw new CanonicalWatchdogIntegrityError(
        `run_key ${env.run_key}: no stored graph_sha256 to compare on replay`,
      )
    if (incomingGraphSha !== stored)
      throw new CanonicalWatchdogIntegrityError(
        `run_key ${env.run_key}: incoming graph_sha256 ${incomingGraphSha} != stored ${stored} ` +
          `(same content hash, changed semantic metadata)`,
      )
    return {
      changed: false,
      runKey: env.run_key,
      profile,
      graphSha256: stored,
      // Item 8: replay reports VERIFIED counts (the persisted graph it re-verified),
      // never verified=0.
      rows: zeroRows(),
      verified: countGraphRows(h, env.run_key, profile),
    }
  }

  h.exec('BEGIN')
  try {
    const { rows, verified } = insertGraph(h, env)
    // Graph manifest + SHA computed from the PERSISTED rows (same function the read
    // path uses), so tampering any metadata NOT in the PacketRun content hash
    // (approval states, versions, admission receipts, links) diverges graph_sha256.
    const manifest = reconstructGraphManifest(
      h,
      env.run_key,
      profile,
      env.expected_metric_ids,
    )
    const graphSha256 = sha256Hex(canonicalJson(manifest))
    // Item 1 (before first commit): the reconstructed persisted graph must equal the
    // deterministic incoming envelope graph — no insertion loss/mangling before commit.
    const incomingGraphSha = envelopeGraphSha(env)
    if (graphSha256 !== incomingGraphSha)
      throw new CanonicalWatchdogIntegrityError(
        `run_key ${env.run_key}: persisted graph_sha256 ${graphSha256} != incoming ${incomingGraphSha} ` +
          `(insertion did not round-trip the envelope)`,
      )
    h.run(
      `UPDATE watchdog_module_run SET graph_manifest = ?, graph_sha256 = ? WHERE run_key = ?`,
      canonicalJson(manifest),
      graphSha256,
      env.run_key,
    )
    h.exec('COMMIT')
    return {
      changed: true,
      runKey: env.run_key,
      profile,
      graphSha256,
      rows,
      verified,
    }
  } catch (err) {
    h.exec('ROLLBACK')
    throw err
  }
}

const DEF_COLS = [
  'metric_id',
  'metric_version',
  'module',
  'business_question',
  'boundary_class',
  'population',
  'calculation_kind',
  'null_missing_behavior',
  'unit',
  'polarity',
  'window',
  'timezone',
  'cadence',
  'formula',
  'numerator_definition',
  'denominator_definition',
  'required_fields',
  'required_sources',
  'impact_method',
  'gradable',
  'sensitivity_class',
  'effective_start',
  'effective_end',
  'definition_status',
]
const SRC_COLS = [
  'source_artifact_id',
  'profile',
  'family',
  'source_type',
  'raw_location',
  'source_sha256',
  'dealer_id',
  'period',
  'schema_version',
  'schema_contract_sha256',
  'receipt_sha256',
  'bytes',
  'row_count',
  'dealer_period_result',
  'admission_receipt',
]
const ND_COLS = [
  'normalized_dataset_id',
  'source_artifact_id',
  'profile',
  'dealer_id',
  'period',
  'normalized_sha256',
  'filter_spec',
  'row_key_set_hash',
  'row_key_set_hash_method',
  'timezone',
  'as_of',
  'watermark',
  'late_correction_version',
  'transform_config_hash',
  'transformation_code_hash',
  'join_keys',
  'join_cardinality',
  'unmatched_counts',
  'io_reconciliation',
]
const DR_COLS = [
  'detection_rule_id',
  'metric_id',
  'metric_version',
  'threshold_id',
  'condition',
  'comparator',
  'threshold',
  'provenance',
  'effective_start',
  'effective_end',
  'approval_state',
  'status',
  'evaluation_semantics',
]
const CR_COLS = [
  'reference_id',
  'reference_version',
  'metric_id',
  'metric_version',
  'profile',
  'basis',
  'formula',
  'value_or_range',
  'unit',
  'comparator',
  'polarity',
  'source',
  'publication_date',
  'valid_period',
  'capability_snapshot_id',
  'inputs',
  'assumptions',
  'minimum_sample',
  'history_ref',
  'confidence',
  'compatibility_result',
  'approval_state',
  'status',
  'derivation_narrative',
]
const GT_COLS = [
  'grade_target_id',
  'target_version',
  'metric_id',
  'metric_version',
  'profile',
  'basis',
  'value_or_range',
  'unit',
  'comparator',
  'polarity',
  'source',
  'provenance',
  'publication_date',
  'effective_start',
  'effective_end',
  'valid_period',
  'capability_snapshot_id',
  'inputs',
  'assumptions',
  'minimum_sample',
  'history_ref',
  'confidence',
  'compatibility_result',
  'approval_state',
  'status',
  'derivation_narrative',
]
const CAP_COLS = [
  'capability_snapshot_id',
  'profile',
  'dealer_id',
  'period',
  'revision',
  'supersedes_id',
  'throughput',
  'workforce',
  'workload_capacity',
  'inventory_context',
  'source_mix',
  'dealer_history',
  'seasonality_flags',
  'manual_potential',
  'provenance',
]

function insertGraph(
  h: Handle,
  env: CanonicalRunEnvelope,
): { rows: RowCounts; verified: RowCounts } {
  const ts = nowMs()
  const profile = env.profile
  const rows = zeroRows()
  const verified = zeroRows()
  const tally = (r: 'inserted' | 'verified', key: keyof RowCounts): void => {
    if (r === 'inserted') rows[key] += 1
    else verified[key] += 1
  }

  for (const d of env.metric_definitions) {
    tally(
      upsertImmutable(
        h,
        'watchdog_metric_definition',
        ['metric_id', 'metric_version'],
        DEF_COLS,
        [
          d.metric_id,
          d.metric_version,
          d.module,
          d.business_question ?? null,
          d.boundary_class ?? null,
          d.population ?? null,
          d.calculation_kind,
          d.null_missing_behavior ?? null,
          d.unit,
          d.polarity ?? null,
          d.window ?? null,
          d.timezone ?? null,
          d.cadence ?? null,
          d.formula ?? null,
          d.numerator_definition ?? null,
          d.denominator_definition ?? null,
          jsonOrNull(d.required_fields),
          jsonOrNull(d.required_sources),
          d.impact_method ?? null,
          bool01(d.gradable),
          d.sensitivity_class ?? null,
          d.effective_start ?? null,
          d.effective_end ?? null,
          d.definition_status,
        ],
      ),
      'metric_definition',
    )
  }

  for (const s of env.source_artifacts) {
    tally(
      upsertImmutable(
        h,
        'watchdog_source_artifact',
        ['source_artifact_id'],
        SRC_COLS,
        [
          s.source_artifact_id,
          profile,
          s.family,
          s.source_type,
          s.raw_location ?? null,
          s.source_sha256,
          s.dealer_id,
          s.period,
          s.schema_version ?? null,
          s.schema_contract_sha256 ?? null,
          s.receipt_sha256 ?? null,
          s.bytes ?? null,
          s.row_count ?? null,
          s.dealer_period_result,
          canonicalJson(s.admission_receipt),
        ],
      ),
      'source_artifact',
    )
  }

  for (const n of env.normalized_datasets) {
    tally(
      upsertImmutable(
        h,
        'watchdog_normalized_dataset',
        ['normalized_dataset_id'],
        ND_COLS,
        [
          n.normalized_dataset_id,
          n.source_artifact_id,
          profile,
          n.dealer_id,
          n.period,
          n.normalized_sha256 ?? null,
          n.filter_spec ?? null,
          n.row_key_set_hash ?? null,
          n.row_key_set_hash_method ?? null,
          n.timezone ?? null,
          n.as_of ?? null,
          null,
          null,
          n.transform_config_hash ?? null,
          n.transformation_code_hash ?? null,
          n.join_keys ?? null,
          null,
          null,
          n.io_reconciliation ?? null,
        ],
      ),
      'normalized_dataset',
    )
  }

  // Capability snapshots — insert-or-verify-identical; BEFORE targets/references that
  // FK to them (item 6).
  for (const c of env.capability_snapshots) {
    tally(
      upsertImmutable(
        h,
        'watchdog_capability_snapshot',
        ['capability_snapshot_id'],
        CAP_COLS,
        [
          c.capability_snapshot_id,
          profile,
          c.dealer_id,
          c.period,
          c.revision ?? 1,
          c.supersedes_id ?? null,
          c.throughput ?? null,
          c.workforce ?? null,
          c.workload_capacity ?? null,
          c.inventory_context ?? null,
          c.source_mix ?? null,
          c.dealer_history ?? null,
          c.seasonality_flags ?? null,
          c.manual_potential ?? null,
          c.provenance ?? null,
        ],
      ),
      'capability_snapshot',
    )
  }

  for (const dr of env.detection_rules) {
    tally(
      upsertImmutable(
        h,
        'watchdog_detection_rule',
        ['detection_rule_id'],
        DR_COLS,
        [
          dr.detection_rule_id,
          dr.metric_id,
          dr.metric_version,
          dr.threshold_id ?? null,
          dr.condition ?? null,
          dr.comparator ?? null,
          dr.threshold ?? null,
          dr.provenance ?? null,
          null,
          null,
          dr.approval_state ?? null,
          dr.status ?? null,
          dr.evaluation_semantics ?? null,
        ],
      ),
      'detection_rule',
    )
  }

  for (const c of env.comparison_references) {
    tally(
      upsertImmutable(
        h,
        'watchdog_comparison_reference',
        ['reference_id', 'reference_version'],
        CR_COLS,
        [
          c.reference_id,
          c.reference_version,
          c.metric_id,
          c.metric_version,
          profile,
          c.basis ?? null,
          c.formula ?? null,
          c.value_or_range ?? null,
          c.unit ?? null,
          c.comparator ?? null,
          c.polarity ?? null,
          c.source ?? null,
          c.publication_date ?? null,
          c.valid_period ?? null,
          c.capability_snapshot_id ?? null,
          c.inputs ?? null,
          c.assumptions ?? null,
          c.minimum_sample ?? null,
          c.history_ref ?? null,
          c.confidence ?? null,
          c.compatibility_result ?? null,
          c.approval_state ?? null,
          c.status ?? null,
          c.derivation_narrative ?? null,
        ],
      ),
      'comparison_reference',
    )
  }

  for (const g of env.grade_targets) {
    tally(
      upsertImmutable(
        h,
        'watchdog_grade_target',
        ['grade_target_id', 'target_version'],
        GT_COLS,
        [
          g.grade_target_id,
          g.target_version,
          g.metric_id,
          g.metric_version,
          profile,
          g.basis ?? null,
          g.value_or_range ?? null,
          g.unit ?? null,
          g.comparator ?? null,
          g.polarity ?? null,
          g.source ?? null,
          g.provenance ?? null,
          g.publication_date ?? null,
          g.effective_start ?? null,
          g.effective_end ?? null,
          g.valid_period ?? null,
          g.capability_snapshot_id ?? null,
          g.inputs ?? null,
          g.assumptions ?? null,
          g.minimum_sample ?? null,
          g.history_ref ?? null,
          g.confidence ?? null,
          g.compatibility_result ?? null,
          g.approval_state,
          g.status,
          g.derivation_narrative ?? null,
        ],
      ),
      'grade_target',
    )
  }

  // Buckets are optional per packet, so model index access as possibly-undefined.
  const lp = env.lifecycle_partition as Record<
    string,
    Array<string> | undefined
  >
  h.run(
    `INSERT INTO watchdog_module_run
       (run_key, profile, packet_id, module, dealer_id, period, binding_sha256,
        source_sha256, engine_version, content_sha256, expected_subset,
        accepted_measured_ids, accepted_disposition_only_ids, rejected_ids,
        lifecycle_partition, report_lineage, input_hash, output_hash, reconciliation,
        qc_result, acceptance_state, graph_manifest, graph_sha256, as_of, persisted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    env.run_key,
    profile,
    env.packet_id,
    env.module,
    env.dealer_id,
    env.period,
    env.binding_sha256,
    env.source_sha256,
    env.engine_version,
    env.content_sha256,
    canonicalJson(env.expected_metric_ids),
    canonicalJson(lp.accepted_measured_ids ?? env.measured_metric_ids),
    canonicalJson(lp.accepted_disposition_only_ids ?? []),
    canonicalJson(lp.rejected_ids ?? []),
    canonicalJson(lp),
    canonicalJson(env.two_delta),
    env.source_sha256,
    env.content_sha256,
    canonicalJson(env.reconciliation),
    env.reconciliation.ok ? 'pass' : 'fail',
    env.acceptance_state,
    null,
    null,
    env.as_of,
    ts,
  )
  rows.module_run += 1

  // Explicit run→lineage membership (FK to module_run + each parent). The manifest
  // covers EXACTLY these linked rows — never a same-profile/dealer/period sweep.
  for (const s of env.source_artifacts) {
    h.run(
      `INSERT INTO watchdog_run_source_artifact (run_key, source_artifact_id) VALUES (?, ?)`,
      env.run_key,
      s.source_artifact_id,
    )
    rows.run_source_link += 1
  }
  for (const n of env.normalized_datasets) {
    h.run(
      `INSERT INTO watchdog_run_normalized_dataset (run_key, normalized_dataset_id) VALUES (?, ?)`,
      env.run_key,
      n.normalized_dataset_id,
    )
    rows.run_dataset_link += 1
  }
  for (const c of env.capability_snapshots) {
    h.run(
      `INSERT INTO watchdog_run_capability_snapshot (run_key, capability_snapshot_id) VALUES (?, ?)`,
      env.run_key,
      c.capability_snapshot_id,
    )
    rows.run_capability_link += 1
  }

  const defVersionOf: Record<string, string> = {}
  for (const d of env.metric_definitions)
    defVersionOf[d.metric_id] = d.metric_version
  // Item 5: bind the evaluation's stored authority version to the EXACT supplied spec
  // version (unique id → one version), not a global fallback.
  const gtVerById = new Map(
    env.grade_targets.map((g) => [g.grade_target_id, g.target_version]),
  )
  const refVerById = new Map(
    env.comparison_references.map((r) => [r.reference_id, r.reference_version]),
  )
  for (const o of env.observations) {
    h.run(
      `INSERT INTO watchdog_metric_observation
         (run_key, metric_id, metric_version, profile, period, status, calculation_kind,
          value, unit, numerator, denominator, missing, formula, source_fields,
          source_lineage, normalized_dataset_id, confidence, gradable, disposition,
          unresolved_reason, detail, source_investigation,
          affirmative_investigation_evidence_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      env.run_key,
      o.metric_id,
      defVersionOf[o.metric_id] ?? env.definition_version,
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
      env.dataset_id_by_metric[o.metric_id] ?? null,
      o.confidence,
      bool01(o.gradable),
      // GOVERNED disposition (binding-derived), NOT the narrow legacy status.
      env.disposition_by_metric[o.metric_id],
      o.source_investigation?.missing_fields.join(',') ?? null,
      jsonOrNull(o.detail),
      jsonOrNull(o.source_investigation),
      env.affirmative_investigation_evidence_ref_by_metric[o.metric_id] ?? null,
    )
    rows.observation += 1
  }

  for (const e of env.evaluations) {
    h.run(
      `INSERT INTO watchdog_metric_evaluation
         (run_key, metric_id, metric_version, profile, period, gradable_state,
          threshold_id, comparator, threshold, reference_id, reference_version,
          grade_target_id, grade_target_version, detection_rule, detection_fired,
          rating, reason, evaluation_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      env.run_key,
      e.metric_id,
      defVersionOf[e.metric_id] ?? env.definition_version,
      profile,
      e.period,
      e.gradable_state,
      e.threshold_id,
      e.comparator,
      e.threshold,
      e.reference_id,
      e.reference_id ? (refVerById.get(e.reference_id) ?? null) : null,
      e.grade_target_id,
      e.grade_target_id ? (gtVerById.get(e.grade_target_id) ?? null) : null,
      e.detection_rule,
      intOrNull(e.detection_fired),
      e.rating,
      e.reason,
      env.evaluation_state_by_metric[e.metric_id],
    )
    rows.evaluation += 1
    // Explicit evaluation→detection-rule identity link (correction 5).
    const drId = env.detection_rule_id_by_metric[e.metric_id] ?? null
    if (drId !== null) {
      h.run(
        `INSERT INTO watchdog_evaluation_detection_rule (run_key, metric_id, detection_rule_id)
         VALUES (?, ?, ?)`,
        env.run_key,
        e.metric_id,
        drId,
      )
      rows.eval_rule_link += 1
    }
  }

  // Findings are persisted from finding_specs — one watchdog_finding + one link per
  // spec — which SUPPORTS multiple findings per metric/run (link PK includes run_key).
  // content_ordinal pins the content-of-record order so reconstruction is EXACT and
  // independent of insert order (robust for >1 finding on a single metric).
  let findingOrdinal = 0
  for (const spec of env.finding_specs) {
    const key = spec.finding_key
    const contentOrdinal = findingOrdinal
    findingOrdinal += 1
    // Item 8: finding parent is insert-or-VERIFY-identical on its IMMUTABLE columns
    // (not INSERT OR IGNORE). Mutable operational columns (status/first_seen/last_seen/
    // alerted_at) are excluded from the identity check.
    const evidenceJson = canonicalJson({
      metric_id: spec.metric_id,
      period: spec.period,
      severity: spec.severity,
      headline: spec.headline,
      detail: spec.detail,
      run_key: env.run_key,
      audience: spec.audience ?? 'internal',
    })
    const immutable: Record<string, unknown> = {
      key,
      profile,
      rule_id: spec.metric_id,
      category: spec.category ?? 'semantic_watchdog_packet',
      priority: spec.priority,
      issue: spec.headline,
      name: `${spec.metric_id} finding`,
      details: spec.detail,
      evidence: evidenceJson,
    }
    const existing = h.get<Record<string, unknown>>(
      `SELECT key, profile, rule_id, category, priority, issue, name, details, evidence
         FROM watchdog_finding WHERE key = ?`,
      key,
    )
    if (!existing) {
      h.run(
        `INSERT INTO watchdog_finding
           (key, profile, rule_id, category, priority, issue, name, details, evidence,
            status, first_seen, last_seen, alerted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, NULL)`,
        key,
        profile,
        spec.metric_id,
        immutable.category,
        spec.priority,
        spec.headline,
        immutable.name,
        spec.detail,
        evidenceJson,
        ts,
        ts,
      )
      rows.finding += 1
    } else {
      for (const col of Object.keys(immutable))
        if (!sameVal(existing[col], immutable[col]))
          throw new CanonicalWatchdogStoreError(
            `watchdog_finding: immutable collision on '${col}' for key ${key}: ` +
              `stored ${JSON.stringify(existing[col])} != incoming ${JSON.stringify(immutable[col])}`,
          )
      verified.finding += 1
    }
    h.run(
      `INSERT INTO watchdog_finding_metric_link
         (finding_key, run_key, metric_id, content_ordinal, profile, period, severity,
          headline, detail, audience, evidence_class, root_cause_class,
          recommended_action)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      key,
      env.run_key,
      spec.metric_id,
      contentOrdinal,
      profile,
      spec.period,
      spec.severity,
      spec.headline,
      spec.detail,
      spec.audience ?? 'internal',
      spec.evidence_class ??
        (spec.severity === 'pending' ? 'hypothesis' : 'evidence'),
      spec.root_cause_class ?? null,
      spec.recommended_action ?? null,
    )
    rows.finding_metric_link += 1
  }

  const rr = env.report_run
  h.run(
    `INSERT INTO watchdog_report_run
       (report_run_id, profile, period, report_version, source_cutoff, freshness,
        report_lineage, module_run_ids, pdf_artifact_sha256, internal_artifact_sha256,
        qa_receipt, delivery_state, activation_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    rr.report_run_id,
    profile,
    env.period,
    rr.report_version ?? null,
    rr.source_cutoff ?? null,
    rr.freshness ?? null,
    canonicalJson(rr.report_lineage),
    canonicalJson([env.run_key]),
    rr.pdf_artifact_sha256 ?? null,
    rr.internal_artifact_sha256 ?? null,
    rr.qa_receipt ?? null,
    rr.delivery_state,
    rr.activation_state ?? null,
  )
  h.run(
    `INSERT INTO watchdog_report_run_module_link (report_run_id, run_key) VALUES (?, ?)`,
    rr.report_run_id,
    env.run_key,
  )
  rows.report_run += 1

  for (const a of env.alert_simulations) {
    h.run(
      `INSERT INTO watchdog_alert_candidate
         (run_key, metric_id, profile, period, would_fire, channel, delivered, unsent,
          message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      env.run_key,
      a.metric_id,
      profile,
      env.period,
      bool01(a.would_fire),
      a.channel,
      bool01(a.delivered),
      bool01(a.unsent),
      a.message,
    )
    rows.alert_candidate += 1
  }

  return { rows, verified }
}

// ── graph manifest (covers metadata NOT in the PacketRun content hash) ──

/**
 * Deterministic canonical manifest of the ENTIRE persisted graph for one run — exact
 * definition versions, detection rules (with approval), source artifacts + admission
 * receipts, normalized datasets, targets (with approval/version), references
 * (with version), observations, evaluations, findings + links, report linkage, and
 * alert candidates. Built by querying the persisted rows, so persist-time and
 * read-time computations are byte-identical. Excludes wall-clock (persisted_at) and
 * the manifest columns themselves. Its SHA is stored on the anchor and re-verified on
 * every read/replay, so tampering a field that the PacketRun content hash does NOT
 * cover (e.g. a grade_target approval_state) still diverges graph_sha256.
 */
function reconstructGraphManifest(
  h: Handle,
  runKey: string,
  profile: string,
  order: ReadonlyArray<string>,
): unknown {
  const rank = (id: string): number => {
    const i = order.indexOf(id)
    return i === -1 ? order.length : i
  }
  // Item 3: a linked parent that has vanished must FAIL the manifest, not silently
  // disappear via filter(Boolean).
  const req = <T>(row: T | undefined, what: string): T => {
    if (row === undefined || row === null)
      throw new CanonicalWatchdogIntegrityError(
        `manifest: linked parent missing (${what})`,
      )
    return row
  }
  const run = h.get<Record<string, unknown>>(
    `SELECT run_key, profile, packet_id, module, dealer_id, period, binding_sha256,
            source_sha256, engine_version, content_sha256, expected_subset,
            accepted_measured_ids, accepted_disposition_only_ids, rejected_ids,
            lifecycle_partition, report_lineage, input_hash, output_hash, reconciliation,
            qc_result, acceptance_state, as_of
       FROM watchdog_module_run WHERE run_key = ? AND profile = ?`,
    runKey,
    profile,
  )
  const obs = h.all<Record<string, unknown>>(
    `SELECT metric_id, metric_version, status, calculation_kind, value, unit, numerator,
            denominator, missing, formula, source_fields, source_lineage,
            normalized_dataset_id, confidence, gradable, disposition, unresolved_reason,
            detail, source_investigation, affirmative_investigation_evidence_ref, period
       FROM watchdog_metric_observation WHERE run_key = ? ORDER BY metric_id`,
    runKey,
  )
  const evals = h.all<Record<string, unknown>>(
    `SELECT metric_id, metric_version, gradable_state, threshold_id, comparator, threshold,
            reference_id, reference_version, grade_target_id, grade_target_version,
            detection_rule, detection_fired, rating, reason, evaluation_state, period
       FROM watchdog_metric_evaluation WHERE run_key = ? ORDER BY metric_id`,
    runKey,
  )
  const links = h.all<Record<string, unknown>>(
    `SELECT finding_key, metric_id, content_ordinal, period, severity, headline, detail,
            audience, evidence_class, root_cause_class, recommended_action
       FROM watchdog_finding_metric_link WHERE run_key = ?
      ORDER BY finding_key, metric_id`,
    runKey,
  )
  const alerts = h.all<Record<string, unknown>>(
    `SELECT metric_id, would_fire, channel, delivered, unsent, message
       FROM watchdog_alert_candidate WHERE run_key = ? ORDER BY metric_id`,
    runKey,
  )
  // versioned definition parents (exact version per metric)
  const defs = obs
    .map((o) =>
      h.get<Record<string, unknown>>(
        `SELECT ${DEF_COLS.join(', ')} FROM watchdog_metric_definition
          WHERE metric_id = ? AND metric_version = ?`,
        o.metric_id,
        o.metric_version,
      ),
    )
    .map((r) => req(r, 'linked parent'))
    .sort((a, b) =>
      `${a.metric_id}@${a.metric_version}`.localeCompare(
        `${b.metric_id}@${b.metric_version}`,
      ),
    )
  // EXPLICIT evaluation→detection-rule identity links (no DR-id-by-convention guessing).
  const evalRuleLinks = h.all<{ metric_id: string; detection_rule_id: string }>(
    `SELECT metric_id, detection_rule_id FROM watchdog_evaluation_detection_rule
      WHERE run_key = ? ORDER BY metric_id, detection_rule_id`,
    runKey,
  )
  const drIds = new Set(evalRuleLinks.map((l) => l.detection_rule_id))
  const drules = [...drIds]
    .sort((a, b) => a.localeCompare(b))
    .map((id) =>
      h.get<Record<string, unknown>>(
        `SELECT ${DR_COLS.join(', ')} FROM watchdog_detection_rule WHERE detection_rule_id = ?`,
        id,
      ),
    )
    .map((r) => req(r, 'linked parent'))
  // grade targets referenced (exact version)
  const gts = evals
    .filter((e) => e.grade_target_id)
    .map((e) =>
      h.get<Record<string, unknown>>(
        `SELECT ${GT_COLS.join(', ')} FROM watchdog_grade_target
          WHERE grade_target_id = ? AND target_version = ?`,
        e.grade_target_id,
        e.grade_target_version,
      ),
    )
    .map((r) => req(r, 'linked parent'))
  const gtSeen = new Set<string>()
  const grade_targets = gts
    .filter((g) => {
      const k = `${g.grade_target_id}@${g.target_version}`
      if (gtSeen.has(k)) return false
      gtSeen.add(k)
      return true
    })
    .sort((a, b) =>
      `${a.grade_target_id}@${a.target_version}`.localeCompare(
        `${b.grade_target_id}@${b.target_version}`,
      ),
    )
  // comparison references (exact version)
  const crs = evals
    .filter((e) => e.reference_id)
    .map((e) =>
      h.get<Record<string, unknown>>(
        `SELECT ${CR_COLS.join(', ')} FROM watchdog_comparison_reference
          WHERE reference_id = ? AND reference_version = ?`,
        e.reference_id,
        e.reference_version,
      ),
    )
    .map((r) => req(r, 'linked parent'))
  const crSeen = new Set<string>()
  const comparison_references = crs
    .filter((c) => {
      const k = `${c.reference_id}@${c.reference_version}`
      if (crSeen.has(k)) return false
      crSeen.add(k)
      return true
    })
    .sort((a, b) =>
      `${a.reference_id}@${a.reference_version}`.localeCompare(
        `${b.reference_id}@${b.reference_version}`,
      ),
    )
  // Correction 1: ALL normalized datasets + source artifacts EXPLICITLY LINKED to the
  // run (via the run→lineage link tables) — including ones not referenced by an
  // observation; never a same-profile/dealer/period sweep.
  const ndIds = h
    .all<{
      normalized_dataset_id: string
    }>(
      `SELECT normalized_dataset_id FROM watchdog_run_normalized_dataset WHERE run_key = ? ORDER BY normalized_dataset_id`,
      runKey,
    )
    .map((r) => r.normalized_dataset_id)
  const normalized_datasets = ndIds
    .map((id) =>
      h.get<Record<string, unknown>>(
        `SELECT ${ND_COLS.join(', ')} FROM watchdog_normalized_dataset WHERE normalized_dataset_id = ?`,
        id,
      ),
    )
    .map((r) => req(r, 'linked parent'))
  const saIds = h
    .all<{
      source_artifact_id: string
    }>(
      `SELECT source_artifact_id FROM watchdog_run_source_artifact WHERE run_key = ? ORDER BY source_artifact_id`,
      runKey,
    )
    .map((r) => r.source_artifact_id)
  const source_artifacts = saIds
    .map((id) =>
      h.get<Record<string, unknown>>(
        `SELECT ${SRC_COLS.join(', ')} FROM watchdog_source_artifact WHERE source_artifact_id = ?`,
        id,
      ),
    )
    .map((r) => req(r, 'linked parent'))
  // Correction 2: report rows include cutoff/freshness/lineage/artifact-hashes/qa.
  const reportLinks = h
    .all<{ report_run_id: string }>(
      `SELECT report_run_id FROM watchdog_report_run_module_link WHERE run_key = ? ORDER BY report_run_id`,
      runKey,
    )
    .map((l) =>
      h.get<Record<string, unknown>>(
        `SELECT report_run_id, profile, period, report_version, source_cutoff, freshness,
                report_lineage, module_run_ids, pdf_artifact_sha256,
                internal_artifact_sha256, qa_receipt, delivery_state, activation_state
           FROM watchdog_report_run WHERE report_run_id = ?`,
        l.report_run_id,
      ),
    )
    .map((r) => req(r, 'linked parent'))
  // Correction 3: capability snapshots EXPLICITLY LINKED to the run (never a sweep).
  const capIds = h
    .all<{
      capability_snapshot_id: string
    }>(
      `SELECT capability_snapshot_id FROM watchdog_run_capability_snapshot WHERE run_key = ? ORDER BY capability_snapshot_id`,
      runKey,
    )
    .map((r) => r.capability_snapshot_id)
  const capability_snapshots = capIds
    .map((id) =>
      h.get<Record<string, unknown>>(
        `SELECT ${CAP_COLS.join(', ')} FROM watchdog_capability_snapshot WHERE capability_snapshot_id = ?`,
        id,
      ),
    )
    .map((r) => req(r, 'linked parent'))

  return {
    run,
    metric_definitions: defs,
    detection_rules: drules,
    eval_rule_links: evalRuleLinks,
    grade_targets,
    comparison_references,
    source_artifacts,
    normalized_datasets,
    capability_snapshots,
    observations: [...obs].sort(
      (a, b) => rank(String(a.metric_id)) - rank(String(b.metric_id)),
    ),
    evaluations: [...evals].sort(
      (a, b) => rank(String(a.metric_id)) - rank(String(b.metric_id)),
    ),
    finding_links: links,
    // Item 3: immutable watchdog_finding PARENT columns for each linked finding (a
    // parent tamper diverges the graph sha; a missing parent fails, not filter-drops).
    finding_parents: [...new Set(links.map((l) => String(l.finding_key)))]
      .sort()
      .map((k) =>
        req(
          h.get<Record<string, unknown>>(
            `SELECT key, profile, rule_id, category, priority, issue, name, details, evidence
               FROM watchdog_finding WHERE key = ?`,
            k,
          ),
          `watchdog_finding ${k}`,
        ),
      ),
    report_runs: reportLinks,
    alert_candidates: [...alerts].sort(
      (a, b) => rank(String(a.metric_id)) - rank(String(b.metric_id)),
    ),
  }
}

// ── read (full-graph verified) ───────────────────────────────────────

type RunRow = {
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
  expected_subset: string
  accepted_measured_ids: string
  lifecycle_partition: string
  report_lineage: string
  reconciliation: string
  as_of: string
  persisted_at: number
}

function fail(msg: string): never {
  throw new CanonicalWatchdogIntegrityError(msg)
}

function assertExactIntegrity(
  ids: Array<string>,
  expected: ReadonlyArray<string>,
  label: string,
): void {
  if (new Set(ids).size !== ids.length)
    fail(`${label}: duplicate metric id [${ids.join(', ')}]`)
  const got = new Set(ids)
  const exp = new Set(expected)
  for (const id of ids)
    if (!exp.has(id)) fail(`${label}: unexpected/extra metric id ${id}`)
  for (const id of expected)
    if (!got.has(id)) fail(`${label}: missing metric id ${id}`)
}

export function readCanonicalRun(
  runKey: string,
  opts: { profile: string; profileRoot?: string },
): StoredCanonicalRun | null {
  const built = loadRaw(runKey, opts.profile, opts.profileRoot)
  if (!built) return null
  const { stored, run } = built
  const h = ensure(opts.profile, opts.profileRoot)

  if (stored.profile !== opts.profile)
    fail(`profile drift: ${stored.profile} != ${opts.profile}`)

  const expected = parse<Array<string>>(run.expected_subset)
  const measured = parse<Array<string>>(run.accepted_measured_ids)

  assertExactIntegrity(
    stored.observations.map((o) => o.metric_id),
    expected,
    'observations',
  )
  assertExactIntegrity(
    stored.evaluations.map((e) => e.metric_id),
    expected,
    'evaluations',
  )
  assertExactIntegrity(
    stored.alert_candidates.map((a) => a.metric_id),
    measured,
    'alert_candidates',
  )

  // Findings support MULTIPLE per metric/run: subset + coverage (not exact-one).
  const expSet = new Set(expected)
  const covered = new Set<string>()
  for (const f of stored.findings) {
    if (!expSet.has(f.metric_id))
      fail(`findings: unexpected/extra metric id ${f.metric_id}`)
    covered.add(f.metric_id)
  }
  for (const id of expected)
    if (!covered.has(id)) fail(`findings: expected metric ${id} has no finding`)

  // Observations: version-bound definition parent (bind metric_id AND metric_version).
  for (const o of stored.observations) {
    if (o.period !== stored.period)
      fail(
        `observation ${o.metric_id}: period ${o.period} != run ${stored.period}`,
      )
    const raw = h.get<{ metric_version: string }>(
      `SELECT metric_version FROM watchdog_metric_observation WHERE run_key = ? AND metric_id = ?`,
      runKey,
      o.metric_id,
    )
    if (!raw) fail(`observation ${o.metric_id}: row vanished`)
    const def = h.get<{ metric_id: string }>(
      `SELECT metric_id FROM watchdog_metric_definition WHERE metric_id = ? AND metric_version = ?`,
      o.metric_id,
      raw.metric_version,
    )
    if (!def)
      fail(
        `observation ${o.metric_id}: missing metric_definition parent at version ${raw.metric_version}`,
      )
  }
  // Evaluations: version-bound target/reference parents (bind id AND version).
  for (const e of stored.evaluations) {
    if (e.period !== stored.period)
      fail(
        `evaluation ${e.metric_id}: period ${e.period} != run ${stored.period}`,
      )
    const raw = h.get<{
      grade_target_id: string | null
      grade_target_version: string | null
      reference_id: string | null
      reference_version: string | null
    }>(
      `SELECT grade_target_id, grade_target_version, reference_id, reference_version
         FROM watchdog_metric_evaluation WHERE run_key = ? AND metric_id = ?`,
      runKey,
      e.metric_id,
    )
    if (!raw) fail(`evaluation ${e.metric_id}: row vanished`)
    if (raw.grade_target_id) {
      const gt = h.get<{ grade_target_id: string }>(
        `SELECT grade_target_id FROM watchdog_grade_target WHERE grade_target_id = ? AND target_version = ?`,
        raw.grade_target_id,
        raw.grade_target_version,
      )
      if (!gt)
        fail(
          `evaluation ${e.metric_id}: missing grade_target ${raw.grade_target_id}@${raw.grade_target_version}`,
        )
    }
    if (raw.reference_id) {
      const cr = h.get<{ reference_id: string }>(
        `SELECT reference_id FROM watchdog_comparison_reference WHERE reference_id = ? AND reference_version = ?`,
        raw.reference_id,
        raw.reference_version,
      )
      if (!cr)
        fail(
          `evaluation ${e.metric_id}: missing comparison_reference ${raw.reference_id}@${raw.reference_version}`,
        )
    }
  }
  // Every persisted finding link's metric must be expected, and the finding row exists.
  const linkRows = h.all<{
    finding_key: string
    metric_id: string
    period: string
  }>(
    `SELECT finding_key, metric_id, period FROM watchdog_finding_metric_link WHERE run_key = ?`,
    runKey,
  )
  for (const l of linkRows) {
    if (!expSet.has(l.metric_id))
      fail(`finding link: unexpected metric ${l.metric_id}`)
    if (l.period !== stored.period)
      fail(
        `finding link ${l.metric_id}: period ${l.period} != run ${stored.period}`,
      )
    const fr = h.get<{ key: string }>(
      `SELECT key FROM watchdog_finding WHERE key = ?`,
      l.finding_key,
    )
    if (!fr)
      fail(`finding link ${l.finding_key}: missing watchdog_finding record row`)
  }

  for (const a of stored.alert_candidates)
    if (a.delivered !== false || a.unsent !== true)
      fail(
        `alert_candidate ${a.metric_id}: non-inert flags (delivered=${a.delivered}, unsent=${a.unsent})`,
      )

  // Item 4: TRUE multi-artifact / multi-hash lineage — every dataset EXPLICITLY LINKED
  // to the run (incl. ones not referenced by an observation) maps to its OWN source
  // artifact with its OWN sha, validated against that artifact's structured admission
  // receipt. No scalar "all artifacts share the run sha" assumption.
  const dsIds = h.all<{ normalized_dataset_id: string }>(
    `SELECT normalized_dataset_id FROM watchdog_run_normalized_dataset WHERE run_key = ?`,
    runKey,
  )
  for (const d of dsIds) {
    const nd = h.get<{ source_artifact_id: string }>(
      `SELECT source_artifact_id FROM watchdog_normalized_dataset WHERE normalized_dataset_id = ?`,
      d.normalized_dataset_id,
    )
    if (!nd) fail(`missing normalized_dataset ${d.normalized_dataset_id}`)
    const sa = h.get<{
      source_sha256: string
      admission_receipt: string
      dealer_id: string
      period: string
    }>(
      `SELECT source_sha256, admission_receipt, dealer_id, period FROM watchdog_source_artifact
        WHERE source_artifact_id = ?`,
      nd.source_artifact_id,
    )
    if (!sa) fail(`missing source_artifact ${nd.source_artifact_id}`)
    // per-artifact admission receipt integrity (bound to THIS artifact's own sha)
    let receipt: StructuredAdmissionReceipt
    try {
      receipt = parse<StructuredAdmissionReceipt>(sa.admission_receipt)
    } catch {
      fail(
        `source_artifact ${nd.source_artifact_id}: admission_receipt not parseable`,
      )
    }
    if (receipt.source_sha256 !== sa.source_sha256)
      fail(
        `source_artifact ${nd.source_artifact_id}: admission receipt sha ${receipt.source_sha256} ` +
          `!= artifact sha ${sa.source_sha256}`,
      )
    if (receipt.admitted !== true || receipt.zero_service_parts !== true)
      fail(
        `source_artifact ${nd.source_artifact_id}: receipt not admitted/zero-Service-Parts`,
      )
    if (receipt.dealer_id !== sa.dealer_id || receipt.period !== sa.period)
      fail(
        `source_artifact ${nd.source_artifact_id}: receipt dealer/period drift`,
      )
  }

  // report_run via link table; module_run_ids JSON must EQUAL the link-table set
  const links = h.all<{ report_run_id: string }>(
    `SELECT report_run_id FROM watchdog_report_run_module_link WHERE run_key = ?`,
    runKey,
  )
  if (links.length === 0) fail('missing report_run link for run')
  for (const l of links) {
    const report = h.get<{ delivery_state: string; module_run_ids: string }>(
      `SELECT delivery_state, module_run_ids FROM watchdog_report_run WHERE report_run_id = ?`,
      l.report_run_id,
    )
    if (!report) fail(`report_run ${l.report_run_id} linked but absent`)
    if (report.delivery_state !== 'undelivered')
      fail(
        `report_run delivery_state must be undelivered, got ${report.delivery_state}`,
      )
    const declared = new Set(parse<Array<string>>(report.module_run_ids))
    const linked = new Set(
      h
        .all<{
          run_key: string
        }>(
          `SELECT run_key FROM watchdog_report_run_module_link WHERE report_run_id = ?`,
          l.report_run_id,
        )
        .map((r) => r.run_key),
    )
    if (
      declared.size !== linked.size ||
      [...declared].some((id) => !linked.has(id))
    )
      fail(
        `report_run ${l.report_run_id} module_run_ids set != link-table set ` +
          `(declared=[${[...declared].sort().join(',')}] linked=[${[...linked].sort().join(',')}])`,
      )
  }

  const recon = reconstructContentSha(stored, expected)
  if (recon !== stored.content_sha256)
    fail(
      `content_sha256 reconstruction mismatch: ${recon} != stored ${stored.content_sha256}`,
    )

  // Graph manifest hash — catches tampering of metadata the PacketRun content hash
  // does NOT cover (grade-target approval_state, versions, admission receipts, links).
  const storedGraphSha = h.get<{ graph_sha256: string | null }>(
    `SELECT graph_sha256 FROM watchdog_module_run WHERE run_key = ?`,
    runKey,
  )?.graph_sha256
  const manifest = reconstructGraphManifest(h, runKey, opts.profile, expected)
  const graphSha = sha256Hex(canonicalJson(manifest))
  if (storedGraphSha === null || storedGraphSha === undefined)
    fail(`run ${runKey}: no stored graph_sha256`)
  if (graphSha !== storedGraphSha)
    fail(
      `graph_sha256 reconstruction mismatch: ${graphSha} != stored ${storedGraphSha}`,
    )

  return stored
}

export function readCanonicalRunRawForensic(
  runKey: string,
  opts: { profile: string; profileRoot?: string },
): StoredCanonicalRun | null {
  return loadRaw(runKey, opts.profile, opts.profileRoot)?.stored ?? null
}

function loadRaw(
  runKey: string,
  profile: string,
  profileRoot?: string,
): { stored: StoredCanonicalRun; run: RunRow } | null {
  const h = ensure(profile, profileRoot)
  const run = h.get<RunRow>(
    `SELECT * FROM watchdog_module_run WHERE run_key = ? AND profile = ?`,
    runKey,
    profile,
  )
  if (!run) return null

  const obsRows = h.all<{
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
    disposition: string
    affirmative_investigation_evidence_ref: string | null
  }>(
    `SELECT * FROM watchdog_metric_observation WHERE run_key = ? ORDER BY metric_id`,
    runKey,
  )
  // v2 governed read maps (persisted columns the engine Observation cannot hold).
  const disposition_by_metric: Record<string, string> = {}
  const affirmative_investigation_evidence_ref_by_metric: Record<
    string,
    string | null
  > = {}
  const observations = obsRows.map((o): Observation => {
    disposition_by_metric[o.metric_id] = o.disposition
    affirmative_investigation_evidence_ref_by_metric[o.metric_id] =
      o.affirmative_investigation_evidence_ref
    return {
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
    }
  })

  const evalRows = h.all<{
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
    evaluation_state: string | null
  }>(
    `SELECT * FROM watchdog_metric_evaluation WHERE run_key = ? ORDER BY metric_id`,
    runKey,
  )
  const evaluation_state_by_metric: Record<string, string> = {}
  const evaluations = evalRows.map((e): Evaluation => {
    evaluation_state_by_metric[e.metric_id] = e.evaluation_state ?? ''
    return {
      metric_id: e.metric_id,
      period: e.period,
      gradable_state: e.gradable_state,
      threshold_id: e.threshold_id,
      comparator: e.comparator,
      threshold: e.threshold,
      reference_id: e.reference_id,
      grade_target_id: e.grade_target_id,
      detection_rule: e.detection_rule,
      detection_fired:
        e.detection_fired === null ? null : e.detection_fired === 1,
      rating: e.rating,
      reason: e.reason,
    }
  })

  const findings = h
    .all<{
      metric_id: string
      period: string
      severity: Finding['severity']
      headline: string
      detail: string
    }>(
      `SELECT metric_id, period, severity, headline, detail
         FROM watchdog_finding_metric_link WHERE run_key = ?
        ORDER BY content_ordinal`,
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
    .all<{
      metric_id: string
      would_fire: number
      channel: AlertSimulation['channel']
      delivered: number
      unsent: number
      message: string
    }>(
      `SELECT * FROM watchdog_alert_candidate WHERE run_key = ? ORDER BY metric_id`,
      runKey,
    )
    .map(
      (a): StoredAlertCandidate => ({
        metric_id: a.metric_id,
        would_fire: a.would_fire === 1,
        channel: a.channel,
        delivered: a.delivered === 1,
        unsent: a.unsent === 1,
        message: a.message,
      }),
    )

  const stored: StoredCanonicalRun = {
    read_shape_version: STORED_CANONICAL_RUN_READ_VERSION,
    run_key: run.run_key,
    profile: run.profile,
    packet_id: run.packet_id,
    module: run.module,
    dealer_id: run.dealer_id,
    period: run.period,
    binding_sha256: run.binding_sha256,
    source_sha256: run.source_sha256,
    engine_version: run.engine_version,
    content_sha256: run.content_sha256,
    as_of: run.as_of,
    persisted_at: run.persisted_at,
    lifecycle_partition: parse(run.lifecycle_partition),
    reconciliation: parse(run.reconciliation),
    report_lineage: parse(run.report_lineage),
    observations,
    evaluations,
    findings,
    alert_candidates,
    // v2 additive governed read fields.
    disposition_by_metric,
    evaluation_state_by_metric,
    affirmative_investigation_evidence_ref_by_metric,
  }
  return { stored, run }
}

function reconstructContentSha(
  stored: StoredCanonicalRun,
  order: ReadonlyArray<string>,
): string {
  const byOrder = orderer(order)
  const content = {
    packet_id: stored.packet_id,
    module: stored.module,
    dealer_id: stored.dealer_id,
    period: stored.period,
    binding_sha256: stored.binding_sha256,
    source_sha256: stored.source_sha256,
    engine_version: stored.engine_version,
    lifecycle_partition: stored.lifecycle_partition,
    observations: byOrder(stored.observations),
    evaluations: byOrder(stored.evaluations),
    findings: byOrder(stored.findings),
    two_delta: stored.report_lineage,
    alert_simulations: byOrder(stored.alert_candidates),
    reconciliation: stored.reconciliation,
  }
  return sha256Hex(canonicalJson(content))
}

export function reconstructedContentShaCanonical(
  runKey: string,
  opts: { profile: string; profileRoot?: string },
): string | null {
  const built = loadRaw(runKey, opts.profile, opts.profileRoot)
  if (!built) return null
  const order = parse<Array<string>>(built.run.expected_subset)
  return reconstructContentSha(built.stored, order)
}

export function listCanonicalRuns(opts: {
  profile: string
  profileRoot?: string
}): Array<{ run_key: string; period: string; content_sha256: string }> {
  const h = ensure(opts.profile, opts.profileRoot)
  return h.all<{ run_key: string; period: string; content_sha256: string }>(
    `SELECT run_key, period, content_sha256 FROM watchdog_module_run
      WHERE profile = ? ORDER BY period DESC, persisted_at DESC`,
    opts.profile,
  )
}
