#!/usr/bin/env npx tsx
/**
 * End-of-day Wrap-up emailer (N2.3 — Serra comms recovery, ~18:30 delivery).
 *
 * Renders the End-of-day Wrap-up as a branded report email using the SHARED
 * report template (lead-notifications.renderWrapupEmail → report-email) and,
 * only with --send, delivers it through the Studio email path.
 *
 * Reads the WRAP-UP artifact set comms-preview.ts wrote with `--window wrapup`
 * (a <profile>-wrapup- prefix) into <from>:
 *   <profile>-wrapup-daily-management.json  (date + footnote)
 *   <profile>-wrapup-raw-counts.json        (today's counts, deltas, cohort)
 *   <profile>-wrapup-lead-source.json       (today's leads by source)
 *   <profile>-wrapup-alerts.json            (needs-attention rows)
 *
 * DRY-RUN by default: prints recipients + rendered HTML and writes
 * <from>/<profile>-wrapup-email.html. --send is required to email.
 *
 *   npx tsx scripts/send-daily-wrapup.ts --profile serra-ford --from /tmp/preview \
 *     --to gm@store.com --store-name "Tony Serra Ford" [--send]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderWrapupEmail } from '../src/server/lead-notifications'
import { sendNotification } from '../src/server/notifications'
import type { DailyMgmtReport } from '../src/server/daily-management-report'
import type { AlertBundle } from '../src/server/comms-preview'
import type { LeadSourceRow } from '../src/server/lead-source-report'
import { deltaOf } from '../src/server/text-report'
import {
  agentNameForProfile,
  businessHoursFromRaw,
  needsAttentionFromAlerts,
  type SendFn,
  type SendResult,
} from './send-daily-report'

const USAGE = `send-daily-wrapup.ts — email the End-of-day Wrap-up (DRY-RUN by default)

  --profile <p>         store profile (required)
  --from <dir>          directory written by comms-preview.ts --window wrapup (required)
  --to a@x,b@y          comma-separated recipients (required for --send)
  --store-name "<Name>" display store name for the subject/header (required)
  --send                actually send (else dry-run: print + write <from>/<profile>-wrapup-email.html)
  --help                this message`

export type SendWrapupDeps = {
  readFile?: (path: string) => string
  writeFile?: (path: string, contents: string) => void
  sender?: SendFn
  now?: () => string
}

const defaultSender: SendFn = async (input) => {
  const r = await sendNotification({
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  })
  return r.ok ? { ok: true, email_id: r.email_id } : { ok: false, error: r.error }
}

type RawCounts = {
  generatedAt?: string
  businessHours?: { tz?: string; startHour?: number; endHour?: number }
  reportWindow?: { end?: string }
  dailyManagement?: {
    leadsDuringDay?: number
    leadsAfterHours?: number
    textsSentOnBehalf?: number
    repliesReceived?: number
    soldToday?: number
    lostToday?: number
  }
  leadSource?: { window24h?: { opportunities?: number }; prev24h?: { opportunities?: number } }
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/** Assemble renderWrapupEmail input from the -wrapup artifacts. */
export function assembleWrapupInput(opts: {
  profile: string
  fromDir: string
  storeName: string
  readFile: (path: string) => string
  now: () => string
}): Parameters<typeof renderWrapupEmail>[0] {
  const { profile, fromDir, storeName, readFile, now } = opts
  const report = JSON.parse(
    readFile(join(fromDir, `${profile}-wrapup-daily-management.json`)),
  ) as DailyMgmtReport

  let raw: RawCounts = {}
  try {
    raw = JSON.parse(readFile(join(fromDir, `${profile}-wrapup-raw-counts.json`))) as RawCounts
  } catch {
    /* zeros */
  }
  let alerts: AlertBundle | null = null
  try {
    alerts = JSON.parse(readFile(join(fromDir, `${profile}-wrapup-alerts.json`))) as AlertBundle
  } catch {
    /* no needs-attention */
  }
  let sourceRows: LeadSourceRow[] = []
  try {
    sourceRows = JSON.parse(readFile(join(fromDir, `${profile}-wrapup-lead-source.json`))) as LeadSourceRow[]
  } catch {
    /* no source rows */
  }

  const dm = raw.dailyManagement ?? {}
  const leadsToday = num(dm.leadsDuringDay) + num(dm.leadsAfterHours)

  let leadsDelta: { text: string; direction: 'up' | 'down' | 'even' } | undefined
  const cur24 = raw.leadSource?.window24h?.opportunities
  const prev24 = raw.leadSource?.prev24h?.opportunities
  if (typeof cur24 === 'number' && typeof prev24 === 'number') {
    leadsDelta = { text: `${Math.abs(cur24 - prev24)} vs yesterday`, direction: deltaOf(cur24, prev24) }
  }

  const bh = businessHoursFromRaw(raw.businessHours)
  const windowEndMs = raw.reportWindow?.end ? Date.parse(raw.reportWindow.end) : NaN
  const needsAttention = needsAttentionFromAlerts(alerts, bh, windowEndMs)

  // Today's leads by source: the 24h per-source counts, top 8 by volume.
  const leadsBySource = sourceRows
    .map((r) => ({ source: r.source, leads: num(r.leads24h) }))
    .filter((s) => s.leads > 0)
    .sort((a, b) => b.leads - a.leads)

  return {
    storeName,
    agentName: agentNameForProfile(profile),
    date: report.date,
    generatedAt: raw.generatedAt ?? now(),
    tiles: {
      leadsToday,
      aiTextsSent: num(dm.textsSentOnBehalf),
      repliesReceived: num(dm.repliesReceived),
      needsAttentionCount: needsAttention.length,
      leadsDelta,
    },
    leadsBySource,
    needsAttention,
    cohort: { sold: num(dm.soldToday), lost: num(dm.lostToday) },
    footnote: report.footnote,
  }
}

export async function sendDailyWrapup(opts: {
  profile: string
  fromDir: string
  to: string[]
  storeName: string
  send: boolean
  deps?: SendWrapupDeps
}): Promise<{ subject: string; html: string; htmlPath: string; sent: boolean; result?: SendResult }> {
  const readFile = opts.deps?.readFile ?? ((p: string) => readFileSync(p, 'utf8'))
  const writeFile = opts.deps?.writeFile ?? ((p: string, c: string) => writeFileSync(p, c))
  const now = opts.deps?.now ?? (() => new Date().toISOString())

  const input = assembleWrapupInput({
    profile: opts.profile,
    fromDir: opts.fromDir,
    storeName: opts.storeName,
    readFile,
    now,
  })
  const { subject, html, text } = renderWrapupEmail(input)

  const htmlPath = join(opts.fromDir, `${opts.profile}-wrapup-email.html`)
  writeFile(htmlPath, html)

  let sent = false
  let result: SendResult | undefined
  if (opts.send) {
    const sender = opts.deps?.sender ?? defaultSender
    result = await sender({ to: opts.to, subject, html, text })
    sent = true
  }
  return { subject, html, htmlPath, sent, result }
}

type Args = { profile: string; from: string; to: string[]; storeName: string; send: boolean; help: boolean }

function parseArgs(argv: string[]): Args {
  const a: Args = { profile: '', from: '', to: [], storeName: '', send: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--send') a.send = true
    else if (t === '--help' || t === '-h') a.help = true
    else if (t === '--profile') a.profile = argv[++i]
    else if (t.startsWith('--profile=')) a.profile = t.slice('--profile='.length)
    else if (t === '--from') a.from = argv[++i]
    else if (t.startsWith('--from=')) a.from = t.slice('--from='.length)
    else if (t === '--to') a.to = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    else if (t.startsWith('--to=')) a.to = t.slice('--to='.length).split(',').map((s) => s.trim()).filter(Boolean)
    else if (t === '--store-name') a.storeName = argv[++i]
    else if (t.startsWith('--store-name=')) a.storeName = t.slice('--store-name='.length)
  }
  return a
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(USAGE)
    process.exit(0)
  }
  if (!args.profile || !args.from || !args.storeName) {
    console.error('[send-daily-wrapup] --profile, --from and --store-name are required')
    process.exit(1)
  }
  if (args.send && args.to.length === 0) {
    console.error('[send-daily-wrapup] --send requires --to')
    process.exit(1)
  }

  const out = await sendDailyWrapup({
    profile: args.profile,
    fromDir: args.from,
    to: args.to,
    storeName: args.storeName,
    send: args.send,
  })

  console.log(`\n=== END-OF-DAY WRAP-UP EMAIL (${args.profile}) ===`)
  console.log(`mode:       ${args.send ? 'SEND' : 'DRY-RUN (no email)'}`)
  console.log(`recipients: ${args.to.length ? args.to.join(', ') : '(none)'}`)
  console.log(`subject:    ${out.subject}`)
  console.log(`html:       wrote ${out.htmlPath}`)
  console.log(`\n--- RENDERED HTML ---\n${out.html}`)
  if (out.sent) {
    console.log(
      `\n[send] ${out.result?.ok ? `sent (id=${out.result.email_id ?? ''})` : `FAILED: ${out.result?.error}`}`,
    )
  } else {
    console.log(`\n[dry-run] no email sent. Re-run with --send (and --to) to deliver.`)
  }
}

if (process.argv[1] && /send-daily-wrapup\.ts$/.test(process.argv[1])) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[send-daily-wrapup] fatal:', err)
      process.exit(1)
    })
}
