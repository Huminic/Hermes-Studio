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
}

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
  try {
    const res = await fetch(central, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'resend_send_email',
          arguments: {
            to,
            from: senderName,
            subject,
            html: `<p>New lead from ${input.profile}. ADF XML attached.</p><pre>${escapeHtml(
              adfXml,
            )}</pre>`,
            text: adfXml,
            attachments: [
              {
                filename: `lead-${Date.now()}.adf.xml`,
                content: attachment,
              },
            ],
          },
        },
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
