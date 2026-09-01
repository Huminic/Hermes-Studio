/**
 * Gate 4I — VinSolutions Response Times read-only browser evidence (pure logic).
 *
 * Gate 4I ingests ONE completed real read-only browser capture (three governed Sales rooftops:
 * Honda 21043 / Nissan 21044 / Ford 21047) and records it as SUPPLEMENTAL, MEASURED-BUT-UNSCORED
 * evidence for SW-013 / SW-016 / SW-017. It promotes NOTHING.
 *
 * Why nothing promotes (each reason is independently sufficient; all are tied to committed state):
 *   1. SW-013's committed `frozen_e1_spec` is entirely "unresolved (held)" — numerator, denominator,
 *      event_sequence, window, threshold, minimum_sample, minimum_history, ambiguity_handling and unit
 *      are all held, and rank_direction is "not_applicable (held)". There is NO ratified metric spec
 *      and NO committed baseline/rank to score or rank against.
 *   2. Definition mismatch: the committed SW-013 condition is "After-hours leads with NO response by
 *      opening +15 min." (a no-response population). This capture measures LATE response among good
 *      leads that WERE responded to (Response later than Actionable +15) — a different population and a
 *      different event. Promoting would require altering the committed definition to fit the data,
 *      which the goal forbids.
 *   3. The committed promotion-probe already ruled SW-013 `not_promotable` / `definition_compatible:
 *      false` (dashboard AVERAGE, not the definitional median; after-hours filtering changes the
 *      population; blank responders excluded), and the committed acquisition-contract marks the
 *      readonly_browser_capture route `candidate_unproved` / `closes_cells_only_when_proved: true`.
 *      This capture does not resolve median-vs-average, a business-hours calendar, or an untouched-lead
 *      policy, so the route stays unproved.
 *
 * Therefore the portfolio is UNCHANGED: 17 evaluated / 278 unresolved (51 / 834 / 885 cells). SW-013,
 * SW-016 and SW-017 remain in the 122 Gate-4G HOLD partition. Missing baseline is not missing data and
 * is never zero.
 *
 * This module is PURE (no I/O). It carries the transcribed AGGREGATE-only capture (the raw per-lead
 * rows carry internal-only rep names and are retained out-of-repo, referenced by sha256), the
 * measured-unscored claim-layer contract, and the customer-safe observation builder. Customer strings
 * reuse the Gate 4H plain-language layer + guards so no internal jargon, Service/Parts data, rep name,
 * or PII can reach the customer.
 */
import {
  INTERNAL_JARGON,
  SERVICE_PARTS_DATA,
  plainify,
} from '@/server/reports/residual/gate4h-downstream-contract'

/** The three governed Sales rooftops. */
export const GOVERNED_ROOFTOPS = ['21043', '21044', '21047'] as const

/** Host the capture provenance MUST be on (Sales-only VinSolutions surface). */
export const REQUIRED_SOURCE_HOST = 'vinsolutions.app.coxautoinc.com' as const

/** The three metric IDs this capture supplies supplemental evidence for. All remain UNRESOLVED. */
export const SUPPLEMENTAL_METRIC_IDS = ['SW-013', 'SW-016', 'SW-017'] as const

/** Provenance shape. Fields are primitive-typed (not literal-narrowed) so the generator's
 * fail-closed provenance/control guards are genuine runtime checks, not static tautologies. */
export type CaptureProvenance = {
  artifact: string
  capture_id: string
  capture_method: string
  captured_at: string
  capture_completed_at: string
  source_url: string
  source_host: string
  report_definition: string
  period: {
    from: string
    to: string
    compare_from: string
    compare_to: string
    compare_label: string
  }
  controls: {
    authenticated: boolean
    lead_type_selected: string
    service_parts_selected: boolean
    service_selected: boolean
    parts_selected: boolean
    external_mutation: boolean
    native_csv_or_excel_control_found: boolean
    drilldown_route: string
    privacy: string
    population_validation: string
  }
  raw_evidence: {
    retained: string
    byte_count: number
    sha256: string
    note: string
  }
}

/**
 * Chain-of-custody for the retained raw capture. The raw JSON is retained as an internal working copy
 * OUT of the repository (the aggregate-only commit rule; the per-lead rows carry internal rep names).
 * Only this immutable reference (byte count + sha256) and the transcribed aggregates are committed.
 */
export const CAPTURE: CaptureProvenance = {
  artifact: 'HUM-VIN Response Times read-only browser capture',
  capture_id: 'HUM-VIN-006-RT-20260901-21043-21044-21047',
  capture_method:
    'Computer Use accessibility-tree read of authenticated VinSolutions Chrome session',
  captured_at: '2026-09-01T17:57:22.844Z',
  capture_completed_at: '2026-09-01T18:12:41.759Z',
  source_url:
    'https://vinsolutions.app.coxautoinc.com/vinconnect/#/CarDashboard/Pages/LeadManagement/ActiveLeadsLayout.aspx?&leftpaneframe=Reports/ResponseTimes.aspx&rightpaneframe=HIDE&SelectedTab=t_Insights',
  source_host: REQUIRED_SOURCE_HOST,
  report_definition:
    'Response Times: Based on electronic XML leads received during the time period that were not marked bad. Bad Leads includes Duplicate leads.',
  period: {
    from: '2026-08-24',
    to: '2026-08-30',
    compare_from: '2026-07-25',
    compare_to: '2026-08-23',
    compare_label: 'previous 30 days',
  },
  controls: {
    authenticated: true,
    lead_type_selected: 'Sales',
    service_parts_selected: false,
    service_selected: false,
    parts_selected: false,
    external_mutation: false,
    native_csv_or_excel_control_found: false,
    drilldown_route: 'Total Responded (good-lead population)',
    privacy:
      'No customer identity opened or captured. Rep names are internal evidence only and are NOT committed or rendered; customer output is aggregate-only.',
    population_validation:
      'Each responded-row count exactly equals the report Total Responded and Good Leads count; the total-lead drilldown is retained only as an internal cross-check and is NOT used for metric calculation.',
  },
  raw_evidence: {
    retained:
      'internal working copy, retained out-of-repo (aggregate-only commit rule)',
    byte_count: 39173,
    sha256: '554d8dfe8791e76e45a00627b8584a476633b7f9fbf15257a172300bdd9b7b41',
    note: 'Raw per-lead rows carry internal-only rep names and are never committed to the repository or rendered to the customer.',
  },
}

export type Bucket = { n: number; pct: number }
export type PeriodAggregate = {
  total_leads: number
  duplicate: Bucket
  bad: Bucket
  good: Bucket
  average_response: string
  total_responded: number
  within_15m: Bucket
  within_30m: Bucket
  over_30m: Bucket
  no_response: Bucket
}
/** A rate measured DIRECTLY from the responded good-lead drilldown; independently recomputed. */
export type MeasuredRate = {
  denominator: number
  breaches: number
  rate_pct: number
}
export type DealerAggregate = {
  dealer_id: string
  dealer: string
  current: PeriodAggregate
  comparison: PeriodAggregate
  /**
   * SW-013 SUPPLEMENTAL, measured-unscored. Population: good Sales electronic leads in the Total
   * Responded drilldown whose Received precedes Actionable (arrived after hours). Breach: Response
   * later than Actionable +15 min. This is LATE-response among responded leads — NOT the committed
   * SW-013 "no response by opening +15" definition. Independently recomputed from the raw rows.
   */
  after_hours_late_response: MeasuredRate
  /**
   * SW-016 SUPPLEMENTAL only. Weekend leads answered more than 15 min into the next open window. The
   * committed SW-016 SLA definition is unratified and there is no holiday calendar, so this is context,
   * not a metric.
   */
  weekend_supplemental_open_plus_15: MeasuredRate
}

/** Aggregate-only transcription of the capture, in rooftop order. Sales-only; no rep rows. */
export const DEALERS: ReadonlyArray<DealerAggregate> = [
  {
    dealer_id: '21043',
    dealer: 'Serra Honda of Sylacauga',
    current: {
      total_leads: 83,
      duplicate: { n: 26, pct: 31 },
      bad: { n: 29, pct: 35 },
      good: { n: 54, pct: 65 },
      average_response: '6:09',
      total_responded: 54,
      within_15m: { n: 18, pct: 33 },
      within_30m: { n: 5, pct: 9 },
      over_30m: { n: 31, pct: 57 },
      no_response: { n: 0, pct: 0 },
    },
    comparison: {
      total_leads: 288,
      duplicate: { n: 72, pct: 25 },
      bad: { n: 85, pct: 30 },
      good: { n: 203, pct: 70 },
      average_response: '6:51',
      total_responded: 203,
      within_15m: { n: 73, pct: 36 },
      within_30m: { n: 14, pct: 7 },
      over_30m: { n: 116, pct: 57 },
      no_response: { n: 0, pct: 0 },
    },
    after_hours_late_response: { denominator: 27, breaches: 7, rate_pct: 25.9 },
    weekend_supplemental_open_plus_15: {
      denominator: 16,
      breaches: 5,
      rate_pct: 31.3,
    },
  },
  {
    dealer_id: '21044',
    dealer: 'Serra Nissan of Sylacauga',
    current: {
      total_leads: 31,
      duplicate: { n: 6, pct: 19 },
      bad: { n: 9, pct: 29 },
      good: { n: 22, pct: 71 },
      average_response: '7:27',
      total_responded: 22,
      within_15m: { n: 9, pct: 41 },
      within_30m: { n: 1, pct: 5 },
      over_30m: { n: 12, pct: 55 },
      no_response: { n: 0, pct: 0 },
    },
    comparison: {
      total_leads: 180,
      duplicate: { n: 43, pct: 24 },
      bad: { n: 63, pct: 35 },
      good: { n: 117, pct: 65 },
      average_response: '7:09',
      total_responded: 117,
      within_15m: { n: 46, pct: 39 },
      within_30m: { n: 9, pct: 8 },
      over_30m: { n: 62, pct: 53 },
      no_response: { n: 0, pct: 0 },
    },
    after_hours_late_response: { denominator: 10, breaches: 7, rate_pct: 70.0 },
    weekend_supplemental_open_plus_15: {
      denominator: 5,
      breaches: 4,
      rate_pct: 80.0,
    },
  },
  {
    dealer_id: '21047',
    dealer: 'Tony Serra Ford',
    current: {
      total_leads: 24,
      duplicate: { n: 5, pct: 21 },
      bad: { n: 5, pct: 21 },
      good: { n: 19, pct: 79 },
      average_response: '8:24',
      total_responded: 19,
      within_15m: { n: 7, pct: 37 },
      within_30m: { n: 0, pct: 0 },
      over_30m: { n: 12, pct: 63 },
      no_response: { n: 0, pct: 0 },
    },
    comparison: {
      total_leads: 184,
      duplicate: { n: 38, pct: 21 },
      bad: { n: 68, pct: 37 },
      good: { n: 116, pct: 63 },
      average_response: '6:21',
      total_responded: 116,
      within_15m: { n: 45, pct: 39 },
      within_30m: { n: 1, pct: 1 },
      over_30m: { n: 70, pct: 60 },
      no_response: { n: 0, pct: 0 },
    },
    after_hours_late_response: { denominator: 7, breaches: 3, rate_pct: 42.9 },
    weekend_supplemental_open_plus_15: {
      denominator: 4,
      breaches: 2,
      rate_pct: 50.0,
    },
  },
]

/** The Good-Lead counts the responded-row drilldown must exactly equal (fail-closed cross-check). */
export const EXPECTED_GOOD_LEADS: Record<string, number> = {
  '21043': 54,
  '21044': 22,
  '21047': 19,
}

/**
 * The measured-unscored claim layer. It is a STRICTLY NON-evaluated layer: it adds a way to report
 * real measured evidence transparently WITHOUT presenting it as a scored/ranked/promoted metric. It
 * does not relax the evaluated criteria (frozen_e1_spec) in any way.
 */
export const MEASURED_UNSCORED_CONTRACT = {
  layer: 'measured_unscored',
  claim_layer_for_figures: 'computed_observation',
  definition:
    'A figure computed directly from accepted read-only evidence for the governed week that is NOT a scored or ranked watchdog result, because the metric’s committed spec is unresolved (held) and no ratified baseline/rank exists. It is real measured evidence, reported transparently, but is never presented as an evaluated metric, a score, a rank, or a variance-versus-target.',
  never: [
    'do NOT present as an evaluated or promoted metric',
    'do NOT assign a score, a rank, or a variance-versus-baseline',
    'do NOT alter any committed metric definition to fit the figure',
    'missing baseline is not missing data and is never zero',
  ],
  relationship_to_evaluated_criteria:
    'Adds a strictly non-evaluated layer. It does NOT relax frozen_e1_spec: a metric is evaluated/promotable only when numerator, denominator, event_sequence, window, threshold, minimum_sample, minimum_history, ambiguity_handling and unit are RESOLVED and a committed baseline/rank exists.',
} as const

/** Fields of a frozen_e1_spec that must be RESOLVED before a metric could be evaluated/promoted. */
export const REQUIRED_RESOLVED_SPEC_FIELDS = [
  'numerator',
  'denominator',
  'event_sequence',
  'window',
  'threshold',
  'minimum_sample',
  'minimum_history',
  'ambiguity_handling',
  'unit',
] as const

const HELD = /unresolved \(held\)|not_applicable \(held\)|\(held\)/i

/** Return the required spec fields that are still held (unresolved). */
export function heldSpecFields(spec: Record<string, unknown>): Array<string> {
  return REQUIRED_RESOLVED_SPEC_FIELDS.filter((f) =>
    HELD.test(String(spec[f] ?? '')),
  )
}

/**
 * A metric is promotable from this capture ONLY if none of the required spec fields is held AND a
 * ratified baseline/rank exists. This capture supplies neither for SW-013/016/017. The function is
 * fail-closed: any held field ⇒ not promotable.
 */
export function isPromotableFromCapture(
  spec: Record<string, unknown>,
  rankDirection: string,
): boolean {
  if (heldSpecFields(spec).length > 0) return false
  if (HELD.test(rankDirection)) return false
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer-safe observations (Sales-only; aggregate-only; no rep name; no ROI/cars-sold).
// ─────────────────────────────────────────────────────────────────────────────

/** Turn "6:09" into "6 minutes 9 seconds" (drops the leading zero on seconds). */
export function avgPhrase(mmss: string): string {
  const m = /^(\d+):(\d{2})$/.exec(mmss)
  if (!m) throw new Error(`Gate 4I: average_response "${mmss}" is not M:SS`)
  const mins = Number.parseInt(m[1], 10)
  const secs = Number.parseInt(m[2], 10)
  const minPart = `${mins} minute${mins === 1 ? '' : 's'}`
  const secPart = `${secs} second${secs === 1 ? '' : 's'}`
  return `${minPart} ${secPart}`
}

export type CustomerObservation = {
  dealer_id: string
  dealer: string
  status: string
  observed_fact: Array<string>
  inference: Array<string>
  hypothesis: Array<string>
}

/**
 * Build the customer-safe observation set for one rooftop from the aggregate figures. Every string is
 * plain (run through {@link plainify}) and describes a RECOVERABLE LEAD-RESPONSE OPPORTUNITY only —
 * never a cars-sold or ROI estimate (no accepted close-rate denominator/formula exists). Claim layers
 * are separated: observed_fact (measured), inference (a defensible conclusion), hypothesis (plausible,
 * needs more evidence).
 */
export function buildCustomerObservation(
  d: DealerAggregate,
): CustomerObservation {
  const c = d.current
  const observed_fact: Array<string> = [
    `Average first response to good Sales leads was ${avgPhrase(c.average_response)} this period.`,
    `${c.over_30m.pct}% of good Sales leads were first answered more than 30 minutes after they became actionable.`,
    `${c.within_15m.pct}% were first answered within 15 minutes.`,
    `Among good Sales leads that arrived after hours and were later answered, ${d.after_hours_late_response.rate_pct}% were first answered more than 15 minutes into the next business window.`,
    `Every good Sales lead received a response this period; none went unanswered.`,
  ]
  const inference: Array<string> = []
  const hypothesis: Array<string> = []

  // Deterministic, figure-driven conclusions (no thresholds invented; all framed as opportunity).
  if (c.over_30m.pct >= 50)
    inference.push(
      `A majority of good Sales leads waited more than 30 minutes for a first response, which is a recoverable lead-response opportunity within the team’s control.`,
    )
  const slowerThanPrior =
    toSeconds(c.average_response) > toSeconds(d.comparison.average_response)
  if (slowerThanPrior)
    inference.push(
      `Average first-response time was slower than the previous 30 days (${avgPhrase(c.average_response)} versus ${avgPhrase(d.comparison.average_response)}), a deterioration worth attention.`,
    )

  // Polarization: a fast within-15 share alongside a high over-30 share.
  if (c.within_15m.pct >= 40 && c.over_30m.pct >= 50)
    hypothesis.push(
      `Response speed looks split: many leads are answered quickly while a majority still wait more than 30 minutes. Confirming this pattern needs a fuller per-lead timing view.`,
    )
  if (d.after_hours_late_response.rate_pct >= 60 && c.within_15m.pct >= 40)
    hypothesis.push(
      `Strong within-15-minute performance alongside a high after-hours late-answer share may point to an after-hours coverage gap rather than overall slowness; confirming this needs after-hours coverage evidence.`,
    )
  if (slowerThanPrior)
    hypothesis.push(
      `A slower average than the prior period may reflect a recent staffing or process change; confirming a trend needs more than one week of comparable history.`,
    )
  if (inference.length === 0)
    inference.push(
      `Faster first contact on the slower leads is a recoverable lead-response opportunity within the team’s control.`,
    )

  const out: CustomerObservation = {
    dealer_id: d.dealer_id,
    dealer: d.dealer,
    status:
      'measured this period; supplemental context, NOT a scored watchdog metric',
    observed_fact: observed_fact.map(plainify),
    inference: inference.map(plainify),
    hypothesis: hypothesis.map(plainify),
  }
  assertObservationSafe(out)
  return out
}

function toSeconds(mmss: string): number {
  const m = /^(\d+):(\d{2})$/.exec(mmss)
  if (!m) throw new Error(`Gate 4I: average_response "${mmss}" is not M:SS`)
  return Number.parseInt(m[1], 10) * 60 + Number.parseInt(m[2], 10)
}

/** Person-name heuristic: a two-word Capitalized pair (rep-name shape) not on the allowed list. */
const ALLOWED_PROPER = new Set([
  'Serra',
  'Honda',
  'Nissan',
  'Ford',
  'Tony',
  'Sylacauga',
])
const NAME_PAIR = /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g

/** Fail-closed: a customer observation must carry no jargon, Service/Parts data, PII, or rep name. */
export function assertObservationSafe(o: CustomerObservation): void {
  const strings = [...o.observed_fact, ...o.inference, ...o.hypothesis]
  if (strings.length === 0)
    throw new Error(`Gate 4I: ${o.dealer_id} has no observations`)
  const PII =
    /\b(\d{3}-\d{2}-\d{4}|\(\d{3}\)\s*\d{3}-\d{4}|@[a-z0-9.-]+\.[a-z]{2,})\b/i
  for (const s of strings) {
    if (!s.trim()) throw new Error(`Gate 4I: ${o.dealer_id} empty observation`)
    if (INTERNAL_JARGON.test(s))
      throw new Error(
        `Gate 4I: ${o.dealer_id} observation leaks jargon: "${s}"`,
      )
    if (SERVICE_PARTS_DATA.test(s))
      throw new Error(
        `Gate 4I: ${o.dealer_id} observation leaks Service/Parts data: "${s}"`,
      )
    if (PII.test(s))
      throw new Error(
        `Gate 4I: ${o.dealer_id} observation contains PII: "${s}"`,
      )
    // No rep-name-shaped proper-noun pairs beyond the allowed dealership tokens.
    for (const m of s.matchAll(NAME_PAIR))
      if (!ALLOWED_PROPER.has(m[1]) || !ALLOWED_PROPER.has(m[2]))
        throw new Error(
          `Gate 4I: ${o.dealer_id} observation may contain a rep/person name: "${m[0]}"`,
        )
  }
}
