/**
 * POST /api/webhooks/tavus/$profile
 *
 * Tavus conversational-video webhook receiver. Mirrors the Vapi webhook so the
 * operator can point a Tavus replica's callback at studio.huminic.app for a
 * given profile. Same profile + same agent roster as every other channel —
 * a Tavus video lead lands in the SAME messaging-hub as SMS/voice/chat.
 *
 * Tavus posts conversation lifecycle events, shape varies by version:
 *   - { event_type, conversation_id, properties: { transcript, recording_url, replica_id, ... } }
 *   - { message_type, event_type, conversation_id, ... }
 *
 * On a transcript-bearing / end-of-conversation event:
 *   1. Records the session as an inbound thread (channel: 'video',
 *      domain: 'sales' by default).
 *   2. Builds a lead from the transcript/summary + any customer fields.
 *   3. Routes a dealer notification through the notification matrix
 *      (event: inbound_video → configured recipients, else lead_recipient).
 *      Format (adf-xml vs plain email) comes from the profile's studio.yaml.
 *
 * Auth: optional shared secret in `x-tavus-secret` header (or
 * `authorization: Bearer ...`). Configured via per-profile .env
 * `TAVUS_WEBHOOK_SECRET`.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  appendMessage,
  getOrCreateThread,
  upsertContact,
} from '../../../server/messaging-hub-store'
import { dispatchLeadNotification } from '../../../server/lead-notifications'
import type { AdfLead } from '../../../server/adf-xml'

function readSecret(profile: string): string | null {
  try {
    const file = path.join(os.homedir(), '.hermes', 'profiles', profile, '.env')
    const raw = fs.readFileSync(file, 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      if (trimmed.slice(0, eq).trim() === 'TAVUS_WEBHOOK_SECRET') {
        return trimmed.slice(eq + 1).trim()
      }
    }
  } catch {
    // missing per-profile env is fine
  }
  return process.env.TAVUS_WEBHOOK_SECRET ?? null
}

type TavusProps = {
  transcript?: string | Array<{ role?: string; content?: string }>
  summary?: string
  recording_url?: string
  replica_id?: string
  persona_id?: string
  customer_name?: string
  customer_phone?: string
  customer_email?: string
}

type TavusEvent = {
  event_type?: string
  message_type?: string
  conversation_id?: string
  properties?: TavusProps
  transcript?: string
  summary?: string
}

function normalizeTranscript(
  t: TavusProps['transcript'] | string | undefined,
): string | undefined {
  if (!t) return undefined
  if (typeof t === 'string') return t
  if (Array.isArray(t)) {
    return t
      .map((turn) => `${turn.role ?? 'user'}: ${turn.content ?? ''}`)
      .join('\n')
  }
  return undefined
}

function buildLeadFromSession(event: TavusEvent): AdfLead {
  const props = event.properties ?? {}
  const phone = props.customer_phone ?? ''
  const email = props.customer_email ?? ''
  const name = props.customer_name ?? ''
  return {
    request_date: new Date().toISOString(),
    customer: {
      full_name: name || undefined,
      phone: phone || undefined,
      email: email || undefined,
      preferred_contact: phone ? 'phone' : email ? 'email' : undefined,
    },
    vehicles: [],
    comments:
      props.summary ??
      event.summary ??
      normalizeTranscript(props.transcript) ??
      normalizeTranscript(event.transcript) ??
      undefined,
    // Dealer-facing "Source" (email row + ADF <vendorname>). MUST NOT name a
    // third-party vendor — use the channel. Internal ids stay in thread metadata.
    vendor: { name: 'Video call' },
  }
}

export const Route = createFileRoute('/api/webhooks/tavus/$profile')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const profile = params.profile
        if (!profile) {
          return json({ ok: false, error: 'profile required' }, { status: 400 })
        }
        const required = readSecret(profile)
        if (required) {
          const provided =
            request.headers.get('x-tavus-secret') ??
            request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
            ''
          if (provided !== required) {
            return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
          }
        }
        const event = (await request.json().catch(() => ({}))) as TavusEvent
        const eventType = event.event_type ?? event.message_type ?? 'unknown'
        const props = event.properties ?? {}
        const transcript =
          normalizeTranscript(props.transcript) ??
          normalizeTranscript(event.transcript)

        // Only act on transcript/end events; other lifecycle pings return 200
        // (so Tavus doesn't retry) but do no work.
        const interesting = [
          'application.transcription_ready',
          'application.recording_ready',
          'conversation.ended',
          'system.shutdown',
        ]
        const hasContent =
          !!transcript || !!props.summary || !!event.summary
        if (!interesting.includes(eventType) && !hasContent) {
          return json({ ok: true, ignored: true, type: eventType })
        }

        const phone = props.customer_phone ?? ''
        const handle =
          phone ||
          props.customer_email ||
          `video-${event.conversation_id ?? Date.now()}`
        upsertContact({
          profile,
          display_name: props.customer_name ?? null,
          identifiers: {
            ...(phone ? { phone } : {}),
            ...(props.customer_email ? { email: props.customer_email } : {}),
          },
        })
        const thread = getOrCreateThread({
          profile,
          domain: 'sales',
          channel: 'video',
          contact_handle: handle,
          subject: props.customer_name ? `Video call · ${props.customer_name}` : 'Video call',
          assigned_agent_id: null,
        })
        const message = appendMessage({
          thread_id: thread.id,
          direction: 'inbound',
          role: 'user',
          channel: 'video',
          content:
            props.summary ??
            event.summary ??
            transcript ??
            '(empty video session)',
          author: props.customer_name ?? handle,
          metadata: {
            via: 'tavus-webhook',
            tavus_conversation_id: event.conversation_id,
            replica_id: props.replica_id,
            persona_id: props.persona_id,
            recording_url: props.recording_url,
          },
        })

        const lead = buildLeadFromSession(event)
        const notification = await dispatchLeadNotification({
          profile,
          event: 'inbound_video',
          lead,
          subjectPrefix: 'New video lead',
          cooldownKey: thread.contact_handle,
        })

        appendMessage({
          thread_id: thread.id,
          direction: 'outbound',
          role: 'system',
          channel: 'video',
          content: `Lead notification: ${notification.ok ? 'sent' : 'not delivered'}`,
          author: 'system',
          metadata: {
            via: 'lead-notification',
            delivery: notification.via,
            external_id: notification.external_id ?? null,
            reason: notification.reason ?? null,
          },
        })

        return json({
          ok: true,
          thread_id: thread.id,
          message_id: message.id,
          notification,
        })
      },
    },
  },
})
