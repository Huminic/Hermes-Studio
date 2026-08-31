// @vitest-environment node
/**
 * Gate R1 vitest gate for the Semantic Watchdog 295×3 inventory + cluster graph + engine-truth
 * reconciliation. Runs the standalone validator AND independently asserts the invariants the shadow
 * required: exact runnable set (SW-032/SW-041) with traced values; taxonomies/overlay/Service/unresolved;
 * 885 rows; reason on every non-runnable; zero Service in Sales; no strict-from-quarantined; missing≠0;
 * catalog(20)/support-manifest membership + response-time slug + gross precedence reconciliation.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
// @ts-ignore — standalone .mjs validator has no type declarations; imported for the gate at runtime.
import { validateSw295 } from '../../scripts/m2r-sw295/validate-sw295-inventory.mjs'
import { METRIC_CATALOG } from '@/server/watchdog/metric-catalog'
import { HALO_SUPPORT_MANIFEST, listSlugSupport } from '@/server/watchdog/halo-support-manifest'

const inv = JSON.parse(fs.readFileSync(path.resolve('docs/halo/contract/sw295-inventory.json'), 'utf8'))
const row = (id: string, dealer: string) => inv.rows.find((r: any) => r.metric_id === id && r.dealer === dealer)

describe('SW295 inventory — standalone validator', () => {
  it('passes every machine-checkable invariant', () => {
    const r = validateSw295()
    expect(r.failures, r.failures.join('\n')).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.summary.rows).toBe(885)
  })
})

describe('SW295 inventory — runnable set is EXACTLY SW-032/SW-041 with traced values', () => {
  const EXPECT: Record<string, Record<string, [number, number, boolean]>> = {
    'SW-032': { 'serra-honda': [8, 14, false], 'serra-nissan': [2, 6, true], 'tony-serra-ford': [3, 7, true] },
    'SW-041': { 'serra-honda': [5, 14, false], 'serra-nissan': [3, 6, true], 'tony-serra-ford': [4, 7, true] },
  }
  it('6 runnable rows, 4 firings, all high-confidence and lineage-traced', () => {
    const runnable = inv.rows.filter((r: any) => r.state === 'supported_strict_runnable')
    expect(runnable.length).toBe(6)
    expect(new Set(runnable.map((r: any) => r.metric_id))).toEqual(new Set(['SW-032', 'SW-041']))
    expect(runnable.filter((r: any) => r.evidence.fires).length).toBe(4)
    for (const r of runnable) {
      const [num, den, fires] = EXPECT[r.metric_id][r.dealer]
      expect([r.evidence.numerator, r.evidence.denominator, r.evidence.fires]).toEqual([num, den, fires])
      expect(r.confidence).toBe('high')
      expect(r.lineage.source_sha256).toBeTruthy()
      expect(r.lineage.period).toBe('2026-08-24..2026-08-30')
      expect(r.evidence.real_from_18wb).toBe(true)
    }
  })
  it('other current slugs are NOT restated as accepted SW conditions', () => {
    // e.g. gross/dashboard primitives exist but are not accepted-runnable SW conditions here.
    for (const id of ['SW-001', 'SW-049', 'SW-004']) {
      for (const d of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
        expect(row(id, d).state).not.toBe('supported_strict_runnable')
      }
    }
  })
})

describe('SW295 inventory — boundaries', () => {
  it('all 18 Service-domain IDs are out of Sales, zero in a Sales cluster', () => {
    const svc = ['SW-079', 'SW-081', 'SW-083', 'SW-115', 'SW-118', 'SW-199', 'SW-222', 'SW-223', 'SW-224', 'SW-225', 'SW-226', 'SW-227', 'SW-228', 'SW-229', 'SW-263', 'SW-270', 'SW-279', 'SW-294']
    for (const id of svc) for (const d of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      expect(row(id, d).disposition).toBe('service_domain_out_of_sales')
      expect(row(id, d).cluster).toBe('service_domain_out_of_sales')
    }
  })
  it('SW-082/SW-218 unresolved + withheld from Sales', () => {
    for (const id of ['SW-082', 'SW-218']) for (const d of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      expect(row(id, d).unresolved_withheld_from_sales).toBe(true)
      expect(row(id, d).state).toBe('withheld_unresolved')
    }
  })
  it('missing is NEVER zero and every non-runnable row has a reason', () => {
    for (const r of inv.rows) {
      if (r.state !== 'supported_strict_runnable') {
        expect(r.evidence.value).toBeNull()
        expect(r.reason && r.reason.length > 0).toBe(true)
      }
    }
  })
  it('no accepted/strict state is powered by a quarantined ROI/CAGE/Comm family', () => {
    const QUAR = /lead source roi|enterprise|cage|communication/i
    for (const r of inv.rows) if (r.state === 'supported_strict_runnable') expect(QUAR.test(r.lineage.source_family || '')).toBe(false)
  })
})

describe('engine truth reconciliation (R1)', () => {
  it('catalog is 20 slugs and the support-manifest covers all 20 (incl. dashboard.response_time_actual_avg_min)', () => {
    expect(METRIC_CATALOG.length).toBe(20)
    for (const m of METRIC_CATALOG) expect(HALO_SUPPORT_MANIFEST[m.id]).toBeTruthy()
    expect(HALO_SUPPORT_MANIFEST['dashboard.response_time_actual_avg_min']).toBeTruthy()
    expect(listSlugSupport().length).toBe(20)
  })
  it('correction 2: response-time + recon-mismatches are SUPPORTED (match ratified runtime NATIVE7)', () => {
    expect(HALO_SUPPORT_MANIFEST['dashboard.response_time_actual_avg_min'].state).toBe('supported')
    expect(HALO_SUPPORT_MANIFEST['gross.reconciliation_mismatches'].state).toBe('supported')
    const supported = listSlugSupport().filter((e) => e.state === 'supported').map((e) => e.slug)
    expect(new Set(supported)).toEqual(new Set([
      'gross.total_sum', 'gross.reconciliation_mismatches', 'dashboard.response_time_actual_avg_min',
      'appt.show_rate', 'appt.no_show_rate', 'appt.confirmed_rate', 'appt.cancel_rate',
    ]))
  })
  it('gross.total_sum provenance reflects CRM Sales Gross precedence (not Dashboard-only)', () => {
    expect(HALO_SUPPORT_MANIFEST['gross.total_sum'].sourceFamily).toMatch(/crm_sales_gross/)
    expect(HALO_SUPPORT_MANIFEST['gross.total_sum'].definition).toMatch(/CRM Sales Gross/)
  })
})
