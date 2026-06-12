/**
 * POST /api/webhooks/textmagic/$profile
 *
 * TextMagic inbound SMS webhook receiver. Mirrors the field shape
 * TextMagic posts (text, sender, receiver, messageTime, messageId, ...).
 *
 * Lands the SMS as an inbound thread in messaging-hub (channel: 'sms').
 * Domain (sales|service) comes from `?domain=` override → the profile's
 * `sms.inbound_domain` in studio.yaml → 'service' (legacy default), so a
 * sales store routes to the Sales segment without a query param.
 *
 * Then fires the autonomous-reply dispatcher per AC.5.8 so a subscribed
 * agent can reply on the same channel automatically.
 *
 * Auth: optional shared secret in `x-textmagic-secret` header. Configured
 * via per-profile .env `TEXTMAGIC_WEBHOOK_SECRET`.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  appendMessage,
  getOrCreateThreadEx,
  upsertContact,
} from '../../../server/messaging-hub-store'
import {
  ensureAutonomousSubscription,
  maybeAutonomousReply,
} from '../../../server/agent-autonomous-reply'
import {
  notifyNewLead,
  notifyActiveConversation,
} from '../../../server/lead-notifications'
import { readStudioConfig } from '../../../server/studio-config'

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
      if (trimmed.slice(0, eq).trim() === 'TEXTMAGIC_WEBHOOK_SECRET') {
        return trimmed.slice(eq + 1).trim()
      }
    }
  } catch {
    // missing per-profile env is fine
  }
  return process.env.TEXTMAGIC_WEBHOOK_SECRET ?? null
}

export const Route = createFileRoute('/api/webhooks/textmagic/$profile')({
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
            request.headers.get('x-textmagic-secret') ??
            request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
            ''
          if (provided !== required) {
            return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
          }
        }
        // TextMagic posts as form-encoded OR JSON depending on version.
        const contentType = request.headers.get('content-type') ?? ''
        let body: Record<string, string> = {}
        if (contentType.includes('application/json')) {
          body = (await request.json().catch(() => ({}))) as Record<
            string,
            string
          >
        } else {
          const text = await request.text()
          const params = new URLSearchParams(text)
          for (const [k, v] of params) body[k] = v
        }
        const sender = body.sender ?? body.from ?? ''
        const receiver = body.receiver ?? body.to ?? ''
        const text = body.text ?? body.message ?? ''
        // TextMagic's inbound webhook posts the message id as `id`; keep the
        // older aliases as fallbacks for other payload shapes.
        const messageId =
          body.id ?? body.messageId ?? body.message_id ?? null
        if (!sender || !text) {
          return json(
            { ok: false, error: 'sender and text required' },
            { status: 400 },
          )
        }
        upsertContact({
          profile,
          display_name: null,
          identifiers: { sms: sender },
        })
        // Domain (sales vs service) decides which Teambox segment the thread
        // lands in. Priority: explicit `?domain=` override → the profile's
        // configured `sms.inbound_domain` → 'service' (legacy default). A sales
        // store like serra-honda (Caroline) sets `sms.inbound_domain: sales` so
        // its inbound texts don't fall into the Service tab.
        const url = new URL(request.url)
        const queryDomain = url.searchParams.get('domain')
        const configuredDomain = readStudioConfig(profile).config.sms?.inbound_domain
        const domain = queryDomain ?? configuredDomain ?? 'service'
        const { thread, created } = getOrCreateThreadEx({
          profile,
          domain,
          channel: 'sms',
          contact_handle: sender,
          subject: `sms · ${sender}`,
        })
        // A brand-new SMS thread is a new lead with a real callback number —
        // alert the dealer (ADF for Serra, plain email for Columbia). Reusing an
        // open thread means this is a reply in an ongoing conversation; do NOT
        // re-notify (avoids spamming the BDC). Best-effort; never blocks intake.
        let notified: {
          ok: boolean
          via?: string
          external_id?: string | null
          reason?: string
        } = { ok: false, via: 'skipped' }
        if (created) {
          notified = await notifyNewLead({
            profile,
            channel: 'SMS',
            contact_handle: sender,
            phone: sender,
            message: text,
            subjectPrefix: 'Inbound SMS',
          })
          // Annotate the thread with the delivery outcome (system-role — never
          // rendered to the customer; diagnostics live in metadata, not
          // content). Only on the new-lead path. Parity with voice/video.
          appendMessage({
            thread_id: thread.id,
            direction: 'outbound',
            role: 'system',
            channel: 'sms',
            content: `Lead notification: ${notified.ok ? 'sent' : 'not delivered'}`,
            author: 'system',
            metadata: {
              via: 'lead-notification',
              delivery: notified.via,
              external_id: notified.external_id ?? null,
              reason: notified.reason ?? null,
            },
          })
        }
        const inbound = appendMessage({
          thread_id: thread.id,
          direction: 'inbound',
          role: 'user',
          channel: 'sms',
          content: text,
          author: sender,
          metadata: {
            via: 'textmagic-webhook',
            external_id: messageId,
            receiver,
          },
        })
        // Slice H — conversation became ACTIVE (customer replied on an EXISTING
        // thread, NOT the first inbound). Gated by the per-profile DEFAULT-OFF
        // `notifications.active_conversation_alert` flag and deduped once per
        // thread. EMAIL format with a takeover button. Best-effort; never blocks.
        if (!created) {
          try {
            await notifyActiveConversation({
              profile,
              threadId: thread.id,
              channel: 'sms',
              who: sender,
              message: text,
            })
          } catch {
            // non-fatal
          }
        }
        // Move the store's comms agent onto this thread (no-op unless the store
        // enabled autonomous reply; actual send still gated by OUTBOUND_LIVE_ENABLED).
        try {
          ensureAutonomousSubscription(profile, thread)
        } catch {
          // non-fatal
        }
        let autonomous: Array<unknown> = []
        try {
          autonomous = await maybeAutonomousReply({
            profile,
            threadId: thread.id,
            inboundMessageId: inbound.id,
          })
        } catch {
          // non-fatal
        }
        return json({
          ok: true,
          thread_id: thread.id,
          message_id: inbound.id,
          new_lead: created,
          notified: notified.ok,
          notify_via: notified.via,
          autonomous_replies: autonomous,
        })
      },
    },
  },
})
