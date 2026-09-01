/**
 * Gate 4J — alternate read-only CRM report pass, reconciled into the five devil's-advocate checks.
 *
 * The Gate 4H CRM control seeded five material-extreme checks (SW-034, SW-049, SW-050, SW-111,
 * SW-114) as `required_not_performed` because Gate 4H opened no CRM/browser access. Gate 4J performs
 * that required alternate in-boundary check as a READ-ONLY browser pass (current rooftop Tony Serra
 * Ford 21047, 2026-09-01) and reconciles what was found. It **promotes nothing** and it does NOT
 * modify any Gate 4H artifact: the five check records here SUPERSEDE the Gate 4H `required_not_performed`
 * seed states as of 2026-09-01, while Gate 4H remains a truthful historical snapshot of its own time.
 *
 * Hard distinction this module preserves: **capability discovered ≠ data acquired.** A report route or
 * schema being found does not measure a value. No report was exported, no customer/rep identity was
 * opened or retained, no CRM parameter was saved, no mutation occurred. Missing remains UNKNOWN, never
 * zero.
 *
 * This module is PURE (no I/O). It carries the (internal) report-pass evidence, the per-metric
 * reconciliation records, the fail-closed Service-Dept leakage safety observation, and the customer-safe
 * summary builder (generic; exposes no internal controls, report titles, PII, or measured value).
 */
import {
  INTERNAL_JARGON,
  SERVICE_PARTS_DATA,
} from '@/server/reports/residual/gate4h-downstream-contract'

/** The current rooftop for the Gate 4J read-only pass (browser observations 2026-09-01). */
export const PASS_ROOFTOP = '21047' as const
export const PASS_ROOFTOP_NAME = 'Tony Serra Ford' as const
export const PASS_DATE = '2026-09-01' as const

/** The five devil's-advocate CRM checks seeded by Gate 4H (all were `required_not_performed`). */
export const SEEDED_IDS = [
  'SW-034',
  'SW-049',
  'SW-050',
  'SW-111',
  'SW-114',
] as const
export type SeededId = (typeof SEEDED_IDS)[number]

/**
 * Gate 4J reconciliation states. Every one is a `performed_*` state (the required alternate check WAS
 * performed), and NONE asserts a measured value. They supersede the Gate 4H `required_not_performed`.
 */
export const GATE4J_STATES = {
  performed_candidate_found:
    'The alternate read-only pass found a concrete in-boundary report route that could supply this check’s evidence, pending a named ratification and/or a dated acquisition. Capability discovered; no data acquired; no value measured.',
  performed_schema_only:
    'The alternate read-only pass found a row-level schema that could support this check, but an exact dated, PII-safe acquisition remains unproved. Capability discovered; no data acquired; no value measured.',
  performed_no_route_found:
    'The alternate read-only pass was performed but found no in-boundary route for this check’s specific signal in the inspected reports. No data acquired; no value measured.',
} as const
export type Gate4jState = keyof typeof GATE4J_STATES

// ─────────────────────────────────────────────────────────────────────────────
// Internal report-pass evidence (report titles + controls + schema are INTERNAL only).
// No customer/rep identity or PII value is retained — only report metadata and column NAMES.
// ─────────────────────────────────────────────────────────────────────────────

export const REPORT_PASS = {
  rooftop: PASS_ROOFTOP,
  rooftop_name: PASS_ROOFTOP_NAME,
  observed_on: PASS_DATE,
  controls_asserted: {
    report_exported: false,
    customer_row_opened: false,
    crm_mutation: false,
    parameter_change_saved: false,
    pii_retained: false,
  },
  desk_log: {
    system_report: 'Desk Log',
    default_date: '2026-09-01',
    dealer: 'Tony Serra Ford',
    type_control: '-- All Sales Leads --',
    user: 'All',
    status: 'All',
    csv_export_available: true,
    visible_columns: ['Type', 'Rep', 'Time', 'Customer', 'Status', 'Source'],
    safety_leak:
      'One visible row carried Source = "Service Dept" despite the "-- All Sales Leads --" Type control. No customer or rep identity was retained.',
    exported: false,
    conclusion:
      'Desk Log is NOT Sales-safe by the Type control alone (a Service-Dept-sourced row appeared under an All-Sales-Leads type), does not prove an exact held metric, and was not exported.',
  },
  deal_performance: {
    system_report: 'Deal Performance',
    displayed_measures: [
      'Dealer',
      'User',
      'Leads Desked in Timeframe',
      'Leads Sold',
      'Close %',
      'Desking %',
      'Pencils Desked',
      'Avg Pencils per Deal',
      'Deal Assists',
      'projected and sold average front/back/total gross',
      'other deal/visit measures',
    ],
    edit_parameters_proved: [
      'Dealer',
      'Lead Source include/exclude',
      'User',
      'User Activity',
      'Date Range',
      'Lead Type',
      'Lead Status Type',
      'ADF/XML',
      'Inventory Type',
      'Sold Status',
      'Deal Type',
      'summary controls',
    ],
    date_range_parameterized: true,
    lead_type_selected: [
      'Internet',
      'Walk-in',
      'Phone',
      'Import',
      'Website Chat',
      'Wholesale',
      'Referral',
      'Previous Customer',
    ],
    lead_type_unselected: ['Parts Order', 'Service', 'Unknown'],
    default_view: 'MTD 2026-09-01 to 2026-09-01',
    customer_rows_opened: false,
    parameters_changed: false,
  },
  dms_sales_flat_export: {
    system_report: 'DMS Sales Flat Export',
    row_level_schema: [
      'Dealer',
      'Deal Number',
      'Created/Updated/Contract/Delivery/Reversal/Deal Status dates',
      'Deal Status',
      'Wholesale',
      'Inventory Type',
      'Sale Price',
      'Cost',
      'Total Gross Profit',
      'Front Gross Profit',
      'Back Gross Profit',
      'salesperson and manager IDs',
      'many finance fields',
      'buyer/co-buyer PII fields',
    ],
    dealer_filter_proved: 'Tony Serra Ford',
    max_rows: 500000,
    current_selection_returned_data: false,
    date_control_proved: false,
    menu_actions_visible: ['Copy'],
    pii_heavy: true,
    exported: false,
    conclusion:
      'Strong row-level schema candidate for SW-050 and gross-period work, but exact dated acquisition is unproved (no proved date limiter; only a dealer selector and a Copy action were visible). Because it carries extensive PII and lacked a proved date limiter, it was deliberately NOT exported.',
  },
  catalog_title_searches: {
    searched_titles: ['Sales Log', 'Deal Log', 'Write Up', 'Writeup'],
    result: 'no system report found for any of these exact titles',
  },
}

/**
 * The fail-closed safety observation. The Desk Log Service-Dept leakage proves the Sales-only boundary
 * cannot rely on a report's Type control alone; a source-level exclusion of Service is required. This
 * reinforces the permanent rule that leaked/absent Service is EXCLUDED, never counted, and missing is
 * never zero. No PII.
 */
export const SAFETY_OBSERVATIONS = [
  {
    id: 'desk-log-service-dept-leakage',
    severity: 'fail_closed',
    observation:
      'Under the "-- All Sales Leads --" Type control, a Desk Log row carried Source = "Service Dept". The Type control alone does not guarantee a Sales-only population.',
    implication:
      'Any Sales-only use of Desk Log (or any typed lead list) requires an explicit source-level exclusion of Service; a Type label is insufficient. Leaked/absent Service is excluded, never counted; missing is never zero.',
    pii_retained: false,
    action_taken:
      'Desk Log was not used as a metric source and was not exported.',
  },
]

// Boolean fields are primitive-typed (not literal-narrowed) so the generator's fail-closed
// invariants (promoted === false, data_acquired === false, …) are genuine runtime checks.
export type ReconciliationRecord = {
  metric_id: SeededId
  metric: string
  gate4h_seed_state: string
  gate4j_state: Gate4jState
  supersedes: string
  capability_discovered: string
  data_acquired: boolean
  value_measured: boolean
  promoted: boolean
  candidate_source: string | null
  exact_remaining_requirement: Array<string>
  missing_is_unknown_never_zero: boolean
}

/** The per-metric reconciliation, tied to the committed conditions + the report-pass findings. */
export const RECONCILIATION: ReadonlyArray<ReconciliationRecord> = [
  {
    metric_id: 'SW-034',
    metric:
      'closed deals ÷ write-ups (write-to-close rate), per rooftop, per week',
    gate4h_seed_state: 'required_not_performed',
    gate4j_state: 'performed_candidate_found',
    supersedes: 'Gate 4H required_not_performed seed for SW-034',
    capability_discovered:
      'Deal Performance exposes a candidate write-up-like denominator ("Leads Desked in Timeframe"), a closed count ("Leads Sold"), a "Close %", a parameterized Date Range, and a Sales-only Lead Type selection (Service / Parts Order / Unknown unselected). No native "Write Up"/"Writeup"/"Sales Log"/"Deal Log" report exists.',
    data_acquired: false,
    value_measured: false,
    promoted: false,
    candidate_source: 'Deal Performance',
    exact_remaining_requirement: [
      'semantic ratification: agree that "Leads Desked" (or "Pencils Desked") is the write-up denominator for write-to-close — the committed frozen_e1_spec numerator/denominator are held and this pass does not resolve them',
      'window acquisition: a dated Sales-only pull of the governed week at all three rooftops (this pass saw only the current MTD default view)',
    ],
    missing_is_unknown_never_zero: true,
  },
  {
    metric_id: 'SW-049',
    metric:
      'current-week gross-per-unit vs trailing-30-day average gross-per-unit',
    gate4h_seed_state: 'required_not_performed',
    gate4j_state: 'performed_candidate_found',
    supersedes: 'Gate 4H required_not_performed seed for SW-049',
    capability_discovered:
      'Deal Performance exposes sold average front/back/total gross and a parameterized Date Range that could produce a current-week window and a trailing-30-day window.',
    data_acquired: false,
    value_measured: false,
    promoted: false,
    candidate_source: 'Deal Performance',
    exact_remaining_requirement: [
      'semantic ratification: accept "sold average gross" as the gross-per-unit (GPU) definition — the committed frozen_e1_spec is held',
      'window acquisition: both the current-week and the trailing-30-day windows at all three rooftops (the primary committed blocker is missing trailing-30-day history)',
      'baseline: the trailing-30-day average that the >15%-below comparison is measured against',
    ],
    missing_is_unknown_never_zero: true,
  },
  {
    metric_id: 'SW-050',
    metric:
      'negative-front-gross new-car deals ÷ eligible new-car deals (per rooftop, per week)',
    gate4h_seed_state: 'required_not_performed',
    gate4j_state: 'performed_schema_only',
    supersedes: 'Gate 4H required_not_performed seed for SW-050',
    capability_discovered:
      'DMS Sales Flat Export exposes a row-level schema (Front Gross Profit, Inventory Type, Deal Status, deal dates) that could identify negative-front-gross new-car deals and an eligible new-car denominator. Deal Performance does NOT provide a row-level count of negative-front-gross new deals.',
    data_acquired: false,
    value_measured: false,
    promoted: false,
    candidate_source: 'DMS Sales Flat Export (schema only)',
    exact_remaining_requirement: [
      'window acquisition: a proved, dated, PII-safe export limited to the governed week (no date limiter was proved in the read-only view; the export carries extensive buyer/co-buyer PII and was deliberately not exported)',
      'join / definition: isolate eligible new-car deals with non-blank Front Gross at ALL THREE rooftops (the committed observed denominator is 0/0 at 21043 and 21044 and integrity-incomplete at 21047 — 2 of 4 Front Gross blank)',
    ],
    missing_is_unknown_never_zero: true,
  },
  {
    metric_id: 'SW-111',
    metric:
      'composite: lead-volume trend (rising) × close-rate trend (falling)',
    gate4h_seed_state: 'required_not_performed',
    gate4j_state: 'performed_candidate_found',
    supersedes: 'Gate 4H required_not_performed seed for SW-111',
    capability_discovered:
      'Deal Performance’s parameterized Date Range, lead volume, and Close % could be pulled for two comparable periods to establish a directional trend.',
    data_acquired: false,
    value_measured: false,
    promoted: false,
    candidate_source: 'Deal Performance',
    exact_remaining_requirement: [
      'window acquisition: at least two comparable periods (multi-week history) at all three rooftops — the primary committed blocker is that a single held week defines no trend direction',
      'semantic ratification: a ratified composite trend threshold (what "rising" volume and "falling" close mean) — the committed frozen_e1_spec threshold is held',
    ],
    missing_is_unknown_never_zero: true,
  },
  {
    metric_id: 'SW-114',
    metric: 'composite: show rate (available) × close rate (sold ÷ write-ups)',
    gate4h_seed_state: 'required_not_performed',
    gate4j_state: 'performed_no_route_found',
    supersedes: 'Gate 4H required_not_performed seed for SW-114',
    capability_discovered:
      'No show-rate route was found in the inspected reports — Deal Performance does not itself provide show rate, and the Appointments report was not part of this pass. The close-rate arm still needs a non-zero write-up total joined to sold outcomes.',
    data_acquired: false,
    value_measured: false,
    promoted: false,
    candidate_source: null,
    exact_remaining_requirement: [
      'join / source: a show-rate source (appointment shown / appointment outcome) joined to sold outcomes and a non-zero write-up (opportunity) total at all three rooftops — the accepted Dashboard write-up TOTAL is observed 0',
      'semantic ratification: a ratified high-show / low-close composite threshold — the committed frozen_e1_spec threshold is held',
    ],
    missing_is_unknown_never_zero: true,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Customer-safe summary (generic; no internal controls, report titles, PII, or measured value).
// ─────────────────────────────────────────────────────────────────────────────

/** Vocabulary that must NEVER reach customer text: internal report titles, CRM controls, PII columns. */
export const CUSTOMER_FORBIDDEN =
  /\b(Desk Log|Deal Performance|DMS|Sales Flat|Leads? Desked|Pencils?|Lead Type|Lead Source|Lead Status|Date Range|Front Gross|Back Gross|Gross Profit|Deal Number|Deal Status|ADF|XML|Inventory Type|Sold Status|Deal Type|Edit Parameters?|parameter|Service Dept|salesperson|manager ID|buyer|co-buyer|CSV)\b/i

const NAME_PAIR = /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g
const ALLOWED_PROPER = new Set(['CRM'])

export type CustomerSafeSummary = {
  headline: string
  detail: Array<string>
  claim_layer_note: string
}

/**
 * Build the customer-facing summary. It may say additional CRM report routes were identified, but it
 * must NOT expose an internal control, a report title, PII, or claim any value was measured. Fails
 * closed via {@link assertCustomerSafeText}.
 */
export function buildCustomerSafeSummary(): CustomerSafeSummary {
  const summary: CustomerSafeSummary = {
    headline:
      'Additional in-CRM report routes were identified that could support these follow-up checks once the required data setup and agreed definitions are in place.',
    detail: [
      'No value was measured for any of these checks this period.',
      'Each check still needs a specific setup step before it can be reported — such as agreeing an exact definition, gathering more than one period of history, or a governed data pull.',
      'Missing information is treated as unknown, never as zero.',
    ],
    claim_layer_note:
      'These are capability findings (a route exists), not measurements (a value was produced).',
  }
  assertCustomerSafeText(summary)
  return summary
}

/** Fail-closed: customer text must carry no internal control/report/PII vocabulary, jargon, or names. */
export function assertCustomerSafeText(s: CustomerSafeSummary): void {
  const strings = [s.headline, ...s.detail, s.claim_layer_note]
  for (const str of strings) {
    if (!str.trim()) throw new Error('Gate 4J: empty customer string')
    if (CUSTOMER_FORBIDDEN.test(str))
      throw new Error(
        `Gate 4J: customer text exposes an internal control/report/PII term: "${str}"`,
      )
    if (INTERNAL_JARGON.test(str))
      throw new Error(`Gate 4J: customer text leaks internal jargon: "${str}"`)
    if (SERVICE_PARTS_DATA.test(str))
      throw new Error(
        `Gate 4J: customer text leaks Service/Parts data: "${str}"`,
      )
    for (const m of str.matchAll(NAME_PAIR))
      if (!ALLOWED_PROPER.has(m[1]) || !ALLOWED_PROPER.has(m[2]))
        throw new Error(
          `Gate 4J: customer text may contain a person name: "${m[0]}"`,
        )
  }
}
