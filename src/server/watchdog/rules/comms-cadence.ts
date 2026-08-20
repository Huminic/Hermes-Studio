/**
 * Communication cadence rules (catalog Part 1.A) — runnable now over Teambox.
 * All availability-gated on `teambox`; skip silently when a store has no comms.
 * Customer identities are masked (…last4) — privacy per the design language.
 */
import { afterHours } from '../../cockpit/cockpit-window'
import type { RuleContext, WatchdogFinding, WatchdogRule } from '../watchdog-types'

const HOUR = 3_600_000
const HOT_RE =
  /payment|financ|apr|credit|down\s?payment|deliver|trade|out.the.door|\botd\b|monthly|approv/i

function maskHandle(h: string | null): string {
  if (!h) return 'a customer'
  const digits = h.replace(/\D/g, '')
  return digits.length >= 4 ? `…${digits.slice(-4)}` : 'a customer'
}

function hasTeambox(ctx: RuleContext): boolean {
  return !!ctx.hub && ctx.hub.threads.length > 0
}

type Msg = { direction: 'inbound' | 'outbound'; created_at: number; content?: string | null }

function sortedMsgs(ctx: RuleContext, threadId: string): Array<Msg> {
  const msgs = ctx.hub?.messagesByThread.get(threadId) ?? []
  return [...msgs].sort((a, b) => a.created_at - b.created_at)
}

/** A customer's last message has gone unanswered > 4 business hours. */
export const customerWaitingRule: WatchdogRule = {
  id: 'comms.customer-waiting',
  category: 'Leads',
  title: 'Customer waiting on a reply',
  description:
    'A customer’s last message has gone unanswered for more than 4 hours during business hours, in an active conversation.',
  requiredInputs: ['teambox'],
  isAvailable: hasTeambox,
  run: (ctx) => {
    const out: Array<WatchdogFinding> = []
    if (!ctx.hub) return out
    // don't alarm overnight — the rep hasn't had business time yet
    if (afterHours(ctx.now, ctx.businessHours)) return out
    for (const t of ctx.hub.threads) {
      const msgs = sortedMsgs(ctx, t.id)
      const last = msgs[msgs.length - 1]
      if (!last || last.direction !== 'inbound') continue
      const ageH = (ctx.now - last.created_at) / HOUR
      if (ageH < 4) continue
      const priority = ageH >= 24 ? 'high' : ageH >= 8 ? 'medium' : 'low'
      out.push({
        key: `${customerWaitingRule.id}:${t.id}`,
        profile: ctx.profile,
        rule_id: customerWaitingRule.id,
        category: 'Leads',
        priority,
        issue: 'Customer waiting on a reply',
        name: maskHandle(t.contact_handle),
        details: `This customer’s last message has gone unanswered for about ${Math.round(ageH)} hours. A quick reply may keep the conversation alive.`,
        evidence: { thread_id: t.id, hours_waiting: Math.round(ageH), channel: t.channel },
      })
    }
    return out
  },
}

/** The customer has sent 2+ messages in a row without a reply (chasing us). */
export const customerChasingRule: WatchdogRule = {
  id: 'comms.customer-chasing',
  category: 'Leads',
  title: 'Customer chasing the rep',
  description:
    'The customer has sent two or more messages in a row with no reply in between — they are chasing us.',
  requiredInputs: ['teambox'],
  isAvailable: hasTeambox,
  run: (ctx) => {
    const out: Array<WatchdogFinding> = []
    if (!ctx.hub) return out
    for (const t of ctx.hub.threads) {
      const msgs = sortedMsgs(ctx, t.id)
      let trailing = 0
      for (let i = msgs.length - 1; i >= 0 && msgs[i].direction === 'inbound'; i--) trailing++
      if (trailing < 2) continue
      out.push({
        key: `${customerChasingRule.id}:${t.id}`,
        profile: ctx.profile,
        rule_id: customerChasingRule.id,
        category: 'Leads',
        priority: trailing >= 3 ? 'high' : 'medium',
        issue: 'Customer chasing the rep',
        name: maskHandle(t.contact_handle),
        details: `The customer has sent ${trailing} messages in a row without a reply.`,
        evidence: { thread_id: t.id, consecutive_inbound: trailing },
      })
    }
    return out
  },
}

/** Thread quiet > 72h after the customer raised a buying signal. */
export const silentAfterHotRule: WatchdogRule = {
  id: 'comms.silent-after-hot',
  category: 'Sales',
  title: 'Silent after a buying signal',
  description:
    'A conversation went quiet for more than 72 hours after the customer raised a high-intent topic (payment, financing, delivery).',
  requiredInputs: ['teambox'],
  isAvailable: hasTeambox,
  run: (ctx) => {
    const out: Array<WatchdogFinding> = []
    if (!ctx.hub) return out
    for (const t of ctx.hub.threads) {
      const msgs = sortedMsgs(ctx, t.id)
      if (!msgs.length) continue
      const hot = msgs.some((m) => m.direction === 'inbound' && HOT_RE.test(m.content ?? ''))
      if (!hot) continue
      const last = msgs[msgs.length - 1]
      const quietH = (ctx.now - last.created_at) / HOUR
      if (quietH < 72) continue
      out.push({
        key: `${silentAfterHotRule.id}:${t.id}`,
        profile: ctx.profile,
        rule_id: silentAfterHotRule.id,
        category: 'Sales',
        priority: 'high',
        issue: 'Silent after a buying signal',
        name: maskHandle(t.contact_handle),
        details: `This customer raised a buying topic, and the thread has been quiet for about ${Math.round(quietH / 24)} days. Worth a nudge.`,
        evidence: { thread_id: t.id, quiet_hours: Math.round(quietH) },
      })
    }
    return out
  },
}

export const COMMS_CADENCE_RULES: Array<WatchdogRule> = [
  customerWaitingRule,
  customerChasingRule,
  silentAfterHotRule,
]
