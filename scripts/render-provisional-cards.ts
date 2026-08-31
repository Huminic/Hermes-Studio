/**
 * Render the three INTERNAL PROTOTYPE Halo Data report cards (Honda, Nissan, Ford).
 *
 * NON-PROMOTING, LOCAL-ONLY INPUT: reads the strict-accepted families from the governed
 * store (read-only) and the provisional ROI/CAGE/Sales-Communication families from the
 * local-only fixtures in `.local-fixtures/` (git-ignored; never committed). It writes
 * aggregate-only HTML to docs/halo/evidence/m1r/provisional-cards/ — no PII, no promotion,
 * no store/ledger/contract/schedule mutation.
 *
 * Run: node_modules/.bin/tsx scripts/render-provisional-cards.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { renderPrototypeCardHtml, resolvePrototypeCard } from '../src/server/reports/provisional/provisional-prototype-card'

// Strict-accepted families are read (read-only) from the governed dev store. Never written.
process.env.BRAIN_PROFILES_ROOT ??= '/srv/ingest-dev/analytics'

// Local-only fixtures (git-ignored, never committed). Accept an explicit override, else the
// first known staging directory that exists.
const FIXTURE_CANDIDATES = [
  process.env.PROVISIONAL_FIXTURES_DIR,
  '.local-fixtures/vin18-20260830',
  '.local-fixtures/m1r-provisional-2026-08-30',
].filter(Boolean) as string[]
const FIXTURES = path.resolve(FIXTURE_CANDIDATES.find((d) => fs.existsSync(path.resolve(d))) ?? FIXTURE_CANDIDATES[FIXTURE_CANDIDATES.length - 1])
const OUT = path.resolve('docs/halo/evidence/m1r/provisional-cards')
// Deterministic clock so committed artifacts are stable (data through 2026-08-30).
const NOW = new Date('2026-08-31T12:00:00Z')

const PROFILES: Array<{ profile: string; out: string; roi: string; cage: string; comm: string }> = [
  { profile: 'serra-honda', out: 'serra-honda-internal-prototype.html',
    roi: '11_VIN_Serra_Honda_21043_Lead_Source_ROI_Weekly_Report-2381.xlsx',
    cage: '09_VIN_Serra_Honda_21043_CAGE_KPI_Weekly_Report-4371.xlsx',
    comm: '10_VIN_Serra_Honda_21043_Sales_Communication_Log_Daily_Report-8860.xlsx' },
  { profile: 'serra-nissan', out: 'serra-nissan-internal-prototype.html',
    roi: '17_VIN_Serra_Nissan_21044_Lead_Source_ROI_Weekly_Report-2068.xlsx',
    cage: '16_VIN_Serra_Nissan_21044_CAGE_KPI_Weekly_Report-7529.xlsx',
    comm: '15_VIN_Serra_Nissan_21044_Sales_Communication_Log_Daily_Report-5886.xlsx' },
  { profile: 'tony-serra-ford', out: 'tony-serra-ford-internal-prototype.html',
    roi: '05_VIN_Tony_Serra_Ford_21047_Lead_Source_ROI_Weekly_Report-1999.xlsx',
    cage: '04_VIN_Tony_Serra_Ford_21047_CAGE_KPI_Weekly_Report-5643.xlsx',
    comm: '03_VIN_Tony_Serra_Ford_21047_Sales_Communication_Log_Daily_Report-3112.xlsx' },
]

if (!fs.existsSync(FIXTURES)) {
  console.error(`FIXTURES ABSENT: ${FIXTURES}\nThis is expected after the local-only fixtures are removed. Re-supply them locally to re-render.`)
  process.exit(2)
}
fs.mkdirSync(OUT, { recursive: true })

for (const p of PROFILES) {
  const card = resolvePrototypeCard(p.profile, NOW, FIXTURES, { roi: p.roi, cage: p.cage, comm: p.comm })
  const html = renderPrototypeCardHtml(card)
  const outPath = path.join(OUT, p.out)
  fs.writeFileSync(outPath, html)
  const prov = card.provenance
    .map((r) => `    ${r.tier === 'strict-accepted' ? '[S]' : '[P]'} ${r.family} ${r.period} rows=${r.rowsObserved ?? '—'} svcExcl=${r.serviceExcluded ?? '—'} reconciles=${r.reconciles == null ? '—' : r.reconciles} status=${r.strictStatus}${r.provisional ? '/provisional' : ''} sha=${r.checksum12}`)
    .join('\n')
  console.log(`\n== ${p.profile} → ${path.relative(process.cwd(), outPath)}`)
  console.log(`   sections=${card.sections.length} opps=${card.opportunities.length} recs=${card.recommendations.length} footnotes=${card.footnotes.length}`)
  console.log(prov)
}
console.log('\nDONE. Aggregate-only prototype cards rendered (no PII; provisional families remain strict-quarantined).')
