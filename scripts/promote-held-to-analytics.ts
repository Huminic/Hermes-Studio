/**
 * Dev-only CLI: promote ONE immutable held delivery into an isolated dev analytical
 * store and print the Semantic Watchdog metrics. Read-only on the hold; never touches
 * production or the hold volume. Requires explicit INGEST_HOLD_ROOT + a DISTINCT
 * DEV_ANALYTICS_ROOT and explicit args.
 *
 *   INGEST_HOLD_ROOT=/srv/ingest-dev/hold \
 *   DEV_ANALYTICS_ROOT=/srv/ingest-analytics-dev \
 *   pnpm tsx scripts/promote-held-to-analytics.ts \
 *     --profile=serra-honda --sha256=<hex> --dealer="Serra Honda" \
 *     --period-start=2026-08-17 --period-end=2026-08-23
 */
import { promoteHeldToAnalytics } from '../src/server/analytics/promote-held-to-analytics'

const arg = (name: string): string => {
  const p = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(p))
  return hit ? hit.slice(p.length) : ''
}

const holdRoot = process.env.INGEST_HOLD_ROOT ?? ''
const analyticsRoot = process.env.DEV_ANALYTICS_ROOT ?? ''
const profile = arg('profile')
const sha256 = arg('sha256')
const profileDealer = arg('dealer')
const start = arg('period-start')
const end = arg('period-end')

if (!profile || !sha256 || !profileDealer || !start || !end) {
  console.error('usage: INGEST_HOLD_ROOT=<abs> DEV_ANALYTICS_ROOT=<abs,distinct> tsx scripts/promote-held-to-analytics.ts --profile=<p> --sha256=<hex> --dealer="<Dealer>" --period-start=YYYY-MM-DD --period-end=YYYY-MM-DD')
  process.exit(2)
}

try {
  const result = promoteHeldToAnalytics({ holdRoot, analyticsRoot, profile, sha256, profileDealer, period: { start, end } })
  console.log(JSON.stringify(result, null, 2))
} catch (e) {
  console.error(`ABORT: ${(e as Error).message}`)
  process.exit(1)
}
