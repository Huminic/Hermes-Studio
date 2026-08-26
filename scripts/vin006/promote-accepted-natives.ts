/**
 * HUM-VIN-006 acceptance (DEV-only, isolated): promote ONLY the authorized SAFE native held
 * originals into the isolated dev analytical root via promoteHeldToAnalytics — which RECLASSIFIES
 * at promotion time and ABORTS on any quarantine/Service-Parts. Reads hold read-only; writes the
 * distinct non-production DEV_ANALYTICS_ROOT. Idempotent (repeat → 'duplicate').
 *
 *   INGEST_HOLD_ROOT=/srv/ingest-dev/hold DEV_ANALYTICS_ROOT=/srv/ingest-dev/analytics \
 *     node_modules/.bin/tsx scripts/vin006/promote-accepted-natives.ts
 */
import { promoteHeldToAnalytics, PromoteAbort } from '../../src/server/analytics/promote-held-to-analytics'

const HOLD = process.env.INGEST_HOLD_ROOT ?? '/srv/ingest-dev/hold'
const ANALYTICS = process.env.DEV_ANALYTICS_ROOT ?? '/srv/ingest-dev/analytics'
const PERIOD = { start: '2026-08-17', end: '2026-08-23' }

// The three authorized SAFE selected natives (re-verified Sales-only at promotion).
const SAFE = [
  { profile: 'serra-honda', dealer: 'Serra Honda', sha256: 'b189a92034930603c28439eeac159c6f3f41410d143d21cc037f92534407f5e5', label: 'Honda Appointments' },
  { profile: 'serra-honda', dealer: 'Serra Honda', sha256: '39560ef12549554cb27f8883451ab5326b196ae66bd554b285014f94b18257ee', label: 'Honda Dealer Dashboard' },
  { profile: 'serra-nissan', dealer: 'Serra Nissan', sha256: '6123ef875ffa84825c930eca2a028f1f4717bd32fb21063d4e4acaf192ef7dff', label: 'Nissan Dealer Dashboard' },
]
// A known current-contract-INVALID native — MUST abort (proves the reclassify guard withholds).
const MUST_ABORT = { profile: 'serra-honda', dealer: 'Serra Honda', sha256: '2ed4cb6859b12de097d15c12c39b667ca2055db0460c3fc5dbc532e375ee5b92', label: 'Honda ROI (Service/Parts — must abort)' }

function promote(x: { profile: string; dealer: string; sha256: string; label: string }) {
  return promoteHeldToAnalytics({ holdRoot: HOLD, analyticsRoot: ANALYTICS, profile: x.profile, sha256: x.sha256, profileDealer: x.dealer, period: PERIOD })
}

let failures = 0
console.log(`hold=${HOLD}\nanalytics=${ANALYTICS}\n`)
for (const x of SAFE) {
  try {
    const r = promote(x)
    console.log(`PROMOTE  ${x.label} [${x.profile}] -> ${r.outcome} kind=${r.report_kind} rows=${r.accepted_rows} db=${r.evidence.analytics_db}`)
  } catch (e) {
    failures++
    console.log(`FAIL     ${x.label}: ${(e as Error).message}`)
  }
}
// negative control: the invalid native must abort (withheld), never promote
try {
  promote(MUST_ABORT)
  failures++
  console.log(`FAIL     ${MUST_ABORT.label}: expected PromoteAbort but it PROMOTED (guard broken!)`)
} catch (e) {
  const ok = e instanceof PromoteAbort
  if (!ok) failures++
  console.log(`${ok ? 'ABORT-OK ' : 'FAIL     '}${MUST_ABORT.label}: ${(e as Error).message.slice(0, 120)}`)
}
console.log(`\n${failures === 0 ? 'RESULT: ALL EXPECTED' : `RESULT: ${failures} UNEXPECTED`}`)
process.exit(failures === 0 ? 0 : 1)
