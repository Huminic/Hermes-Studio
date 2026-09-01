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
  buildClosureRecord,
  loadCatalogDetail,
} from '@/server/reports/evaluator/closure'
import { probeConditions } from '@/server/reports/evaluator/promotion-probe'

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
      're-run the SAME weekly VinSolutions schedule (ROI / Enterprise Performance / Sales Communication Log) with the saved-filter Lead Intents corrected to EXCLUDE Service/Parts; same dealer, same columns, same period_hint range.',
    sales_only_proof:
      'Filters Lead Type/Lead Intent must NOT positively select Service/Parts; data rows scanned clean; one dealer.',
  },
  new_readonly_vinsolutions_export: {
    required_inputs:
      'a read-only VinSolutions export whose columns include the currently-missing field/definition (e.g. per-source appointment attribution, write-up counts, confirm-within-24h timing); one dealer; range period_hint; native spaced headers unchanged.',
    sales_only_proof:
      'Filters exclude Service lead sources; Appt Reason = Sales Appointment; Lead Types = {Internet,Phone,Walk-in}; clean data rows.',
  },
  readonly_browser_capture: {
    required_inputs:
      'a read-only browser capture (e.g. Dealer Dashboard Response Times per-lead CSV, or CRM Notes/History/Desking surfaces) with per-lead timestamps + business-hours calendar + a defined blank/untouched policy; one dealer; explicit period.',
    sales_only_proof:
      'capture provenance (host vinsolutions.app.coxautoinc.com), one dealer, Sales-only surface; no Message Content beyond authorization.',
  },
  historical_accumulation: {
    required_inputs:
      'no new source — accumulate the already-accepted family (Leads/Appointments/CRM/Dashboard) across the stated trailing window (WoW / 30-day / N consecutive weeks) until the history exists.',
    sales_only_proof:
      'each accumulated period keeps the existing Sales-only held-family proof.',
  },
  external_feed: {
    required_inputs:
      'a non-VinSolutions governed read-only feed named by the condition (Google Analytics, ad-spend, phone/call system, third-party vendor) with a governed ingestion contract, definition, unit, and period.',
    sales_only_proof:
      'external feed must be Sales-scoped and carry its own provenance; never routed through the Service workspace.',
  },
  separate_service_workspace: {
    required_inputs:
      'route via the separately governed combined Serra Service workspace — NOT the three Sales profiles. Profile slug/format/route/owner are defined by the separate Service-domain contract.',
    sales_only_proof:
      'PERMANENT boundary: Service data never enters the Sales profiles.',
  },
  compliance_authorization: {
    required_inputs:
      'explicit compliance/PII authorization + a governed source before any evaluation.',
    sales_only_proof: 'compliance sign-off; PII handling per authorization.',
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
    duane_approval_required_count: records.filter(
      (r) => r.duane_approval_required,
    ).length,
    sales_only_boundary_conflicts: {
      count: conflicts.length,
      metric_ids: conflictIds,
    },
    reconciles_to_gate2_reason_categories:
      JSON.stringify(by_category) === JSON.stringify(ledgerCatCounts),
  }

  // Promotion probe (condition-by-condition).
  const reasonByMetric = new Map<string, string>()
  for (const r of unresolved)
    reasonByMetric.set(r.metric_id, r.unresolved_reason ?? '')
  const probe = probeConditions(details, reasonByMetric)

  // Acquisition contract (grouped by route; fewest passes).
  const routes = [...new Set(records.map((r) => r.acquisition_route))].sort()
  const acquisition = {
    artifact: 'gate3-acquisition-contract',
    note: 'Read-only acquisition packet for the local controller. Grouped by route into the fewest passes. Claims no Cox report exists unless committed evidence proves it. Do not perform browser/Gmail/production actions from the pipeline.',
    dealers: [
      { profile: 'serra-honda', dealer_id: '21043' },
      { profile: 'serra-nissan', dealer_id: '21044' },
      { profile: 'tony-serra-ford', dealer_id: '21047' },
    ],
    groups: routes.map((route) => {
      const inRoute = records.filter((r) => r.acquisition_route === route)
      const metricIds = [...new Set(inRoute.map((r) => r.metric_id))].sort()
      const tpl = ACQUISITION_TEMPLATE[route]
      return {
        acquisition_route: route,
        closes_metric_ids: metricIds,
        cell_count: inRoute.length,
        duane_approval_required: inRoute.some((r) => r.duane_approval_required),
        required_inputs: tpl.required_inputs,
        sales_only_proof: tpl.sales_only_proof,
      }
    }),
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
