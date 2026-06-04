/**
 * Per-profile lead notification dispatcher.
 *
 * When a channel adapter (Vapi end-of-call, ADF email inbound, widget
 * form) creates a lead-shaped thread, this module:
 *   1. Reads the profile's studio.yaml `lead_notifications` block.
 *   2. Emits an ADF-XML email to `adf_email` via central-mcp Resend.
 *   3. Records the dispatch in messaging-hub thread metadata.
 *
 * No central-mcp token → no-op (returns `{ ok: false, reason: 'unconfigured' }`).
 * That keeps cutover dry-runs safe; the operator only flips destinations
 * on per profile after they've verified the test flow.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildAdfXml, type AdfLead } from './adf-xml'
import { readStudioConfig } from './studio-config'

export type LeadNotificationResult = {
  ok: boolean
  via: 'resend' | 'unconfigured' | 'failed'
  reason?: string
  external_id?: string | null
  /** Format actually emitted (set by notifyDealer). */
  format?: 'adf-xml' | 'email'
}

// ---------------------------------------------------------------------------
// BRAND CONSTANTS — brand-flip points (Nexxus → Huminic) for later.
//
// These default to the CURRENT Nexxus production values so the email Studio
// sends is byte-for-byte the same look as what Nexxus sends today. When the
// brand flips, change these four (and the from-name) in one place; the render
// structure stays identical.
//   - notificationService.ts shared HTML template footer:
//       "Powered by Nexxus AI Platform", support@huminic.ai
//   - webhooks.ts lead email gradient: #667eea → #764ba2 (voice lead)
//   - webhooks.ts ADF email: from 'Nexxus Connect <leads@huminic.ai>'
// ---------------------------------------------------------------------------

/** ADF lead email from-address (matches webhooks.ts Serra/DMS feed). */
const BRAND_ADF_FROM = 'Nexxus Connect <leads@huminic.ai>'
/** Footer "Powered by …" line (matches notificationService.ts template). */
const BRAND_PLATFORM_NAME = 'Nexxus AI Platform'
/** Footer support contact (matches SUPPORT_EMAIL default). */
const BRAND_SUPPORT_EMAIL = 'support@huminic.ai'
/** Card header gradient (matches the voice-lead gradient in webhooks.ts). */
const BRAND_GRADIENT_START = '#667eea'
const BRAND_GRADIENT_END = '#764ba2'
/** Target-icon emoji entity (matches the voice-lead headerEmoji). */
const BRAND_HEADER_EMOJI = '&#127919;'

function readEnvFromProfile(profile: string): Record<string, string> {
  const file = path.join(
    os.homedir(),
    '.hermes',
    'profiles',
    profile,
    '.env',
  )
  const env: Record<string, string> = {}
  try {
    const raw = fs.readFileSync(file, 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
  } catch {
    // missing per-profile env is fine
  }
  return env
}

export async function emitLeadAdfEmail(input: {
  profile: string
  lead: AdfLead
  subjectPrefix?: string
  forceTo?: string
}): Promise<LeadNotificationResult> {
  const { config } = readStudioConfig(input.profile)
  const settings = config.lead_notifications
  const to = input.forceTo ?? settings.adf_email
  if (!to) {
    return { ok: false, via: 'unconfigured', reason: 'no adf_email in studio.yaml' }
  }
  const env = readEnvFromProfile(input.profile)
  const tokenVar = settings.resend_token_var ?? 'CENTRAL_MCP_TOKEN'
  const token = env[tokenVar] ?? process.env[tokenVar] ?? null
  const central =
    env.CENTRAL_MCP_URL ?? process.env.CENTRAL_MCP_URL ?? 'http://localhost:4002/mcp'
  if (!token) {
    return {
      ok: false,
      via: 'unconfigured',
      reason: `central-mcp token not set (var=${tokenVar})`,
    }
  }
  const senderName = settings.sender_name ?? `${input.profile} new lead`
  const adfXml = buildAdfXml(input.lead)
  const subject = `${input.subjectPrefix ?? 'New lead'} — ${input.lead.customer.full_name ?? input.lead.customer.email ?? input.lead.customer.phone ?? input.profile}`
  // Resend accepts attachments as `[{ filename, content: base64 }]`.
  const attachment = Buffer.from(adfXml, 'utf8').toString('base64')
  return sendViaResend({
    central,
    token,
    to,
    from: senderName,
    subject,
    html: `<p>New lead from ${input.profile}. ADF XML attached.</p><pre>${escapeHtml(
      adfXml,
    )}</pre>`,
    text: adfXml,
    attachments: [{ filename: `lead-${Date.now()}.adf.xml`, content: attachment }],
  })
}

/**
 * Low-level central-mcp `resend_send_email` call. Parses the SSE-framed
 * JSON-RPC response for the email id. Never throws — network/HTTP errors
 * come back as `{ ok: false, via: 'failed', reason }`.
 */
async function sendViaResend(input: {
  central: string
  token: string
  to: string
  from: string
  subject: string
  html: string
  text: string
  attachments?: Array<{ filename: string; content: string }>
}): Promise<LeadNotificationResult> {
  try {
    const args: Record<string, unknown> = {
      to: input.to,
      from: input.from,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }
    if (input.attachments && input.attachments.length > 0) {
      args.attachments = input.attachments
    }
    const res = await fetch(input.central, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'resend_send_email', arguments: args },
      }),
    })
    const responseText = await res.text()
    if (!res.ok) {
      return {
        ok: false,
        via: 'failed',
        reason: `HTTP ${res.status} ${responseText.slice(0, 200)}`,
      }
    }
    const dataMatch = responseText.match(/data: ({[\s\S]*?})\n/)
    let emailId: string | null = null
    if (dataMatch) {
      try {
        const obj = JSON.parse(dataMatch[1]) as {
          result?: { content?: Array<{ text?: string }> }
        }
        const inner = obj.result?.content?.[0]?.text
        if (inner) {
          const innerObj = JSON.parse(inner) as { id?: string }
          emailId = innerObj.id ?? null
        }
      } catch {
        // ignore parse — we still report sent
      }
    }
    return { ok: true, via: 'resend', external_id: emailId }
  } catch (err) {
    return {
      ok: false,
      via: 'failed',
      reason: err instanceof Error ? err.message : 'network error',
    }
  }
}

/**
 * Render the styled HTML notification card — ports the shared Nexxus template
 * (notificationService.ts generateNotificationEmailHTML): a 600px-max white
 * card on #f5f5f5, a gradient header showing the org name + a title, a summary
 * paragraph, an optional highlight box, a label/value details grid, and a
 * footer ("Questions or issues? … / Powered by … Platform"). System font stack.
 *
 * Colors, footer platform name, and support email come from the BRAND_*
 * constants above so the look matches current Nexxus output exactly.
 */
function renderLeadCardHtml(input: {
  orgName: string
  headerTitle: string
  summaryText: string
  highlightBox?: { label: string; content: string } | null
  details: Array<{ label: string; value: string }>
  footerNote?: string
}): string {
  const accentColor = BRAND_GRADIENT_START

  const highlightBlock = input.highlightBox
    ? `
          <tr>
            <td style="padding: 0 40px 20px;">
              <div style="background: #f8f9fa; border-left: 4px solid ${accentColor}; padding: 16px 20px; border-radius: 4px;">
                <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">
                  ${input.highlightBox.label}
                </h3>
                <p style="margin: 0; font-size: 15px; color: #333; line-height: 1.6;">
                  ${input.highlightBox.content}
                </p>
              </div>
            </td>
          </tr>`
    : ''

  const detailRows = input.details
    .map((d, i) => {
      const widthAttr = i === 0 ? ' width: 40%;' : ''
      return `
                <tr>
                  <td style="padding: 8px 0; font-size: 14px; color: #666;${widthAttr}">${d.label}:</td>
                  <td style="padding: 8px 0; font-size: 14px; color: #333; font-weight: 500;">${d.value}</td>
                </tr>`
    })
    .join('')

  const footerNoteBlock = input.footerNote
    ? `
          <tr>
            <td style="padding: 0 40px 30px;">
              <div style="background: #f8f9fa; border-radius: 6px; padding: 14px 18px;">
                <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.5;">
                  ${input.footerNote}
                </p>
              </div>
            </td>
          </tr>`
    : ''

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${input.headerTitle}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header with gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, ${BRAND_GRADIENT_START} 0%, ${BRAND_GRADIENT_END} 100%); padding: 30px 40px; text-align: center;">
              <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600;">
                ${BRAND_HEADER_EMOJI} ${escapeHtml(input.orgName)}
              </h1>
              <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">
                ${input.headerTitle}
              </p>
            </td>
          </tr>

          <!-- Intro / Summary Section -->
          <tr>
            <td style="padding: 30px 40px 20px;">
              <p style="margin: 0; font-size: 16px; color: #333; line-height: 1.5;">
                ${input.summaryText}
              </p>
            </td>
          </tr>

          <!-- Highlight Box (message preview) -->
          ${highlightBlock}

          <!-- Details Grid -->
          <tr>
            <td style="padding: 0 40px 30px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                ${detailRows}
              </table>
            </td>
          </tr>

          <!-- Footer Note -->
          ${footerNoteBlock}

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 30px; border-top: 1px solid #e9ecef;">
              <p style="margin: 0; font-size: 12px; color: #666; line-height: 1.5;">
                <strong>Questions or issues?</strong> Contact <a href="mailto:${BRAND_SUPPORT_EMAIL}" style="color: ${accentColor}; text-decoration: none;">${BRAND_SUPPORT_EMAIL}</a>
              </p>
              <p style="margin: 15px 0 0 0; font-size: 11px; color: #999;">
                Powered by ${BRAND_PLATFORM_NAME}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

/** Collect the present lead facts as [label, value] rows (shared HTML/text). */
function leadDetailRows(lead: AdfLead): Array<{ label: string; value: string }> {
  const vehicle =
    lead.vehicles
      .map((v) => [v.year, v.make, v.model, v.trim].filter(Boolean).join(' '))
      .filter(Boolean)
      .join(', ') || undefined
  const rows: Array<[string, string | undefined]> = [
    ['Name', lead.customer.full_name],
    ['Phone', lead.customer.phone],
    ['Email', lead.customer.email],
    ['Vehicle', vehicle],
    ['Notes', lead.comments],
    ['Source', lead.vendor?.name],
    ['Received', lead.request_date],
  ]
  return rows
    .filter(([, v]) => v && v.trim())
    .map(([label, value]) => ({ label, value: value as string }))
}

/**
 * Pure dealer-notification renderer (no I/O) — exported so it can be unit
 * tested AND rendered for a live preview. `notifyDealer` calls this and then
 * hands the result to resend.
 *
 *   - format 'email'   → styled HTML card (matches Nexxus notificationService
 *                        template) + a plain-text fallback. No attachment.
 *   - format 'adf-xml' → subject `New Lead - {first} {last}`, ADF XML as the
 *                        plain-text body (what the DMS ingests) matching the
 *                        Nexxus webhooks.ts feed. ADF is also attached.
 */
export function renderDealerNotificationEmail(input: {
  format: 'adf-xml' | 'email'
  lead: AdfLead
  /** Display org name for the card header (persona_name / dealer name). */
  orgName: string
  /** Subject prefix for the 'email' format card (default "New lead"). */
  subjectPrefix?: string
}): {
  subject: string
  html?: string
  text: string
  /** ADF attachment (adf-xml format only). */
  attachments?: Array<{ filename: string; content: string }>
} {
  const lead = input.lead
  const first = lead.customer.first_name ?? ''
  const last = lead.customer.last_name ?? ''
  const fallbackName =
    lead.customer.full_name ??
    ([first, last].filter(Boolean).join(' ') ||
      lead.customer.email ||
      lead.customer.phone ||
      input.orgName)

  if (input.format === 'adf-xml') {
    // Match Nexxus: subject "New Lead - First Last", ADF XML as the text/plain
    // body (what the DMS ingests) + a .adf.xml attachment. The central-mcp
    // resend_send_email tool REQUIRES an html field, so we ALSO provide a
    // <pre>-wrapped, escaped copy for human readability — the text/plain part
    // stays the raw ADF for DMS parsing.
    const adfXml = buildAdfXml(lead)
    const subject = `New Lead - ${[first, last].filter(Boolean).join(' ').trim() || fallbackName}`
    const attachment = Buffer.from(adfXml, 'utf8').toString('base64')
    const html = `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.4;">${escapeHtml(
      adfXml,
    )}</pre>`
    return {
      subject,
      html,
      text: adfXml,
      attachments: [
        { filename: `lead-${Date.now()}.adf.xml`, content: attachment },
      ],
    }
  }

  // 'email' → styled HTML card.
  const details = leadDetailRows(lead)
  const who = lead.customer.full_name ?? fallbackName
  const subject = `${input.subjectPrefix ?? 'New lead'} — ${who}`
  const html = renderLeadCardHtml({
    orgName: input.orgName,
    headerTitle: 'Has a New Lead!',
    summaryText: `A new lead just came in for <strong>${escapeHtml(
      input.orgName,
    )}</strong>. Here are the details:`,
    details: details.map((d) => ({
      label: d.label,
      value: escapeHtml(d.value),
    })),
    footerNote:
      'Reply promptly to keep the lead warm. This notification was generated automatically.',
  })
  const text = [
    `New lead — ${input.orgName}`,
    '',
    ...details.map((d) => `${d.label}: ${d.value}`),
  ].join('\n')
  return { subject, html, text }
}

/**
 * Dealer-facing (INTERNAL) lead notification — WS-4. Reads the profile's
 * `notifications.lead_format` + `lead_recipient`:
 *   - `adf-xml` → structured ADF-XML body (reuse buildAdfXml) + .adf.xml
 *     attachment, for DMS/CRM ingestion (Serra stores).
 *   - `email`   → plain readable email body (Columbia stores).
 * Recipient resolves from `notifications.lead_recipient`, falling back to the
 * legacy `lead_notifications.adf_email`. Unconfigured recipient OR no central
 * token → `{ ok: false, via: 'unconfigured' }` (logged, never throws). This is
 * distinct from the customer-facing follow-up SMS (WS-2).
 */
export async function notifyDealer(input: {
  profile: string
  event: AdfLead
  subjectPrefix?: string
  /** Override the resolved recipient (testing / one-off). */
  forceTo?: string
}): Promise<LeadNotificationResult> {
  const { config } = readStudioConfig(input.profile)
  const notif = config.notifications
  const format = notif.lead_format ?? 'email'
  const to =
    input.forceTo ??
    notif.lead_recipient ??
    config.lead_notifications.adf_email
  if (!to) {
    const reason = `no notifications.lead_recipient (or lead_notifications.adf_email) in studio.yaml for ${input.profile}`
    console.warn(`[notifyDealer] unconfigured: ${reason}`)
    return { ok: false, via: 'unconfigured', reason, format }
  }
  const env = readEnvFromProfile(input.profile)
  const tokenVar =
    config.lead_notifications.resend_token_var ?? 'CENTRAL_MCP_TOKEN'
  const token = env[tokenVar] ?? process.env[tokenVar] ?? null
  const central =
    env.CENTRAL_MCP_URL ??
    process.env.CENTRAL_MCP_URL ??
    'http://localhost:4002/mcp'
  if (!token) {
    const reason = `central-mcp token not set (var=${tokenVar})`
    console.warn(`[notifyDealer] unconfigured: ${reason}`)
    return { ok: false, via: 'unconfigured', reason, format }
  }
  // Org name for the card header / text — prefer the configured persona name,
  // fall back to the profile slug.
  const orgName = config.branding?.persona_name ?? input.profile

  const rendered = renderDealerNotificationEmail({
    format,
    lead: input.event,
    orgName,
    subjectPrefix: input.subjectPrefix,
  })

  // ADF feed uses the fixed brand from-address the DMS expects; the styled
  // card uses the per-profile sender name (or a profile-derived default).
  const from =
    format === 'adf-xml'
      ? BRAND_ADF_FROM
      : config.lead_notifications.sender_name ?? `${input.profile} new lead`

  const result = await sendViaResend({
    central,
    token,
    to,
    from,
    subject: rendered.subject,
    // ADF format has no HTML card — the body the DMS reads is the ADF text.
    html: rendered.html ?? rendered.text,
    text: rendered.text,
    attachments: rendered.attachments,
  })
  return { ...result, format }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
