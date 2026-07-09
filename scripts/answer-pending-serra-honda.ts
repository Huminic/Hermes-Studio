#!/usr/bin/env tsx
/**
 * Answer the real inbound SMS replies that arrived while autonomous_reply was
 * OFF (last night's campaign responders + any new ones). For each serra-honda
 * SMS thread whose LATEST message is an unanswered inbound and whose contact is
 * not opted out, subscribe Caroline and run the autonomous reply — which grounds
 * on the canonical wiki, holds anything unbacked, and sends through the gate.
 *
 *   --dry-run   PREVIEW only: ground + generate + show the reply (and whether it
 *               would HOLD), WITHOUT sending or writing anything.
 *   (no flag)   LIVE: actually process + send (gated by CommGate as normal).
 *
 * Run inside the deployed container so it uses the live env (OUTBOUND_LIVE_ENABLED,
 * SMS creds) and the shared messaging-hub.db.
 */
import {
  listThreads,
  getThread,
  subscribeAgentToThread,
  listSubscriptionsForThread,
} from '../src/server/messaging-hub-store'
import {
  maybeAutonomousReply,
  groundAndGenerateReply,
} from '../src/server/agent-autonomous-reply'
import { evaluateGuardianHold } from '../src/server/semantic-guardian'
import { isBlacklisted } from '../src/server/comms-blacklist'
import { isHumanAssigned } from '../src/server/thread-takeover'

const PROFILE = 'serra-honda'
const AGENT = 'caroline'
const SINCE_MS = 72 * 60 * 60 * 1000 // consider inbound from the last 72h

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const now = Date.now()
  const threads = listThreads({ profile: PROFILE, limit: 1000 })
  let considered = 0
  for (const t of threads) {
    const full = getThread(PROFILE, t.id)
    if (!full || full.channel !== 'sms') continue
    const msgs = full.messages
    const last = msgs[msgs.length - 1]
    if (!last || last.direction !== 'inbound') continue // already answered / not inbound
    if ((last.created_at ?? now) < now - SINCE_MS) continue // too old
    if (isBlacklisted(PROFILE, full.contact_handle)) {
      console.log(`SKIP opt-out   ${full.contact_handle}`)
      continue
    }
    if (isHumanAssigned(PROFILE, t.id)) {
      console.log(`SKIP human     ${full.contact_handle}`)
      continue
    }
    considered++
    const inboundText = String(last.content ?? '').replace(/\s+/g, ' ').slice(0, 80)

    if (dryRun) {
      const gen = await groundAndGenerateReply({
        profile: PROFILE,
        thread: full,
        inbound: last,
        agentId: AGENT,
      })
      const hold = evaluateGuardianHold({ grounded: gen.grounded, modelReply: gen.modelReply })
      const verdict = hold.hold
        ? `HOLD(${hold.reason})`
        : gen.replyText
          ? `SEND via=${gen.via} grounded=${gen.grounded}`
          : 'FALLBACK'
      console.log(
        `\n[${verdict}] ${full.contact_handle}  in="${inboundText}"\n   sources=${JSON.stringify(gen.sources)}\n   reply="${(hold.hold ? '(held — operator alerted, no send)' : gen.replyText ?? '').slice(0, 240)}"`,
      )
      continue
    }

    // LIVE: ensure subscription, then run the real gated reply path.
    const subs = listSubscriptionsForThread(PROFILE, t.id)
    if (!subs.some((s) => s.agent_id === AGENT && s.mode === 'reply')) {
      subscribeAgentToThread({
        thread_id: t.id,
        agent_id: AGENT,
        profile: PROFILE,
        channel: 'sms',
        mode: 'reply',
        rules: {},
        created_at: now,
      })
    }
    const res = await maybeAutonomousReply({
      profile: PROFILE,
      threadId: t.id,
      inboundMessageId: last.id,
    })
    console.log(`${full.contact_handle}  in="${inboundText}"  -> ${JSON.stringify(res)}`)
  }
  console.log(`\n${dryRun ? 'PREVIEW' : 'LIVE'}: ${considered} pending thread(s) processed.`)
}

void main()
