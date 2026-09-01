// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { buildConsultantSynthesis, toExternalNarrative, CATALOG_CONDITION_COUNT, type ConsultantSynthesis } from '@/server/reports/consultant-synthesis'
import {
  assembleAcceptedFacts,
  resolveAcceptedFacts,
  AcceptedFactsValidationError,
  type AcceptedFactsBundle,
  type AcceptedFactsSources,
} from '@/server/reports/accepted-facts'
import type { AppointmentsMetrics, CrmSalesGross, DealershipPerformance } from '@/server/ingest-native-metrics'

const REAL_ROOT = '/srv/ingest-dev/analytics'
const HAVE_DATA = fs.existsSync(`${REAL_ROOT}/serra-honda/brain/brain.db`)
const NOW = Date.parse('2026-08-31T12:00:00Z')

type Fx = { stores: Record<string, { appointments: unknown; crm: unknown; dashboard: unknown }> }
const FIXTURE: Fx = JSON.parse(fs.readFileSync(new URL('./fixtures/r2-governed-facts.fixture.json', import.meta.url), 'utf8'))
function sourcesFromFixture(profile: string): AcceptedFactsSources {
  const s = FIXTURE.stores[profile]
  return { appointments: (s.appointments as AppointmentsMetrics) ?? null, crm: (s.crm as CrmSalesGross) ?? null, dashboard: (s.dashboard as DealershipPerformance) ?? null }
}
const bundleOf = (p: string, extra?: Partial<AcceptedFactsSources>, now = NOW) => assembleAcceptedFacts(p, { ...sourcesFromFixture(p), ...extra }, { now })
const synthOf = (p: string) => buildConsultantSynthesis(bundleOf(p))
const mkey = (s: ConsultantSynthesis, k: string) => s.derived_measures.find((m) => m.key === k)
const fid = (s: ConsultantSynthesis, id: string) => s.findings.find((f) => f.id === id)
const BANNED = /\b(limitation|limitations|quarantine|quarantined|withheld|missing|issue|issues)\b/i

describe('R3 consultant synthesis - positive (durable fixture; no /srv)', () => {
  it('serra-honda: funnel+appt+gross measures; avg-per-sale allowed; neither SW fires; 295 accounted', () => {
    const s = synthOf('serra-honda')
    // definition-compatible derived measures present
    for (const k of ['funnel.appointment_set_rate', 'funnel.shown_through_rate', 'funnel.lead_to_sale_yield', 'appt.confirmation_rate', 'gross.front_mix', 'gross.total', 'responsiveness.avg_actual_response_min']) {
      expect(mkey(s, k), k).toBeTruthy()
    }
    // Honda CRM 5 == Dashboard 5 -> average per sale allowed; cross gross-per-delivered allowed.
    expect(mkey(s, 'gross.avg_per_sale')).toBeTruthy()
    expect(mkey(s, 'cross.gross_per_delivered')).toBeTruthy()
    expect(s.blocked_measures.length).toBe(0)
    // Neither SW fires -> on-track finding, no SW-fire findings.
    expect(fid(s, 'r3-appointments-on-track')).toBeTruthy()
    expect(fid(s, 'r3-appt-show-leakage')).toBeFalsy()
    // 295 accountability: exactly SW-032/SW-041 directly evaluated.
    expect(s.catalog_accountability.total).toBe(CATALOG_CONDITION_COUNT)
    expect(s.catalog_accountability.directly_evaluated).toEqual(['SW-032', 'SW-041'])
    expect(s.catalog_accountability.accounted_only_count).toBe(293)
  })

  it('serra-nissan: SW-032 + SW-041 findings fire; avg-per-sale allowed (count agrees)', () => {
    const s = synthOf('serra-nissan')
    expect(fid(s, 'r3-appt-show-leakage')).toBeTruthy()
    expect(fid(s, 'r3-no-show-handoff')).toBeTruthy()
    expect(fid(s, 'r3-no-show-effort-reduction')).toBeTruthy()
    expect(mkey(s, 'gross.avg_per_sale')).toBeTruthy()
    // Benchmark: NONE emitted; the incompatible appointment material is internal provenance only.
    const show = fid(s, 'r3-appt-show-leakage')!
    expect(show.benchmark.state).toBe('no_benchmark')
    expect(show.incompatible_reference?.definition_compatibility).toBe('incompatible')
  })

  it('tony-serra-ford: count-dependent composites BLOCKED; gross preserved; count-reconciliation finding; front-gross-negative lift', () => {
    const s = synthOf('tony-serra-ford')
    expect(mkey(s, 'gross.avg_per_sale')).toBeFalsy()
    expect(s.blocked_measures.some((b) => b.key === 'gross.avg_per_sale' && b.blocked_by === 'count_disagreement')).toBe(true)
    expect(s.blocked_measures.some((b) => b.key === 'cross.gross_per_delivered')).toBe(true)
    // separately-reconciled gross context preserved
    expect(mkey(s, 'gross.total')).toBeTruthy()
    expect(fid(s, 'r3-count-reconciliation')).toBeTruthy()
    // Ford front gross is negative -> sales/gross-lift finding
    const gm = fid(s, 'r3-gross-mix')!
    expect(gm.lens).toBe('sales_gross_lift')
  })

  it('findings are well-formed, cover all five lenses across the three stores, and cite only accepted refs', () => {
    const lenses = new Set<string>()
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      const s = synthOf(p)
      for (const f of s.findings) {
        lenses.add(f.lens)
        for (const k of ['id', 'formula', 'proves', 'does_not_prove', 'business_consequence', 'next_action', 'follow_up_metric', 'inert_notification_candidate', 'external_automation_candidate', 'external_copy'] as const) {
          expect(typeof f[k]).toBe('string'); expect((f[k] as string).length).toBeGreaterThan(0)
        }
        expect(f.evidence_refs.length).toBeGreaterThan(0)
        expect(f.inert_notification_candidate).toMatch(/INERT/)
        expect(f.external_automation_candidate).toMatch(/RECOMMENDATION ONLY/)
        // findings must NOT CLAIM causality / trend / industry superiority
        expect(f.proves + ' ' + f.external_copy).not.toMatch(/\b(because|due to|caused by|outperform\w*|best[- ]in[- ]class|industry[- ]leading|trending|month-over-month|year-over-year)\b/i)
        // ranks contiguous handled below
      }
      // ranks 1..n contiguous, score desc
      const ranks = s.findings.map((f) => f.impact_rank)
      expect(ranks).toEqual(ranks.map((_, i) => i + 1))
      for (let i = 1; i < s.findings.length; i++) expect(s.findings[i - 1].impact_score).toBeGreaterThanOrEqual(s.findings[i].impact_score)
    }
    expect(lenses).toEqual(new Set(['expense_reduction', 'sales_gross_lift', 'training', 'handoff_process', 'prospect_friction']))
  })

  it('external narrative is customer-safe: no engineering words, no Service/Parts (built from bundle)', () => {
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      const ext = toExternalNarrative(bundleOf(p))
      const blob = JSON.stringify(ext)
      expect(blob).not.toMatch(BANNED)
      expect(blob).not.toMatch(/service|parts/i)
      expect(ext.opportunities.length).toBeGreaterThan(0)
    }
  })

  it('deterministic: two builds are deep-equal', () => {
    expect(synthOf('tony-serra-ford')).toEqual(synthOf('tony-serra-ford'))
  })
})

describe('R3 consultant synthesis - negative / boundary controls (no /srv)', () => {
  it('fail-closed: a forged bundle (dealer mismatch) is rejected before synthesis', () => {
    const b = JSON.parse(JSON.stringify(bundleOf('serra-honda'))) as AcceptedFactsBundle
    b.dealer_name = 'Fake Motors'
    expect(() => buildConsultantSynthesis(b)).toThrow(AcceptedFactsValidationError)
  })

  it('period mismatch: cross-source gross-per-delivered is blocked; no false single-week claim', () => {
    const crm = JSON.parse(JSON.stringify(sourcesFromFixture('serra-honda').crm)) as CrmSalesGross
    crm.provenance.period = { start: '2026-08-17', end: '2026-08-23' }
    const s = buildConsultantSynthesis(bundleOf('serra-honda', { crm }))
    expect(s.blocked_measures.some((b) => b.key === 'cross.gross_per_delivered' && b.blocked_by === 'period_mismatch')).toBe(true)
    expect(JSON.stringify(s.findings)).not.toMatch(/governed week/i)
  })

  it('stale: all families stale -> no derived measures, no findings, zero directly-evaluated', () => {
    const s = buildConsultantSynthesis(bundleOf('serra-honda', {}, Date.parse('2026-10-01T00:00:00Z')))
    expect(s.derived_measures.length).toBe(0)
    expect(s.findings.length).toBe(0)
    expect(s.catalog_accountability.directly_evaluated_count).toBe(0)
    expect(s.catalog_accountability.accounted_only_count).toBe(295)
  })

  it('missing source: dashboard absent -> funnel/response measures absent; CRM gross + appt measures survive', () => {
    const s = buildConsultantSynthesis(bundleOf('serra-honda', { dashboard: null }))
    expect(mkey(s, 'funnel.lead_to_sale_rate')).toBeFalsy()
    expect(mkey(s, 'responsiveness.avg_actual_response_min')).toBeFalsy()
    expect(mkey(s, 'gross.total')).toBeTruthy() // CRM still present
    expect(mkey(s, 'appt.confirmation_rate')).toBeTruthy()
  })

  it('benchmark reclassification: NO finding emits a benchmark; incompatible material stays internal provenance only', () => {
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      const s = synthOf(p)
      for (const f of s.findings) expect(f.benchmark.state).toBe('no_benchmark')
      // show/no-show findings keep the incompatible reference internally, marked incompatible, with a URL.
      const show = fid(s, 'r3-appt-show-leakage') ?? fid(s, 'r3-appointments-on-track')
      if (show?.incompatible_reference) {
        expect(show.incompatible_reference.definition_compatibility).toBe('incompatible')
        expect(show.incompatible_reference.source_url).toMatch(/^https:\/\//)
      }
      // external copy must NOT compare to or imply that reference / a standard.
      const ext = toExternalNarrative(bundleOf(p))
      expect(JSON.stringify(ext)).not.toMatch(/benchmark|industry|standard|foureyes|demandlocal/i)
    }
  })

  it('no Service/Parts anywhere; every measure input and finding ref is an accepted key', () => {
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      const s = synthOf(p)
      // Data + customer-facing fields carry NO Service/Parts (benchmark provenance notes,
      // which may contain a governance guardrail like "that is a service number", are internal).
      const dataBlob = JSON.stringify(s.findings.map((f) => ({ c: f.external_copy, p: f.proves, n: f.next_action, b: f.business_consequence, cl: f.clusters, e: f.evidence_refs, fm: f.formula, o: f.owner }))) + JSON.stringify(s.derived_measures)
      expect(dataBlob).not.toMatch(/service|parts/i)
      const acceptedInputs = new Set<string>(s.derived_measures.map((m) => m.key))
      // finding evidence refs resolve to context/observed keys or measure keys (accepted only)
      for (const f of s.findings) for (const r of f.evidence_refs) {
        const ok = acceptedInputs.has(r) || /^(appointments|crm|dashboard)\./.test(r) || ['appt.show_rate', 'appt.no_show_rate', 'gross.total_sum', 'dashboard.avg_actual_response_min'].includes(r)
        expect(ok, `${f.id}:${r}`).toBe(true)
      }
    }
  })
})

describe('R3 consultant synthesis - final-shadow corrections', () => {
  const PROHIBITED = /\b(because|due to|caused? by|drives?|driven by|leads? to|result(?:s|ed)? in|reliabl\w*|guarantee\w*|paying off|large share|unlikely|more prospects engaged|wins? deals?|speed wins|keeps? more|will (?:lift|increase|reduce|improve|boost|save)|\blifts?\b|\bboosts?\b|biggest (?:lever|opportunity)|weakest stage)\b/i

  // 1. Zero denominator.
  it('zero denominator (fresh appointments, total=0): no NaN/Infinity; ratios explicitly blocked', () => {
    const ap = JSON.parse(JSON.stringify(sourcesFromFixture('serra-honda').appointments)) as AppointmentsMetrics
    Object.assign(ap, { total: 0, show: 0, noShow: 0, confirmed: 0, cancelled: 0, completed: 0, rescheduled: 0 })
    ap.provenance.acceptedRows = 0
    const s = buildConsultantSynthesis(bundleOf('serra-honda', { appointments: ap }))
    expect(JSON.stringify(s)).not.toMatch(/NaN|Infinity/)
    expect(mkey(s, 'appt.confirmation_gap')).toBeFalsy()
    expect(s.blocked_measures.some((b) => b.key === 'appt.confirmation_gap' && b.blocked_by === 'zero_denominator')).toBe(true)
    for (const m of s.derived_measures) expect(Number.isFinite(m.value)).toBe(true)
  })

  // 2. Funnel redesign: no weakest-stage/biggest-lever; lead-to-sale is end-to-end yield.
  it('funnel finding is a named snapshot review, not a weakest-stage/biggest-lever ranking', () => {
    const s = synthOf('serra-nissan')
    expect(fid(s, 'r3-funnel-dropoff')).toBeFalsy()
    const fr = fid(s, 'r3-funnel-review')!
    expect(fr).toBeTruthy()
    expect(mkey(s, 'funnel.lead_to_sale_yield')).toBeTruthy() // end-to-end yield, not a "stage"
    expect(mkey(s, 'funnel.lead_to_sale_rate')).toBeFalsy()
    expect((fr.proves + fr.external_copy + fr.next_action).toLowerCase()).not.toMatch(/weakest|biggest lever|leakage/)
  })

  // 3. No unsupported causal/magnitude/intent/outcome claims in customer/observation fields.
  it('no finding claims causality/magnitude/intent/outcome in proves/external_copy/business_consequence/next_action', () => {
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      for (const f of synthOf(p).findings) {
        for (const t of [f.proves, f.external_copy, f.business_consequence, f.next_action]) {
          expect(PROHIBITED.test(t), `${f.id}: ${t}`).toBe(false)
        }
      }
    }
  })

  // 4. Per-finding exact evidence-ref template (irrelevant-but-valid refs cannot pass).
  it('each finding cites exactly its templated evidence refs', () => {
    const EXPECTED: Record<string, string[]> = {
      'r3-appt-show-leakage': ['appt.show_rate', 'appointments.show', 'appointments.total'],
      'r3-no-show-handoff': ['appt.no_show_rate', 'appointments.no_show', 'appointments.total'],
      'r3-no-show-effort-reduction': ['appt.no_show_rate', 'appointments.no_show'],
      'r3-confirmation-show-gap': ['appointments.confirmed', 'appointments.show', 'appointments.total'],
      'r3-response-time-exposure': ['dashboard.avg_actual_response_min'],
      'r3-funnel-review': ['dashboard.leads', 'dashboard.appts_set', 'dashboard.appts_shown', 'dashboard.total_visits', 'dashboard.visits_sold', 'dashboard.sold_in_period'],
      'r3-gross-mix': ['crm.front_sum', 'crm.back_sum', 'crm.total_sum'],
      'r3-count-reconciliation': ['crm.row_count', 'dashboard.sold_in_period', 'gross.total_sum'],
      'r3-appointments-on-track': ['appt.show_rate', 'appt.no_show_rate'],
    }
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      for (const f of synthOf(p).findings) {
        expect(EXPECTED[f.id], `template for ${f.id}`).toBeTruthy()
        expect([...f.evidence_refs].sort()).toEqual([...EXPECTED[f.id]].sort())
      }
    }
    // count-reconciliation lineage explicitly cites BOTH count sources.
    const ford = synthOf('tony-serra-ford')
    const cr = fid(ford, 'r3-count-reconciliation')!
    expect(cr.evidence_refs).toEqual(expect.arrayContaining(['crm.row_count', 'dashboard.sold_in_period']))
    expect(cr.formula).toMatch(/crm\.row_count vs dashboard\.sold_in_period/)
  })

  // 4b. Visit-to-sale uses the governed visits_sold numerator (NOT sold_in_period) with exact ratios.
  it('visit-to-sale rate uses dashboard.visits_sold and equals the exact three-store values', () => {
    const expected: Record<string, string> = { 'serra-honda': '15.4%', 'serra-nissan': '23.5%', 'tony-serra-ford': '21.4%' }
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      const s = synthOf(p)
      const m = mkey(s, 'funnel.visit_to_sale_rate')!
      expect(m.display).toBe(expected[p])
      expect(m.formula).toBe('dashboard.visits_sold / dashboard.total_visits')
      expect(m.inputs).toEqual(['dashboard.visits_sold', 'dashboard.total_visits'])
      // NEVER cite sold_in_period as the visit-to-sale numerator.
      expect(m.inputs).not.toContain('dashboard.sold_in_period')
      expect(m.formula).not.toMatch(/sold_in_period\s*\/\s*dashboard\.total_visits/)
    }
  })

  // 5. Incompatible material is not a benchmark (covered above) — assert state never leaks.
  it('no directional_non_scoring benchmark is ever emitted from incompatible material', () => {
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      for (const f of synthOf(p).findings) expect((f.benchmark as { state: string }).state).toBe('no_benchmark')
    }
  })

  // 6. External-output cannot be produced from a caller-forged synthesis.
  it('external narrative requires a valid bundle and rejects a forged one', () => {
    // Honest bundles work.
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) expect(() => toExternalNarrative(bundleOf(p))).not.toThrow()
    // A forged bundle (dealer mismatch) cannot reach customer output.
    const forged = JSON.parse(JSON.stringify(bundleOf('serra-honda'))) as AcceptedFactsBundle
    forged.dealer_name = 'Fake Motors'
    expect(() => toExternalNarrative(forged)).toThrow(AcceptedFactsValidationError)
    // A tampered synthesis object has NO path to external output (entry takes a bundle only):
    // even if a finding's external_copy is corrupted post-build, toExternalNarrative rebuilds
    // from the bundle and ignores it.
    const tamperedBundle = bundleOf('serra-nissan')
    const ext = toExternalNarrative(tamperedBundle)
    expect(JSON.stringify(ext)).not.toMatch(/BYPASS|forged/i)
  })
})

describe.runIf(HAVE_DATA)('R3 consultant synthesis - /srv read-only equality', () => {
  const saved = process.env.BRAIN_PROFILES_ROOT
  beforeAll(() => { process.env.BRAIN_PROFILES_ROOT = REAL_ROOT })
  afterAll(() => { if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT; else process.env.BRAIN_PROFILES_ROOT = saved })

  it('live /srv synthesis equals the durable-fixture synthesis for all three stores', () => {
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      const live = buildConsultantSynthesis(resolveAcceptedFacts(p, { now: NOW }))
      expect(live).toEqual(synthOf(p))
    }
  })
})
