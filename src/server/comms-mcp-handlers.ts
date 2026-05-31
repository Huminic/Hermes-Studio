/**
 * Comms MCP tool handlers (SRS Tranche D.5).
 *
 * Exposes higher-level send actions over MCP so token scope + rate caps
 * + audit + Brain memorialization apply uniformly to every outbound:
 *   - comms_send_email
 *   - comms_send_sms
 *   - comms_initiate_call
 *
 * Inbound is unchanged (continues to land via /api/messaging/inbound
 * and per-channel webhooks). Every outbound writes to:
 *   1. metadata_audit (gate_decision + outcome)
 *   2. comms_log (channel-level memorialization with external_id)
 *   3. events table (operational projection)
 *   4. SSE bus (comms_sent or comms_failed)
 */

import { openBrain, now, uuid } from './brain-store'
import { dsgGate } from './dsg-gate'
import { recordAudit } from './metadata-substrate'
import { insertEvent } from './brain-record-families'
import { checkAndRecord } from './comms-rate-limiter'
import { sendNotification } from './notifications'
import { publishMessagingEvent } from './messaging-hub-bus'

export const COMMS_TOOLS = [
  {
    name: 'comms_send_email',
    description:
      'Send an email via Resend (through central-mcp). DSG-gated. Rate-capped per profile. Memorialized into Brain.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        to: { type: 'array', items: { type: 'string' } },
        from: { type: 'string' },
        subject: { type: 'string' },
        html: { type: 'string' },
        text: { type: 'string' },
        cc: { type: 'array', items: { type: 'string' } },
        bcc: { type: 'array', items: { type: 'string' } },
        thread_id: { type: 'string' },
      },
      required: ['profile', 'to', 'subject', 'html'],
    },
  },
  {
    name: 'comms_send_sms',
    description:
      'Send an SMS via TextMagic. DSG-gated. Requires per-profile TEXTMAGIC_* credentials.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        to: { type: 'string' },
        body: { type: 'string' },
        thread_id: { type: 'string' },
      },
      required: ['profile', 'to', 'body'],
    },
  },
  {
    name: 'comms_initiate_call',
    description:
      'Initiate an outbound voice call via Vapi. DSG-gated. Returns the Vapi call id when accepted.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        to: { type: 'string' },
        assistant_id: { type: 'string' },
        phone_id: { type: 'string' },
        first_message: { type: 'string' },
        metadata: { type: 'object', additionalProperties: true },
      },
      required: ['profile', 'to'],
    },
  },
]

export type CommsToolContext = {
  token_label: string
  token_allowed_profiles: Array<string>
  token_allowed_tools: Array<string>
  token_admin: boolean
}

export type CommsResult =
  | {
      ok: true
      data: {
        external_id?: string | null
        via?: string
        log_id: string
        gate_event_id: string
      }
    }
  | {
      ok: false
      error: string
      rule?: string
      gate_event_id?: string
    }

export async function callCommsTool(
  name: string,
  args: Record<string, unknown>,
  ctx: CommsToolContext,
): Promise<CommsResult> {
  const actor = `token:${ctx.token_label}`
  switch (name) {
    case 'comms_send_email':
      return await sendEmail(args, actor)
    case 'comms_send_sms':
      return await sendSms(args, actor)
    case 'comms_initiate_call':
      return await initiateCall(args, actor)
    default:
      return { ok: false, error: `unknown comms tool: ${name}` }
  }
}

async function gate(
  profile: string,
  channel: 'email' | 'sms' | 'voice',
  actor: string,
  payloadHint: Record<string, unknown>,
): Promise<{ ok: boolean; gate_event_id: string; rule?: string; reason?: string }> {
  // Rate cap first.
  const rate = checkAndRecord({ profile, channel })
  if (!rate.ok) {
    recordAudit(profile, {
      ts: now(),
      surface: 'brain',
      actor,
      action: 'tool_call',
      target_type: 'comms',
      reason: rate.reason,
      outcome: 'denied',
      rule: rate.rule,
    })
    return {
      ok: false,
      gate_event_id: 'rate-cap',
      rule: rate.rule,
      reason: rate.reason,
    }
  }
  const out = dsgGate({
    profile,
    table: 'comms_log',
    action: 'create',
    payload: {
      id: uuid(),
      tenant: profile,
      source_refs: [
        { kind: 'channel', value: channel },
        ...((payloadHint.source_refs as Array<unknown>) ?? []),
      ],
    },
    actor,
  })
  if (!out.ok) {
    return {
      ok: false,
      gate_event_id: out.gate_event_id,
      rule: out.rule,
      reason: out.reason,
    }
  }
  return { ok: true, gate_event_id: out.gate_event_id }
}

function logComms(
  profile: string,
  row: {
    direction: 'outbound' | 'inbound'
    channel: 'email' | 'sms' | 'voice'
    actor: string
    recipients: Array<string>
    subject?: string | null
    body_summary?: string | null
    external_id?: string | null
    outcome: 'ok' | 'error'
    audit_id?: number | null
  },
): string {
  const id = uuid()
  const handle = openBrain(profile)
  try {
    handle.run(
      `INSERT INTO comms_log (
        id, ts, direction, channel, actor, recipients,
        subject, body_summary, external_id, outcome, audit_id, tenant
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      now(),
      row.direction,
      row.channel,
      row.actor,
      JSON.stringify(row.recipients),
      row.subject ?? null,
      row.body_summary ?? null,
      row.external_id ?? null,
      row.outcome,
      row.audit_id ?? null,
      profile,
    )
  } finally {
    handle.close()
  }
  return id
}

async function sendEmail(
  args: Record<string, unknown>,
  actor: string,
): Promise<CommsResult> {
  const profile = String(args.profile)
  const to = (args.to as Array<string>) ?? []
  const subject = String(args.subject ?? '')
  const html = String(args.html ?? '')
  const text = args.text as string | undefined
  const from = (args.from as string) ?? 'notifications@huminic.ai'
  const cc = (args.cc as Array<string>) ?? []
  const bcc = (args.bcc as Array<string>) ?? []

  const allowlist = parseAllowlist(process.env.EMAIL_ALLOWED_USERS)
  if (allowlist.length > 0) {
    const denied = to.filter((r) => !allowlist.includes(r.toLowerCase()))
    if (denied.length > 0) {
      return {
        ok: false,
        error: `recipient(s) not on EMAIL_ALLOWED_USERS: ${denied.join(', ')}`,
        rule: 'policy-blocked',
      }
    }
  }

  const g = await gate(profile, 'email', actor, { recipients: to })
  if (!g.ok) {
    logComms(profile, {
      direction: 'outbound',
      channel: 'email',
      actor,
      recipients: to,
      subject,
      body_summary: text?.slice(0, 256) ?? html.slice(0, 256),
      outcome: 'error',
    })
    return { ok: false, error: g.reason ?? 'gate denied', rule: g.rule, gate_event_id: g.gate_event_id }
  }

  const res = await sendNotification({
    from,
    to,
    subject,
    html,
    text,
    cc: cc.length ? cc : undefined,
    bcc: bcc.length ? bcc : undefined,
  })
  const logId = logComms(profile, {
    direction: 'outbound',
    channel: 'email',
    actor,
    recipients: to,
    subject,
    body_summary: text?.slice(0, 256) ?? html.slice(0, 256),
    external_id: res.ok ? res.email_id : null,
    outcome: res.ok ? 'ok' : 'error',
  })
  insertEvent({
    profile,
    actor,
    type: 'comms_sent',
    source: 'comms_send_email',
    subject_type: 'comms',
    subject_id: logId,
    payload: { to, subject, ok: res.ok, error: res.ok ? null : res.error },
    source_refs: [{ kind: 'channel', value: 'email' }],
  })
  publishMessagingEvent(profile, {
    type: res.ok ? 'campaign_progress' : 'campaign_progress',
    payload: { kind: res.ok ? 'comms_sent' : 'comms_failed', channel: 'email', log_id: logId, external_id: res.ok ? res.email_id : null },
    ts: now(),
  })
  return res.ok
    ? {
        ok: true,
        data: {
          external_id: res.email_id,
          via: 'central-mcp:resend',
          log_id: logId,
          gate_event_id: g.gate_event_id,
        },
      }
    : { ok: false, error: res.error, gate_event_id: g.gate_event_id }
}

async function sendSms(
  args: Record<string, unknown>,
  actor: string,
): Promise<CommsResult> {
  const profile = String(args.profile)
  const to = String(args.to ?? '')
  const body = String(args.body ?? '')

  const g = await gate(profile, 'sms', actor, { recipients: [to] })
  if (!g.ok) {
    logComms(profile, {
      direction: 'outbound',
      channel: 'sms',
      actor,
      recipients: [to],
      body_summary: body.slice(0, 256),
      outcome: 'error',
    })
    return { ok: false, error: g.reason ?? 'gate denied', rule: g.rule, gate_event_id: g.gate_event_id }
  }

  // Direct TextMagic API call (per-profile env credentials).
  const apiUser = process.env.TEXTMAGIC_USERNAME
  const apiKey = process.env.TEXTMAGIC_API_KEY
  if (!apiUser || !apiKey) {
    const logId = logComms(profile, {
      direction: 'outbound',
      channel: 'sms',
      actor,
      recipients: [to],
      body_summary: body.slice(0, 256),
      outcome: 'error',
    })
    return {
      ok: false,
      error: 'TEXTMAGIC_USERNAME / TEXTMAGIC_API_KEY not configured',
      gate_event_id: g.gate_event_id,
    }
  }
  try {
    const res = await fetch('https://rest.textmagic.com/api/v2/messages', {
      method: 'POST',
      headers: {
        'X-TM-Username': apiUser,
        'X-TM-Key': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ text: body, phones: to }),
    })
    const j = (await res.json()) as { id?: number; message?: string }
    const ok = res.ok && typeof j.id === 'number'
    const logId = logComms(profile, {
      direction: 'outbound',
      channel: 'sms',
      actor,
      recipients: [to],
      body_summary: body.slice(0, 256),
      external_id: j.id ? String(j.id) : null,
      outcome: ok ? 'ok' : 'error',
    })
    insertEvent({
      profile,
      actor,
      type: 'comms_sent',
      source: 'comms_send_sms',
      subject_type: 'comms',
      subject_id: logId,
      payload: { to, ok, status: res.status, error: ok ? null : j.message ?? `HTTP ${res.status}` },
      source_refs: [{ kind: 'channel', value: 'sms' }],
    })
    publishMessagingEvent(profile, {
      type: 'campaign_progress',
      payload: { kind: ok ? 'comms_sent' : 'comms_failed', channel: 'sms', log_id: logId, external_id: j.id },
      ts: now(),
    })
    return ok
      ? {
          ok: true,
          data: {
            external_id: String(j.id),
            via: 'textmagic',
            log_id: logId,
            gate_event_id: g.gate_event_id,
          },
        }
      : { ok: false, error: j.message ?? `HTTP ${res.status}`, gate_event_id: g.gate_event_id }
  } catch (err) {
    const logId = logComms(profile, {
      direction: 'outbound',
      channel: 'sms',
      actor,
      recipients: [to],
      body_summary: body.slice(0, 256),
      outcome: 'error',
    })
    return {
      ok: false,
      error: (err as Error).message,
      gate_event_id: g.gate_event_id,
    }
  }
}

async function initiateCall(
  args: Record<string, unknown>,
  actor: string,
): Promise<CommsResult> {
  const profile = String(args.profile)
  const to = String(args.to ?? '')
  const assistantId =
    (args.assistant_id as string) ?? process.env.VAPI_ASSISTANT_ID
  const phoneId = (args.phone_id as string) ?? process.env.VAPI_PHONE_ID
  const firstMessage = args.first_message as string | undefined
  const metadata = (args.metadata as Record<string, unknown>) ?? {}

  const g = await gate(profile, 'voice', actor, { recipients: [to] })
  if (!g.ok) {
    logComms(profile, {
      direction: 'outbound',
      channel: 'voice',
      actor,
      recipients: [to],
      outcome: 'error',
    })
    return { ok: false, error: g.reason ?? 'gate denied', rule: g.rule, gate_event_id: g.gate_event_id }
  }

  const apiKey = process.env.VAPI_PRIVATE_KEY
  if (!apiKey || !assistantId || !phoneId) {
    return {
      ok: false,
      error:
        'VAPI_PRIVATE_KEY / assistant_id / phone_id missing — set per profile or via tool args',
      gate_event_id: g.gate_event_id,
    }
  }
  try {
    const body: Record<string, unknown> = {
      assistantId,
      phoneNumberId: phoneId,
      customer: { number: to },
      assistantOverrides: { metadata },
    }
    if (firstMessage) {
      ;(body.assistantOverrides as Record<string, unknown>).firstMessage = firstMessage
    }
    const res = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const j = (await res.json()) as { id?: string; status?: string; message?: string }
    const ok = res.ok && typeof j.id === 'string'
    const logId = logComms(profile, {
      direction: 'outbound',
      channel: 'voice',
      actor,
      recipients: [to],
      external_id: j.id ?? null,
      outcome: ok ? 'ok' : 'error',
    })
    insertEvent({
      profile,
      actor,
      type: 'comms_sent',
      source: 'comms_initiate_call',
      subject_type: 'comms',
      subject_id: logId,
      payload: { to, ok, status: res.status, error: ok ? null : j.message ?? `HTTP ${res.status}` },
      source_refs: [{ kind: 'channel', value: 'voice' }],
    })
    publishMessagingEvent(profile, {
      type: 'campaign_progress',
      payload: { kind: ok ? 'comms_sent' : 'comms_failed', channel: 'voice', log_id: logId, external_id: j.id },
      ts: now(),
    })
    return ok
      ? {
          ok: true,
          data: {
            external_id: j.id ?? null,
            via: 'vapi',
            log_id: logId,
            gate_event_id: g.gate_event_id,
          },
        }
      : { ok: false, error: j.message ?? `HTTP ${res.status}`, gate_event_id: g.gate_event_id }
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
      gate_event_id: g.gate_event_id,
    }
  }
}

function parseAllowlist(s: string | undefined): Array<string> {
  if (!s) return []
  return s
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
}
