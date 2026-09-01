/**
 * Gate 2 — the STRICT evaluated predicate.
 *
 * status='evaluated' is legal ONLY when every clause below holds. The spine runs this
 * on every candidate row and downgrades any that fails to 'unresolved'. Removing any
 * single required proof field must flip the verdict to false (mutation-tested).
 *
 * Pure. No I/O.
 */
import { HELD_FAMILIES, QUARANTINED_FAMILIES } from './families'
import type { EvalRow } from './types'

export type PredicateResult = { ok: boolean; failed: Array<string> }

function isNonNegInt(n: number | null): n is number {
  return n !== null && Number.isInteger(n) && n >= 0
}

function isPosInt(n: number | null): n is number {
  return n !== null && Number.isInteger(n) && n > 0
}

function lineageComplete(row: EvalRow): boolean {
  const l = row.source_lineage
  if (!l) return false
  return (
    l.family.length > 0 &&
    l.artifact_filename.length > 0 &&
    l.artifact_sha256.length === 64 &&
    l.captured_at.length > 0 &&
    l.dealer_id.length > 0 &&
    l.dealer_name.length > 0 &&
    l.sales_only_proof.length > 0 &&
    l.reporting_period.start.length > 0 &&
    l.reporting_period.end.length > 0
  )
}

/** Evaluate the strict predicate. Collects every failed clause (for mutation tests). */
export function evaluateStrictPredicate(row: EvalRow): PredicateResult {
  const failed: Array<string> = []

  if (row.value === null || !Number.isFinite(row.value))
    failed.push('value_is_computed_from_accepted_source')

  const fam = row.source_family
  if (fam === null || !HELD_FAMILIES.includes(fam))
    failed.push('source_family_is_held_or_accepted')
  if (fam !== null && QUARANTINED_FAMILIES.includes(fam))
    failed.push('source_family_not_quarantined')

  if (!isNonNegInt(row.numerator)) failed.push('numerator_is_explicit_integer')
  // A positive-integer denominator is exactly the "missing is not zero" guard: a blank
  // or zero denominator yields null/0 -> fails here rather than fabricating a rate.
  if (!isPosInt(row.denominator))
    failed.push('denominator_is_explicit_positive_integer')

  if (!row.formula || row.formula.length === 0)
    failed.push('formula_is_explicit')

  if (
    !row.reporting_period ||
    !row.reporting_period.start ||
    !row.reporting_period.end
  ) {
    failed.push('reporting_period_proved')
  }
  if (!row.captured_at || row.captured_at.length === 0)
    failed.push('captured_at_proved')

  if (
    !row.baseline ||
    row.baseline.value === null ||
    !Number.isFinite(row.baseline.value)
  ) {
    failed.push(
      'definition_compatible_baseline_or_labeled_operational_target_exists',
    )
  }

  if (row.variance === null || !Number.isFinite(row.variance))
    failed.push('variance_computed')
  if (row.rating === null) failed.push('rating_computed')
  if (row.rank === null) failed.push('rank_computed')
  if (row.evaluation_confidence === null)
    failed.push('evaluation_confidence_computed')

  if (!lineageComplete(row)) failed.push('source_lineage_complete')

  return { ok: failed.length === 0, failed }
}
