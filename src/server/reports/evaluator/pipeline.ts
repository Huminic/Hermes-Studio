/**
 * Gate 3 — parameterized, deterministic pipeline spine.
 *
 * One command over ALL 885 cells:
 *   ingest → validate → transform → calculate → baseline → rank → cross-analyze →
 *   synthesize → render-preflight → verify
 *
 * It generates machine-readable INTERNAL preflight artifacts for the 9 evaluated + 876
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

export type PipelineMode = 'preflight' | 'customer_final'

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
  period: { start: string; end: string; timezone: string }
  scope: { profile: string | null; dealer_id: string | null }
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

  // 2-6. validate → transform → calculate → baseline → rank (all inside buildSpine, which
  //      applies the strict predicate + semantic validator to every candidate).
  const spine = buildSpine(inputs)
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

  // 7. cross-analyze — the 876-cell closure registry (never promotes).
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
  const period = opts.period ?? inputs.dealers[0].reporting_period
  const customerAllowed = spine.summary.evaluated === REQUIRED_CELLS
  const refusal = customerAllowed
    ? null
    : `customer-final PDF refused: evaluated_count=${spine.summary.evaluated} != required ${REQUIRED_CELLS}; ${spine.summary.unresolved} cells unresolved`
  const preflight: PipelinePreflight = {
    artifact: 'gate3-pipeline-preflight',
    mode: opts.mode,
    period,
    scope: { profile: opts.profile ?? null, dealer_id: opts.dealerId ?? null },
    cells: spine.rows.length,
    evaluated: spine.summary.evaluated,
    unresolved: spine.summary.unresolved,
    evaluated_ids: spine.summary.evaluated_ids,
    unresolved_by_category: unresolvedByCategory,
    cluster_synthesis: clusters,
    customer_final_allowed: customerAllowed,
    customer_final_refusal_reason: refusal,
    is_customer_deliverable: false,
    note: 'INTERNAL preflight. Technical gaps stay in internal evidence; customer PDFs are produced only after all 885 cells are evaluated.',
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
    spine.rows.length === REQUIRED_CELLS,
    `verified ${spine.rows.length} cells; customer_final_allowed=${customerAllowed}`,
  )
  return { mode: opts.mode, ok: true, stages, preflight, refusal_reason: null }
}
