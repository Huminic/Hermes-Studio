// @vitest-environment node
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CAPTURE,
  DEALERS,
  MEASURED_UNSCORED_CONTRACT,
  REQUIRED_SOURCE_HOST,
  SUPPLEMENTAL_METRIC_IDS,
  assertObservationSafe,
  avgPhrase,
  buildCustomerObservation,
  heldSpecFields,
  isPromotableFromCapture,
} from '@/server/reports/residual/gate4i-response-times'

const url = (p: string) => new URL(`../../${p}`, import.meta.url)
const read = (p: string) => JSON.parse(fs.readFileSync(url(p), 'utf8'))

// Test-declared expectations (NOT imported from the implementation).
const EXPECTED_GOOD_LEADS: Record<string, number> = {
  '21043': 54,
  '21044': 22,
  '21047': 19,
}
const EXPECTED_AFTER_HOURS: Record<string, [number, number, number]> = {
  '21043': [27, 7, 25.9],
  '21044': [10, 7, 70.0],
  '21047': [7, 3, 42.9],
}
const RAW_SHA256 =
  '554d8dfe8791e76e45a00627b8584a476633b7f9fbf15257a172300bdd9b7b41'
// Words that would signal a forbidden cars-sold / ROI promise in customer copy.
const ROI_WORDS =
  /\b(ROI|cars? sold|units? sold|revenue|profit|dollars?|\$|guarantee|will (sell|close|earn))\b/i

const INTERNAL = read(
  'docs/halo/evidence/m1r/residual/gate4i-response-times-measured-unscored-ledger.json',
)
const CUSTOMER = read(
  'docs/halo/evidence/m1r/residual/gate4i-customer-safe-observations.json',
)
const GATE4G = read(
  'docs/halo/contract/sw295-gate4g-final-residual-matrix.json',
)
const GATE4H = read(
  'docs/halo/evidence/m1r/residual/gate4h-internal-accountability-ledger.json',
)

describe('Gate 4I — provenance & controls', () => {
  it('capture is on the Sales-only VinSolutions host', () => {
    expect(CAPTURE.source_host).toBe(REQUIRED_SOURCE_HOST)
    expect(new URL(CAPTURE.source_url).host).toBe(REQUIRED_SOURCE_HOST)
  })

  it('controls are Sales-only, read-only, no native CSV/XLSX control', () => {
    const c = CAPTURE.controls
    expect(c.lead_type_selected).toBe('Sales')
    expect(c.service_parts_selected).toBe(false)
    expect(c.service_selected).toBe(false)
    expect(c.parts_selected).toBe(false)
    expect(c.external_mutation).toBe(false)
    expect(c.native_csv_or_excel_control_found).toBe(false)
  })

  it('records the retained raw-evidence chain-of-custody (39173 bytes + sha256)', () => {
    expect(CAPTURE.raw_evidence.byte_count).toBe(39173)
    expect(CAPTURE.raw_evidence.sha256).toBe(RAW_SHA256)
    expect(INTERNAL.capture.raw_evidence.sha256).toBe(RAW_SHA256)
  })

  it('period is the accepted week with the previous-30-day comparison', () => {
    expect(CAPTURE.period.from).toBe('2026-08-24')
    expect(CAPTURE.period.to).toBe('2026-08-30')
    expect(CAPTURE.period.compare_from).toBe('2026-07-25')
    expect(CAPTURE.period.compare_to).toBe('2026-08-23')
  })
})

describe('Gate 4I — counts equal Good Leads (responded population)', () => {
  it('each rooftop good = total_responded = 54 / 22 / 19', () => {
    for (const d of DEALERS) {
      const exp = EXPECTED_GOOD_LEADS[d.dealer_id]
      expect(d.current.good.n).toBe(exp)
      expect(d.current.total_responded).toBe(exp)
      expect(d.current.no_response.n).toBe(0)
    }
  })

  it('response buckets reconcile to total_responded', () => {
    for (const d of DEALERS)
      expect(
        d.current.within_15m.n +
          d.current.within_30m.n +
          d.current.over_30m.n +
          d.current.no_response.n,
      ).toBe(d.current.total_responded)
  })

  it('after-hours late-response rate recomputes from its own denom/breaches', () => {
    for (const d of DEALERS) {
      const [denom, breaches, rate] = EXPECTED_AFTER_HOURS[d.dealer_id]
      expect(d.after_hours_late_response.denominator).toBe(denom)
      expect(d.after_hours_late_response.breaches).toBe(breaches)
      expect(d.after_hours_late_response.rate_pct).toBe(rate)
      expect(Math.round((breaches / denom) * 1000) / 10).toBe(rate)
    }
  })
})

describe('Gate 4I — nothing promotes (tied to committed governance)', () => {
  it('SW-013 / SW-016 / SW-017 committed spec is fully held ⇒ not promotable', () => {
    for (const id of SUPPLEMENTAL_METRIC_IDS) {
      const row = GATE4G.rows.find(
        (r: { metric_id: string }) => r.metric_id === id,
      )
      expect(row, `${id} present in committed 4G matrix`).toBeTruthy()
      const spec = row.frozen_e1_spec
      // All 9 required-resolved fields are held.
      expect(heldSpecFields(spec).length).toBe(9)
      expect(spec.rank_direction).toBe('not_applicable (held)')
      expect(isPromotableFromCapture(spec, spec.rank_direction)).toBe(false)
    }
  })

  it('the emitted ledger records promoted:false + non-promotion reasons for all three', () => {
    const decs = INTERNAL.decisions
    expect(decs.map((d: { metric_id: string }) => d.metric_id).sort()).toEqual([
      'SW-013',
      'SW-016',
      'SW-017',
    ])
    for (const d of decs) {
      expect(d.promoted).toBe(false)
      expect(Array.isArray(d.non_promotion_reasons)).toBe(true)
      expect(d.non_promotion_reasons.length).toBeGreaterThan(0)
    }
    // SW-013 must record the definition-mismatch reason (no-response vs late-response).
    const sw013 = decs.find(
      (d: { metric_id: string }) => d.metric_id === 'SW-013',
    )
    expect(
      sw013.non_promotion_reasons.some((r: string) =>
        /Definition mismatch/i.test(r),
      ),
    ).toBe(true)
  })

  it('the measured-unscored contract does not relax evaluated criteria', () => {
    expect(INTERNAL.measured_unscored_contract.layer).toBe('measured_unscored')
    expect(
      MEASURED_UNSCORED_CONTRACT.relationship_to_evaluated_criteria,
    ).toMatch(/does NOT relax frozen_e1_spec/)
  })
})

describe('Gate 4I — accounting unchanged (17/278 = 51/834/885)', () => {
  it('committed Gate 4H coverage is still 295 / 17 / 278', () => {
    expect(GATE4H.coverage).toEqual({
      conditions: 295,
      evaluated: 17,
      unresolved: 278,
    })
  })

  it('SW-013 / SW-016 / SW-017 remain unresolved / 4G in the committed ledger', () => {
    for (const id of SUPPLEMENTAL_METRIC_IDS) {
      const r = GATE4H.rows.find(
        (x: { metric_id: string }) => x.metric_id === id,
      )
      expect(r.status).toBe('unresolved')
      expect(r.gate_origin).toBe('4G')
    }
  })

  it('the emitted ledger asserts the exact cell accounting and no change', () => {
    const a = INTERNAL.accounting
    expect(a.evaluated).toBe(17)
    expect(a.unresolved).toBe(278)
    expect(a.evaluated_cells).toBe(51)
    expect(a.unresolved_cells).toBe(834)
    expect(a.total_cells).toBe(885)
    expect(a.change_from_this_gate).toMatch(/none/i)
  })
})

describe('Gate 4I — customer observations are safe', () => {
  it('every rooftop separates observed_fact / inference / hypothesis', () => {
    expect(CUSTOMER.observations).toHaveLength(3)
    for (const o of CUSTOMER.observations) {
      expect(Array.isArray(o.observed_fact)).toBe(true)
      expect(o.observed_fact.length).toBeGreaterThan(0)
      expect(Array.isArray(o.inference)).toBe(true)
      expect(Array.isArray(o.hypothesis)).toBe(true)
      expect(o.status).toMatch(/NOT a scored/i)
    }
  })

  it('customer copy makes no cars-sold / ROI promise', () => {
    for (const o of CUSTOMER.observations)
      for (const s of [...o.observed_fact, ...o.inference, ...o.hypothesis])
        expect(ROI_WORDS.test(s), s).toBe(false)
    // But it DOES frame the opportunity as recoverable lead-response.
    const allText = JSON.stringify(CUSTOMER.observations)
    expect(allText).toMatch(/recoverable lead-response opportunity/)
  })

  it('no rep name / person name / responded rows leak into any committed artifact', () => {
    const both = JSON.stringify(INTERNAL) + JSON.stringify(CUSTOMER)
    // No raw per-lead row structures are committed.
    expect(both).not.toMatch(/"rep"\s*:/)
    expect(both).not.toMatch(/responded_rows|total_lead_rows/)
    // The pure builder's fail-closed person-name guard rejects a planted rep name.
    const planted = { ...DEALERS[0] }
    const obs = buildCustomerObservation(planted)
    obs.observed_fact.push('Handled by John Smith on the sales floor.')
    expect(() => assertObservationSafe(obs)).toThrow(/rep\/person name/i)
  })

  it('avgPhrase formats M:SS into plain minutes/seconds', () => {
    expect(avgPhrase('6:09')).toBe('6 minutes 9 seconds')
    expect(avgPhrase('8:24')).toBe('8 minutes 24 seconds')
    expect(avgPhrase('1:00')).toBe('1 minute 0 seconds')
  })

  it('Ford shows deterioration vs prior; Honda does not', () => {
    const ford = CUSTOMER.observations.find(
      (o: { dealer_id: string }) => o.dealer_id === '21047',
    )
    expect(JSON.stringify(ford.inference)).toMatch(
      /slower than the previous 30 days/,
    )
    const honda = CUSTOMER.observations.find(
      (o: { dealer_id: string }) => o.dealer_id === '21043',
    )
    expect(JSON.stringify(honda.inference)).not.toMatch(
      /slower than the previous/,
    )
  })
})
