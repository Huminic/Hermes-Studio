/**
 * Gate 4H — DOWNSTREAM customer contract (pure logic).
 *
 * Gate 4H claims NO new evaluations. It turns the already-committed Gate 4E/4F/4G HOLD evidence into
 * (a) an INTERNAL accountability record for all 295 IDs and (b) a customer-safe downstream contract
 * that a future Sales PDF renderer may consume — WITHOUT ever importing Service/Parts data, leaking
 * out-of-boundary facts, or turning a missing value into a zero.
 *
 * The single hard rule this module enforces: `customer_display_eligible` is decided by the DOMAIN of
 * a metric's required evidence (from committed governance fields — `blocker_class`, `primary_blocker`,
 * `boundary_lane`), NEVER by an incidental word in the condition text. A Service/Parts-domain metric
 * is ALWAYS ineligible even if its condition happens to contain "rooftop"; a Sales metric whose
 * section is "Service-to-Sales" or whose condition says "mood-driven service" is NOT thereby made
 * ineligible. See {@link classifyDomain}.
 *
 * This module is PURE (no I/O) so the generator and the independent test share one implementation.
 */
import type { CatalogRow } from '@/server/reports/residual/gate4f-scheduled-residual'
import { classifyBoundaryLane } from '@/server/reports/residual/gate4g-final-residual'

/** The committed `blocker_class` string (4F + 4G) that marks an out-of-Sales-boundary HOLD. */
export const OUTSIDE_SALES_BOUNDARY = 'outside_sales_boundary' as const

/** Synthetic blocker class assigned to Gate 4E content-HOLD IDs (capability-delta content candidates). */
export const CONTENT_NLP_BLOCKER = 'nlp_content_capable_pending' as const

/** The three governed Sales rooftops (Honda 21043 / Nissan 21044 / Ford 21047). */
export const GOVERNED_ROOFTOPS = ['21043', '21044', '21047'] as const

/** Origin gate for an unresolved ID. */
export type GateOrigin = '4E' | '4F' | '4G'

/**
 * Evidence domains. The first three are customer-display eligible (Sales PDF); the last three are
 * withheld and routed to a separate governed workspace. Eligibility is a pure function of domain.
 */
export const CUSTOMER_DOMAINS = [
  'sales',
  'cross_rooftop',
  'enrichment_external',
] as const
export const WITHHELD_DOMAINS = [
  'service_parts',
  'compliance_legal',
  'withheld_unclassified',
] as const
export type CustomerDomain = (typeof CUSTOMER_DOMAINS)[number]
export type WithheldDomain = (typeof WITHHELD_DOMAINS)[number]
export type Domain = CustomerDomain | WithheldDomain

/** Where a non-eligible domain is routed. Eligible domains route to the Sales customer PDF. */
export const ROUTE_BY_DOMAIN: Record<Domain, string> = {
  sales: 'sales_customer_pdf',
  cross_rooftop: 'sales_customer_pdf',
  enrichment_external: 'sales_customer_pdf',
  service_parts: 'separate_service_workspace',
  compliance_legal: 'separate_governed_review',
  withheld_unclassified: 'separate_governed_review',
}

/** How the customer copy is produced for each eligible domain. */
export const DISPLAY_MODE_BY_DOMAIN: Record<Domain, string> = {
  sales: 'full',
  cross_rooftop: 'sanitized',
  enrichment_external: 'sanitized',
  service_parts: 'withheld',
  compliance_legal: 'withheld',
  withheld_unclassified: 'withheld',
}

export function isCustomerDomain(d: Domain): d is CustomerDomain {
  return (CUSTOMER_DOMAINS as ReadonlyArray<string>).includes(d)
}

/**
 * Committed primary-blocker DOMAIN markers. These match the governance RATIONALE (why the row was
 * ruled outside the Sales boundary), not incidental condition words. Compliance is checked before
 * Service so a legally-specific rationale is never masked.
 */
const COMPLIANCE_PB_MARKER =
  /\b(compliance|tcpa|dnc|do-not-call|do-not-contact|consent|ssn|dob|ofac|adverse|privacy|safeguards|disclosure|discriminat|pii)\b|red[- ]?flag/i
const SERVICE_PB_MARKER =
  /\b(service|warranty|vsc|cpo|repair)\b|declined[\s-]?(service\s+)?work/i

/** Map a committed primary_blocker to a withheld lane by its domain rationale, or null. */
function primaryBlockerLane(
  primaryBlocker: string,
): 'compliance_legal' | 'service' | null {
  if (COMPLIANCE_PB_MARKER.test(primaryBlocker)) return 'compliance_legal'
  if (SERVICE_PB_MARKER.test(primaryBlocker)) return 'service'
  return null
}

/** Map a lane name to its evidence domain. Unknown / not_applicable fails closed to withheld. */
function laneToDomain(lane: string): Domain {
  switch (lane) {
    case 'service':
      return 'service_parts'
    case 'compliance_legal':
      return 'compliance_legal'
    case 'cross_rooftop':
      return 'cross_rooftop'
    case 'enrichment':
      return 'enrichment_external'
    default:
      return 'withheld_unclassified'
  }
}

/** Minimal CatalogRow so the committed {@link classifyBoundaryLane} can be reused for 4F derivation. */
function asCatalogRow(metricId: string, condition: string): CatalogRow {
  return {
    metric_id: metricId,
    section: '',
    subsection: '',
    condition,
    acquisition_class: '',
    source: '',
    period_grain_population: '',
    owner: '',
    next_action: '',
  }
}

/** The normalized shape the classifier + builders consume (produced by the generator from committed rows). */
export type NormalizedRow = {
  metric_id: string
  gate_origin: GateOrigin
  section: string
  subsection: string
  condition: string
  blocker_class: string
  primary_blocker: string
  /** Committed 4G lane; undefined for 4E/4F (derived). */
  committed_boundary_lane?: string
}

/** The transparent result of domain classification — records BOTH the incidental keyword and the domain. */
export type DomainClassification = {
  domain: Domain
  domain_lane: string
  /** The lane a pure keyword scan of the condition would give (may differ from domain_lane). */
  keyword_lane: string | null
  /** Set when the committed primary_blocker OVERRODE an incidental keyword lane (e.g. SW-270). */
  override_reason: string | null
  customer_display_eligible: boolean
  route_to: string
  display_mode: string
}

/**
 * Classify a metric's evidence domain from committed governance fields, fail-closed.
 *
 * In-boundary rows are `sales`. For `outside_sales_boundary` rows:
 *   - 4G: use the committed `boundary_lane`. When it is `not_applicable` (e.g. SW-079/SW-080), derive
 *     the domain from the committed primary_blocker rationale, failing closed to withheld.
 *   - 4F: derive the keyword lane via the committed classifier, then OVERRIDE it with the committed
 *     primary_blocker domain when they disagree (SW-270: keyword "rooftop" → cross_rooftop, but the
 *     primary_blocker declares Service-domain → service_parts, ineligible). The override is recorded.
 */
export function classifyDomain(row: NormalizedRow): DomainClassification {
  const finalize = (
    domain: Domain,
    domain_lane: string,
    keyword_lane: string | null,
    override_reason: string | null,
  ): DomainClassification => ({
    domain,
    domain_lane,
    keyword_lane,
    override_reason,
    customer_display_eligible: isCustomerDomain(domain),
    route_to: ROUTE_BY_DOMAIN[domain],
    display_mode: DISPLAY_MODE_BY_DOMAIN[domain],
  })

  if (row.blocker_class !== OUTSIDE_SALES_BOUNDARY)
    return finalize('sales', 'sales', null, null)

  const pbLane = primaryBlockerLane(row.primary_blocker)

  if (row.gate_origin === '4G') {
    const committed = row.committed_boundary_lane ?? 'not_applicable'
    if (committed !== 'not_applicable')
      return finalize(laneToDomain(committed), committed, committed, null)
    // Committed lane is not_applicable → fail closed via the primary_blocker rationale.
    const derived = pbLane ?? 'withheld_unclassified'
    return finalize(
      laneToDomain(derived),
      derived,
      null,
      `4G boundary_lane not_applicable; domain derived from committed primary_blocker (${derived})`,
    )
  }

  // 4F: keyword lane from the committed classifier, primary_blocker domain overrides on disagreement.
  let keywordLane: string | null
  try {
    keywordLane = classifyBoundaryLane(
      asCatalogRow(row.metric_id, row.condition),
    )
  } catch {
    keywordLane = null
  }
  const domainLane = pbLane ?? keywordLane ?? 'withheld_unclassified'
  const override =
    pbLane && keywordLane && pbLane !== keywordLane
      ? `committed primary_blocker declares ${pbLane}-domain; incidental condition keyword scanned as ${keywordLane} — domain evidence wins`
      : null
  return finalize(laneToDomain(domainLane), domainLane, keywordLane, override)
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer-safe copy derivation (plain language; no internal jargon; no Service/Parts data).
// ─────────────────────────────────────────────────────────────────────────────

/** Plain-English "why this can't be answered yet", keyed by committed blocker_class. No jargon. */
export const WHY_BY_BLOCKER: Record<string, string> = {
  [CONTENT_NLP_BLOCKER]:
    'Answering this means analyzing the wording and tone of messages, which this week’s accepted Sales export does not yet do.',
  unsupported_field:
    'The specific detail this needs is not captured as its own field in the accepted weekly Sales data.',
  other_source_or_join:
    'This needs information from more than one report reliably brought together, which is not set up in the accepted Sales data.',
  insufficient_history:
    'This needs more history than the single accepted week to establish a trend.',
  semantic_definition_pending:
    'The exact rule and cut-off for this have not been agreed yet, so it cannot be measured consistently.',
}

/** Plain-English base "how to unlock", keyed by committed blocker_class. No jargon. */
export const HOW_BASE_BY_BLOCKER: Record<string, string> = {
  [CONTENT_NLP_BLOCKER]:
    'Add message wording/tone analysis to the accepted Sales pipeline, then evaluate.',
  unsupported_field:
    'Add the specific field this needs to the accepted weekly Sales data feed.',
  other_source_or_join:
    'Bring the required Sales reports together with a reliable shared key, then evaluate.',
  insufficient_history:
    'Collect more than one week of accepted Sales history, then evaluate the trend.',
  semantic_definition_pending:
    'Agree the exact rule and cut-off first, then evaluate.',
}

/** Plain-English default next action, keyed by committed blocker_class. */
export const NEXT_BY_BLOCKER: Record<string, string> = {
  [CONTENT_NLP_BLOCKER]:
    'Decide whether to add message content/tone analysis to the accepted Sales pipeline.',
  unsupported_field:
    'Confirm the missing field can be added to the accepted weekly Sales export.',
  other_source_or_join:
    'Confirm the reports and a reliable shared key needed to combine them.',
  insufficient_history:
    'Keep accepting the weekly Sales export so history accumulates.',
  semantic_definition_pending:
    'Agree the exact rule and cut-off with management.',
}

/** Sanitized copy for the two eligible out-of-Sales-feed domains (no sensitive raw condition). */
export const SANITIZED_COPY: Record<
  'cross_rooftop' | 'enrichment_external',
  {
    what_this_watches: string
    why_unavailable: string
    how_to_unlock: string
    next_action: string
  }
> = {
  cross_rooftop: {
    what_this_watches:
      'An opportunity to coordinate customers or inventory across the rooftops in your dealer group.',
    why_unavailable:
      'It depends on coordinating information across more than one rooftop, which is not set up in the accepted Sales feed.',
    how_to_unlock:
      'Establish a governed way to share this signal across your rooftops, then evaluate.',
    next_action:
      'Decide whether to set up a governed cross-rooftop sharing route.',
  },
  enrichment_external: {
    what_this_watches:
      'An opportunity to reach the right customers using a data source beyond your CRM.',
    why_unavailable:
      'It depends on a data source outside your CRM’s weekly Sales export.',
    how_to_unlock:
      'Bring in the relevant external data source under a proper data agreement, then match it to your Sales records.',
    next_action:
      'Decide whether to acquire the external data source under a data agreement.',
  },
}

/** Section → the plain management decision the metric would improve (an INFERENCE, section-scoped). */
export const SECTION_DECISION: Record<string, string> = {
  '1. Lead Intake & Source Quality':
    'Where to invest lead-source budget and which sources to keep or cut.',
  '2. Speed-to-Lead & First Response':
    'How quickly and how well the team responds to new leads.',
  '3. Sales Rep Activity & Communication Behavior':
    'How reps are coached on outreach quality and consistency.',
  '4. Pipeline Health & Funnel Dynamics':
    'Where deals stall in the funnel and where to focus follow-up.',
  '5. Appointment & Showroom Metrics':
    'How appointments are set, confirmed, and shown.',
  '6. Deal & Desking Signals':
    'How deals are structured and desked for profitability.',
  '7. Inventory & Vehicle-of-Interest (VOI) Signals':
    'How inventory is matched to customer interest.',
  '8. Marketing & Attribution':
    'Which marketing efforts are credited with results.',
  '9. Customer Communication Sentiment & Content':
    'The tone and quality of customer-facing messaging.',
  '10. Service-to-Sales & Equity Mining':
    'How equity and repeat-purchase opportunities are surfaced to the Sales team.',
  '11. BDC / Call Center Metrics':
    'How the call/BDC team’s contact effort is managed.',
  '12. Data Integrity & CRM Hygiene':
    'How reliable and complete the CRM data is.',
  '13. Compliance & Risk':
    'Where contact and consent risk needs management oversight.',
  '14. Team / Managerial Dynamics':
    'How sales-team workload and performance are balanced.',
  '15. Cross-Functional / Second-Order Signals':
    'Higher-order patterns that combine several signals.',
  '16. Anomaly & Statistical Triggers (engine-level rules)':
    'Automatic alerts on unusual statistical patterns.',
  'PART 1 — Red Flags in Sales-to-Customer Communications':
    'Where customer messaging creates risk worth managing.',
  'PART 2 — Opportunity Mining: Signals to Attract & Reactivate Customers':
    'Where to find and re-engage high-potential customers.',
  'PART 3 — Suggested Semantic Watchdog Add-ons':
    'Which additional monitoring signals to prioritize next.',
}

/** Map a committed owner string to a customer-appropriate ROLE (never an internal codename). */
export function ownerRole(
  ownerRaw: string | undefined,
  gate: GateOrigin,
): string {
  const o = (ownerRaw ?? '').toLowerCase()
  if (o.includes('vinsolutions') || o.includes('validator'))
    return 'Your CRM administrator, with your analytics vendor'
  if (o.includes('watchdog') || o.includes('pipeline'))
    return 'Your analytics vendor'
  if (o.includes('accounting') || o.includes('dms') || o.includes('owner'))
    return 'Your dealership management (owner of the needed source)'
  if (gate === '4E') return 'Your analytics vendor'
  return 'Your dealership management'
}

/**
 * Tokens that must NEVER appear in customer-facing copy: internal jargon and Service/Parts DATA
 * references. Bare incidental words in a committed Sales condition (e.g. "service CSI",
 * "mood-driven service") are intentionally NOT in this list — only Service/Parts DATA phrases are.
 */
export const INTERNAL_JARGON =
  /\b(blocker_class|other_source_or_join|unsupported_field|insufficient_history|semantic_definition_pending|nlp_content_capable_pending|capability[_ ]delta|frozen_e1|contract\s*2|acquisition class|quarantin|cage|huminic|gate\s*4[a-h]|cell partition|denominator)\b/i
export const SERVICE_PARTS_DATA =
  /service department|parts department|repair order|service drive|service\s+ro\b|service-domain|declined service work|safety recall|\bwarranty\b|\bvsc\b/i
export const ENRICHMENT_RAW =
  /credit[- ]?bureau|credit[- ]?tier|linkedin|insurance|tax[- ]?refund|home[- ]?purchase|new[- ]?mover|vehicle[- ]?registration|job[- ]?change/i

export type CustomerCopy = {
  what_this_watches: string
  not_measured_this_period: string
  why_unavailable: string
  how_to_unlock: string
  next_action: string
  owner: string
  decision_it_improves: string
}

/** The claim layer each customer field belongs to (observed fact vs inference). */
export const FIELD_CLAIM_LAYER: Record<keyof CustomerCopy, string> = {
  what_this_watches: 'observed_fact',
  not_measured_this_period: 'observed_fact',
  why_unavailable: 'observed_fact',
  how_to_unlock: 'inference',
  next_action: 'inference',
  owner: 'observed_fact',
  decision_it_improves: 'inference',
}

/** Assert one customer-copy object is safe to display; throws (fail-closed) on any violation. */
export function assertCustomerSafe(
  metricId: string,
  domain: CustomerDomain,
  copy: CustomerCopy,
): void {
  for (const [field, value] of Object.entries(copy)) {
    if (!value || !value.trim())
      throw new Error(`Gate 4H: ${metricId} customer.${field} is empty`)
    if (INTERNAL_JARGON.test(value))
      throw new Error(
        `Gate 4H: ${metricId} customer.${field} leaks internal jargon: "${value}"`,
      )
    if (SERVICE_PARTS_DATA.test(value))
      throw new Error(
        `Gate 4H: ${metricId} customer.${field} leaks Service/Parts data: "${value}"`,
      )
    // Sanitized domains must not surface the sensitive raw condition (external-source specifics).
    if (domain !== 'sales' && ENRICHMENT_RAW.test(value))
      throw new Error(
        `Gate 4H: ${metricId} (${domain}) customer.${field} leaks a sensitive raw source: "${value}"`,
      )
  }
}

/** True when a specific unlock detail is safe to surface to the customer (no jargon, no Service/Parts). */
function unlockDetailSafe(detail: string): boolean {
  return (
    detail.length > 0 &&
    !INTERNAL_JARGON.test(detail) &&
    !SERVICE_PARTS_DATA.test(detail) &&
    !ENRICHMENT_RAW.test(detail)
  )
}

/**
 * Build the customer copy for one row. `specifics` carries optional committed unlock detail (source /
 * field / missing input) already extracted by the generator; it is appended ONLY when it passes the
 * safety guard, otherwise the row falls back to the jargon-free base template (fail-closed).
 */
export function buildCustomerCopy(
  row: NormalizedRow,
  domain: CustomerDomain,
  specifics: {
    unlock_detail?: string
    next_action_raw?: string
    owner_raw?: string
  },
): CustomerCopy {
  const decision =
    SECTION_DECISION[row.section] ?? 'A Sales management decision in this area.'

  if (domain === 'cross_rooftop' || domain === 'enrichment_external') {
    const s = SANITIZED_COPY[domain]
    return {
      what_this_watches: s.what_this_watches,
      not_measured_this_period:
        'No value was produced from this week’s accepted Sales data.',
      why_unavailable: s.why_unavailable,
      how_to_unlock: s.how_to_unlock,
      next_action: s.next_action,
      owner: 'Your dealership management (owner of the needed source)',
      decision_it_improves: decision,
    }
  }

  // domain === 'sales'
  const why =
    WHY_BY_BLOCKER[row.blocker_class] ??
    'This cannot be produced from the accepted Sales data this week.'
  const howBase =
    HOW_BASE_BY_BLOCKER[row.blocker_class] ??
    'Add the missing capability to the accepted Sales pipeline, then evaluate.'
  const how =
    specifics.unlock_detail && unlockDetailSafe(specifics.unlock_detail)
      ? `${howBase} Specifically: ${specifics.unlock_detail}.`
      : howBase
  const nextRaw = (specifics.next_action_raw ?? '').trim()
  const next =
    nextRaw &&
    !INTERNAL_JARGON.test(nextRaw) &&
    !SERVICE_PARTS_DATA.test(nextRaw)
      ? nextRaw
      : (NEXT_BY_BLOCKER[row.blocker_class] ??
        'Decide the next step with management.')

  return {
    what_this_watches: row.condition,
    not_measured_this_period:
      'No value was produced from this week’s accepted Sales data.',
    why_unavailable: why,
    how_to_unlock: how,
    next_action: next,
    owner: ownerRole(specifics.owner_raw, row.gate_origin),
    decision_it_improves: decision,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Claim-layer + CRM devil's-advocate contracts (definitions only; nothing is computed here).
// ─────────────────────────────────────────────────────────────────────────────

export const CLAIM_LAYER_CONTRACT = {
  layers: {
    observed_fact:
      'A value or condition directly present in the accepted Sales evidence for the governed week, stated without interpretation.',
    inference:
      'A defensible conclusion drawn FROM observed facts (e.g. a recommended unlock method, or the decision a metric would inform). Labeled as interpretation, never as a measurement.',
    hypothesis:
      'A plausible but unverified explanation that requires further evidence before action. Never presented as fact.',
  },
  field_claim_layers: FIELD_CLAIM_LAYER,
  roi_scenario_rules: {
    optional: true,
    computed_in_this_gate: false,
    requirements: [
      'show the explicit formula',
      'give a bounded low/expected/high range — never a single false-precise number',
      'state the assumptions',
      'state a confidence level',
      'label it a scenario, not a promise',
    ],
    prohibitions: [
      'no hyperbole or guarantee language',
      'must not use the quarantined ROI/CAGE definitions',
      'must not imply measured results where none exist',
      'Sales-gross only; never Service/Parts',
    ],
    note: 'Gate 4H computes NO ROI. It only defines the contract any future narrative must satisfy.',
  },
} as const

export const CRM_CHECK_STATES = [
  'required_not_performed',
  'verified_present',
  'verified_absent',
  'not_verifiable',
] as const
export type CrmCheckState = (typeof CRM_CHECK_STATES)[number]

export const CRM_CHECK_CONTRACT = {
  purpose:
    'A primary-export zero/blank/unavailable value must NOT become a claim that the data does not exist. Before any such value is reported, a same-dealer / same-period / same-definition alternate in-boundary check is REQUIRED.',
  states: {
    required_not_performed:
      'The alternate check is required but has not been performed (Gate 4H opens no CRM/browser access).',
    verified_present:
      'An alternate in-boundary source confirms a real value exists; the primary extreme was an extraction artifact.',
    verified_absent:
      'An alternate in-boundary source confirms the value is genuinely absent for this dealer and period.',
    not_verifiable: 'No alternate in-boundary source can confirm either way.',
  },
  rendering_rule:
    'required_not_performed and not_verifiable render to the customer as "not verified from available sources"; a value is NEVER rendered as 0 on the basis of a primary-export blank/zero.',
  boundary:
    'Aggregate-only; Sales-only; no PII; no raw customer values echoed.',
  seed_rule:
    'Seeded deterministically from IDs whose committed Gate 4G matrix row carries observed_evidence (a concrete observed zero/blank/absent extreme). No checks are fabricated or performed.',
} as const

/** How a CRM-check state renders to the customer. Never zero. */
export function renderCrmState(state: CrmCheckState): string {
  switch (state) {
    case 'verified_present':
      return 'confirmed present by an alternate source'
    case 'verified_absent':
      return 'confirmed absent by an alternate source'
    case 'required_not_performed':
    case 'not_verifiable':
      return 'not verified from available sources'
  }
}
