#!/usr/bin/env tsx
/**
 * Run the Consultative Engagement against the Cedar Ridge Automotive
 * Group fixture (SRS Tranche C.1 / G.1 Story 1 acceptance evidence).
 *
 * Usage:
 *   pnpm tsx scripts/run-cedar-ridge-engagement.ts [--profile=cedar-ridge-automotive]
 *
 * Writes:
 *   - Engagement JSON to <profile>/engagement-<decisionId>.json
 *   - Prescription package to <profile>/prescription-package.json
 *   - Six wiki invariants + K↔B contract to <profile>/canon/
 *   - Brain records via DSG
 *   - Console summary at the end
 *
 * Intended to run inside the hermes-agent container so it sees the
 * production volume at /root/.hermes/profiles/.
 */
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runConsultativeEngagement } from '../src/server/consultative-engine'
import { checkStarterContent } from '../src/server/consultative-starter-content'
import { provisionBrainForProfile } from '../src/server/brain-readiness'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const profile = process.argv.find((a) => a.startsWith('--profile='))?.split('=')[1] ??
  'cedar-ridge-automotive'

const repoRoot = path.resolve(__dirname, '..')
const starter = checkStarterContent(repoRoot)
if (!starter.ok) {
  console.error('Starter content check FAILED. Missing:')
  for (const m of starter.missing) console.error(`  - ${m}`)
  process.exit(2)
}
console.log(`Starter content check passed (${starter.status.length} artifacts).`)

// Ensure profile dir exists.
const profilesRoot =
  process.env.BRAIN_PROFILES_ROOT ??
  path.join(os.homedir(), '.hermes', 'profiles')
const profileDir = path.join(profilesRoot, profile)
fs.mkdirSync(profileDir, { recursive: true })

// Provision Brain first so the substrate is present.
const ready = provisionBrainForProfile(profile)
console.log(`Brain provisioned: schema_version=${ready.schema_version} pending=${ready.pending_migration_count}`)

runConsultativeEngagement({
  customer_profile: profile,
  customer_display_name: 'Cedar Ridge Automotive Group',
  industry: 'automotive-retail',
  rooftops: ['Cedar Ridge Honda', 'Cedar Ridge Subaru'],
  primary_contact: {
    name: 'Patricia Ramos',
    email: 'gm@cedar-ridge.example',
  },
  known_systems: ['VinSolutions', 'Vapi', 'TextMagic', 'Google Analytics'],
  known_pain_points: [
    'lead leakage on after-hours SMS',
    'recall outreach is manual',
  ],
}).then((result) => {
  console.log(`\nEngagement complete: ok=${result.ok}`)
  console.log(`  decision_id: ${result.decision_id}`)
  console.log(`  phases: ${result.phases.map((p) => `${p.phase}(${p.ok ? 'ok' : 'fail'})`).join(', ')}`)
  console.log(`  wiki pages: ${result.summary.wiki_pages}`)
  console.log(`  brain records: ${result.summary.brain_records}`)
  console.log(`  assumptions surfaced: ${result.summary.assumptions}`)
  console.log(`  capability gaps: ${result.summary.capability_gaps}`)
  console.log(`  prescription package: ${result.prescription_package_path}`)
  if (result.errors.length) {
    console.log(`  errors:`)
    for (const e of result.errors) console.log(`    - ${e}`)
  }
  process.exit(result.ok ? 0 : 1)
})
