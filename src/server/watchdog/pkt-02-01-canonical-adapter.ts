/**
 * PKT-02-01 → canonical envelope adapter (thin, packet-SPECIFIC).
 *
 * This is the only watchdog module that knows PKT-02-01: it uses the frozen
 * PKT-02-01 validator (validateForPersist — binding sha, packet id, dealer, Sales-only
 * grammar, missing≠zero) and the PKT-02-01 binding loader for per-metric grade-target
 * authority, then builds a packet-agnostic CanonicalRunEnvelope that the generic
 * canonical core persists. It also backfills the legacy watchdog_packet_* run into the
 * canonical graph. The generic core (canonical-watchdog-store.ts) imports none of this.
 *
 * Target authority is FAIL-CLOSED: if an evaluation carries a non-null grade_target_id
 * but the active binding has no grade authority for that metric, the build throws — no
 * approval is ever inferred.
 */
import { canonicalJson } from '../reports/packet/canonical'
import { loadBinding } from '../reports/packet/binding'
import { HONDA_PROFILE } from '../reports/packet/leads-input'
import { MEASURED_IDS, PENDING_IDS, SOURCE_ID } from '../reports/packet/engine'
import { readPacketRun, validateForPersist } from './packet-brain-store'
import {
  CanonicalWatchdogStoreError,
  listCanonicalRuns,
  persistCanonicalRunEnvelope,
  readCanonicalRun,
  reconstructedContentShaCanonical,
} from './canonical-watchdog-store'
import type { StoredPacketRun } from './packet-brain-store'
import type {
  CanonicalPersistResult,
  CanonicalRunEnvelope,
  GradeTargetSpec,
  StoredCanonicalRun,
} from './canonical-watchdog-store'
import type {
  AlertSimulation,
  Evaluation,
  Finding,
  Observation,
  PacketRun,
  Reconciliation,
  TwoDelta,
} from '../reports/packet/engine'
import type { Binding, MetricBinding } from '../reports/packet/binding'

const DEFINITION_VERSION = '1.0.0'
const REFERENCE_VERSION = '1.0.0'
const TARGET_VERSION = '1.0.0'
const SEV_PRIORITY: Record<string, string> = {
  breach: 'high',
  healthy: 'low',
  pending: 'medium',
}
const FAMILY = SOURCE_ID.replace(/^SRC-/, '').replace(/-\d+$/, '')

/** Engine content order — the legacy read-back returns rows sorted by metric_id, so a
 *  backfilled run must be re-ordered to [measured…, pending…] before its content hash
 *  is recomputed/validated. */
const ENGINE_ORDER: ReadonlyArray<string> = [...MEASURED_IDS, ...PENDING_IDS]
const byEngineOrder = <T extends { metric_id: string }>(
  xs: Array<T>,
): Array<T> => {
  const rank = (id: string): number => {
    const i = ENGINE_ORDER.indexOf(id)
    return i === -1 ? ENGINE_ORDER.length : i
  }
  return [...xs].sort((a, b) => rank(a.metric_id) - rank(b.metric_id))
}

/** Binding authority for a metric, or undefined if the binding does not define it
 *  (fail-closed callers throw). Typed possibly-undefined on purpose. */
function metricAuthority(binding: Binding, id: string): MetricBinding | undefined {
  return Object.hasOwn(binding.metrics, id) ? binding.metrics[id] : undefined
}

const saId = (
  profile: string,
  dealer: string,
  period: string,
  sha: string,
): string => `SA:${FAMILY}:${profile}:${dealer}:${period}:${sha.slice(0, 12)}`
const ndId = (
  profile: string,
  dealer: string,
  period: string,
  sha: string,
): string => `ND:${FAMILY}:${profile}:${dealer}:${period}:${sha.slice(0, 12)}`

/** Normalized fields common to a live PacketRun and a read-back StoredPacketRun. */
type EnvelopeSource = {
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
  lifecycle_partition: Record<string, Array<string>>
  observations: Array<Observation>
  evaluations: Array<Evaluation>
  findings: Array<Finding>
  reconciliation: Reconciliation
  two_delta: TwoDelta
  alert_simulations: Array<AlertSimulation>
}

function fromRun(run: PacketRun): EnvelopeSource {
  return {
    profile: '', // set by caller
    packet_id: run.packet_id,
    module: run.module,
    dealer_id: run.dealer_id,
    period: run.period,
    run_key: run.run_key,
    as_of: run.as_of,
    engine_version: run.engine_version,
    binding_sha256: run.binding_sha256,
    source_sha256: run.source_sha256,
    content_sha256: run.content_sha256,
    lifecycle_partition: run.lifecycle_partition,
    observations: run.observations,
    evaluations: run.evaluations,
    findings: run.findings,
    reconciliation: run.reconciliation,
    two_delta: run.two_delta,
    alert_simulations: run.alert_simulations,
  }
}

/** Reassemble a PacketRun from a legacy StoredPacketRun (for re-validation). */
export function packetRunFromStored(s: StoredPacketRun): PacketRun {
  return {
    artifact: 'honda-watchdog-pkt-02-01-run',
    packet_id: s.packet_id,
    module: s.module,
    dealer_id: s.dealer_id,
    period: s.period,
    binding_sha256: s.binding_sha256,
    source_sha256: s.source_sha256,
    engine_version: s.engine_version,
    as_of: s.as_of,
    run_key: s.run_key,
    content_sha256: s.content_sha256,
    lifecycle_partition: s.lifecycle_partition,
    // Re-order legacy metric_id-sorted rows back to engine content order.
    observations: byEngineOrder(s.observations),
    evaluations: byEngineOrder(s.evaluations),
    findings: byEngineOrder(s.findings),
    two_delta: s.report_lineage,
    alert_simulations: byEngineOrder(s.alert_candidates).map(
      (a): AlertSimulation => ({
        metric_id: a.metric_id,
        would_fire: a.would_fire,
        channel: 'simulated_none',
        delivered: false,
        unsent: true,
        message: a.message,
      }),
    ),
    reconciliation: s.reconciliation,
  }
}

/** Build the packet-agnostic envelope from PKT-02-01 facts + binding authority. */
function buildEnvelope(
  src: EnvelopeSource,
  profile: string,
  binding: Binding,
): CanonicalRunEnvelope {
  const dealer = src.dealer_id
  const period = src.period
  const sha = src.source_sha256
  const ed = src.two_delta.evidence_delta
  const unitOf: Record<string, string> = {}
  for (const o of src.observations) unitOf[o.metric_id] = o.unit

  const expected = src.observations.map((o) => o.metric_id)
  const measured = src.alert_simulations.map((a) => a.metric_id)

  const metric_definitions = src.observations.map((o) => ({
    metric_id: o.metric_id,
    metric_version: DEFINITION_VERSION,
    module: src.module,
    boundary_class: 'sales',
    calculation_kind: o.calculation_kind,
    null_missing_behavior: o.gradable ? 'missing_not_zero' : 'not_applicable',
    unit: o.unit,
    timezone: 'America/New_York',
    formula: o.formula,
    required_fields: o.source_fields,
    required_sources: [o.source_lineage.source_id],
    gradable: o.gradable,
    sensitivity_class: 'none',
    definition_status: 'accepted',
  }))

  const rowCount = parseInt(
    String(ed.row_reconciliation).match(/^\d+/)?.[0] ?? '',
    10,
  )
  const source_artifacts = [
    {
      source_artifact_id: saId(profile, dealer, period, sha),
      family: FAMILY,
      source_type: 'scheduled_custom_reporting',
      source_sha256: sha,
      dealer_id: dealer,
      period,
      schema_contract_sha256: ed.schema_contract_sha256,
      receipt_sha256: ed.receipt_sha256,
      bytes: ed.bytes,
      row_count: Number.isFinite(rowCount) ? rowCount : null,
      dealer_period_result: 'admitted',
      admission_receipt: {
        source_id: ed.source_id,
        row_reconciliation: ed.row_reconciliation,
        sales_only_proof: ed.sales_only_proof,
        missing_rule: ed.missing_rule,
      },
    },
  ]

  const rowKey =
    src.observations.find((o) => o.source_lineage.row_key)?.source_lineage
      .row_key ?? null
  const normalized_datasets = [
    {
      normalized_dataset_id: ndId(profile, dealer, period, sha),
      source_artifact_id: saId(profile, dealer, period, sha),
      profile,
      dealer_id: dealer,
      period,
      normalized_sha256: sha,
      filter_spec: `Dealer ID=${dealer}; Sales-only`,
      timezone: 'America/New_York',
      as_of: src.as_of,
      join_keys: rowKey,
      io_reconciliation: ed.row_reconciliation,
    },
  ]

  const dataset_id_by_metric: Record<string, string | null> = {}
  for (const o of src.observations)
    dataset_id_by_metric[o.metric_id] =
      o.source_lineage.source_sha256 !== null
        ? ndId(profile, dealer, period, sha)
        : null

  const detection_rules = []
  const grade_targets: Array<GradeTargetSpec> = []
  const comparison_references = []
  const seenGrade = new Set<string>()
  const seenRef = new Set<string>()
  for (const e of src.evaluations) {
    if (e.detection_rule) {
      detection_rules.push({
        detection_rule_id: `DR-${e.metric_id}-${DEFINITION_VERSION}`,
        metric_id: e.metric_id,
        metric_version: DEFINITION_VERSION,
        threshold_id: e.threshold_id,
        condition: e.detection_rule,
        comparator: e.comparator,
        threshold: e.threshold,
        provenance: 'frozen_operational_target',
        approval_state: 'approved',
        status: 'active',
        evaluation_semantics: e.gradable_state,
      })
    }
    if (e.grade_target_id && !seenGrade.has(e.grade_target_id)) {
      seenGrade.add(e.grade_target_id)
      // FAIL-CLOSED: authority must come from the binding; never inferred.
      const mb = metricAuthority(binding, e.metric_id)
      if (!mb)
        throw new CanonicalWatchdogStoreError(
          `${e.metric_id}: grade_target_id ${e.grade_target_id} present but binding has no metric authority (fail-closed)`,
        )
      const approved = mb.grade_approval === 'approved'
      grade_targets.push({
        grade_target_id: e.grade_target_id,
        target_version: TARGET_VERSION,
        metric_id: e.metric_id,
        metric_version: DEFINITION_VERSION,
        basis: mb.grade_basis,
        value_or_range: mb.grade_value_or_range,
        unit: unitOf[e.metric_id] ?? null,
        comparator: e.comparator,
        source: approved ? 'operational_target' : 'unresolved_pending_source',
        provenance: approved
          ? 'frozen_operational_target'
          : 'unresolved_pending_source',
        // Period-INDEPENDENT authority: a shared (id, version) target is reused across
        // periods, so it must not carry the run period (that would collide on backfill
        // of a second period). Period linkage lives on the run-scoped evaluation.
        valid_period: null,
        assumptions: approved
          ? 'frozen accepted operational target'
          : 'target unresolved pending source acquisition',
        confidence: approved ? 'medium' : 'not_applicable',
        compatibility_result: approved ? 'compatible' : 'unresolved',
        approval_state: mb.grade_approval,
        status: mb.grade_status,
      })
    }
    if (e.reference_id && !seenRef.has(e.reference_id)) {
      seenRef.add(e.reference_id)
      const mb = metricAuthority(binding, e.metric_id)
      const approved = mb?.grade_approval === 'approved'
      comparison_references.push({
        reference_id: e.reference_id,
        reference_version: REFERENCE_VERSION,
        metric_id: e.metric_id,
        metric_version: DEFINITION_VERSION,
        basis: mb?.grade_basis ?? 'operational_target',
        value_or_range: e.threshold === null ? null : String(e.threshold),
        unit: unitOf[e.metric_id] ?? null,
        comparator: e.comparator,
        source: 'operational_target',
        valid_period: null,
        assumptions: 'operational-target context; reference-only',
        confidence: approved ? 'medium' : 'not_applicable',
        compatibility_result: approved ? 'compatible' : 'unresolved',
        approval_state: 'reference_only',
        status: 'active',
      })
    }
  }

  const finding_specs = src.findings.map((f) => ({
    finding_key: `pkt:${src.run_key}:${f.metric_id}`,
    metric_id: f.metric_id,
    period: f.period,
    severity: f.severity,
    headline: f.headline,
    detail: f.detail,
    priority: SEV_PRIORITY[f.severity] ?? 'medium',
    category: 'semantic_watchdog_packet',
    audience: 'internal',
    evidence_class: f.severity === 'pending' ? 'hypothesis' : 'evidence',
  }))

  return {
    profile,
    packet_id: src.packet_id,
    module: src.module,
    dealer_id: dealer,
    period,
    run_key: src.run_key,
    as_of: src.as_of,
    engine_version: src.engine_version,
    binding_sha256: src.binding_sha256,
    source_sha256: sha,
    content_sha256: src.content_sha256,
    acceptance_state: 'packet_accepted',
    definition_version: DEFINITION_VERSION,
    reference_version: REFERENCE_VERSION,
    target_version: TARGET_VERSION,
    expected_metric_ids: expected,
    measured_metric_ids: measured,
    lifecycle_partition: src.lifecycle_partition,
    observations: src.observations,
    evaluations: src.evaluations,
    findings: src.findings,
    alert_simulations: src.alert_simulations,
    two_delta: src.two_delta,
    reconciliation: src.reconciliation,
    metric_definitions,
    source_artifacts,
    normalized_datasets,
    detection_rules,
    grade_targets,
    comparison_references,
    finding_specs,
    report_run: {
      report_run_id: `RR:${src.run_key}`,
      report_version: src.engine_version,
      source_cutoff: period,
      freshness: ed.row_reconciliation,
      report_lineage: src.two_delta,
      delivery_state: 'undelivered',
      activation_state: 'inactive',
    },
    sales_only_admission: {
      proof: ed.sales_only_proof,
      dealer_id: dealer,
      zero_service_parts: true, // validateForPersist enforced the anchored grammar
    },
    dataset_id_by_metric,
  }
}

type Opts = { profile?: string; profileRoot?: string; repoRoot?: string }

function requireRepoRoot(opts: Opts): string {
  const repoRoot = opts.repoRoot ?? process.cwd()
  if (!repoRoot)
    throw new CanonicalWatchdogStoreError(
      'repoRoot required to load binding authority',
    )
  return repoRoot
}

/** Persist a PKT-02-01 PacketRun into the canonical graph (validated + fail-closed). */
export function persistPkt0201Canonical(
  run: PacketRun,
  opts: Opts = {},
): CanonicalPersistResult {
  const profile = opts.profile ?? HONDA_PROFILE
  validateForPersist(run, profile) // PKT-02-01 frozen fail-closed guards
  const binding = loadBinding(requireRepoRoot(opts)).binding
  const src = fromRun(run)
  const env = buildEnvelope(src, profile, binding)
  return persistCanonicalRunEnvelope(env, { profileRoot: opts.profileRoot })
}

export type BackfillResult = {
  runKey: string
  profile: string
  changed: boolean
  legacyCounts: {
    run: number
    observations: number
    evaluations: number
    findings: number
    alert_candidates: number
  }
  canonicalRows: CanonicalPersistResult['rows']
  legacyContentSha: string
  canonicalReconstructedSha: string | null
  parity: boolean
}

/** Idempotent, transactional backfill of the legacy PKT-02-01 run into canonical. */
export function backfillLegacyToCanonical(
  runKey: string,
  opts: Opts = {},
): BackfillResult {
  const profile = opts.profile ?? HONDA_PROFILE
  const legacy = readPacketRun(runKey, {
    profile,
    profileRoot: opts.profileRoot,
  })
  if (!legacy)
    throw new CanonicalWatchdogStoreError(
      `no legacy run to backfill for run_key ${runKey} (profile ${profile})`,
    )
  const run = packetRunFromStored(legacy)
  const res = persistPkt0201Canonical(run, opts)
  const recon = reconstructedContentShaCanonical(runKey, {
    profile,
    profileRoot: opts.profileRoot,
  })
  return {
    runKey,
    profile,
    changed: res.changed,
    legacyCounts: {
      run: 1,
      observations: legacy.observations.length,
      evaluations: legacy.evaluations.length,
      findings: legacy.findings.length,
      alert_candidates: legacy.alert_candidates.length,
    },
    canonicalRows: res.rows,
    legacyContentSha: legacy.content_sha256,
    canonicalReconstructedSha: recon,
    parity:
      recon === legacy.content_sha256 &&
      legacy.observations.length === run.observations.length,
  }
}

/** Read the canonical PKT-02-01 run (Honda default profile), fully verified. */
export function readPkt0201Canonical(
  runKey: string,
  opts: Opts = {},
): StoredCanonicalRun | null {
  return readCanonicalRun(runKey, {
    profile: opts.profile ?? HONDA_PROFILE,
    profileRoot: opts.profileRoot,
  })
}

export function listPkt0201CanonicalRuns(
  opts: Opts = {},
): Array<{ run_key: string; period: string; content_sha256: string }> {
  return listCanonicalRuns({
    profile: opts.profile ?? HONDA_PROFILE,
    profileRoot: opts.profileRoot,
  })
}
