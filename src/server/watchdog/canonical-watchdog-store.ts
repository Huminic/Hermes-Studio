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
  admission_receipt: unknown
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
  finding_specs: Array<FindingSpec>
  report_run: ReportRunSpec
  sales_only_admission: SalesOnlyAdmission
  /** normalized_dataset_id per metric_id (null for pending/no-lineage metrics). */
  dataset_id_by_metric: Record<string, string | null>
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

export type StoredCanonicalRun = {
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

export type RowCounts = {
  module_run: number
  metric_definition: number
  detection_rule: number
  source_artifact: number
  normalized_dataset: number
  grade_target: number
  comparison_reference: number
  observation: number
  evaluation: number
  finding: number
  finding_metric_link: number
  report_run: number
  alert_candidate: number
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
  const expSet = new Set(expected)
  for (const id of measured)
    if (!expSet.has(id)) throw new E(`measured id ${id} not in expected set`)

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
    const k = `${fs.finding_key} ${fs.metric_id}`
    if (linkSeen.has(k))
      throw new E(
        `finding_specs: duplicate link (${fs.finding_key}, ${fs.metric_id})`,
      )
    linkSeen.add(k)
  }

  // Lifecycle partition: buckets mutually exclusive, and their union EXACTLY equals
  // the expected id set.
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

  // Source / normalized-dataset / profile / dealer / period relationships + admission.
  const saById = new Map(
    env.source_artifacts.map((s) => [s.source_artifact_id, s]),
  )
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
    if (s.admission_receipt === null || s.admission_receipt === undefined)
      throw new E(
        `source_artifact ${s.source_artifact_id}: missing admission_receipt`,
      )
    if (!s.family || !s.source_type)
      throw new E(
        `source_artifact ${s.source_artifact_id}: family/source_type required`,
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
  for (const [mid, dsId] of Object.entries(env.dataset_id_by_metric)) {
    if (dsId !== null && !ndById.has(dsId))
      throw new E(
        `dataset_id_by_metric[${mid}]: normalized_dataset ${dsId} not provided`,
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

  // FAIL-CLOSED target authority: a non-null grade_target_id MUST have a supplied
  // grade_target spec — no silent approval inference.
  const gtById = new Map(env.grade_targets.map((g) => [g.grade_target_id, g]))
  for (const ev of env.evaluations) {
    if (ev.grade_target_id) {
      const g = gtById.get(ev.grade_target_id)
      if (!g)
        throw new E(
          `evaluation ${ev.metric_id}: grade_target_id ${ev.grade_target_id} has no supplied target authority (fail-closed)`,
        )
      // A graded evaluation may not point at an unapproved target.
      if (ev.gradable_state === 'graded' && g.approval_state !== 'approved')
        throw new E(
          `evaluation ${ev.metric_id}: graded against non-approved target ${g.grade_target_id} (${g.approval_state})`,
        )
    }
    if (ev.reference_id) {
      const hasRef = env.comparison_references.some(
        (r) => r.reference_id === ev.reference_id,
      )
      if (!hasRef)
        throw new E(
          `evaluation ${ev.metric_id}: reference_id ${ev.reference_id} has no supplied comparison reference`,
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
    grade_target: 0,
    comparison_reference: 0,
    observation: 0,
    evaluation: 0,
    finding: 0,
    finding_metric_link: 0,
    report_run: 0,
    alert_candidate: 0,
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
    const gsha = h.get<{ graph_sha256: string | null }>(
      `SELECT graph_sha256 FROM watchdog_module_run WHERE run_key = ?`,
      env.run_key,
    )
    return {
      changed: false,
      runKey: env.run_key,
      profile,
      graphSha256: gsha?.graph_sha256 ?? null,
      rows: zeroRows(),
      verified: zeroRows(),
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

  const defVersionOf: Record<string, string> = {}
  for (const d of env.metric_definitions)
    defVersionOf[d.metric_id] = d.metric_version
  for (const o of env.observations) {
    h.run(
      `INSERT INTO watchdog_metric_observation
         (run_key, metric_id, metric_version, profile, period, status, calculation_kind,
          value, unit, numerator, denominator, missing, formula, source_fields,
          source_lineage, normalized_dataset_id, confidence, gradable, disposition,
          unresolved_reason, detail, source_investigation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      o.status,
      o.source_investigation?.missing_fields.join(',') ?? null,
      jsonOrNull(o.detail),
      jsonOrNull(o.source_investigation),
    )
    rows.observation += 1
  }

  for (const e of env.evaluations) {
    h.run(
      `INSERT INTO watchdog_metric_evaluation
         (run_key, metric_id, metric_version, profile, period, gradable_state,
          threshold_id, comparator, threshold, reference_id, reference_version,
          grade_target_id, grade_target_version, detection_rule, detection_fired,
          rating, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      e.reference_id ? env.reference_version : null,
      e.grade_target_id,
      e.grade_target_id ? env.target_version : null,
      e.detection_rule,
      intOrNull(e.detection_fired),
      e.rating,
      e.reason,
    )
    rows.evaluation += 1
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
    h.run(
      `INSERT OR IGNORE INTO watchdog_finding
         (key, profile, rule_id, category, priority, issue, name, details, evidence,
          status, first_seen, last_seen, alerted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, NULL)`,
      key,
      profile,
      spec.metric_id,
      spec.category ?? 'semantic_watchdog_packet',
      spec.priority,
      spec.headline,
      `${spec.metric_id} finding`,
      spec.detail,
      canonicalJson({
        metric_id: spec.metric_id,
        period: spec.period,
        severity: spec.severity,
        headline: spec.headline,
        detail: spec.detail,
        run_key: env.run_key,
        audience: spec.audience ?? 'internal',
      }),
      ts,
      ts,
    )
    rows.finding += 1
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
  const run = h.get<Record<string, unknown>>(
    `SELECT run_key, profile, packet_id, module, dealer_id, period, binding_sha256,
            source_sha256, engine_version, content_sha256, expected_subset,
            accepted_measured_ids, accepted_disposition_only_ids, rejected_ids,
            lifecycle_partition, report_lineage, input_hash, output_hash, reconciliation,
            qc_result, acceptance_state
       FROM watchdog_module_run WHERE run_key = ? AND profile = ?`,
    runKey,
    profile,
  )
  const obs = h.all<Record<string, unknown>>(
    `SELECT metric_id, metric_version, status, calculation_kind, value, unit, numerator,
            denominator, missing, formula, source_fields, source_lineage,
            normalized_dataset_id, confidence, gradable, disposition, unresolved_reason,
            detail, source_investigation, period
       FROM watchdog_metric_observation WHERE run_key = ? ORDER BY metric_id`,
    runKey,
  )
  const evals = h.all<Record<string, unknown>>(
    `SELECT metric_id, metric_version, gradable_state, threshold_id, comparator, threshold,
            reference_id, reference_version, grade_target_id, grade_target_version,
            detection_rule, detection_fired, rating, reason, period
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
    .filter(Boolean)
    .sort((a, b) =>
      `${a!.metric_id}@${a!.metric_version}`.localeCompare(
        `${b!.metric_id}@${b!.metric_version}`,
      ),
    )
  // detection rules for this run's metrics
  const drIds = new Set(
    evals.map((e) => `DR-${e.metric_id}-${e.metric_version}`),
  )
  const drules = [...drIds]
    .map((id) =>
      h.get<Record<string, unknown>>(
        `SELECT ${DR_COLS.join(', ')} FROM watchdog_detection_rule WHERE detection_rule_id = ?`,
        id,
      ),
    )
    .filter(Boolean)
    .sort((a, b) =>
      String(a!.detection_rule_id).localeCompare(String(b!.detection_rule_id)),
    )
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
    .filter(Boolean)
  const gtSeen = new Set<string>()
  const grade_targets = gts
    .filter((g) => {
      const k = `${g!.grade_target_id}@${g!.target_version}`
      if (gtSeen.has(k)) return false
      gtSeen.add(k)
      return true
    })
    .sort((a, b) =>
      `${a!.grade_target_id}@${a!.target_version}`.localeCompare(
        `${b!.grade_target_id}@${b!.target_version}`,
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
    .filter(Boolean)
  const crSeen = new Set<string>()
  const comparison_references = crs
    .filter((c) => {
      const k = `${c!.reference_id}@${c!.reference_version}`
      if (crSeen.has(k)) return false
      crSeen.add(k)
      return true
    })
    .sort((a, b) =>
      `${a!.reference_id}@${a!.reference_version}`.localeCompare(
        `${b!.reference_id}@${b!.reference_version}`,
      ),
    )
  // source artifacts + normalized datasets referenced by observations
  const ndIds = [
    ...new Set(
      obs.map((o) => o.normalized_dataset_id).filter((x): x is string => !!x),
    ),
  ].sort()
  const normalized_datasets = ndIds
    .map((id) =>
      h.get<Record<string, unknown>>(
        `SELECT ${ND_COLS.join(', ')} FROM watchdog_normalized_dataset WHERE normalized_dataset_id = ?`,
        id,
      ),
    )
    .filter(Boolean)
  const saIds = [
    ...new Set(normalized_datasets.map((n) => n!.source_artifact_id as string)),
  ].sort()
  const source_artifacts = saIds
    .map((id) =>
      h.get<Record<string, unknown>>(
        `SELECT ${SRC_COLS.join(', ')} FROM watchdog_source_artifact WHERE source_artifact_id = ?`,
        id,
      ),
    )
    .filter(Boolean)
  // report linkage
  const reportLinks = h
    .all<{ report_run_id: string }>(
      `SELECT report_run_id FROM watchdog_report_run_module_link WHERE run_key = ? ORDER BY report_run_id`,
      runKey,
    )
    .map((l) =>
      h.get<Record<string, unknown>>(
        `SELECT report_run_id, profile, period, report_version, module_run_ids,
                delivery_state, activation_state
           FROM watchdog_report_run WHERE report_run_id = ?`,
        l.report_run_id,
      ),
    )
    .filter(Boolean)

  return {
    run,
    metric_definitions: defs,
    detection_rules: drules,
    grade_targets,
    comparison_references,
    source_artifacts,
    normalized_datasets,
    observations: [...obs].sort(
      (a, b) => rank(String(a.metric_id)) - rank(String(b.metric_id)),
    ),
    evaluations: [...evals].sort(
      (a, b) => rank(String(a.metric_id)) - rank(String(b.metric_id)),
    ),
    finding_links: links,
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

  // source_artifact + normalized_dataset parents present for any observation lineage
  const dsIds = h.all<{ normalized_dataset_id: string | null }>(
    `SELECT DISTINCT normalized_dataset_id FROM watchdog_metric_observation WHERE run_key = ?`,
    runKey,
  )
  for (const d of dsIds) {
    if (d.normalized_dataset_id === null) continue
    const nd = h.get<{ source_artifact_id: string }>(
      `SELECT source_artifact_id FROM watchdog_normalized_dataset WHERE normalized_dataset_id = ?`,
      d.normalized_dataset_id,
    )
    if (!nd) fail(`missing normalized_dataset ${d.normalized_dataset_id}`)
    const sa = h.get<{ source_sha256: string }>(
      `SELECT source_sha256 FROM watchdog_source_artifact WHERE source_artifact_id = ?`,
      nd.source_artifact_id,
    )
    if (!sa) fail(`missing source_artifact ${nd.source_artifact_id}`)
    if (sa.source_sha256 !== stored.source_sha256)
      fail(
        `source_artifact sha drift: ${sa.source_sha256} != ${stored.source_sha256}`,
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

  const observations = h
    .all<{
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
    }>(
      `SELECT * FROM watchdog_metric_observation WHERE run_key = ? ORDER BY metric_id`,
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
          o.source_investigation === null
            ? null
            : parse(o.source_investigation),
      }),
    )

  const evaluations = h
    .all<{
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
    }>(
      `SELECT * FROM watchdog_metric_evaluation WHERE run_key = ? ORDER BY metric_id`,
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
        detection_fired:
          e.detection_fired === null ? null : e.detection_fired === 1,
        rating: e.rating,
        reason: e.reason,
      }),
    )

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
