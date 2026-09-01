// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import {
  resolveAcceptedFacts,
  assembleAcceptedFacts,
  validateAcceptedFactsBundle,
  AcceptedFactsValidationError,
  NATIVE7,
  RATIFIED_EXACT_CONDITIONS,
  type AcceptedFactsBundle,
  type AcceptedFactsSources,
  type CountDisagreement,
} from '@/server/reports/accepted-facts'
import { HaloProfileNotAllowedError } from '@/server/reports/halo-report-card'
import type { AppointmentsMetrics, CrmSalesGross, DealershipPerformance } from '@/server/ingest-native-metrics'

const REAL_ROOT = '/srv/ingest-dev/analytics'
const HAVE_DATA = fs.existsSync(`${REAL_ROOT}/serra-honda/brain/brain.db`)
const NOW = Date.parse('2026-08-31T12:00:00Z') // fixed clock => deterministic freshness

const NATIVE7_SET = new Set<string>(NATIVE7)
const QUARANTINED = ['roi.total_leads', 'roi.sold_from_leads', 'roi.duplicate_rate', 'cage.total_comms', 'cage.deals_from_leads', 'cage.rep_count', 'comm.escalation_keyword_screen', 'comm.template_overuse', 'comm.inbound_high_intent_keywords', 'comm.multi_rep_within_24h']

// ── Durable, receipt-derived, non-PII fixture (survives away from /srv) ─────────────
type Fx = { period: { start: string; end: string }; stores: Record<string, { appointments: unknown; crm: unknown; dashboard: unknown }> }
const FIXTURE: Fx = JSON.parse(fs.readFileSync(new URL('./fixtures/r2-governed-facts.fixture.json', import.meta.url), 'utf8'))

function sourcesFromFixture(profile: string): AcceptedFactsSources {
  const s = FIXTURE.stores[profile]
  return {
    appointments: (s.appointments as AppointmentsMetrics) ?? null,
    crm: (s.crm as CrmSalesGross) ?? null,
    dashboard: (s.dashboard as DealershipPerformance) ?? null,
  }
}
const fromFixture = (profile: string, now = NOW, maxAgeDays?: number) =>
  assembleAcceptedFacts(profile, sourcesFromFixture(profile), { now, maxAgeDays })

const cond = (b: AcceptedFactsBundle, id: string) => b.exact_conditions.find((c) => c.condition_id === id)!
const kpi = (b: AcceptedFactsBundle, slug: string) => b.observed_kpis.find((k) => k.slug === slug)!

describe('accepted facts - Sales-only gate (no data needed)', () => {
  it('fails closed for non-Sales / unknown / traversal-like profiles', () => {
    for (const bad of ['serra-service', 'unknown-store', 'serra-honda/../serra-service', '']) {
      expect(() => resolveAcceptedFacts(bad)).toThrow(HaloProfileNotAllowedError)
      expect(() => assembleAcceptedFacts(bad, { appointments: null, crm: null, dashboard: null })).toThrow(HaloProfileNotAllowedError)
    }
  })
  it('only SW-032 and SW-041 are ratified exact conditions', () => {
    expect([...RATIFIED_EXACT_CONDITIONS]).toEqual(['SW-032', 'SW-041'])
  })
})

describe('accepted facts - DURABLE receipt-derived fixture (no /srv required)', () => {
  it('serra-honda: neither SW fires; NATIVE7 observed; 21 context facts; gross reconciles; no discrepancy; valid', () => {
    const b = fromFixture('serra-honda')
    expect(() => validateAcceptedFactsBundle(b)).not.toThrow()
    expect(b.period).toEqual({ start: '2026-08-24', end: '2026-08-30' })
    expect(cond(b, 'SW-032')).toMatchObject({ numerator: 8, denominator: 14, fires: false, display: '57.1%' })
    expect(cond(b, 'SW-041')).toMatchObject({ numerator: 5, denominator: 14, fires: false, display: '35.7%' })
    expect(new Set(b.observed_kpis.map((k) => k.slug))).toEqual(NATIVE7_SET)
    expect(kpi(b, 'gross.total_sum').display).toBe('$14,185.20')
    // context facts: Dashboard 9 + CRM 5 + Appointments 7 = 21 (separate from NATIVE7).
    expect(b.accepted_context_facts.length).toBe(21)
    expect(b.counts.observed_kpis).toBe(7)
    expect(b.counts.context_facts).toBe(21)
    // cross-source gross reconciles within tolerance; no count discrepancy for Honda.
    expect(b.cross_source_gross).toMatchObject({ periods_match: true, reconciles: true })
    expect(b.gates.periods_compatible).toBe(true)
    expect(b.gates.count_dependent_composites_blocked).toBe(false)
    expect(b.discrepancies.length).toBe(0)
    // quarantined never accepted
    for (const q of QUARANTINED) expect(b.observed_kpis.some((k) => k.slug === q)).toBe(false)
  })

  it('serra-nissan: SW-032 (33.3%) and SW-041 (50.0%) both fire; gross reconciles; no discrepancy', () => {
    const b = fromFixture('serra-nissan')
    expect(() => validateAcceptedFactsBundle(b)).not.toThrow()
    expect(cond(b, 'SW-032')).toMatchObject({ fires: true, display: '33.3%' })
    expect(cond(b, 'SW-041')).toMatchObject({ fires: true, display: '50.0%' })
    expect(b.cross_source_gross).toMatchObject({ reconciles: true })
    expect(b.discrepancies.length).toBe(0)
  })

  it('tony-serra-ford: both fire; CRM(7) vs Dashboard(6) discrepancy blocks count composites; gross STILL reconciles', () => {
    const b = fromFixture('tony-serra-ford')
    expect(() => validateAcceptedFactsBundle(b)).not.toThrow()
    expect(cond(b, 'SW-032')).toMatchObject({ fires: true, display: '42.9%' })
    expect(cond(b, 'SW-041')).toMatchObject({ fires: true, display: '57.1%' })
    const d = b.discrepancies.find((x): x is CountDisagreement => x.kind === 'count_disagreement')!
    expect(d.crm_rows).toBe(7)
    expect(d.dashboard_sold).toBe(6)
    expect(d.gross_reconciles).toBe(true) // gross reconciles even though the COUNT disagrees
    expect(b.gates.count_dependent_composites_blocked).toBe(true)
    // absolute gross reconciles across sources even though the unit COUNT disagrees.
    expect(b.cross_source_gross).toMatchObject({ periods_match: true, reconciles: true })
    expect(kpi(b, 'gross.total_sum').caveats.join(' ')).toMatch(/composite/i)
  })

  it('full 20-slug accounting: observed + withheld = 20; context facts are SEPARATE', () => {
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      const b = fromFixture(p)
      expect(b.observed_kpis.length + b.withheld.length).toBe(20)
      // context facts are not counted in the 20-slug product coverage
      expect(b.accepted_context_facts.every((f) => !NATIVE7_SET.has(f.key))).toBe(true)
    }
  })
})

describe('accepted facts - NEGATIVE compatibility/freshness controls (no /srv)', () => {
  it('period mismatch: cross-source blocked, period null, discrepancy recorded, source-specific facts survive', () => {
    const s = sourcesFromFixture('serra-honda')
    // Perturb ONLY the CRM period so families no longer share the governed week.
    const crm = JSON.parse(JSON.stringify(s.crm)) as CrmSalesGross
    crm.provenance.period = { start: '2026-08-17', end: '2026-08-23' }
    const b = assembleAcceptedFacts('serra-honda', { ...s, crm }, { now: NOW })
    expect(b.gates.periods_compatible).toBe(false)
    expect(b.period).toEqual({ start: null, end: null }) // never called the "same governed week"
    expect(b.discrepancies.some((d) => d.id === 'period_mismatch_across_families')).toBe(true)
    expect(b.gates.count_dependent_composites_blocked).toBe(true)
    // Source-specific facts still survive (appointments show rate still an observed KPI).
    expect(b.observed_kpis.some((k) => k.slug === 'appt.show_rate')).toBe(true)
  })

  it('gross mismatch: same period but totals diverge > $0.50 -> reconciles false, composites blocked', () => {
    const s = sourcesFromFixture('serra-honda')
    const crm = JSON.parse(JSON.stringify(s.crm)) as CrmSalesGross
    crm.totalSum = (crm.totalSum ?? 0) + 100 // break reconciliation, keep same period
    const b = assembleAcceptedFacts('serra-honda', { ...s, crm }, { now: NOW })
    expect(b.cross_source_gross).toMatchObject({ periods_match: true, reconciles: false })
    expect(b.gates.gross_cross_source_reconciles).toBe(false)
    expect(b.gates.count_dependent_composites_blocked).toBe(true)
    // gross.total_sum still promoted (CRM precedence) but carries the composite-blocked caveat.
    expect(kpi(b, 'gross.total_sum').caveats.join(' ')).toMatch(/composite/i)
  })

  it('stale family: exact conditions NOT promoted; appt slugs withheld as stale (never zero)', () => {
    const staleNow = Date.parse('2026-10-01T00:00:00Z') // period end 08-30 => ~32d old
    const b = fromFixture('serra-honda', staleNow)
    expect(b.gates.exact_conditions_promoted).toBe(false)
    expect(b.gates.exact_conditions_block_reason).toMatch(/stale/i)
    expect(b.exact_conditions.length).toBe(0)
    expect(b.observed_kpis.length).toBe(0)
    expect(b.gates.stale_families.sort()).toEqual(['appointments', 'crm_sales_gross', 'dealership_performance'])
    const showW = b.withheld.find((w) => w.slug === 'appt.show_rate')!
    expect(showW.sub_state).toBe('stale')
    expect(showW.reason).toMatch(/stale/i)
    expect(() => validateAcceptedFactsBundle(b)).not.toThrow() // stale but honestly represented
  })
})

describe('accepted facts - validator RE-COMPUTES fail-closed (7 shadow corruptions)', () => {
  const clone = (b: AcceptedFactsBundle): AcceptedFactsBundle => JSON.parse(JSON.stringify(b))
  const base = () => fromFixture('serra-honda') // valid, passes validation
  const mutant = (fn: (b: AcceptedFactsBundle) => void): AcceptedFactsBundle => { const b = clone(base()); fn(b); return b }

  it('(1) native slug with a quarantined source_family (lead_source_roi) is rejected', () => {
    const b = mutant((x) => { x.observed_kpis.find((k) => k.slug === 'gross.total_sum')!.compatibility.source_family = 'lead_source_roi' })
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })
  it('(2) exact SW condition with source_family = Service Dept is rejected', () => {
    const b = mutant((x) => { x.exact_conditions[0].compatibility.source_family = 'Service Dept' })
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })
  it('(3) exact condition with a bad checksum is rejected', () => {
    const b = mutant((x) => { x.exact_conditions[0].compatibility.checksum = 'deadbeef' })
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })
  it('(4) forged exact numerator/value/fires is rejected (recomputed from context)', () => {
    expect(() => validateAcceptedFactsBundle(mutant((x) => { x.exact_conditions[0].numerator = 999 }))).toThrow(AcceptedFactsValidationError)
    expect(() => validateAcceptedFactsBundle(mutant((x) => { x.exact_conditions[0].value = 0.01 }))).toThrow(AcceptedFactsValidationError)
    expect(() => validateAcceptedFactsBundle(mutant((x) => { x.exact_conditions[0].fires = !x.exact_conditions[0].fires }))).toThrow(AcceptedFactsValidationError)
    expect(() => validateAcceptedFactsBundle(mutant((x) => { x.exact_conditions[0].threshold = 0.9 }))).toThrow(AcceptedFactsValidationError)
  })
  it('(5) context fact with a quarantined source_family (lead_source_roi) is rejected', () => {
    const b = mutant((x) => { x.accepted_context_facts[0].source_family = 'lead_source_roi' })
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })
  it('(6) accepted context fact marked freshness = stale is rejected', () => {
    const b = mutant((x) => { x.accepted_context_facts[0].freshness = 'stale' })
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })
  it('(7) family period changed while gates.periods_compatible stays true is rejected', () => {
    const b = mutant((x) => {
      const c = x.family_coverage.find((f) => f.family === 'crm_sales_gross')!
      c.period = { start: '2026-08-17', end: '2026-08-23' } // now families disagree...
      x.gates.periods_compatible = true // ...but the gate still claims compatible
    })
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })

  it('CONTROL: the honest fixture bundle passes validation for all three stores', () => {
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      expect(() => validateAcceptedFactsBundle(fromFixture(p))).not.toThrow()
    }
  })
})

describe('accepted facts - third-shadow data-integrity corruptions', () => {
  const clone = (b: AcceptedFactsBundle): AcceptedFactsBundle => JSON.parse(JSON.stringify(b))

  // 1. Exact context inventory (no prefix acceptance).
  it('rejects an unknown context key (dashboard.injected)', () => {
    const b = clone(fromFixture('serra-honda'))
    b.accepted_context_facts.push({ ...b.accepted_context_facts[0], key: 'dashboard.injected', evidence_ref: 'dashboard.injected' })
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects a duplicate context key', () => {
    const b = clone(fromFixture('serra-honda'))
    const dup = b.accepted_context_facts.find((f) => f.key === 'dashboard.leads')!
    b.accepted_context_facts.push({ ...dup })
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects a context key mapped to the wrong family', () => {
    const b = clone(fromFixture('serra-honda'))
    b.accepted_context_facts.find((f) => f.key === 'dashboard.leads')!.source_family = 'crm_sales_gross'
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects a missing required context key for a fresh family', () => {
    const b = clone(fromFixture('serra-honda'))
    b.accepted_context_facts = b.accepted_context_facts.filter((f) => f.key !== 'dashboard.leads')
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })
  it('asserts the exact family subset present on the honest bundle (9 dashboard / 5 crm / 7 appt)', () => {
    const b = fromFixture('serra-honda')
    const byFam = (p: string) => b.accepted_context_facts.filter((f) => f.key.startsWith(p)).map((f) => f.key).sort()
    expect(byFam('dashboard.')).toEqual(['dashboard.appts_set', 'dashboard.appts_shown', 'dashboard.avg_actual_response_min', 'dashboard.back_gross', 'dashboard.front_gross', 'dashboard.leads', 'dashboard.sold_in_period', 'dashboard.total_gross', 'dashboard.total_visits'])
    expect(byFam('crm.').length).toBe(5)
    expect(byFam('appointments.').length).toBe(7)
  })

  // 2. Gates recomputed from canonical facts.
  it('rejects a forged Ford count_dependent_composites_blocked=false', () => {
    const b = clone(fromFixture('tony-serra-ford'))
    b.gates.count_dependent_composites_blocked = false
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects a forged Ford blocked_composite_reason=null', () => {
    const b = clone(fromFixture('tony-serra-ford'))
    b.gates.blocked_composite_reason = null
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })

  // 3. Full discrepancy array recomputed field-by-field.
  it('rejects a forged count-discrepancy payload (wrong crm_rows)', () => {
    const b = clone(fromFixture('tony-serra-ford'))
    const d = b.discrepancies.find((x): x is CountDisagreement => x.kind === 'count_disagreement')!
    d.crm_rows = 99
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects a forged discrepancy description', () => {
    const b = clone(fromFixture('tony-serra-ford'))
    b.discrepancies[0].description = 'forged'
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects a fabricated extra (period_mismatch) discrepancy when families are compatible', () => {
    const b = clone(fromFixture('tony-serra-ford'))
    b.discrepancies.push({ kind: 'period_mismatch', id: 'period_mismatch_across_families', description: 'fake', family_periods: [], blocks_cross_source_claims: true })
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })

  // 4. Freshness recomputed from period end + as_of + policy.
  it('rejects all-family periods moved to 2020 while claiming fresh/current/age 0', () => {
    const b = clone(fromFixture('serra-honda'))
    for (const f of b.family_coverage) { f.period = { start: '2020-01-01', end: '2020-01-07' }; f.fresh = true; f.age_days = 0; f.freshness = 'fresh' }
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects an internally inconsistent as_of / policy', () => {
    const bad1 = clone(fromFixture('serra-honda')); bad1.as_of_iso = 'not-a-date'
    expect(() => validateAcceptedFactsBundle(bad1)).toThrow(AcceptedFactsValidationError)
    const bad2 = clone(fromFixture('serra-honda')); bad2.max_age_days = 0
    expect(() => validateAcceptedFactsBundle(bad2)).toThrow(AcceptedFactsValidationError)
    const bad3 = clone(fromFixture('serra-honda')); bad3.family_coverage[0].as_of_iso = '2026-01-01T00:00:00.000Z'
    expect(() => validateAcceptedFactsBundle(bad3)).toThrow(AcceptedFactsValidationError)
  })

  it('CONTROL: honest Honda/Nissan/Ford bundles pass the strengthened validator', () => {
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) expect(() => validateAcceptedFactsBundle(fromFixture(p))).not.toThrow()
  })
})

describe('accepted facts - final-shadow corrections (gate + exact ID set)', () => {
  const clone = (b: AcceptedFactsBundle): AcceptedFactsBundle => JSON.parse(JSON.stringify(b))

  // 1. single_period_no_trend must be recomputed, not caller-trusted.
  it('rejects a forged gates.single_period_no_trend = false', () => {
    const b = clone(fromFixture('serra-honda'))
    b.gates.single_period_no_trend = false
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })

  // 2. Exact ratified ID set + uniqueness (not array length alone).
  it('rejects a duplicate SW-032 replacing SW-041 (same length, wrong set)', () => {
    const b = clone(fromFixture('serra-nissan'))
    expect(b.exact_conditions.map((c) => c.condition_id)).toEqual(['SW-032', 'SW-041'])
    b.exact_conditions[1] = { ...b.exact_conditions[0] } // duplicate SW-032 in place of SW-041
    expect(b.exact_conditions.map((c) => c.condition_id)).toEqual(['SW-032', 'SW-032'])
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects a missing exact condition (only SW-032 when promoted)', () => {
    const b = clone(fromFixture('serra-nissan'))
    b.exact_conditions = b.exact_conditions.filter((c) => c.condition_id === 'SW-032')
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects an extra exact condition (3 entries)', () => {
    const b = clone(fromFixture('serra-nissan'))
    b.exact_conditions.push({ ...b.exact_conditions[0] })
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects reversed exact ID order (canonical order enforced)', () => {
    const b = clone(fromFixture('serra-nissan'))
    b.exact_conditions = [b.exact_conditions[1], b.exact_conditions[0]]
    expect(() => validateAcceptedFactsBundle(b)).toThrow(AcceptedFactsValidationError)
  })

  it('CONTROL: honest three-store bundles have exactly [SW-032, SW-041] and pass', () => {
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      const b = fromFixture(p)
      expect(b.exact_conditions.map((c) => c.condition_id)).toEqual(['SW-032', 'SW-041'])
      expect(b.gates.single_period_no_trend).toBe(true)
      expect(() => validateAcceptedFactsBundle(b)).not.toThrow()
    }
  })
})

describe.runIf(HAVE_DATA)('accepted facts - /srv read-only cross-check (equals the durable fixture)', () => {
  const saved = process.env.BRAIN_PROFILES_ROOT
  beforeAll(() => { process.env.BRAIN_PROFILES_ROOT = REAL_ROOT })
  afterAll(() => {
    if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT
    else process.env.BRAIN_PROFILES_ROOT = saved
  })

  it('the governed readers reproduce the fixture bundle for all three stores', () => {
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      const live = resolveAcceptedFacts(p, { now: NOW })
      const fix = fromFixture(p)
      // as_of is a runtime stamp; compare everything else.
      const strip = (b: AcceptedFactsBundle) => ({ ...b, family_coverage: b.family_coverage.map((f) => ({ ...f, as_of_iso: 'X' })) })
      expect(strip(live)).toEqual(strip(fix))
    }
  })
})
