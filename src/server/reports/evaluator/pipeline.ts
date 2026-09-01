/**
 * Gate 3 — parameterized, deterministic pipeline spine.
 *
 * One command over ALL 885 cells:
 *   ingest → validate → transform → calculate → baseline → rank → cross-analyze →
 *   synthesize → render-preflight → verify
 *
 * It generates machine-readable INTERNAL preflight artifacts for the 30 evaluated + 855
 * unresolved cells and exposes exact counts. It REFUSES 'customer_final' mode unless
 * evaluated_count === 885 — it never renders or labels a partial report as the customer
 * deliverable, and never replaces unresolved counts with placeholders. Pure orchestration
 * over the Gate 2 spine + Gate 3 closure/probe; no I/O here (the script does the writing).
 */
import fs from 'node:fs'
import path from 'node:path'
import { assembleGate2Inputs } from './build-from-fresh'
import { buildSpine } from './spine'
import { buildClosureRecord, categorize, loadCatalogDetail } from './closure'
import { probeConditions } from './promotion-probe'
import type { ClosureRecord } from './closure'
import type { EvalRow } from './types'

export const REQUIRED_CELLS = 885
export const REQUIRED_CELLS_PER_DEALER = 295

// The only governed profile↔dealer pairs. Scope requests must match exactly.
export const GOVERNED_PAIRS: Record<string, string> = {
  'serra-honda': '21043',
  'serra-nissan': '21044',
  'tony-serra-ford': '21047',
}

export type PipelineMode = 'preflight' | 'customer_final'
export type ScopeMode = 'portfolio' | 'dealer'

type Period = { start: string; end: string; timezone: string }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Fail-closed scope resolution. Dealer scope requires BOTH a matching governed pair. */
function resolveScope(
  profile: string | null | undefined,
  dealerId: string | null | undefined,
):
  | {
      ok: true
      mode: ScopeMode
      dealer_ids: Array<string>
      profile: string | null
      dealer_id: string | null
    }
  | { ok: false; error: string } {
  const hasP = typeof profile === 'string' && profile.length > 0
  const hasD = typeof dealerId === 'string' && dealerId.length > 0
  if (!hasP && !hasD) {
    return {
      ok: true,
      mode: 'portfolio',
      dealer_ids: Object.values(GOVERNED_PAIRS),
      profile: null,
      dealer_id: null,
    }
  }
  if (hasP !== hasD) {
    return {
      ok: false,
      error: `dealer scope requires BOTH profile and dealerId (got profile=${profile ?? 'null'}, dealerId=${dealerId ?? 'null'})`,
    }
  }
  const governed = (GOVERNED_PAIRS as Record<string, string | undefined>)[
    profile as string
  ]
  if (governed === undefined || governed !== dealerId) {
    return {
      ok: false,
      error: `unknown/mismatched governed pair: profile=${profile as string} dealerId=${dealerId as string} (expected ${profile as string}->${governed ?? 'n/a'})`,
    }
  }
  return {
    ok: true,
    mode: 'dealer',
    dealer_ids: [dealerId],
    profile: profile as string,
    dealer_id: dealerId,
  }
}

/** Fail-closed period control. Proves agreement across selected inputs; matches an option. */
function resolvePeriod(
  selected: Array<{ reporting_period: Period }>,
  requested: Period | undefined,
): { ok: true; period: Period } | { ok: false; error: string } {
  if (selected.length === 0)
    return { ok: false, error: 'no selected inputs to prove a period' }
  const first = selected[0].reporting_period
  for (const s of selected) {
    if (
      s.reporting_period.start !== first.start ||
      s.reporting_period.end !== first.end ||
      s.reporting_period.timezone !== first.timezone
    ) {
      return {
        ok: false,
        error: 'mixed source periods across selected accepted inputs',
      }
    }
  }
  if (requested !== undefined) {
    if (
      !ISO_DATE.test(requested.start) ||
      !ISO_DATE.test(requested.end) ||
      requested.timezone.length === 0
    ) {
      return {
        ok: false,
        error: `malformed requested period ${JSON.stringify(requested)}`,
      }
    }
    if (
      requested.start !== first.start ||
      requested.end !== first.end ||
      requested.timezone !== first.timezone
    ) {
      return {
        ok: false,
        error: `requested period ${requested.start}..${requested.end} ${requested.timezone} != proved input period ${first.start}..${first.end} ${first.timezone}`,
      }
    }
  }
  return { ok: true, period: first }
}

export type StageResult = { name: string; ok: boolean; note: string }

export type ClusterSynthesis = {
  cluster: string
  evaluated_metric_ids: Array<string>
  evaluated_cells: number
  dealers: Array<string>
}

export type PipelinePreflight = {
  artifact: 'gate3-pipeline-preflight'
  mode: PipelineMode
  scope_mode: ScopeMode
  period: { start: string; end: string; timezone: string }
  scope: {
    profile: string | null
    dealer_id: string | null
    dealer_ids: Array<string>
  }
  required_cells: number
  cells: number
  evaluated: number
  unresolved: number
  evaluated_ids: Array<string>
  unresolved_by_category: Record<string, number>
  cluster_synthesis: Array<ClusterSynthesis>
  customer_final_allowed: boolean
  customer_final_refusal_reason: string | null
  is_customer_deliverable: false
  note: string
}

export type PipelineResult = {
  mode: PipelineMode
  ok: boolean
  stages: Array<StageResult>
  preflight: PipelinePreflight | null
  refusal_reason: string | null
}

function clusterSynthesis(rows: Array<EvalRow>): Array<ClusterSynthesis> {
  const byCluster = new Map<
    string,
    { ids: Set<string>; cells: number; dealers: Set<string> }
  >()
  for (const r of rows) {
    if (r.status !== 'evaluated') continue
    const g = byCluster.get(r.cluster) ?? {
      ids: new Set<string>(),
      cells: 0,
      dealers: new Set<string>(),
    }
    g.ids.add(r.metric_id)
    g.cells += 1
    g.dealers.add(r.dealer_id)
    byCluster.set(r.cluster, g)
  }
  return [...byCluster.entries()].map(([cluster, g]) => ({
    cluster,
    evaluated_metric_ids: [...g.ids].sort(),
    evaluated_cells: g.cells,
    dealers: [...g.dealers].sort(),
  }))
}

export function runPipeline(opts: {
  freshDir: string
  repoRoot: string
  mode: PipelineMode
  profile?: string | null
  dealerId?: string | null
  period?: { start: string; end: string; timezone: string }
}): PipelineResult {
  const stages: Array<StageResult> = []
  const record = (name: string, ok: boolean, note: string) =>
    stages.push({ name, ok, note })

  // 1. ingest — read ONLY accepted held bytes (allowlist + sha in assembleGate2Inputs).
  const inputs = assembleGate2Inputs({
    freshDir: opts.freshDir,
    repoRoot: opts.repoRoot,
  })
  record(
    'ingest',
    true,
    `assembled ${inputs.dealers.length} dealers from accepted held families (allowlist+sha)`,
  )

  // 1a. scope — fail-closed BEFORE calculation (labels are not trusted).
  const scope = resolveScope(opts.profile, opts.dealerId)
  if (!scope.ok) {
    record('scope', false, scope.error)
    return {
      mode: opts.mode,
      ok: false,
      stages,
      preflight: null,
      refusal_reason: scope.error,
    }
  }
  const selectedDealers = inputs.dealers.filter((d) =>
    scope.dealer_ids.includes(d.dealer_id),
  )
  if (selectedDealers.length !== scope.dealer_ids.length) {
    const err = `selected dealers not all present in accepted inputs (wanted ${scope.dealer_ids.join(',')})`
    record('scope', false, err)
    return {
      mode: opts.mode,
      ok: false,
      stages,
      preflight: null,
      refusal_reason: err,
    }
  }
  record(
    'scope',
    true,
    `scope=${scope.mode} dealers=${scope.dealer_ids.join(',')}`,
  )

  // 1b. period — fail-closed; derived from validated inputs, never copied from raw options.
  const per = resolvePeriod(selectedDealers, opts.period)
  if (!per.ok) {
    record('period', false, per.error)
    return {
      mode: opts.mode,
      ok: false,
      stages,
      preflight: null,
      refusal_reason: per.error,
    }
  }
  const provedPeriod = per.period
  record(
    'period',
    true,
    `period ${provedPeriod.start}..${provedPeriod.end} ${provedPeriod.timezone} proved from selected inputs`,
  )

  // 2-6. validate → transform → calculate → baseline → rank (all inside buildSpine, which
  //      applies the strict predicate + semantic validator to every candidate). Scoped to
  //      the selected dealers only (dealer scope = 295 cells; portfolio = 885).
  const spine = buildSpine({ ...inputs, dealers: selectedDealers })
  const requiredCells = REQUIRED_CELLS_PER_DEALER * selectedDealers.length
  record(
    'validate',
    true,
    'strict predicate + semantic validator applied to every candidate',
  )
  record(
    'transform',
    true,
    'per-family readers normalized accepted bytes (Sales-only, missing!=zero)',
  )
  record(
    'calculate',
    spine.summary.evaluated > 0,
    `computed ${spine.summary.evaluated} evaluated values`,
  )
  record(
    'baseline',
    true,
    'operational-target baselines bound; unverified benchmarks stay null/unusable',
  )
  record('rank', true, 'cross-rooftop rank recomputed per evaluated metric')

  // 7. cross-analyze — the 855-cell closure registry (never promotes).
  const details = loadCatalogDetail(
    JSON.parse(
      fs.readFileSync(
        path.join(
          opts.repoRoot,
          'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
        ),
        'utf8',
      ),
    ),
  )
  const detailById = new Map(details.map((d) => [d.metric_id, d]))
  const closure: Array<ClosureRecord> = spine.rows
    .filter((r) => r.status === 'unresolved')
    .map((r) => buildClosureRecord(r, detailById.get(r.metric_id)!))
  record(
    'cross-analyze',
    closure.length === spine.summary.unresolved,
    `closure registry for ${closure.length} unresolved cells`,
  )

  // 8. synthesize — cluster synthesis over the evaluated cells (internal).
  const clusters = clusterSynthesis(spine.rows)
  record(
    'synthesize',
    true,
    `cluster synthesis over ${clusters.length} clusters`,
  )

  // 9. render-preflight — INTERNAL artifact only (never a customer PDF).
  const unresolvedByCategory: Record<string, number> = {}
  for (const r of spine.rows) {
    if (r.status !== 'unresolved') continue
    const cat = categorize(r.unresolved_reason ?? '')
    unresolvedByCategory[cat] = (unresolvedByCategory[cat] ?? 0) + 1
  }
  // Customer-final is DYNAMIC but equally strict: portfolio needs 885/885, dealer scope 295/295.
  const customerAllowed = spine.summary.evaluated === requiredCells
  const refusal = customerAllowed
    ? null
    : `customer-final PDF refused: evaluated_count=${spine.summary.evaluated} != required ${requiredCells} (${scope.mode} scope); ${spine.summary.unresolved} cells unresolved`
  const preflight: PipelinePreflight = {
    artifact: 'gate3-pipeline-preflight',
    mode: opts.mode,
    scope_mode: scope.mode,
    // period + scope derived from VALIDATED selected inputs, never copied from raw options.
    period: provedPeriod,
    scope: {
      profile: scope.profile,
      dealer_id: scope.dealer_id,
      dealer_ids: scope.dealer_ids,
    },
    required_cells: requiredCells,
    cells: spine.rows.length,
    evaluated: spine.summary.evaluated,
    unresolved: spine.summary.unresolved,
    evaluated_ids: spine.summary.evaluated_ids,
    unresolved_by_category: unresolvedByCategory,
    cluster_synthesis: clusters,
    customer_final_allowed: customerAllowed,
    customer_final_refusal_reason: refusal,
    is_customer_deliverable: false,
    note: 'INTERNAL preflight. Technical gaps stay in internal evidence; customer PDFs are produced only after ALL cells in scope are evaluated (portfolio 885/885 or dealer 295/295); the orchestration still requires all three dealer PDFs + portfolio reconciliation.',
  }
  record(
    'render-preflight',
    true,
    `internal preflight for ${preflight.evaluated} evaluated + ${preflight.unresolved} unresolved`,
  )

  // 10. verify — enforce the no-partial-final gate.
  void probeConditions // probe is exercised by its own generator/test; kept in the module graph
  if (opts.mode === 'customer_final' && !customerAllowed) {
    record('verify', false, refusal ?? 'customer-final refused')
    return {
      mode: opts.mode,
      ok: false,
      stages,
      preflight: null,
      refusal_reason: refusal,
    }
  }
  record(
    'verify',
    spine.rows.length === requiredCells,
    `verified ${spine.rows.length}/${requiredCells} cells (${scope.mode}); customer_final_allowed=${customerAllowed}`,
  )
  return { mode: opts.mode, ok: true, stages, preflight, refusal_reason: null }
}
