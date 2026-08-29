/**
 * M2B report-card generator (isolated dev). For each governed Sales rooftop, build
 * the honest report model from ACCEPTED analytics only and emit three artifacts:
 *   - <name>.html  (print-ready source, retained for reproducibility)
 *   - <name>.pdf   (polished, page-numbered, human-readable email attachment)
 *   - <name>.json  (machine-readable evidence manifest + full model)
 * plus a manifest-index.json with SHA-256, byte size, and page-safe metadata.
 *
 * Read-only on analytics; writes only the output dir. No email/deploy/CRM/action.
 *
 *   BRAIN_PROFILES_ROOT=/srv/ingest-dev/analytics \
 *   node_modules/.bin/tsx scripts/m2b/generate-report-cards.ts --out=docs/halo/evidence/m2b/artifacts
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'
import { buildM2BReportModel, DEALER_REGISTRY } from '../../src/server/reports/m2b/report-model'
import { renderM2BHtml } from '../../src/server/reports/m2b/render-html'
import { offlineNarrationDeps, OFFLINE_NARRATIVES } from '../../src/server/reports/m2b/offline-narratives'
import { buildHaloReportCard } from '../../src/server/reports/halo-report-card'
import { buildHaloAiFacts, HALO_AI_SYSTEM_PROMPT } from '../../src/server/reports/halo-ai-narrative'

const PROFILES = ['serra-honda', 'serra-nissan', 'tony-serra-ford'] as const

const arg = (name: string, dflt: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}

const sha256 = (buf: Buffer | string) => createHash('sha256').update(buf).digest('hex')

function footerTemplate(): string {
  return `<div style="font-size:8px;width:100%;padding:0 10mm;color:#64748b;display:flex;justify-content:space-between;">
    <span>Huminic Halo - isolated dev TEST</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`
}
function headerTemplate(dealer: string, period: string): string {
  const safe = dealer.replace(/[<>&]/g, '')
  return `<div style="font-size:8px;width:100%;padding:0 10mm;color:#64748b;display:flex;justify-content:space-between;">
    <span>Halo Data Report Card - ${safe}</span><span>Coverage ${period}</span></div>`
}

async function main() {
  const outDir = path.resolve(arg('out', 'docs/halo/evidence/m2b/artifacts'))
  fs.mkdirSync(outDir, { recursive: true })
  const now = Date.now()
  // --only=<csv> regenerates just those profiles; the manifest-index MERGES so the
  // other stores' committed artifacts/entries stay byte-identical.
  const only = arg('only', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const targets = only.length ? PROFILES.filter((p) => only.includes(p)) : [...PROFILES]
  const browser = await chromium.launch({ headless: true })
  const index: Array<Record<string, unknown>> = []
  try {
    for (const profile of targets) {
      // Offline-authored, evidence-constrained AI narration (live provider unconfigured).
      const model = await buildM2BReportModel(profile, { now, narration: offlineNarrationDeps(profile) })

      // Preserve the exact prompt / facts / authored output / validation result.
      const facts = buildHaloAiFacts(buildHaloReportCard(profile, 30, now))
      const aiEvidence = {
        profile,
        provider: model.narrative_provider,
        live_provider_status: 'unconfigured (no live inference provider in the isolated instance)',
        narrative_mode: model.narrative_mode,
        ai_narrative_acceptance: model.ai_narrative_acceptance,
        fallback_reason: model.narrative_fallback_reason,
        system_prompt: HALO_AI_SYSTEM_PROMPT,
        facts,
        authored_output: OFFLINE_NARRATIVES[profile],
        validated_claims: model.narrative_claims,
      }
      fs.writeFileSync(path.join(outDir, `ai-narrative-evidence-${profile}.json`), JSON.stringify(aiEvidence, null, 2), 'utf8')

      // Filename uses the accepted coverage period when present, else the authorized
      // M2B run window (the body still shows the honest no-accepted-source state).
      const RUN_WINDOW = arg('run-window', '2026-08-17_2026-08-23')
      const period = model.coverage_period.end
        ? `${model.coverage_period.start ?? 'na'}_${model.coverage_period.end}`
        : RUN_WINDOW
      const base = `halo-${profile}-${period}`
      const html = renderM2BHtml(model)
      const htmlPath = path.join(outDir, `${base}.html`)
      const jsonPath = path.join(outDir, `${base}.json`)
      const pdfPath = path.join(outDir, `${base}.pdf`)

      fs.writeFileSync(htmlPath, html, 'utf8')
      fs.writeFileSync(jsonPath, JSON.stringify(model, null, 2), 'utf8')

      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle' })
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: headerTemplate(
          model.dealer_name,
          model.coverage_period.end ? `${model.coverage_period.start ?? 'n/a'} to ${model.coverage_period.end}` : 'unavailable (no accepted weekly source)',
        ),
        footerTemplate: footerTemplate(),
        margin: { top: '18mm', bottom: '16mm', left: '10mm', right: '10mm' },
      })
      await page.close()

      const files = { html: htmlPath, pdf: pdfPath, json: jsonPath }
      const rec: Record<string, unknown> = {
        profile,
        dealer_name: DEALER_REGISTRY[profile].name,
        coverage_period: model.coverage_period,
        coverage_counts: model.coverage_counts,
        narrative_mode: model.narrative_mode,
        narrative_provider: model.narrative_provider,
        ai_narrative_acceptance: model.ai_narrative_acceptance,
        files: Object.fromEntries(
          Object.entries(files).map(([k, p]) => {
            const buf = fs.readFileSync(p)
            return [k, { path: path.relative(process.cwd(), p), bytes: buf.length, sha256: sha256(buf) }]
          }),
        ),
      }
      index.push(rec)
      console.log(`generated ${base}: supported=${model.coverage_counts.supported} withheld=${model.coverage_counts.withheld} missing=${model.coverage_counts.missing} | narrative=${model.narrative_mode} provider=${model.narrative_provider} ai_acceptance=${model.ai_narrative_acceptance}`)
    }
  } finally {
    await browser.close()
  }
  const indexPath = path.join(outDir, 'manifest-index.json')
  // Merge: keep entries for stores we did NOT regenerate; replace those we did.
  let merged = index
  if (only.length && fs.existsSync(indexPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as { artifacts?: Array<Record<string, unknown>> }
      const regenerated = new Set(index.map((r) => r.profile))
      const kept = (prev.artifacts ?? []).filter((r) => !regenerated.has(r.profile as string))
      const order = PROFILES as ReadonlyArray<string>
      merged = [...kept, ...index].sort((a, b) => order.indexOf(a.profile as string) - order.indexOf(b.profile as string))
    } catch {
      merged = index
    }
  }
  fs.writeFileSync(indexPath, JSON.stringify({ generated_at_iso: new Date(now).toISOString(), artifacts: merged }, null, 2), 'utf8')
  console.log(`\nindex: ${path.relative(process.cwd(), indexPath)}`)
  console.log(JSON.stringify(index.map((r) => ({ profile: r.profile, files: r.files })), null, 2))
}

main().catch((e) => {
  console.error(`GENERATE FAILED: ${(e as Error).message}`)
  process.exit(1)
})
