/**
 * POST /api/webhooks/vapi/$profile
 *
 * Vapi end-of-call webhook receiver. Mirrors the Nexxus webhook shape so
 * the operator can just swap the Vapi assistant's webhook URL from the
 * Nexxus host to studio.huminic.app for a given test agent.
 *
 * Accepts both Vapi event formats:
 *   - { message: { type, call, transcript, summary, ... } } (older)
 *   - { type, call, ... } (newer flat)
 *
 * On `end-of-call-report` event:
 *   1. Records the call as an inbound thread in messaging-hub
 *      (channel: 'voice', domain: 'sales' by default; widget frontmatter
 *      can override).
 *   2. Builds an ADF lead from the call data.
 *   3. Emits ADF email to `studio.yaml.lead_notifications.adf_email`
 *      via central-mcp Resend (skips silently when unconfigured).
 *
 * Auth: optional shared secret in `x-vapi-secret` header (or
 * `authorization: Bearer ...`). Configured via per-profile .env
 * `VAPI_WEBHOOK_SECRET`.
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
import { notifyDealer } from '../../../server/lead-notifications'
import type { AdfLead } from '../../../server/adf-xml'

function readSecret(profile: string): string | null {
  try {
    const file = path.join(
      os.homedir(),
      '.hermes',
      'profiles',
      profile,
      '.env',
    )
    const raw = fs.readFileSync(file, 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      if (trimmed.slice(0, eq).trim() === 'VAPI_WEBHOOK_SECRET') {
        return trimmed.slice(eq + 1).trim()
      }
    }
  } catch {
    // missing per-profile env is fine
  }
  return process.env.VAPI_WEBHOOK_SECRET ?? null
}

type VapiCall = {
  id?: string
  type?: string
  status?: string
  phoneNumber?: { number?: string }
  customer?: { number?: string; name?: string }
  transcript?: string
  summary?: string
  startedAt?: string
  endedAt?: string
  assistantId?: string
  recordingUrl?: string
}

type VapiEvent = {
  type?: string
  call?: VapiCall
  transcript?: string
  summary?: string
  recordingUrl?: string
}

function flatten(body: unknown): VapiEvent {
  if (body && typeof body === 'object' && 'message' in body) {
    return (body as { message: VapiEvent }).message ?? {}
  }
  return (body as VapiEvent) ?? {}
}

function buildLeadFromCall(call: VapiCall, event: VapiEvent): AdfLead {
  const phone = call.customer?.number ?? call.phoneNumber?.number ?? ''
  const name = call.customer?.name ?? ''
  return {
    request_date: call.endedAt ?? call.startedAt ?? new Date().toISOString(),
    customer: {
      full_name: name || undefined,
      phone: phone || undefined,
      preferred_contact: phone ? 'phone' : undefined,
    },
    vehicles: [],
    comments:
      event.summary ??
      call.summary ??
      event.transcript ??
      call.transcript ??
      undefined,
    vendor: { name: 'vapi', service: call.assistantId ?? '' },
  }
}

export const Route = createFileRoute('/api/webhooks/vapi/$profile')({
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
            request.headers.get('x-vapi-secret') ??
            request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
            ''
          if (provided !== required) {
            return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
          }
        }
        const body = (await request.json().catch(() => ({}))) as unknown
        const event = flatten(body)
        const eventType = event.type ?? 'unknown'
        const call = event.call ?? {}
        // Only act on end-of-call summary events; other events return 200
        // so Vapi doesn't retry but no work happens.
        const interesting = [
          'end-of-call-report',
          'call.completed',
          'function-call', // some Vapi versions
        ]
        if (!interesting.includes(eventType)) {
          return json({
            ok: true,
            ignored: true,
            type: eventType,
          })
        }
        const phone = call.customer?.number ?? call.phoneNumber?.number ?? ''
        const handle = phone || `vapi-${call.id ?? Date.now()}`
        upsertContact({
          profile,
          display_name: call.customer?.name ?? null,
          identifiers: phone ? { phone } : {},
        })
        const thread = getOrCreateThread({
          profile,
          domain: 'sales',
          channel: 'voice',
          contact_handle: handle,
          subject: `vapi call · ${call.assistantId?.slice(0, 8) ?? ''}`,
          assigned_agent_id: null,
        })
        const message = appendMessage({
          thread_id: thread.id,
          direction: 'inbound',
          role: 'user',
          channel: 'voice',
          content:
            event.summary ??
            call.summary ??
            event.transcript ??
            call.transcript ??
            '(empty call)',
          author: call.customer?.name ?? handle,
          metadata: {
            via: 'vapi-webhook',
            vapi_call_id: call.id,
            assistant_id: call.assistantId,
            recording_url: event.recordingUrl ?? call.recordingUrl,
            started_at: call.startedAt,
            ended_at: call.endedAt,
          },
        })

        const lead = buildLeadFromCall(call, event)
        // WS-4: per-profile dealer notification. Format (adf-xml vs plain
        // email) and recipient come from the profile's studio.yaml
        // `notifications` block; the webhook stays format-agnostic.
        const notification = await notifyDealer({
          profile,
          event: lead,
          subjectPrefix: 'Vapi lead',
        })

        // Annotate the thread with the notification outcome so the operator
        // can see (in tooling, not the customer inbox) whether the ADF email
        // landed. This is a system-role annotation: the Teambox conversation
        // view never renders system messages, so it stays out of the customer's
        // view. The human-readable `content` carries only a clean status word —
        // NEVER the raw diagnostic reason (env-var names, "unconfigured token",
        // routing strings). Diagnostics live in metadata for operator tooling.
        appendMessage({
          thread_id: thread.id,
          direction: 'outbound',
          role: 'system',
          channel: 'voice',
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
