#!/usr/bin/env npx tsx
/**
 * Catch-up: IMMEDIATE lead-engagement text (Script A).
 *
 * Reusable, re-runnable, idempotent. Gathers today's NEW VinSolutions leads that
 * have NOT been followed up (leadStatus ACTIVE_NEW_LEAD), EXCLUDING leads already
 * handled by a conversational agent (Vapi/Tavus), and — unless already sent (the
 * automation_runs ledger) — sends the immediate first-touch via the existing
 * marketing automation. Re-running "catches up" without double-texting anyone.
 *
 * SAFE BY DEFAULT: prints the recipient list and exits (DRY-RUN). Only `--send`
 * dispatches, and every send still passes the comms-gate (kill switch, prelaunch
 * allowlist, business hours, blacklist, rate limit). Immediate 6-8pm/8am window
 * is enforced here; `--ignore-window` overrides ONLY for a controlled self-test.
 *
 * Run INSIDE the studio container:
 *   docker exec $(docker ps --format '{{.Names}}' | grep -m1 '^hermes-studio-') \
 *     npx tsx scripts/catchup-immediate.ts [--profile serra-honda] [--send] \
 *     [--hours N] [--limit N] [--ignore-window]
 */
import { readStudioConfig } from '../src/server/studio-config'
import { listAutomations } from '../src/server/messaging-hub-store'
import { gatherImmediateCandidates } from '../src/server/catchup-immediate'
import { sendImmediateAutomation } from '../src/server/automations'
import {
  prelaunchLockEngaged,
  prelaunchAllowList,
  allowedByPrelaunchLock,
} from '../src/server/prelaunch-lock'

type Args = {
  profile: string
  send: boolean
  hours: number | null
  limit: number | null
  ignoreWindow: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = { profile: 'serra-honda', send: false, hours: null, limit: null, ignoreWindow: false }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--send') a.send = true
    else if (t === '--ignore-window') a.ignoreWindow = true
    else if (t === '--profile') a.profile = argv[++i]
    else if (t.startsWith('--profile=')) a.profile = t.slice('--profile='.length)
    else if (t === '--hours') a.hours = Number(argv[++i])
    else if (t.startsWith('--hours=')) a.hours = Number(t.slice('--hours='.length))
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

  const immediate = listAutomations(args.profile).find(
    (x) => x.trigger === 'new_lead' && x.channel === 'sms' && x.status === 'active',
  )
  if (!immediate) {
    console.error(
      `[catchup-immediate] no ACTIVE new_lead/sms automation for ${args.profile} — nothing to send.`,
    )
    process.exit(0)
  }

  const sinceMs = args.hours != null ? now - args.hours * 60 * 60_000 : undefined
  const res = await gatherImmediateCandidates({
    profile: args.profile,
    now,
    config,
    immediateAutomationId: immediate.id,
    sinceMs,
  })

  const limited = args.limit != null ? res.candidates.slice(0, args.limit) : res.candidates

  // ---- Report ----
  console.log(`\n=== CATCH-UP: IMMEDIATE lead-engagement (${args.profile}) ===`)
  console.log(`mode:        ${args.send ? 'SEND' : 'DRY-RUN (no sends)'}`)
  console.log(`window:      ${res.startDate} .. ${res.endDate}`)
  console.log(`automation:  ${immediate.name} (${immediate.id})`)
  console.log(
    `immediate send window: ${res.windowOpen ? 'OPEN' : 'CLOSED'}` +
      (res.windowOpen ? '' : ` — next opens ${fmtTs(res.nextOpenMs)}`),
  )
  console.log(
    `prelaunch lock: ${prelaunchLockEngaged() ? `ENGAGED (allow: ${prelaunchAllowList().join(', ') || 'none'})` : 'OFF (real sends can reach any number)'}`,
  )
  if (res.skipped) console.log(`skipped:     ${res.skipped}`)
  console.log(
    `polled=${res.polledTotal} new(ACTIVE_NEW_LEAD)=${res.newLeadCount} ` +
      `candidates=${res.candidates.length} dropped=${res.dropped.length}` +
      (args.limit != null ? ` (limited to ${limited.length})` : ''),
  )

  console.log(`\n--- RECIPIENTS (${limited.length}) ---`)
  for (const c of limited) {
    console.log(
      `  ${c.phone}  ${c.firstName ?? '(no name)'}  lead=${c.leadId ?? '?'}  ${c.vehicle ?? ''}`,
    )
  }
  if (res.dropped.length) {
    console.log(`\n--- DROPPED (${res.dropped.length}) ---`)
    const byReason: Record<string, number> = {}
    for (const d of res.dropped) byReason[d.reason] = (byReason[d.reason] ?? 0) + 1
    for (const [reason, n] of Object.entries(byReason)) console.log(`  ${n}× ${reason}`)
  }

  if (!args.send) {
    console.log(`\n[dry-run] no messages sent. Re-run with --send (inside the 6-8pm/8am window) to dispatch.`)
    process.exit(0)
  }

  // ---- Send guards ----
  // Fail-closed: the immediate window is CT-specific. If the profile declares no
  // timezone the window math falls back to a platform default (Eastern) and could
  // send an hour into quiet hours for a Central store — refuse rather than guess.
  const tz = config.comms?.business_hours?.tz
  if (!tz) {
    console.error(
      `\n[catchup-immediate] REFUSING to send: ${args.profile} has no comms.business_hours.tz — ` +
        `the send window timezone is unknown. Set it before sending.`,
    )
    process.exit(1)
  }
  // --ignore-window must never be a real-customer blast: only allow it behind the
  // prelaunch lock (self-test), never bare.
  if (args.ignoreWindow && !prelaunchLockEngaged()) {
    console.error(
      `\n[catchup-immediate] REFUSING --ignore-window without PRELAUNCH_SMS_LOCK engaged ` +
        `(it exists only for a locked self-test).`,
    )
    process.exit(1)
  }
  if (!res.windowOpen && !args.ignoreWindow) {
    console.error(
      `\n[catchup-immediate] REFUSING to send: outside the immediate window (next opens ${fmtTs(res.nextOpenMs)}). ` +
        `Use --ignore-window ONLY for a controlled self-test.`,
    )
    process.exit(1)
  }
  if (!res.windowOpen && args.ignoreWindow) {
    console.warn(`\n[catchup-immediate] WARNING: --ignore-window set — sending OUTSIDE the immediate window (policy deviation).`)
  }
  if (!prelaunchLockEngaged()) {
    console.warn(
      `\n[catchup-immediate] WARNING: PRELAUNCH_SMS_LOCK is OFF — sends can reach REAL customers. ` +
        `Engage the lock (PRELAUNCH_SMS_LOCK=true + PRELAUNCH_TEST_RECIPIENTS) for tests.`,
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
    const outcome = await sendImmediateAutomation({
      profile: args.profile,
      automation: immediate,
      lead: {
        contact_handle: c.phone,
        handles: { sms: c.phone },
        first_name: c.firstName,
        vehicle: c.vehicle,
        source: 'catchup-immediate',
      },
      now,
      config,
    })
    if (outcome.action === 'sent') sent++
    else if (outcome.action === 'blocked') blocked++
    else if (outcome.action === 'failed') failed++
    console.log(`  ${outcome.action.toUpperCase()}: ${c.phone} — ${outcome.reason}`)
  }
  console.log(`\n[catchup-immediate] done. sent=${sent} blocked=${blocked} failed=${failed}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[catchup-immediate] fatal:', err)
    process.exit(1)
  })
