/**
 * HUM-VIN-006 acceptance (DEV-only): promote every reconcile-ACCEPTED Response Times bundle into
 * the isolated dev analytical root. Discovers captures from the readback verdicts (accepted only);
 * anything not accepted is WITHHELD (never zeroed). Reads dry-run read-only; idempotent replay.
 *
 *   DRY_RUN_ROOT=/srv/ingest-dev/dry-run DEV_ANALYTICS_ROOT=/srv/ingest-dev/analytics \
 *     node_modules/.bin/tsx scripts/vin006/promote-response-times.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { promoteResponseTimesToAnalytics, RtPromoteAbort } from '../../src/server/analytics/promote-response-times'

const DRY = process.env.DRY_RUN_ROOT ?? '/srv/ingest-dev/dry-run'
const ANALYTICS = process.env.DEV_ANALYTICS_ROOT ?? '/srv/ingest-dev/analytics'
const PROFILES = ['serra-honda', 'serra-nissan', 'tony-serra-ford']

let failures = 0, promoted = 0, withheld = 0
console.log(`dry-run=${DRY}\nanalytics=${ANALYTICS}\n`)
for (const profile of PROFILES) {
  const rbDir = path.join(DRY, 'readback', profile)
  const files = fs.existsSync(rbDir) ? fs.readdirSync(rbDir).filter((f) => f.endsWith('.readback.json')) : []
  if (files.length === 0) { console.log(`WITHHELD ${profile}: no readback (missing, not zero)`); withheld++; continue }
  for (const f of files) {
    const captureId = f.replace(/\.readback\.json$/, '')
    const verdict = (JSON.parse(fs.readFileSync(path.join(rbDir, f), 'utf8')) as { verdict?: string }).verdict
    if (verdict !== 'accepted') { console.log(`WITHHELD ${profile}/${captureId}: verdict=${verdict}`); withheld++; continue }
    try {
      const r = promoteResponseTimesToAnalytics({ dryRunRoot: DRY, analyticsRoot: ANALYTICS, profile, captureId })
      promoted++
      const t = (r.metrics.target_category_counts ?? {}) as Record<string, number>
      console.log(`PROMOTE  ${profile} ${r.period.start}_${r.period.end} -> ${r.outcome} leads=${r.metrics.leads_total} responded=${r.metrics.responded} actual_median=${r.metrics.response_time_actual_median_min}min adjusted_median=${r.metrics.response_time_adjusted_median_min}min targets={T1:${t['Target 1']},T2:${t['Target 2']},Missed:${t.Missed},NoContact:${t['No Contact']}}`)
    } catch (e) {
      const withhold = e instanceof RtPromoteAbort
      if (!withhold) failures++
      console.log(`${withhold ? 'WITHHELD' : 'FAIL    '} ${profile}/${captureId}: ${(e as Error).message.slice(0, 120)}`)
      if (withhold) withheld++
    }
  }
}
console.log(`\npromoted=${promoted} withheld=${withheld} failures=${failures}`)
process.exit(failures === 0 ? 0 : 1)
