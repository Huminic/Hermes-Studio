#!/usr/bin/env npx tsx
/**
 * Nightly lead-status snapshot CLI (N3.4).
 *
 * Thin runner over `src/server/lead-status-snapshot.runLeadStatusSnapshot`: pulls
 * the store's current sales leads read-only from VinSolutions and records one row
 * per lead for the store's local day (idempotent per day). Once a week of history
 * accumulates, `findStaleStatus` powers the lead-aging "same status >1 week"
 * bucket. Run INSIDE the studio container via cron-serra-reports.sh (job=snapshot):
 *   npx tsx scripts/lead-status-snapshot.ts --profile serra-ford
 */
import { readStudioConfig } from '../src/server/studio-config'
import { resolveVinOrgId } from '../src/server/vin-client'
import { fetchAllLeads, SALES_LEAD_TYPES } from '../src/server/lead-opportunities'
import { runLeadStatusSnapshot, type SnapshotLead } from '../src/server/lead-status-snapshot'

const DAY = 24 * 60 * 60_000

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number') return String(v)
  return null
}

type Args = { profile: string; help: boolean }

function parseArgs(argv: string[]): Args {
  const a: Args = { profile: '', help: false }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--help' || t === '-h') a.help = true
    else if (t === '--profile') a.profile = argv[++i]
    else if (t.startsWith('--profile=')) a.profile = t.slice('--profile='.length)
  }
  return a
}

const USAGE = `lead-status-snapshot.ts — nightly lead-status snapshot (read-only VIN pull)

  --profile <p>  store profile (required)
  --help         this message`

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(USAGE)
    process.exit(0)
  }
  if (!args.profile) {
    console.error('[lead-status-snapshot] --profile is required')
    process.exit(1)
  }
  const { config } = readStudioConfig(args.profile)
  const org = resolveVinOrgId(args.profile, config)
  if (!org.ok || !org.orgId) {
    console.error(`[lead-status-snapshot] unconfigured VIN org for ${args.profile}`)
    process.exit(1)
  }
  const now = Date.now()
  const fetched = await fetchAllLeads({
    orgId: org.orgId,
    startDate: new Date(now - 30 * DAY).toISOString(),
    endDate: new Date(now).toISOString(),
  })
  if (!fetched.ok) {
    console.error(`[lead-status-snapshot] lead query failed: ${fetched.reason}`)
    process.exit(1)
  }
  const leads: SnapshotLead[] = fetched.leads
    .filter((l) => SALES_LEAD_TYPES.has((str(l.leadType) ?? str(l.lead_type) ?? '').toUpperCase()))
    .map((l) => ({
      leadId: str(l.leadId) ?? str(l.id) ?? '',
      leadStatus: str(l.leadStatus),
      leadStatusType: str(l.leadStatusType),
      leadType: str(l.leadType) ?? str(l.lead_type),
      leadSource: str(l.leadSource) ?? str(l.source),
      createdUtc: str(l.createdUtc),
    }))
    .filter((l) => l.leadId)

  const tz = (config.comms as { business_hours?: { tz?: string } } | undefined)?.business_hours?.tz
  const { date, count } = runLeadStatusSnapshot({ profile: args.profile, now, leads, tz })
  console.log(`[lead-status-snapshot] ${args.profile}: recorded ${count} leads for ${date}`)
}

if (process.argv[1] && /lead-status-snapshot\.ts$/.test(process.argv[1])) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[lead-status-snapshot] fatal:', err)
      process.exit(1)
    })
}
