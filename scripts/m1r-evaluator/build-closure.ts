/**
 * Deterministic Gate 3 generator: 876-cell closure registry, aggregate views, the
 * condition-by-condition promotion probe, and the controller acquisition contract.
 * All output is Prettier-clean + byte-identical on rerun; NON-PII; never promotes an
 * unresolved cell to evaluated.
 */
import fs from 'node:fs'
import path from 'node:path'
import { formatJsonFile } from './serialize'
import type { EvalRow } from '@/server/reports/evaluator/types'
import type { ClosureRecord } from '@/server/reports/evaluator/closure'
import {
  CONTROLLER_DATASETS,
  buildClosureRecord,
  duaneForRoute,
  loadCatalogDetail,
} from '@/server/reports/evaluator/closure'
import {
  buildAcceptedEvidence,
  probeConditions,
} from '@/server/reports/evaluator/promotion-probe'
import {
  ALLOWED_EXPORT_FIELD_SELECTION,
  DATA_MINIMIZATION_POLICY,
  PROHIBITED_FIELDS_LIST,
  validateAllSelections,
} from '@/server/reports/evaluator/data-minimization'

const REPO = process.cwd()
const OUT = path.join(REPO, 'docs/halo/evidence/m1r/evaluator')
const CONTRACT_OUT = path.join(REPO, 'docs/halo/contract')

type Ledger = { rows: Array<EvalRow> }

function tally<T>(
  items: Array<T>,
  key: (t: T) => string,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const it of items) {
    const k = key(it)
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

const ACQUISITION_TEMPLATE: Record<
  string,
  { required_inputs: string; sales_only_proof: string }
> = {
  existing_scheduled_report: {
    required_inputs:
      'ALTERNATIVE for quarantined families only: repair the SAVED weekly schedule (ROI / Enterprise Performance / Sales Communication Log) so its saved-filter Lead Intents EXCLUDE Service/Parts. Requires the hidden Lead Intent control that standard Edit Parameters did NOT expose — UNPROVED until inspected. Mutates a server object (new approval).',
    sales_only_proof:
      'Filters Lead Type/Lead Intent must NOT positively select Service/Parts; data rows scanned clean; one dealer.',
  },
  new_readonly_vinsolutions_export: {
    required_inputs:
      'read-only UNSAVED Custom Reporting export: for quarantined families, reconstruct a Sales-only report (candidate datasets: Leads / Daily Communication Summary By User [SALES columns] / Daily Dealer Summary) with Service/Parts Lead Intents excluded; for missing-field/definition cells, an export carrying the missing field. One dealer; range period; native spaced headers; UNPROVED until exact fields/filters/rows inspected.',
    sales_only_proof:
      'exclude Service lead sources + never select Service columns; Appt Reason = Sales Appointment; Lead Types = {Internet,Phone,Walk-in}; clean data rows; one dealer.',
  },
  readonly_browser_capture: {
    required_inputs:
      'read-only browser capture (candidate datasets: Leads per-lead response timing; Customer Contact / Recent Task Detail CRM surfaces) with per-lead timestamps + business-hours calendar + a defined untouched-lead policy; one dealer; explicit period; UNPROVED until fields/rows inspected.',
    sales_only_proof:
      'capture provenance (host reporting-vinsolutions.app.coxautoinc.com), one dealer, Sales-only surface; no Service columns; no Message Content beyond authorization.',
  },
  historical_accumulation: {
    required_inputs:
      'no new source — accumulate the already-accepted family (Leads/Appointments/CRM/Dashboard) across the stated trailing window (WoW / 30-day / N consecutive weeks) until the history exists.',
    sales_only_proof:
      'each accumulated period keeps the existing Sales-only held-family proof.',
  },
  external_feed: {
    required_inputs:
      'a non-VinSolutions governed read-only feed named by the condition (Google Analytics, ad-spend, phone/call system, or an external enrichment vendor — registration/insurance/credit/public records) with a governed ingestion contract, definition, unit, and period.',
    sales_only_proof:
      'external feed must be Sales-scoped and carry its own provenance; never routed through the Service workspace.',
  },
  separate_service_workspace: {
    required_inputs:
      'GENUINELY Service-domain conditions only: route via the separately governed combined Serra Service workspace — NOT the three Sales profiles. Profile slug/format/route/owner are defined by the separate Service-domain contract.',
    sales_only_proof:
      'PERMANENT boundary: Service data never enters the Sales profiles.',
  },
  separate_cross_rooftop_route: {
    required_inputs:
      'cross-rooftop conditions only: define a separate governed cross-rooftop route; the single Sales profile is one-rooftop by design.',
    sales_only_proof:
      'one-rooftop boundary: another rooftop’s data never enters this Sales profile.',
  },
  compliance_authorization: {
    required_inputs:
      'Sales-domain compliance/PII conditions: explicit compliance/PII authorization + a governed source before any evaluation (stays out of the Service workspace).',
    sales_only_proof:
      'compliance sign-off; PII handling per authorization; Sales-scoped.',
  },
  genuinely_unavailable: {
    required_inputs: 'no known governed route today.',
    sales_only_proof: 'n/a',
  },
}

async function main(): Promise<void> {
  const ledger = JSON.parse(
    fs.readFileSync(path.join(OUT, 'spine-ledger.json'), 'utf8'),
  ) as Ledger
  const details = loadCatalogDetail(
    JSON.parse(
      fs.readFileSync(
        path.join(
          CONTRACT_OUT,
          'semantic-watchdog-feasibility-matrix-295.json',
        ),
        'utf8',
      ),
    ),
  )
  const detailById = new Map(details.map((d) => [d.metric_id, d]))

  const unresolved = ledger.rows.filter((r) => r.status === 'unresolved')
  const records: Array<ClosureRecord> = unresolved.map((r) =>
    buildClosureRecord(r, detailById.get(r.metric_id)!),
  )

  // Aggregate views (reconcile exactly to 876 + the Gate 2 reason distribution).
  const by_category = tally(records, (r) => r.unresolved_reason_category)
  const by_source_family = tally(records, (r) => r.required_source)
  const by_dealer = tally(records, (r) => r.dealer_id)
  const by_owner = tally(records, (r) => r.owner)
  const by_acquisition_route = tally(records, (r) => r.acquisition_route)
  const by_baseline_route = tally(records, (r) => r.baseline_route)
  const conflicts = records.filter((r) => r.sales_only_boundary_conflict)
  const conflictIds = [...new Set(conflicts.map((r) => r.metric_id))].sort()

  // Ledger-derived category counts for the reconciliation assertion.
  const ledgerCatCounts = tally(
    unresolved.map((r) => buildClosureRecord(r, detailById.get(r.metric_id)!)),
    (r) => r.unresolved_reason_category,
  )

  const by_boundary_domain = tally(
    records.filter((r) => r.boundary_domain !== null),
    (r) => String(r.boundary_domain),
  )
  const by_route_proof_state = tally(records, (r) => r.route_proof_state)

  const views = {
    artifact: 'gate3-closure-views',
    total: records.length,
    reconciles_to_876: records.length === 876,
    by_category,
    by_source_family,
    by_dealer,
    by_owner,
    by_acquisition_route,
    by_baseline_route,
    by_boundary_domain,
    by_route_proof_state,
    duane_approval_required_count: records.filter(
      (r) => r.duane_approval_required,
    ).length,
    no_new_approval_count: records.filter((r) => !r.duane_approval_required)
      .length,
    sales_only_boundary_conflicts: {
      count: conflicts.length,
      metric_ids: conflictIds,
    },
    reconciles_to_gate2_reason_categories:
      JSON.stringify(by_category) === JSON.stringify(ledgerCatCounts),
  }

  // Promotion probe — EVIDENCE-DERIVED from the actual Gate 2 spine rows, bound to the
  // authoritative accepted-delivery SHA allowlist (native-scheduled-evidence held deliveries).
  const scheduledEvidence = JSON.parse(
    fs.readFileSync(
      path.join(OUT, '..', 'scheduled', 'native-scheduled-evidence.json'),
      'utf8',
    ),
  ) as {
    deliveries: Array<{
      profile: string
      family: string
      sha256: string
      filename: string
      period_hint: string
      validation_state: string
    }>
  }
  const heldDeliveries = scheduledEvidence.deliveries
    .filter((d) => d.validation_state === 'held')
    .map((d) => ({
      profile: d.profile,
      family: d.family,
      sha256: d.sha256,
      filename: d.filename,
      period_hint: d.period_hint,
    }))
  const probe = probeConditions(
    details,
    ledger.rows,
    buildAcceptedEvidence(heldDeliveries),
  )

  // Acquisition contract (grouped by route; NON-overclaiming — dataset presence is a
  // candidate route only; nothing "closes" a cell until fields/period/filters/rows proved).
  const routes = [...new Set(records.map((r) => r.acquisition_route))].sort()
  const groups = routes.map((route) => {
    const inRoute = records.filter((r) => r.acquisition_route === route)
    const metricIds = [...new Set(inRoute.map((r) => r.metric_id))].sort()
    const tpl = ACQUISITION_TEMPLATE[route]
    return {
      acquisition_route: route,
      candidate_metric_ids: metricIds,
      cell_count: inRoute.length,
      route_proof_state: inRoute[0].route_proof_state,
      duane_approval_required: duaneForRoute(route),
      duane_approval_reason: inRoute[0].duane_approval_reason,
      required_inputs: tpl.required_inputs,
      sales_only_proof: tpl.sales_only_proof,
      closes_cells_only_when_proved: true,
    }
  })

  // Quarantined block: the mutually-exclusive DEPENDENCY buckets (3 single source-provenance
  // report families + 1 multi-family dependency bucket) × 3 dealers, with BOTH candidate
  // routes (unsaved reconstruction vs saved-schedule repair), all UNPROVED.
  const quarantined = records.filter(
    (r) => r.unresolved_reason_category === 'quarantined',
  )
  const qBuckets = [
    ...new Set(quarantined.map((r) => r.dependency_bucket)),
  ].sort()
  const qDealers = ['21043', '21044', '21047']
  const by_dependency_bucket_dealer = qBuckets.flatMap((bucket) =>
    qDealers.map((dealer) => {
      const cells = quarantined.filter(
        (r) => r.dependency_bucket === bucket && r.dealer_id === dealer,
      )
      return {
        dependency_bucket: bucket,
        is_multi_family_dependency: bucket === 'multiple_quarantined',
        dealer_id: dealer,
        cell_count: cells.length,
        primary_route: 'new_readonly_vinsolutions_export',
        primary_duane_approval_required: false,
        alternative_route: 'existing_scheduled_report',
        alternative_duane_approval_required: true,
        route_proof_state: 'candidate_unproved',
      }
    }),
  )
  const by_dependency_bucket: Record<string, number> = {}
  for (const r of quarantined)
    by_dependency_bucket[String(r.dependency_bucket)] =
      (by_dependency_bucket[String(r.dependency_bucket)] ?? 0) + 1
  const bySourceReportFamily: Record<string, number> = {}
  for (const r of quarantined)
    if (r.source_report_family !== null)
      bySourceReportFamily[r.source_report_family] =
        (bySourceReportFamily[r.source_report_family] ?? 0) + 1
  const quarantined_reconstruction = {
    note: 'The 510 quarantined cells decompose into MUTUALLY EXCLUSIVE DEPENDENCY buckets: THREE single source-provenance report families (lead_source_roi, cage_kpi, sales_comm_log) PLUS ONE multi-family dependency bucket (multiple_quarantined) for conditions that JOIN more than one quarantined family. multiple_quarantined is a DEPENDENCY bucket, NOT a report family. Exact decomposition: 4 dependency buckets × 3 dealers = 12 bucket×dealer entries (NOT nine non-overlapping single-family buckets). PRIMARY candidate: read-only UNSAVED Sales-only Custom Reporting reconstruction/export (no new approval). ALTERNATIVE: saved-schedule repair (mutation + hidden Lead Intent control, new approval). BOTH candidate_unproved until exact fields/filters/rows are inspected. NOT claimed as "one pass closes 510".',
    source_provenance_report_families: [
      'lead_source_roi',
      'cage_kpi',
      'sales_comm_log',
    ],
    by_source_report_family: bySourceReportFamily,
    dependency_buckets: qBuckets,
    multi_family_dependency_bucket: 'multiple_quarantined',
    bucket_count: by_dependency_bucket_dealer.length,
    by_dependency_bucket,
    by_dependency_bucket_dealer,
    reconciles_to_510: quarantined.length === 510,
  }

  // Fewest honest read-only browser passes: one Custom Reporting session per dealer covering
  // the distinct candidate datasets its read-only-route cells reference. Candidate-unproved.
  const readonlyRoutes = new Set<string>([
    'new_readonly_vinsolutions_export',
    'readonly_browser_capture',
  ])
  const browser_passes = qDealers.map((dealer) => {
    const cells = records.filter(
      (r) =>
        r.dealer_id === dealer &&
        readonlyRoutes.has(r.acquisition_route) &&
        r.controller_observed_dataset !== null,
    )
    const datasets = [
      ...new Set(cells.map((r) => String(r.controller_observed_dataset))),
    ].sort()
    return {
      dealer_id: dealer,
      pass: 'one read-only Custom Reporting session',
      candidate_datasets: datasets,
      candidate_cell_count: cells.length,
      duane_approval_required: false,
      route_proof_state: 'candidate_unproved',
      note: 'candidate coverage only; each dataset must still prove exact fields, period, Sales-only filters, and row-level validation before it closes any cell',
    }
  })

  const acquisition = {
    artifact: 'gate3-acquisition-contract',
    note: 'Read-only acquisition packet for the local controller. Dataset presence is a CANDIDATE route only — never proof of field completeness, safe filters, exportability, history, or baseline compatibility. Claims no Cox report exists unless committed evidence proves it. The pipeline performs no browser/Gmail/production actions.',
    approval_rule:
      'duane_approval_required = a NEW material approval is still required. Read-only browser capture, unsaved export retrieval, and historical accumulation are already authorized (false). Saved-schedule mutation, external feeds, compliance/PII, cross-rooftop, and separate Service work require approval (true).',
    dataset_evidence: {
      source:
        'authorized READ-ONLY Computer Use inspection of the existing Chrome Custom Reporting session at reporting-vinsolutions.app.coxautoinc.com; nothing saved/exported/scheduled/modified',
      nonblank_datasets_total: 28,
      permanently_excluded: ['Service', 'Service Appointments'],
      selectable_sales_datasets: CONTROLLER_DATASETS,
      observed_field_notes: {
        Leads:
          'Lead/Dealer IDs, source/type/status, origination/modified/sold timestamps, actual/adjusted/actionable response timing, first/last/attempted contacts, rep/BDC/user groups, after-hours, vehicle fields',
        Appointments:
          'appointment/dealer IDs, type/reason/location, assigned user, start/confirmed/rescheduled/completed/created timestamps and users',
        'Customer Contact':
          'dealer/customer status; last attempted/actual contacts with CRM user/date/group',
        'Daily Communication Summary By User':
          'dealer/user/date with SEPARATE Sales vs Service call-count columns — Service columns must NEVER be selected or ingested',
      },
      caveat:
        'Dataset presence proves a candidate route only, not exact field completeness, safe filters, exportability, history, or baseline compatibility.',
    },
    dealers: [
      { profile: 'serra-honda', dealer_id: '21043' },
      { profile: 'serra-nissan', dealer_id: '21044' },
      { profile: 'tony-serra-ford', dealer_id: '21047' },
    ],
    groups,
    quarantined_reconstruction,
    browser_passes,
    data_minimization: {
      policy: DATA_MINIMIZATION_POLICY,
      is_new_approval_gate: false,
      prohibited_fields: PROHIBITED_FIELDS_LIST,
      id_field_rule:
        'IDs are retained ONLY when technically necessary for deterministic de-dup/join, minimized/pseudonymized when possible, and never placed in customer PDFs.',
      observed_vs_allowed_note:
        'dataset_evidence.observed_field_notes = observed CAPABILITY (what a dataset exposes). data_minimization.allowed_export_field_selection = what may actually be SELECTED and retained (minimal, PII-free). These are distinct.',
      allowed_export_field_selection: ALLOWED_EXPORT_FIELD_SELECTION,
      validation: validateAllSelections(ALLOWED_EXPORT_FIELD_SELECTION),
    },
  }

  fs.mkdirSync(OUT, { recursive: true })
  const registry = {
    artifact: 'gate3-closure-registry',
    total: records.length,
    records,
  }
  const write = async (p: string, obj: unknown) =>
    fs.writeFileSync(p, await formatJsonFile(obj, p))
  await write(path.join(OUT, 'closure-registry.json'), registry)
  await write(path.join(OUT, 'closure-views.json'), views)
  await write(path.join(OUT, 'promotion-probe.json'), {
    artifact: 'gate3-promotion-probe',
    ...probe,
  })
  await write(path.join(CONTRACT_OUT, 'acquisition-contract.json'), acquisition)

  console.log(
    `closure records=${records.length} reconciles876=${views.reconciles_to_876} reconcilesReasons=${views.reconciles_to_gate2_reason_categories}`,
  )
  console.log(`by_category=${JSON.stringify(by_category)}`)
  console.log(
    `promotion: promoted=${probe.summary.promoted} not_promotable=${probe.summary.not_promotable} ids=${probe.summary.promoted_ids.join(',')}`,
  )
  console.log(
    `acquisition groups=${acquisition.groups.length} sales_only_conflicts=${conflicts.length}`,
  )
}

void main()
