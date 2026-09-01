// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DECISIONS_TABLE,
  validateAndIndex,
} from '../../scripts/m1r-comms/comm-capability-decisions'
import { DERIVATIVE_SCHEMA_FIELDS } from '@/server/reports/comms/comm-family-contract'

const REPO = path.resolve(__dirname, '..', '..')
type Row = {
  metric_id: string
  category: string
  requires_ratified_threshold: boolean
  evaluated: boolean
  required_inputs: string
  admitted_fields_satisfying: Array<string>
  missing_inputs: string
  minimum_history: string
  join_or_nlp_required: string
  rationale: string
  decided_by: string
  external_required_input?: string
}
const DELTA = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/contract/sw295-comm-capability-delta.json'),
    'utf8',
  ),
) as {
  total: number
  reconciles_to_295: boolean
  evaluated_count: number
  all_rows_decided_by_explicit: boolean
  by_category: Record<string, number>
  definition_compatible_now_ids: Array<string>
  semantic_definition_pending_ids: Array<string>
  admitted_derivative_fields: Array<string>
  rows: Array<Row>
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

const row = Object.fromEntries(DELTA.rows.map((r) => [r.metric_id, r]))
const cat = (id: string) => row[id].category
const SCHEMA = new Set(DERIVATIVE_SCHEMA_FIELDS)
const ALLOWED = new Set([
  'definition_compatible_now',
  'semantic_definition_pending',
  'nlp_content_capable_pending',
  'unsupported_field',
  'insufficient_history',
  'other_source_or_join',
  'outside_sales_boundary',
])
const PENDING = [
  'SW-019',
  'SW-022',
  'SW-026',
  'SW-076',
  'SW-084',
  'SW-086',
  'SW-132',
  'SW-133',
  'SW-134',
  'SW-137',
  'SW-138',
  'SW-288',
]

describe('Comm capability decision table — literal tuple array + fail-closed validator', () => {
  it('is a LITERAL TUPLE ARRAY of exactly 295 rows covering SW-001..SW-295 (unique, sequential)', () => {
    expect(Array.isArray(DECISIONS_TABLE)).toBe(true)
    expect(DECISIONS_TABLE.length).toBe(295)
    const ids = DECISIONS_TABLE.map(([id]) => id)
    expect(new Set(ids).size).toBe(295) // array length vs Set → no duplicate literal tuple
    for (let i = 1; i <= 295; i++)
      expect(ids).toContain(`SW-${String(i).padStart(3, '0')}`)
    // the shared validator accepts the real table and returns a 295-entry lookup
    const map = validateAndIndex(DECISIONS_TABLE)
    expect(map.size).toBe(295)
  })

  it('ADVERSARIAL: the SAME exported validator rejects an injected duplicate / missing / extra tuple', () => {
    const dec = DECISIONS_TABLE[0][1]
    // duplicate literal tuple (would be silently overwritten by a Record) — 296 rows, dup SW-001
    expect(() =>
      validateAndIndex([...DECISIONS_TABLE, ['SW-001', dec]]),
    ).toThrow()
    // duplicate that keeps length 295 (replace SW-295 with a second SW-001): dup + missing
    const dupKeepLen: Array<[string, typeof dec]> = [
      ...DECISIONS_TABLE.slice(0, 294),
      ['SW-001', dec],
    ]
    expect(() => validateAndIndex(dupKeepLen)).toThrow(/duplicate/i)
    // missing (drop the last row → 294)
    expect(() => validateAndIndex(DECISIONS_TABLE.slice(0, 294))).toThrow()
    // extra / out-of-range id
    expect(() =>
      validateAndIndex([...DECISIONS_TABLE.slice(0, 294), ['SW-999', dec]]),
    ).toThrow()
  })

  it('every emitted row is decided_by "explicit" (no regex/section/acquisition_class fallback path)', () => {
    expect(DELTA.all_rows_decided_by_explicit).toBe(true)
    for (const r of DELTA.rows)
      expect(r.decided_by, r.metric_id).toBe('explicit')
  })

  it('A1: boundary routing is TRUTHFUL per id (external / cross-rooftop rows never say Service/compliance)', () => {
    const route = (id: string) => row[id].join_or_nlp_required
    // external governed-source boundary rows
    for (const id of [
      'SW-264',
      'SW-272',
      'SW-273',
      'SW-274',
      'SW-275',
      'SW-276',
      'SW-218',
    ]) {
      expect(cat(id), id).toBe('outside_sales_boundary')
      expect(route(id), id).toMatch(/external governed source/i)
      expect(route(id), id).not.toMatch(/Service|compliance/i)
    }
    // cross-rooftop boundary rows
    for (const id of ['SW-267', 'SW-268', 'SW-269']) {
      expect(cat(id), id).toBe('outside_sales_boundary')
      expect(route(id), id).toMatch(/cross-rooftop governed route/i)
      expect(route(id), id).not.toMatch(/Service|compliance/i)
    }
    // Service/compliance boundary rows are NOT weakened
    for (const id of ['SW-079', 'SW-081', 'SW-118', 'SW-199', 'SW-263'])
      expect(route(id), id).toMatch(/Service/i)
    for (const id of ['SW-097', 'SW-098', 'SW-188', 'SW-192', 'SW-271'])
      expect(route(id), id).toMatch(/compliance/i)
  })
})

describe('Comm capability delta — authoritative per-ID table (Gate 4C1 second repair)', () => {
  it('one row per catalog metric (295), none evaluated, reconciles', () => {
    expect(DELTA.total).toBe(295)
    expect(DELTA.reconciles_to_295).toBe(true)
    expect(DELTA.rows.length).toBe(295)
    expect(DELTA.evaluated_count).toBe(0)
    for (const r of DELTA.rows) expect(r.evaluated).toBe(false)
    const ids = new Set(DELTA.rows.map((r) => r.metric_id))
    for (const c of CATALOG) expect(ids.has(c.metric_id)).toBe(true)
    expect(Object.values(DELTA.by_category).reduce((a, b) => a + b, 0)).toBe(
      295,
    )
    // The delta advertises the exact derivative schema.
    expect(DELTA.admitted_derivative_fields).toEqual([
      ...DERIVATIVE_SCHEMA_FIELDS,
    ])
  })

  it('every row: valid category + per-metric detail; admitted fields come ONLY from the real derivative schema', () => {
    for (const r of DELTA.rows) {
      expect(ALLOWED.has(r.category), `${r.metric_id}:${r.category}`).toBe(true)
      expect(Array.isArray(r.admitted_fields_satisfying)).toBe(true)
      expect(r.required_inputs.length).toBeGreaterThan(0)
      expect(r.missing_inputs.length).toBeGreaterThan(0)
      expect(r.minimum_history.length).toBeGreaterThan(0)
      expect(r.join_or_nlp_required.length).toBeGreaterThan(0)
      expect(r.rationale.length).toBeGreaterThan(0)
      expect(r.decided_by.length).toBeGreaterThan(0)
      // every claimed admitted field is a REAL derivative field
      for (const f of r.admitted_fields_satisfying)
        expect(
          SCHEMA.has(f),
          `${r.metric_id} claims non-derivative field ${f}`,
        ).toBe(true)
      // a NOT-ready row must claim NO admitted field (only pending/ready may)
      if (
        r.category !== 'semantic_definition_pending' &&
        r.category !== 'definition_compatible_now'
      )
        expect(r.admitted_fields_satisfying, r.metric_id).toEqual([])
    }
  })

  it('definition_compatible_now is empty; semantic_definition_pending is EXACTLY the 12', () => {
    expect(DELTA.definition_compatible_now_ids).toEqual([])
    expect(DELTA.by_category['definition_compatible_now'] ?? 0).toBe(0)
    expect(DELTA.semantic_definition_pending_ids).toEqual(PENDING)
    for (const id of PENDING) {
      const r = row[id]
      expect(r.category).toBe('semantic_definition_pending')
      expect(r.requires_ratified_threshold).toBe(true)
      expect(r.admitted_fields_satisfying.length).toBeGreaterThan(0)
      // pending rows never lean on message content
      expect(r.admitted_fields_satisfying).not.toContain('content_length')
      expect(r.admitted_fields_satisfying).not.toContain('content_present')
    }
  })

  it('SW-019 uses one governed week (NOT multi-week history)', () => {
    const r = row['SW-019']
    expect(r.category).toBe('semantic_definition_pending')
    expect(r.minimum_history).not.toMatch(/> ?1 week|multi-week/i)
    expect(r.minimum_history).toMatch(/governed week/i)
    expect(r.admitted_fields_satisfying).toEqual([
      'rep_token',
      'direction',
      'channel',
      'activity_date',
    ])
  })

  it('SW-089 cannot use person_token as a phone/ANI identity (moved out of pending)', () => {
    const r = row['SW-089']
    expect(r.category).toBe('unsupported_field')
    expect(r.admitted_fields_satisfying).toEqual([])
    expect(r.admitted_fields_satisfying).not.toContain('person_token')
    expect(r.missing_inputs).toMatch(/phone\/call-ANI|phone/i)
  })

  it('SW-140 has no inbound customer-voicemail event (Answering Machine is outbound only)', () => {
    const r = row['SW-140']
    expect(r.category).toBe('unsupported_field')
    expect(r.rationale).toMatch(/109 \/ Nissan 1 \/ Ford 16/)
    expect(r.rationale).toMatch(/zero inbound|ZERO inbound/i)
  })

  it('SW-132 stays pending ONLY with its external business-hours calendar recorded', () => {
    const r = row['SW-132']
    expect(r.category).toBe('semantic_definition_pending')
    expect(String(r.external_required_input)).toMatch(
      /business-hours calendar/i,
    )
    expect(r.missing_inputs).toMatch(/business-hours/i)
  })

  it('ADVERSARIAL sentinels: every named class is corrected', () => {
    // second-shadow corrections
    expect(cat('SW-012')).toBe('other_source_or_join')
    for (const id of ['SW-179', 'SW-239', 'SW-256'])
      expect(cat(id), id).toBe('nlp_content_capable_pending')
    for (const id of ['SW-033', 'SW-034', 'SW-057', 'SW-214'])
      expect(cat(id), id).toBe('other_source_or_join')
    expect(cat('SW-290')).toBe('insufficient_history')
    for (const id of [
      'SW-118',
      'SW-199',
      'SW-223',
      'SW-224',
      'SW-225',
      'SW-226',
      'SW-227',
      'SW-263',
    ])
      expect(cat(id), id).toBe('outside_sales_boundary')
    for (const id of ['SW-188', 'SW-189', 'SW-190', 'SW-191', 'SW-192'])
      expect(cat(id), id).toBe('outside_sales_boundary')
    // first-shadow corrections preserved
    for (const id of [
      'SW-003',
      'SW-007',
      'SW-091',
      'SW-025',
      'SW-233',
      'SW-234',
      'SW-235',
    ])
      expect(cat(id), id).toBe('unsupported_field')
    for (const id of [
      'SW-021',
      'SW-075',
      'SW-153',
      'SW-157',
      'SW-185',
      'SW-206',
      'SW-287',
    ])
      expect(cat(id), id).toBe('nlp_content_capable_pending')
    for (const id of [
      'SW-056',
      'SW-094',
      'SW-180',
      'SW-182',
      'SW-198',
      'SW-015',
    ])
      expect(cat(id), id).toBe('other_source_or_join')
    expect(cat('SW-176')).not.toBe('outside_sales_boundary')
    expect(cat('SW-176')).toBe('nlp_content_capable_pending')
  })

  it('the seven structured candidates remain semantic_definition_pending, none promoted', () => {
    expect(CANDIDATES.promoted_this_gate).toBe(0)
    for (const c of CANDIDATES.candidates) {
      expect(c.promotable_now).toBe(false)
      expect(cat(c.metric_id), c.metric_id).toBe('semantic_definition_pending')
    }
  })
})
