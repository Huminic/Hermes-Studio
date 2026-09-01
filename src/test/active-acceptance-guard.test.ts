// @vitest-environment node
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

// Regression guard for the ACTIVE unshrinkable goal: the historical SW295 R5
// artifact (2 of 295 directly evaluated) must never be accepted as satisfying the
// active 295/295 × 3-rooftop (885-cell) acceptance.
const ACCEPT = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../docs/halo/contract/active-295-acceptance.json',
      import.meta.url,
    ),
    'utf8',
  ),
)

describe('Active 295-acceptance regression guard', () => {
  it('acceptance requires all 885 cells (295 × 3)', () => {
    expect(ACCEPT.conditions).toBe(295)
    expect(ACCEPT.dealers).toBe(3)
    expect(ACCEPT.required_cells).toBe(295 * 3)
    expect(ACCEPT.required_cells).toBe(885)
  })

  it('the R5 checkpoint is 6 evaluated dealer-cells (2 conditions × 3), not 2 of 885', () => {
    const r5 = ACCEPT.superseded_checkpoint
    expect(r5.directly_evaluated_conditions).toBe(2)
    // Exactly 6 dealer-cells (2 × 3), far short of 885 — and stated as 6, not 2.
    expect(r5.evaluated_dealer_cells).toBe(6)
    expect(r5.directly_evaluated_conditions * ACCEPT.dealers).toBe(
      r5.evaluated_dealer_cells,
    )
    expect(r5.evaluated_dealer_cells).toBeLessThan(ACCEPT.required_cells)
    expect(String(r5.why_insufficient)).toMatch(/6 of 885/i)
    expect(String(r5.why_insufficient)).not.toMatch(/\b2 of 885\b/)
  })

  it('completion is unshrinkable: withheld/cataloged/accounted do NOT count', () => {
    const c = ACCEPT.completion_rule
    expect(c.unshrinkable).toBe(true)
    expect(c.withheld_counts_toward_completion).toBe(false)
    expect(c.cataloged_or_accounted_counts_toward_completion).toBe(false)
    expect(c.uncalculable_or_unbaselineable_is_unresolved).toBe(true)
    // The goal predicate must not offer "explicitly withheld" as a way to complete a cell.
    expect(String(ACCEPT.goal).toLowerCase()).not.toContain('withheld')
    expect(String(ACCEPT.goal)).toMatch(/CALCULATED/)
  })

  it('landing an input family is necessary but NOT sufficient', () => {
    expect(ACCEPT.input_gates.landed_families).toContain(
      'vinsolutions_custom_reporting_leads',
    )
    expect(String(ACCEPT.input_gates.note)).toMatch(/NOT sufficient/i)
  })
})
