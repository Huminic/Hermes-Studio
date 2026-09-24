#!/usr/bin/env npx tsx
/**
 * Daily AI Management Report emailer (N1.3 — Serra comms recovery).
 *
 * Renders the Daily AI Management report (produced by comms-preview.ts into
 * <from>/<profile>-daily-management.json) as a branded HTML email using the
 * SHARED card template (lead-notifications.renderDailyManagementEmail — not a
 * fork) and, only with --send, delivers it through the existing Studio email
 * path (notifications.sendNotification → central-mcp Resend).
 *
 * DRY-RUN by default: prints the recipients + rendered HTML and writes
 * <from>/<profile>-email.html. --send is required to actually email.
 *
 *   npx tsx scripts/send-daily-report.ts --profile serra-ford --from /tmp/preview \
 *     --to gm@store.com,sales@store.com --store-name "Tony Serra Ford" [--send]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderDailyManagementEmail } from '../src/server/lead-notifications'
import { sendNotification } from '../src/server/notifications'
import type { DailyMgmtReport } from '../src/server/daily-management-report'

const USAGE = `send-daily-report.ts — email the Daily AI Management Report (DRY-RUN by default)

  --profile <p>         store profile (required)
  --from <dir>          directory written by comms-preview.ts (required)
  --to a@x,b@y          comma-separated recipients (required for --send)
  --store-name "<Name>" display store name for the subject/header (required)
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

/**
 * Load the report artifact, render the email, write the HTML preview, and (only
 * when `send`) deliver it. Pure over injected deps so it never sends in tests
 * unless a sender is exercised. Returns the rendered subject/html and whether a
 * send was attempted.
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

  const report = JSON.parse(readFile(join(opts.fromDir, `${opts.profile}-daily-management.json`))) as DailyMgmtReport

  // Best-effort: reuse the generation time recorded by comms-preview's raw-counts.
  let generatedAt = now()
  try {
    const raw = JSON.parse(readFile(join(opts.fromDir, `${opts.profile}-raw-counts.json`))) as {
      generatedAt?: string
    }
    if (raw.generatedAt) generatedAt = raw.generatedAt
  } catch {
    // no raw-counts / unreadable → keep the now() fallback
  }

  const { subject, html, text } = renderDailyManagementEmail({
    report,
    storeName: opts.storeName,
    generatedAt,
  })

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
  if (!args.profile || !args.from || !args.storeName) {
    console.error('[send-daily-report] --profile, --from and --store-name are required')
    process.exit(1)
  }
  if (args.send && args.to.length === 0) {
    console.error('[send-daily-report] --send requires --to')
    process.exit(1)
  }

  const out = await sendDailyReport({
    profile: args.profile,
    fromDir: args.from,
    to: args.to,
    storeName: args.storeName,
    send: args.send,
  })

  console.log(`\n=== DAILY AI MANAGEMENT REPORT EMAIL (${args.profile}) ===`)
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

// Only run when invoked directly (so tests can import without executing).
if (process.argv[1] && /send-daily-report\.ts$/.test(process.argv[1])) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[send-daily-report] fatal:', err)
      process.exit(1)
    })
}
