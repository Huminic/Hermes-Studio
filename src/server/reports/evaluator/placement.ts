/**
 * Deterministic placement/derivation helpers shared by the spine (which BUILDS each row)
 * and the semantic validator (which RECOMPUTES + binds each row). Keeping them in one
 * module guarantees the two cannot diverge. Pure.
 */
import { EVALUABLE_IDS } from './evaluators'
import type { CatalogCondition } from './catalog'

export const CONFIDENCE_BASIS = 'denominator sample size'

/** Evaluable sibling ids in the same catalog section, in catalog order, minus self. */
export function relatedMetricIds(
  catalog: Array<CatalogCondition>,
  section: string,
  metricId: string,
): Array<string> {
  return catalog
    .filter(
      (c) =>
        (EVALUABLE_IDS as ReadonlyArray<string>).includes(c.metric_id) &&
        c.section === section &&
        c.metric_id !== metricId,
    )
    .map((c) => c.metric_id)
}

export function clusterOf(section: string): string {
  return section
}

export function customerPdfLocation(profile: string, metricId: string): string {
  return `docs/halo/customer/${profile}/${metricId}.pdf (Gate 3+, not yet produced)`
}

export function internalEvidenceLocation(
  metricId: string,
  dealerId: string,
): string {
  return `docs/halo/evidence/m1r/evaluator/spine-ledger.json#${metricId}:${dealerId}`
}

export function notificationCandidate(
  rating: 'healthy' | 'watch' | 'breach' | null,
): 'alert_candidate' | 'monitor_only' {
  return rating === 'breach' ? 'alert_candidate' : 'monitor_only'
}
