// @vitest-environment node
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CUSTOMER_FORBIDDEN,
  GATE4J_STATES,
  RECONCILIATION,
  REPORT_PASS,
  SEEDED_IDS,
  assertCustomerSafeText,
  buildCustomerSafeSummary,
} from '@/server/reports/residual/gate4j-crm-reconciliation'

const url = (p: string) => new URL(`../../${p}`, import.meta.url)
const read = (p: string) => JSON.parse(fs.readFileSync(url(p), 'utf8'))

const INTERNAL = read(
  'docs/halo/evidence/m1r/residual/gate4j-crm-reconciliation-ledger.json',
)
const CUSTOMER = read(
  'docs/halo/evidence/m1r/residual/gate4j-customer-safe-summary.json',
)
const GATE4G = read(
  'docs/halo/contract/sw295-gate4g-final-residual-matrix.json',
)
const GATE4H_CRM = read(
  'docs/halo/evidence/m1r/residual/gate4h-crm-devils-advocate-ledger.json',
)
const GATE4H_LEDGER = read(
  'docs/halo/evidence/m1r/residual/gate4h-internal-accountability-ledger.json',
)

// Test-declared expectations (NOT imported from implementation).
const EXPECTED_STATE: Record<string, string> = {
  'SW-034': 'performed_candidate_found',
  'SW-049': 'performed_candidate_found',
  'SW-050': 'performed_schema_only',
  'SW-111': 'performed_candidate_found',
  'SW-114': 'performed_no_route_found',
}

describe('Gate 4J — report-pass controls (read-only, no export, no PII)', () => {
  it('the pass exported nothing, opened no customer row, made no mutation, retained no PII', () => {
    const c = REPORT_PASS.controls_asserted
    expect(c.report_exported).toBe(false)
    expect(c.customer_row_opened).toBe(false)
    expect(c.crm_mutation).toBe(false)
    expect(c.parameter_change_saved).toBe(false)
    expect(c.pii_retained).toBe(false)
  })

  it('Deal Performance was Sales-only (Service / Parts Order / Unknown unselected)', () => {
    const dp = REPORT_PASS.deal_performance
    expect(dp.lead_type_selected).toHaveLength(8)
    for (const s of ['Service', 'Parts Order', 'Unknown'])
      expect(dp.lead_type_unselected).toContain(s)
  })

  it('records the Desk Log Service-Dept leakage as a fail-closed safety observation, no PII', () => {
    const safety = INTERNAL.safety_observations
    const leak = safety.find(
      (o: { id: string }) => o.id === 'desk-log-service-dept-leakage',
    )
    expect(leak.severity).toBe('fail_closed')
    expect(leak.pii_retained).toBe(false)
    expect(leak.observation).toMatch(/Service Dept/)
  })
})

describe('Gate 4J — five checks superseded, none promoted', () => {
  it('reconciles exactly the five Gate 4H seeds', () => {
    expect(RECONCILIATION.map((r) => r.metric_id).sort()).toEqual(
      [...SEEDED_IDS].sort(),
    )
    // The Gate 4H seeds were all required_not_performed (we supersede, not rewrite).
    for (const id of SEEDED_IDS) {
      const c = GATE4H_CRM.checks.find(
        (x: { metric_id: string }) => x.metric_id === id,
      )
      expect(c.state).toBe('required_not_performed')
    }
  })

  it('each record carries a performed_* state (no longer required_not_performed)', () => {
    for (const r of RECONCILIATION) {
      expect(r.gate4j_state).toBe(EXPECTED_STATE[r.metric_id])
      expect(r.gate4j_state in GATE4J_STATES).toBe(true)
      expect(r.gate4j_state).not.toBe('required_not_performed')
    }
  })

  it('no metric is promoted, no data acquired, no value measured, never zero', () => {
    for (const r of RECONCILIATION) {
      expect(r.promoted).toBe(false)
      expect(r.data_acquired).toBe(false)
      expect(r.value_measured).toBe(false)
      expect(r.missing_is_unknown_never_zero).toBe(true)
      expect(r.exact_remaining_requirement.length).toBeGreaterThan(0)
    }
  })

  it('states the exact remaining requirement kind for each metric', () => {
    const joined = (id: string) =>
      RECONCILIATION.find(
        (r) => r.metric_id === id,
      )!.exact_remaining_requirement.join(' ')
    expect(joined('SW-034')).toMatch(/semantic ratification/i)
    expect(joined('SW-049')).toMatch(/GPU|gross-per-unit/i)
    expect(joined('SW-050')).toMatch(/dated|PII-safe|window/i)
    expect(joined('SW-111')).toMatch(/two comparable periods|multi-week/i)
    expect(joined('SW-114')).toMatch(/show-rate|show rate|threshold/i)
  })
})

describe('Gate 4J — committed governance still holds (nothing closes)', () => {
  it('all five committed specs are still held', () => {
    for (const id of SEEDED_IDS) {
      const row = GATE4G.rows.find(
        (r: { metric_id: string }) => r.metric_id === id,
      )
      for (const f of [
        'numerator',
        'denominator',
        'threshold',
        'rank_direction',
      ])
        expect(String(row.frozen_e1_spec[f]), `${id}.${f}`).toMatch(/\(held\)/)
    }
  })

  it('accounting unchanged: 17 / 278 = 51 / 834 / 885 and five remain unresolved / 4G', () => {
    expect(GATE4H_LEDGER.coverage).toEqual({
      conditions: 295,
      evaluated: 17,
      unresolved: 278,
    })
    for (const id of SEEDED_IDS) {
      const r = GATE4H_LEDGER.rows.find(
        (x: { metric_id: string }) => x.metric_id === id,
      )
      expect(r.status).toBe('unresolved')
      expect(r.gate_origin).toBe('4G')
    }
    const a = INTERNAL.accounting
    expect([a.evaluated_cells, a.unresolved_cells, a.total_cells]).toEqual([
      51, 834, 885,
    ])
    expect(a.change_from_this_gate).toMatch(/none/i)
  })
})

describe('Gate 4J — customer text is safe', () => {
  it('exposes no internal control, report title, or PII term', () => {
    const strings = [
      CUSTOMER.summary.headline,
      ...CUSTOMER.summary.detail,
      CUSTOMER.summary.claim_layer_note,
    ]
    for (const s of strings) expect(CUSTOMER_FORBIDDEN.test(s), s).toBe(false)
    // It says routes were identified, and that nothing was measured.
    const all = JSON.stringify(CUSTOMER.summary)
    expect(all).toMatch(/report routes were identified/i)
    expect(all).toMatch(/no value was measured/i)
    expect(all).toMatch(/unknown, never as zero/i)
  })

  it('the builder fails closed on a planted internal control / report title', () => {
    const good = buildCustomerSafeSummary()
    expect(() =>
      assertCustomerSafeText({
        ...good,
        detail: [
          ...good.detail,
          'See the Deal Performance report’s Date Range.',
        ],
      }),
    ).toThrow(/internal control\/report\/PII/i)
  })

  it('no internal report title leaks into the customer artifact JSON', () => {
    const raw = JSON.stringify(CUSTOMER)
    for (const t of [
      'Desk Log',
      'Deal Performance',
      'DMS',
      'Sales Flat',
      'Service Dept',
    ])
      expect(raw).not.toContain(t)
  })
})
