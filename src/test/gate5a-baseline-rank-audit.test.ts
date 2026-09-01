// @vitest-environment node
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rankByDirection } from '@/server/reports/evaluator/metrics'
import {
  EVALUATED_IDS,
  MAPPING_VERDICTS,
  VERIFIED_BENCHMARKS,
  assertProjectionSafe,
} from '@/server/reports/gate5a/baseline-rank'

const url = (p: string) => new URL(`../../${p}`, import.meta.url)
const read = (p: string) => JSON.parse(fs.readFileSync(url(p), 'utf8'))

const COMPAT = read(
  'docs/halo/evidence/m1r/gate5a/gate5a-baseline-compatibility-ledger.json',
)
const COMPARISON = read(
  'docs/halo/evidence/m1r/gate5a/gate5a-evaluated-cell-comparison-ledger.json',
)
const RANK = read('docs/halo/evidence/m1r/gate5a/gate5a-peer-rank-ledger.json')
const PROJECTION = read(
  'docs/halo/evidence/m1r/gate5a/gate5a-customer-safe-projection.json',
)
const REGISTRY = read('docs/halo/contract/baseline-registry.json')

describe('Gate 5A — comparison ledger (51 cells, operational-target basis)', () => {
  it('has 51 records covering the 17 evaluated metrics × 3 rooftops', () => {
    expect(COMPARISON.records).toHaveLength(51)
    const ids = [...new Set(COMPARISON.records.map((r: any) => r.metric_id))]
    expect(ids.sort()).toEqual([...EVALUATED_IDS].sort())
    for (const id of EVALUATED_IDS)
      expect(
        COMPARISON.records.filter((r: any) => r.metric_id === id),
      ).toHaveLength(3)
  })

  it('every comparison basis is an operational target (never an industry benchmark)', () => {
    for (const r of COMPARISON.records) {
      expect(r.comparison_basis.kind).toBe('operational_target')
      expect(r.comparison_basis.is_operational_target).toBe(true)
      // operational-target ids vary by family (spine OT-, comm-, comm-content-); never IB-.
      expect(String(r.comparison_basis.id)).toMatch(
        /^(OT-|comm-|comm-content-)/,
      )
      expect(String(r.comparison_basis.id)).not.toMatch(/^IB-/)
    }
  })

  it('each record carries the required comparison fields', () => {
    for (const r of COMPARISON.records) {
      expect(typeof r.value).toBe('number')
      expect(typeof r.native_variance).toBe('number')
      expect(typeof r.display_variance).toBe('string')
      expect(['higher_is_better', 'lower_is_better']).toContain(
        r.directionality,
      )
      expect(['low', 'medium', 'high']).toContain(r.confidence)
      expect(r.period.start).toBe('2026-08-24')
      expect(r.independent_recompute_ok).toBe(true)
      expect(r.evidence_lineage).toBeTruthy()
    }
  })
})

describe('Gate 5A — direction-aware peer rank (rank 1 best)', () => {
  it('17 metrics, each rankable, peer-rank not industry-rank', () => {
    expect(RANK.records).toHaveLength(17)
    for (const r of RANK.records) {
      expect(r.comparable).toBe(true)
      expect(r.not_ranked_reason).toBeNull()
      expect(r.note).toMatch(/NOT an industry rank/i)
    }
  })

  it('ranks are an independent, direction-aware recompute of value vs peers', () => {
    for (const r of RANK.records) {
      const values = r.ranking.map((x: any) => x.value)
      for (const row of r.ranking) {
        const peers = values.filter(
          (_: number, i: number) => r.ranking[i].dealer_id !== row.dealer_id,
        )
        expect(rankByDirection(row.value, peers, r.directionality)).toBe(
          row.rank,
        )
      }
      // rank 1 is the best value for the directionality.
      const best = r.ranking.find((x: any) => x.rank === 1).value
      for (const row of r.ranking)
        if (r.directionality === 'higher_is_better')
          expect(best).toBeGreaterThanOrEqual(row.value)
        else expect(best).toBeLessThanOrEqual(row.value)
    }
  })
})

describe('Gate 5A — benchmark compatibility (all rejected; reference-only)', () => {
  it('accepts no mapping and rejects the three named candidates', () => {
    expect(COMPAT.accepted_mappings).toHaveLength(0)
    expect(COMPAT.rejected_mappings).toHaveLength(3)
    const byId = Object.fromEntries(
      MAPPING_VERDICTS.map((m) => [m.metric_id, m]),
    )
    expect(byId['SW-032'].reason).toMatch(/cancelled|rescheduled/i)
    expect(byId['SW-031'].reason).toMatch(/leads/i)
    expect(byId['SW-011'].reason).toMatch(/median|ILE|composite/i)
    for (const m of MAPPING_VERDICTS) {
      expect(m.compatible).toBe(false)
      expect(m.decision).toBe('reference_only')
    }
  })

  it('verified benchmarks are recorded but none is a variance basis', () => {
    expect(COMPAT.verified_benchmarks).toHaveLength(5)
    for (const b of COMPAT.verified_benchmarks) {
      expect(b.usage).toBe('reference_only')
      expect(b.verified_date).toBe('2026-09-01')
      expect(String(b.url)).toMatch(/^https?:\/\//)
    }
  })
})

describe('Gate 5A — registry updated (verified, value-null fabrication guard)', () => {
  it('all 5 benchmarks are verified_reference_only with null top-level value', () => {
    const ib = REGISTRY.industry_benchmarks
    expect(ib).toHaveLength(5)
    for (const b of ib) {
      expect(b.value).toBeNull()
      expect(b.value_status).toBe('verified_reference_only')
      expect(b.verified_date).toBe('2026-09-01')
      expect(b.compatibility).toBe('reference_only')
      expect(b.mapped_to).toBeNull()
    }
    // Registry ids match the module (single source of truth).
    expect(ib.map((b: any) => b.id).sort()).toEqual(
      VERIFIED_BENCHMARKS.map((b) => b.id).sort(),
    )
  })

  it('operational targets remain numeric-thresholded and labeled operational_target', () => {
    for (const o of REGISTRY.operational_targets) {
      expect(o.basis).toBe('operational_target')
      expect(typeof o.threshold).toBe('number')
      // never mislabeled as an industry benchmark
      expect(o.source).not.toMatch(/industry benchmark/i)
    }
  })
})

describe('Gate 5A — customer-safe projection', () => {
  it('names metric + public source but exposes no internal path/title/control/PII', () => {
    const blob = JSON.stringify(PROJECTION)
    // public publishers may appear; internal terms may not.
    for (const term of [
      'spine-ledger',
      'baseline-registry',
      'docs/halo',
      'VinSolutions',
      'Dashboard',
      'Is Show',
      'quarantin',
    ])
      expect(blob).not.toContain(term)
    // every string field is guard-clean
    for (const m of PROJECTION.metrics) {
      assertProjectionSafe('metric', m.metric)
      assertProjectionSafe('peer_note', m.peer_rank_note)
      if (m.public_reference) assertProjectionSafe('pubref', m.public_reference)
    }
    expect(PROJECTION.public_references_reviewed.length).toBe(5)
  })

  it('labels the operational target as internal (not an industry benchmark), rank 1 best', () => {
    for (const m of PROJECTION.metrics) {
      expect(m.operational_target.label).toMatch(/internal operational target/i)
      expect(m.operational_target.label).toMatch(/not an industry benchmark/i)
      const ranks = m.rooftops.map((r: any) => r.peer_rank)
      expect(Math.min(...ranks)).toBe(1)
    }
  })

  it('the projection guard fails closed on a planted internal term', () => {
    expect(() =>
      assertProjectionSafe('x', 'See the Dashboard Custom Reporting export.'),
    ).toThrow(/internal term/i)
  })
})

describe('Gate 5A — accounting unchanged', () => {
  it('17 / 278 = 51 / 834 / 885 across all ledgers', () => {
    for (const led of [COMPAT, COMPARISON]) {
      expect(led.accounting.evaluated).toBe(17)
      expect(led.accounting.unresolved).toBe(278)
      expect(led.accounting.evaluated_cells).toBe(51)
      expect(led.accounting.unresolved_cells).toBe(834)
      expect(led.accounting.total_cells).toBe(885)
    }
  })
})
