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
import { readStudioConfig } from './studio-config'
import {
  credentialModeFor,
  type CredentialedChannel,
  type CredentialMode,
} from '../lib/studio-config'
import { checkCommGate, type GateChannel } from './comms-gate'
import { recordCommsOutcome, type CommsOutcomeRow } from './comms-log'

type AdapterStatus = 'sent' | 'unconfigured' | 'failed' | 'simulated' | 'blocked'

export type AdapterResult = {
  status: AdapterStatus
  via: string
  external_id?: string | null
  error?: string | null
  /** When status === 'blocked', the CommGate rule that fired. */
  gate_rule?: string | null
}

/**
 * Resolve the operator-selected credential mode for a channel on a profile.
 * Default 'shared' (united credentials brokered by central-mcp). Never throws —
 * a missing/broken studio.yaml falls back to 'shared'.
 */
function modeFor(profile: string, channel: CredentialedChannel): CredentialMode {
  try {
    return credentialModeFor(readStudioConfig(profile).config, channel)
  } catch {
    return 'shared'
  }
}

/**
 * SHARED path: dispatch via central-mcp, which holds the united provider
 * credentials (same broker the email/Resend path already uses). Mirrors the
 * SSE-framed JSON-RPC call shape in notifications.ts. Returns 'unconfigured'
 * when the central-mcp token is absent so the hub still keeps a local record.
 */
async function callCentralMcpTool(
  profile: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; externalId?: string | null; error?: string; unconfigured?: boolean }> {
  const env = readEnvFromProfile(profile)
  const token = env.CENTRAL_MCP_TOKEN ?? process.env.CENTRAL_MCP_TOKEN
  const central =
    env.CENTRAL_MCP_URL ?? process.env.CENTRAL_MCP_URL ?? 'http://localhost:4002/mcp'
  if (!token) return { ok: false, unconfigured: true, error: 'central-mcp token missing' }
  try {
    const res = await fetch(central, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // MCP streamable-HTTP transport requires both accept types (see central-mcp.ts).
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
    })
    const text = await res.text()
    if (!res.ok) return { ok: false, error: text.slice(0, 200) }
    const m = text.match(/data: ({[\s\S]*?})\n/)
    if (m) {
      const obj = JSON.parse(m[1]) as {
        error?: unknown
        result?: { isError?: boolean; content?: Array<{ text?: string }> }
      }
      if (obj.error) return { ok: false, error: JSON.stringify(obj.error).slice(0, 200) }
      if (obj.result?.isError)
        return { ok: false, error: (obj.result.content?.[0]?.text ?? 'tool error').slice(0, 200) }
      let externalId: string | null = null
      const inner = obj.result?.content?.[0]?.text
      if (inner) {
        try {
          const o = JSON.parse(inner) as Record<string, unknown>
          externalId =
            (o.sid as string) ??
            (o.id as string) ??
            (o.conversation_id as string) ??
            (o.call_id as string) ??
            null
        } catch {
          // non-JSON tool text — still a successful send
        }
      }
      return { ok: true, externalId }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network error' }
  }
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

async function dispatchSms(
  profile: string,
  thread: Thread,
  content: string,
): Promise<AdapterResult> {
  const to = thread.contact_handle
  // SHARED (default): united SMS via the central-mcp broker using tm_send_message
  // (TextMagic) — the same tool the live Nexxus platform uses. The claude_nexxus-2.2
  // broker token (operator decision D1, see docs/launch/NEXXUS_FIT_SPEC.md) exposes
  // tm_send_message alongside vin_/vapi_/tavus_/resend_. No token combines SignalWire
  // with vin/vapi/tavus, so SignalWire is not used. The sender (`from`) is OPTIONAL:
  // when SMS_FROM is configured it is passed through (matching Nexxus campaign sends
  // which use the org's smsCampaignNumber); when absent it is omitted so the broker's
  // default TextMagic sender is used (matching Nexxus trigger/greeting sends).
  if (modeFor(profile, 'sms') === 'shared') {
    const env = readEnvFromProfile(profile)
    const from = env.SMS_FROM ?? process.env.SMS_FROM
    // Route to the store's own central-mcp TextMagic account (e.g. serra_honda)
    // so it sends from its provisioned number, not the broker's default.
    const account = readStudioConfig(profile).config.sms?.account
    const args: Record<string, unknown> = { text: content, phones: to }
    if (from) args.from = from
    if (account) args.account = account
    const r = await callCentralMcpTool(profile, 'tm_send_message', args)
    if (r.unconfigured) return { status: 'unconfigured', via: 'sms-textmagic-shared' }
    if (!r.ok) return { status: 'failed', via: 'sms-textmagic-shared', error: r.error }
    return { status: 'sent', via: 'sms-textmagic-shared', external_id: r.externalId ?? null }
  }
  // OWN: the profile's own TextMagic creds, direct to the provider.
  const env = readEnvFromProfile(profile)
  const apiKey = env.TEXTMAGIC_API_KEY
  const username = env.TEXTMAGIC_USERNAME
  const from = env.TEXTMAGIC_FROM
  if (!apiKey || !username || !from) {
    return { status: 'unconfigured', via: 'textmagic-own' }
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
  // SHARED (default): united Vapi creds via central-mcp vapi_create_call. The
  // shared assistant (and optional phone number) come from the studio-level env
  // so every shared-mode profile dials with the same united setup.
  if (modeFor(profile, 'vapi') === 'shared') {
    const assistantId = process.env.VAPI_ASSISTANT_ID
    if (!assistantId) return { status: 'unconfigured', via: 'vapi-shared' }
    const r = await callCentralMcpTool(profile, 'vapi_create_call', {
      assistantId,
      customerNumber: thread.contact_handle,
      ...(process.env.VAPI_PHONE_NUMBER_ID
        ? { phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID }
        : {}),
      firstMessageOverride: content.slice(0, 400),
    })
    if (r.unconfigured) return { status: 'unconfigured', via: 'vapi-shared' }
    if (!r.ok) return { status: 'failed', via: 'vapi-shared', error: r.error }
    return { status: 'sent', via: 'vapi-shared', external_id: r.externalId ?? null }
  }
  // OWN: the profile's own Vapi key, direct to the provider.
  const env = readEnvFromProfile(profile)
  const key = env.VAPI_API_KEY
  if (!key) {
    return { status: 'unconfigured', via: 'vapi-own' }
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
  // SHARED (default): united Tavus creds via central-mcp tavus_create_conversation.
  // The shared persona comes from the studio-level env.
  if (modeFor(profile, 'tavus') === 'shared') {
    const personaId = process.env.TAVUS_PERSONA_ID
    if (!personaId) return { status: 'unconfigured', via: 'tavus-shared' }
    const r = await callCentralMcpTool(profile, 'tavus_create_conversation', {
      persona_id: personaId,
      conversation_name: thread.subject,
      custom_greeting: content.slice(0, 200),
    })
    if (r.unconfigured) return { status: 'unconfigured', via: 'tavus-shared' }
    if (!r.ok) return { status: 'failed', via: 'tavus-shared', error: r.error }
    return { status: 'sent', via: 'tavus-shared', external_id: r.externalId ?? null }
  }
  // OWN: the profile's own Tavus key + persona, direct to the provider.
  const env = readEnvFromProfile(profile)
  const key = env.TAVUS_API_KEY
  const personaId = env.TAVUS_PERSONA_ID
  if (!key || !personaId) {
    return { status: 'unconfigured', via: 'tavus-own' }
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
  // central-mcp's resend tool REQUIRES a `from` (its schema reads body.from).
  // Without it the send is rejected at schema validation. Per-profile override
  // via RESEND_FROM in the profile .env; default matches Nexxus's sender.
  const from = env.RESEND_FROM ?? process.env.RESEND_FROM ?? 'notifications@huminic.ai'
  try {
    const res = await fetch(central, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // MCP streamable-HTTP transport requires both accept types (see central-mcp.ts).
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'resend_send_email',
          arguments: {
            from,
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

/** Map a dispatch channel to the CommGate channel (chat is ungated). */
function gateChannelFor(channel: string): GateChannel | null {
  switch (channel) {
    case 'sms':
    case 'textmagic':
      return 'sms'
    case 'voice':
    case 'phone':
    case 'vapi':
      return 'voice'
    case 'video':
    case 'tavus':
      return 'video'
    case 'email':
      return 'email'
    default:
      return null
  }
}

export async function dispatchOutbound(input: {
  profile: string
  channel: string
  thread: Thread
  content: string
  /** VinSolutions contactId for the recipient — enables the SMS consent gate. */
  contactId?: string | number | null
  options?: { bypassBusinessHours?: boolean }
}): Promise<AdapterResult> {
  // CommGate runs fail-closed before any real send (chat is a local record).
  const gateChannel = gateChannelFor(input.channel)
  if (gateChannel) {
    const gate = await checkCommGate({
      profile: input.profile,
      channel: gateChannel,
      to: input.thread.contact_handle,
      contactId: input.contactId,
      options: { bypassBusinessHours: input.options?.bypassBusinessHours },
    })
    if (!gate.ok) {
      return { status: 'blocked', via: `${input.channel}-gate`, error: gate.reason, gate_rule: gate.rule }
    }
  }
  let result: AdapterResult
  switch (input.channel) {
    case 'sms':
    case 'textmagic':
      result = await dispatchSms(input.profile, input.thread, input.content)
      break
    case 'voice':
    case 'phone':
    case 'vapi':
      result = await dispatchVapi(input.profile, input.thread, input.content)
      break
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
  // Record the delivery OUTCOME for regulated customer channels (text/voice) so a
  // FAILED customer send is visible to the Sentinel (notifications-delivery check,
  // channel-agnostic 1h burst → email alert). Previously only lead-notification
  // EMAILS recorded here, so failed texts were invisible. Best-effort; a telemetry
  // write never breaks a send.
  const row = commsOutcomeRowFor(input.channel, input.thread.contact_handle, result)
  if (row) recordCommsOutcome(input.profile, row)
  return result
}

/**
 * Map a send result to a comms_log row for the regulated customer channels
 * (text/voice), or null when it should not be recorded. Only 'sent'/'failed' are
 * true delivery outcomes — 'blocked' (a gate decision), 'unconfigured' (no creds),
 * and 'simulated' (chat) are not delivery errors. Email is recorded by the
 * lead-notification path, not here (avoid double counting). Pure + exported for tests.
 */
export function commsOutcomeRowFor(
  channel: string,
  recipient: string,
  result: AdapterResult,
): CommsOutcomeRow | null {
  const logChannel: 'sms' | 'voice' | null =
    channel === 'sms' || channel === 'textmagic'
      ? 'sms'
      : channel === 'voice' || channel === 'phone' || channel === 'vapi'
        ? 'voice'
        : null
  if (!logChannel) return null
  if (result.status !== 'sent' && result.status !== 'failed') return null
  return {
    direction: 'outbound',
    channel: logChannel,
    actor: `system:${channel}-send`,
    recipients: [recipient],
    body_summary: result.status === 'failed' ? (result.error ?? 'send failed').slice(0, 200) : null,
    external_id: result.external_id ?? null,
    outcome: result.status === 'sent' ? 'ok' : 'error',
  }
}
