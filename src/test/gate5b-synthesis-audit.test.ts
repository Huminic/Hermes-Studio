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
import { assembleCustomerReport } from '@/server/reports/gate5b/customer-report'

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
const RANK = read('docs/halo/evidence/m1r/gate5a/gate5a-peer-rank-ledger.json')

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

describe('Gate 5B R2 — standalone fact contract + typed claims', () => {
  const clone = (x: any) => JSON.parse(JSON.stringify(x))
  const partitionOf = (d: string) =>
    APPENDIX.cells.filter((c: any) => c.dealer_id === d)

  it('the reader module has no import of Gate 5A / internal-audit / raw evidence', () => {
    const src = fs.readFileSync(
      url('src/server/reports/gate5b/customer-report.ts'),
      'utf8',
    )
    // Inspect IMPORT statements only (denylist tokens legitimately appear inside the guard regex).
    const importLines = src.split('\n').filter((l) => /^\s*import\b/.test(l))
    for (const l of importLines)
      expect(l).not.toMatch(
        /gate5a|residual|evaluator|internal-audit|spine-ledger|comparison/i,
      )
  })

  it('assembles 17 structured evaluated facts + 278 not-measured per dealer from customer artifacts alone', () => {
    for (const d of DEALERS) {
      const model = assembleCustomerReport(BUNDLE[d], partitionOf(d))
      expect(model.dealer_id).toBe(d)
      expect(model.coverage).toEqual({
        evaluated: 17,
        not_measured: 278,
        total: 295,
      })
      expect(model.evaluated).toHaveLength(17)
      expect(model.not_measured).toHaveLength(278)
      // every evaluated fact is fully structured
      for (const f of model.evaluated) {
        expect(f.claim).toBe('fact')
        expect(typeof f.value).toBe('number')
        expect(f.value_display).toBeTruthy()
        expect(f.operational_target.comparator).toBeTruthy()
        expect(['higher_is_better', 'lower_is_better']).toContain(
          f.operational_target.direction,
        )
        expect(typeof f.variance.native).toBe('number')
        expect(typeof f.peer_rank.tie).toBe('boolean')
        expect(['low', 'medium', 'high']).toContain(f.confidence)
        expect(f.evidence.source).toMatch(/^CRM /)
        expect(f.evidence.period.start).toBe('2026-08-24')
        expect(f.evidence.freshness).toMatch(/weekly/)
        expect(typeof f.evidence.numerator).toBe('number')
      }
      // not-measured stay missing (never zero) + retain friendly fields
      for (const n of model.not_measured) {
        expect(n.note).toBe('Not measured this cycle')
        expect(n.next_visibility_unlock).toBeTruthy()
        expect(Object.prototype.hasOwnProperty.call(n, 'value')).toBe(false)
      }
    }
  })

  it('the committed report-model artifacts match the reader output', () => {
    for (const d of DEALERS) {
      const committed = read(`${G}/gate5b-report-model-${d}.json`)
      const model = assembleCustomerReport(BUNDLE[d], partitionOf(d))
      expect(committed.evaluated).toEqual(model.evaluated)
      expect(committed.not_measured).toEqual(model.not_measured)
      expect(committed.coverage.total).toBe(295)
    }
  })

  it('unchanged-value join: report-model values equal the committed Gate 5A values', () => {
    const compBy = Object.fromEntries(
      COMPARISON.records.map((r: any) => [`${r.metric_id}:${r.dealer_id}`, r]),
    )
    for (const d of DEALERS) {
      const model = assembleCustomerReport(BUNDLE[d], partitionOf(d))
      for (const f of model.evaluated) {
        const c = compBy[`${f.metric_id}:${d}`]
        expect(f.value).toBe(c.value)
        expect(f.variance.native).toBe(c.native_variance)
        expect(f.operational_target.value).toBe(c.comparison_basis.threshold)
        expect(f.peer_rank.rank).toBe(
          RANK.records
            .find((r: any) => r.metric_id === f.metric_id)
            .ranking.find((x: any) => x.dealer_id === d).rank,
        )
      }
    }
  })

  it('the reader rejects duplicates, missing IDs, non-295 coverage, and incomplete facts', () => {
    const d = '21043'
    // missing one evaluated fact (16)
    const short = clone(BUNDLE[d])
    short.clusters[0].facts.pop()
    expect(() => assembleCustomerReport(short, partitionOf(d))).toThrow()
    // duplicate an evaluated fact
    const dup = clone(BUNDLE[d])
    dup.clusters[1].facts.push(dup.clusters[0].facts[0])
    expect(() => assembleCustomerReport(dup, partitionOf(d))).toThrow()
    // non-295 coverage (drop a not-measured cell)
    const part = partitionOf(d)
    const shortPart = part.filter(
      (c: any, i: number) =>
        !(c.status === 'not_measured' && i === part.length - 1),
    )
    expect(() => assembleCustomerReport(BUNDLE[d], shortPart)).toThrow()
    // incomplete fact (strip operational_target)
    const bad = clone(BUNDLE[d])
    delete bad.clusters[0].facts[0].operational_target
    expect(() => assembleCustomerReport(bad, partitionOf(d))).toThrow(
      /not fully structured/i,
    )
    // not-measured carrying a value
    const withVal = clone(partitionOf(d))
    const nm = withVal.find((c: any) => c.status === 'not_measured')
    nm.value = 0
    expect(() => assembleCustomerReport(BUNDLE[d], withVal)).toThrow(
      /never zero/i,
    )
  })

  it('narratives and actions are typed claim objects; no untyped strings', () => {
    for (const d of DEALERS) {
      const ex = BUNDLE[d].executive_narrative
      for (const k of [
        'what_is_working',
        'largest_controllable_opportunity',
        'how_evidence_connects',
      ]) {
        expect(['fact', 'inference', 'hypothesis', 'recommendation']).toContain(
          ex[k].claim,
        )
        expect(typeof ex[k].text).toBe('string')
        expect(Array.isArray(ex[k].cites)).toBe(true)
      }
      for (const c of BUNDLE[d].clusters) {
        expect(['inference', 'hypothesis']).toContain(c.narrative.claim)
        expect(Array.isArray(c.narrative.cites)).toBe(true)
        for (const a of c.actions) {
          expect(a.claim).toBe('recommendation')
          for (const k of [
            'owner',
            'cadence',
            'success_measure',
            'effort',
            'impact',
          ])
            expect(a[k]).toBeTruthy()
        }
      }
    }
  })

  it('every inference/hypothesis cites ≥2 metrics (or notes single-metric) and only evaluated IDs', () => {
    for (const d of DEALERS) {
      const evalIds = new Set<string>(
        BUNDLE[d].clusters.flatMap((c: any) =>
          c.facts.map((f: any) => f.metric_id),
        ),
      )
      const claims = [
        BUNDLE[d].executive_narrative.what_is_working,
        BUNDLE[d].executive_narrative.largest_controllable_opportunity,
        BUNDLE[d].executive_narrative.how_evidence_connects,
        ...BUNDLE[d].clusters.map((c: any) => c.narrative),
        ...BUNDLE[d].clusters.map((c: any) => c.implication),
        ...BUNDLE[d].clusters.flatMap((c: any) => c.hypotheses),
        ...BUNDLE[d].cross_cluster_synthesis,
      ]
      for (const cl of claims) {
        for (const id of cl.cites) expect(evalIds.has(id)).toBe(true)
        if (cl.claim === 'inference' || cl.claim === 'hypothesis')
          expect(cl.cites.length >= 2 || /single-metric/i.test(cl.text)).toBe(
            true,
          )
      }
    }
  })

  it('the D hypothesis no longer says "write" (SW-033 not cited there)', () => {
    for (const d of DEALERS) {
      const dHyp = BUNDLE[d].clusters[3].hypotheses
      for (const h of dHyp) {
        if (!h.cites.includes('SW-033'))
          expect(h.text.toLowerCase()).not.toContain('write')
      }
    }
  })
})

describe('Gate 5B R3 — complete standalone PDF-consumer package', () => {
  const clone = (x: any) => JSON.parse(JSON.stringify(x))
  const partitionOf = (d: string) =>
    APPENDIX.cells.filter((c: any) => c.dealer_id === d)
  const modelOf = (d: string) =>
    assembleCustomerReport(BUNDLE[d], partitionOf(d))
  const SECTIONS = [
    'dealer_id',
    'dealer',
    'accepted_week',
    'freshness',
    'executive_narrative',
    'clusters',
    'cross_cluster_synthesis',
    'ranked_opportunities',
    'vehicle_opportunity_scenario',
    'notification_candidates',
    'coverage',
    'visibility_plan',
    'evaluated',
    'not_measured',
    'appendix',
  ]

  it('one report-model file carries every section a PDF needs (no other JSON dependency)', () => {
    for (const d of DEALERS) {
      const rm = read(`${G}/gate5b-report-model-${d}.json`)
      for (const k of SECTIONS) expect(rm[k]).toBeDefined()
      expect(rm.dealer).toMatch(/Serra|Tony/)
      expect(rm.clusters).toHaveLength(4)
      expect(rm.appendix).toHaveLength(295)
      expect(rm.coverage).toEqual({
        evaluated: 17,
        not_measured: 278,
        total: 295,
      })
      expect(rm.freshness).toMatch(/weekly/)
    }
  })

  it('every one of 295 appendix entries has a specific nonempty label', () => {
    for (const d of DEALERS) {
      const rm = modelOf(d)
      expect(rm.appendix).toHaveLength(295)
      expect(new Set(rm.appendix.map((c: any) => c.metric_id)).size).toBe(295)
      for (const c of rm.appendix as Array<any>) {
        expect(typeof c.label).toBe('string')
        expect(c.label.length).toBeGreaterThan(0)
      }
      const neutral = rm.appendix.filter(
        (c: any) => c.label === 'Separate operational-domain metric',
      )
      expect(neutral).toHaveLength(36)
    }
  })

  it('3 inert notification candidates packaged per dealer with full contract', () => {
    for (const d of DEALERS) {
      const rm = modelOf(d)
      expect(rm.notification_candidates).toHaveLength(3)
      for (const n of rm.notification_candidates as Array<any>) {
        expect(n.activated).toBe(false)
        for (const k of [
          'trigger',
          'audience',
          'timing',
          'payload',
          'guardrails',
          'kind',
        ])
          expect(n[k]).toBeTruthy()
      }
    }
  })

  it('visibility themes cover exactly the 278 not-measured IDs once each', () => {
    for (const d of DEALERS) {
      const rm = modelOf(d)
      const themeIds = rm.visibility_plan.themes.flatMap(
        (t: any) => t.metric_ids,
      )
      expect(themeIds).toHaveLength(278)
      expect(new Set(themeIds).size).toBe(278)
      expect(new Set(themeIds)).toEqual(
        new Set(rm.not_measured.map((n: any) => n.metric_id)),
      )
      for (const t of rm.visibility_plan.themes)
        expect(t.count).toBe(t.metric_ids.length)
    }
  })

  it('the whole packaged report-model is free of forbidden language / paths / PII', () => {
    for (const d of DEALERS) {
      const blob = JSON.stringify(read(`${G}/gate5b-report-model-${d}.json`))
      for (const bad of [
        'docs/halo',
        'spine-ledger',
        'VinSolutions',
        'Dashboard',
        'Is Show',
        'Actual Response Time',
        'quarantin',
        'blocker_class',
        'rep_token',
      ])
        expect(blob).not.toContain(bad)
      expect(blob).not.toMatch(/\bservice\b/i)
      expect(blob).not.toMatch(/\bparts\b/i)
    }
  })

  it('reader fails closed on missing section, activated notif, unsafe language, bad label/citation', () => {
    const d = '21043'
    const noExec = clone(BUNDLE[d])
    delete noExec.executive_narrative
    expect(() => assembleCustomerReport(noExec, partitionOf(d))).toThrow()
    const noClusters = clone(BUNDLE[d])
    delete noClusters.clusters
    expect(() => assembleCustomerReport(noClusters, partitionOf(d))).toThrow(
      /clusters/i,
    )
    const noNotif = clone(BUNDLE[d])
    delete noNotif.notification_candidates
    expect(() => assembleCustomerReport(noNotif, partitionOf(d))).toThrow(
      /notification/i,
    )
    const act = clone(BUNDLE[d])
    act.notification_candidates[0].activated = true
    expect(() => assembleCustomerReport(act, partitionOf(d))).toThrow(
      /activated=false/i,
    )
    const part = clone(partitionOf(d))
    delete part[part.findIndex((c: any) => c.status === 'not_measured')].label
    expect(() => assembleCustomerReport(BUNDLE[d], part)).toThrow(
      /specific label/i,
    )
    const unsafe = clone(BUNDLE[d])
    unsafe.clusters[0].narrative.text += ' service department leak'
    expect(() => assembleCustomerReport(unsafe, partitionOf(d))).toThrow(
      /unsafe customer language/i,
    )
    const badCite = clone(BUNDLE[d])
    badCite.clusters[0].implication.cites = ['SW-999']
    expect(() => assembleCustomerReport(badCite, partitionOf(d))).toThrow(
      /non-evaluated/i,
    )
  })

  it('reader rejects the shadow malformed-probe set (bogus status / banana / sideways / missing-nested)', () => {
    const d = '21043'
    // bogus appendix status enum
    const bogusStatus = clone(partitionOf(d))
    bogusStatus[0].status = 'banana'
    expect(() => assembleCustomerReport(BUNDLE[d], bogusStatus)).toThrow(
      /invalid status/i,
    )
    // banana claim type on a narrative
    const banana = clone(BUNDLE[d])
    banana.clusters[0].narrative.claim = 'banana'
    expect(() => assembleCustomerReport(banana, partitionOf(d))).toThrow(
      /invalid claim type/i,
    )
    // sideways enum: comparator not < or >
    const sideways = clone(BUNDLE[d])
    sideways.clusters[0].facts[0].operational_target.comparator = 'sideways'
    expect(() => assembleCustomerReport(sideways, partitionOf(d))).toThrow(
      /not fully structured/i,
    )
    // missing nested field: strip evidence.period.end
    const missNested = clone(BUNDLE[d])
    delete missNested.clusters[0].facts[0].evidence.period.end
    expect(() => assembleCustomerReport(missNested, partitionOf(d))).toThrow(
      /not fully structured/i,
    )
    // missing nested: operational_target.kind
    const missKind = clone(BUNDLE[d])
    delete missKind.clusters[0].facts[0].operational_target.kind
    expect(() => assembleCustomerReport(missKind, partitionOf(d))).toThrow(
      /not fully structured/i,
    )
    // out-of-range rank
    const badRank = clone(BUNDLE[d])
    badRank.clusters[0].facts[0].peer_rank.rank = 9
    expect(() => assembleCustomerReport(badRank, partitionOf(d))).toThrow(
      /not fully structured/i,
    )
    // non-finite value
    const nanVal = clone(BUNDLE[d])
    nanVal.clusters[0].facts[0].value = 'x'
    expect(() => assembleCustomerReport(nanVal, partitionOf(d))).toThrow(
      /not fully structured/i,
    )
  })

  it('reader enforces the exact SW-001..SW-295 catalog set', () => {
    const d = '21043'
    // Rename one not-measured id to a non-catalog id in BOTH the appendix and the visibility theme
    // so consistency checks pass and the exact-catalog-set guard is the one that fires.
    const b2 = clone(BUNDLE[d])
    const part = clone(partitionOf(d))
    const nm = part.find((c: any) => c.status === 'not_measured')
    const oldId = nm.metric_id
    nm.metric_id = 'SW-777'
    for (const t of b2.visibility_plan.themes) {
      const i = t.metric_ids.indexOf(oldId)
      if (i >= 0) t.metric_ids[i] = 'SW-777'
    }
    expect(() => assembleCustomerReport(b2, part)).toThrow(/SW-001\.\.SW-295/)
  })
})
