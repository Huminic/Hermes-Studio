/**
 * Semantic Guardian — runtime hold + operator notify for autonomous replies.
 *
 * The Guardian's job is to make Caroline HOLD (route to a person) instead of
 * guessing. A reply is held when the model would assert a dealer fact — vehicle
 * inventory ("we have it / we can get it") or specs — that NO canonical wiki
 * node backs. It is then re-checked hourly and released the moment the operator
 * patches the knowledge (see comms-scheduler tickReplyHolds).
 *
 * Pricing is deliberately NOT a hold: agents never quote a price, so pricing is
 * handled by the pre-send suppression in agent-autonomous-reply (a safe human
 * deflection). Holding pricing would wait forever for a page that never exists.
 */
import { detectPersonaViolations } from './persona-compliance'
import { sendNotification } from './notifications'
import { dispatchOutbound } from './messaging-adapters'
import {
  markHoldNotified,
  type AgentReplyHold,
  type ReplyHoldReason,
  type Thread,
} from './messaging-hub-store'

const ALERT_EMAIL = process.env.SENTINEL_ALERT_EMAIL || 'duanekwells@gmail.com'
/** Operator mobile for hold alerts (best-effort). Must be reachable/allowlisted. */
const ALERT_SMS = process.env.GUARDIAN_ALERT_SMS || ''

/**
 * Decide whether a generated reply must be held. Called AFTER generation, BEFORE
 * send, with the grounding result and the model's text.
 */
export function evaluateGuardianHold(input: {
  grounded: boolean
  modelReply: string | null
}): { hold: boolean; reason?: ReplyHoldReason } {
  // Provider produced nothing → benign fallback path handles it (not a hold).
  if (!input.modelReply) return { hold: false }
  // Canonical knowledge backs the answer → allow (pricing still suppressed pre-send).
  if (input.grounded) return { hold: false }
  // No canonical backing: hold ONLY if the reply asserts a verifiable dealer
  // fact — inventory ("we have/can get it") or specs. Pricing is not held.
  const violations = detectPersonaViolations(input.modelReply)
  const assertsInventoryOrSpecs = violations.some(
    (v) => v.ruleClass === 'inventory' || v.ruleClass === 'specs',
  )
  return assertsInventoryOrSpecs
    ? { hold: true, reason: 'unbacked' }
    : { hold: false }
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;',
  )
}

/**
 * Alert the operator that Caroline held a reply for a knowledge gap. Email is
 * authoritative (Resend, ungated). SMS is best-effort to GUARDIAN_ALERT_SMS
 * (bypasses TCPA hours — it is an internal alert to the operator, not a customer
 * marketing message). Stamps notified_at so a hold is announced at most once.
 */
export async function notifyGuardianHold(input: {
  profile: string
  hold: AgentReplyHold
  contactHandle: string
  question: string
  now?: number
}): Promise<void> {
  const { profile, hold, contactHandle, question } = input
  if (hold.notified_at) return
  const now = input.now ?? Date.now()
  const subject = `[Guardian] ${profile}: Caroline held a reply — knowledge gap`
  const html = [
    `<p><strong>Caroline held an SMS reply</strong> — it needed a dealer fact that no <em>canonical</em> wiki node covers, so she did not guess.</p>`,
    `<ul>`,
    `<li><strong>Profile:</strong> ${esc(profile)}</li>`,
    `<li><strong>Agent:</strong> ${esc(hold.agent_id)}</li>`,
    `<li><strong>From:</strong> ${esc(contactHandle)}</li>`,
    `<li><strong>They asked:</strong> ${esc(question)}</li>`,
    `<li><strong>Reason:</strong> ${esc(hold.reason)}</li>`,
    `</ul>`,
    `<p>Patch the relevant wiki node (add/verify the fact, promote it to <code>canonical</code>). The reply then releases automatically within the hour, inside the legal window.</p>`,
  ].join('')
  try {
    await sendNotification({
      to: ALERT_EMAIL.split(',').map((s) => s.trim()),
      subject,
      html,
    })
  } catch {
    // email best-effort; never throw from the reply path
  }
  if (ALERT_SMS) {
    try {
      await dispatchOutbound({
        profile,
        channel: 'sms',
        thread: { contact_handle: ALERT_SMS } as unknown as Thread,
        content: `Caroline held a reply (${profile}): "${question.slice(0, 90)}" — patch the wiki node to release.`,
        options: { bypassBusinessHours: true },
      })
    } catch {
      // SMS best-effort
    }
  }
  markHoldNotified(profile, hold.id, now)
}

/** Escalation alert when a hold has gone unresolved past the escalation window. */
export async function escalateGuardianHold(input: {
  profile: string
  hold: AgentReplyHold
  contactHandle: string
  question: string
  ageHours: number
}): Promise<void> {
  const { profile, hold, contactHandle, question, ageHours } = input
  const subject = `[Guardian] ${profile}: reply STILL held after ${Math.round(ageHours)}h`
  const html = [
    `<p><strong>A held reply has gone unanswered for ${Math.round(ageHours)} hours.</strong> The customer is still waiting.</p>`,
    `<ul>`,
    `<li><strong>From:</strong> ${esc(contactHandle)}</li>`,
    `<li><strong>They asked:</strong> ${esc(question)}</li>`,
    `<li><strong>Agent:</strong> ${esc(hold.agent_id)}</li>`,
    `</ul>`,
    `<p>Patch the wiki node to release automatically, or reply by hand from the Teambox.</p>`,
  ].join('')
  try {
    await sendNotification({
      to: ALERT_EMAIL.split(',').map((s) => s.trim()),
      subject,
      html,
    })
  } catch {
    // best-effort
  }
}
