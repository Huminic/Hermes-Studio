/**
 * Metric-alert dispatch. Given the fire/no-fire decisions from alert-engine, this
 * emails the configured recipient for each FIRING alert and stamps the 24h dedup.
 *
 * SAFETY (charter): real sending is OFF by default. dispatchFiringAlerts only sends
 * when `send: true` is passed explicitly (a scheduled tick sets it from an env gate);
 * otherwise it returns a DRY-RUN plan and sends nothing / stamps nothing. The alert
 * email goes to the dealer's own configured internal recipient — it is never a
 * customer-facing action. The sender is injected (defaults to the Resend-backed
 * sendNotification) so it is testable and swappable.
 */
import {
  sendNotification,
  type SendNotificationInput,
  type SendNotificationResult,
} from '../notifications'
import { markAlertFired, type NotificationRecord } from './notifications-store'
import { firingAlerts, type AlertDecision } from './alert-engine'

export type AlertSender = (input: SendNotificationInput) => Promise<SendNotificationResult>

/** Render the internal alert email. Plain, honest, and explicit that no action was taken. */
export function renderAlertEmail(
  alert: Pick<NotificationRecord, 'query_name' | 'description'>,
  message: string,
  dealer: string,
): { subject: string; html: string; text: string } {
  const subject = `Watchdog alert: ${alert.query_name}`
  const html =
    `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px">` +
    `<h2 style="margin:0 0 8px;font-size:18px">${alert.query_name}</h2>` +
    `<p style="margin:0 0 8px;font-size:15px">${message}</p>` +
    `<p style="margin:0 0 12px;color:#667">${alert.description}</p>` +
    `<hr style="border:none;border-top:1px solid #eee"/>` +
    `<p style="margin:12px 0 0;color:#889;font-size:12px">Automated Semantic Watchdog alert for ${dealer}. ` +
    `No action was taken on your behalf — this is a heads-up only.</p></div>`
  const text = `${alert.query_name}\n\n${message}\n\n${alert.description}\n\n` +
    `Automated Semantic Watchdog alert for ${dealer}. No action was taken — heads-up only.`
  return { subject, html, text }
}

export type DispatchResult = {
  alert_id: string
  metric_id: string | null
  to: string
  subject: string
  /** true = decided-but-not-sent (default safety); false = a real send was attempted. */
  dry_run: boolean
  sent: boolean
  error?: string
}

/**
 * Dispatch the firing alerts. DRY-RUN unless `send: true`. On a real successful send,
 * stamps last_fired_at (24h dedup). A failed send is NOT stamped (so it can retry).
 */
export async function dispatchFiringAlerts(
  profile: string,
  decisions: Array<AlertDecision>,
  opts: { now: number; dealer?: string; send?: boolean; sender?: AlertSender; profileRoot?: string },
): Promise<Array<DispatchResult>> {
  const dealer = opts.dealer ?? profile
  const out: Array<DispatchResult> = []
  for (const { alert, decision } of firingAlerts(decisions)) {
    const message = 'message' in decision ? decision.message : alert.description
    const email = renderAlertEmail(alert, message, dealer)
    const base = { alert_id: alert.id, metric_id: alert.metric_id, to: alert.email, subject: email.subject }

    if (opts.send !== true) {
      out.push({ ...base, dry_run: true, sent: false })
      continue
    }
    const sender = opts.sender ?? sendNotification
    const res = await sender({ to: alert.email, subject: email.subject, html: email.html, text: email.text })
    if (res.ok) markAlertFired(profile, alert.id, opts.now, { profileRoot: opts.profileRoot })
    out.push({ ...base, dry_run: false, sent: res.ok, ...(res.ok ? {} : { error: res.error }) })
  }
  return out
}
