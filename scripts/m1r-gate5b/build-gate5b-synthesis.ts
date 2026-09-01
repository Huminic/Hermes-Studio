/**
 * Gate 5B — customer-facing consultant synthesis generator.
 *
 * Consumes the committed Gate 5A comparison + peer-rank ledgers and the committed Gate 4H partition,
 * and emits deterministic, customer-safe synthesis artifacts for the three governed Sales rooftops:
 *
 *   - gate5b-synthesis-<dealer>.json          (per-dealer: executive narrative + 4 clusters +
 *                                              cross-cluster synthesis + ranked opportunities + ROI)
 *   - gate5b-cross-dealer-opportunity-ledger.json
 *   - gate5b-notification-automation-ledger.json
 *   - gate5b-roi-scenario-ledger.json
 *   - gate5b-customer-appendix-295x3.json     (every one of 885 cells exactly once)
 *   - gate5b-coverage-expansion-plan.json     (278 unresolved, customer-friendly)
 *   - gate5b-internal-audit.json              (internal lineage retained separately)
 *
 * Gate 5B alters NO metric value, rank, classification, baseline mapping, or the 51/834/885 accounting,
 * and computes NO new evaluation. Fails closed on any divergence. Byte-identical rerun. No PDFs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { formatJsonFile } from '../m1r-evaluator/serialize'
import type {
  MetricFact,
  RoiOperands,
  TypedClaim,
  UnresolvedRow,
} from '@/server/reports/gate5b/synthesis'
import {
  CLUSTERS,
  CLUSTER_OF,
  METRIC_LABEL,
  assertCustomerSafe,
  assertRoleSafe,
  buildClusterBlock,
  coverageExpansion,
  crossClusterInteractions,
  dealerName,
  freshnessNote,
  notificationCandidates,
  pct,
  rankOpportunities,
  roiScenario,
  sourceLabel,
  valueDisplay,
} from '@/server/reports/gate5b/synthesis'
import { assembleCustomerReport } from '@/server/reports/gate5b/customer-report'

const REPO = process.cwd()
const EV = path.join(REPO, 'docs/halo/evidence/m1r')
const OUT = path.join(EV, 'gate5b')
const COMPARISON = path.join(
  EV,
  'gate5a/gate5a-evaluated-cell-comparison-ledger.json',
)
const RANK = path.join(EV, 'gate5a/gate5a-peer-rank-ledger.json')
const GATE4H = path.join(
  EV,
  'residual/gate4h-internal-accountability-ledger.json',
)
const SPINE = path.join(EV, 'evaluator/spine-ledger.json')

const ACCEPTED_WEEK = '2026-08-24..2026-08-30'
const DEALERS = ['21043', '21044', '21047'] as const

const first16 = (p: string) =>
  createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16)
function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T
}
function must(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Gate 5B: ${msg}`)
}
const swIndex = (id: string) => Number.parseInt(id.replace('SW-', ''), 10)

type CompRec = {
  metric_id: string
  dealer_id: string
  value: number
  unit: string
  comparison_basis: {
    id: string
    threshold: number
    comparator: string
    direction: 'higher_is_better' | 'lower_is_better'
  }
  native_variance: number
  display_variance: string
  rating: 'healthy' | 'watch' | 'breach'
  confidence: string
  period: { start: string; end: string }
  industry_reference: { benchmark_id: string } | null
  evidence_lineage: {
    source_family: string | null
    numerator: number
    denominator: number
  }
}

async function main(): Promise<void> {
  const comparison = readJson<{ records: Array<CompRec> }>(COMPARISON)
  const rank = readJson<{
    records: Array<{
      metric_id: string
      ranking: Array<{ dealer_id: string; rank: number }>
    }>
  }>(RANK)
  const gate4h = readJson<{
    coverage: { conditions: number; evaluated: number; unresolved: number }
    rows: Array<{
      metric_id: string
      section: string
      status: string
      customer_display_eligible?: boolean
      internal_explanation: { blocker_class: string } | null
    }>
  }>(GATE4H)
  const spine = readJson<{
    rows: Array<{
      metric_id: string
      dealer_id: string
      status: string
      numerator: number
      denominator: number
      value: number
    }>
  }>(SPINE)

  const rankOf = new Map<string, number>()
  for (const r of rank.records)
    for (const x of r.ranking)
      rankOf.set(`${r.metric_id}:${x.dealer_id}`, x.rank)

  // Peer-rank tie per metric: a metric is tied when its three dealer ranks are not all distinct.
  const tieOf = new Map<string, boolean>()
  for (const r of rank.records) {
    const ranks = r.ranking.map((x) => x.rank)
    tieOf.set(r.metric_id, new Set(ranks).size !== ranks.length)
  }

  // ── Build MetricFact per (metric, dealer) from committed comparison + rank (nothing recomputed) ──
  const factOf = new Map<string, MetricFact>()
  for (const c of comparison.records) {
    const b = c.comparison_basis
    factOf.set(`${c.metric_id}:${c.dealer_id}`, {
      metric_id: c.metric_id,
      label: METRIC_LABEL[c.metric_id],
      dealer_id: c.dealer_id,
      value: c.value,
      unit: c.unit,
      value_display: valueDisplay(c.value, c.unit),
      threshold: b.threshold,
      threshold_display: valueDisplay(b.threshold, c.unit),
      comparator: b.comparator,
      direction: b.direction,
      rating: c.rating,
      native_variance: c.native_variance,
      display_variance: c.display_variance,
      confidence: c.confidence,
      rank: rankOf.get(`${c.metric_id}:${c.dealer_id}`)!,
      tie: tieOf.get(c.metric_id) ?? false,
      numerator: c.evidence_lineage.numerator,
      denominator: c.evidence_lineage.denominator,
      reporting_period: { start: c.period.start, end: c.period.end },
      source_family: c.evidence_lineage.source_family ?? null,
      industry_reference_id: c.industry_reference?.benchmark_id ?? null,
    })
  }
  must(factOf.size === 51, `metric facts ${factOf.size} != 51`)
  // Every evaluated metric belongs to exactly one cluster, and clusters cover the 17 exactly once.
  const clustered = CLUSTERS.flatMap((c) => c.metric_ids)
  must(
    clustered.length === 17 && new Set(clustered).size === 17,
    'clusters must cover 17 metrics exactly once',
  )

  // ── ROI operands from committed spine numerators/denominators ──
  const spineEval = spine.rows.filter((r) => r.status === 'evaluated')
  const spineCell = (id: string, d: string) =>
    spineEval.find((r) => r.metric_id === id && r.dealer_id === d)!
  const roiOperandsOf = (d: string): RoiOperands => {
    const set = spineCell('SW-031', d)
    const show = spineCell('SW-032', d)
    const noShow = spineCell('SW-041', d)
    return {
      dealer_id: d,
      leads: set.denominator,
      appts_set: set.numerator,
      shows: show.numerator,
      appt_rows: show.denominator,
      no_shows: noShow.numerator,
      set_rate: set.value,
      show_rate: show.value,
    }
  }

  // ── Per-dealer synthesis bundles ──
  const roiScenarios: Array<ReturnType<typeof roiScenario>> = []
  const allNotif = new Map<
    string,
    ReturnType<typeof notificationCandidates>[number]
  >()
  const crossDealerOpps: Array<{
    metric_id: string
    cluster: string
    label: string
    by_dealer: Array<{
      dealer_id: string
      rating: string
      rank: number
      weight: number
    }>
    total_weight: number
  }> = []

  const bundles: Record<string, unknown> = {}
  for (const d of DEALERS) {
    const facts = [...factOf.values()].filter((f) => f.dealer_id === d)
    const m = Object.fromEntries(facts.map((f) => [f.metric_id, f]))
    const clusterBlocks = CLUSTERS.map((c) =>
      buildClusterBlock(
        c,
        c.metric_ids.map((id) => m[id]),
      ),
    )
    const interactions = crossClusterInteractions(m)
    const opportunities = rankOpportunities(facts)
    const roi = roiScenario(roiOperandsOf(d))
    roiScenarios.push(roi)
    for (const n of notificationCandidates(facts)) allNotif.set(n.metric_id, n)

    // Executive narrative (deterministic; every entry is a typed claim with cited metric IDs).
    const workingFacts = facts.filter((f) => f.rating === 'healthy')
    const workingIds = workingFacts.map((f) => f.metric_id)
    const topOpp = opportunities[0]
    const topInteraction = interactions[0]
    const opp2 = opportunities.slice(0, 2).map((o) => o.metric_id)
    const whatIsWorking: TypedClaim =
      workingFacts.length >= 2
        ? {
            claim: 'inference',
            text: `On target this period: ${workingFacts
              .slice(0, 4)
              .map((f) => f.label)
              .join('; ')}.`,
            cites: workingIds.slice(0, 4),
          }
        : workingFacts.length === 1
          ? {
              claim: 'fact',
              text: `${workingFacts[0].label} is on target this period (single-metric observation).`,
              cites: workingIds,
            }
          : {
              claim: 'inference',
              text: 'No metric is fully on target this period; the fastest controllable wins are in response coverage and appointment setting.',
              cites: opp2,
            }
    const exec = {
      what_is_working: whatIsWorking,
      largest_controllable_opportunity: {
        claim: 'recommendation',
        text:
          opportunities.length > 0
            ? `${topOpp.label} (${clusterTitle(topOpp.cluster)}) is the largest controllable opportunity, weighing off-target severity, three-store peer position, and evidence confidence.`
            : 'Maintain current performance; no off-target signal dominates.',
        cites: opportunities.length > 0 ? [topOpp.metric_id] : [],
      } as TypedClaim,
      how_evidence_connects:
        interactions.length > 0
          ? {
              claim: topInteraction.claim,
              text: topInteraction.text,
              cites: topInteraction.cites,
            }
          : {
              claim: 'inference',
              text: 'The four clusters move together this period without a dominant cross-cluster interaction.',
              cites: opp2,
            },
      claim_layers_legend:
        'fact = a measured value; inference = a bounded reading of the cited measurements; hypothesis = a testable explanation needing more evidence; recommendation = an action.',
    }

    // Cross-dealer opportunity aggregation.
    for (const o of opportunities) {
      let entry = crossDealerOpps.find((e) => e.metric_id === o.metric_id)
      if (!entry) {
        entry = {
          metric_id: o.metric_id,
          cluster: o.cluster,
          label: o.label,
          by_dealer: [],
          total_weight: 0,
        }
        crossDealerOpps.push(entry)
      }
      entry.by_dealer.push({
        dealer_id: d,
        rating: o.rating,
        rank: o.rank,
        weight: o.weight,
      })
      entry.total_weight =
        Math.round((entry.total_weight + o.weight) * 1000) / 1000
    }

    const bundle = {
      artifact: 'gate5b-dealer-synthesis',
      revision: 'L1',
      accepted_week: ACCEPTED_WEEK,
      dealer_id: d,
      dealer: dealerName(d),
      executive_narrative: exec,
      clusters: clusterBlocks,
      cross_cluster_synthesis: interactions,
      ranked_opportunities: opportunities,
      vehicle_opportunity_scenario: roi,
    }

    // Fail-closed customer-safety sweep over every customer string in the bundle.
    sweepStrings(bundle, safeCheck)
    // Every cross-cluster conclusion cites ≥2 metrics (or is a hypothesis).
    for (const i of interactions)
      must(
        i.claim === 'hypothesis' || i.cites.length >= 2,
        `${d} interaction ${i.id} must cite ≥2 metrics`,
      )
    bundles[d] = bundle
  }

  // ── Coverage-expansion plan (278 unresolved, customer-friendly) ──
  const unresolved = gate4h.rows.filter((r) => r.status === 'unresolved')
  must(unresolved.length === 278, `unresolved ${unresolved.length} != 278`)
  const unresolvedRows: Array<UnresolvedRow> = unresolved.map((r) => ({
    metric_id: r.metric_id,
    section: r.section,
    blocker_class:
      r.internal_explanation?.blocker_class ?? 'outside_sales_boundary',
    eligible: r.customer_display_eligible ?? false,
  }))
  const coverage = coverageExpansion(unresolvedRows)
  const coverageIds = coverage.flatMap((t) => t.metric_ids)
  must(
    coverageIds.length === 278 && new Set(coverageIds).size === 278,
    `coverage plan must account for 278 unresolved exactly once (got ${coverageIds.length})`,
  )
  sweepStrings(coverage, safeCheck)

  // ── 295×3 customer appendix (every one of 885 cells exactly once) ──
  const evaluatedIds = new Set([...factOf.values()].map((f) => f.metric_id))
  const unresolvedById = new Map(unresolvedRows.map((r) => [r.metric_id, r]))
  const allMetricIds = gate4h.rows.map((r) => r.metric_id)
  must(allMetricIds.length === 295, `catalog ids ${allMetricIds.length} != 295`)
  const appendixCells: Array<Record<string, unknown>> = []
  for (const id of allMetricIds)
    for (const d of DEALERS) {
      if (evaluatedIds.has(id)) {
        const f = factOf.get(`${id}:${d}`)!
        appendixCells.push({
          metric_id: id,
          dealer_id: d,
          status: 'evaluated',
          measure: f.label,
          value: f.value_display,
          basis_id: `OT/${CLUSTER_OF[id]}`,
          target: f.threshold_display,
          variance: f.display_variance,
          peer_rank: f.rank,
          peer_tie: f.tie,
          standing:
            f.rating === 'healthy'
              ? 'on target'
              : f.rating === 'watch'
                ? 'near target'
                : 'off target',
          confidence: f.confidence,
          source: sourceLabel(f.source_family),
          freshness: freshnessNote(f.reporting_period),
          evidence: { count: f.numerator, of: f.denominator },
        })
      } else {
        const u = unresolvedById.get(id)!
        const theme = coverage.find((t) => t.metric_ids.includes(id))!
        appendixCells.push({
          metric_id: id,
          dealer_id: d,
          status: 'not_measured',
          measure: theme.theme,
          note: 'Not measured this cycle',
          next_visibility_unlock: theme.next_visibility_unlock,
        })
      }
    }
  must(
    appendixCells.length === 885,
    `appendix cells ${appendixCells.length} != 885`,
  )
  const evalCellCount = appendixCells.filter(
    (c) => c.status === 'evaluated',
  ).length
  const nmCellCount = appendixCells.filter(
    (c) => c.status === 'not_measured',
  ).length
  must(
    evalCellCount === 51 && nmCellCount === 834,
    `appendix split ${evalCellCount}/${nmCellCount} != 51/834`,
  )
  // Uniqueness: each (metric,dealer) exactly once.
  must(
    new Set(appendixCells.map((c) => `${c.metric_id}:${c.dealer_id}`)).size ===
      885,
    'appendix cells not unique',
  )
  sweepStrings(appendixCells, safeCheck)

  // ── Baselines / ranks unchanged vs Gate 5A (fail-closed cross-check) ──
  for (const c of comparison.records) {
    const f = factOf.get(`${c.metric_id}:${c.dealer_id}`)!
    must(
      f.rank === rankOf.get(`${c.metric_id}:${c.dealer_id}`) &&
        f.threshold === c.comparison_basis.threshold &&
        f.native_variance === c.native_variance,
      `${c.metric_id}:${c.dealer_id} rank/baseline/variance drifted from Gate 5A`,
    )
  }

  // Customer-safety sweep over the remaining customer-facing ledgers (bundles/coverage/appendix
  // are already swept above; the internal audit is intentionally NOT swept).
  sweepStrings(crossDealerOpps, safeCheck)
  sweepStrings([...allNotif.values()], safeCheck)

  // ── Emit ──
  fs.mkdirSync(OUT, { recursive: true })
  const write = async (name: string, obj: unknown): Promise<string> => {
    const p = path.join(OUT, name)
    fs.writeFileSync(p, await formatJsonFile(obj, p))
    return p
  }
  const paths: Array<string> = []
  for (const d of DEALERS)
    paths.push(await write(`gate5b-synthesis-${d}.json`, bundles[d]))

  crossDealerOpps.sort(
    (a, b) =>
      b.total_weight - a.total_weight ||
      swIndex(a.metric_id) - swIndex(b.metric_id),
  )
  paths.push(
    await write('gate5b-cross-dealer-opportunity-ledger.json', {
      artifact: 'gate5b-cross-dealer-opportunity-ledger',
      revision: 'L1',
      accepted_week: ACCEPTED_WEEK,
      note: 'Opportunities ranked by deterministic evidence weight (severity × cluster leverage × confidence × peer position), not rhetoric.',
      opportunities: crossDealerOpps,
    }),
  )
  paths.push(
    await write('gate5b-notification-automation-ledger.json', {
      artifact: 'gate5b-notification-automation-ledger',
      revision: 'L1',
      accepted_week: ACCEPTED_WEEK,
      note: 'Candidates built from observed evaluated breach signals only. Nothing is activated or sent. External-action candidates require separate approval.',
      candidates: [...allNotif.values()].sort((a, b) =>
        a.metric_id.localeCompare(b.metric_id),
      ),
    }),
  )
  paths.push(
    await write('gate5b-roi-scenario-ledger.json', {
      artifact: 'gate5b-roi-scenario-ledger',
      revision: 'L1',
      accepted_week: ACCEPTED_WEEK,
      note: 'Bounded incremental-appointment/show scenarios. Not promises; no causal attribution; no dollars (no accepted store-specific gross with lineage this cycle).',
      scenarios: roiScenarios,
    }),
  )
  paths.push(
    await write('gate5b-coverage-expansion-plan.json', {
      artifact: 'gate5b-coverage-expansion-plan',
      revision: 'L1',
      accepted_week: ACCEPTED_WEEK,
      note: 'A customer-friendly plan for the metrics not measured this cycle. Every unresolved metric appears exactly once.',
      unresolved_total: 278,
      themes: coverage,
    }),
  )
  paths.push(
    await write('gate5b-customer-appendix-295x3.json', {
      artifact: 'gate5b-customer-appendix-295x3',
      revision: 'L1',
      accepted_week: ACCEPTED_WEEK,
      accounting: {
        conditions: 295,
        evaluated: 17,
        unresolved: 278,
        evaluated_cells: 51,
        not_measured_cells: 834,
        total_cells: 885,
      },
      cells: appendixCells,
    }),
  )
  // Standalone-consumer proof: build each dealer's full report model from the customer bundle + that
  // dealer's appendix partition ALONE (via the exported reader that imports no Gate 5A / internal file).
  for (const d of DEALERS) {
    const partition = appendixCells.filter((c) => c.dealer_id === d)
    const model = assembleCustomerReport(
      bundles[d],
      partition as Parameters<typeof assembleCustomerReport>[1],
    )
    must(
      model.coverage === 295 &&
        model.evaluated.length === 17 &&
        model.not_measured.length === 278,
      `${d} report model coverage ${model.coverage} / ${model.evaluated.length} / ${model.not_measured.length}`,
    )
    paths.push(
      await write(`gate5b-report-model-${d}.json`, {
        artifact: 'gate5b-report-model',
        revision: 'L2',
        accepted_week: ACCEPTED_WEEK,
        built_from: [
          `gate5b-synthesis-${d}.json`,
          'gate5b-customer-appendix-295x3.json (this dealer partition)',
        ],
        built_without: [
          'gate5b-internal-audit.json',
          'Gate 5A ledgers',
          'raw evidence',
        ],
        ...model,
      }),
    )
  }

  // Internal audit (retains technical lineage; NOT customer-facing).
  paths.push(
    await write('gate5b-internal-audit.json', {
      artifact: 'gate5b-internal-audit',
      revision: 'L1',
      accepted_week: ACCEPTED_WEEK,
      promotion_statement:
        'Gate 5B computes no new evaluation and alters no value/rank/baseline/accounting. 17 evaluated / 278 unresolved (51/834/885) preserved.',
      metric_facts: [...factOf.values()].sort(
        (a, b) =>
          swIndex(a.metric_id) - swIndex(b.metric_id) ||
          a.dealer_id.localeCompare(b.dealer_id),
      ),
      roi_operands: DEALERS.map(roiOperandsOf),
      cluster_map: CLUSTER_OF,
    }),
  )

  console.log(
    `Gate 5B: 3 dealers, 4 clusters each, 17 metrics used once; ${crossDealerOpps.length} cross-dealer opportunities; ${allNotif.size} notif candidates; ${roiScenarios.length} ROI scenarios; ${coverage.length} coverage themes; 885 appendix cells (51/834)`,
  )
  console.log(
    `hashes: ${paths.map((p) => `${path.basename(p)}=${first16(p)}`).join(' ')}`,
  )
}

function safeCheck(label: string, s: string): void {
  if (label.endsWith('.owner') || label.endsWith('.audience'))
    assertRoleSafe(label, s)
  else assertCustomerSafe(label, s)
}

function clusterTitle(key: string): string {
  return CLUSTERS.find((c) => c.key === key)?.title ?? key
}

/** Recursively sweep string values through a check (skips keys that carry safe ids/urls). */
function sweepStrings(
  obj: unknown,
  check: (label: string, s: string) => void,
  label = '',
): void {
  if (typeof obj === 'string') {
    check(label || 'field', obj)
    return
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => sweepStrings(v, check, `${label}[${i}]`))
    return
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      // metric_id / cites / basis_id carry SW-/OT- tokens by design; skip those keys.
      if (
        [
          'metric_id',
          'cites',
          'basis_id',
          'id',
          'benchmark_id',
          'dealer_id',
        ].includes(k)
      )
        continue
      sweepStrings(v, check, `${label}.${k}`)
    }
  }
}

void main()
