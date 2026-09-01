// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { buildHaloCardModel, renderHaloCardHtml, assertCustomerSafe } from '@/server/reports/halo-card-render'
import { assembleAcceptedFacts, resolveAcceptedFacts, AcceptedFactsValidationError, type AcceptedFactsSources, type AcceptedFactsBundle } from '@/server/reports/accepted-facts'
import type { AppointmentsMetrics, CrmSalesGross, DealershipPerformance } from '@/server/ingest-native-metrics'

const REAL_ROOT = '/srv/ingest-dev/analytics'
const HAVE_DATA = fs.existsSync(`${REAL_ROOT}/serra-honda/brain/brain.db`)
const NOW = Date.parse('2026-08-31T12:00:00Z')
type Fx = { stores: Record<string, { appointments: unknown; crm: unknown; dashboard: unknown }> }
const FIXTURE: Fx = JSON.parse(fs.readFileSync(new URL('./fixtures/r2-governed-facts.fixture.json', import.meta.url), 'utf8'))
function sourcesFromFixture(p: string): AcceptedFactsSources {
  const s = FIXTURE.stores[p]
  return { appointments: (s.appointments as AppointmentsMetrics) ?? null, crm: (s.crm as CrmSalesGross) ?? null, dashboard: (s.dashboard as DealershipPerformance) ?? null }
}
const bundleOf = (p: string) => assembleAcceptedFacts(p, sourcesFromFixture(p), { now: NOW })
const modelOf = (p: string) => buildHaloCardModel(bundleOf(p))
const htmlOf = (p: string) => renderHaloCardHtml(modelOf(p))

const EXPECT = {
  'serra-honda': { name: 'Serra Honda', num: '21043', gross: '$14,185.20', v2s: '15.4%', yield: '5.8%', resp: '210 min', measures: 19, findings: 4 },
  'serra-nissan': { name: 'Serra Nissan', num: '21044', gross: '$13,224.00', v2s: '23.5%', yield: '10.5%', resp: '238 min', measures: 19, findings: 7 },
  'tony-serra-ford': { name: 'Tony Serra Ford', num: '21047', gross: '$1,600.99', v2s: '21.4%', yield: '16.2%', resp: '317 min', measures: 17, findings: 7 },
} as const

describe('R4 Halo report card renderer (durable fixture; no /srv)', () => {
  it('exact metric/finding counts and key values per store', () => {
    for (const p of Object.keys(EXPECT) as Array<keyof typeof EXPECT>) {
      const m = modelOf(p), e = EXPECT[p]
      expect(m.dealer_name).toBe(e.name)
      expect(m.dealer_number).toBe(e.num)
      expect(m.appendix.length).toBe(e.measures) // 19/19/17 honest current measures
      expect(m.actions.length).toBe(e.findings) // 4/7/7 R3 findings
      const html = renderHaloCardHtml(m)
      expect(html).toContain(e.gross)
      expect(html).toContain(e.v2s) // corrected visit-to-sale (visits_sold/visits)
      expect(html).toContain(e.yield) // lead-to-sale yield
      expect(html).toContain(e.resp)
      expect(html).toContain('Aug 24, 2026 - Aug 30, 2026')
      expect(html).toContain('one day old')
      expect(html).toContain('Data current through Aug 30, 2026')
    }
  })

  it('customer-safe: no banned terms, Service/Parts, slug codes, SW ids, hashes, paths, or non-finite', () => {
    for (const p of Object.keys(EXPECT)) {
      const html = htmlOf(p)
      expect(() => assertCustomerSafe(html)).not.toThrow()
      const text = html.replace(/<[^>]+>/g, ' ')
      expect(text).not.toMatch(/\b(limitation|issue|quarantine|withheld|missing|blocked|unsupported|discrepancy|failure)\b/i)
      expect(text).not.toMatch(/service|parts/i)
      expect(text).not.toMatch(/\bSW-\d{3}\b/)
      expect(text).not.toMatch(/\b(appt|gross|dashboard|funnel|crm|appointments)\.[a-z_]+/i)
      expect(text).not.toMatch(/\b[0-9a-f]{32,}\b/i)
      expect(text).not.toMatch(/NaN|Infinity/)
    }
  })

  it('customer-safety guard fails closed on causal/outcome claims (shadow-flagged phrases + equivalents)', () => {
    const flagged = [
      'most direct path to additional deliveries', 'keeps showroom time productive', 'frees your team for ready buyers',
      'protects showroom traffic', 'keeps prospects engaged toward a visit', "shows where the week's attention will pay off",
      'makes total profit more resilient', 'this will increase sales', 'drives more deliveries',
    ]
    for (const phrase of flagged) expect(() => assertCustomerSafe(`<div><p>${phrase}</p></div>`), phrase).toThrow()
    // Real cards carry no such claim and use the non-causal "In context:" framing.
    for (const p of Object.keys(EXPECT)) {
      const html = htmlOf(p)
      expect(html).toContain('In context:')
      expect(html).not.toContain('Why it matters')
      const text = html.replace(/<[^>]+>/g, ' ')
      for (const phrase of ['most direct path', 'showroom time', 'ready buyers', 'protects', 'prospects engaged', 'pay off', 'resilient', 'productive']) {
        expect(text.toLowerCase(), `${p}:${phrase}`).not.toContain(phrase)
      }
    }
  })

  it('no benchmark/industry comparison or invented standard', () => {
    for (const p of Object.keys(EXPECT)) {
      const text = htmlOf(p).replace(/<[^>]+>/g, ' ')
      expect(text).not.toMatch(/benchmark|industry (average|standard|leading)|vs\.? industry|percentile|best[- ]in[- ]class/i)
    }
  })

  it('honest Semantic Watchdog: 295 governed, 2 ratified evaluated, N derived; no false 295-execution claim', () => {
    const text = htmlOf('serra-nissan').replace(/<[^>]+>/g, ' ')
    expect(text).toMatch(/295-condition Semantic Watchdog/)
    expect(text).toMatch(/two ratified appointment rules/)
    expect(text).not.toMatch(/295 (firings|fired|executed|conditions fired|rules fired)/i)
    expect(text).not.toMatch(/all 295/i)
  })

  it('Ford is count-safe: no per-unit composites shown (avg gross per sale / gross per delivered)', () => {
    const ford = htmlOf('tony-serra-ford')
    expect(ford).not.toMatch(/Average gross per/i)
    expect(ford).not.toMatch(/per delivered/i)
    // Honda (count agrees) legitimately shows average gross per sale in the appendix.
    expect(htmlOf('serra-honda')).toMatch(/Average gross per CRM sale/i)
  })

  it('alerts and automations are visibly Not Active for every action', () => {
    for (const p of Object.keys(EXPECT)) {
      const m = modelOf(p)
      for (const a of m.actions) expect(a.status).toBe('Not Active - Review Before Activation')
      const html = renderHaloCardHtml(m)
      const notActive = (html.match(/Not Active - Review Before Activation/g) ?? []).length
      expect(notActive).toBeGreaterThanOrEqual(m.actions.length)
      expect(html).toContain('Nothing here is turned on.')
    }
  })

  it('required executive headings present; no engineering headings', () => {
    const html = htmlOf('serra-honda')
    for (const h of ['Executive Snapshot', 'Momentum and Opportunity', 'Sales Funnel', 'Appointment Execution', 'Response and Follow-up', 'Gross Performance', 'Priority Action Plan', 'Recommended Alerts and Automations', 'Metric Appendix', 'Semantic Watchdog']) {
      expect(html).toContain(h)
    }
  })

  it('deterministic: two renders are byte-identical', () => {
    for (const p of Object.keys(EXPECT)) expect(htmlOf(p)).toBe(htmlOf(p))
  })

  it('fail-closed: a forged bundle cannot produce a card', () => {
    const forged = JSON.parse(JSON.stringify(bundleOf('serra-honda'))) as AcceptedFactsBundle
    forged.dealer_name = 'Fake Motors'
    expect(() => buildHaloCardModel(forged)).toThrow(AcceptedFactsValidationError)
  })
})

describe.runIf(HAVE_DATA)('R4 renderer - /srv read-only equality', () => {
  const saved = process.env.BRAIN_PROFILES_ROOT
  beforeAll(() => { process.env.BRAIN_PROFILES_ROOT = REAL_ROOT })
  afterAll(() => { if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT; else process.env.BRAIN_PROFILES_ROOT = saved })
  it('live /srv card HTML equals the durable-fixture HTML for all three stores', () => {
    for (const p of Object.keys(EXPECT)) {
      const live = renderHaloCardHtml(buildHaloCardModel(resolveAcceptedFacts(p, { now: NOW })))
      expect(live).toBe(htmlOf(p))
    }
  })
})
