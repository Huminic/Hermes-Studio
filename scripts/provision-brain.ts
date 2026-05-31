#!/usr/bin/env tsx
/**
 * Provision the per-profile Brain on every existing profile dir.
 *
 * Idempotent — re-running this against an already-provisioned profile
 * applies any pending migrations and exits cleanly.
 *
 * Run inside the hermes-agent container so it sees the production
 * volume at /root/.hermes/profiles/:
 *
 *   docker exec -it $AGENT sh -c 'cd /app && pnpm tsx scripts/provision-brain.ts'
 *
 * Or locally during development against ~/.hermes/profiles/.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  provisionBrainForProfile,
  checkBrainReadiness,
} from '../src/server/brain-readiness'

const root =
  process.env.BRAIN_PROFILES_ROOT ??
  path.join(os.homedir(), '.hermes', 'profiles')

if (!fs.existsSync(root)) {
  console.error(`profiles root missing: ${root}`)
  process.exit(2)
}

const profiles = fs
  .readdirSync(root)
  .filter((e) => fs.statSync(path.join(root, e)).isDirectory())
  .sort()

console.log(`provisioning Brain across ${profiles.length} profile(s)`)
let okCount = 0
let failCount = 0

for (const profile of profiles) {
  try {
    const report = provisionBrainForProfile(profile)
    const probe = checkBrainReadiness(profile)
    const status = report.ok && probe.ok ? 'ok' : 'FAILED'
    console.log(
      `[${status}] ${profile}  schema_version=${report.schema_version}  pending=${report.pending_migration_count}  metadata_substrate=${report.metadata_substrate_present}`,
    )
    if (status === 'ok') okCount++
    else {
      failCount++
      for (const r of [...report.reasons, ...probe.reasons]) {
        console.log(`        reason: ${r}`)
      }
    }
  } catch (err) {
    failCount++
    console.log(`[FAILED] ${profile}  ${(err as Error).message}`)
  }
}

console.log(`\ndone: ${okCount} ok, ${failCount} failed`)
process.exit(failCount === 0 ? 0 : 1)
