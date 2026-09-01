/**
 * Gate 5A — baseline / definition-compatibility / peer-rank audit generator.
 *
 * Reads the ALREADY-committed evaluated corpus (17 metrics × 3 rooftops = 51 cells) from the spine,
 * comm, and content evaluation ledgers, INDEPENDENTLY re-derives variance / rating / direction-aware
 * peer rank (reusing the canonical evaluator helpers), fails closed on any mismatch, and emits four
 * deterministic artifacts + a customer-safe projection:
 *
 *   - gate5a-baseline-compatibility-ledger.json   (verified benchmarks + per-metric compatibility)
 *   - gate5a-evaluated-cell-comparison-ledger.json (51 comparison records)
 *   - gate5a-peer-rank-ledger.json                (direction-aware peer rank, rank 1 best)
 *   - gate5a-customer-safe-projection.json        (names metric + public source; no internal exposure)
 *
 * Gate 5A promotes nothing and invents nothing. Accounting is preserved: 17 evaluated / 278 unresolved
 * (51 / 834 / 885 cells). Byte-identical rerun. No PDFs; no synthesis.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { formatJsonFile } from '../m1r-evaluator/serialize'
import type { EvaluatedCell } from '@/server/reports/gate5a/baseline-rank'
import {
  BENCHMARK_VERIFIED_DATE,
  EVALUATED_IDS,
  MAPPING_VERDICTS,
  ROOFTOPS,
  ROOFTOP_IDS,
  VERIFIED_BENCHMARKS,
  assertProjectionSafe,
  confidenceFor,
  displayVariance,
  verifyCell,
} from '@/server/reports/gate5a/baseline-rank'

const REPO = process.cwd()
const CONTRACT = path.join(REPO, 'docs/halo/contract')
const EV = path.join(REPO, 'docs/halo/evidence/m1r')
const OUT = path.join(EV, 'gate5a')
const SPINE = path.join(EV, 'evaluator/spine-ledger.json')
const COMM = path.join(EV, 'comms/comm-evaluation-ledger.json')
const CONTENT = path.join(EV, 'comms/comm-content-evaluation-ledger.json')
const CATALOG = path.join(
  CONTRACT,
  'semantic-watchdog-feasibility-matrix-295.json',
)
const REGISTRY = path.join(CONTRACT, 'baseline-registry.json')
const GATE4H_LEDGER = path.join(
  EV,
  'residual/gate4h-internal-accountability-ledger.json',
)

const ACCEPTED_WEEK = '2026-08-24..2026-08-30'

const first16 = (p: string) =>
  createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16)
function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T
}
function must(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Gate 5A: ${msg}`)
}
const swIndex = (id: string) => Number.parseInt(id.replace('SW-', ''), 10)

type RawCell = Record<string, unknown>
function toCell(r: RawCell): EvaluatedCell {
  return {
    metric_id: String(r.metric_id),
    dealer_id: String(r.dealer_id),
    status: String(r.status),
    value: Number(r.value),
    unit: String(r.unit),
    numerator: Number(r.numerator),
    denominator: Number(r.denominator),
    baseline: r.baseline as EvaluatedCell['baseline'],
    variance: Number(r.variance),
    rating: String(r.rating),
    rank: Number(r.rank),
    reporting_period: r.reporting_period as EvaluatedCell['reporting_period'],
    formula: String(r.formula),
    source_family: (r.source_family as string | null) ?? null,
  }
}

async function main(): Promise<void> {
  // ── Load the committed evaluated cells from the three family ledgers ──
  const spine = readJson<{ rows: Array<RawCell> }>(SPINE)
  const comm = readJson<{ cells: Array<RawCell> }>(COMM)
  const content = readJson<{ cells: Array<RawCell> }>(CONTENT)
  const catalog =
    readJson<Array<{ metric_id: string; condition: string; section: string }>>(
      CATALOG,
    )
  const conditionOf = new Map(catalog.map((c) => [c.metric_id, c.condition]))
  const sectionOf = new Map(catalog.map((c) => [c.metric_id, c.section]))

  const cells: Array<EvaluatedCell> = [
    ...spine.rows.filter((r) => r.status === 'evaluated'),
    ...comm.cells.filter((r) => r.status === 'evaluated'),
    ...content.cells.filter((r) => r.status === 'evaluated'),
  ].map(toCell)

  must(cells.length === 51, `evaluated cells ${cells.length} != 51`)
  const metricIds = [...new Set(cells.map((c) => c.metric_id))].sort(
    (a, b) => swIndex(a) - swIndex(b),
  )
  must(
    metricIds.length === 17 &&
      EVALUATED_IDS.every((id) => metricIds.includes(id)),
    `evaluated metric set ${metricIds.length} != the 17 expected`,
  )
  // Each metric must have exactly the three rooftops.
  const byMetric = new Map<string, Array<EvaluatedCell>>()
  for (const c of cells) {
    must(
      ROOFTOP_IDS.includes(c.dealer_id as (typeof ROOFTOP_IDS)[number]),
      `unexpected dealer ${c.dealer_id}`,
    )
    const list = byMetric.get(c.metric_id) ?? []
    list.push(c)
    byMetric.set(c.metric_id, list)
  }
  for (const [id, list] of byMetric)
    must(
      list.length === 3 && new Set(list.map((c) => c.dealer_id)).size === 3,
      `${id} does not have exactly 3 distinct rooftops`,
    )

  // ── Independent verification: recompute variance / rating / rank; fail closed on mismatch ──
  const verifyFailures: Array<string> = []
  for (const c of cells) {
    const peers = byMetric
      .get(c.metric_id)!
      .filter((o) => o.dealer_id !== c.dealer_id)
      .map((o) => o.value)
    const v = verifyCell(c, peers)
    if (!v.ok)
      verifyFailures.push(
        `${c.metric_id}:${c.dealer_id} → ${v.failures.join(',')}`,
      )
  }
  must(
    verifyFailures.length === 0,
    `independent recompute mismatches: ${verifyFailures.join(' | ')}`,
  )

  // ── Registry consistency: committed benchmarks must match the module + stay reference-only ──
  const registry = readJson<{
    industry_benchmarks: Array<{
      id: string
      value: number | null
      value_status: string
      compatibility?: string
    }>
  }>(REGISTRY)
  const regIds = registry.industry_benchmarks.map((b) => b.id).sort()
  const modIds = VERIFIED_BENCHMARKS.map((b) => b.id).sort()
  must(
    regIds.length === modIds.length &&
      regIds.every((id, i) => id === modIds[i]),
    `registry benchmark ids ${JSON.stringify(regIds)} != module ${JSON.stringify(modIds)}`,
  )
  for (const b of registry.industry_benchmarks) {
    // Fabrication guard: no benchmark carries a top-level numeric value (none is a variance basis).
    must(
      b.value === null,
      `registry benchmark ${b.id} must keep top-level value null`,
    )
    must(
      b.value_status === 'verified_reference_only' &&
        b.compatibility === 'reference_only',
      `registry benchmark ${b.id} must be verified_reference_only / reference_only`,
    )
  }

  // ── Comparison ledger (51 records) ──
  const comparisonRecords = cells
    .map((c) => {
      const b = c.baseline
      const mapping = MAPPING_VERDICTS.find((m) => m.metric_id === c.metric_id)
      return {
        metric_id: c.metric_id,
        dealer_id: c.dealer_id,
        dealer: ROOFTOPS[c.dealer_id],
        condition: conditionOf.get(c.metric_id) ?? '',
        value: c.value,
        unit: c.unit,
        comparison_basis: {
          id: b.id,
          kind: b.basis,
          is_operational_target: b.basis === 'operational_target',
          label: b.label,
          threshold: b.value,
          comparator: b.comparator,
          direction: b.direction,
          source: b.source,
          verified_date: BENCHMARK_VERIFIED_DATE,
        },
        industry_reference: mapping
          ? {
              benchmark_id: mapping.benchmark_id,
              benchmark_metric_key: mapping.benchmark_metric_key,
              benchmark_value: mapping.benchmark_value,
              usage: mapping.decision,
              compatible: mapping.compatible,
              reason: mapping.reason,
            }
          : null,
        native_variance: c.variance,
        display_variance: displayVariance(c.variance, c.unit),
        directionality: b.direction,
        rating: c.rating,
        confidence: confidenceFor(c.denominator),
        period: c.reporting_period,
        evidence_lineage: {
          source_family: c.source_family,
          formula: c.formula,
          numerator: c.numerator,
          denominator: c.denominator,
        },
        independent_recompute_ok: true,
      }
    })
    .sort(
      (a, b) =>
        swIndex(a.metric_id) - swIndex(b.metric_id) ||
        a.dealer_id.localeCompare(b.dealer_id),
    )

  // ── Peer-rank ledger (17 metrics; direction-aware; rank 1 = best) ──
  const peerRankRecords = metricIds.map((id) => {
    const list = byMetric.get(id)!
    const direction = list[0].baseline.direction
    const ranking = list
      .map((c) => ({
        dealer_id: c.dealer_id,
        dealer: ROOFTOPS[c.dealer_id],
        value: c.value,
        rank: c.rank,
      }))
      .sort((a, b) => a.rank - b.rank || a.dealer_id.localeCompare(b.dealer_id))
    const ranks = ranking.map((r) => r.rank)
    const tie = new Set(ranks).size !== ranks.length
    const comparable =
      direction !== null && list.every((c) => Number.isFinite(c.value))
    return {
      metric_id: id,
      condition: conditionOf.get(id) ?? '',
      section: sectionOf.get(id) ?? '',
      directionality: direction,
      comparable,
      not_ranked_reason: comparable
        ? null
        : 'no direction or non-finite value — not rankable',
      tie,
      tie_rule:
        'ties share the better rank (standard competition ranking, deterministic)',
      ranking,
      note: 'Peer rank across the three governed rooftops; rank 1 = best given directionality. This is a PEER rank, NOT an industry rank.',
    }
  })
  must(
    peerRankRecords.every((r) => r.comparable),
    'every evaluated metric must be peer-rankable this period',
  )

  // ── Baseline compatibility ledger ──
  const compatibilityLedger = {
    artifact: 'gate5a-baseline-compatibility-ledger',
    revision: 'K1',
    accepted_week: ACCEPTED_WEEK,
    verified_date: BENCHMARK_VERIFIED_DATE,
    principle:
      'Definition-first. A benchmark may be a variance basis only when its exact definition, unit, population, and period grain match the metric AND its value is verified. Operational targets (Duane-supplied) are valid comparison bases but are labeled operational_target and are NEVER industry benchmarks. No verified benchmark is definition-compatible this gate, so none is a variance basis and no benchmark number enters an evaluation.',
    verified_benchmarks: VERIFIED_BENCHMARKS,
    candidate_mappings: MAPPING_VERDICTS,
    accepted_mappings: MAPPING_VERDICTS.filter((m) => m.compatible),
    rejected_mappings: MAPPING_VERDICTS.filter((m) => !m.compatible).map(
      (m) => ({
        metric_id: m.metric_id,
        benchmark_id: m.benchmark_id,
        decision: m.decision,
        reason: m.reason,
      }),
    ),
    operational_targets_used: metricIds.map((id) => ({
      metric_id: id,
      operational_target_id: byMetric.get(id)![0].baseline.id,
      threshold: byMetric.get(id)![0].baseline.value,
      direction: byMetric.get(id)![0].baseline.direction,
    })),
  }

  // ── Customer-safe projection (names metric + public source; no internal exposure) ──
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`
  const valueDisplay = (v: number, unit: string) =>
    unit === 'minutes' ? `${Math.round(v * 10) / 10} min` : pct(v)
  const projectionMetrics = peerRankRecords.map((r) => {
    const list = byMetric.get(r.metric_id)!
    const b = list[0].baseline
    const mapping = MAPPING_VERDICTS.find((m) => m.metric_id === r.metric_id)
    const rooftops = r.ranking.map((row) => {
      const cell = list.find((c) => c.dealer_id === row.dealer_id)!
      return {
        dealer: row.dealer,
        value: valueDisplay(cell.value, cell.unit),
        peer_rank: row.rank,
        status: cell.rating,
      }
    })
    const publicReference = mapping
      ? `A published ${VERIFIED_BENCHMARKS.find((x) => x.id === mapping.benchmark_id)!.publisher} industry reference was reviewed but does not match this metric's exact definition, so it is provided for context only and is not used to score.`
      : null
    const out = {
      metric_id: r.metric_id,
      metric: r.condition,
      operational_target: {
        label: 'internal operational target (not an industry benchmark)',
        value: valueDisplay(b.value ?? 0, list[0].unit),
        better_when: b.direction,
      },
      rooftops,
      peer_rank_note:
        'Rank 1 is the strongest of your three rooftops for this metric; this is a peer comparison across your rooftops, not an industry ranking.',
      public_reference: publicReference,
    }
    // Fail-closed safety sweep over every string field.
    assertProjectionSafe(`${r.metric_id}.metric`, out.metric)
    assertProjectionSafe(
      `${r.metric_id}.ot.label`,
      out.operational_target.label,
    )
    assertProjectionSafe(`${r.metric_id}.peer_note`, out.peer_rank_note)
    if (out.public_reference)
      assertProjectionSafe(
        `${r.metric_id}.public_reference`,
        out.public_reference,
      )
    for (const rt of out.rooftops)
      assertProjectionSafe(`${r.metric_id}.rooftop`, rt.dealer)
    return out
  })
  const customerProjection = {
    artifact: 'gate5a-customer-safe-projection',
    revision: 'K1',
    accepted_week: ACCEPTED_WEEK,
    scope_note:
      'Sales-only. Per-metric peer comparison across your three rooftops against an internal operational target. Verified public industry references were reviewed; none matched an exact metric definition, so all are context-only and none is used to score. No value is computed from an industry benchmark.',
    public_references_reviewed: VERIFIED_BENCHMARKS.map((b) => ({
      publisher: b.publisher,
      title: b.title,
      url: b.url,
      usage: 'reference_only',
    })),
    metrics: projectionMetrics,
  }

  // ── Accounting invariant (committed Gate 4H coverage unchanged) ──
  const gate4h = readJson<{
    coverage: { conditions: number; evaluated: number; unresolved: number }
  }>(GATE4H_LEDGER)
  must(
    gate4h.coverage.conditions === 295 &&
      gate4h.coverage.evaluated === 17 &&
      gate4h.coverage.unresolved === 278,
    `committed Gate 4H coverage ${JSON.stringify(gate4h.coverage)} != 295/17/278`,
  )
  const accounting = {
    conditions: 295,
    evaluated: 17,
    unresolved: 278,
    evaluated_cells: 51,
    unresolved_cells: 834,
    total_cells: 885,
    change_from_this_gate:
      'none — Gate 5A verifies the committed corpus; it promotes nothing',
  }
  must(
    accounting.evaluated * 3 === accounting.evaluated_cells &&
      accounting.unresolved * 3 === accounting.unresolved_cells &&
      accounting.evaluated_cells + accounting.unresolved_cells ===
        accounting.total_cells,
    'cell accounting does not reconcile to 51/834/885',
  )

  // ── Emit ──
  fs.mkdirSync(OUT, { recursive: true })
  const write = async (name: string, obj: unknown): Promise<string> => {
    const p = path.join(OUT, name)
    fs.writeFileSync(p, await formatJsonFile(obj, p))
    return p
  }
  const compatPath = await write('gate5a-baseline-compatibility-ledger.json', {
    ...compatibilityLedger,
    accounting,
  })
  const compPath = await write('gate5a-evaluated-cell-comparison-ledger.json', {
    artifact: 'gate5a-evaluated-cell-comparison-ledger',
    revision: 'K1',
    accepted_week: ACCEPTED_WEEK,
    accounting,
    records: comparisonRecords,
  })
  const rankPath = await write('gate5a-peer-rank-ledger.json', {
    artifact: 'gate5a-peer-rank-ledger',
    revision: 'K1',
    accepted_week: ACCEPTED_WEEK,
    note: 'Direction-aware peer rank across the three governed rooftops; rank 1 = best. PEER rank, not industry rank.',
    records: peerRankRecords,
  })
  const projPath = await write(
    'gate5a-customer-safe-projection.json',
    customerProjection,
  )

  console.log(
    `Gate 5A: 51 evaluated cells verified (variance/rating/rank recomputed, 0 mismatch); 17 metrics peer-ranked`,
  )
  console.log(
    `benchmarks verified: ${VERIFIED_BENCHMARKS.length}; mappings accepted ${compatibilityLedger.accepted_mappings.length} / rejected ${compatibilityLedger.rejected_mappings.length}`,
  )
  console.log(
    `hashes: compat ${first16(compatPath)}, comparison ${first16(compPath)}, rank ${first16(rankPath)}, projection ${first16(projPath)}`,
  )
  console.log(
    `wrote ${[compatPath, compPath, rankPath, projPath].map((p) => path.relative(REPO, p)).join(', ')}`,
  )
}

void main()
