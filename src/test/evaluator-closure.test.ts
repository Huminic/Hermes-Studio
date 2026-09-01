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
  'dependency_bucket',
  'source_report_family',
  'boundary_domain',
  'current_source_state',
  'calculable_from_accepted_bytes',
  'calculable_proof',
  'acquisition_route',
  'alternative_acquisition_route',
  'route_proof_state',
  'controller_observed_dataset',
  'baseline_route',
  'owner',
  'next_action',
  'prerequisite',
  'earliest_evidence_point',
  'stop_condition',
  'duane_approval_required',
  'alternative_duane_approval_required',
  'duane_approval_reason',
  'sales_only_boundary_conflict',
]

// Approval rule: routine read-only routes need NO new approval; scope/mutation routes do.
const NO_APPROVAL_ROUTES = new Set([
  'new_readonly_vinsolutions_export',
  'readonly_browser_capture',
  'historical_accumulation',
  'genuinely_unavailable',
])
const NEW_APPROVAL_ROUTES = new Set([
  'existing_scheduled_report',
  'external_feed',
  'separate_service_workspace',
  'separate_cross_rooftop_route',
  'compliance_authorization',
])

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

describe('Gate 3 controller corrections — approval / domain / dataset (material)', () => {
  const ACQ = JSON.parse(
    fs.readFileSync(
      path.join(REPO, 'docs/halo/contract/acquisition-contract.json'),
      'utf8',
    ),
  )

  it('approval-state truth: read-only/unsaved/accumulation need NO new approval; scope/mutation do', () => {
    for (const r of REGISTRY.records) {
      const route = String(r.acquisition_route)
      if (NO_APPROVAL_ROUTES.has(route)) {
        expect(
          r.duane_approval_required,
          `${r.metric_id as string} ${route}`,
        ).toBe(false)
      } else if (NEW_APPROVAL_ROUTES.has(route)) {
        expect(
          r.duane_approval_required,
          `${r.metric_id as string} ${route}`,
        ).toBe(true)
      }
    }
    // Quarantined primary route is the read-only unsaved reconstruction (no approval),
    // with the saved-schedule repair as an approval-requiring ALTERNATIVE.
    const q = REGISTRY.records.filter(
      (r) => r.unresolved_reason_category === 'quarantined',
    )
    expect(q.length).toBe(510)
    for (const r of q) {
      expect(r.acquisition_route).toBe('new_readonly_vinsolutions_export')
      expect(r.duane_approval_required).toBe(false)
      expect(r.alternative_acquisition_route).toBe('existing_scheduled_report')
      expect(r.alternative_duane_approval_required).toBe(true)
    }
  })

  it('domain routing: only genuine Service-domain conditions route to the Service workspace', () => {
    for (const r of REGISTRY.records) {
      if (r.acquisition_route === 'separate_service_workspace') {
        expect(r.boundary_domain, r.metric_id as string).toBe('service')
      }
      if (r.boundary_domain === 'compliance')
        expect(r.acquisition_route).toBe('compliance_authorization')
      if (r.boundary_domain === 'cross_rooftop')
        expect(r.acquisition_route).toBe('separate_cross_rooftop_route')
      if (r.boundary_domain === 'external_enrichment')
        expect(r.acquisition_route).toBe('external_feed')
    }
    // Not all 105 outside-boundary cells go to Service — the split is 27/48/9/21.
    expect(VIEWS.by_boundary_domain).toEqual({
      service: 27,
      compliance: 48,
      cross_rooftop: 9,
      external_enrichment: 21,
    })
    expect(VIEWS.by_acquisition_route.separate_service_workspace).toBe(27)
  })

  it('non-overclaiming dataset presence: candidate routes only, Service datasets never mapped', () => {
    // Every route is candidate_unproved; nothing claims to "close" a cell yet.
    for (const r of REGISTRY.records)
      expect(r.route_proof_state).toBe('candidate_unproved')
    for (const g of ACQ.groups) {
      expect(g.route_proof_state).toBe('candidate_unproved')
      expect(g.closes_cells_only_when_proved).toBe(true)
      expect(g).not.toHaveProperty('closes_metric_ids') // renamed to candidate_metric_ids
    }
    // Dataset evidence present with the non-overclaim caveat + Service permanently excluded.
    expect(ACQ.dataset_evidence.nonblank_datasets_total).toBe(28)
    expect(ACQ.dataset_evidence.permanently_excluded).toEqual([
      'Service',
      'Service Appointments',
    ])
    expect(String(ACQ.dataset_evidence.caveat)).toMatch(/candidate route only/i)
    for (const r of REGISTRY.records) {
      expect(r.controller_observed_dataset).not.toBe('Service')
      expect(r.controller_observed_dataset).not.toBe('Service Appointments')
    }
    // The 510 quarantined block is presented by dependency bucket × dealer, not "one pass".
    expect(
      ACQ.quarantined_reconstruction.by_dependency_bucket_dealer.length,
    ).toBe(12)
    expect(String(ACQ.quarantined_reconstruction.note)).toMatch(
      /NOT claimed as "one pass closes 510"/,
    )
    // Browser passes are per-dealer, candidate-unproved, no approval.
    for (const p of ACQ.browser_passes) {
      expect(p.duane_approval_required).toBe(false)
      expect(p.route_proof_state).toBe('candidate_unproved')
    }
  })
})

describe('Gate 3 quarantine decomposition — precise mutually-exclusive buckets (Defect 3)', () => {
  const ACQ = JSON.parse(
    fs.readFileSync(
      path.join(REPO, 'docs/halo/contract/acquisition-contract.json'),
      'utf8',
    ),
  )
  it('reconciles: 4 dependency buckets × 3 dealers = 12 entries, sum 510; multiple_quarantined is NOT a report family', () => {
    const q = REGISTRY.records.filter(
      (r) => r.unresolved_reason_category === 'quarantined',
    )
    expect(q.length).toBe(510)
    // Mutually exclusive: each quarantined cell belongs to exactly one dependency bucket.
    const byBucket: Record<string, number> = {}
    for (const r of q) {
      const b = String(r.dependency_bucket)
      byBucket[b] = (byBucket[b] ?? 0) + 1
    }
    const qr = ACQ.quarantined_reconstruction
    expect(qr.by_dependency_bucket).toEqual(byBucket)
    expect(Object.values(byBucket).reduce((a: number, b) => a + b, 0)).toBe(510)
    // The multi-family DEPENDENCY bucket exists and is NOT one of the report families.
    expect(Object.keys(byBucket)).toContain('multiple_quarantined')
    expect(qr.multi_family_dependency_bucket).toBe('multiple_quarantined')
    expect(qr.source_provenance_report_families).toEqual([
      'lead_source_roi',
      'cage_kpi',
      'sales_comm_log',
    ])
    expect(qr.source_provenance_report_families).not.toContain(
      'multiple_quarantined',
    )
    // source_report_family is null exactly for multiple_quarantined cells (join deps).
    for (const r of q) {
      if (r.dependency_bucket === 'multiple_quarantined')
        expect(r.source_report_family).toBeNull()
      else expect(r.source_report_family).toBe(r.dependency_bucket)
    }
    // 12 dependency-bucket × dealer entries reconciling to 510.
    expect(qr.bucket_count).toBe(12)
    expect(qr.by_dependency_bucket_dealer.length).toBe(12)
    expect(
      qr.by_dependency_bucket_dealer.reduce(
        (a: number, b: { cell_count: number }) => a + b.cell_count,
        0,
      ),
    ).toBe(510)
    expect(qr.reconciles_to_510).toBe(true)
    // Wording calls them dependency buckets, not report families.
    expect(String(qr.note)).toMatch(/DEPENDENCY bucket/)
    expect(String(qr.note)).not.toMatch(/4 report-family buckets/)
  })
})
