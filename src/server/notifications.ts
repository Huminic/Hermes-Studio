/**
 * System-wide notification helper.
 *
 * Sends transactional / notification email through central-mcp's Resend
 * provider. Used by Studio for auth flows (password reset, invite), system
 * alerts, and any admin-side notification.
 *
 * Customer-facing outbound email is sent by per-profile Hermes runtime
 * agents calling the same central-mcp tool through their mcp.json wiring —
 * not through this helper.
 *
 * See docs/system-services-resend.md for the architecture.
 */

const CENTRAL_MCP_URL =
  process.env.CENTRAL_MCP_URL || 'http://localhost:4002/mcp'
const STUDIO_SENDER = 'Huminic Studio <notifications@huminic.ai>'

export type SendNotificationInput = {
  to: string | Array<string>
  subject: string
  html: string
  text?: string
  cc?: Array<string>
  bcc?: Array<string>
  /** Override the from line. Defaults to Huminic Studio. */
  from?: string
}

export type SendNotificationResult =
  | { ok: true; email_id: string }
  | { ok: false; error: string }

export async function sendNotification(
  input: SendNotificationInput,
): Promise<SendNotificationResult> {
  const token = process.env.CENTRAL_MCP_STUDIO_TOKEN
  if (!token) {
    return {
      ok: false,
      error:
        'CENTRAL_MCP_STUDIO_TOKEN not configured. Add a "studio" token in central-mcp config and set this env var.',
    }
  }

  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'resend_send_email',
      arguments: {
        from: input.from ?? STUDIO_SENDER,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.cc ? { cc: input.cc } : {}),
        ...(input.bcc ? { bcc: input.bcc } : {}),
      },
    },
  }

  try {
    const response = await fetch(CENTRAL_MCP_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(payload),
    })

    const text = await response.text()
    const sseMatch = text.match(/data:\s*(\{.*\})/)
    const jsonText = sseMatch ? sseMatch[1] : text
    const parsed = JSON.parse(jsonText) as {
      result?: { content?: Array<{ text?: string }>; isError?: boolean }
      error?: { message?: string }
    }

    if (parsed.error) {
      return { ok: false, error: parsed.error.message ?? 'unknown MCP error' }
    }
    if (parsed.result?.isError) {
      const message =
        parsed.result.content?.[0]?.text ?? 'Resend reported an error'
      return { ok: false, error: message }
    }

    const resultText = parsed.result?.content?.[0]?.text ?? ''
    const idMatch = resultText.match(/"id"\s*:\s*"([^"]+)"/)
    return {
      ok: true,
      email_id: idMatch ? idMatch[1] : '',
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Build the display-name + email for a customer-facing sender. Reads from
 * the profile's studio.yaml branding.persona_name once that's wired (Phase 5);
 * for now the caller passes the brand name explicitly.
 */
export function senderForCustomer(brand: string): string {
  return `${brand} via Huminic <notifications@huminic.ai>`
}
