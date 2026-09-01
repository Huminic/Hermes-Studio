/**
 * Gate 2 — the exact 885-cell evaluator spine.
 *
 * buildSpine maps exactly SW-001..SW-295 x {21043,21044,21047} to 885 unique
 * dealer-metric rows. A row is 'evaluated' ONLY when its evaluator produces a value from
 * a HELD family AND both the structural strict predicate AND the SEMANTIC validator pass
 * (the latter recomputes every value/derived field and binds lineage to the admitted
 * delivery envelope). Every other row is 'unresolved' with a precise reason/owner/next
 * action. Unresolved rows stay in the ledger but do NOT count toward completion.
 * Deterministic + pure (no I/O, no clock, no randomness).
 */
import { EVALUABLE_IDS, EVALUATORS } from './evaluators'
import {
  confidenceLabel,
  rankByDirection,
  rating,
  signedVariance,
} from './metrics'
import {
  CONFIDENCE_BASIS,
  clusterOf,
  customerPdfLocation,
  internalEvidenceLocation,
  notificationCandidate,
  relatedMetricIds,
} from './placement'
import { evaluateStrictPredicate } from './strict-predicate'
import { validateEvaluatedRow } from './semantic-validator'
import type { EvaluableId, HeldBundle } from './evaluators'
import type { BaselineRegistry } from './baseline-registry'
import type { CatalogCondition } from './catalog'
import type { DeliveryEnvelope } from './provenance'
import type { EvalRow, SourceLineage } from './types'

export type FamilyLineage = {
  envelope: DeliveryEnvelope
  sales_only_proof: string
  observed_date_range: { start: string; end: string } | null
}

export type DealerInput = {
  dealer_id: string
  profile: string
  dealer_name: string
  reporting_period: { start: string; end: string; timezone: string }
  bundle: HeldBundle
  lineage: {
    appointments: FamilyLineage
    crm_sales_gross: FamilyLineage
    dealership_performance: FamilyLineage
    leads: FamilyLineage
  }
}

const LEADS_FAMILY_SLUG = 'vinsolutions_custom_reporting_leads'

/** Map an evaluator source_family to its DealerInput.lineage key. */
function familyKey(sourceFamily: string): keyof DealerInput['lineage'] | null {
  if (
    sourceFamily === 'appointments' ||
    sourceFamily === 'crm_sales_gross' ||
    sourceFamily === 'dealership_performance'
  )
    return sourceFamily
  if (sourceFamily === LEADS_FAMILY_SLUG) return 'leads'
  return null
}

export type SpineInput = {
  catalog: Array<CatalogCondition>
  dealers: Array<DealerInput>
  registry: BaselineRegistry
  evaluableBaselineIds: Record<string, string>
}

export type Spine = {
  rows: Array<EvalRow>
  summary: {
    required_cells: number
    evaluated: number
    unresolved: number
    by_dealer: Record<string, { evaluated: number; unresolved: number }>
    by_source_family: Record<string, number>
    by_section_evaluated: Record<string, number>
    evaluated_ids: Array<string>
  }
}

const QUARANTINE_HINTS = [
  /\bROI\b/i,
  /Communication Log/i,
  /\bCAGE\b/i,
  /Enterprise Performance/i,
]
const TREND_HINTS = [
  /week-over-week/i,
  /month-over-month/i,
  /trailing/i,
  /consecutive/i,
  /declining/i,
  /\brising\b/i,
  /\d+\s*weeks?\b/i,
  /\bMoM\b/,
  /\bWoW\b/,
]

function familyLineage(
  input: DealerInput,
  family: keyof DealerInput['lineage'],
): FamilyLineage {
  return input.lineage[family]
}

function lineageFor(input: DealerInput, family: string): SourceLineage | null {
  const key = familyKey(family)
  if (key === null) return null
  const fl = familyLineage(input, key)
  const env = fl.envelope
  return {
    family,
    artifact_filename: env.filename,
    artifact_sha256: env.sha256,
    captured_at: env.received_at,
    reporting_period: input.reporting_period,
    dealer_id: input.dealer_id,
    dealer_name: input.dealer_name,
    sales_only_proof: fl.sales_only_proof,
    source_type: env.source_type,
    sender: env.sender,
    subject: env.subject,
    gmail_message_id: env.gmail_message_id,
    gmail_attachment_id: env.gmail_attachment_id,
    capture_id: env.capture_id,
    source_url: env.source_url,
    period_hint: env.period_hint,
    observed_date_range: fl.observed_date_range,
  }
}

/** Deterministic unresolved reason from the catalog + (for a few ids) real held data. */
function unresolvedReason(c: CatalogCondition, input: DealerInput): string {
  const crm = input.bundle.crm
  switch (c.metric_id) {
    case 'SW-050':
      if (!crm) return 'CRM Sales Gross held family unavailable'
      if (crm.newDeals <= 0)
        return `0 new-car deals in period (denominator 0; missing is not zero)`
      if (crm.newFrontBlank > 0)
        return `${crm.newFrontBlank} of ${crm.newDeals} new-car deals have blank Front Gross; denominator integrity fails (missing is not zero)`
      return 'front-gross-negative rate on new deals not evaluated'
    case 'SW-042':
      return "Is Confirmed lacks the 'reconfirmed within 24h' timing basis; definition mismatch"
    case 'SW-034':
      return 'CRM Sales Gross has no write-up count; write-to-close denominator unavailable'
    case 'SW-008':
      return 'Appointments report has no lead-source attribution; per-source lead-to-appointment ratio not computable'
    case 'SW-049':
      return 'requires trailing 30-day gross-per-unit average; single held week insufficient'
    case 'SW-043':
      return 'requires 3 consecutive weeks; single held week insufficient'
    case 'SW-111':
    case 'SW-113':
    case 'SW-114':
      return 'second-order composite requires a trend/threshold basis not defined in held single-week data'
    default:
      break
  }
  if (/Dealer Dashboard Response Times/i.test(c.source)) {
    return 'Dashboard provides an AVERAGE (not the definitional median) with no business-hours/per-lead/per-rep filter; definition mismatch'
  }
  if (QUARANTINE_HINTS.some((re) => re.test(c.source))) {
    return 'source is (or joins) a quarantined family (lead_source_roi / cage_kpi / sales_comm_log) with hidden Parts/Service Lead Intents; excluded from values, baselines, scoring, and narrative'
  }
  switch (c.acquisition_class) {
    case 'Separate external source required':
      return 'requires a non-VinSolutions external source named by the condition; outside held families'
    case 'Manual CRM inspection':
      return 'requires manual CRM inspection; no scheduled export available'
    case 'Outside governed boundary':
      return 'outside the governed boundary (Service / cross-rooftop / compliance / enrichment); classification only, no access authorized'
    case 'Unavailable or retention-limited':
      return 'source unavailable or retention-limited for the period'
    default:
      break
  }
  if (TREND_HINTS.some((re) => re.test(c.condition))) {
    return 'requires trailing history; a single held week is insufficient for this trend/threshold rule'
  }
  return `not evaluable from held families under the strict predicate (acquisition_class="${c.acquisition_class}", source="${c.source}")`
}

export function buildSpine(input: SpineInput): Spine {
  const { catalog, dealers, registry, evaluableBaselineIds } = input
  const cohort = dealers.map((d) => ({
    dealer_id: d.dealer_id,
    bundle: d.bundle,
  }))

  const rows: Array<EvalRow> = []
  for (const c of catalog) {
    for (const d of dealers) {
      rows.push(buildRow(c, d, catalog, registry, evaluableBaselineIds, cohort))
    }
  }

  return { rows, summary: summarize(rows) }
}

function buildRow(
  c: CatalogCondition,
  d: DealerInput,
  catalog: Array<CatalogCondition>,
  registry: BaselineRegistry,
  evaluableBaselineIds: Record<string, string>,
  cohort: Array<{ dealer_id: string; bundle: HeldBundle }>,
): EvalRow {
  const base: EvalRow = {
    metric_id: c.metric_id,
    dealer_id: d.dealer_id,
    profile: d.profile,
    section: c.section,
    subsection: c.subsection,
    condition: c.condition,
    status: 'unresolved',
    source_family: null,
    source_lineage: null,
    source_fields: null,
    formula: null,
    value: null,
    unit: null,
    numerator: null,
    denominator: null,
    reporting_period: null,
    captured_at: null,
    baseline: null,
    variance: null,
    rating: null,
    rank: null,
    evaluation_confidence: null,
    evaluation_detail: null,
    related_metric_ids: relatedMetricIds(catalog, c.section, c.metric_id),
    cluster: clusterOf(c.section),
    evidence_or_inference: null,
    recommended_owner: c.owner || null,
    recommended_action: c.next_action || null,
    notification_or_automation_candidate: null,
    customer_pdf_location: customerPdfLocation(d.profile, c.metric_id),
    internal_evidence_location: internalEvidenceLocation(
      c.metric_id,
      d.dealer_id,
    ),
    unresolved_reason: null,
    unresolved_owner: null,
    unresolved_next_action: null,
  }

  const isEvaluable = (EVALUABLE_IDS as ReadonlyArray<string>).includes(
    c.metric_id,
  )
  if (!isEvaluable) {
    return toUnresolved(base, c, unresolvedReason(c, d))
  }

  const id = c.metric_id as EvaluableId
  const res = EVALUATORS[id](d.bundle)
  if (!res.ok) {
    return toUnresolved(base, c, res.reason)
  }

  const baselineId = evaluableBaselineIds[c.metric_id] ?? ''
  const baseline = registry.resolve(baselineId)
  const lineage = lineageFor(d, res.source_family)
  const dir = baseline?.direction ?? 'higher_is_better'
  const peers = cohort
    .filter((x) => x.dealer_id !== d.dealer_id)
    .flatMap((x) => {
      const r = EVALUATORS[id](x.bundle)
      return r.ok ? [r.value] : []
    })
  const candidate: EvalRow = {
    ...base,
    status: 'evaluated',
    source_family: res.source_family,
    source_lineage: lineage,
    source_fields: res.source_fields,
    formula: res.formula,
    value: res.value,
    unit: res.unit,
    numerator: res.numerator,
    denominator: res.denominator,
    reporting_period: d.reporting_period,
    captured_at: lineage?.captured_at ?? null,
    baseline,
    variance: baseline ? signedVariance(res.value, baseline) : null,
    rating: baseline ? rating(res.value, baseline) : null,
    rank: rankByDirection(res.value, peers, dir),
    evaluation_confidence: {
      label: confidenceLabel(res.denominator),
      basis: CONFIDENCE_BASIS,
    },
    evaluation_detail: res.detail,
    evidence_or_inference: 'evidence',
    notification_or_automation_candidate: notificationCandidate(
      baseline ? rating(res.value, baseline) : null,
    ),
  }

  // Both gates must pass: structural presence AND semantic recomputation/binding.
  const structural = evaluateStrictPredicate(candidate)
  if (!structural.ok) {
    return toUnresolved(
      base,
      c,
      `strict predicate failed: ${structural.failed.join(', ')}`,
    )
  }
  const fl = familyLineage(d, familyKey(res.source_family)!)
  const semantic = validateEvaluatedRow(candidate, {
    condition: c,
    catalog,
    bundle: d.bundle,
    cohort,
    dealerId: d.dealer_id,
    profile: d.profile,
    dealerName: d.dealer_name,
    period: d.reporting_period,
    envelope: fl.envelope,
    expectedProof: fl.sales_only_proof,
    expectedObserved: fl.observed_date_range,
    registry,
  })
  if (!semantic.ok) {
    return toUnresolved(
      base,
      c,
      `semantic validation failed: ${semantic.failed.join(', ')}`,
    )
  }
  return { ...candidate, status: 'evaluated' }
}

function toUnresolved(
  base: EvalRow,
  c: CatalogCondition,
  reason: string,
): EvalRow {
  return {
    ...base,
    status: 'unresolved',
    unresolved_reason: reason,
    unresolved_owner: c.owner || 'Huminic Semantic Watchdog pipeline',
    unresolved_next_action:
      c.next_action || 'resolve source/definition/baseline before evaluation',
  }
}

function summarize(rows: Array<EvalRow>): Spine['summary'] {
  const by_dealer: Record<string, { evaluated: number; unresolved: number }> =
    {}
  const by_source_family: Record<string, number> = {}
  const by_section_evaluated: Record<string, number> = {}
  const evaluated_ids = new Set<string>()
  let evaluated = 0
  let unresolved = 0
  for (const r of rows) {
    by_dealer[r.dealer_id] ??= { evaluated: 0, unresolved: 0 }
    if (r.status === 'evaluated') {
      evaluated++
      by_dealer[r.dealer_id].evaluated++
      const fam = r.source_family ?? 'unknown'
      by_source_family[fam] = (by_source_family[fam] ?? 0) + 1
      by_section_evaluated[r.section] =
        (by_section_evaluated[r.section] ?? 0) + 1
      evaluated_ids.add(r.metric_id)
    } else {
      unresolved++
      by_dealer[r.dealer_id].unresolved++
    }
  }
  return {
    required_cells: rows.length,
    evaluated,
    unresolved,
    by_dealer,
    by_source_family,
    by_section_evaluated,
    evaluated_ids: [...evaluated_ids].sort(),
  }
}
