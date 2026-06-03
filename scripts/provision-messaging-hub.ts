#!/usr/bin/env npx tsx
/**
 * Provision messaging-hub.db for the dealer profiles that will run comms.
 *
 * The store auto-creates ~/.hermes/profiles/<profile>/messaging-hub.db on the
 * first write, but pre-creating it (schema + WAL) before go-live means the
 * first real inbound never races the table creation. Touching the db is a pure
 * read (listThreads) that triggers getDb()'s lazy create.
 *
 * Run inside the studio container after deploy:
 *   npx tsx scripts/provision-messaging-hub.ts
 *
 * Parent/non-dealer profiles (huminic, serra-automotive, strukture) are skipped
 * by default — they have no comms roster. Pass profile names as args to override.
 */
import { listThreads } from '../src/server/messaging-hub-store'

// Dealer (comms) profiles. Parents stay non-dealer per locked scope.
const DEFAULT_DEALERS = [
  'serra-honda',
  'serra-nissan',
  'serra-service',
  'tony-serra-ford',
  'ford-of-columbia',
  'hyundai-of-columbia',
  'huminic-motors',
  'cedar-ridge-automotive',
]

function main() {
  const profiles = process.argv.slice(2)
  const targets = profiles.length > 0 ? profiles : DEFAULT_DEALERS
  for (const p of targets) {
    try {
      const n = listThreads({ profile: p, limit: 1 }).length
      console.log(`[provision] ${p}: messaging-hub.db ready (threads=${n})`)
    } catch (err) {
      console.error(`[provision] ${p}: FAILED — ${(err as Error).message}`)
    }
  }
}

main()
