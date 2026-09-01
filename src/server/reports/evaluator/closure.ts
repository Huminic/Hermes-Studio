/**
 * Gate 3 — deterministic 855-cell closure registry (with controller-corrected routing).
 *
 * For every UNRESOLVED cell in the Gate 2 ledger, produce one machine-readable closure
 * record: reason category, required raw fields + definition/grain, required source, source
 * state, calculable-from-accepted (always false, with proof), acquisition + baseline routes,
 * a candidate controller-observed dataset (presence proves a candidate route ONLY, never
 * field completeness), route proof state, owner/next-action/prerequisite/earliest-evidence/
 * stop-condition, whether a NEW material Duane approval is required, and whether the
 * condition conflicts with the permanent Sales-only boundary. Pure + deterministic. Never
 * promotes an unresolved cell to evaluated.
 *
 * Approval rule (controller): the active goal already authorizes routine READ-ONLY
 * VinSolutions browser capture + UNSAVED export retrieval. So `readonly_browser_capture`,
 * `new_readonly_vinsolutions_export`, and `historical_accumulation` need NO new approval.
 * Saved-schedule mutation, external feeds, compliance/PII scope, cross-rooftop scope, and
 * separate Service work DO require a new material approval.
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
  | 'separate_cross_rooftop_route'
  | 'compliance_authorization'
  | 'genuinely_unavailable'

export type BoundaryDomain =
  | 'service'
  | 'compliance'
  | 'cross_rooftop'
  | 'external_enrichment'

export type BaselineRoute =
  | 'compatible_published_evidence'
  | 'dealer_history'
  | 'operational_target'
  | 'cohort_comparison'
  | 'missing'

export type RouteProofState = 'candidate_unproved' | 'no_known_route'

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
  // The mutually-exclusive dependency grouping for a quarantined cell: one of the three
  // single source-provenance report families OR 'multiple_quarantined' (a JOIN across >1
  // quarantined family). multiple_quarantined is a DEPENDENCY bucket, NOT a report family.
  dependency_bucket: string | null
  source_report_family: string | null
  boundary_domain: BoundaryDomain | null
  current_source_state: SourceState
  calculable_from_accepted_bytes: boolean
  calculable_proof: string
  acquisition_route: AcquisitionRoute
  alternative_acquisition_route: AcquisitionRoute | null
  route_proof_state: RouteProofState
  controller_observed_dataset: string | null
  baseline_route: BaselineRoute
  owner: string
  next_action: string
  prerequisite: string
  earliest_evidence_point: string
  stop_condition: string
  duane_approval_required: boolean
  alternative_duane_approval_required: boolean | null
  duane_approval_reason: string
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

// Routes that require a NEW material Duane approval (change/save/schedule a server object,
// or expand authority/scope). Read-only capture + unsaved export + accumulation do NOT.
const NEW_APPROVAL_ROUTES: Array<AcquisitionRoute> = [
  'existing_scheduled_report',
  'external_feed',
  'separate_service_workspace',
  'separate_cross_rooftop_route',
  'compliance_authorization',
]

export function duaneForRoute(route: AcquisitionRoute): boolean {
  return NEW_APPROVAL_ROUTES.includes(route)
}

const DUANE_REASON: Record<AcquisitionRoute, string> = {
  existing_scheduled_report:
    'mutates a saved VinSolutions schedule/server object — new approval required',
  external_feed:
    'stands up a non-VinSolutions data source — new authority/scope required',
  separate_service_workspace:
    'Service-domain work in the separate Serra Service workspace — new authority required',
  separate_cross_rooftop_route:
    'cross-rooftop scope beyond the one Sales rooftop — new governed route required',
  compliance_authorization: 'compliance/PII scope — new authorization required',
  new_readonly_vinsolutions_export:
    'read-only UNSAVED Custom Reporting export is already authorized by the active goal — no new approval',
  readonly_browser_capture:
    'read-only browser capture is already authorized by the active goal — no new approval',
  historical_accumulation:
    'accumulates an already-accepted family over time — no new source, no new approval',
  genuinely_unavailable: 'no known governed route',
}

// Explicit, reviewable domain split for the 35 "Outside governed boundary" conditions.
// Only genuinely Service-domain IDs route to the Serra Service workspace.
const OUTSIDE_BOUNDARY_DOMAIN: Record<string, BoundaryDomain> = {
  SW081: 'service',
  SW082: 'service',
  SW199: 'service',
  SW218: 'service',
  SW222: 'service',
  SW227: 'service',
  SW228: 'service',
  SW279: 'service',
  SW294: 'service',
  SW097: 'compliance',
  SW098: 'compliance',
  SW099: 'compliance',
  SW100: 'compliance',
  SW101: 'compliance',
  SW102: 'compliance',
  SW103: 'compliance',
  SW104: 'compliance',
  SW186: 'compliance',
  SW187: 'compliance',
  SW188: 'compliance',
  SW189: 'compliance',
  SW190: 'compliance',
  SW191: 'compliance',
  SW192: 'compliance',
  SW271: 'compliance',
  SW267: 'cross_rooftop',
  SW268: 'cross_rooftop',
  SW269: 'cross_rooftop',
  SW229: 'external_enrichment',
  SW264: 'external_enrichment',
  SW272: 'external_enrichment',
  SW273: 'external_enrichment',
  SW274: 'external_enrichment',
  SW275: 'external_enrichment',
  SW276: 'external_enrichment',
}

function boundaryDomain(c: CatalogDetail): BoundaryDomain | null {
  return OUTSIDE_BOUNDARY_DOMAIN[c.metric_id.replace('-', '')] ?? null
}

/** The mutually-exclusive DEPENDENCY bucket for a quarantined cell (not a report family). */
function dependencyBucket(c: CatalogDetail): string {
  const s = c.source
  const roi = /\bROI\b/i.test(s)
  const cage = /CAGE|Enterprise Performance/i.test(s)
  const comm = /Communication Log/i.test(s)
  if (/^Join of/i.test(s) || [roi, cage, comm].filter(Boolean).length > 1)
    return 'multiple_quarantined'
  if (roi) return 'lead_source_roi'
  if (cage) return 'cage_kpi'
  if (comm) return 'sales_comm_log'
  return 'multiple_quarantined'
}

/** The single source-provenance report family, or null for a multi-family dependency. */
function sourceReportFamily(c: CatalogDetail): string | null {
  const b = dependencyBucket(c)
  return b === 'multiple_quarantined' ? null : b
}

// Controller-observed Custom Reporting datasets (28 nonblank; Service + Service Appointments
// permanently excluded). A dataset name here is a CANDIDATE route only — presence never
// proves field completeness, safe filters, exportability, history, or baseline compatibility.
export const CONTROLLER_DATASETS: Array<string> = [
  'Appointments',
  'Call Tracking',
  'Call Tracking Summary By Dealer',
  'Call Tracking Summary By Provider',
  'CRM Sales',
  'Customer Contact',
  'Customers',
  'Daily Communication Summary By User',
  'Daily Dealer Summary',
  'Dealers',
  'DMS Sales',
  'Inventory',
  'Leads',
  'Monthly Appointment Summary by User',
  'Monthly Dealer Summary',
  'Monthly Lead Summary by User',
  'Monthly Sales Summary By User',
  'Monthly Showroom Visit Summary By User',
  'Monthly Task Summary By User',
  'Monthly User Summary By Lead Type',
  'Recent Task Detail',
  'Showroom Visits',
  'Traffic Log',
  'Users',
  'Vehicle Trade-Ins',
  'Website Vehicle Views',
]
// (Service and Service Appointments are in the 28 but are PERMANENTLY EXCLUDED — never mapped.)

function candidateDataset(
  cat: ClosureCategory,
  c: CatalogDetail,
): string | null {
  switch (cat) {
    case 'response_time_def_mismatch':
      return 'Leads' // actual/adjusted/actionable response timing per lead
    case 'manual_crm':
      return 'Customer Contact' // CRM last attempted/actual contacts with user/date/group
    case 'missing_field':
    case 'definition_mismatch':
      if (/appointment/i.test(c.condition)) return 'Appointments'
      if (/write-up|gross|deal/i.test(c.condition)) return 'CRM Sales'
      return 'Leads'
    case 'quarantined': {
      const f = dependencyBucket(c)
      if (f === 'sales_comm_log') return 'Daily Communication Summary By User' // SALES columns ONLY
      if (f === 'cage_kpi') return 'Daily Dealer Summary'
      return 'Leads'
    }
    case 'unavailable_retention':
    case 'second_order_composite':
    case 'trend_history_needed':
    case 'denominator_integrity':
      if (/appointment|show|no-show/i.test(c.condition)) return 'Appointments'
      if (/gross|deal|sold|close|units/i.test(c.condition)) return 'CRM Sales'
      if (/\blead/i.test(c.condition)) return 'Leads'
      return null
    default:
      // external_source / outside_boundary — not a selectable Sales Custom Reporting dataset.
      return null
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

function salesOnlyConflict(c: CatalogDetail): boolean {
  if (/service-to-sales|equity mining/i.test(c.section)) return true
  const d = boundaryDomain(c)
  return d === 'service' || d === 'cross_rooftop'
}

type Template = {
  source_state: SourceState
  acquisition_route: AcquisitionRoute
  alternative_acquisition_route: AcquisitionRoute | null
  route_proof_state: RouteProofState
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
      // PRIMARY: unsaved Sales-only Custom Reporting reconstruction/export (read-only, no
      // new approval). ALTERNATIVE: saved-schedule repair (mutation + the hidden Lead Intent
      // control that standard Edit Parameters did not expose). BOTH candidate-unproved.
      return {
        source_state: 'quarantined',
        acquisition_route: 'new_readonly_vinsolutions_export',
        alternative_acquisition_route: 'existing_scheduled_report',
        route_proof_state: 'candidate_unproved',
        baseline_route: hasThreshold(c) ? 'operational_target' : 'missing',
        owner:
          'Huminic validator (unsaved export) / Duane (saved-schedule repair)',
        next_action:
          'reconstruct a Sales-only Custom Reporting export for this family with Service/Parts Lead Intents excluded (unsaved, read-only); OR repair the saved schedule filter (needs the hidden Lead Intent control)',
        prerequisite:
          'inspect exact fields/filters/period + prove the Lead-Intent Service/Parts exclusion; per report family × dealer',
        earliest_evidence_point:
          'first inspected unsaved Sales-only export that proves the field set + exclusion',
        stop_condition:
          'if the reconstruction still carries any Service/Parts Lead Intent, it stays quarantined (fail-closed)',
      }
    case 'external_source':
      return {
        source_state: 'unavailable',
        acquisition_route: 'external_feed',
        alternative_acquisition_route: null,
        route_proof_state: 'candidate_unproved',
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
    case 'outside_boundary': {
      const dom = boundaryDomain(c)
      if (dom === 'compliance') {
        return {
          source_state: 'outside-authorized-boundary',
          acquisition_route: 'compliance_authorization',
          alternative_acquisition_route: null,
          route_proof_state: 'candidate_unproved',
          baseline_route: 'missing',
          owner: 'Duane / compliance',
          next_action:
            'obtain compliance/PII authorization + a governed source (Sales-domain; stays out of the Service workspace)',
          prerequisite: 'compliance/PII sign-off',
          earliest_evidence_point:
            'after the compliance authorization + governed source exist',
          stop_condition: 'no evaluation without compliance authorization',
        }
      }
      if (dom === 'cross_rooftop') {
        return {
          source_state: 'outside-authorized-boundary',
          acquisition_route: 'separate_cross_rooftop_route',
          alternative_acquisition_route: null,
          route_proof_state: 'candidate_unproved',
          baseline_route: 'missing',
          owner: 'Duane / group data governance',
          next_action:
            'define a separate governed cross-rooftop route; the single Sales profile is one-rooftop by design',
          prerequisite: 'authorized cross-rooftop governance',
          earliest_evidence_point: 'after the cross-rooftop route exists',
          stop_condition:
            'one-rooftop Sales boundary: another rooftop’s data never enters this profile',
        }
      }
      if (dom === 'external_enrichment') {
        return {
          source_state: 'outside-authorized-boundary',
          acquisition_route: 'external_feed',
          alternative_acquisition_route: null,
          route_proof_state: 'candidate_unproved',
          baseline_route: 'missing',
          owner: 'Duane / external data owner',
          next_action:
            'stand up the governed external enrichment feed (registration / insurance / credit / public records) as a Sales-scoped read-only input',
          prerequisite:
            'authorized enrichment feed + a governed ingestion contract',
          earliest_evidence_point: 'first governed enrichment delivery',
          stop_condition:
            'enrichment stays Sales-scoped; never routed through the Service workspace',
        }
      }
      // service (default for outside_boundary)
      return {
        source_state: 'outside-authorized-boundary',
        acquisition_route: 'separate_service_workspace',
        alternative_acquisition_route: null,
        route_proof_state: 'candidate_unproved',
        baseline_route: 'missing',
        owner: 'Duane / Serra Service-workspace owner',
        next_action:
          'route via the separately governed combined Serra Service workspace — NEVER the three Sales profiles',
        prerequisite:
          'explicit Service-domain authority (separate Service contract)',
        earliest_evidence_point:
          'after the separate authorized Service pipeline exists',
        stop_condition:
          'permanent Sales-only boundary: Service data never enters the Sales profiles',
      }
    }
    case 'unavailable_retention':
      return {
        source_state: 'historical-window-needed',
        acquisition_route: 'historical_accumulation',
        alternative_acquisition_route: null,
        route_proof_state: 'candidate_unproved',
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
        alternative_acquisition_route: 'new_readonly_vinsolutions_export',
        route_proof_state: 'candidate_unproved',
        baseline_route: 'operational_target',
        owner: 'Huminic validator',
        next_action:
          'capture a read-only per-lead response dataset (Leads timing / Response Times) with MEDIAN + business-hours + a defined untouched-lead policy',
        prerequisite:
          'per-lead first-touch timestamps + business-hours calendar + blank/untouched policy',
        earliest_evidence_point: 'first inspected per-lead response export',
        stop_condition:
          'the Dashboard AVERAGE is not the definitional MEDIAN; no promotion from the aggregate',
      }
    case 'manual_crm':
      return {
        source_state: 'outside-authorized-boundary',
        acquisition_route: 'readonly_browser_capture',
        alternative_acquisition_route: 'new_readonly_vinsolutions_export',
        route_proof_state: 'candidate_unproved',
        baseline_route: hasThreshold(c) ? 'operational_target' : 'missing',
        owner: 'Huminic validator / Sales management',
        next_action:
          'capture the read-only CRM surface the condition needs (Customer Contact / Recent Task Detail; no Message Content beyond authorization)',
        prerequisite: 'a governed read-only capture of the CRM surface',
        earliest_evidence_point: 'first inspected CRM-surface capture',
        stop_condition: 'no Service columns; missing is not zero',
      }
    case 'second_order_composite':
      return {
        source_state: 'definition-mismatch',
        acquisition_route: 'historical_accumulation',
        alternative_acquisition_route: null,
        route_proof_state: 'candidate_unproved',
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
        alternative_acquisition_route: null,
        route_proof_state: 'candidate_unproved',
        baseline_route: 'dealer_history',
        owner: 'Huminic Semantic Watchdog pipeline',
        next_action:
          'accumulate the stated history (trailing weeks / 30-day / consecutive weeks); a one-week proxy is forbidden',
        prerequisite: 'the exact history window the rule names',
        earliest_evidence_point:
          'once the trailing window has accumulated from accepted families',
        stop_condition: 'no trend evaluation on a single held week',
      }
    case 'missing_field':
      return {
        source_state: 'definition-mismatch',
        acquisition_route: 'new_readonly_vinsolutions_export',
        alternative_acquisition_route: null,
        route_proof_state: 'candidate_unproved',
        baseline_route: hasThreshold(c) ? 'operational_target' : 'missing',
        owner: 'Huminic validator',
        next_action:
          'retrieve a read-only (unsaved) export carrying the missing key/field (e.g. per-source appointment attribution, or a write-up count)',
        prerequisite:
          'an export whose columns include the missing field (inspect first)',
        earliest_evidence_point: 'first inspected extended export',
        stop_condition:
          'no fabrication of the missing field; missing is not zero',
      }
    case 'definition_mismatch':
      return {
        source_state: 'definition-mismatch',
        acquisition_route: 'new_readonly_vinsolutions_export',
        alternative_acquisition_route: null,
        route_proof_state: 'candidate_unproved',
        baseline_route: hasThreshold(c) ? 'operational_target' : 'missing',
        owner: 'Huminic validator',
        next_action:
          'retrieve a read-only (unsaved) export whose fields satisfy the exact definition (e.g. confirm-within-24h timing basis)',
        prerequisite:
          'fields that match the condition definition exactly (inspect first)',
        earliest_evidence_point: 'first inspected definition-compatible export',
        stop_condition: 'no forcing an incompatible field onto the condition',
      }
    case 'denominator_integrity':
      return {
        source_state: 'historical-window-needed',
        acquisition_route: 'historical_accumulation',
        alternative_acquisition_route: null,
        route_proof_state: 'candidate_unproved',
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
        alternative_acquisition_route: null,
        route_proof_state: 'no_known_route',
        baseline_route: 'missing',
        owner: 'Huminic Semantic Watchdog pipeline',
        next_action: 'resolve source/definition/baseline',
        prerequisite: 'a governed compatible source',
        earliest_evidence_point: 'unknown',
        stop_condition: 'no evaluation until compatible',
      }
  }
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
    required_raw_fields: c.fields_and_keys,
    definition_denominator_grain: c.period_grain_population,
    required_source: c.source,
    dependency_bucket: cat === 'quarantined' ? dependencyBucket(c) : null,
    source_report_family: cat === 'quarantined' ? sourceReportFamily(c) : null,
    boundary_domain: cat === 'outside_boundary' ? boundaryDomain(c) : null,
    current_source_state: t.source_state,
    // Unresolved cells are, by construction, NOT calculable from accepted bytes (Gate 2
    // already applied the strict semantic/provenance/baseline predicate). Never promote.
    calculable_from_accepted_bytes: false,
    calculable_proof: `Gate 2 strict predicate + semantic validator rejected this cell: ${reason}`,
    acquisition_route: t.acquisition_route,
    alternative_acquisition_route: t.alternative_acquisition_route,
    route_proof_state: t.route_proof_state,
    controller_observed_dataset: candidateDataset(cat, c),
    baseline_route: t.baseline_route,
    owner: t.owner,
    next_action: t.next_action,
    prerequisite: t.prerequisite,
    earliest_evidence_point: t.earliest_evidence_point,
    stop_condition: t.stop_condition,
    duane_approval_required: duaneForRoute(t.acquisition_route),
    alternative_duane_approval_required:
      t.alternative_acquisition_route === null
        ? null
        : duaneForRoute(t.alternative_acquisition_route),
    duane_approval_reason: DUANE_REASON[t.acquisition_route],
    sales_only_boundary_conflict: salesOnlyConflict(c),
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
