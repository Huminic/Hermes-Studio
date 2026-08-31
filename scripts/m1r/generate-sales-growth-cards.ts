/**
 * DEV-ONLY generator: emit the three customer-facing Sales Performance and Growth Reports
 * (external HTML+JSON) and the SEPARATE internal evidence (JSON). Reads accepted metrics
 * from BRAIN_PROFILES_ROOT. No send, no activation, no production.
 *   BRAIN_PROFILES_ROOT=/srv/ingest-dev/analytics tsx scripts/m1r/generate-sales-growth-cards.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveSalesGrowthCard, renderExternalCardHtml, renderInternalEvidenceMarkdown, externalForbiddenHits } from '../../src/server/reports/sales-growth-card'

const NOW = process.env.NOW_ISO ? new Date(process.env.NOW_ISO) : new Date()
const OUT = path.resolve('docs/halo/evidence/m1r/gate3-cards')
const profiles = ['serra-honda', 'serra-nissan', 'tony-serra-ford']
let published = 0
for (const p of profiles) {
  const { external, internal } = resolveSalesGrowthCard(p, NOW)
  fs.writeFileSync(path.join(OUT, 'internal', `${p}-evidence.json`), JSON.stringify(internal, null, 2))
  fs.writeFileSync(path.join(OUT, 'internal', `${p}-evidence.md`), renderInternalEvidenceMarkdown(internal))
  if (external) {
    const hits = externalForbiddenHits(external)
    if (hits.length) throw new Error(`ABORT ${p}: forbidden words in external card: ${hits.join(', ')}`)
    fs.writeFileSync(path.join(OUT, 'external', `${p}-sales-growth-report.html`), renderExternalCardHtml(external))
    fs.writeFileSync(path.join(OUT, 'external', `${p}-sales-growth-report.json`), JSON.stringify(external, null, 2))
    published++
    console.log(`OK ${p}: published external + internal (${external.sections.length} sections, "${external.dataThrough}")`)
  } else {
    console.log(`HELD ${p}: internal-only (freshness ${internal.freshnessState}); no external card`)
  }
}
console.log(`DONE: ${published}/${profiles.length} external cards published`)
