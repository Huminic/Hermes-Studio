/**
 * POST /api/public/callback-request   (public — storefront unified widget)
 *
 * "Instant Call Back" option: a visitor leaves a name + phone and asks the store
 * to call them back. Lands in messaging-hub as a Sales lead thread and trips the
 * dealer lead notification (ADF-XML for Serra, plain email for Columbia) — the
 * same path as a website form / Vapi end-of-call. No SMS is sent (this is the
 * non-SMS scope): the dealer is alerted to call the customer back.
 *
 * Body: { profile, name?, phone, message? }
 * Returns: { ok: true, thread_id, notified } | { ok: false, error }
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { readStudioConfig } from '../../../server/studio-config'
import {
  appendMessage,
  getOrCreateThread,
  upsertContact,
} from '../../../server/messaging-hub-store'
import { notifyNewLead } from '../../../server/lead-notifications'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function reply(data: unknown, status = 200): Response {
  return json(data as never, { status, headers: CORS })
}

export const Route = createFileRoute('/api/public/callback-request')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
        const message =
          typeof body.message === 'string' ? body.message.trim() : ''
        if (!profile) {
          return reply({ ok: false, error: 'profile required' }, 400)
        }
        if (!phone) {
          return reply({ ok: false, error: 'phone required' }, 400)
        }
        // Validate the profile exists (readStudioConfig falls back to defaults,
        // so guard against a bogus slug by requiring a real studio.yaml file).
        let source: 'file' | 'default'
        try {
          source = readStudioConfig(profile).source
        } catch {
          return reply({ ok: false, error: 'unknown profile' }, 404)
        }
        if (source !== 'file') {
          return reply({ ok: false, error: 'unknown profile' }, 404)
        }

        const handle = phone
        upsertContact({
          profile,
          display_name: name || null,
          identifiers: { sms: phone },
        })

        const thread = getOrCreateThread({
          profile,
          domain: 'sales',
          channel: 'form',
          subject: 'Call-back request',
          contact_handle: handle,
        })
        appendMessage({
          thread_id: thread.id,
          direction: 'inbound',
          role: 'user',
          channel: 'form',
          content:
            message ||
            `${name || 'A visitor'} requested an instant call back.`,
          author: name || handle,
          metadata: { name, phone, via: 'widget-callback' },
        })

        const notified = await notifyNewLead({
          profile,
          channel: 'call-back request',
          event: 'website_form',
          contact_handle: handle,
          name: name || null,
          phone,
          message: message || 'Requested an instant call back.',
          subjectPrefix: 'Call-back request',
          cooldownKey: phone,
        })

        // Annotate the thread with the delivery outcome (system-role — never
        // rendered to the customer; diagnostics live in metadata, not content).
        // Parity with the voice/video webhooks.
        appendMessage({
          thread_id: thread.id,
          direction: 'outbound',
          role: 'system',
          channel: 'form',
          content: `Lead notification: ${notified.ok ? 'sent' : 'not delivered'}`,
          author: 'system',
          metadata: {
            via: 'lead-notification',
            delivery: notified.via,
            external_id: notified.external_id ?? null,
            reason: notified.reason ?? null,
          },
        })

        return reply({
          ok: true,
          thread_id: thread.id,
          notified: notified.ok,
        })
      },
    },
  },
})
