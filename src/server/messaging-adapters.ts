/**
 * Channel adapter dispatch surface.
 *
 * AC.6.x — When credentials are present in the profile env, an outbound
 * message routes through the matching channel adapter (TextMagic / Vapi /
 * Tavus / email). When credentials are missing, the adapter returns
 * status:'unconfigured' and the messaging hub records the outbound as a
 * local-only record so the inbox surface still reflects the action.
 *
 * Adapter wiring details (C.6) live alongside this file. The actual
 * BasePlatformAdapter Python classes ship via Hermes profile-distribution
 * — this is the Studio-side bridge that dials the right transport per
 * outbound.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Thread } from './messaging-hub-store'

type AdapterStatus = 'sent' | 'unconfigured' | 'failed' | 'simulated'

export type AdapterResult = {
  status: AdapterStatus
  via: string
  external_id?: string | null
  error?: string | null
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

async function dispatchTextMagic(
  profile: string,
  thread: Thread,
  content: string,
): Promise<AdapterResult> {
  const env = readEnvFromProfile(profile)
  const apiKey = env.TEXTMAGIC_API_KEY ?? process.env.TEXTMAGIC_API_KEY
  const username = env.TEXTMAGIC_USERNAME ?? process.env.TEXTMAGIC_USERNAME
  const from = env.TEXTMAGIC_FROM ?? process.env.TEXTMAGIC_FROM
  const to = thread.contact_handle
  if (!apiKey || !username || !from) {
    return { status: 'unconfigured', via: 'textmagic' }
  }
  try {
    const res = await fetch('https://rest.textmagic.com/api/v2/messages', {
      method: 'POST',
      headers: {
        'X-TM-Username': username,
        'X-TM-Key': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ text: content, phones: to, from }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      id?: number
      message?: string
    }
    if (!res.ok) {
      return {
        status: 'failed',
        via: 'textmagic',
        error: data.message ?? `HTTP ${res.status}`,
      }
    }
    return {
      status: 'sent',
      via: 'textmagic',
      external_id: data.id ? String(data.id) : null,
    }
  } catch (err) {
    return {
      status: 'failed',
      via: 'textmagic',
      error: err instanceof Error ? err.message : 'network error',
    }
  }
}

async function dispatchVapi(
  profile: string,
  thread: Thread,
  content: string,
): Promise<AdapterResult> {
  const env = readEnvFromProfile(profile)
  const key = env.VAPI_API_KEY ?? process.env.VAPI_API_KEY
  if (!key) {
    return { status: 'unconfigured', via: 'vapi' }
  }
  // Vapi outbound is a dial action; the actual "message" carrier is the
  // assistant's initial_message override. The bridge submits a call
  // request and returns the resulting call id. Full integration lands in
  // AC.6.2; this scaffold confirms the credential path.
  try {
    const res = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        customer: { number: thread.contact_handle },
        assistantOverrides: { firstMessage: content.slice(0, 400) },
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      id?: string
      message?: string
    }
    if (!res.ok) {
      return {
        status: 'failed',
        via: 'vapi',
        error: data.message ?? `HTTP ${res.status}`,
      }
    }
    return { status: 'sent', via: 'vapi', external_id: data.id ?? null }
  } catch (err) {
    return {
      status: 'failed',
      via: 'vapi',
      error: err instanceof Error ? err.message : 'network error',
    }
  }
}

async function dispatchTavus(
  profile: string,
  thread: Thread,
  content: string,
): Promise<AdapterResult> {
  const env = readEnvFromProfile(profile)
  const key = env.TAVUS_API_KEY ?? process.env.TAVUS_API_KEY
  const personaId = env.TAVUS_PERSONA_ID ?? process.env.TAVUS_PERSONA_ID
  if (!key || !personaId) {
    return { status: 'unconfigured', via: 'tavus' }
  }
  // Tavus session-create stub (AC.6.3 builds out fully).
  try {
    const res = await fetch('https://tavusapi.com/v2/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
      },
      body: JSON.stringify({
        persona_id: personaId,
        conversation_name: thread.subject,
        custom_greeting: content.slice(0, 200),
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      conversation_id?: string
      message?: string
    }
    if (!res.ok) {
      return {
        status: 'failed',
        via: 'tavus',
        error: data.message ?? `HTTP ${res.status}`,
      }
    }
    return {
      status: 'sent',
      via: 'tavus',
      external_id: data.conversation_id ?? null,
    }
  } catch (err) {
    return {
      status: 'failed',
      via: 'tavus',
      error: err instanceof Error ? err.message : 'network error',
    }
  }
}

async function dispatchEmail(
  profile: string,
  thread: Thread,
  content: string,
): Promise<AdapterResult> {
  // Email goes through central-mcp Resend per docs/system-services-resend.md.
  // The token lookup mirrors the central-mcp pattern used by
  // src/server/notifications.ts. When the token is missing we report
  // unconfigured rather than failing — preserves the local-only record.
  const env = readEnvFromProfile(profile)
  const token = env.CENTRAL_MCP_TOKEN ?? process.env.CENTRAL_MCP_TOKEN
  const central = env.CENTRAL_MCP_URL ?? process.env.CENTRAL_MCP_URL ?? 'http://localhost:4002/mcp'
  if (!token) return { status: 'unconfigured', via: 'email-resend' }
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
            to: thread.contact_handle,
            subject: thread.subject,
            html: `<p>${escapeHtml(content)}</p>`,
            text: content,
          },
        },
      }),
    })
    const text = await res.text()
    if (!res.ok) {
      return { status: 'failed', via: 'email-resend', error: text.slice(0, 200) }
    }
    // central-mcp returns SSE-framed JSON; pluck the first data: line.
    const dataMatch = text.match(/data: ({[\s\S]*?})\n/)
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
        // swallow — adapter still reports sent
      }
    }
    return { status: 'sent', via: 'email-resend', external_id: emailId }
  } catch (err) {
    return {
      status: 'failed',
      via: 'email-resend',
      error: err instanceof Error ? err.message : 'network error',
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

export async function dispatchOutbound(input: {
  profile: string
  channel: string
  thread: Thread
  content: string
}): Promise<AdapterResult> {
  switch (input.channel) {
    case 'sms':
    case 'textmagic':
      return dispatchTextMagic(input.profile, input.thread, input.content)
    case 'voice':
    case 'phone':
    case 'vapi':
      return dispatchVapi(input.profile, input.thread, input.content)
    case 'video':
    case 'tavus':
      return dispatchTavus(input.profile, input.thread, input.content)
    case 'email':
      return dispatchEmail(input.profile, input.thread, input.content)
    case 'chat':
    default:
      // Chat is the local-only record path; the studio chat round-trip
      // already produces an assistant message via /api/customer/chat.
      // For a reply on a chat thread we just record it.
      return { status: 'simulated', via: 'chat' }
  }
}
