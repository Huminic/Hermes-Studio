/**
 * Gate 3 — EVIDENCE-DERIVED promotion probe (shadow repair, Defect 1).
 *
 * A condition is `promoted` ONLY when the REAL byte-backed Gate 2 evidence proves it: all
 * three governed dealer cells for the metric are `evaluated` in the spine (i.e. each passed
 * the real evaluator + provenance + baseline + strict/semantic predicates over the
 * SHA-allowlisted accepted bytes), AND its exact canonical definition/threshold binding is
 * compatible with the metric's evaluator contract (a mutated catalog condition, a non-held
 * acquisition class, a family/field/lineage/period mismatch, empty/absent evidence, or an
 * unknown metric all fail closed). Promotion is NOT read from a hard-coded id list.
 * Pure + deterministic.
 */
import { EVALUABLE_IDS } from './evaluators'
import { METRIC_SPECS } from './metric-spec'
import type { EvaluableId } from './evaluators'
import type { CatalogDetail } from './closure'
import type { EvalRow } from './types'

// Canonical definition/threshold binding for each evaluable metric (source of truth for the
// probe; asserted against the live catalog by the test so it cannot go stale).
export const CANONICAL_BINDING: Record<
  EvaluableId,
  { condition: string; threshold: number }
> = {
  'SW-011': {
    condition:
      'Median time-to-first-touch exceeds 10 minutes during business hours.',
    threshold: 10,
  },
  'SW-012': {
    condition:
      'Any lead untouched >30 minutes during staffed hours triggers escalation.',
    threshold: 0,
  },
  'SW-015': {
    condition:
      "Sales rep's average first-response time is 2x the store median.",
    threshold: 0,
  },
  'SW-031': {
    condition: 'Lead-to-appointment set rate falls below 25%.',
    threshold: 0.25,
  },
  'SW-032': {
    condition: 'Appointment show rate drops below 55%.',
    threshold: 0.55,
  },
  'SW-041': {
    condition: 'Appointment no-show rate exceeds 45%.',
    threshold: 0.45,
  },
}

// Acquisition classes that are NOT a held/native VinSolutions path — incompatible with a
// byte-backed promotion (used to reject a condition mutated to external/manual/etc.).
const NON_HELD_CLASSES = new Set<string>([
  'Separate external source required',
  'Outside governed boundary',
  'Manual CRM inspection',
  'Unavailable or retention-limited',
])

export const GOVERNED_DEALERS = ['21043', '21044', '21047'] as const

export type DealerEvidence = {
  dealer_id: string
  status: string
  source_family: string | null
  source_fields: Array<string> | null
  formula: string | null
  lineage_sha16: string | null
  sha_allowlisted: boolean
  filename_allowlisted: boolean
  reporting_period: { start: string; end: string; timezone: string } | null
  period_bound_to_accepted: boolean
  row_period_equals_lineage: boolean
  baseline_id: string | null
  baseline_value: number | null
  strict_predicate_pass: boolean
}

export type ProbeRecord = {
  metric_id: string
  condition: string
  catalog_source: string
  catalog_acquisition_class: string
  spec_source_family: string | null
  canonical_condition: string | null
  definition_compatible: boolean
  governed_dealer_cells: number
  dealer_cells_with_valid_evidence: number
  evidence_by_dealer: Array<DealerEvidence>
  promoted: boolean
  verdict: 'promoted' | 'not_promotable'
  reason: string
  leads_definition_note: string | null
}

function leadsNote(c: CatalogDetail): string | null {
  if (
    /response|first[- ]touch|speed[- ]to[- ]lead|untouched|auto-reply|SLA/i.test(
      c.condition,
    )
  ) {
    return 'Leads exposes "Actual Response Time (Min)" + "Originated After Hours", but the condition needs a MEDIAN during business hours with a defined treatment for untouched leads (blank response time). Excluding blank responders understates the metric and after-hours filtering changes the population — not definition-compatible; the catalog source is the Dashboard aggregate AVERAGE, not a median.'
  }
  if (/duplicate/i.test(c.condition)) {
    return 'Leads has a unique "Lead ID" + VIN + Customer, but the rule is DAILY intake; the accepted Leads export is a weekly window (grain mismatch), so a daily duplicate rate cannot be proved.'
  }
  if (/missing phone|missing email|phone AND email/i.test(c.condition)) {
    return 'Leads has only attempt datetimes ("Last Attempted Phone/Email Contact"), not phone/email PRESENCE columns, so missing-phone-AND-email is not computable.'
  }
  if (/close rate|sold|conversion/i.test(c.condition)) {
    return 'sold/total is computable from Leads ("Sold Datetime"), but every catalog close-rate condition is a TREND rule (drops >X% MoM/WoW); there is no point-in-time close-rate LEVEL rule with an operational target, and a one-week Leads file cannot satisfy a trend.'
  }
  if (
    /source volume|lead source|attribution|third-party lead|provider ROI/i.test(
      c.condition,
    )
  ) {
    return 'Leads has "Lead Source"/"Lead Source Group", but these conditions are trend rules or require cost/attribution (ROI, quarantined); a one-week Leads file cannot satisfy trend or cost.'
  }
  return null
}

export type ProbeSummary = {
  total_conditions: number
  promoted: number
  not_promotable: number
  promoted_ids: Array<string>
  evidence_source: string
}

// The authoritative accepted-delivery allowlist (from native-scheduled-evidence.json / the
// real assembled inputs). A promotion cell's lineage must EXACTLY match the allowlisted
// filename + SHA + period_hint + proved reporting_period for its profile+family — a
// well-formed but wrong 64-hex, a swapped filename, or a co-mutated row+lineage period must
// all fail.
export type AcceptedDelivery = {
  profile: string
  family: string
  sha256: string
  filename: string
  period_hint: string
  reporting_period: { start: string; end: string; timezone: string }
}
export type AcceptedEvidence = { held_deliveries: Array<AcceptedDelivery> }

const DEFAULT_TZ = 'America/New_York'
const PERIOD_HINT_RE = /^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/

/** Build the accepted binding from raw held deliveries (parses period_hint -> period). */
export function buildAcceptedEvidence(
  held: Array<{
    profile: string
    family: string
    sha256: string
    filename: string
    period_hint: string
  }>,
  timezone: string = DEFAULT_TZ,
): AcceptedEvidence {
  return {
    held_deliveries: held.map((d) => {
      const m = PERIOD_HINT_RE.exec(d.period_hint.trim())
      const reporting_period = m
        ? { start: m[1], end: m[2], timezone }
        : { start: '', end: '', timezone }
      return {
        profile: d.profile,
        family: d.family,
        sha256: d.sha256,
        filename: d.filename,
        period_hint: d.period_hint,
        reporting_period,
      }
    }),
  }
}

const GOVERNED_PAIRS: Record<string, string> = {
  'serra-honda': '21043',
  'serra-nissan': '21044',
  'tony-serra-ford': '21047',
}

const jsonEq = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b)

type MetricSpec = (typeof METRIC_SPECS)[EvaluableId]

function specFor(metricId: string): MetricSpec | undefined {
  return (METRIC_SPECS as Partial<Record<EvaluableId, MetricSpec>>)[
    metricId as EvaluableId
  ]
}

function allowlistDelivery(
  accepted: AcceptedEvidence,
  profile: string,
  family: string,
): AcceptedDelivery | undefined {
  return accepted.held_deliveries.find(
    (d) => d.profile === profile && d.family === family,
  )
}

/**
 * Non-circular, independently-verified evidence for one governed dealer cell. Binds the row
 * to: the exact metric-spec source family/fields/formula/unit; the exact allowlisted delivery
 * SHA for its profile+family; lineage family/dealer; row↔lineage period equality; profile↔
 * dealer governed pair; and the exact baseline id/basis/comparator/direction + canonical
 * threshold. status='evaluated' alone is NOT sufficient.
 */
function validEvidence(
  r: EvalRow,
  spec: MetricSpec,
  canonical: { condition: string; threshold: number },
  accepted: AcceptedEvidence,
): boolean {
  const l = r.source_lineage
  if (l === null) return false
  const del = allowlistDelivery(accepted, r.profile, spec.source_family)
  if (del === undefined) return false
  const b = r.baseline
  return (
    r.status === 'evaluated' &&
    r.condition === canonical.condition &&
    GOVERNED_PAIRS[r.profile] === r.dealer_id &&
    r.source_family === spec.source_family &&
    jsonEq(r.source_fields, spec.source_fields) &&
    r.formula === spec.formula &&
    r.unit === spec.unit &&
    l.family === spec.source_family &&
    l.dealer_id === r.dealer_id &&
    // Bind lineage to the EXACT accepted delivery (filename + SHA + period_hint + period),
    // and bind BOTH the row period and the lineage period to that proved period — so a
    // co-mutated row+lineage period (with a still-allowlisted SHA) fails.
    l.artifact_filename === del.filename &&
    l.artifact_sha256 === del.sha256 &&
    l.period_hint === del.period_hint &&
    jsonEq(l.reporting_period, del.reporting_period) &&
    jsonEq(r.reporting_period, del.reporting_period) &&
    b !== null &&
    b.id === spec.baseline_id &&
    b.basis === spec.baseline_basis &&
    b.comparator === spec.comparator &&
    b.direction === spec.direction &&
    b.value === canonical.threshold
  )
}

function dealerEvidence(
  r: EvalRow,
  spec: MetricSpec,
  canonical: { condition: string; threshold: number },
  accepted: AcceptedEvidence,
): DealerEvidence {
  const l = r.source_lineage
  const del = allowlistDelivery(accepted, r.profile, spec.source_family)
  return {
    dealer_id: r.dealer_id,
    status: r.status,
    source_family: r.source_family,
    source_fields: r.source_fields,
    formula: r.formula,
    lineage_sha16: l ? l.artifact_sha256.slice(0, 16) : null,
    sha_allowlisted:
      l !== null && del !== undefined && l.artifact_sha256 === del.sha256,
    filename_allowlisted:
      l !== null && del !== undefined && l.artifact_filename === del.filename,
    reporting_period: r.reporting_period,
    period_bound_to_accepted:
      l !== null &&
      del !== undefined &&
      l.period_hint === del.period_hint &&
      jsonEq(l.reporting_period, del.reporting_period) &&
      jsonEq(r.reporting_period, del.reporting_period),
    row_period_equals_lineage:
      l !== null && jsonEq(r.reporting_period, l.reporting_period),
    baseline_id: r.baseline ? r.baseline.id : null,
    baseline_value: r.baseline ? r.baseline.value : null,
    strict_predicate_pass: validEvidence(r, spec, canonical, accepted),
  }
}

/**
 * Probe promotion from the ACTUAL Gate 2 spine rows (evidence). `spineRows` are the
 * evaluated + unresolved rows produced from the SHA-allowlisted accepted bytes.
 */
export function probeConditions(
  catalog: Array<CatalogDetail>,
  spineRows: Array<EvalRow>,
  accepted: AcceptedEvidence,
): { records: Array<ProbeRecord>; summary: ProbeSummary } {
  const rowsByMetric = new Map<string, Array<EvalRow>>()
  for (const r of spineRows) {
    const arr = rowsByMetric.get(r.metric_id) ?? []
    arr.push(r)
    rowsByMetric.set(r.metric_id, arr)
  }

  const records: Array<ProbeRecord> = catalog.map((c) => {
    const spec = specFor(c.metric_id)
    const canonical = (
      CANONICAL_BINDING as Partial<
        Record<string, { condition: string; threshold: number }>
      >
    )[c.metric_id]
    const rows = rowsByMetric.get(c.metric_id) ?? []
    const governedRows = rows.filter((r) =>
      (GOVERNED_DEALERS as ReadonlyArray<string>).includes(r.dealer_id),
    )
    const sourceFamily = spec ? spec.source_family : null

    const evidence =
      spec && canonical
        ? governedRows.map((r) => dealerEvidence(r, spec, canonical, accepted))
        : []
    const validCount = evidence.filter((e) => e.strict_predicate_pass).length

    // Exactly one distinct cell per governed dealer (no duplicates, no missing).
    const distinctDealers = new Set(governedRows.map((r) => r.dealer_id))
    const oneEachGovernedDealer =
      governedRows.length === GOVERNED_DEALERS.length &&
      distinctDealers.size === GOVERNED_DEALERS.length &&
      GOVERNED_DEALERS.every((d) => distinctDealers.has(d))

    const definitionCompatible =
      spec !== undefined &&
      canonical !== undefined &&
      c.condition === canonical.condition &&
      !NON_HELD_CLASSES.has(c.acquisition_class)

    const promoted =
      definitionCompatible &&
      oneEachGovernedDealer &&
      validCount === GOVERNED_DEALERS.length

    let reason: string
    if (promoted) {
      reason = `promoted: each of the ${GOVERNED_DEALERS.length} distinct governed dealer cells independently binds to the exact allowlisted delivery SHA + metric-spec source family/fields/formula + canonical threshold + baseline id/basis/comparator/direction + row=lineage period; status=evaluated alone is not sufficient`
    } else if (spec === undefined || canonical === undefined) {
      const un = rows.find((r) => r.status === 'unresolved')
      reason =
        un?.unresolved_reason ??
        'no canonical evaluable binding for this metric'
    } else if (!definitionCompatible) {
      reason = `canonical binding incompatible: catalog condition or acquisition_class was mutated / is not a held path (expected "${canonical.condition}", held acquisition; got acquisition_class="${c.acquisition_class}")`
    } else if (!oneEachGovernedDealer) {
      reason = `governed dealer cells are not exactly one distinct cell per dealer (got ${governedRows.length} rows, ${distinctDealers.size} distinct dealers)`
    } else {
      reason = `only ${validCount} of ${GOVERNED_DEALERS.length} governed dealer cells have valid byte-backed evidence (allowlisted SHA + spec + baseline + row=lineage period)`
    }

    return {
      metric_id: c.metric_id,
      condition: c.condition,
      catalog_source: c.source,
      catalog_acquisition_class: c.acquisition_class,
      spec_source_family: sourceFamily,
      canonical_condition: canonical ? canonical.condition : null,
      definition_compatible: definitionCompatible,
      governed_dealer_cells: governedRows.length,
      dealer_cells_with_valid_evidence: validCount,
      evidence_by_dealer: evidence,
      promoted,
      verdict: promoted ? 'promoted' : 'not_promotable',
      reason,
      leads_definition_note: promoted ? null : leadsNote(c),
    }
  })

  const promotedIds = records
    .filter((r) => r.promoted)
    .map((r) => r.metric_id)
    .sort()
  return {
    records,
    summary: {
      total_conditions: records.length,
      promoted: promotedIds.length,
      not_promotable: records.length - promotedIds.length,
      promoted_ids: promotedIds,
      evidence_source:
        'Gate 2 spine rows computed from SHA-allowlisted accepted bytes (not a hard-coded id list)',
    },
  }
}

export { EVALUABLE_IDS }
