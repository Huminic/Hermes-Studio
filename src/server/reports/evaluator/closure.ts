/**
 * Gate 3 — deterministic 876-cell closure registry.
 *
 * For every UNRESOLVED cell in the Gate 2 ledger, produce one machine-readable closure
 * record: the exact unresolved-reason category, the required raw fields + definition/grain,
 * the required source, the current source state, whether it is calculable from already
 * accepted bytes (with proof), the acquisition route, the baseline route, owner/next-action
 * /prerequisite/earliest-evidence/stop-condition, whether Duane approval is materially
 * required, and whether the condition conflicts with the permanent Sales-only boundary.
 * Pure + deterministic. Never promotes an unresolved cell to evaluated.
 */
import type { EvalRow } from './types'

/** Richer catalog view for closure (adds the raw fields loadCatalog intentionally strips). */
export type CatalogDetail = {
  metric_id: string
  section: string
  subsection: string
  condition: string
  acquisition_class: string
  source: string
  owner: string
  next_action: string
  fields_and_keys: string
  period_grain_population: string
}

export type ClosureCategory =
  | 'quarantined'
  | 'external_source'
  | 'outside_boundary'
  | 'unavailable_retention'
  | 'response_time_def_mismatch'
  | 'manual_crm'
  | 'second_order_composite'
  | 'trend_history_needed'
  | 'missing_field'
  | 'definition_mismatch'
  | 'denominator_integrity'

export type SourceState =
  | 'accepted'
  | 'quarantined'
  | 'unavailable'
  | 'definition-mismatch'
  | 'historical-window-needed'
  | 'outside-authorized-boundary'

export type AcquisitionRoute =
  | 'existing_scheduled_report'
  | 'new_readonly_vinsolutions_export'
  | 'readonly_browser_capture'
  | 'historical_accumulation'
  | 'external_feed'
  | 'separate_service_workspace'
  | 'compliance_authorization'
  | 'genuinely_unavailable'

export type BaselineRoute =
  | 'compatible_published_evidence'
  | 'dealer_history'
  | 'operational_target'
  | 'cohort_comparison'
  | 'missing'

export type ClosureRecord = {
  metric_id: string
  dealer_id: string
  profile: string
  condition: string
  cluster: string
  unresolved_reason_category: ClosureCategory
  unresolved_reason: string
  required_raw_fields: string
  definition_denominator_grain: string
  required_source: string
  current_source_state: SourceState
  calculable_from_accepted_bytes: boolean
  calculable_proof: string
  acquisition_route: AcquisitionRoute
  baseline_route: BaselineRoute
  owner: string
  next_action: string
  prerequisite: string
  earliest_evidence_point: string
  stop_condition: string
  duane_approval_required: boolean
  sales_only_boundary_conflict: boolean
}

/** Categorize a ledger unresolved_reason deterministically (single source of truth). */
export function categorize(reason: string): ClosureCategory {
  if (/quarantined family/.test(reason)) return 'quarantined'
  if (/non-VinSolutions external/.test(reason)) return 'external_source'
  if (/outside the governed boundary/.test(reason)) return 'outside_boundary'
  if (/unavailable or retention-limited/.test(reason))
    return 'unavailable_retention'
  if (/Dashboard provides an AVERAGE/.test(reason))
    return 'response_time_def_mismatch'
  if (/manual CRM inspection/.test(reason)) return 'manual_crm'
  if (/second-order composite/.test(reason)) return 'second_order_composite'
  if (/new-car deals|blank Front Gross/.test(reason))
    return 'denominator_integrity'
  if (/within 24h/.test(reason)) return 'definition_mismatch'
  if (/write-up count|lead-source attribution/.test(reason))
    return 'missing_field'
  if (/trailing history|trailing 30-day|3 consecutive weeks/.test(reason))
    return 'trend_history_needed'
  return 'definition_mismatch'
}

const REQUIRES_DUANE: Array<AcquisitionRoute> = [
  'existing_scheduled_report',
  'new_readonly_vinsolutions_export',
  'readonly_browser_capture',
  'external_feed',
  'separate_service_workspace',
  'compliance_authorization',
]

type Template = {
  source_state: SourceState
  acquisition_route: AcquisitionRoute
  baseline_route: BaselineRoute
  owner: string
  next_action: string
  prerequisite: string
  earliest_evidence_point: string
  stop_condition: string
}

function templateFor(cat: ClosureCategory, c: CatalogDetail): Template {
  switch (cat) {
    case 'quarantined':
      return {
        source_state: 'quarantined',
        acquisition_route: 'existing_scheduled_report',
        baseline_route: hasThreshold(c) ? 'operational_target' : 'missing',
        owner: 'Duane / VinSolutions schedule admin',
        next_action:
          're-run the ROI/CAGE/Sales-Communication schedule with Service/Parts Lead Intents EXCLUDED, re-land, re-classify held',
        prerequisite:
          'corrected VinSolutions saved-filter (Sales-only Lead Intents)',
        earliest_evidence_point:
          'next weekly schedule after the saved-filter fix',
        stop_condition:
          'if a re-run still carries any Service/Parts Lead Intent, it stays quarantined (fail-closed)',
      }
    case 'external_source':
      return {
        source_state: 'unavailable',
        acquisition_route: 'external_feed',
        baseline_route: hasThreshold(c) ? 'operational_target' : 'missing',
        owner: 'Duane / external data owner',
        next_action:
          'stand up the non-VinSolutions feed named by the condition (GA / ad-spend / phone / vendor) as a governed read-only input',
        prerequisite:
          'authorized external feed + a governed ingestion contract',
        earliest_evidence_point: 'first governed delivery of the external feed',
        stop_condition:
          'no evaluation until the external definition + Sales-only provenance are proved',
      }
    case 'outside_boundary':
      return {
        source_state: 'outside-authorized-boundary',
        acquisition_route: /compliance|consent|tcpa|dnc|pii/i.test(c.condition)
          ? 'compliance_authorization'
          : 'separate_service_workspace',
        baseline_route: 'missing',
        owner: 'Duane / compliance + Service-workspace owner',
        next_action:
          'route via the separately governed Serra Service workspace or a compliance authorization; NEVER into the three Sales profiles',
        prerequisite:
          'explicit authority (Service-domain contract or compliance sign-off)',
        earliest_evidence_point:
          'after the separate authorized pipeline exists',
        stop_condition:
          'permanent Sales-only boundary: Service/compliance/cross-rooftop data never enters the Sales profiles',
      }
    case 'unavailable_retention':
      return {
        source_state: 'historical-window-needed',
        acquisition_route: 'historical_accumulation',
        baseline_route: 'dealer_history',
        owner: 'Huminic Semantic Watchdog pipeline',
        next_action:
          'accumulate the retained periods until the required window exists',
        prerequisite: 'sufficient retained history in the accepted family',
        earliest_evidence_point:
          'once the required number of periods has accumulated',
        stop_condition:
          'if the source retention cannot cover the window, remains unavailable',
      }
    case 'response_time_def_mismatch':
      return {
        source_state: 'definition-mismatch',
        acquisition_route: 'readonly_browser_capture',
        baseline_route: 'operational_target',
        owner: 'Duane / Huminic validator',
        next_action:
          'capture the read-only Dealer Dashboard Response Times per-lead CSV (median + business-hours), with a defined treatment for untouched leads',
        prerequisite:
          'per-lead first-touch timestamps + business-hours calendar + blank/untouched policy',
        earliest_evidence_point: 'first governed Response Times capture',
        stop_condition:
          'Dashboard AVERAGE is not the definitional MEDIAN; no promotion from the aggregate',
      }
    case 'manual_crm':
      return {
        source_state: 'outside-authorized-boundary',
        acquisition_route: 'readonly_browser_capture',
        baseline_route: hasThreshold(c) ? 'operational_target' : 'missing',
        owner: 'Duane / BDC + Sales management',
        next_action:
          'capture the read-only CRM Notes/History/Desking evidence the condition requires (no Message Content beyond authorization)',
        prerequisite: 'a governed read-only capture of the manual CRM surface',
        earliest_evidence_point: 'first governed capture of the CRM surface',
        stop_condition:
          'no scheduled export exposes this; manual inspection is not an automatable accepted byte',
      }
    case 'second_order_composite':
      return {
        source_state: 'definition-mismatch',
        acquisition_route: 'historical_accumulation',
        baseline_route: 'cohort_comparison',
        owner: 'Huminic Semantic Watchdog pipeline',
        next_action:
          'compose once ALL component metrics are individually evaluated AND the trend window exists',
        prerequisite: 'every component metric evaluated + trend history',
        earliest_evidence_point: 'after components + history are available',
        stop_condition:
          'a composite cannot be evaluated while any component is unresolved',
      }
    case 'trend_history_needed':
      return {
        source_state: 'historical-window-needed',
        acquisition_route: 'historical_accumulation',
        baseline_route: 'dealer_history',
        owner: 'Huminic Semantic Watchdog pipeline',
        next_action:
          'accumulate the stated history (trailing weeks/30-day/consecutive weeks); a one-week proxy is forbidden',
        prerequisite: 'the exact history window the rule names',
        earliest_evidence_point:
          'once the trailing window has accumulated from accepted families',
        stop_condition: 'no trend evaluation on a single held week',
      }
    case 'missing_field':
      return {
        source_state: 'definition-mismatch',
        acquisition_route: 'new_readonly_vinsolutions_export',
        baseline_route: hasThreshold(c) ? 'operational_target' : 'missing',
        owner: 'Duane / Huminic validator',
        next_action:
          'obtain a read-only export carrying the missing key/field (e.g. lead-source attribution on appointments, or a write-up count)',
        prerequisite:
          'a governed export whose columns include the missing field',
        earliest_evidence_point: 'first delivery of the extended export',
        stop_condition:
          'no fabrication of the missing field; missing is not zero',
      }
    case 'definition_mismatch':
      return {
        source_state: 'definition-mismatch',
        acquisition_route: 'new_readonly_vinsolutions_export',
        baseline_route: hasThreshold(c) ? 'operational_target' : 'missing',
        owner: 'Duane / Huminic validator',
        next_action:
          'obtain an export whose fields satisfy the exact condition definition (e.g. confirm-within-24h timing basis)',
        prerequisite: 'fields that match the condition definition exactly',
        earliest_evidence_point:
          'first delivery of the definition-compatible export',
        stop_condition: 'no forcing an incompatible field onto the condition',
      }
    case 'denominator_integrity':
      return {
        source_state: 'historical-window-needed',
        acquisition_route: 'historical_accumulation',
        baseline_route: 'operational_target',
        owner: 'Huminic Semantic Watchdog pipeline',
        next_action:
          'accumulate periods until the denominator population exists with complete required fields (missing is not zero)',
        prerequisite: 'a period with a non-zero, fully-populated denominator',
        earliest_evidence_point: 'first period with a complete denominator',
        stop_condition:
          'no evaluation while the denominator is zero or has blanks',
      }
    default:
      return {
        source_state: 'definition-mismatch',
        acquisition_route: 'genuinely_unavailable',
        baseline_route: 'missing',
        owner: 'Huminic Semantic Watchdog pipeline',
        next_action: 'resolve source/definition/baseline',
        prerequisite: 'a governed compatible source',
        earliest_evidence_point: 'unknown',
        stop_condition: 'no evaluation until compatible',
      }
  }
}

function hasThreshold(c: CatalogDetail): boolean {
  return (
    /\d/.test(c.condition) &&
    /%|\bminutes?\b|\bhours?\b|\bdays?\b|below|above|exceeds?|drops?|<|>/i.test(
      c.condition,
    )
  )
}

function salesOnlyConflict(cat: ClosureCategory, c: CatalogDetail): boolean {
  if (cat === 'outside_boundary') return true
  if (/service-to-sales|equity mining/i.test(c.section)) return true
  if (/\bservice\b|\bparts\b/i.test(c.condition) && !/sales/i.test(c.condition))
    return true
  return false
}

function requiredSource(c: CatalogDetail): string {
  return c.source
}

function requiredRawFields(c: CatalogDetail): string {
  return c.fields_and_keys
}

export function buildClosureRecord(
  row: EvalRow,
  c: CatalogDetail,
): ClosureRecord {
  const reason = row.unresolved_reason ?? ''
  const cat = categorize(reason)
  const t = templateFor(cat, c)
  return {
    metric_id: row.metric_id,
    dealer_id: row.dealer_id,
    profile: row.profile,
    condition: row.condition,
    cluster: row.cluster,
    unresolved_reason_category: cat,
    unresolved_reason: reason,
    required_raw_fields: requiredRawFields(c),
    definition_denominator_grain: c.period_grain_population,
    required_source: requiredSource(c),
    current_source_state: t.source_state,
    // Unresolved cells are, by construction, NOT calculable from accepted bytes (Gate 2
    // already applied the strict semantic/provenance/baseline predicate). Never promote.
    calculable_from_accepted_bytes: false,
    calculable_proof: `Gate 2 strict predicate + semantic validator rejected this cell: ${reason}`,
    acquisition_route: t.acquisition_route,
    baseline_route: t.baseline_route,
    owner: t.owner,
    next_action: t.next_action,
    prerequisite: t.prerequisite,
    earliest_evidence_point: t.earliest_evidence_point,
    stop_condition: t.stop_condition,
    duane_approval_required: REQUIRES_DUANE.includes(t.acquisition_route),
    sales_only_boundary_conflict: salesOnlyConflict(cat, c),
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Load the richer CatalogDetail[] from the raw catalog JSON (295 rows, order preserved). */
export function loadCatalogDetail(raw: unknown): Array<CatalogDetail> {
  if (!Array.isArray(raw)) throw new Error('catalog is not an array')
  return raw.map((r0) => {
    const r = r0 as Record<string, unknown>
    return {
      metric_id: str(r.metric_id),
      section: str(r.section),
      subsection: str(r.subsection),
      condition: str(r.condition),
      acquisition_class: str(r.acquisition_class),
      source: str(r.source),
      owner: str(r.owner),
      next_action: str(r.next_action),
      fields_and_keys: str(r.fields_and_keys),
      period_grain_population: str(r.period_grain_population),
    }
  })
}
