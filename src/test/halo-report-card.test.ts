// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { METRIC_CATALOG } from '@/server/watchdog/metric-catalog'
import {
  HaloProfileNotAllowedError,
  buildHaloReportCard,
  normalizeHaloWindowDays,
  type HaloCard,
} from '@/server/reports/halo-report-card'
import { buildHaloNarrative, type NarrativeCard } from '@/server/reports/halo-narrative'

const REAL_ROOT = '/srv/ingest-dev/analytics'
const HAVE_DATA = fs.existsSync(`${REAL_ROOT}/serra-honda/brain/brain.db`)

const card = (report: ReturnType<typeof buildHaloReportCard>, slug: string): HaloCard =>
  report.cards.find((c) => c.slug === slug)!

/** Currency/percent tokens a narrative emits must ALL be card display values (grounding). */
function moneyPercentTokens(text: string): string[] {
  return text.match(/\$[\d,]+\.\d{2}|\d+(?:\.\d+)?%/g) ?? []
}

describe('Halo Data report card — pure (no /srv): catalog, Sales-only, narrative grounding', () => {
  it('catalog has NO Service/Parts category or slug (Sales-only permanent boundary)', () => {
    for (const m of METRIC_CATALOG) {
      expect(/service|parts/i.test(m.category)).toBe(false)
      expect(/service|parts/i.test(m.id)).toBe(false)
    }
  })

  it('assembler FAILS CLOSED for non-Sales profiles (service, unknown, traversal-like)', () => {
    for (const bad of ['serra-service', 'unknown-store', 'serra-honda/../serra-service', '../../etc/passwd', '']) {
      expect(() => buildHaloReportCard(bad, 30)).toThrow(HaloProfileNotAllowedError)
    }
  })

  it('window_days is normalized to the Studio convention {7,30,90} else 30', () => {
    for (const v of [7, 30, 90]) expect(normalizeHaloWindowDays(v)).toBe(v)
    for (const bad of [NaN, -5, 0, Infinity, -Infinity, 99999, 45, 'abc', null, undefined, '30x'])
      expect(normalizeHaloWindowDays(bad as unknown)).toBe(30)
  })

  it('narrative is grounded: every $/% token is a card display; states limitations; no scoring', () => {
    const cards: NarrativeCard[] = [
      {
        label: 'Total gross', display: '$12,240.78', current: { state: 'value' },
        industry: { state: 'no_benchmark' }, baseline: { state: 'insufficient_history' },
        provenance: { source: 'dealership_performance', period: { start: '2026-08-17', end: '2026-08-23' } },
      },
      {
        label: 'Appointment show rate', display: '66.7%', current: { state: 'value' },
        industry: { state: 'directional_non_scoring', definition_compatibility: 'incompatible' },
        baseline: { state: 'insufficient_history' },
        provenance: { source: 'appointments', period: { start: '2026-08-17', end: '2026-08-23' } },
      },
      { label: 'Total leads', display: null, current: { state: 'withheld' }, industry: { state: 'no_benchmark' }, baseline: { state: 'insufficient_history' }, provenance: null },
    ]
    const text = buildHaloNarrative({
      profile: 'serra-honda', windowDays: 30, cards,
      coverage: { total: 3, current_value: 2, no_current_data: 0, withheld: 1 },
      limitations: ['Sales-only: Service and Parts excluded.', '1 measure(s) withheld.', 'Industry references are directional and NON-SCORING.'],
    })
    // Grounding: the only money/percent tokens are the two display values.
    expect(new Set(moneyPercentTokens(text))).toEqual(new Set(['$12,240.78', '66.7%']))
    // No scoring verdicts / benchmark targets.
    expect(text).not.toMatch(/\btarget\b/i)
    expect(text).not.toMatch(/below target|above target|within target/i)
    // Limitations + explicit non-scoring surfaced.
    expect(text).toMatch(/Limitations:/)
    expect(text).toMatch(/withheld/i)
    expect(text).toMatch(/non-scoring/i)
  })

  it('narrative for an all-withheld store states no current value, invents nothing', () => {
    const cards: NarrativeCard[] = METRIC_CATALOG.map((m) => ({
      label: m.label, display: null, current: { state: 'withheld' },
      industry: { state: 'no_benchmark' }, baseline: { state: 'insufficient_history' }, provenance: null,
    }))
    const text = buildHaloNarrative({
      profile: 'tony-serra-ford', windowDays: 30, cards,
      coverage: { total: 20, current_value: 0, no_current_data: 0, withheld: 20 },
      limitations: ['Sales-only.'],
    })
    expect(text).toMatch(/No catalog measure has a current governed value/i)
    expect(moneyPercentTokens(text)).toEqual([]) // nothing fabricated
  })
})

describe.runIf(HAVE_DATA)('Halo Data report card — three-store goldens (accepted store)', () => {
  const saved = process.env.BRAIN_PROFILES_ROOT
  beforeAll(() => { process.env.BRAIN_PROFILES_ROOT = REAL_ROOT })
  afterAll(() => {
    if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT
    else process.env.BRAIN_PROFILES_ROOT = saved
  })

  it('serra-honda: 7 current values (NATIVE7) with provenance; industry/baseline states; coverage; Sales-only', () => {
    const r = buildHaloReportCard('serra-honda', 30)
    expect(r.sales_only).toBe(true)
    expect(r.cards.length).toBe(20)

    // Exact current values (display) + provenance/period. Gross precedence is CRM Sales Gross.
    const gross = card(r, 'gross.total_sum')
    expect(gross.current.state).toBe('value')
    expect(gross.display).toBe('$14,185.20')
    expect(gross.provenance).toMatchObject({ source: 'crm_sales_gross', period: { start: '2026-08-24', end: '2026-08-30' } })
    expect(gross.industry.state).toBe('no_benchmark')
    expect(gross.baseline.state).toBe('insufficient_history')

    // Reconciliation-mismatches (CRM per-deal) and response time (Dashboard) are now VALUES.
    const recon = card(r, 'gross.reconciliation_mismatches')
    expect(recon.current.state).toBe('value')
    expect(recon.display).toBe('0')
    expect(recon.provenance).toMatchObject({ source: 'crm_sales_gross' })
    const rt = card(r, 'dashboard.response_time_actual_avg_min')
    expect(rt.current.state).toBe('value')
    expect(rt.display).toBe('210')
    expect(rt.provenance).toMatchObject({ source: 'dealership_performance' })

    const show = card(r, 'appt.show_rate')
    expect(show.display).toBe('57.1%')
    expect(show.industry.state).toBe('directional_non_scoring')
    if (show.industry.state === 'directional_non_scoring') {
      expect(show.industry.scoring).toBe(false)
      expect(show.industry.verified_on).toBe('2026-08-28')
    }
    expect(show.provenance).toMatchObject({ source: 'appointments' })
    expect(card(r, 'appt.no_show_rate').display).toBe('35.7%')
    expect(card(r, 'appt.confirmed_rate').display).toBe('50.0%')
    expect(card(r, 'appt.cancel_rate').display).toBe('7.1%')

    // Coverage: 7 values (NATIVE7), 3 no-current (hub engagement.*), 10 withheld.
    expect(r.coverage).toEqual({ total: 20, current_value: 7, no_current_data: 3, withheld: 10 })

    // ROI withheld (contract).
    expect(card(r, 'roi.total_leads').current.state).toBe('withheld')

    // Narrative grounding: $/% tokens are exactly the currency + 4 percent displays
    // (the two count displays 0 and 210 are not currency/percent tokens).
    expect(new Set(moneyPercentTokens(r.narrative))).toEqual(
      new Set(['$14,185.20', '57.1%', '35.7%', '50.0%', '7.1%']),
    )
    expect(r.narrative).toMatch(/Limitations:/)

    // Sales-only: no card is Service/Parts.
    expect(r.cards.some((c) => /service|parts/i.test(c.category))).toBe(false)
  })

  it('serra-nissan: NATIVE7 present incl. appointments (real values, not zero); gross precedence CRM', () => {
    const r = buildHaloReportCard('serra-nissan', 30)
    expect(card(r, 'gross.total_sum').display).toBe('$13,224.00')
    expect(card(r, 'gross.total_sum').provenance).toMatchObject({ source: 'crm_sales_gross' })
    expect(card(r, 'appt.show_rate').display).toBe('33.3%')
    expect(card(r, 'appt.no_show_rate').display).toBe('50.0%')
    expect(card(r, 'appt.confirmed_rate').display).toBe('50.0%')
    expect(card(r, 'appt.cancel_rate').display).toBe('16.7%')
    expect(card(r, 'dashboard.response_time_actual_avg_min').display).toBe('238')
    expect(r.coverage.current_value).toBe(7)
  })

  it('tony-serra-ford: NATIVE7 present; gross $1,600.99; CRM-vs-Dashboard sold count disagrees', () => {
    const r = buildHaloReportCard('tony-serra-ford', 30)
    expect(r.coverage.current_value).toBe(7)
    expect(card(r, 'gross.total_sum').display).toBe('$1,600.99')
    expect(card(r, 'appt.show_rate').display).toBe('42.9%')
    expect(card(r, 'appt.no_show_rate').display).toBe('57.1%')
    expect(card(r, 'dashboard.response_time_actual_avg_min').display).toBe('317')
    // Narrative is grounded in the real supported values (currency + 4 percents).
    expect(new Set(moneyPercentTokens(r.narrative))).toEqual(
      new Set(['$1,600.99', '42.9%', '57.1%', '42.9%', '0.0%']),
    )
  })
})
