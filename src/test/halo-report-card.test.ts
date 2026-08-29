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
      coverage: { total: 19, current_value: 0, no_current_data: 0, withheld: 19 },
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

  it('serra-honda: 5 current values (gross + 4 appt) with provenance; industry/baseline states; coverage; Sales-only', () => {
    const r = buildHaloReportCard('serra-honda', 30)
    expect(r.sales_only).toBe(true)
    expect(r.cards.length).toBe(19)

    // Exact current values (display) + provenance/period.
    const gross = card(r, 'gross.total_sum')
    expect(gross.current.state).toBe('value')
    expect(gross.display).toBe('$12,240.78')
    expect(gross.provenance).toMatchObject({ source: 'dealership_performance', period: { start: '2026-08-17', end: '2026-08-23' } })
    expect(gross.industry.state).toBe('no_benchmark')
    expect(gross.baseline.state).toBe('insufficient_history')

    const show = card(r, 'appt.show_rate')
    expect(show.display).toBe('66.7%')
    expect(show.industry.state).toBe('directional_non_scoring')
    if (show.industry.state === 'directional_non_scoring') {
      expect(show.industry.scoring).toBe(false)
      expect(show.industry.verified_on).toBe('2026-08-28')
    }
    expect(show.provenance).toMatchObject({ source: 'appointments' })
    expect(card(r, 'appt.no_show_rate').display).toBe('22.2%')
    expect(card(r, 'appt.confirmed_rate').display).toBe('33.3%')
    expect(card(r, 'appt.cancel_rate').display).toBe('11.1%')

    // Coverage: 5 values, 3 no-current (hub engagement.*), 11 withheld.
    expect(r.coverage).toEqual({ total: 19, current_value: 5, no_current_data: 3, withheld: 11 })

    // ROI withheld (contract).
    expect(card(r, 'roi.total_leads').current.state).toBe('withheld')

    // Narrative grounding: $/% tokens are exactly the 5 displays.
    expect(new Set(moneyPercentTokens(r.narrative))).toEqual(
      new Set(['$12,240.78', '66.7%', '22.2%', '33.3%', '11.1%']),
    )
    expect(r.narrative).toMatch(/Limitations:/)

    // Sales-only: no card is Service/Parts.
    expect(r.cards.some((c) => /service|parts/i.test(c.category))).toBe(false)
  })

  it('serra-nissan: gross only; appointments have NO current value (unavailable, not zero)', () => {
    const r = buildHaloReportCard('serra-nissan', 30)
    expect(card(r, 'gross.total_sum').display).toBe('$5,263.60')
    for (const s of ['appt.show_rate', 'appt.no_show_rate', 'appt.confirmed_rate', 'appt.cancel_rate']) {
      expect(card(r, s).current.state).toBe('no_current_data')
      expect(card(r, s).display).toBeNull()
    }
    expect(r.coverage.current_value).toBe(1)
  })

  it('tony-serra-ford: no current values (all withheld/no-current); narrative invents nothing', () => {
    const r = buildHaloReportCard('tony-serra-ford', 30)
    expect(r.coverage.current_value).toBe(0)
    expect(card(r, 'gross.total_sum').display).toBeNull()
    expect(moneyPercentTokens(r.narrative)).toEqual([])
    expect(r.narrative).toMatch(/No catalog measure has a current governed value/i)
  })
})
