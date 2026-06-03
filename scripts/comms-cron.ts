#!/usr/bin/env npx tsx
/**
 * Comms cron runner — one pass of the comms scheduler across all profiles
 * (campaign ticks + unanswered-thread escalations). Designed to be invoked
 * every minute by system/Hermes cron INSIDE the studio container, e.g.:
 *
 *   * * * * * docker exec $(docker ps --format '{{.Names}}' | grep -m1 '^hermes-studio-') \
 *               npx tsx scripts/comms-cron.ts >> /tmp/comms-cron.log 2>&1
 *
 * Exits 0 always (a bad profile is skipped, not fatal) so cron stays healthy.
 */
import { runDueWork } from '../src/server/comms-scheduler'

async function main() {
  const summary = await runDueWork()
  // One structured line per run for the cron log.
  console.log(
    `[comms-cron] ${new Date().toISOString()} profiles=${summary.profiles} ` +
      `campaignsTicked=${summary.campaignsTicked} campaignsSent=${summary.campaignsSent} ` +
      `escalated=${summary.escalated} errors=${summary.errors.length}`,
  )
  for (const e of summary.errors) console.error(`[comms-cron] ${e.profile}: ${e.error}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[comms-cron] fatal:', err)
    process.exit(0)
  })
