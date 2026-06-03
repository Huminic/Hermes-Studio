#!/usr/bin/env npx tsx
/**
 * Integrity cron runner — one cadenced pass of the Semantic Guardian's
 * read-time integrity scanner across all profiles (broken wikilinks, orphan
 * pages, missing frontmatter). Memorializes non-clean findings into each
 * profile Brain. Designed to run inside the studio container, e.g. hourly:
 *
 *   0 * * * * docker exec $(docker ps --format '{{.Names}}' | grep -m1 '^hermes-studio-') \
 *               npx tsx scripts/integrity-cron.ts >> /tmp/integrity-cron.log 2>&1
 *
 * Exits 0 always (a bad profile is skipped, not fatal) so cron stays healthy.
 */
import { runIntegrityScanAllProfiles } from '../src/server/integrity-scanner'

async function main() {
  const reports = await runIntegrityScanAllProfiles()
  const important = reports.filter((r) => r.severity === 'important')
  console.log(
    `[integrity-cron] ${new Date().toISOString()} profiles=${reports.length} ` +
      `important=${important.length} ` +
      `info=${reports.filter((r) => r.severity === 'info').length} ` +
      `clean=${reports.filter((r) => r.severity === 'clean').length}`,
  )
  for (const r of important) {
    console.log(
      `[integrity-cron]   ${r.profile}: broken=${r.counts.broken_links} ` +
        `missing_fm=${r.counts.missing_frontmatter} orphans=${r.counts.orphans}`,
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[integrity-cron] fatal:', err)
    process.exit(0)
  })
