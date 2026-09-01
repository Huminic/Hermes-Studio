// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { NormalizedRow } from '@/server/reports/residual/gate4h-downstream-contract'
import {
  CRM_CHECK_STATES,
  INTERNAL_JARGON,
  SERVICE_PARTS_DATA,
  classifyDomain,
  renderCrmState,
} from '@/server/reports/residual/gate4h-downstream-contract'

// Independent (test-declared) expected shape — NOT imported from the generator.
const OUT = path.join(process.cwd(), 'docs/halo/evidence/m1r/residual')
const CONTRACT = path.join(process.cwd(), 'docs/halo/contract')
const readJson = <T>(p: string): T =>
  JSON.parse(fs.readFileSync(p, 'utf8')) as T

type InternalRow = {
  metric_id: string
  status: 'evaluated' | 'unresolved'
  gate_origin: string
  domain: string
  domain_lane: string
  keyword_lane: string | null
  override_reason: string | null
  customer_display_eligible: boolean
  route_to: string
  internal_explanation: {
    primary_blocker: string
    blocker_class: string
  } | null
}
type CustomerRow = {
  metric_id: string
  domain: string
  customer: Record<string, string>
  claim_layers: Record<string, string>
}

const internal = readJson<{
  coverage: { conditions: number; evaluated: number; unresolved: number }
  id_partition: Record<string, number>
  eligibility_tally: {
    customer_display_eligible: number
    withheld: number
    by_domain: Record<string, number>
  }
  overrides: Array<{
    metric_id: string
    keyword_lane: string
    domain_lane: string
  }>
  rows: Array<InternalRow>
}>(path.join(OUT, 'gate4h-internal-accountability-ledger.json'))
const customer = readJson<{
  coverage: { evaluated: number; unresolved: number }
  eligibility: { customer_display_eligible: number }
  renderer_contract: { consume_only: string; must_not: Array<string> }
  claim_layer_contract: {
    layers: Record<string, string>
    roi_scenario_rules: { optional: boolean; computed_in_this_gate: boolean }
  }
  rows: Array<CustomerRow>
}>(path.join(OUT, 'gate4h-downstream-customer-contract.json'))
const crm = readJson<{
  seeded_ids: Array<string>
  checks: Array<{
    metric_id: string
    state: string
    performed: boolean
    renders_as: string
    never_zero: boolean
  }>
}>(path.join(OUT, 'gate4h-crm-devils-advocate-ledger.json'))
const gate4g = readJson<{
  rows: Array<{
    metric_id: string
    primary_blocker: string
    blocker_class: string
  }>
}>(path.join(CONTRACT, 'sw295-gate4g-final-residual-matrix.json'))

describe('Gate 4H — coverage & partition (no new evaluations)', () => {
  it('covers exactly 295 IDs: 17 evaluated + 278 unresolved', () => {
    expect(internal.rows).toHaveLength(295)
    expect(new Set(internal.rows.map((r) => r.metric_id)).size).toBe(295)
    expect(internal.coverage).toEqual({
      conditions: 295,
      evaluated: 17,
      unresolved: 278,
    })
    expect(internal.rows.filter((r) => r.status === 'evaluated')).toHaveLength(
      17,
    )
    expect(internal.rows.filter((r) => r.status === 'unresolved')).toHaveLength(
      278,
    )
    expect(internal.id_partition).toEqual({
      evaluated: 17,
      gate4e_content_hold: 70,
      gate4f_hold: 86,
      gate4g_hold: 122,
    })
    expect(customer.coverage).toMatchObject({ evaluated: 17, unresolved: 278 })
  })
})

describe('Gate 4H — eligibility is a function of evidence domain', () => {
  it('splits 242 eligible / 36 withheld with the expected domain tally', () => {
    expect(internal.eligibility_tally.customer_display_eligible).toBe(242)
    expect(internal.eligibility_tally.withheld).toBe(36)
    expect(internal.eligibility_tally.by_domain).toEqual({
      sales: 233,
      cross_rooftop: 3,
      enrichment_external: 6,
      service_parts: 20,
      compliance_legal: 16,
      withheld_unclassified: 0,
    })
    expect(customer.rows).toHaveLength(242)
    expect(customer.eligibility.customer_display_eligible).toBe(242)
  })

  it('ZERO Service/Parts or compliance/legal metric is customer-display eligible', () => {
    for (const r of internal.rows)
      if (
        r.domain === 'service_parts' ||
        r.domain === 'compliance_legal' ||
        r.domain === 'withheld_unclassified'
      )
        expect(r.customer_display_eligible, r.metric_id).toBe(false)
    // …and none of them appears in the customer contract.
    const withheldIds = new Set(
      internal.rows
        .filter(
          (r) => !r.customer_display_eligible && r.status === 'unresolved',
        )
        .map((r) => r.metric_id),
    )
    for (const cr of customer.rows)
      expect(withheldIds.has(cr.metric_id), cr.metric_id).toBe(false)
    expect(
      customer.rows.every((r) =>
        ['sales', 'cross_rooftop', 'enrichment_external'].includes(r.domain),
      ),
    ).toBe(true)
  })

  it('the customer contract routing rule consumes ONLY eligible rows', () => {
    expect(customer.renderer_contract.consume_only).toMatch(
      /customer_display_eligible === true/,
    )
    expect(customer.renderer_contract.must_not.join(' ')).toMatch(
      /Service\/Parts/i,
    )
  })
})

describe('Gate 4H — domain evidence beats incidental words', () => {
  it('SW-270: incidental "rooftop" keyword is overridden by Service-domain primary_blocker → ineligible', () => {
    const o = internal.overrides.find((x) => x.metric_id === 'SW-270')
    expect(o).toBeTruthy()
    expect(o!.keyword_lane).toBe('cross_rooftop')
    expect(o!.domain_lane).toBe('service')
    const row = internal.rows.find((r) => r.metric_id === 'SW-270')!
    expect(row.domain).toBe('service_parts')
    expect(row.customer_display_eligible).toBe(false)
    expect(customer.rows.some((r) => r.metric_id === 'SW-270')).toBe(false)
  })

  it('SW-079/SW-080: 4G not_applicable lane + Service rationale → service_parts, ineligible', () => {
    for (const id of ['SW-079', 'SW-080']) {
      const row = internal.rows.find((r) => r.metric_id === id)!
      expect(row.domain, id).toBe('service_parts')
      expect(row.customer_display_eligible, id).toBe(false)
    }
  })

  it('incidental service WORDS do NOT force ineligibility for genuine Sales metrics', () => {
    // SW-115 "service CSI" and SW-176 "mood-driven service" are committed in-boundary Sales metrics.
    for (const id of ['SW-115', 'SW-176']) {
      const row = internal.rows.find((r) => r.metric_id === id)!
      expect(row.domain, id).toBe('sales')
      expect(row.customer_display_eligible, id).toBe(true)
      expect(
        customer.rows.some((r) => r.metric_id === id),
        id,
      ).toBe(true)
    }
  })
})

describe('Gate 4H — customer copy safety (no jargon, no Service/Parts, never zero)', () => {
  it('no customer field contains internal jargon', () => {
    for (const cr of customer.rows)
      for (const [field, value] of Object.entries(cr.customer))
        expect(
          INTERNAL_JARGON.test(value),
          `${cr.metric_id}.${field}: "${value}"`,
        ).toBe(false)
  })

  it('no customer field contains Service/Parts DATA references', () => {
    for (const cr of customer.rows)
      for (const [field, value] of Object.entries(cr.customer))
        expect(
          SERVICE_PARTS_DATA.test(value),
          `${cr.metric_id}.${field}: "${value}"`,
        ).toBe(false)
  })

  it('no unresolved metric is rendered as a zero; every explanation field is populated', () => {
    const fields = [
      'what_this_watches',
      'not_measured_this_period',
      'why_unavailable',
      'how_to_unlock',
      'next_action',
      'owner',
      'decision_it_improves',
    ]
    for (const cr of customer.rows) {
      for (const f of fields) {
        expect(cr.customer[f], `${cr.metric_id}.${f}`).toBeTruthy()
        expect(cr.customer[f].trim(), `${cr.metric_id}.${f}`).not.toBe('0')
      }
      // A "not measured" line must never assert a zero value.
      expect(cr.customer.not_measured_this_period).not.toMatch(
        /\bis (now )?0\b|= 0\b/,
      )
    }
  })

  it('every customer row declares field claim layers (observed_fact vs inference)', () => {
    for (const cr of customer.rows) {
      expect(cr.claim_layers.what_this_watches).toBe('observed_fact')
      expect(cr.claim_layers.why_unavailable).toBe('observed_fact')
      expect(cr.claim_layers.how_to_unlock).toBe('inference')
      expect(cr.claim_layers.decision_it_improves).toBe('inference')
    }
  })
})

describe('Gate 4H — primary-blocker fidelity (no generic boilerplate that loses the blocker)', () => {
  it('each unresolved internal record preserves its committed primary_blocker + blocker_class', () => {
    const byId = new Map(gate4g.rows.map((r) => [r.metric_id, r]))
    let checked = 0
    for (const r of internal.rows) {
      if (r.gate_origin !== '4G') continue
      const src = byId.get(r.metric_id)!
      expect(r.internal_explanation, r.metric_id).toBeTruthy()
      expect(r.internal_explanation!.primary_blocker, r.metric_id).toBe(
        src.primary_blocker,
      )
      expect(r.internal_explanation!.blocker_class, r.metric_id).toBe(
        src.blocker_class,
      )
      checked++
    }
    expect(checked).toBe(122)
  })

  it('why_unavailable is blocker-specific, not one generic sentence for all rows', () => {
    const salesWhy = new Set(
      customer.rows
        .filter((r) => r.domain === 'sales')
        .map((r) => r.customer.why_unavailable),
    )
    // Five committed blocker classes across the Sales rows → several distinct explanations.
    expect(salesWhy.size).toBeGreaterThanOrEqual(4)
  })
})

describe('Gate 4H — CRM devil’s-advocate control fails closed', () => {
  it('seeds exactly the five committed observed_evidence IDs, all required_not_performed', () => {
    expect(crm.seeded_ids).toEqual([
      'SW-034',
      'SW-049',
      'SW-050',
      'SW-111',
      'SW-114',
    ])
    for (const c of crm.checks) {
      expect(CRM_CHECK_STATES).toContain(c.state as never)
      expect(c.state, c.metric_id).toBe('required_not_performed')
      expect(c.performed, c.metric_id).toBe(false)
      expect(c.never_zero, c.metric_id).toBe(true)
      expect(c.renders_as, c.metric_id).toBe(
        'not verified from available sources',
      )
    }
  })

  it('required_not_performed and not_verifiable never render as zero', () => {
    expect(renderCrmState('required_not_performed')).toMatch(/not verified/)
    expect(renderCrmState('not_verifiable')).toMatch(/not verified/)
    expect(renderCrmState('required_not_performed')).not.toMatch(/\b0\b|zero/)
    expect(renderCrmState('not_verifiable')).not.toMatch(/\b0\b|zero/)
  })
})

describe('Gate 4H — claim-layer contract for future narratives', () => {
  it('defines observed fact / inference / hypothesis and computes NO ROI in this gate', () => {
    expect(Object.keys(customer.claim_layer_contract.layers).sort()).toEqual([
      'hypothesis',
      'inference',
      'observed_fact',
    ])
    expect(customer.claim_layer_contract.roi_scenario_rules.optional).toBe(true)
    expect(
      customer.claim_layer_contract.roi_scenario_rules.computed_in_this_gate,
    ).toBe(false)
  })
})

describe('Gate 4H — pure classifier unit tests (domain vs incidental word)', () => {
  const base: NormalizedRow = {
    metric_id: 'SW-000',
    gate_origin: '4F',
    section: 's',
    subsection: '',
    condition: 'x',
    blocker_class: 'outside_sales_boundary',
    primary_blocker: '',
  }

  it('in-boundary rows are always sales/eligible', () => {
    const c = classifyDomain({
      ...base,
      blocker_class: 'other_source_or_join',
      condition: 'anything with the word service in it',
    })
    expect(c.domain).toBe('sales')
    expect(c.customer_display_eligible).toBe(true)
  })

  it('4F: incidental "rooftop" keyword yields service_parts when primary_blocker is Service-domain', () => {
    const c = classifyDomain({
      ...base,
      condition:
        'Service customers of one rooftop never marketed by group BDC.',
      primary_blocker: 'service-customer cross-marketing is Service-domain',
    })
    expect(c.keyword_lane).toBe('cross_rooftop')
    expect(c.domain).toBe('service_parts')
    expect(c.customer_display_eligible).toBe(false)
    expect(c.override_reason).toBeTruthy()
  })

  it('4G not_applicable lane fails closed via the primary_blocker rationale', () => {
    const c = classifyDomain({
      ...base,
      gate_origin: '4G',
      committed_boundary_lane: 'not_applicable',
      primary_blocker: 'lease maturity + service sourcing is Service-to-Sales',
    })
    expect(c.domain).toBe('service_parts')
    expect(c.customer_display_eligible).toBe(false)
  })

  it('4G enrichment/cross_rooftop committed lanes stay eligible (sanitized)', () => {
    expect(
      classifyDomain({
        ...base,
        gate_origin: '4G',
        committed_boundary_lane: 'enrichment',
        primary_blocker:
          'credit-tier refresh needs an external governed source',
      }).customer_display_eligible,
    ).toBe(true)
    expect(
      classifyDomain({
        ...base,
        gate_origin: '4G',
        committed_boundary_lane: 'cross_rooftop',
        primary_blocker: 'cross-rooftop introduction needs a governed route',
      }).domain,
    ).toBe('cross_rooftop')
  })
})
