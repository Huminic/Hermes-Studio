// @vitest-environment node
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CatalogRow } from '@/server/reports/residual/gate4f-scheduled-residual'
import { CONTENT_SPEC_KEYS } from '@/server/reports/comms/comm-content-metrics'
import {
  buildPartition,
  deriveResidualIds,
  disposition,
} from '@/server/reports/residual/gate4f-scheduled-residual'

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

const TARGET_CLASS = 'Scheduled source plus downstream calculation/NLP'
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
  'docs/halo/contract/sw295-gate4f-scheduled-residual-matrix.json',
)
const LEDGER = read(
  'docs/halo/evidence/m1r/residual/gate4f-evaluated-cell-ledger.json',
)
const RECON = read(
  'docs/halo/evidence/m1r/residual/gate4f-portfolio-reconciliation.json',
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

// Independent re-derivation of the 86 residual IDs from raw committed inputs.
function independentResidual(): Array<string> {
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
  const rows: Array<CatalogRow> = CATALOG.map((r: Record<string, unknown>) => ({
    metric_id: String(r.metric_id),
    section: '',
    subsection: '',
    condition: '',
    acquisition_class: String(r.acquisition_class ?? ''),
    source: '',
    period_grain_population: '',
    owner: '',
    next_action: '',
  }))
  return deriveResidualIds(rows, prior, content75)
}

describe('Gate 4F — scheduled-source residual audit', () => {
  it('audits exactly 86 unique residual IDs, independently re-derived', () => {
    const derived = independentResidual()
    expect(derived).toHaveLength(86)
    expect(new Set(derived).size).toBe(86)
    // Committed matrix covers exactly the independently derived set, in index order.
    expect(MATRIX.rows.map((r: { metric_id: string }) => r.metric_id)).toEqual(
      derived,
    )
    expect(MATRIX.held_ids).toEqual(derived)
  })

  it('promotes 0 and holds 86 (evidence-backed, all under target acquisition class)', () => {
    expect(MATRIX.totals).toMatchObject({
      candidates: 86,
      promoted: 0,
      held: 86,
      rooftop_cells: 258,
      evaluated_cells: 0,
      held_cells: 258,
    })
    expect(MATRIX.promoted_ids).toEqual([])
    expect(
      MATRIX.rows.every(
        (r: { disposition: string }) => r.disposition === 'HOLD',
      ),
    ).toBe(true)
    const byId = new Map(
      CATALOG.map((r: Record<string, unknown>) => [String(r.metric_id), r]),
    )
    for (const r of MATRIX.rows)
      expect(
        (byId.get(r.metric_id) as { acquisition_class: string })
          .acquisition_class,
      ).toBe(TARGET_CLASS)
  })

  it('disposition() promotes only definition_compatible_now; every residual ID is a blocker', () => {
    expect(disposition('definition_compatible_now')).toBe('PROMOTE')
    for (const cls of BLOCKER_CLASSES) expect(disposition(cls)).toBe('HOLD')
    const deltaById = new Map(
      DELTA.rows.map((r: { metric_id: string }) => [r.metric_id, r]),
    )
    // None of the 86 is definition_compatible_now (so 0 promote is DERIVED, not asserted-in).
    for (const r of MATRIX.rows)
      expect(
        (deltaById.get(r.metric_id) as { category: string }).category,
      ).not.toBe('definition_compatible_now')
  })

  it('every row carries a frozen_e1_spec with EXACTLY the 14 governing keys', () => {
    expect(MATRIX.frozen_e1_spec_schema.slice().sort()).toEqual(
      FROZEN_E1_REQUIRED,
    )
    for (const r of MATRIX.rows)
      expect(Object.keys(r.frozen_e1_spec).sort()).toEqual(FROZEN_E1_REQUIRED)
  })

  it('HOLD frozen specs are non-executable and carry the standing missing-data rule', () => {
    for (const r of MATRIX.rows) {
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
    // A row whose spec used CONTENT_SPEC_KEYS would fail the exact-14-key assertion above.
    expect(CONTENT_SPEC_KEYS.length).toBe(14)
    expect(CONTENT_SPEC_KEYS.includes('detection_threshold' as never)).toBe(
      true,
    )
    expect(FROZEN_E1_REQUIRED.includes('detection_threshold')).toBe(false)
  })

  it('each HOLD records a traceable blocker: class, primary blocker, prerequisites, owner, action', () => {
    const deltaById = new Map(
      DELTA.rows.map((r: { metric_id: string }) => [r.metric_id, r]),
    )
    const catById = new Map(
      CATALOG.map((r: Record<string, unknown>) => [String(r.metric_id), r]),
    )
    for (const r of MATRIX.rows) {
      const d = deltaById.get(r.metric_id) as {
        category: string
        rationale: string
      }
      const c = catById.get(r.metric_id) as {
        owner: string
        next_action: string
      }
      // blocker_class is the committed capability category verbatim (traceable).
      expect(BLOCKER_CLASSES).toContain(r.blocker_class)
      expect(r.blocker_class).toBe(d.category)
      expect(r.category).toBe(d.category)
      // primary_blocker is the committed rationale; owner/next_action are the committed catalog.
      expect(r.primary_blocker).toBe(d.rationale)
      expect(r.primary_blocker.length).toBeGreaterThan(0)
      expect(r.owner).toBe(c.owner)
      expect(r.next_action).toBe(c.next_action)
      expect(r.prerequisites).toHaveLength(4)
      expect(r.prerequisites[3]).toMatch(/contract_2_requirement:/)
    }
  })

  it('blocker-class tally is disjoint over the 86 and matches per-row counts', () => {
    const tally = new Map<string, number>()
    for (const r of MATRIX.rows)
      tally.set(r.blocker_class, (tally.get(r.blocker_class) ?? 0) + 1)
    expect(MATRIX.blocker_class_tally).toEqual(Object.fromEntries(tally))
    expect([...tally.values()].reduce((a, b) => a + b, 0)).toBe(86)
    for (const k of tally.keys()) expect(BLOCKER_CLASSES).toContain(k)
  })

  it('disjoint 295-ID / 885-cell partition; prior 51 evaluated preserved exactly', () => {
    const allIds = new Set<string>(
      CATALOG.map((r: Record<string, unknown>) => String(r.metric_id)),
    )
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
    const part = buildPartition(
      allIds,
      prior,
      contentHold,
      new Set(independentResidual()),
    )
    expect(part).toEqual({
      evaluated: 17,
      gate4e_content_hold: 70,
      gate4f_hold: 86,
      residual_unaudited: 122,
    })
    expect(
      part.evaluated +
        part.gate4e_content_hold +
        part.gate4f_hold +
        part.residual_unaudited,
    ).toBe(295)
    // Reconciliation artifact agrees, and the prior 51/834 is byte-preserved.
    expect(RECON.id_partition).toEqual(part)
    expect(RECON.required_cells).toBe(885)
    expect(RECON.evaluated).toBe(51)
    expect(RECON.unresolved).toBe(834)
    expect(RECON.gate4f_new_evaluated_cells).toBe(0)
    expect(RECON.gate4f_held_cells).toBe(258)
    expect(CONTENT.evaluated).toBe(51)
    expect(CONTENT.unresolved).toBe(834)
    expect(
      RECON.cell_partition.evaluated +
        RECON.cell_partition.gate4e_content_hold +
        RECON.cell_partition.gate4f_hold +
        RECON.cell_partition.residual_unaudited,
    ).toBe(885)
  })

  it('ledger records 0 evaluated cells and 258 held cells consistent with the matrix', () => {
    expect(LEDGER.evaluated_ids).toEqual([])
    expect(LEDGER.evaluated_cells).toBe(0)
    expect(LEDGER.held_ids).toEqual(MATRIX.held_ids)
    expect(LEDGER.held_cells).toBe(258)
    expect(LEDGER.held).toHaveLength(86)
    for (const h of LEDGER.held) {
      expect(h.rooftops).toHaveLength(3)
      expect(
        h.rooftops.every((c: { status: string }) => c.status === 'unresolved'),
      ).toBe(true)
    }
  })
})
