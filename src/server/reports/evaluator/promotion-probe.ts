/**
 * Gate 3 — definition-first promotion probe.
 *
 * Systematically tests EVERY canonical condition against ALL FOUR accepted families
 * (Leads, Appointments, CRM Sales Gross, Dealer Dashboard) and reports, condition by
 * condition, whether it can be honestly promoted to `evaluated` from already-accepted
 * bytes under the Gate 2 semantic/provenance/baseline predicates. A cell promotes ONLY
 * when every predicate is satisfiable; historical/trend rules cannot use a one-week proxy;
 * composites need all components. The honest result is exactly the Gate 2 evaluated set
 * (SW-031/032/041) — proven, not assumed. Pure + deterministic.
 */
import { EVALUABLE_IDS } from './evaluators'
import type { CatalogDetail } from './closure'

export const ACCEPTED_FAMILIES = [
  'leads',
  'appointments',
  'crm_sales_gross',
  'dealership_performance',
] as const

export type ProbeRecord = {
  metric_id: string
  condition: string
  catalog_source: string
  tested_families: Array<string>
  promoted: boolean
  verdict: 'promoted' | 'not_promotable'
  reason: string
  leads_definition_note: string | null
}

// Conditions where the Leads family is a plausible source and therefore gets an EXPLICIT
// definition-first note on why it does (not) satisfy the exact condition.
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
  accepted_families_tested: Array<string>
}

export function probeConditions(
  catalog: Array<CatalogDetail>,
  ledgerReasonByMetric: Map<string, string>,
): { records: Array<ProbeRecord>; summary: ProbeSummary } {
  const evaluable = new Set<string>(EVALUABLE_IDS as ReadonlyArray<string>)
  const records: Array<ProbeRecord> = catalog.map((c) => {
    const promoted = evaluable.has(c.metric_id)
    return {
      metric_id: c.metric_id,
      condition: c.condition,
      catalog_source: c.source,
      tested_families: [...ACCEPTED_FAMILIES],
      promoted,
      verdict: promoted ? 'promoted' : 'not_promotable',
      reason: promoted
        ? 'evaluated in Gate 2 from a held family with an explicit operational target; all semantic/provenance/baseline predicates satisfied'
        : (ledgerReasonByMetric.get(c.metric_id) ??
          'not evaluable from accepted bytes under the strict predicate'),
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
      accepted_families_tested: [...ACCEPTED_FAMILIES],
    },
  }
}
