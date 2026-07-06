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
import {
  addToBlacklist,
  removeFromBlacklist,
} from '../../../server/comms-blacklist'
import { readStudioConfig } from '../../../server/studio-config'
import { canonicalizeContactHandle } from '../../../server/phone-handle'

/** TCPA opt-out / opt-in keywords (carrier-standard). Matched on the first word. */
const STOP_RE = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|optout|opt-out)\b/i
const START_RE = /^\s*(start|unstop|yes|subscribe)\b/i

/**
 * Read the profile's own sending number (`SMS_FROM`) from its `.env`, used to
 * detect TextMagic delivery-report echoes (a callback whose sender IS our own
 * number). Falls back to the process-level `SMS_FROM`. Null when unknown.
 */
function readOurNumber(profile: string): string | null {
  try {
    const file = path.join(os.homedir(), '.hermes', 'profiles', profile, '.env')
    const raw = fs.readFileSync(file, 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      if (trimmed.slice(0, eq).trim() === 'SMS_FROM') {
        return trimmed.slice(eq + 1).trim() || null
      }
    }
  } catch {
    // missing per-profile env is fine
  }
  return process.env.SMS_FROM ?? null
}

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
          // TextMagic posts multipart/form-data (callback format "m") for BOTH
          // inbound SMS and delivery receipts; some setups use urlencoded.
          // request.formData() parses both — URLSearchParams alone does NOT
          // handle multipart, so inbound would silently fail to parse.
          try {
            const fd = await request.formData()
            for (const [k, v] of fd) body[k] = typeof v === 'string' ? v : ''
          } catch {
            try {
              const text = await request.text()
              for (const [k, v] of new URLSearchParams(text)) body[k] = v
            } catch {
              // leave body empty — handled as a non-inbound callback below (200)
            }
          }
        }
        // Canonicalize the sender to E.164 (+…) up front so the thread lands on
        // the SAME thread as the outbound conversation, and so STOP/START
        // opt-out matching agrees with the outbound recipient handle. TextMagic
        // posts the sender WITHOUT a leading '+'. Empty (delivery receipts) stays
        // empty so the non-inbound branch below still triggers.
        const rawSender = body.sender ?? body.from ?? ''
        const sender = rawSender ? canonicalizeContactHandle('sms', rawSender) : ''
        const receiver = body.receiver ?? body.to ?? ''
        const text = body.text ?? body.message ?? ''
        // TextMagic's inbound webhook posts the message id as `id`; keep the
        // older aliases as fallbacks for other payload shapes.
        const messageId =
          body.id ?? body.messageId ?? body.message_id ?? null
        // TextMagic's outUrl points at this SAME path, so we also receive
        // DELIVERY RECEIPTS and other non-inbound callbacks — those have no
        // inbound sender/text. We must ALWAYS reply 200: a non-200 makes
        // TextMagic mark the callback invalid and stop delivering. Only a
        // payload carrying BOTH a sender and text is a real inbound message.
        if (!sender || !text) {
          const status =
            body.status ?? body.messageStatus ?? body.deliveryStatus ?? null
          return json({
            ok: true,
            ignored: true,
            kind: status ? 'delivery_receipt' : 'non_message',
            status,
            message_id: messageId,
          })
        }
        // DELIVERY-REPORT / ECHO GUARD. TextMagic posts delivery-status callbacks
        // for messages WE sent to this SAME URL. Unlike a bare receipt, they can
        // carry sender=<our number>, receiver=<customer>, the message text, AND a
        // status — so they slip past the !sender||!text check and were being
        // recorded as PHANTOM inbounds on our OWN number (BDC-spam + agent
        // self-reply-loop risk). A real inbound is addressed TO our number and
        // has no delivery status. Drop the echo before recording an inbound.
        const ourNumber = readOurNumber(profile)
        const deliveryStatus =
          body.status ?? body.messageStatus ?? body.deliveryStatus ?? null
        const senderIsOurs = ourNumber
          ? canonicalizeContactHandle('sms', ourNumber) === sender
          : false
        // sender==ours is definitive when we know our number; otherwise fall back
        // to the delivery-status signal (avoids dropping real inbounds blindly).
        if (senderIsOurs || (!ourNumber && deliveryStatus)) {
          return json({
            ok: true,
            ignored: true,
            kind: 'delivery_report',
            reason: senderIsOurs ? 'sender-is-own-number' : 'delivery-status-present',
            status: deliveryStatus,
            message_id: messageId,
          })
        }
        upsertContact({
          profile,
          display_name: null,
          identifiers: { sms: sender },
        })
        // TCPA opt-out / opt-in. A STOP adds the sender to the per-profile
        // blacklist so CommGate refuses all future outbound to them; a START
        // clears it. We still record the inbound message (audit) but suppress
        // any autonomous reply on a STOP so the AI never texts back after opt-out.
        const isStop = STOP_RE.test(text)
        const isStart = START_RE.test(text)
        if (isStop) {
          addToBlacklist(profile, sender, 'STOP (inbound SMS)')
        } else if (isStart) {
          removeFromBlacklist(profile, sender)
        }
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
        if (!isStop) {
          try {
            autonomous = await maybeAutonomousReply({
              profile,
              threadId: thread.id,
              inboundMessageId: inbound.id,
            })
          } catch {
            // non-fatal
          }
        }
        return json({
          ok: true,
          thread_id: thread.id,
          message_id: inbound.id,
          new_lead: created,
          notified: notified.ok,
          notify_via: notified.via,
          opt_out: isStop,
          opt_in: isStart,
          autonomous_replies: autonomous,
        })
      },
    },
  },
})
