// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = path.resolve(__dirname, '..', '..')
const DELTA = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/contract/sw295-comm-capability-delta.json'),
    'utf8',
  ),
) as {
  total: number
  reconciles_to_295: boolean
  evaluated_count: number
  categories: Array<string>
  by_category: Record<string, number>
  structured_candidates: Array<string>
  rows: Array<{
    metric_id: string
    category: string
    requires_ratified_threshold: boolean
    evaluated: boolean
  }>
}
const CANDIDATES = JSON.parse(
  fs.readFileSync(
    path.join(
      REPO,
      'docs/halo/contract/enhanced-comm-structured-candidates.json',
    ),
    'utf8',
  ),
) as {
  promoted_this_gate: number
  candidates: Array<{
    metric_id: string
    promotable_now: boolean
    semantic_choices_for_ratification: Array<string>
  }>
}

const CATALOG = JSON.parse(
  fs.readFileSync(
    path.join(
      REPO,
      'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
    ),
    'utf8',
  ),
) as Array<{ metric_id: string }>

describe('Enhanced weekly Communication Log — capability delta (Gate 4C1)', () => {
  it('is one row per catalog metric (exactly 295), none evaluated', () => {
    expect(DELTA.total).toBe(295)
    expect(DELTA.reconciles_to_295).toBe(true)
    expect(DELTA.rows.length).toBe(295)
    expect(DELTA.evaluated_count).toBe(0)
    for (const r of DELTA.rows) expect(r.evaluated).toBe(false)
    // Exact catalog coverage (same metric ids, no dup, no gap).
    const deltaIds = new Set(DELTA.rows.map((r) => r.metric_id))
    const catalogIds = new Set(CATALOG.map((c) => c.metric_id))
    expect(deltaIds.size).toBe(295)
    expect([...catalogIds].every((id) => deltaIds.has(id))).toBe(true)
  })

  it('every row uses exactly one of the six controller categories', () => {
    const allowed = new Set(DELTA.categories)
    expect(allowed.size).toBe(6)
    for (const r of DELTA.rows) expect(allowed.has(r.category)).toBe(true)
    const sum = Object.values(DELTA.by_category).reduce((a, b) => a + b, 0)
    expect(sum).toBe(295)
  })

  it('the seven structured candidates are definition_compatible_now + require ratification, none promoted', () => {
    expect(CANDIDATES.promoted_this_gate).toBe(0)
    const seven = [
      'SW-019',
      'SW-022',
      'SW-076',
      'SW-132',
      'SW-134',
      'SW-137',
      'SW-138',
    ]
    expect(DELTA.structured_candidates).toEqual(seven)
    for (const id of seven) {
      const row = DELTA.rows.find((r) => r.metric_id === id)!
      expect(row.category).toBe('definition_compatible_now')
      expect(row.requires_ratified_threshold).toBe(true)
    }
    // Every candidate rule flags at least one semantic choice and is not promotable.
    for (const c of CANDIDATES.candidates) {
      expect(c.promotable_now).toBe(false)
      expect(c.semantic_choices_for_ratification.length).toBeGreaterThan(0)
    }
    expect(CANDIDATES.candidates.map((c) => c.metric_id).sort()).toEqual(seven)
  })
})
