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
import { writeFileSync } from 'node:fs'
import { readStudioConfig } from '../src/server/studio-config'
import { listAutomations } from '../src/server/messaging-hub-store'
import {
  gatherFollowupCandidates,
  type FollowupCandidate,
  type FollowupDrop,
} from '../src/server/catchup-followup'
import { resolveVinOrgId } from '../src/server/vin-client'
import { fetchLeadSources } from '../src/server/lead-opportunities'
import { sendAutomationNow } from '../src/server/automations'
import { deleteAutomationRun } from '../src/server/messaging-hub-store'
import {
  runCatchupSends,
  effectivePerMinute,
  DEFAULT_SMS_PER_MINUTE_CAP,
} from '../src/server/catchup-send'
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
  includeService: boolean
  since: string | null
  excludeSources: string[]
  skipTextedSince: string | null
  csv: string | null
  perMinute: number | null
  help: boolean
}

const USAGE = `catchup-followup.ts — 24-hour follow-up catch-up (DRY-RUN by default)

  --profile <p>            store profile (default serra-honda)
  --send                   dispatch (else dry-run); every send still passes the comms-gate
  --days <n>               look-back window in days (default 7)
  --since YYYY-MM-DD       explicit createdUtc floor (UTC midnight); overrides --days for the
                           window start; leads older than it are dropped 'before since floor'
  --exclude-source "<name>"  drop leads whose resolved lead-source name matches (repeatable,
                           case-insensitive), reason 'excluded source: <name>'
  --skip-texted-since YYYY-MM-DD  drop a candidate already texted (outbound sms) on/after the
                           date via the reply path (not in the automation ledger)
  --csv <path>             dry-run only: write a decision CSV + <path>.summary.json
  --include-service        include SERVICE/PARTS leads (default sales-only)
  --limit <n>              cap the recipient list
  --per-minute <n>         pace sends to at most n/min (override DOWNWARD only; the
                           default stays one below the profile SMS per-minute cap)
  --ignore-window          send outside the A2P window (locked self-test only)
  --help                   this message`

function parseArgs(argv: string[]): Args {
  const a: Args = {
    profile: 'serra-honda',
    send: false,
    days: null,
    limit: null,
    ignoreWindow: false,
    includeService: false,
    since: null,
    excludeSources: [],
    skipTextedSince: null,
    csv: null,
    perMinute: null,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--send') a.send = true
    else if (t === '--ignore-window') a.ignoreWindow = true
    else if (t === '--include-service') a.includeService = true
    else if (t === '--help' || t === '-h') a.help = true
    else if (t === '--profile') a.profile = argv[++i]
    else if (t.startsWith('--profile=')) a.profile = t.slice('--profile='.length)
    else if (t === '--days') a.days = Number(argv[++i])
    else if (t.startsWith('--days=')) a.days = Number(t.slice('--days='.length))
    else if (t === '--limit') a.limit = Number(argv[++i])
    else if (t.startsWith('--limit=')) a.limit = Number(t.slice('--limit='.length))
    else if (t === '--since') a.since = argv[++i]
    else if (t.startsWith('--since=')) a.since = t.slice('--since='.length)
    else if (t === '--exclude-source') a.excludeSources.push(argv[++i])
    else if (t.startsWith('--exclude-source=')) a.excludeSources.push(t.slice('--exclude-source='.length))
    else if (t === '--skip-texted-since') a.skipTextedSince = argv[++i]
    else if (t.startsWith('--skip-texted-since=')) a.skipTextedSince = t.slice('--skip-texted-since='.length)
    else if (t === '--csv') a.csv = argv[++i]
    else if (t.startsWith('--csv=')) a.csv = t.slice('--csv='.length)
    else if (t === '--per-minute') a.perMinute = Number(argv[++i])
    else if (t.startsWith('--per-minute=')) a.perMinute = Number(t.slice('--per-minute='.length))
  }
  return a
}

function fmtTs(ms: number | null): string {
  return ms == null ? 'n/a' : new Date(ms).toISOString()
}

/** RFC-4180-ish field quoting for the decision CSV. */
function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const CSV_HEADER = 'decision,phone_last4,firstName,leadId,createdUtc,leadType,leadSource,reason'

function last4(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits ? digits.slice(-4) : ''
}

/** Build the dry-run decision CSV (one SEND row per candidate, one DROP per dropped lead). */
function buildDecisionCsv(candidates: FollowupCandidate[], dropped: FollowupDrop[]): string {
  const rows = [CSV_HEADER]
  for (const c of candidates) {
    rows.push(
      [
        'SEND',
        last4(c.phone),
        c.firstName,
        c.leadId,
        c.createdUtc,
        c.leadType,
        c.leadSource,
        '',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  for (const d of dropped) {
    rows.push(
      [
        'DROP',
        last4(d.phone),
        d.firstName,
        d.leadId,
        d.createdUtc,
        d.leadType,
        d.leadSource,
        d.reason,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return rows.join('\n') + '\n'
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(USAGE)
    process.exit(0)
  }
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

  // Resolve lead-source id→name only when a flag needs it (--exclude-source or --csv),
  // so a plain run makes no extra broker call. Best-effort; empty map on failure.
  let sourceNames: Map<string, string> | undefined
  if (args.excludeSources.length || args.csv) {
    const org = resolveVinOrgId(args.profile, config)
    if (org.ok) sourceNames = await fetchLeadSources({ orgId: org.orgId })
  }

  const res = await gatherFollowupCandidates({
    profile: args.profile,
    now,
    config,
    followupAutomationId: followup.id,
    waitHours: followup.wait_hours,
    days: args.days ?? undefined,
    salesOnly: !args.includeService,
    since: args.since ?? undefined,
    excludeSources: args.excludeSources.length ? args.excludeSources : undefined,
    skipTextedSince: args.skipTextedSince ?? undefined,
    sourceNames,
  })

  const limited = args.limit != null ? res.candidates.slice(0, args.limit) : res.candidates

  console.log(`\n=== CATCH-UP: 24-HOUR FOLLOW-UP (${args.profile}) ===`)
  console.log(`mode:        ${args.send ? 'SEND' : 'DRY-RUN (no sends)'}`)
  console.log(`scope:       ${args.includeService ? 'ALL lead types' : 'SALES only (SERVICE/PARTS excluded)'}`)
  console.log(`window:      ${res.startDate} .. ${res.endDate}`)
  console.log(`automation:  ${followup.name} (${followup.id})`)
  console.log(`due cutoff:  ${res.waitHours}h (lead_followup wait_hours; 72h fallback)`)
  console.log(
    `follow-up window: ${res.windowOpen ? 'OPEN' : 'CLOSED'}` +
      (res.windowOpen ? '' : ` — next opens ${fmtTs(res.nextOpenMs)}`),
  )
  console.log(
    `prelaunch lock: ${prelaunchLockEngaged() ? `ENGAGED (allow: ${prelaunchAllowList().join(', ') || 'none'})` : 'OFF (real sends can reach any number)'}`,
  )
  if (res.skipped) console.log(`skipped:     ${res.skipped}`)
  if (args.since) console.log(`since floor:  ${args.since} (createdUtc >= ${args.since}T00:00:00Z)`)
  if (args.excludeSources.length) console.log(`exclude src:  ${args.excludeSources.join(', ')}`)
  if (args.skipTextedSince) console.log(`skip texted:  since ${args.skipTextedSince}`)
  console.log(
    `polled=${res.polledTotal} active=${res.activeCount} due=${res.dueCount} sales=${res.salesCount} ` +
      `candidates=${res.candidates.length} dropped=${res.dropped.length}` +
      (args.limit != null ? ` (limited to ${limited.length})` : ''),
  )

  console.log(`\n--- RECIPIENTS (${limited.length}) ---`)
  for (const c of limited) {
    console.log(
      `  ${c.phone}  ${c.firstName ?? '(no name)'}  lead=${c.leadId ?? '?'}  ` +
        `type=${c.leadType ?? '?'}  anniv=${fmtTs(c.anniversaryMs)}  ${c.vehicle ?? ''}`,
    )
  }
  if (res.dropped.length) {
    console.log(`\n--- DROPPED (${res.dropped.length}) ---`)
    const byReason: Record<string, number> = {}
    for (const d of res.dropped) byReason[d.reason] = (byReason[d.reason] ?? 0) + 1
    for (const [reason, n] of Object.entries(byReason)) console.log(`  ${n}× ${reason}`)
  }

  if (args.csv) {
    const byReason: Record<string, number> = {}
    for (const d of res.dropped) byReason[d.reason] = (byReason[d.reason] ?? 0) + 1
    const summary = {
      profile: args.profile,
      window: { start: res.startDate, end: res.endDate },
      dueCutoffHours: res.waitHours,
      since: args.since ?? null,
      excludeSources: args.excludeSources,
      skipTextedSince: args.skipTextedSince ?? null,
      counts: {
        polled: res.polledTotal,
        active: res.activeCount,
        due: res.dueCount,
        sales: res.salesCount,
        candidates: res.candidates.length,
        dropped: res.dropped.length,
        droppedByReason: byReason,
      },
    }
    writeFileSync(args.csv, buildDecisionCsv(res.candidates, res.dropped))
    writeFileSync(`${args.csv}.summary.json`, JSON.stringify(summary, null, 2) + '\n')
    console.log(`\n[csv] wrote ${args.csv} and ${args.csv}.summary.json`)
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

  // Prelaunch allowlist gate first — a locked-out number never counts against pacing.
  const sendable = []
  let prelaunchSkipped = 0
  for (const c of limited) {
    if (prelaunchLockEngaged() && !allowedByPrelaunchLock(c.phone)) {
      console.log(`  SKIP (prelaunch-locked): ${c.phone}`)
      prelaunchSkipped++
      continue
    }
    sendable.push(c)
  }

  // Pace under the profile SMS per-minute cap (default 5): send at most (cap-1)/min,
  // lowered further by --per-minute. Keeps CommGate from rejecting a burst as
  // `rate-cap-exceeded` (which would otherwise strand recipients mid-run).
  const cap = config.comms?.rate_caps?.sms?.per_minute ?? DEFAULT_SMS_PER_MINUTE_CAP
  const perMinute = effectivePerMinute(cap, args.perMinute)

  const summary = await runCatchupSends({
    items: sendable.map((c) => ({
      phone: c.phone,
      firstName: c.firstName,
      vehicle: c.vehicle,
      leadId: c.leadId,
    })),
    perMinute,
    deps: {
      send: (item) =>
        sendAutomationNow({
          profile: args.profile,
          automation: followup,
          isFirst: false,
          lead: {
            contact_handle: item.phone,
            handles: { sms: item.phone },
            first_name: item.firstName ?? null,
            vehicle: item.vehicle ?? null,
            source: 'catchup-followup',
          },
          now,
          config,
        }),
      deleteRun: (id) => deleteAutomationRun(args.profile, id),
    },
  })

  const blockedLines = Object.entries(summary.blockedByReason)
    .map(([reason, n]) => `${n}× ${reason}`)
    .join(', ')
  console.log(
    `\n[catchup-followup] done. sent=${summary.sent} ` +
      `blocked=${Object.values(summary.blockedByReason).reduce((a, b) => a + b, 0)}` +
      (blockedLines ? ` (${blockedLines})` : '') +
      ` failed=${summary.failed} retried=${summary.retried} skipped=${summary.skipped}` +
      (prelaunchSkipped ? ` prelaunch-skipped=${prelaunchSkipped}` : ''),
  )
  console.log(
    `[catchup-followup] remaining (rate-capped + failed, re-run to catch): ${summary.remaining}`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[catchup-followup] fatal:', err)
    process.exit(1)
  })
