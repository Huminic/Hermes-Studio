/**
 * Gate 2 — SEMANTIC validator for evaluated rows (not presence checks).
 *
 * For each evaluated row it INDEPENDENTLY RECOMPUTES the expected value, numerator,
 * denominator, source fields, formula, baseline, variance, rating, cross-rooftop rank,
 * and confidence from the accepted held bundle + cohort + baseline registry + canonical
 * metric spec, and binds every lineage field to the admitted delivery envelope. Any
 * corruption (a changed value, a swapped SHA, a wrong baseline, an inconsistent rank, a
 * falsified proof string, an unverified benchmark) yields ok:false with the failed
 * clause. Pure.
 */
import { EVALUATORS } from './evaluators'
import {
  confidenceLabel,
  rankByDirection,
  rating,
  signedVariance,
} from './metrics'
import { METRIC_SPECS } from './metric-spec'
import type { MetricSpec } from './metric-spec'
import type { EvaluableId, HeldBundle } from './evaluators'
import type { BaselineRegistry } from './baseline-registry'
import type { DeliveryEnvelope } from './provenance'
import type { EvalRow } from './types'

export type ValidatorContext = {
  bundle: HeldBundle
  cohort: Array<{ dealer_id: string; bundle: HeldBundle }>
  dealerId: string
  dealerName: string
  period: { start: string; end: string; timezone: string }
  envelope: DeliveryEnvelope
  expectedProof: string
  registry: BaselineRegistry
}

export type SemanticResult = { ok: boolean; failed: Array<string> }

const EPS = 1e-12
const close = (a: number, b: number) => Math.abs(a - b) < EPS
const jsonEq = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b)

export function validateEvaluatedRow(
  row: EvalRow,
  ctx: ValidatorContext,
): SemanticResult {
  const failed: Array<string> = []
  const id = row.metric_id as EvaluableId
  const spec = (METRIC_SPECS as Partial<Record<EvaluableId, MetricSpec>>)[id]
  if (!spec) return { ok: false, failed: ['no_metric_spec'] }

  // 1. Recompute the candidate from the accepted bundle (source of truth).
  const cand = EVALUATORS[id](ctx.bundle)
  if (!cand.ok) return { ok: false, failed: ['evaluator_recompute_failed'] }

  // 2. Field-vs-spec-vs-candidate.
  if (
    row.source_family !== spec.source_family ||
    cand.source_family !== spec.source_family
  ) {
    failed.push('source_family_mismatch')
  }
  if (
    !jsonEq(row.source_fields, spec.source_fields) ||
    !jsonEq(cand.source_fields, spec.source_fields)
  ) {
    failed.push('source_fields_mismatch')
  }
  if (row.unit !== spec.unit || cand.unit !== spec.unit)
    failed.push('unit_mismatch')
  if (row.formula !== spec.formula || cand.formula !== spec.formula)
    failed.push('formula_mismatch')
  if (row.numerator !== cand.numerator) failed.push('numerator_mismatch')
  if (row.denominator !== cand.denominator) failed.push('denominator_mismatch')

  // 3. Value must equal both the recomputed candidate AND numerator/denominator.
  if (row.value === null || !close(row.value, cand.value)) {
    failed.push('value_inconsistent_with_source')
  } else if (
    row.numerator !== null &&
    row.denominator !== null &&
    row.denominator !== 0 &&
    !close(row.value, row.numerator / row.denominator)
  ) {
    failed.push('value_inconsistent_with_ratio')
  }

  // 4. Baseline binding (resolve authoritatively; reject wrong/unverified).
  const b = ctx.registry.resolve(spec.baseline_id)
  const rb = row.baseline
  if (!b) {
    failed.push('baseline_unresolved')
  } else if (!rb) {
    failed.push('baseline_missing')
  } else {
    if (rb.id !== spec.baseline_id || b.id !== spec.baseline_id)
      failed.push('baseline_id_mismatch')
    if (rb.basis !== spec.baseline_basis || b.basis !== spec.baseline_basis)
      failed.push('baseline_basis_mismatch')
    if (rb.value === null || !Number.isFinite(rb.value))
      failed.push('baseline_value_unverified')
    else if (b.value === null || !close(rb.value, b.value))
      failed.push('baseline_value_mismatch')
    if (rb.unit !== spec.unit) failed.push('baseline_unit_mismatch')
    if (rb.comparator !== spec.comparator)
      failed.push('baseline_comparator_mismatch')
    if (rb.direction !== spec.direction)
      failed.push('baseline_direction_mismatch')
    if (!rb.definition || rb.definition.trim().length === 0)
      failed.push('baseline_definition_blank')
  }

  // 5. Derived fields recomputed from the authoritative baseline + candidate.
  if (b && b.value !== null) {
    const wantVar = signedVariance(cand.value, b)
    if (
      row.variance === null ||
      wantVar === null ||
      !close(row.variance, wantVar)
    ) {
      failed.push('variance_incorrect')
    }
    if (row.rating !== rating(cand.value, b)) failed.push('rating_incorrect')

    // Rank recomputed across the three-rooftop cohort.
    const peers: Array<number> = []
    for (const c of ctx.cohort) {
      if (c.dealer_id === ctx.dealerId) continue
      const pc = EVALUATORS[id](c.bundle)
      if (pc.ok) peers.push(pc.value)
    }
    if (row.rank !== rankByDirection(cand.value, peers, spec.direction))
      failed.push('rank_incorrect')
  }

  const wantConf = confidenceLabel(cand.denominator)
  if (
    !row.evaluation_confidence ||
    row.evaluation_confidence.label !== wantConf
  ) {
    failed.push('confidence_incorrect')
  } else if (row.evaluation_confidence.basis.trim().length === 0) {
    failed.push('confidence_basis_blank')
  }

  // 6. Lineage bound to the admitted delivery envelope.
  const l = row.source_lineage
  const env = ctx.envelope
  if (!l) {
    failed.push('lineage_missing')
  } else {
    if (l.family !== spec.source_family) failed.push('lineage_family_mismatch')
    if (l.dealer_id !== ctx.dealerId) failed.push('lineage_dealer_id_mismatch')
    if (l.dealer_name !== ctx.dealerName)
      failed.push('lineage_dealer_name_mismatch')
    if (!jsonEq(l.reporting_period, ctx.period))
      failed.push('lineage_period_mismatch')
    if (l.artifact_filename !== env.filename)
      failed.push('lineage_filename_mismatch')
    if (
      l.artifact_sha256 !== env.sha256 ||
      !/^[0-9a-f]{64}$/.test(l.artifact_sha256)
    ) {
      failed.push('lineage_sha_mismatch')
    }
    if (l.captured_at !== env.received_at)
      failed.push('lineage_captured_at_mismatch')
    if (l.sales_only_proof !== ctx.expectedProof)
      failed.push('lineage_proof_falsified')
    if (l.source_type !== env.source_type)
      failed.push('lineage_source_type_mismatch')
    if (l.sender !== env.sender) failed.push('lineage_sender_mismatch')
    if (l.subject !== env.subject) failed.push('lineage_subject_mismatch')
    if (l.gmail_message_id !== env.gmail_message_id)
      failed.push('lineage_message_id_mismatch')
    if (l.period_hint !== env.period_hint)
      failed.push('lineage_period_hint_mismatch')
  }

  // 7. Row period/captured_at bound to the envelope (period not hardcoded).
  if (!jsonEq(row.reporting_period, ctx.period))
    failed.push('row_period_mismatch')
  if (row.captured_at !== env.received_at)
    failed.push('row_captured_at_mismatch')
  if (
    ctx.period.start !== env.period_start ||
    ctx.period.end !== env.period_end
  ) {
    failed.push('period_binding_mismatch')
  }

  return { ok: failed.length === 0, failed }
}
