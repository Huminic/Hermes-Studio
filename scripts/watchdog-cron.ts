#!/usr/bin/env npx tsx
/**
 * Semantic Watchdog cron runner — one hourly cross-customer anomaly pass.
 *
 * Read-only detection + finding persistence; never sends outbound customer
 * messages. Availability-gated: a store with no data for a rule just skips it.
 * Intended to run hourly INSIDE the studio container (wired via sysadmin), e.g.:
 *
 *   0 * * * * docker exec $(docker ps --format '{{.Names}}' | grep -m1 '^hermes-studio-') \
 *               npx tsx scripts/watchdog-cron.ts >> /tmp/watchdog-cron.log 2>&1
 *
 * Exits 0 always so cron stays healthy.
 */
import { runWatchdogPass } from '../src/server/watchdog/run'
import { listProfiles } from '../src/server/profiles-browser'

/** Real customer profiles only — drop governors, sentinel/system, and defaults. */
function watchdogProfiles(): Array<string> {
  let names: Array<string> = []
  try {
    names = listProfiles().map((p) => p.name)
  } catch {
    names = []
  }
  return names.filter(
    (n) =>
      !n.startsWith('_') &&
      !n.endsWith('-data-governor') &&
      !['default', 'test', 'fictitious'].includes(n),
  )
}

async function main() {
  const profiles = watchdogProfiles()
  const results = runWatchdogPass(profiles)
  const totals = results.reduce(
    (acc, r) => {
      acc.found += r.found
      acc.created += r.created
      acc.escalated += r.escalated
      acc.resolved += r.resolved
      return acc
    },
    { found: 0, created: 0, escalated: 0, resolved: 0 },
  )
  console.log(
    `[watchdog] ${new Date().toISOString()} profiles=${profiles.length} ` +
      `found=${totals.found} new=${totals.created} escalated=${totals.escalated} resolved=${totals.resolved}`,
  )
  for (const r of results) {
    if (r.found > 0) {
      console.log(`[watchdog]   ${r.profile}: evaluated=${r.evaluated} skipped=${r.skipped} found=${r.found} new=${r.created}`)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[watchdog] fatal:', err)
    process.exit(0)
  })
