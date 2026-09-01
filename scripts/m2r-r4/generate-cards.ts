/**
 * M2R R4 — generate the three final customer-facing Halo Sales report-card PDFs from the
 * committed R2 durable fixture (deterministic; equals /srv reader values), render every page
 * to PNG with pdftoppm, run automated PDF QA, and write an internal QA manifest.
 *
 * Read-only on data; writes only output/pdf/halo/ (PDF+HTML) and the internal QA evidence dir.
 * No email/send/deploy/CRM/activation.
 *
 *   node_modules/.bin/tsx scripts/m2r-r4/generate-cards.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'
import { assembleAcceptedFacts, type AcceptedFactsSources } from '../../src/server/reports/accepted-facts'
import { buildHaloCardModel, renderHaloCardHtml, assertCustomerSafe } from '../../src/server/reports/halo-card-render'
import type { AppointmentsMetrics, CrmSalesGross, DealershipPerformance } from '../../src/server/ingest-native-metrics'

const PROFILES = ['serra-honda', 'serra-nissan', 'tony-serra-ford'] as const
const NOW = Date.parse('2026-08-31T12:00:00Z')
const PERIOD_TAG = '2026-08-24_2026-08-30'
const OUT = path.resolve('output/pdf/halo')
const QA = path.resolve('docs/halo/evidence/m1r/r4/qa')
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')

const BANNED = /\b(limitation|limitations|issue|issues|quarantine|quarantined|withheld|missing|blocked|unsupported|discrepancy|failure|failed)\b/i
const FORBIDDEN = [
  [/service|parts/i, 'service/parts'], [/\bSW-\d{3}\b/, 'SW id'], [/\b(appt|gross|dashboard|funnel|crm|appointments)\.[a-z_]+/i, 'slug code'],
  [/\b[0-9a-f]{32,}\b/i, 'hash'], [/NaN|Infinity/, 'non-finite'], [/�/, 'glyph-replacement'], [/INERT|RECOMMENDATION ONLY|NATIVE7/, 'engineering marker'],
] as const

function sourcesFromFixture(fx: { stores: Record<string, { appointments: unknown; crm: unknown; dashboard: unknown }> }, p: string): AcceptedFactsSources {
  const s = fx.stores[p]
  return { appointments: (s.appointments as AppointmentsMetrics) ?? null, crm: (s.crm as CrmSalesGross) ?? null, dashboard: (s.dashboard as DealershipPerformance) ?? null }
}
// Clip-proof running header/footer: the LEFT span is flex-shrinkable (min-width:0 + overflow
// hidden + ellipsis) so it can NEVER overflow/clip off the left edge (the intermittent Chromium
// flex "space-between" defect); the RIGHT span (period / page numbers) is fixed and always shown.
// box-sizing includes the padding; generous margins leave ample room for the single 7.5px line.
function bar(left: string, right: string): string {
  return `<div style="box-sizing:border-box;width:100%;padding:0 10mm;font-size:7.5px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;display:flex;justify-content:space-between;align-items:center;">`
    + `<span style="flex:1 1 auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${left}</span>`
    + `<span style="flex:0 0 auto;padding-left:10px;white-space:nowrap;">${right}</span></div>`
}
function footerTemplate(dealer: string): string {
  return bar(`Confidential - prepared for ${dealer.replace(/[<>&]/g, '')}`, 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>')
}
function headerTemplate(dealer: string, period: string): string {
  return bar(`Halo Sales Performance - ${dealer.replace(/[<>&]/g, '')}`, period.replace(/[<>&]/g, ''))
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  fs.mkdirSync(QA, { recursive: true })
  const fx = JSON.parse(fs.readFileSync('src/test/fixtures/r2-governed-facts.fixture.json', 'utf8'))
  const browser = await chromium.launch({ headless: true })
  const manifest: Array<Record<string, unknown>> = []
  try {
    for (const profile of PROFILES) {
      const bundle = assembleAcceptedFacts(profile, sourcesFromFixture(fx, profile), { now: NOW })
      const model = buildHaloCardModel(bundle)
      const html = renderHaloCardHtml(model)
      assertCustomerSafe(html)
      const base = `halo-${profile}-${PERIOD_TAG}`
      const htmlPath = path.join(OUT, `${base}.html`)
      const pdfPath = path.join(OUT, `${base}.pdf`)
      fs.writeFileSync(htmlPath, html, 'utf8')

      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle' })
      await page.pdf({
        path: pdfPath, format: 'A4', printBackground: true, displayHeaderFooter: true,
        headerTemplate: headerTemplate(model.dealer_name, model.period_label),
        footerTemplate: footerTemplate(model.dealer_name),
        margin: { top: '16mm', bottom: '14mm', left: '10mm', right: '10mm' },
      })
      await page.close()

      // ── Automated PDF QA ─────────────────────────────────────────────────────────────
      const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
      const pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? '0')
      const pageSize = /Page size:\s+([^\n]+)/.exec(info)?.[1]?.trim() ?? ''
      const fullText = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' })

      const qaFindings: string[] = []
      // Expected content.
      for (const [needle, what] of [[model.dealer_name, 'dealer name'], [model.dealer_number, 'dealer number'], ['Aug 24, 2026 - Aug 30, 2026', 'period'], ['Executive Snapshot', 'exec heading'], ['Semantic Watchdog', 'watchdog'], ['Not Active', 'not-active label']] as const) {
        if (!fullText.includes(needle)) qaFindings.push(`MISSING expected text: ${what}`)
      }
      // Forbidden content.
      if (BANNED.test(fullText)) qaFindings.push(`FORBIDDEN banned term present`)
      for (const [re, what] of FORBIDDEN) if (re.test(fullText)) qaFindings.push(`FORBIDDEN ${what} present`)
      if (!/595 x 842|A4/.test(pageSize)) qaFindings.push(`unexpected page size: ${pageSize}`)

      // Per-page: text present (no blank page) + render PNG.
      const perPage: Array<{ page: number; chars: number; png: string; png_bytes: number }> = []
      for (let i = 1; i <= pages; i++) {
        const ptext = execFileSync('pdftotext', ['-f', String(i), '-l', String(i), '-layout', pdfPath, '-'], { encoding: 'utf8' }).trim()
        const pngPrefix = path.join(QA, `${profile}-page`)
        execFileSync('pdftoppm', ['-png', '-r', '110', '-f', String(i), '-l', String(i), pdfPath, pngPrefix])
        // pdftoppm names files <prefix>-<page>.png (zero-padded to page-count width).
        const candidates = [`${pngPrefix}-${i}.png`, `${pngPrefix}-0${i}.png`, `${pngPrefix}-${String(i).padStart(2, '0')}.png`]
        const png = candidates.find((c) => fs.existsSync(c)) ?? candidates[0]
        const pngBytes = fs.existsSync(png) ? fs.statSync(png).size : 0
        if (ptext.length < 20) qaFindings.push(`page ${i} appears blank (chars=${ptext.length})`)
        if (pngBytes < 3000) qaFindings.push(`page ${i} PNG suspiciously small (${pngBytes} bytes)`)
        perPage.push({ page: i, chars: ptext.length, png: path.relative(process.cwd(), png), png_bytes: pngBytes })
      }

      const pdfBuf = fs.readFileSync(pdfPath), htmlBuf = fs.readFileSync(htmlPath)
      manifest.push({
        profile, dealer_name: model.dealer_name, dealer_number: model.dealer_number, period: model.period_label,
        pages, page_size: pageSize, measures: model.appendix.length, actions: model.actions.length,
        html: { path: path.relative(process.cwd(), htmlPath), bytes: htmlBuf.length, sha256: sha256(htmlBuf) },
        pdf: { path: path.relative(process.cwd(), pdfPath), bytes: pdfBuf.length, sha256: sha256(pdfBuf) },
        per_page: perPage, qa_findings: qaFindings, qa_pass: qaFindings.length === 0,
      })
      console.log(`${base}: pages=${pages} size=${pageSize} measures=${model.appendix.length} actions=${model.actions.length} qa=${qaFindings.length === 0 ? 'PASS' : 'FAIL ' + JSON.stringify(qaFindings)}`)
    }
  } finally {
    await browser.close()
  }
  const manifestPath = path.join('docs/halo/evidence/m1r/r4', 'qa-manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifact: 'm2r-r4-halo-card-qa', period: '2026-08-24..2026-08-30', as_of_iso: '2026-08-31T12:00:00.000Z',
    note: 'Internal QA manifest for the three customer-facing Halo Sales report-card PDFs. HTML is deterministic (sha256 stable); PDF sha256 recorded as generated (chromium embeds a creation timestamp). Per-page PNG contact set under r4/qa/. No customer PII/raw sources.',
    all_pass: manifest.every((m) => m.qa_pass), cards: manifest,
  }, null, 2) + '\n', 'utf8')
  console.log(`\nQA manifest: ${manifestPath}  all_pass=${manifest.every((m) => m.qa_pass)}`)
  if (!manifest.every((m) => m.qa_pass)) process.exit(2)
}
main().catch((e) => { console.error(`R4 GENERATE FAILED: ${(e as Error).message}`); process.exit(1) })
