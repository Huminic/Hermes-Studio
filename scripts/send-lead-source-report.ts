#!/usr/bin/env npx tsx
/**
 * Lead Source Report emailer (N2.2 — Serra comms recovery, noon delivery).
 *
 * Renders the Lead Source Report as a branded report email using the SHARED
 * report template (lead-notifications.renderLeadSourceEmail → report-email) and,
 * only with --send, delivers it through the Studio email path.
 *
 * Reads the artifacts comms-preview.ts wrote into <from>:
 *   <profile>-lead-source.json   (per-source rows)
 *   <profile>-raw-counts.json    (window totals, date, generatedAt)
 *
 * DRY-RUN by default: prints recipients + rendered HTML and writes
 * <from>/<profile>-lead-source-email.html. --send is required to email.
 *
 *   npx tsx scripts/send-lead-source-report.ts --profile serra-ford --from /tmp/preview \
 *     --to gm@store.com --store-name "Tony Serra Ford" [--send]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  renderLeadSourceEmail,
  type LeadSourceEmailRow,
} from '../src/server/lead-notifications'
import { sendNotification } from '../src/server/notifications'
import type { LeadSourceRow } from '../src/server/lead-source-report'
import { agentNameForProfile, type SendFn, type SendResult } from './send-daily-report'

const USAGE = `send-lead-source-report.ts — email the Lead Source Report (DRY-RUN by default)

  --profile <p>         store profile (required)
  --from <dir>          directory written by comms-preview.ts (required)
  --to a@x,b@y          comma-separated recipients (required for --send)
  --store-name "<Name>" display store name for the subject/header (required)
  --send                actually send (else dry-run: print + write <from>/<profile>-lead-source-email.html)
  --help                this message`

export type SendLeadSourceDeps = {
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
  date?: string
  generatedAt?: string
  leadSource?: {
    window24h?: { opportunities?: number; sold?: number }
    window7d?: { opportunities?: number }
    window30d?: { opportunities?: number }
  }
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/**
 * Assemble renderLeadSourceEmail input from the artifacts. Window totals prefer
 * the exact raw-counts figures (deduped per window); when absent they fall back
 * to summing the per-source rows (documented over-count for cross-source contacts).
 */
export function assembleLeadSourceInput(opts: {
  profile: string
  fromDir: string
  storeName: string
  readFile: (path: string) => string
  now: () => string
}): Parameters<typeof renderLeadSourceEmail>[0] {
  const { profile, fromDir, storeName, readFile, now } = opts
  const rows = JSON.parse(
    readFile(join(fromDir, `${profile}-lead-source.json`)),
  ) as LeadSourceRow[]

  let raw: RawCounts = {}
  try {
    raw = JSON.parse(readFile(join(fromDir, `${profile}-raw-counts.json`))) as RawCounts
  } catch {
    /* no raw-counts → sum rows */
  }

  const ls = raw.leadSource
  const totals =
    ls?.window24h?.opportunities != null
      ? {
          leads24h: num(ls.window24h?.opportunities),
          leads7d: num(ls.window7d?.opportunities),
          leads30d: num(ls.window30d?.opportunities),
          sold24h: num(ls.window24h?.sold),
        }
      : {
          leads24h: rows.reduce((s, r) => s + num(r.leads24h), 0),
          leads7d: rows.reduce((s, r) => s + num(r.leads7d), 0),
          leads30d: rows.reduce((s, r) => s + num(r.leads30d), 0),
          sold24h: rows.reduce((s, r) => s + num(r.sold24h), 0),
        }

  const emailRows: LeadSourceEmailRow[] = rows.map((r) => ({
    source: r.source,
    leads24h: num(r.leads24h),
    leads7d: num(r.leads7d),
    leads30d: num(r.leads30d),
    sold24h: num(r.sold24h),
    sold7d: num(r.sold7d),
    sold30d: num(r.sold30d),
  }))

  return {
    storeName,
    agentName: agentNameForProfile(profile),
    date: raw.date ?? new Date(now()).toISOString().slice(0, 10),
    generatedAt: raw.generatedAt ?? now(),
    rows: emailRows,
    totals,
  }
}

export async function sendLeadSourceReport(opts: {
  profile: string
  fromDir: string
  to: string[]
  storeName: string
  send: boolean
  deps?: SendLeadSourceDeps
}): Promise<{ subject: string; html: string; htmlPath: string; sent: boolean; result?: SendResult }> {
  const readFile = opts.deps?.readFile ?? ((p: string) => readFileSync(p, 'utf8'))
  const writeFile = opts.deps?.writeFile ?? ((p: string, c: string) => writeFileSync(p, c))
  const now = opts.deps?.now ?? (() => new Date().toISOString())

  const input = assembleLeadSourceInput({
    profile: opts.profile,
    fromDir: opts.fromDir,
    storeName: opts.storeName,
    readFile,
    now,
  })
  const { subject, html, text } = renderLeadSourceEmail(input)

  const htmlPath = join(opts.fromDir, `${opts.profile}-lead-source-email.html`)
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
    console.error('[send-lead-source-report] --profile, --from and --store-name are required')
    process.exit(1)
  }
  if (args.send && args.to.length === 0) {
    console.error('[send-lead-source-report] --send requires --to')
    process.exit(1)
  }

  const out = await sendLeadSourceReport({
    profile: args.profile,
    fromDir: args.from,
    to: args.to,
    storeName: args.storeName,
    send: args.send,
  })

  console.log(`\n=== LEAD SOURCE REPORT EMAIL (${args.profile}) ===`)
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

if (process.argv[1] && /send-lead-source-report\.ts$/.test(process.argv[1])) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[send-lead-source-report] fatal:', err)
      process.exit(1)
    })
}
