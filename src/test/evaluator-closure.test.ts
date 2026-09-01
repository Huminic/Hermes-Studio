// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EvalRow } from '@/server/reports/evaluator/types'
import {
  buildClosureRecord,
  categorize,
  loadCatalogDetail,
} from '@/server/reports/evaluator/closure'

const REPO = path.resolve(__dirname, '..', '..')
const LEDGER = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/evidence/m1r/evaluator/spine-ledger.json'),
    'utf8',
  ),
) as { rows: Array<EvalRow> }
const REGISTRY = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/evidence/m1r/evaluator/closure-registry.json'),
    'utf8',
  ),
) as { records: Array<Record<string, unknown>> }
const VIEWS = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/evidence/m1r/evaluator/closure-views.json'),
    'utf8',
  ),
)
const details = loadCatalogDetail(
  JSON.parse(
    fs.readFileSync(
      path.join(
        REPO,
        'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
      ),
      'utf8',
    ),
  ),
)
const detailById = new Map(details.map((d) => [d.metric_id, d]))
const unresolved = LEDGER.rows.filter((r) => r.status === 'unresolved')

const REQUIRED_FIELDS = [
  'metric_id',
  'dealer_id',
  'profile',
  'condition',
  'cluster',
  'unresolved_reason_category',
  'unresolved_reason',
  'required_raw_fields',
  'definition_denominator_grain',
  'required_source',
  'current_source_state',
  'calculable_from_accepted_bytes',
  'calculable_proof',
  'acquisition_route',
  'baseline_route',
  'owner',
  'next_action',
  'prerequisite',
  'earliest_evidence_point',
  'stop_condition',
  'duane_approval_required',
  'sales_only_boundary_conflict',
]

describe('Gate 3 closure registry — 876 exact cells (req 1)', () => {
  it('exactly 876 records with the exact 876 unresolved keys', () => {
    expect(REGISTRY.records.length).toBe(876)
    const regKeys = new Set(
      REGISTRY.records.map(
        (r) => `${r.metric_id as string}:${r.dealer_id as string}`,
      ),
    )
    const ledgerKeys = new Set(
      unresolved.map((r) => `${r.metric_id}:${r.dealer_id}`),
    )
    expect(regKeys.size).toBe(876)
    expect([...ledgerKeys].every((k) => regKeys.has(k))).toBe(true)
  })
  it('every record carries every required field (no undefined, no N/A promotion)', () => {
    for (const r of REGISTRY.records) {
      for (const f of REQUIRED_FIELDS)
        expect(r[f], `${r.metric_id as string}.${f}`).toBeDefined()
      // Never promote an unresolved cell to evaluated: no cell is calculable-from-accepted,
      // none is in the 'accepted' state, and no field is an "N/A"/"accounted for" promotion.
      expect(r.calculable_from_accepted_bytes).toBe(false)
      expect(String(r.current_source_state)).not.toBe('accepted')
      for (const v of Object.values(r)) {
        expect(String(v)).not.toBe('N/A')
        expect(String(v).toLowerCase()).not.toContain('accounted for')
      }
      expect(String(r.unresolved_reason_category)).not.toBe('evaluated')
    }
  })
  it('recompute from ledger is byte-identical to the committed registry (deterministic)', () => {
    const records = unresolved.map((r) =>
      buildClosureRecord(r, detailById.get(r.metric_id)!),
    )
    expect(JSON.stringify(records)).toBe(JSON.stringify(REGISTRY.records))
  })
})

describe('Gate 3 closure views — reconcile exactly to 876 + Gate 2 reasons (req 1)', () => {
  it('views reconcile to 876 and to the ledger reason categories', () => {
    expect(VIEWS.total).toBe(876)
    expect(VIEWS.reconciles_to_876).toBe(true)
    expect(VIEWS.reconciles_to_gate2_reason_categories).toBe(true)
    const catSum = Object.values(
      VIEWS.by_category as Record<string, number>,
    ).reduce((a, b) => a + b, 0)
    expect(catSum).toBe(876)
    // by_dealer must be 292 unresolved each.
    for (const d of ['21043', '21044', '21047'])
      expect((VIEWS.by_dealer as Record<string, number>)[d]).toBe(292)
  })
  it('by_category equals an independent recategorization of the ledger', () => {
    const indep: Record<string, number> = {}
    for (const r of unresolved) {
      const c = categorize(r.unresolved_reason ?? '')
      indep[c] = (indep[c] ?? 0) + 1
    }
    expect(VIEWS.by_category).toEqual(indep)
  })
  it('Sales-only boundary conflicts are identified (not deleted) — e.g. Service-to-Sales', () => {
    expect(VIEWS.sales_only_boundary_conflicts.count).toBeGreaterThan(0)
    // Section 10 (Service-to-Sales & Equity Mining) conditions must be flagged.
    const s10 = details
      .filter((d) => /service-to-sales|equity mining/i.test(d.section))
      .map((d) => d.metric_id)
    for (const id of s10)
      expect(VIEWS.sales_only_boundary_conflicts.metric_ids).toContain(id)
  })
})
