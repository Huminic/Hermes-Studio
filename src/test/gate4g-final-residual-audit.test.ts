// @vitest-environment node
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { CatalogRow } from '@/server/reports/residual/gate4g-final-residual'
import { CONTENT_SPEC_KEYS } from '@/server/reports/comms/comm-content-metrics'
import {
  buildFinalPartition,
  classifyBoundaryLane,
  deriveFinalResidualIds,
  disposition,
  sortedNewlinePreimage,
} from '@/server/reports/residual/gate4g-final-residual'

// Independent (test-declared, NOT imported from implementation) governing schema + expected shape.
const FROZEN_E1_REQUIRED = [
  'population',
  'numerator',
  'denominator',
  'event_sequence',
  'window',
  'threshold',
  'minimum_sample',
  'minimum_history',
  'exclusions',
  'ambiguity_handling',
  'join_requirements',
  'unit',
  'rank_direction',
  'missing_data_behavior',
].sort()

// The operator-supplied Directive-1 invariant and Directive-2 acquisition counts (test-declared).
const EXPECTED_122_SHA256 =
  'a2b1971aec053b50e4dc010829c81533ffba9e8ddcb9543dd00d03d05ab321e3'
const EXPECTED_ACQUISITION_COUNTS: Record<string, number> = {
  'Vin-native scheduled': 15,
  'Native manual export': 3,
  'Manual CRM inspection': 6,
  'Separate external source required': 55,
  'Unavailable or retention-limited': 8,
  'Outside governed boundary': 35,
}
const EXPECTED_LANE_COUNTS: Record<string, number> = {
  service: 10,
  compliance_legal: 16,
  cross_rooftop: 3,
  enrichment: 6,
}
const BLOCKER_CLASSES = [
  'unsupported_field',
  'other_source_or_join',
  'insufficient_history',
  'semantic_definition_pending',
  'outside_sales_boundary',
]

const url = (p: string) => new URL(`../../${p}`, import.meta.url)
const read = (p: string) => JSON.parse(fs.readFileSync(url(p), 'utf8'))

const MATRIX = read(
  'docs/halo/contract/sw295-gate4g-final-residual-matrix.json',
)
const LEDGER = read(
  'docs/halo/evidence/m1r/residual/gate4g-acquisition-action-ledger.json',
)
const RECON = read(
  'docs/halo/evidence/m1r/residual/gate4g-portfolio-reconciliation.json',
)
const CATALOG = read(
  'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
)
const DELTA = read('docs/halo/contract/sw295-comm-capability-delta.json')
const SPINE = read('docs/halo/evidence/m1r/evaluator/spine-summary.json')
const COMM = read('docs/halo/evidence/m1r/comms/comm-evaluation-ledger.json')
const CONTENT = read(
  'docs/halo/evidence/m1r/comms/comm-content-portfolio-reconciliation.json',
)
const GATE4F = read(
  'docs/halo/contract/sw295-gate4f-scheduled-residual-matrix.json',
)

const catalogRow = (r: Record<string, unknown>): CatalogRow => ({
  metric_id: String(r.metric_id),
  section: String(r.section ?? ''),
  subsection: String(r.subsection ?? ''),
  condition: String(r.condition ?? ''),
  acquisition_class: String(r.acquisition_class ?? ''),
  source: String(r.source ?? ''),
  period_grain_population: String(r.period_grain_population ?? ''),
  owner: String(r.owner ?? ''),
  next_action: String(r.next_action ?? ''),
})

// Independent re-derivation of the final 122 residual IDs from raw committed inputs.
function priorSets() {
  const prior = new Set<string>([
    ...SPINE.evaluated_ids,
    ...COMM.evaluated_ids,
    ...CONTENT.content_promoted_ids,
  ])
  const content75 = new Set<string>(
    DELTA.rows
      .filter(
        (r: { category: string }) =>
          r.category === 'nlp_content_capable_pending',
      )
      .map((r: { metric_id: string }) => r.metric_id),
  )
  const contentHold = new Set([...content75].filter((id) => !prior.has(id)))
  const gate4fHold = new Set<string>(GATE4F.held_ids)
  return { prior, contentHold, gate4fHold }
}

function independentResidual(): Array<string> {
  const { prior, contentHold, gate4fHold } = priorSets()
  const allIds = CATALOG.map((r: Record<string, unknown>) =>
    String(r.metric_id),
  )
  return deriveFinalResidualIds(allIds, prior, contentHold, gate4fHold)
}

describe('Gate 4G — final residual audit', () => {
  it('audits exactly 122 unique residual IDs, independently re-derived, matching the matrix', () => {
    const derived = independentResidual()
    expect(derived).toHaveLength(122)
    expect(new Set(derived).size).toBe(122)
    expect(MATRIX.rows.map((r: { metric_id: string }) => r.metric_id)).toEqual(
      derived,
    )
    expect(MATRIX.held_ids).toEqual(derived)
    // SW-084 was previously audited & held (Directive 2 note): it is in the final residual.
    expect(derived).toContain('SW-084')
  })

  it('Directive 1: sorted-newline SHA-256 of the 122 IDs equals the operator invariant', () => {
    const derived = independentResidual()
    const sha = createHash('sha256')
      .update(sortedNewlinePreimage(derived))
      .digest('hex')
    expect(sha).toBe(EXPECTED_122_SHA256)
    expect(MATRIX.derivation.sorted_newline_sha256).toBe(EXPECTED_122_SHA256)
    // Fixed-width IDs: lexicographic and numeric order coincide (guards the preimage definition).
    const lex = [...derived].sort()
    expect(lex).toEqual(derived)
  })

  it('Directive 2: acquisition-class counts are exactly 15/3/6/55/8/35 (derived from the matrix)', () => {
    const byId = new Map(
      CATALOG.map((r: Record<string, unknown>) => [
        String(r.metric_id),
        catalogRow(r),
      ]),
    )
    const tally = new Map<string, number>()
    for (const id of independentResidual()) {
      const ac = (byId.get(id) as CatalogRow).acquisition_class
      tally.set(ac, (tally.get(ac) ?? 0) + 1)
    }
    expect(Object.fromEntries(tally)).toEqual(EXPECTED_ACQUISITION_COUNTS)
    expect([...tally.values()].reduce((a, b) => a + b, 0)).toBe(122)
    expect(MATRIX.acquisition_class_tally).toEqual(EXPECTED_ACQUISITION_COUNTS)
  })

  it('promotes 0 and holds 122 — none is definition_compatible_now (0 is DERIVED)', () => {
    expect(MATRIX.totals).toMatchObject({
      candidates: 122,
      promoted: 0,
      held: 122,
      rooftop_cells: 366,
      evaluated_cells: 0,
      held_cells: 366,
    })
    expect(MATRIX.promoted_ids).toEqual([])
    expect(
      MATRIX.rows.every(
        (r: { disposition: string }) => r.disposition === 'HOLD',
      ),
    ).toBe(true)
    expect(disposition('definition_compatible_now')).toBe('PROMOTE')
    const deltaById = new Map(
      DELTA.rows.map((r: { metric_id: string }) => [r.metric_id, r]),
    )
    for (const r of MATRIX.rows)
      expect(
        (deltaById.get(r.metric_id) as { category: string }).category,
      ).not.toBe('definition_compatible_now')
  })

  it('Directive 3: outside-boundary rows are sub-laned 10/16/3/6; others not_applicable', () => {
    const byId = new Map(
      CATALOG.map((r: Record<string, unknown>) => [
        String(r.metric_id),
        catalogRow(r),
      ]),
    )
    const laneTally = new Map<string, number>()
    for (const r of MATRIX.rows) {
      if (r.acquisition_class === 'Outside governed boundary') {
        expect(r.boundary_lane).not.toBe('not_applicable')
        // Independently re-classify from the committed condition text and require agreement.
        const lane = classifyBoundaryLane(byId.get(r.metric_id) as CatalogRow)
        expect(r.boundary_lane).toBe(lane)
        laneTally.set(lane, (laneTally.get(lane) ?? 0) + 1)
      } else {
        expect(r.boundary_lane).toBe('not_applicable')
      }
    }
    expect(Object.fromEntries(laneTally)).toEqual(EXPECTED_LANE_COUNTS)
    expect([...laneTally.values()].reduce((a, b) => a + b, 0)).toBe(35)
    expect(MATRIX.outside_boundary_lane_tally).toEqual(EXPECTED_LANE_COUNTS)
    // SW-199 (Service-domain) must NOT be mislabeled compliance by its "Red Flags" section title.
    const sw199 = MATRIX.rows.find(
      (r: { metric_id: string }) => r.metric_id === 'SW-199',
    )
    expect(sw199.boundary_lane).toBe('service')
  })

  it('Directive 3: the 3 ResponseTimes CSV manual exports are the next authorized acquisition', () => {
    expect(LEDGER.next_authorized_acquisition.metric_ids).toEqual([
      'SW-013',
      'SW-016',
      'SW-017',
    ])
    expect(LEDGER.next_authorized_acquisition.source).toBe(
      'Dealer Dashboard Response Times Opportunities CSV',
    )
    const byId = new Map(
      CATALOG.map((r: Record<string, unknown>) => [
        String(r.metric_id),
        catalogRow(r),
      ]),
    )
    for (const id of ['SW-013', 'SW-016', 'SW-017'])
      expect((byId.get(id) as CatalogRow).source).toBe(
        'Dealer Dashboard Response Times Opportunities CSV',
      )
  })

  it('every row carries a frozen_e1_spec with EXACTLY the 14 governing keys, non-executable', () => {
    expect(MATRIX.frozen_e1_spec_schema.slice().sort()).toEqual(
      FROZEN_E1_REQUIRED,
    )
    for (const r of MATRIX.rows) {
      expect(Object.keys(r.frozen_e1_spec).sort()).toEqual(FROZEN_E1_REQUIRED)
      const s = r.frozen_e1_spec
      expect(s.numerator).toBe('unresolved (held)')
      expect(s.denominator).toBe('unresolved (held)')
      expect(s.threshold).toBe('unresolved (held)')
      expect(s.window).toBe('unresolved (held)')
      expect(s.minimum_history).toBe('unresolved (held)')
      expect(s.missing_data_behavior).toBe('unresolved; missing is never zero')
      expect(s.exclusions).toMatch(/Sales-only/)
    }
  })

  it('NEGATIVE regression: the evaluator-metadata schema cannot satisfy the frozen contract', () => {
    expect([...CONTENT_SPEC_KEYS].sort()).not.toEqual(FROZEN_E1_REQUIRED)
    expect(CONTENT_SPEC_KEYS.length).toBe(14)
    expect(CONTENT_SPEC_KEYS.includes('detection_threshold' as never)).toBe(
      true,
    )
    expect(FROZEN_E1_REQUIRED.includes('detection_threshold')).toBe(false)
  })

  it('each HOLD records a traceable blocker, classification, owner, safe action, approval boundary', () => {
    const deltaById = new Map(
      DELTA.rows.map((r: { metric_id: string }) => [r.metric_id, r]),
    )
    const catById = new Map(
      CATALOG.map((r: Record<string, unknown>) => [
        String(r.metric_id),
        catalogRow(r),
      ]),
    )
    for (const r of MATRIX.rows) {
      const d = deltaById.get(r.metric_id) as {
        category: string
        rationale: string
      }
      const c = catById.get(r.metric_id) as CatalogRow
      // blocker_class is the committed capability category verbatim (traceable).
      expect(BLOCKER_CLASSES).toContain(r.blocker_class)
      expect(r.blocker_class).toBe(d.category)
      expect(r.primary_blocker).toBe(d.rationale)
      expect(r.primary_blocker.length).toBeGreaterThan(0)
      expect(r.owner).toBe(c.owner)
      expect(r.next_safe_action).toBe(c.next_action)
      // Full classification vector + a non-empty approval boundary are present.
      for (const k of [
        'source',
        'field',
        'history',
        'threshold',
        'join',
        'authority',
      ])
        expect(typeof r.classification[k]).toBe('string')
      expect(r.approval_boundary.length).toBeGreaterThan(0)
    }
  })

  it('blocker-class tally is disjoint over the 122 and matches per-row counts', () => {
    const tally = new Map<string, number>()
    for (const r of MATRIX.rows)
      tally.set(r.blocker_class, (tally.get(r.blocker_class) ?? 0) + 1)
    expect(MATRIX.blocker_class_tally).toEqual(Object.fromEntries(tally))
    expect([...tally.values()].reduce((a, b) => a + b, 0)).toBe(122)
    for (const k of tally.keys()) expect(BLOCKER_CLASSES).toContain(k)
  })

  it('disjoint 295-ID / 885-cell partition with ZERO unaudited; prior 51 evaluated preserved', () => {
    const { prior, contentHold, gate4fHold } = priorSets()
    const allIds = new Set<string>(
      CATALOG.map((r: Record<string, unknown>) => String(r.metric_id)),
    )
    const part = buildFinalPartition(
      allIds,
      prior,
      contentHold,
      gate4fHold,
      new Set(independentResidual()),
    )
    expect(part).toEqual({
      evaluated: 17,
      gate4e_content_hold: 70,
      gate4f_hold: 86,
      gate4g_hold: 122,
      residual_unaudited: 0,
    })
    expect(
      part.evaluated +
        part.gate4e_content_hold +
        part.gate4f_hold +
        part.gate4g_hold +
        part.residual_unaudited,
    ).toBe(295)
    expect(RECON.id_partition).toEqual(part)
    expect(RECON.unaudited_ids).toBe(0)
    expect(RECON.required_cells).toBe(885)
    expect(RECON.evaluated).toBe(51)
    expect(RECON.unresolved).toBe(834)
    expect(RECON.gate4g_new_evaluated_cells).toBe(0)
    expect(RECON.gate4g_held_cells).toBe(366)
    expect(CONTENT.evaluated).toBe(51)
    expect(CONTENT.unresolved).toBe(834)
    expect(
      RECON.cell_partition.evaluated +
        RECON.cell_partition.gate4e_content_hold +
        RECON.cell_partition.gate4f_hold +
        RECON.cell_partition.gate4g_hold +
        RECON.cell_partition.residual_unaudited,
    ).toBe(885)
  })

  it('acquisition-action ledger reconciles per-class + lane IDs to the 122 held rows', () => {
    expect(LEDGER.held).toBe(122)
    expect(LEDGER.promoted).toBe(0)
    const classIds = LEDGER.by_acquisition_class.flatMap(
      (c: { metric_ids: Array<string> }) => c.metric_ids,
    )
    expect(new Set(classIds).size).toBe(122)
    expect([...classIds].sort()).toEqual([...MATRIX.held_ids].sort())
    const laneIds = LEDGER.outside_boundary_lanes.flatMap(
      (l: { metric_ids: Array<string> }) => l.metric_ids,
    )
    expect(new Set(laneIds).size).toBe(35)
  })

  it('R1 regression: SW-050 preserves observed eligible new-car denominator = 0, held UNRESOLVED not zero', () => {
    const r = MATRIX.rows.find(
      (x: { metric_id: string }) => x.metric_id === 'SW-050',
    )
    expect(r, 'SW-050 row present').toBeTruthy()
    // Stays HOLD and NEVER value=0: the frozen ratio fields remain unresolved.
    expect(r.disposition).toBe('HOLD')
    expect(r.frozen_e1_spec.numerator).toBe('unresolved (held)')
    expect(r.frozen_e1_spec.denominator).toBe('unresolved (held)')
    expect(r.frozen_e1_spec.missing_data_behavior).toBe(
      'unresolved; missing is never zero',
    )
    // The OBSERVED zero eligible denominator is explicitly preserved and traceable to the source.
    const oe = r.observed_evidence
    expect(oe).toBeTruthy()
    expect(oe.source_ref).toBe(
      'docs/halo/contract/sw295-structured-candidate-matrix.json',
    )
    expect(oe.structured_blocker_class).toBe('zero_or_absent_denominator')
    expect(oe.eligible_denominator_observed['21043'].new_deals).toBe(0)
    expect(oe.eligible_denominator_observed['21044'].new_deals).toBe(0)
    expect(oe.eligible_denominator_observed['21047'].new_deals).toBe(4)
    for (const d of ['21043', '21044'])
      expect(oe.eligible_denominator_observed[d].denominator_status).toMatch(
        /UNRESOLVED, never value=0/,
      )
    // Independently cross-check against the committed structured-candidate matrix.
    const STRUCT = read(
      'docs/halo/contract/sw295-structured-candidate-matrix.json',
    )
    const cand = STRUCT.candidates.find(
      (c: { metric_id: string }) => c.metric_id === 'SW-050',
    )
    expect(cand.observed_crm_new_car_deals['21043'].new_deals).toBe(0)
    expect(cand.observed_crm_new_car_deals['21044'].new_deals).toBe(0)
    // additional_blockers carries the observed-denominator line; explains ratio + unlock.
    expect(
      r.additional_blockers.some((b: string) =>
        /observed: eligible ratio denominator = 0/.test(b),
      ),
    ).toBe(true)
    expect(oe.why_unresolved).toMatch(/missing is never zero/)
    expect(oe.unlock).toMatch(/eligible new-car-deal population/)
    // observed_evidence is present on exactly the five evidence-fidelity IDs (SW-050 R1 + four R2).
    expect(
      MATRIX.rows
        .filter((x: { observed_evidence?: unknown }) => x.observed_evidence)
        .map((x: { metric_id: string }) => x.metric_id)
        .sort(),
    ).toEqual(['SW-034', 'SW-049', 'SW-050', 'SW-111', 'SW-114'])
    // Ledger memorializes SW-050's observed fact in the dedicated (unchanged) block.
    const led = LEDGER.observed_zero_or_absent_denominator
    expect(led).toHaveLength(1)
    expect(led[0].metric_id).toBe('SW-050')
    expect(led[0].eligible_denominator_observed['21043'].new_deals).toBe(0)
    expect(led[0].held_not_zero).toMatch(/never 0/)
  })

  it('R2 regression: SW-034/049/111/114 preserve each own primary blocker + committed rooftop observations, held UNRESOLVED not zero', () => {
    const STRUCT = read(
      'docs/halo/contract/sw295-structured-candidate-matrix.json',
    )
    const deltaById = new Map(
      DELTA.rows.map((r: { metric_id: string }) => [r.metric_id, r]),
    )
    const structById = new Map(
      STRUCT.candidates.map((c: { metric_id: string }) => [c.metric_id, c]),
    )
    const rowById = new Map(
      MATRIX.rows.map((r: { metric_id: string }) => [r.metric_id, r]),
    )

    // Each ID keeps its OWN committed primary blocker (delta rationale/category unchanged) AND
    // stays HOLD/UNRESOLVED (never value=0), with the observed line + observed_evidence attached.
    for (const id of ['SW-034', 'SW-049', 'SW-111', 'SW-114']) {
      const r = rowById.get(id) as {
        disposition: string
        primary_blocker: string
        blocker_class: string
        additional_blockers: Array<string>
        observed_evidence: {
          source_ref: string
          structured_blocker_class: string
          relation_to_primary_blocker: string
          observed_denominator_statement: string
          observed_context_counts?: Record<string, { new_deals: number }>
        }
        frozen_e1_spec: { numerator: string; denominator: string }
      }
      const d = deltaById.get(id) as { rationale: string; category: string }
      const s = structById.get(id) as { blocker_class: string }
      expect(r.disposition).toBe('HOLD')
      expect(r.primary_blocker).toBe(d.rationale)
      expect(r.blocker_class).toBe(d.category)
      expect(r.frozen_e1_spec.numerator).toBe('unresolved (held)')
      expect(r.frozen_e1_spec.denominator).toBe('unresolved (held)')
      const oe = r.observed_evidence
      expect(oe).toBeTruthy()
      expect(oe.source_ref).toBe(
        'docs/halo/contract/sw295-structured-candidate-matrix.json',
      )
      // structured_blocker_class is the committed structured-matrix class verbatim (traceable).
      expect(oe.structured_blocker_class).toBe(s.blocker_class)
      expect(oe.relation_to_primary_blocker.length).toBeGreaterThan(0)
      expect(
        r.additional_blockers.some((b) => /^observed:.*never value=0/.test(b)),
      ).toBe(true)
    }

    // Per-rooftop committed new-car deal facts (0/0/4) preserved verbatim for the three CRM IDs.
    for (const id of ['SW-034', 'SW-049', 'SW-111']) {
      const r = rowById.get(id) as {
        observed_evidence: {
          observed_context_counts: Record<string, { new_deals: number }>
        }
      }
      const s = structById.get(id) as {
        observed_crm_new_car_deals: Record<string, { new_deals: number }>
      }
      const cc = r.observed_evidence.observed_context_counts
      expect(cc['21043'].new_deals).toBe(0)
      expect(cc['21044'].new_deals).toBe(0)
      expect(cc['21047'].new_deals).toBe(4)
      // Cross-check against the committed structured-candidate matrix, rooftop by rooftop.
      for (const roof of ['21043', '21044', '21047'])
        expect(cc[roof].new_deals).toBe(
          s.observed_crm_new_car_deals[roof].new_deals,
        )
    }

    // SW-034 primary is the absent write-up denominator; SW-049/SW-111 primary stays history/trend.
    const sw034 = rowById.get('SW-034') as {
      observed_evidence: { relation_to_primary_blocker: string }
    }
    expect(sw034.observed_evidence.relation_to_primary_blocker).toMatch(
      /^primary/,
    )
    for (const id of ['SW-049', 'SW-111']) {
      const r = rowById.get(id) as {
        observed_evidence: { relation_to_primary_blocker: string }
      }
      expect(r.observed_evidence.relation_to_primary_blocker).toMatch(
        /^secondary/,
      )
    }

    // SW-114 has NO per-rooftop counts (none committed); its observed fact is the write-up TOTAL = 0
    // co-primary with an unratified composite threshold.
    const sw114 = rowById.get('SW-114') as {
      observed_evidence: {
        relation_to_primary_blocker: string
        observed_denominator_statement: string
        observed_context_counts?: unknown
      }
    }
    expect(sw114.observed_evidence.observed_context_counts).toBeUndefined()
    expect(sw114.observed_evidence.relation_to_primary_blocker).toMatch(
      /^co-primary/,
    )
    expect(sw114.observed_evidence.observed_denominator_statement).toMatch(
      /write-up TOTAL is 0/,
    )
    const s114 = structById.get('SW-114') as {
      observed_crm_new_car_deals?: unknown
    }
    expect(s114.observed_crm_new_car_deals).toBeUndefined()

    // Ledger memorializes the four in a dedicated R2 block, separate from SW-050's.
    const led2 = LEDGER.observed_metric_evidence
    expect(led2.map((e: { metric_id: string }) => e.metric_id)).toEqual([
      'SW-034',
      'SW-049',
      'SW-111',
      'SW-114',
    ])
    for (const e of led2)
      expect(e.held_not_zero).toMatch(/never recorded as value 0|never 0/)
    // SW-050 is NOT duplicated into the R2 block.
    expect(
      led2.some((e: { metric_id: string }) => e.metric_id === 'SW-050'),
    ).toBe(false)
  })

  it('R3 regression: SW-114 threshold contradiction fixed; ledger held_not_zero matches each blocker (no mismatch)', () => {
    // Fix 1: SW-114's row now truthfully requires threshold ratification for the composite; the old
    // "no ratified threshold required" contradiction against its co-primary threshold fact is gone.
    const sw114 = MATRIX.rows.find(
      (r: { metric_id: string }) => r.metric_id === 'SW-114',
    )
    expect(sw114.classification.threshold).toMatch(
      /ratified threshold required/,
    )
    expect(sw114.classification.threshold).not.toBe(
      'no ratified threshold required',
    )
    expect(sw114.observed_evidence.requires_ratified_threshold).toBe(true)
    // The observed line and statement both name the unratified composite threshold.
    expect(
      sw114.additional_blockers.some((b: string) => /threshold/.test(b)),
    ).toBe(true)
    // No other row's threshold classification is disturbed (composite override is SW-114-only).
    expect(
      MATRIX.rows.filter((r: { classification: { threshold: string } }) =>
        /per structured audit/.test(r.classification.threshold),
      ).length,
    ).toBe(1)

    // Fix 2: each R2 ledger held_not_zero MATCHES its own primary blocker — no false attribution of
    // the history/trend-primary IDs to an absent/zero denominator.
    const led2 = LEDGER.observed_metric_evidence
    const byId = new Map(
      led2.map((e: { metric_id: string }) => [e.metric_id, e]),
    )
    for (const e of led2) {
      const rel = e.relation_to_primary_blocker as string
      const hnz = e.held_not_zero as string
      expect(hnz).toMatch(/never (recorded as )?value ?= ?0|never 0/)
      if (rel.startsWith('secondary')) {
        // History/trend-primary: attributed to trend/history, counts explicitly secondary context,
        // and explicitly NOT to a zero/absent denominator.
        expect(hnz).toMatch(/trend|history/)
        expect(hnz).toMatch(/secondary context/)
        expect(hnz).toMatch(/not on a zero\/absent denominator/)
      }
    }
    // SW-034 (absent denominator) names the absent field; SW-114 (co-primary) names BOTH the zero
    // write-up total and the threshold.
    expect(
      (byId.get('SW-034') as { held_not_zero: string }).held_not_zero,
    ).toMatch(/absent/i)
    const h114 = (byId.get('SW-114') as { held_not_zero: string }).held_not_zero
    expect(h114).toMatch(/write-up TOTAL = 0/)
    expect(h114).toMatch(/threshold/)
    // SW-049 and SW-111 must NOT be described as denominator-blocked as their primary reason.
    for (const id of ['SW-049', 'SW-111']) {
      const rel = (byId.get(id) as { relation_to_primary_blocker: string })
        .relation_to_primary_blocker
      expect(rel).toMatch(/^secondary/)
    }
  })
})
