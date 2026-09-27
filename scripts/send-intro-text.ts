#!/usr/bin/env npx tsx
/**
 * One-time intro text sender (N2.5 — Serra comms recovery).
 *
 * Sends the one-time introduction SMS from the store's AI agent to the managers,
 * telling them the daily wrap-up texts + new email reports are starting. DRY-RUN
 * by default: prints the exact SMS + recipients and sends NOTHING. --send
 * delivers one message per recipient through dispatchOutbound (CommGate +
 * pre-launch lock + comms_log), bypassBusinessHours:false. --send is refused when
 * --to is empty.
 *
 *   npx tsx scripts/send-intro-text.ts --profile serra-ford \
 *     --to +15551230000 --store-name "Tony Serra Ford" [--agent-name Georgia] [--send]
 */
import { readStudioConfig } from '../src/server/studio-config'
import { recordLeadNotify, wasLeadNotifiedWithin } from '../src/server/messaging-hub-store'
import { blastSms, type SmsSendFn, type BlastResult } from './sms-report-sender'
import { agentNameForProfile } from './send-daily-report'
import { resolveCellRecipients, resolveStoreName } from './report-recipients'

/** Dedup marker key for the one-time intro text (per profile, per cell). */
export function introMarkerKey(cell: string): string {
  return `intro-text:${cell}`
}

const USAGE = `send-intro-text.ts — one-time intro SMS from the store agent (DRY-RUN by default)

  --profile <p>         store profile (required)
  --to +1..,+1..        comma-separated E.164 recipients (default: comms.management_audience.cells)
  --store-name "<Name>" display store name used in the copy (default: comms.reports.store_name, else profile)
  --agent-name <name>   override the agent name (default: comms.agent_name, else
                        Georgia for Ford / Caroline otherwise)
  --force               resend even to cells that already got the intro (default:
                        one-time — each cell is introduced at most once)
  --send                actually text (else dry-run: print the SMS + recipients)
  --help                this message`

export type SendIntroDeps = {
  sender?: SmsSendFn
  /** Injected agent name from studio config (comms.agent_name) for tests. */
  configAgentName?: string | null
  /** One-time marker read: has this profile+cell already received the intro? */
  wasSent?: (profile: string, cell: string) => boolean
  /** One-time marker write: stamp a delivered intro for this profile+cell. */
  markSent?: (profile: string, cell: string) => void
}

/**
 * Resolve the agent name: an explicit --agent-name flag wins, else the store's
 * configured comms.agent_name, else the per-profile default (Georgia for Ford,
 * Caroline otherwise).
 */
export function resolveIntroAgentName(opts: {
  profile: string
  agentNameFlag?: string | null
  configAgentName?: string | null
}): string {
  if (opts.agentNameFlag && opts.agentNameFlag.trim()) return opts.agentNameFlag.trim()
  if (opts.configAgentName && opts.configAgentName.trim()) return opts.configAgentName.trim()
  return agentNameForProfile(opts.profile)
}

/** The exact one-time intro copy (numbers/no invented facts). */
export function buildIntroText(agentName: string, storeName: string): string {
  return (
    `Good morning! This is ${agentName} with ${storeName}. Starting today I'll be texting you a short end-of-day wrap-up ` +
    `with key numbers on the dealership, and you'll see some new reports in your email. Over the coming weeks ` +
    `you'll be able to chat with me here too. Have a great day and let's get 'em!`
  )
}

export async function sendIntroText(opts: {
  profile: string
  to: string[]
  storeName: string
  agentName?: string | null
  send: boolean
  /** Resend to cells that already received the intro (default false — one-time). */
  force?: boolean
  deps?: SendIntroDeps
}): Promise<{
  text: string
  agentName: string
  blast: BlastResult
  targets: string[]
  skipped: string[]
}> {
  const agentName = resolveIntroAgentName({
    profile: opts.profile,
    agentNameFlag: opts.agentName,
    configAgentName: opts.deps?.configAgentName,
  })
  const text = buildIntroText(agentName, opts.storeName)

  const wasSent =
    opts.deps?.wasSent ??
    ((profile: string, cell: string) =>
      wasLeadNotifiedWithin(profile, introMarkerKey(cell), Number.POSITIVE_INFINITY))
  const markSent =
    opts.deps?.markSent ??
    ((profile: string, cell: string) => recordLeadNotify(profile, introMarkerKey(cell)))

  // One-time: drop any cell already introduced unless --force.
  const targets = opts.force ? opts.to : opts.to.filter((c) => !wasSent(opts.profile, c))
  const skipped = opts.to.filter((c) => !targets.includes(c))

  const blast = await blastSms({
    profile: opts.profile,
    to: targets,
    text,
    send: opts.send,
    sender: opts.deps?.sender,
  })

  // Stamp the marker only for cells that actually went out (no error).
  if (blast.sent) {
    for (const r of blast.results) {
      if (r.result && !r.result.error) markSent(opts.profile, r.to)
    }
  }
  return { text, agentName, blast, targets, skipped }
}

type Args = {
  profile: string
  to: string[]
  storeName: string
  agentName: string
  send: boolean
  force: boolean
  help: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = { profile: '', to: [], storeName: '', agentName: '', send: false, force: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--send') a.send = true
    else if (t === '--force') a.force = true
    else if (t === '--help' || t === '-h') a.help = true
    else if (t === '--profile') a.profile = argv[++i]
    else if (t.startsWith('--profile=')) a.profile = t.slice('--profile='.length)
    else if (t === '--to') a.to = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    else if (t.startsWith('--to=')) a.to = t.slice('--to='.length).split(',').map((s) => s.trim()).filter(Boolean)
    else if (t === '--store-name') a.storeName = argv[++i]
    else if (t.startsWith('--store-name=')) a.storeName = t.slice('--store-name='.length)
    else if (t === '--agent-name') a.agentName = argv[++i]
    else if (t.startsWith('--agent-name=')) a.agentName = t.slice('--agent-name='.length)
  }
  return a
}

/** Best-effort read of comms.agent_name (not in the zod schema; read defensively). */
function configAgentNameFor(profile: string): string | null {
  try {
    const comms = readStudioConfig(profile).config.comms as { agent_name?: unknown } | undefined
    const name = comms?.agent_name
    return typeof name === 'string' && name.trim() ? name.trim() : null
  } catch {
    return null
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(USAGE)
    process.exit(0)
  }
  if (!args.profile) {
    console.error('[send-intro-text] --profile is required')
    process.exit(1)
  }
  const to = resolveCellRecipients(args.profile, args.to)
  const storeName = resolveStoreName(args.profile, args.storeName)
  if (args.send && to.length === 0) {
    console.error('[send-intro-text] --send requires --to or configured management cells (refusing to send to nobody)')
    process.exit(1)
  }

  const { text, agentName, blast, targets, skipped } = await sendIntroText({
    profile: args.profile,
    to,
    storeName,
    agentName: args.agentName || null,
    send: args.send,
    force: args.force,
    deps: { configAgentName: configAgentNameFor(args.profile) },
  })

  console.log(`\n=== ONE-TIME INTRO TEXT (${args.profile}, agent ${agentName}) ===`)
  console.log(`mode:       ${args.send ? 'SEND' : 'DRY-RUN (no sms)'}${args.force ? ' [--force]' : ''}`)
  console.log(`recipients: ${targets.length ? targets.join(', ') : '(none)'}`)
  if (skipped.length) console.log(`skipped:    ${skipped.join(', ')} (already introduced; use --force to resend)`)
  console.log(`\n--- SMS TEXT ---\n${text}\n`)
  if (blast.sent) {
    for (const r of blast.results) {
      console.log(`[send] ${r.to}: ${r.result?.status}${r.result?.error ? ` (${r.result.error})` : ''}`)
    }
  } else {
    console.log(`[dry-run] no sms sent. Re-run with --send (and --to) to deliver.`)
  }
}

if (process.argv[1] && /send-intro-text\.ts$/.test(process.argv[1])) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[send-intro-text] fatal:', err)
      process.exit(1)
    })
}
