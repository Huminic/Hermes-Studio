#!/usr/bin/env npx tsx
/**
 * Sentinel cron runner — one whole-application health pass.
 *
 * Decoupled from the comms pipeline ON PURPOSE: running the monitor never
 * triggers outbound sends. Intended to be invoked on a short cadence by
 * system/Hermes cron INSIDE the studio container, e.g. (wired via sysadmin):
 *
 *   *\/2 * * * * docker exec $(docker ps --format '{{.Names}}' | grep -m1 '^hermes-studio-') \
 *                 npx tsx scripts/sentinel-cron.ts >> /tmp/sentinel-cron.log 2>&1
 *
 * Exits 0 always so cron stays healthy.
 */
import { runSentinelPass } from '../src/server/sentinel'

async function main() {
  const s = await runSentinelPass()
  console.log(
    `[sentinel] ${new Date().toISOString()} checks=${s.checksRun} findings=${s.findings.length} ` +
      `alerts=${s.alertsSent} resolved=${s.resolved} digest=${s.digestSent} ` +
      `errors=${s.errors.length} healthy=${s.healthy}`,
  )
  for (const e of s.errors) console.error(`[sentinel] ${e.check}: ${e.error}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[sentinel] fatal:', err)
    process.exit(0)
  })
