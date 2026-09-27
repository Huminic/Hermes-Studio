#!/usr/bin/env npx tsx
/**
 * Daily AI Management Report emailer (N1.3 → redesigned N2.1 — Serra comms recovery).
 *
 * Renders the Daily AI Management report as a branded report email using the
 * SHARED report template (report-email.renderReportEmail via
 * lead-notifications.renderDailyManagementEmail — not a fork) and, only with
 * --send, delivers it through the existing Studio email path
 * (notifications.sendNotification → central-mcp Resend).
 *
 * Reads the artifacts comms-preview.ts wrote into <from>:
 *   <profile>-daily-management.json  (footnote + date)
 *   <profile>-raw-counts.json        (KPI tile numbers, deltas, generatedAt)
 *   <profile>-alerts.json            (Needs-attention rows; details when present)
 *
 * DRY-RUN by default: prints the recipients + rendered HTML and writes
 * <from>/<profile>-email.html. --send is required to actually email.
 *
 *   npx tsx scripts/send-daily-report.ts --profile serra-ford --from /tmp/preview \
 *     --to gm@store.com,sales@store.com --store-name "Tony Serra Ford" [--send]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  renderDailyManagementEmail,
  type NeedsAttentionRow,
} from '../src/server/lead-notifications'
import { sendNotification } from '../src/server/notifications'
import type { DailyMgmtReport } from '../src/server/daily-management-report'
import type { AlertBundle, AlertLeadDetail } from '../src/server/comms-preview'
import { businessHoursElapsedMs, DEFAULT_BUSINESS_HOURS, type BusinessHoursCfg } from '../src/server/lead-aging'
import { deltaOf, type Delta as DeltaDir } from '../src/server/text-report'
import { resolveEmailRecipients, resolveStoreName } from './report-recipients'

/** VinSolutions CRM home for the "Open VinSolutions" CTA (store-agnostic app URL). */
const VINSOLUTIONS_HOME = 'https://apps.vinsolutions.com/'

const USAGE = `send-daily-report.ts — email the Daily AI Management Report (DRY-RUN by default)

  --profile <p>         store profile (required)
  --from <dir>          directory written by comms-preview.ts (required)
  --to a@x,b@y          comma-separated recipients (default: comms.management_audience.emails)
  --store-name "<Name>" display store name (default: comms.reports.store_name, else profile)
  --send                actually send (else dry-run: print + write <from>/<profile>-email.html)
  --help                this message`

export type SendResult = { ok: boolean; error?: string; email_id?: string }
export type SendFn = (input: {
  to: string[]
  subject: string
  html: string
  text: string
}) => Promise<SendResult>

export type SendDailyReportDeps = {
  readFile?: (path: string) => string
  writeFile?: (path: string, contents: string) => void
  sender?: SendFn
  /** ISO fallback when raw-counts has no generatedAt (injected for tests). */
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

/** Store agent voice (Caroline = Honda/Nissan, Georgia = Ford). */
export function agentNameForProfile(profile: string): string {
  return /ford/i.test(profile) ? 'Georgia' : 'Caroline'
}

/** Shape of the raw-counts artifact this emailer consumes (subset). */
type RawCounts = {
  generatedAt?: string
  businessHours?: { tz?: string; startHour?: number; endHour?: number }
  reportWindow?: { start?: string; end?: string }
  dailyManagement?: {
    leadsDuringDay?: number
    leadsAfterHours?: number
    afterHoursInboundCalls?: { value?: number } | number
    textsSentOnBehalf?: number
    businessHoursTextCount?: number
    afterHoursAvgTimeToTextMin?: { value?: number | null } | number | null
    activeLeads30d?: number
  }
  leadSource?: {
    window24h?: { opportunities?: number }
    prev24h?: { opportunities?: number }
  }
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function nested(v: { value?: number | null } | number | null | undefined): number | null {
  if (v == null) return null
  if (typeof v === 'number') return v
  return v.value ?? null
}

const DELTA_MAP: Record<DeltaDir, 'up' | 'down' | 'even'> = { up: 'up', down: 'down', even: 'even' }

/** Business-hours config from a raw-counts businessHours block. */
export function businessHoursFromRaw(bh?: {
  tz?: string
  startHour?: number
  endHour?: number
}): BusinessHoursCfg {
  return {
    ...DEFAULT_BUSINESS_HOURS,
    tz: bh?.tz ?? DEFAULT_BUSINESS_HOURS.tz,
    startHour: bh?.startHour ?? DEFAULT_BUSINESS_HOURS.startHour,
    endHour: bh?.endHour ?? DEFAULT_BUSINESS_HOURS.endHour,
  }
}

/**
 * Build the "Needs attention" rows from the alerts artifact: the union of the
 * unactioned>5min + sitting>3d buckets (deduped), up to the caller's slice.
 * Uses the enriched per-lead detail when present (firstName/source/leadType);
 * falls back to bare ids for older bundles. hoursWaiting = business-hours aging
 * from createdUtc to windowEnd. Pure; never invents a name.
 */
export function needsAttentionFromAlerts(
  alerts: AlertBundle | null,
  bh: BusinessHoursCfg,
  windowEndMs: number,
): NeedsAttentionRow[] {
  const rows: NeedsAttentionRow[] = []
  const seen = new Set<string>()
  const details = alerts?.details
  const pushDetail = (d: AlertLeadDetail) => {
    if (!d.leadId || seen.has(d.leadId)) return
    seen.add(d.leadId)
    const createdMs = d.createdUtc ? Date.parse(d.createdUtc) : NaN
    const hoursWaiting =
      Number.isFinite(createdMs) && Number.isFinite(windowEndMs)
        ? Math.round(businessHoursElapsedMs(createdMs, windowEndMs, bh) / 3_600_000)
        : null
    rows.push({
      leadId: d.leadId,
      firstName: d.firstName,
      source: d.source,
      hoursWaiting,
      status: d.leadStatus,
      leadType: d.leadType,
    })
  }
  if (details) {
    for (const d of details.unactionedOver5Min) pushDetail(d)
    for (const d of details.sittingOver3Days) pushDetail(d)
  } else if (alerts) {
    for (const id of [...alerts.unactionedOver5Min, ...alerts.sittingOver3Days]) {
      if (!seen.has(id)) {
        seen.add(id)
        rows.push({ leadId: id })
      }
    }
  }
  return rows
}

/**
 * Assemble the renderDailyManagementEmail input from the three artifacts. Pure
 * over an injected reader so it never touches disk in tests. Missing artifacts
 * degrade to zeros / no rows (never invents a number).
 */
export function assembleDailyEmailInput(opts: {
  profile: string
  fromDir: string
  storeName: string
  readFile: (path: string) => string
  now: () => string
}): Parameters<typeof renderDailyManagementEmail>[0] {
  const { profile, fromDir, storeName, readFile, now } = opts
  const report = JSON.parse(
    readFile(join(fromDir, `${profile}-daily-management.json`)),
  ) as DailyMgmtReport

  let raw: RawCounts = {}
  try {
    raw = JSON.parse(readFile(join(fromDir, `${profile}-raw-counts.json`))) as RawCounts
  } catch {
    /* no raw-counts → zeros */
  }
  let alerts: AlertBundle | null = null
  try {
    alerts = JSON.parse(readFile(join(fromDir, `${profile}-alerts.json`))) as AlertBundle
  } catch {
    /* no alerts → no needs-attention rows */
  }

  const generatedAt = raw.generatedAt ?? now()
  const dm = raw.dailyManagement ?? {}
  const leadsDuringDay = num(dm.leadsDuringDay)
  const leadsAfterHours = num(dm.leadsAfterHours)
  const aiTextsSent = num(dm.textsSentOnBehalf)
  const afterHoursCalls = num(nested(dm.afterHoursInboundCalls))
  const businessHoursTexts = num(dm.businessHoursTextCount)
  const avgTimeToTextMin = nested(dm.afterHoursAvgTimeToTextMin)
  const activeLeads30d = num(dm.activeLeads30d)

  // New-leads delta from the clean 24h vs prior-24h lead pull (real data).
  let newLeadsDelta: { text: string; direction: 'up' | 'down' | 'even' } | undefined
  const cur24 = raw.leadSource?.window24h?.opportunities
  const prev24 = raw.leadSource?.prev24h?.opportunities
  if (typeof cur24 === 'number' && typeof prev24 === 'number') {
    const dir = DELTA_MAP[deltaOf(cur24, prev24)]
    const diff = Math.abs(cur24 - prev24)
    newLeadsDelta = { text: `${diff} vs prior 24h`, direction: dir }
  }

  // Needs-attention = union of unactioned>5min + sitting>3d.
  const windowEndMs = raw.reportWindow?.end ? Date.parse(raw.reportWindow.end) : NaN
  const bh = businessHoursFromRaw(raw.businessHours)
  const needsAttention = needsAttentionFromAlerts(alerts, bh, windowEndMs)

  return {
    storeName,
    agentName: agentNameForProfile(profile),
    date: report.date,
    generatedAt,
    tiles: {
      leadsDuringDay,
      leadsAfterHours,
      aiTextsSent,
      afterHoursCalls,
      needsAttentionCount: needsAttention.length,
      newLeadsDelta,
    },
    coverage: {
      afterHoursLeadsHandled: leadsAfterHours,
      avgTimeToTextMin,
      businessHoursTexts,
      activeLeads30d,
    },
    needsAttention,
    footnote: report.footnote,
    cta: { label: 'Open VinSolutions', url: VINSOLUTIONS_HOME },
  }
}

/**
 * Load the artifacts, render the email, write the HTML preview, and (only when
 * `send`) deliver it. Pure over injected deps so it never sends in tests unless
 * a sender is exercised.
 */
export async function sendDailyReport(opts: {
  profile: string
  fromDir: string
  to: string[]
  storeName: string
  send: boolean
  deps?: SendDailyReportDeps
}): Promise<{ subject: string; html: string; htmlPath: string; sent: boolean; result?: SendResult }> {
  const readFile = opts.deps?.readFile ?? ((p: string) => readFileSync(p, 'utf8'))
  const writeFile = opts.deps?.writeFile ?? ((p: string, c: string) => writeFileSync(p, c))
  const now = opts.deps?.now ?? (() => new Date().toISOString())

  const input = assembleDailyEmailInput({
    profile: opts.profile,
    fromDir: opts.fromDir,
    storeName: opts.storeName,
    readFile,
    now,
  })
  const { subject, html, text } = renderDailyManagementEmail(input)

  const htmlPath = join(opts.fromDir, `${opts.profile}-email.html`)
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

type Args = {
  profile: string
  from: string
  to: string[]
  storeName: string
  send: boolean
  help: boolean
}

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
  if (!args.profile || !args.from) {
    console.error('[send-daily-report] --profile and --from are required')
    process.exit(1)
  }
  // N3.1: default recipients + store name from the store's management audience.
  const to = resolveEmailRecipients(args.profile, args.to)
  const storeName = resolveStoreName(args.profile, args.storeName)
  if (args.send && to.length === 0) {
    console.error('[send-daily-report] --send requires --to or a configured management audience')
    process.exit(1)
  }

  const out = await sendDailyReport({
    profile: args.profile,
    fromDir: args.from,
    to,
    storeName,
    send: args.send,
  })

  console.log(`\n=== DAILY AI MANAGEMENT REPORT EMAIL (${args.profile}) ===`)
  console.log(`mode:       ${args.send ? 'SEND' : 'DRY-RUN (no email)'}`)
  console.log(`recipients: ${to.length ? to.join(', ') : '(none)'}`)
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

// Only run when invoked directly (so tests can import without executing).
if (process.argv[1] && /send-daily-report\.ts$/.test(process.argv[1])) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[send-daily-report] fatal:', err)
      process.exit(1)
    })
}
