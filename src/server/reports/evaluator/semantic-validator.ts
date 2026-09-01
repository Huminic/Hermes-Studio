/**
 * Gate 2 — SEMANTIC validator for evaluated rows (exhaustive binding, not presence).
 *
 * For each evaluated row it INDEPENDENTLY RECOMPUTES every value + derived field from the
 * accepted held bundle + cohort + baseline registry + canonical metric spec, and BINDS
 * every remaining field to its authoritative source: the CatalogCondition (metric_id,
 * condition, section, subsection, cluster, related ids, owner/action), the DealerInput
 * (dealer_id, profile, dealer_name), the delivery envelope (all lineage fields incl
 * attachment id + observed range), and deterministic placement derivations. Any single
 * corruption — including a rooftop relabel — yields ok:false with the failed clause. Pure.
 */
import { EVALUATORS } from './evaluators'
import {
  confidenceLabel,
  rankByDirection,
  rating,
  signedVariance,
} from './metrics'
import { METRIC_SPECS } from './metric-spec'
import {
  CONFIDENCE_BASIS,
  clusterOf,
  customerPdfLocation,
  internalEvidenceLocation,
  notificationCandidate,
  relatedMetricIds,
} from './placement'
import type { EvaluableId, HeldBundle } from './evaluators'
import type { MetricSpec } from './metric-spec'
import type { BaselineRegistry } from './baseline-registry'
import type { CatalogCondition } from './catalog'
import type { DeliveryEnvelope } from './provenance'
import type { Baseline, EvalRow } from './types'

export type ValidatorContext = {
  condition: CatalogCondition
  catalog: Array<CatalogCondition>
  bundle: HeldBundle
  cohort: Array<{ dealer_id: string; bundle: HeldBundle }>
  dealerId: string
  profile: string
  dealerName: string
  period: { start: string; end: string; timezone: string }
  envelope: DeliveryEnvelope
  expectedProof: string
  expectedObserved: { start: string; end: string } | null
  registry: BaselineRegistry
}

export type SemanticResult = { ok: boolean; failed: Array<string> }

const EPS = 1e-12
const close = (a: number, b: number) => Math.abs(a - b) < EPS
const jsonEq = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b)

// Every Baseline field is bound to the authoritative resolved baseline.
const BASELINE_FIELDS: Array<keyof Baseline> = [
  'basis',
  'id',
  'label',
  'unit',
  'value',
  'comparator',
  'direction',
  'source',
  'publication_date',
  'url',
  'confidence',
  'definition',
]

export function validateEvaluatedRow(
  row: EvalRow,
  ctx: ValidatorContext,
): SemanticResult {
  const failed: Array<string> = []
  const id = row.metric_id as EvaluableId
  const spec = (METRIC_SPECS as Partial<Record<EvaluableId, MetricSpec>>)[id]
  if (!spec) return { ok: false, failed: ['no_metric_spec'] }
  const c = ctx.condition

  // 0. status + catalog/dealer/placement identity (a rooftop relabel must fail here).
  if (row.status !== 'evaluated') failed.push('status_not_evaluated')
  if (row.metric_id !== spec.metric_id || row.metric_id !== c.metric_id)
    failed.push('metric_id_mismatch')
  if (row.condition !== c.condition) failed.push('condition_mismatch')
  if (row.dealer_id !== ctx.dealerId) failed.push('dealer_id_mismatch')
  if (row.profile !== ctx.profile) failed.push('profile_mismatch')
  if (row.section !== c.section) failed.push('section_mismatch')
  if (row.subsection !== c.subsection) failed.push('subsection_mismatch')
  if (row.cluster !== clusterOf(c.section)) failed.push('cluster_mismatch')
  if (
    !jsonEq(
      row.related_metric_ids,
      relatedMetricIds(ctx.catalog, c.section, c.metric_id),
    )
  )
    failed.push('related_metric_ids_mismatch')
  if (row.evidence_or_inference !== 'evidence')
    failed.push('evidence_or_inference_mismatch')
  if (row.recommended_owner !== (c.owner || null))
    failed.push('recommended_owner_mismatch')
  if (row.recommended_action !== (c.next_action || null))
    failed.push('recommended_action_mismatch')
  if (
    row.customer_pdf_location !==
    customerPdfLocation(ctx.profile, spec.metric_id)
  )
    failed.push('customer_pdf_location_mismatch')
  if (
    row.internal_evidence_location !==
    internalEvidenceLocation(spec.metric_id, ctx.dealerId)
  )
    failed.push('internal_evidence_location_mismatch')
  if (row.unresolved_reason !== null)
    failed.push('unresolved_reason_must_be_null')
  if (row.unresolved_owner !== null)
    failed.push('unresolved_owner_must_be_null')
  if (row.unresolved_next_action !== null)
    failed.push('unresolved_next_action_must_be_null')

  // 1. Recompute the candidate from the accepted bundle (source of truth).
  const cand = EVALUATORS[id](ctx.bundle)
  if (!cand.ok)
    return { ok: false, failed: [...failed, 'evaluator_recompute_failed'] }

  // 2. Metric fields vs spec + recomputed candidate.
  if (
    row.source_family !== spec.source_family ||
    cand.source_family !== spec.source_family
  )
    failed.push('source_family_mismatch')
  if (
    !jsonEq(row.source_fields, spec.source_fields) ||
    !jsonEq(cand.source_fields, spec.source_fields)
  )
    failed.push('source_fields_mismatch')
  if (row.unit !== spec.unit || cand.unit !== spec.unit)
    failed.push('unit_mismatch')
  if (row.formula !== spec.formula || cand.formula !== spec.formula)
    failed.push('formula_mismatch')
  if (row.numerator !== cand.numerator) failed.push('numerator_mismatch')
  if (row.denominator !== cand.denominator) failed.push('denominator_mismatch')

  // 3. Value equals both the recomputed candidate AND numerator/denominator.
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

  // 4. Baseline: resolve authoritatively, then bind EVERY field (wrong nonblank definition,
  //    unverified benchmark, mismatched label/source/confidence all fail).
  const b = ctx.registry.resolve(spec.baseline_id)
  const rb = row.baseline
  if (!b) {
    failed.push('baseline_unresolved')
  } else if (!rb) {
    failed.push('baseline_missing')
  } else {
    // Registry entry must itself be spec-consistent + a verified operational target.
    if (b.id !== spec.baseline_id) failed.push('baseline_registry_id_mismatch')
    if (b.basis !== spec.baseline_basis)
      failed.push('baseline_registry_basis_mismatch')
    if (b.value === null || !Number.isFinite(b.value))
      failed.push('baseline_registry_value_unverified')
    if (b.comparator !== spec.comparator)
      failed.push('baseline_registry_comparator_mismatch')
    if (b.direction !== spec.direction)
      failed.push('baseline_registry_direction_mismatch')
    if (b.definition.trim().length === 0)
      failed.push('baseline_registry_definition_blank')
    // Row baseline must equal the authoritative registry entry field-for-field.
    for (const f of BASELINE_FIELDS) {
      if (!jsonEq(rb[f], b[f])) failed.push(`baseline_${f}_mismatch`)
    }
    if (rb.value === null || !Number.isFinite(rb.value))
      failed.push('baseline_value_unverified')
  }

  // 5. Derived fields recomputed from the authoritative baseline + candidate.
  if (b && b.value !== null) {
    const wantVar = signedVariance(cand.value, b)
    if (
      row.variance === null ||
      wantVar === null ||
      !close(row.variance, wantVar)
    )
      failed.push('variance_incorrect')
    const wantRating = rating(cand.value, b)
    if (row.rating !== wantRating) failed.push('rating_incorrect')
    if (
      row.notification_or_automation_candidate !==
      notificationCandidate(wantRating)
    )
      failed.push('notification_candidate_incorrect')

    const peers: Array<number> = []
    for (const co of ctx.cohort) {
      if (co.dealer_id === ctx.dealerId) continue
      const pc = EVALUATORS[id](co.bundle)
      if (pc.ok) peers.push(pc.value)
    }
    if (row.rank !== rankByDirection(cand.value, peers, spec.direction))
      failed.push('rank_incorrect')
  }

  // 6. Confidence: exact label + canonical basis (invented basis fails).
  if (
    !row.evaluation_confidence ||
    row.evaluation_confidence.label !== confidenceLabel(cand.denominator)
  )
    failed.push('confidence_label_incorrect')
  else if (row.evaluation_confidence.basis !== CONFIDENCE_BASIS)
    failed.push('confidence_basis_incorrect')

  // 7. Lineage: bind EVERY field to the admitted envelope + checks-derived reader result.
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
    )
      failed.push('lineage_sha_mismatch')
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
    if (l.gmail_attachment_id !== env.gmail_attachment_id)
      failed.push('lineage_attachment_id_mismatch')
    if (l.period_hint !== env.period_hint)
      failed.push('lineage_period_hint_mismatch')
    if (!jsonEq(l.observed_date_range, ctx.expectedObserved))
      failed.push('lineage_observed_range_mismatch')
  }

  // 8. Row period/captured_at bound to the envelope (period not hardcoded).
  if (!jsonEq(row.reporting_period, ctx.period))
    failed.push('row_period_mismatch')
  if (row.captured_at !== env.received_at)
    failed.push('row_captured_at_mismatch')
  if (
    ctx.period.start !== env.period_start ||
    ctx.period.end !== env.period_end
  )
    failed.push('period_binding_mismatch')

  return { ok: failed.length === 0, failed }
}
