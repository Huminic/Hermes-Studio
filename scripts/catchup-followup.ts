#!/usr/bin/env npx tsx
/**
 * Catch-up: 24-HOUR FOLLOW-UP text (Script B).
 *
 * Reusable, re-runnable, idempotent. Gathers ALL active VinSolutions leads from
 * the last N days (default 7) whose 24h anniversary has passed and who have NOT
 * already been followed up (the automation_runs ledger), and sends the follow-up
 * via the existing marketing automation. Re-running "catches up" after a pause
 * without double-texting anyone. Unlike the immediate text, NO Vapi/Tavus
 * exclude is applied — the follow-up goes to all leads.
 *
 * SAFE BY DEFAULT: prints the recipient list and exits (DRY-RUN). Only `--send`
 * dispatches, and every send still passes the comms-gate. The A2P daytime window
 * (08:00–21:00 CT) is enforced here; `--ignore-window` overrides ONLY for a
 * controlled self-test.
 *
 * Run INSIDE the studio container:
 *   docker exec $(docker ps --format '{{.Names}}' | grep -m1 '^hermes-studio-') \
 *     npx tsx scripts/catchup-followup.ts [--profile serra-honda] [--send] \
 *     [--days N] [--limit N] [--ignore-window]
 */
import { readStudioConfig } from '../src/server/studio-config'
import { listAutomations } from '../src/server/messaging-hub-store'
import { gatherFollowupCandidates } from '../src/server/catchup-followup'
import { sendAutomationNow } from '../src/server/automations'
import {
  prelaunchLockEngaged,
  prelaunchAllowList,
  allowedByPrelaunchLock,
} from '../src/server/prelaunch-lock'

type Args = {
  profile: string
  send: boolean
  days: number | null
  limit: number | null
  ignoreWindow: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = { profile: 'serra-honda', send: false, days: null, limit: null, ignoreWindow: false }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--send') a.send = true
    else if (t === '--ignore-window') a.ignoreWindow = true
    else if (t === '--profile') a.profile = argv[++i]
    else if (t.startsWith('--profile=')) a.profile = t.slice('--profile='.length)
    else if (t === '--days') a.days = Number(argv[++i])
    else if (t.startsWith('--days=')) a.days = Number(t.slice('--days='.length))
    else if (t === '--limit') a.limit = Number(argv[++i])
    else if (t.startsWith('--limit=')) a.limit = Number(t.slice('--limit='.length))
  }
  return a
}

function fmtTs(ms: number | null): string {
  return ms == null ? 'n/a' : new Date(ms).toISOString()
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const now = Date.now()
  const { config } = readStudioConfig(args.profile)

  const followup = listAutomations(args.profile).find(
    (x) => x.trigger === 'lead_followup' && x.channel === 'sms' && x.status === 'active',
  )
  if (!followup) {
    console.error(
      `[catchup-followup] no ACTIVE lead_followup/sms automation for ${args.profile} — nothing to send.`,
    )
    process.exit(0)
  }

  const res = await gatherFollowupCandidates({
    profile: args.profile,
    now,
    config,
    followupAutomationId: followup.id,
    days: args.days ?? undefined,
  })

  const limited = args.limit != null ? res.candidates.slice(0, args.limit) : res.candidates

  console.log(`\n=== CATCH-UP: 24-HOUR FOLLOW-UP (${args.profile}) ===`)
  console.log(`mode:        ${args.send ? 'SEND' : 'DRY-RUN (no sends)'}`)
  console.log(`window:      ${res.startDate} .. ${res.endDate}`)
  console.log(`automation:  ${followup.name} (${followup.id})`)
  console.log(
    `follow-up window: ${res.windowOpen ? 'OPEN' : 'CLOSED'}` +
      (res.windowOpen ? '' : ` — next opens ${fmtTs(res.nextOpenMs)}`),
  )
  console.log(
    `prelaunch lock: ${prelaunchLockEngaged() ? `ENGAGED (allow: ${prelaunchAllowList().join(', ') || 'none'})` : 'OFF (real sends can reach any number)'}`,
  )
  if (res.skipped) console.log(`skipped:     ${res.skipped}`)
  console.log(
    `polled=${res.polledTotal} active=${res.activeCount} due(24h)=${res.dueCount} ` +
      `candidates=${res.candidates.length} dropped=${res.dropped.length}` +
      (args.limit != null ? ` (limited to ${limited.length})` : ''),
  )

  console.log(`\n--- RECIPIENTS (${limited.length}) ---`)
  for (const c of limited) {
    console.log(
      `  ${c.phone}  ${c.firstName ?? '(no name)'}  lead=${c.leadId ?? '?'}  ` +
        `anniv=${fmtTs(c.anniversaryMs)}  ${c.vehicle ?? ''}`,
    )
  }
  if (res.dropped.length) {
    console.log(`\n--- DROPPED (${res.dropped.length}) ---`)
    const byReason: Record<string, number> = {}
    for (const d of res.dropped) byReason[d.reason] = (byReason[d.reason] ?? 0) + 1
    for (const [reason, n] of Object.entries(byReason)) console.log(`  ${n}× ${reason}`)
  }

  if (!args.send) {
    console.log(`\n[dry-run] no messages sent. Re-run with --send (inside the A2P window) to dispatch.`)
    process.exit(0)
  }

  const tz = config.comms?.business_hours?.tz
  if (!tz) {
    console.error(
      `\n[catchup-followup] REFUSING to send: ${args.profile} has no comms.business_hours.tz — ` +
        `the A2P window timezone is unknown. Set it before sending.`,
    )
    process.exit(1)
  }
  if (args.ignoreWindow && !prelaunchLockEngaged()) {
    console.error(
      `\n[catchup-followup] REFUSING --ignore-window without PRELAUNCH_SMS_LOCK engaged ` +
        `(it exists only for a locked self-test).`,
    )
    process.exit(1)
  }
  if (!res.windowOpen && !args.ignoreWindow) {
    console.error(
      `\n[catchup-followup] REFUSING to send: outside the A2P window (next opens ${fmtTs(res.nextOpenMs)}). ` +
        `Use --ignore-window ONLY for a controlled self-test.`,
    )
    process.exit(1)
  }
  if (!res.windowOpen && args.ignoreWindow) {
    console.warn(`\n[catchup-followup] WARNING: --ignore-window set — sending OUTSIDE the A2P window (policy deviation).`)
  }
  if (!prelaunchLockEngaged()) {
    console.warn(
      `\n[catchup-followup] WARNING: PRELAUNCH_SMS_LOCK is OFF — sends can reach REAL customers. ` +
        `Engage the lock for tests.`,
    )
  }

  let sent = 0
  let blocked = 0
  let failed = 0
  for (const c of limited) {
    if (prelaunchLockEngaged() && !allowedByPrelaunchLock(c.phone)) {
      console.log(`  SKIP (prelaunch-locked): ${c.phone}`)
      continue
    }
    const outcome = await sendAutomationNow({
      profile: args.profile,
      automation: followup,
      isFirst: false,
      lead: {
        contact_handle: c.phone,
        handles: { sms: c.phone },
        first_name: c.firstName,
        vehicle: c.vehicle,
        source: 'catchup-followup',
      },
      now,
      config,
    })
    if (outcome.action === 'sent') sent++
    else if (outcome.action === 'blocked') blocked++
    else if (outcome.action === 'failed') failed++
    console.log(`  ${outcome.action.toUpperCase()}: ${c.phone} — ${outcome.reason}`)
  }
  console.log(`\n[catchup-followup] done. sent=${sent} blocked=${blocked} failed=${failed}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[catchup-followup] fatal:', err)
    process.exit(1)
  })
