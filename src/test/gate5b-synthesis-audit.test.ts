// @vitest-environment node
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CLUSTERS,
  SHOW_TO_SALE,
  assertCustomerSafe,
  assertRoleSafe,
  roiScenario,
} from '@/server/reports/gate5b/synthesis'

const url = (p: string) => new URL(`../../${p}`, import.meta.url)
const read = (p: string) => JSON.parse(fs.readFileSync(url(p), 'utf8'))
const G = 'docs/halo/evidence/m1r/gate5b'
const DEALERS = ['21043', '21044', '21047']

const BUNDLE = Object.fromEntries(
  DEALERS.map((d) => [d, read(`${G}/gate5b-synthesis-${d}.json`)]),
)
const APPENDIX = read(`${G}/gate5b-customer-appendix-295x3.json`)
const COVERAGE = read(`${G}/gate5b-coverage-expansion-plan.json`)
const ROI = read(`${G}/gate5b-roi-scenario-ledger.json`)
const XDEALER = read(`${G}/gate5b-cross-dealer-opportunity-ledger.json`)
const NOTIF = read(`${G}/gate5b-notification-automation-ledger.json`)
const AUDIT = read(`${G}/gate5b-internal-audit.json`)
const COMPARISON = read(
  'docs/halo/evidence/m1r/gate5a/gate5a-evaluated-cell-comparison-ledger.json',
)

const EVAL_17 = CLUSTERS.flatMap((c) => c.metric_ids)

describe('Gate 5B — three dealers, 17 metrics used exactly once in clusters', () => {
  it('has a synthesis bundle for all three rooftops', () => {
    for (const d of DEALERS) {
      expect(BUNDLE[d].dealer_id).toBe(d)
      expect(BUNDLE[d].clusters).toHaveLength(4)
      expect(BUNDLE[d].clusters.map((c: any) => c.cluster)).toEqual([
        'A',
        'B',
        'C',
        'D',
      ])
    }
  })

  it('every evaluated metric appears exactly once across the cluster facts', () => {
    for (const d of DEALERS) {
      const used = BUNDLE[d].clusters.flatMap((c: any) =>
        c.facts.map((f: any) => f.metric_id),
      )
      expect(used.sort()).toEqual([...EVAL_17].sort())
      expect(new Set(used).size).toBe(17)
      for (const f of BUNDLE[d].clusters.flatMap((c: any) => c.facts))
        expect(f.claim).toBe('fact')
    }
  })
})

describe('Gate 5B — cross-cluster conclusions cite ≥2 metrics or are hypotheses', () => {
  it('each interaction is a hypothesis or cites ≥2 metrics; implications too', () => {
    for (const d of DEALERS) {
      for (const i of BUNDLE[d].cross_cluster_synthesis)
        expect(i.claim === 'hypothesis' || i.cites.length >= 2).toBe(true)
      for (const c of BUNDLE[d].clusters) {
        expect(['inference', 'hypothesis']).toContain(c.implication.claim)
        if (c.implication.claim === 'inference')
          expect(c.implication.cites.length).toBeGreaterThanOrEqual(2)
        for (const h of c.hypotheses) expect(h.claim).toBe('hypothesis')
      }
    }
  })
})

describe('Gate 5B — ROI scenarios recompute; no overclaim; no dollars', () => {
  it('appointment gap / additional shows / units recompute from operands', () => {
    const opById = Object.fromEntries(
      AUDIT.roi_operands.map((o: any) => [o.dealer_id, o]),
    )
    for (const s of ROI.scenarios) {
      const recomputed = roiScenario(opById[s.dealer_id])
      expect(s.appointment_gap_to_target).toBe(
        recomputed.appointment_gap_to_target,
      )
      expect(s.additional_shows_if_gap_closed).toBe(
        recomputed.additional_shows_if_gap_closed,
      )
      expect(s.incremental_units).toEqual(recomputed.incremental_units)
      // dollars omitted; warnings present; high assumption labeled reference-only.
      expect(s.dollars).toBeNull()
      expect(s.warnings.length).toBeGreaterThanOrEqual(1)
      expect(JSON.stringify(s.assumptions)).toMatch(
        /Foureyes H2 2023 reference/i,
      )
    }
    expect(SHOW_TO_SALE.high).toBe(0.41)
  })
})

describe('Gate 5B — 295×3 appendix exactness', () => {
  it('885 cells, 51 evaluated + 834 not-measured, each (metric,dealer) once', () => {
    expect(APPENDIX.cells).toHaveLength(885)
    const ev = APPENDIX.cells.filter((c: any) => c.status === 'evaluated')
    const nm = APPENDIX.cells.filter((c: any) => c.status === 'not_measured')
    expect(ev).toHaveLength(51)
    expect(nm).toHaveLength(834)
    expect(
      new Set(APPENDIX.cells.map((c: any) => `${c.metric_id}:${c.dealer_id}`))
        .size,
    ).toBe(885)
    expect(APPENDIX.accounting).toEqual({
      conditions: 295,
      evaluated: 17,
      unresolved: 278,
      evaluated_cells: 51,
      not_measured_cells: 834,
      total_cells: 885,
    })
  })

  it('evaluated cells retain value/basis/variance/rank/evidence; not-measured retain reason + unlock', () => {
    for (const c of APPENDIX.cells) {
      if (c.status === 'evaluated') {
        expect(c.value).toBeTruthy()
        expect(c.basis_id).toBeTruthy()
        expect(c.variance).toBeTruthy()
        expect(typeof c.peer_rank).toBe('number')
        expect(c.evidence).toBeTruthy()
      } else {
        expect(c.note).toBe('Not measured this cycle')
        expect(String(c.next_visibility_unlock)).toMatch(
          /Next visibility unlock/,
        )
      }
    }
  })
})

describe('Gate 5B — 278 unresolved grouped and individually accounted', () => {
  it('coverage themes account for exactly the 278 unresolved metrics once each', () => {
    const ids = COVERAGE.themes.flatMap((t: any) => t.metric_ids)
    expect(ids).toHaveLength(278)
    expect(new Set(ids).size).toBe(278)
    expect(COVERAGE.unresolved_total).toBe(278)
    // customer-friendly language only
    const blob = JSON.stringify(COVERAGE)
    for (const bad of [
      'limitation',
      'blocked',
      'withheld',
      'quarantin',
      'hold',
    ])
      expect(blob.toLowerCase()).not.toContain(bad)
  })
})

describe('Gate 5B — ranks / baselines unchanged vs Gate 5A', () => {
  it('internal-audit facts match the committed Gate 5A comparison ledger', () => {
    const compBy = Object.fromEntries(
      COMPARISON.records.map((r: any) => [`${r.metric_id}:${r.dealer_id}`, r]),
    )
    for (const f of AUDIT.metric_facts) {
      const c = compBy[`${f.metric_id}:${f.dealer_id}`]
      expect(f.native_variance).toBe(c.native_variance)
      expect(f.threshold).toBe(c.comparison_basis.threshold)
      expect(f.rating).toBe(c.rating)
    }
  })
})

describe('Gate 5B — customer-safety / privacy guards', () => {
  it('customer artifacts expose no internal path/report title/CRM field/hold term/PII', () => {
    const files = [
      BUNDLE['21043'],
      BUNDLE['21044'],
      BUNDLE['21047'],
      APPENDIX,
      COVERAGE,
      ROI,
      XDEALER,
      NOTIF,
    ]
    const blob = JSON.stringify(files)
    for (const term of [
      'docs/halo',
      'spine-ledger',
      '.json',
      'VinSolutions',
      'Is Show',
      'First Contact Attempt',
      'Actual Response Time',
      'quarantin',
      'blocker_class',
      'rep_token',
    ])
      expect(blob).not.toContain(term)
  })

  it('the guards fail closed on planted internal term and non-role owner', () => {
    expect(() =>
      assertCustomerSafe('x', 'See the Actual Response Time field.'),
    ).toThrow()
    expect(() => assertRoleSafe('owner', 'Jane Doe')).toThrow(/allowed owner/i)
    expect(() => assertRoleSafe('owner', 'Sales Manager')).not.toThrow()
  })

  it('notification candidates carry the full contract and are not activated', () => {
    expect(NOTIF.candidates.length).toBeGreaterThan(0)
    for (const n of NOTIF.candidates) {
      for (const k of [
        'trigger',
        'audience',
        'timing',
        'payload',
        'guardrails',
      ])
        expect(String(n[k]).length).toBeGreaterThan(0)
      expect([
        'notification_only',
        'external_action_requires_approval',
      ]).toContain(n.kind)
      expect(n.activated).toBe(false)
    }
  })
})

describe('Gate 5B R1 — Sales-only boundary + narrowed SW-012 / SW-090 claims', () => {
  const CUSTOMER = [
    BUNDLE['21043'],
    BUNDLE['21044'],
    BUNDLE['21047'],
    APPENDIX,
    COVERAGE,
    ROI,
    XDEALER,
    NOTIF,
  ]

  it('customer-facing artifacts contain zero whole-word Service/Parts (case-insensitive)', () => {
    const blob = JSON.stringify(CUSTOMER)
    expect(blob).not.toMatch(/\bservice\b/i)
    expect(blob).not.toMatch(/\bparts\b/i)
  })

  it('outside-domain items use neutral separate-domain wording', () => {
    const neutral = COVERAGE.themes.find(
      (t: any) => t.theme === 'Separate operational domain',
    )
    expect(neutral).toBeTruthy()
    expect(neutral.what_it_would_reveal).toMatch(
      /separate operational domain and is not part of this Sales report/i,
    )
    expect(neutral.next_visibility_unlock).toMatch(
      /separately governed analysis/i,
    )
    expect(neutral.next_visibility_unlock).not.toMatch(/\bservice\b/i)
  })

  it('customer artifacts contain none of the forbidden overclaim phrases', () => {
    const blob = JSON.stringify([
      BUNDLE['21043'],
      BUNDLE['21044'],
      BUNDLE['21047'],
      XDEALER,
    ]).toLowerCase()
    for (const p of [
      'never worked',
      'ownership is clean',
      'rather than assignment',
      'not assignment',
    ])
      expect(blob).not.toContain(p)
  })

  it('SW-012 uses the measured tracked-response definition', () => {
    const blob = JSON.stringify(CUSTOMER)
    expect(blob).toMatch(/no tracked response within the first 30 minutes/i)
  })

  it('SW-090 ownership interaction is a bounded hypothesis that does not exclude assignment quality', () => {
    for (const d of DEALERS) {
      const own = BUNDLE[d].cross_cluster_synthesis.find(
        (i: any) => i.id === 'ownership-vs-followthrough',
      )
      if (own) {
        expect(own.claim).toBe('hypothesis')
        expect(own.text).toMatch(/does not rule out assignment quality/i)
      }
      // The bounded clusterD implication passed only the two-hour check.
      const dCluster = BUNDLE[d].clusters[3]
      expect(dCluster.title).toBe('Showroom execution and ownership')
      expect(dCluster.implication.text).not.toMatch(/ownership is clean/i)
    }
  })

  it('the customer guard fails closed on whole-word service/parts', () => {
    expect(() => assertCustomerSafe('x', 'a service topic')).toThrow()
    expect(() => assertCustomerSafe('x', 'parts counter')).toThrow()
    expect(() => assertCustomerSafe('x', 'a Sales appointment')).not.toThrow()
  })

  it('internal audit is intentionally excluded from the customer scan', () => {
    expect(AUDIT.artifact).toBe('gate5b-internal-audit')
  })
})
