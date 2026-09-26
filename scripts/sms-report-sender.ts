/**
 * Shared outbound-SMS core for the report/intro text senders (N2.4 / N2.5).
 *
 * The real sender routes through `dispatchOutbound` so EVERY guard applies:
 * CommGate (kill switch, business hours, blacklist, consent), the pre-launch
 * SAFE-TEST lock, and comms_log recording. `bypassBusinessHours` is false, so an
 * out-of-window send is blocked like any customer text. Callers inject a fake
 * sender in tests, so no test ever reaches a provider.
 */
import { dispatchOutbound } from '../src/server/messaging-adapters'
import type { Thread } from '../src/server/messaging-hub-store'

export type SmsSendResult = {
  status: string
  external_id?: string | null
  error?: string | null
  gate_rule?: string | null
}

export type SmsSendFn = (input: {
  profile: string
  to: string
  text: string
}) => Promise<SmsSendResult>

/**
 * Default sender: a real outbound SMS through dispatchOutbound (CommGate +
 * pre-launch lock + comms_log). One message per recipient; bypassBusinessHours
 * is false so quiet-hours blocking still applies.
 */
export const defaultSmsSender: SmsSendFn = async ({ profile, to, text }) => {
  const now = Date.now()
  const thread: Thread = {
    id: `report-sms:${to}`,
    profile,
    domain: 'comms',
    channel: 'sms',
    subject: 'Daily report',
    contact_handle: to,
    assigned_agent_id: null,
    status: 'open',
    created_at: now,
    updated_at: now,
    messages: [],
  }
  return dispatchOutbound({
    profile,
    channel: 'sms',
    thread,
    content: text,
    options: { bypassBusinessHours: false },
  })
}

export type BlastResult = {
  sent: boolean
  results: Array<{ to: string; result?: SmsSendResult }>
}

/**
 * Dry-run (default) prints nothing and NEVER calls the sender; --send delivers
 * one message per recipient with the EXACT text. Refusing an empty recipient
 * list on --send is the caller's responsibility (so it can exit non-zero).
 */
export async function blastSms(input: {
  profile: string
  to: string[]
  text: string
  send: boolean
  sender?: SmsSendFn
}): Promise<BlastResult> {
  if (!input.send) {
    return { sent: false, results: input.to.map((to) => ({ to })) }
  }
  const sender = input.sender ?? defaultSmsSender
  const results: Array<{ to: string; result?: SmsSendResult }> = []
  for (const to of input.to) {
    const result = await sender({ profile: input.profile, to, text: input.text })
    results.push({ to, result })
  }
  return { sent: true, results }
}
