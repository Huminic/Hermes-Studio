#!/usr/bin/env npx tsx
/**
 * Report/alert gate for the cron scheduler (N3.3).
 *
 * The cron wrapper (`cron-serra-reports.sh`) calls this once per profile per job
 * to decide whether to send. GO only when the store opted in
 * (comms.reports.enabled) AND the relevant management audience is non-empty
 * (emails for report jobs, cells for the text job). Exits 0 on GO, 10 on SKIP so
 * the wrapper can branch on the exit code; prints a one-line reason either way.
 *
 * Read-only: reads studio config, never sends.
 */
import { readManagementAudience, type ManagementAudience } from '../src/server/studio-config'

export type GateKind = 'reports' | 'text'
export type GateDecision = { go: boolean; reason: string }

/** Pure decision over an already-read audience. */
export function gateDecision(audience: ManagementAudience, kind: GateKind): GateDecision {
  if (!audience.reportsEnabled) return { go: false, reason: 'comms.reports.enabled is false' }
  if (kind === 'text') {
    if (audience.cells.length === 0) return { go: false, reason: 'no management cells configured' }
    return { go: true, reason: `${audience.cells.length} cell(s)` }
  }
  if (audience.emails.length === 0) return { go: false, reason: 'no management emails configured' }
  return { go: true, reason: `${audience.emails.length} email(s)` }
}

type Args = { profile: string; kind: GateKind }

function parseArgs(argv: string[]): Args {
  const a: Args = { profile: '', kind: 'reports' }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--profile') a.profile = argv[++i]
    else if (t.startsWith('--profile=')) a.profile = t.slice('--profile='.length)
    else if (t === '--kind') a.kind = argv[++i] === 'text' ? 'text' : 'reports'
    else if (t.startsWith('--kind=')) a.kind = t.slice('--kind='.length) === 'text' ? 'text' : 'reports'
  }
  return a
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.profile) {
    console.error('[report-gate] --profile is required')
    process.exit(2)
  }
  const decision = gateDecision(readManagementAudience(args.profile), args.kind)
  console.log(`${decision.go ? 'GO' : 'SKIP'} ${args.profile} ${args.kind}: ${decision.reason}`)
  process.exit(decision.go ? 0 : 10)
}

if (process.argv[1] && /report-gate\.ts$/.test(process.argv[1])) {
  main()
}
