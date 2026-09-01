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
  definition_compatible_now_ids: Array<string>
  semantic_definition_pending_ids: Array<string>
  rows: Array<{
    metric_id: string
    category: string
    requires_ratified_threshold: boolean
    evaluated: boolean
    required_inputs: string
    missing_inputs: string
    minimum_history: string
    join_or_nlp_required: string
    rationale: string
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
  candidates: Array<{ metric_id: string; promotable_now: boolean }>
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

const cat = Object.fromEntries(DELTA.rows.map((r) => [r.metric_id, r.category]))

const ALLOWED = new Set([
  'definition_compatible_now',
  'semantic_definition_pending',
  'nlp_content_capable_pending',
  'unsupported_field',
  'insufficient_history',
  'other_source_or_join',
  'outside_sales_boundary',
])

describe('Comm capability delta — field-backed repair (Gate 4C1)', () => {
  it('one row per catalog metric (295), none evaluated, reconciles', () => {
    expect(DELTA.total).toBe(295)
    expect(DELTA.reconciles_to_295).toBe(true)
    expect(DELTA.rows.length).toBe(295)
    expect(DELTA.evaluated_count).toBe(0)
    for (const r of DELTA.rows) expect(r.evaluated).toBe(false)
    const ids = new Set(DELTA.rows.map((r) => r.metric_id))
    expect(ids.size).toBe(295)
    for (const c of CATALOG) expect(ids.has(c.metric_id)).toBe(true)
    const sum = Object.values(DELTA.by_category).reduce((a, b) => a + b, 0)
    expect(sum).toBe(295)
  })

  it('taxonomy is the seven honest categories; every row carries field-backed detail', () => {
    for (const r of DELTA.rows) {
      expect(ALLOWED.has(r.category), `${r.metric_id}:${r.category}`).toBe(true)
      expect(r.required_inputs.length).toBeGreaterThan(0)
      expect(r.missing_inputs.length).toBeGreaterThan(0)
      expect(r.minimum_history.length).toBeGreaterThan(0)
      expect(r.join_or_nlp_required.length).toBeGreaterThan(0)
      expect(r.rationale.length).toBeGreaterThan(0)
    }
  })

  it('NO row is definition_compatible_now (nothing is fully specified from this family alone)', () => {
    expect(DELTA.definition_compatible_now_ids).toEqual([])
    expect(DELTA.by_category['definition_compatible_now'] ?? 0).toBe(0)
  })

  it('semantic_definition_pending is EXACTLY the 14 genuinely comm-structural metrics', () => {
    expect(DELTA.semantic_definition_pending_ids).toEqual([
      'SW-019',
      'SW-022',
      'SW-026',
      'SW-076',
      'SW-084',
      'SW-086',
      'SW-089',
      'SW-132',
      'SW-133',
      'SW-134',
      'SW-137',
      'SW-138',
      'SW-140',
      'SW-288',
    ])
    // Every pending row keeps the ratification flag (threshold/semantic choice open).
    for (const r of DELTA.rows)
      if (r.category === 'semantic_definition_pending')
        expect(r.requires_ratified_threshold).toBe(true)
  })

  it('ADVERSARIAL sentinels: every named false-ready class is NOT ready', () => {
    const notReady = (id: string) =>
      cat[id] !== 'definition_compatible_now' &&
      cat[id] !== 'semantic_definition_pending'
    // Absent contact-validity fields.
    for (const id of ['SW-003', 'SW-007', 'SW-091'])
      expect(cat[id], id).toBe('unsupported_field')
    // CRM login / opens-clicks / video-opens are absent fields.
    for (const id of ['SW-025', 'SW-233', 'SW-234', 'SW-235'])
      expect(cat[id], id).toBe('unsupported_field')
    // Message semantics require NLP (never inferred from content_length/presence).
    for (const id of [
      'SW-021',
      'SW-075',
      'SW-153',
      'SW-157',
      'SW-185',
      'SW-206',
      'SW-287',
    ])
      expect(cat[id], id).toBe('nlp_content_capable_pending')
    // Status/sold/vehicle + DMS joins.
    for (const id of ['SW-056', 'SW-094', 'SW-180', 'SW-182', 'SW-198'])
      expect(cat[id], id).toBe('other_source_or_join')
    // Longer-history models.
    for (const id of ['SW-261', 'SW-262', 'SW-295'])
      expect(cat[id], id).toBe('insufficient_history')
    // Already evaluated via the Leads family — this family does not supersede it.
    expect(cat['SW-015'], 'SW-015').toBe('other_source_or_join')
    // SW-176 is Sales-domain sentiment, wrongly pushed outside Sales by the word "service".
    expect(cat['SW-176'], 'SW-176').not.toBe('outside_sales_boundary')
    expect(cat['SW-176'], 'SW-176').toBe('nlp_content_capable_pending')
    // None of the above is ready.
    for (const id of [
      'SW-003',
      'SW-007',
      'SW-025',
      'SW-233',
      'SW-234',
      'SW-235',
      'SW-021',
      'SW-153',
      'SW-176',
      'SW-056',
      'SW-094',
      'SW-180',
      'SW-182',
      'SW-198',
      'SW-261',
      'SW-015',
    ])
      expect(notReady(id), `${id} must not be ready`).toBe(true)
  })

  it('the seven structured candidates are re-audited to semantic_definition_pending, none promoted', () => {
    expect(CANDIDATES.promoted_this_gate).toBe(0)
    for (const c of CANDIDATES.candidates) {
      expect(c.promotable_now).toBe(false)
      expect(cat[c.metric_id], c.metric_id).toBe('semantic_definition_pending')
    }
  })
})
