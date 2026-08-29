// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { buildM2BReportModel } from '@/server/reports/m2b/report-model'
import { renderM2BHtml } from '@/server/reports/m2b/render-html'
import { offlineNarrationDeps } from '@/server/reports/m2b/offline-narratives'

const REAL_ROOT = '/srv/ingest-dev/analytics'
const HAVE_DATA = fs.existsSync(`${REAL_ROOT}/serra-honda/brain/brain.db`)
const NOW = Date.parse('2026-08-29T12:00:00Z')

const modelFor = (p: string) => buildM2BReportModel(p, { now: NOW, narration: offlineNarrationDeps(p) })

describe.runIf(HAVE_DATA)('M2B HTML rendering', () => {
  const saved = process.env.BRAIN_PROFILES_ROOT
  beforeAll(() => { process.env.BRAIN_PROFILES_ROOT = REAL_ROOT })
  afterAll(() => {
    if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT
    else process.env.BRAIN_PROFILES_ROOT = saved
  })

  it('serra-honda HTML: identity, coverage period, supported value, withheld + missing wording', async () => {
    const html = renderM2BHtml(await modelFor('serra-honda'))
    expect(html).toContain('Serra Honda')
    expect(html).toContain('2026-08-17 to 2026-08-23')
    expect(html).toContain('$12,240.78')
    expect(html).toMatch(/Withheld - /)
    expect(html).toMatch(/No current value \(/)
    expect(html).toMatch(/Gross reconciliation:.*Reconciles\./s)
    expect(html).toMatch(/pill (fresh|aging|stale)/)
  })

  it('AI narrative: shows AI-grounded (offline test), live-unconfigured note, and evidence claims', async () => {
    const html = renderM2BHtml(await modelFor('serra-honda'))
    expect(html).toContain('AI-grounded (offline test)')
    expect(html).toMatch(/Live automatic narration:<\/strong> unconfigured/)
    expect(html).toMatch(/Evidence-referenced claims/)
    // a validated claim shows its metric slug reference
    expect(html).toMatch(/\[<code>gross\.total_sum<\/code>\]/)
  })

  it('PDF-QA: ASCII hyphens only (no en/em dash), no replacement/box glyphs', async () => {
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      const html = renderM2BHtml(await modelFor(p))
      expect(html).not.toMatch(/[–—]/)
      expect(html).not.toMatch(/�/)
    }
  })

  it('missing-not-zero: withheld/missing metrics never render a bare zero value', async () => {
    const html = renderM2BHtml(await modelFor('tony-serra-ford'))
    expect(html).not.toMatch(/<span class="v">0<\/span>/)
    expect(html).toContain('No accepted native source for this rooftop this period.')
    expect(html).toContain('Restore accepted Sales deliveries')
  })

  it('shows the three comparison layers per metric (current, industry, dealer baseline)', async () => {
    const html = renderM2BHtml(await modelFor('serra-honda'))
    expect(html).toMatch(/<th>Current<\/th>/)
    expect(html).toMatch(/<th>Industry \(non-scoring\)<\/th>/)
    expect(html).toMatch(/<th>Dealer baseline<\/th>/)
    expect(html).toMatch(/Directional, NON-SCORING/)
    expect(html).toContain('demandlocal.com')
    expect(html).toMatch(/verified 2026-08-28/)
    expect(html).toMatch(/Denominator incompatible/)
    expect(html).toMatch(/No definition-compatible benchmark/)
    expect(html).toMatch(/of 3 governed periods on file/)
    expect(html).toMatch(/<h2>References \(industry context - non-scoring\)<\/h2>/)
  })

  it('Ford uses human coverage wording, not "na to na" / "n/a to n/a"', async () => {
    const html = renderM2BHtml(await modelFor('tony-serra-ford'))
    expect(html).toContain('No accepted weekly source (coverage unavailable)')
    expect(html).not.toMatch(/na to na/)
    expect(html).not.toMatch(/n\/a to n\/a/)
  })

  it('Sales-only + contamination provenance are stated on the report', async () => {
    const html = renderM2BHtml(await modelFor('serra-nissan'))
    expect(html).toContain('Sales only')
    expect(html).toMatch(/withheld because their VinSolutions scheduled reports positively select Service\/Parts/i)
    expect((html.match(/<code>/g) ?? []).length).toBeGreaterThanOrEqual(19)
  })
})
