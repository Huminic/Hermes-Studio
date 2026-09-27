#!/usr/bin/env npx tsx
/**
 * Text-message wrap-up sender (N2.4 — Serra comms recovery, ~19:00 delivery).
 *
 * Reads the agent-voice text report comms-preview.ts wrote
 * (<from>/<profile>-text-report.txt, or the -wrapup variant with --window wrapup)
 * and texts it to the store's managers. DRY-RUN by default: prints the exact SMS
 * + recipients and sends NOTHING. --send delivers one message per recipient
 * through dispatchOutbound (CommGate + pre-launch lock + comms_log all apply),
 * bypassBusinessHours:false. --send is refused when --to is empty.
 *
 *   npx tsx scripts/send-text-report.ts --profile serra-ford --from /tmp/preview \
 *     --to +15551230000,+15551230001 [--window wrapup] [--send]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { blastSms, type SmsSendFn, type BlastResult } from './sms-report-sender'
import { resolveCellRecipients } from './report-recipients'

const USAGE = `send-text-report.ts — text the agent-voice wrap-up report (DRY-RUN by default)

  --profile <p>     store profile (required)
  --from <dir>      directory written by comms-preview.ts (required)
  --to +1..,+1..    comma-separated E.164 recipients (default: comms.management_audience.cells)
  --window <w>      morning (default) reads <profile>-text-report.txt;
                    wrapup reads <profile>-wrapup-text-report.txt
  --send            actually text (else dry-run: print the SMS + recipients)
  --help            this message`

export type SendTextReportDeps = {
  readFile?: (path: string) => string
  sender?: SmsSendFn
}

/** Load the text-report body for the window (trailing whitespace trimmed). */
export function loadTextReport(
  fromDir: string,
  profile: string,
  window: 'morning' | 'wrapup',
  readFile: (path: string) => string,
): string {
  const name = window === 'wrapup' ? `${profile}-wrapup-text-report.txt` : `${profile}-text-report.txt`
  return readFile(join(fromDir, name)).replace(/\s+$/, '')
}

export async function sendTextReport(opts: {
  profile: string
  fromDir: string
  to: string[]
  window: 'morning' | 'wrapup'
  send: boolean
  deps?: SendTextReportDeps
}): Promise<{ text: string; blast: BlastResult }> {
  const readFile = opts.deps?.readFile ?? ((p: string) => readFileSync(p, 'utf8'))
  const text = loadTextReport(opts.fromDir, opts.profile, opts.window, readFile)
  const blast = await blastSms({
    profile: opts.profile,
    to: opts.to,
    text,
    send: opts.send,
    sender: opts.deps?.sender,
  })
  return { text, blast }
}

type Args = {
  profile: string
  from: string
  to: string[]
  window: 'morning' | 'wrapup'
  send: boolean
  help: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = { profile: '', from: '', to: [], window: 'morning', send: false, help: false }
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
    else if (t === '--window') a.window = argv[++i] === 'wrapup' ? 'wrapup' : 'morning'
    else if (t.startsWith('--window=')) a.window = t.slice('--window='.length) === 'wrapup' ? 'wrapup' : 'morning'
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
    console.error('[send-text-report] --profile and --from are required')
    process.exit(1)
  }
  const to = resolveCellRecipients(args.profile, args.to)
  if (args.send && to.length === 0) {
    console.error('[send-text-report] --send requires --to or configured management cells (refusing to send to nobody)')
    process.exit(1)
  }

  const { text, blast } = await sendTextReport({
    profile: args.profile,
    fromDir: args.from,
    to,
    window: args.window,
    send: args.send,
  })

  console.log(`\n=== TEXT WRAP-UP (${args.profile}, ${args.window}) ===`)
  console.log(`mode:       ${args.send ? 'SEND' : 'DRY-RUN (no sms)'}`)
  console.log(`recipients: ${to.length ? to.join(', ') : '(none)'}`)
  console.log(`\n--- SMS TEXT ---\n${text}\n`)
  if (blast.sent) {
    for (const r of blast.results) {
      console.log(`[send] ${r.to}: ${r.result?.status}${r.result?.error ? ` (${r.result.error})` : ''}`)
    }
  } else {
    console.log(`[dry-run] no sms sent. Re-run with --send (and --to) to deliver.`)
  }
}

if (process.argv[1] && /send-text-report\.ts$/.test(process.argv[1])) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[send-text-report] fatal:', err)
      process.exit(1)
    })
}
