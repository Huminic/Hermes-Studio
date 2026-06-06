/**
 * POST /api/webhooks/textmagic/$profile
 *
 * TextMagic inbound SMS webhook receiver. Mirrors the field shape
 * TextMagic posts (text, sender, receiver, messageTime, messageId, ...).
 *
 * Lands the SMS as an inbound thread in messaging-hub (channel: 'sms',
 * domain: 'service' by default — TextMagic carries the dealer's service
 * number historically; widget frontmatter or `?domain=sales` query can
 * override).
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
import { maybeAutonomousReply } from '../../../server/agent-autonomous-reply'
import { notifyNewLead } from '../../../server/lead-notifications'

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
        const messageId = body.messageId ?? body.message_id ?? null
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
        const url = new URL(request.url)
        const domain = url.searchParams.get('domain') ?? 'service'
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
        let notified: { ok: boolean; via?: string } = { ok: false, via: 'skipped' }
        if (created) {
          notified = await notifyNewLead({
            profile,
            channel: 'SMS',
            contact_handle: sender,
            phone: sender,
            message: text,
            subjectPrefix: 'Inbound SMS',
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
