/**
 * POST /api/messaging/inbound
 *
 * Generic inbound endpoint that the channel adapters (TextMagic / Vapi /
 * Tavus / email) call after normalizing their provider-specific webhook
 * payload. Auth is by a per-profile shared secret (HERMES_INBOUND_TOKEN
 * in the profile .env) so adapters can post without holding a customer-
 * admin session.
 *
 * Body: {
 *   profile, channel, domain, contact_handle, contact_identifiers?,
 *   subject?, body, author?, agent_id?, raw_payload?
 * }
 *
 * For email channel, the body is inspected with isAdfXml() — if it
 * looks like ADF, lead_meta is populated with the parsed structure and
 * the thread is tagged channel: 'email-adf'.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  appendMessage,
  getOrCreateThreadEx,
  upsertContact,
} from '../../../server/messaging-hub-store'
import { isAdfXml, parseAdfXml } from '../../../server/adf-xml'
import {
  ensureAutonomousSubscription,
  maybeAutonomousReply,
} from '../../../server/agent-autonomous-reply'
import { notifyNewLead } from '../../../server/lead-notifications'
import { applyOptOutKeyword } from '../../../server/comms-blacklist'

function readInboundTokenFor(profile: string): string | null {
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
      const k = trimmed.slice(0, eq).trim()
      if (k === 'HERMES_INBOUND_TOKEN') return trimmed.slice(eq + 1).trim()
    }
  } catch {
    // missing per-profile env is fine
  }
  return process.env.HERMES_INBOUND_TOKEN ?? null
}

function checkInboundAuth(request: Request, profile: string): boolean {
  const required = readInboundTokenFor(profile)
  if (!required) {
    // No token configured → only allow if global auth is also disabled
    // (dev mode). This prevents wide-open inbound in prod where no
    // adapter has yet been credentialed.
    return !process.env.HERMES_PASSWORD
  }
  const provided =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    request.headers.get('x-inbound-token')
  return provided === required
}

export const Route = createFileRoute('/api/messaging/inbound')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        if (!profile) {
          return json({ ok: false, error: 'profile required' }, { status: 400 })
        }
        if (!checkInboundAuth(request, profile)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let channel = typeof body.channel === 'string' ? body.channel : 'chat'
        const domain = typeof body.domain === 'string' ? body.domain : 'sales'
        const handle =
          typeof body.contact_handle === 'string'
            ? body.contact_handle
            : `anon-${Date.now()}`
        const subject =
          typeof body.subject === 'string' ? body.subject : undefined
        const messageBody = typeof body.body === 'string' ? body.body : ''
        const author = typeof body.author === 'string' ? body.author : handle
        const assignedAgent =
          typeof body.agent_id === 'string' ? body.agent_id : null
        const identifiers =
          typeof body.contact_identifiers === 'object' &&
          body.contact_identifiers !== null
            ? (body.contact_identifiers as Record<string, string>)
            : { [channel]: handle }

        let leadMeta: unknown = null
        if (channel === 'email' && isAdfXml(messageBody)) {
          leadMeta = parseAdfXml(messageBody)
          channel = 'email-adf'
        }

        upsertContact({
          profile,
          display_name:
            typeof body.display_name === 'string' ? body.display_name : null,
          identifiers,
        })
        const { thread, created } = getOrCreateThreadEx({
          profile,
          domain,
          channel,
          contact_handle: handle,
          subject,
          assigned_agent_id: assignedAgent,
        })
        // A brand-new thread from a normalized adapter inbound (email-ADF lead,
        // Tavus session, generic chat, …) is a new lead — alert the dealer once.
        // Reused thread = a reply in an ongoing conversation → no re-notify.
        // NOTE: channels with their own dedicated receiver (TextMagic webhook,
        // Vapi end-of-call webhook) notify there, not here; if an adapter is ever
        // wired to BOTH, #207 (smart routing) owns the dedup.
        let notified: { ok: boolean; via?: string } = { ok: false, via: 'skipped' }
        if (created) {
          const adfName =
            leadMeta && typeof leadMeta === 'object'
              ? ((leadMeta as { customer?: { full_name?: string } }).customer
                  ?.full_name ?? null)
              : null
          notified = await notifyNewLead({
            profile,
            channel,
            contact_handle: handle,
            name:
              adfName ??
              (typeof body.display_name === 'string' ? body.display_name : null),
            email: identifiers.email ?? null,
            phone: identifiers.sms ?? identifiers.phone ?? null,
            message: messageBody,
            subjectPrefix: `Inbound ${channel}`,
          })
        }
        const inbound = appendMessage({
          thread_id: thread.id,
          direction: 'inbound',
          role: 'user',
          channel,
          content: messageBody,
          author,
          metadata: {
            lead_meta: leadMeta,
            raw_payload:
              typeof body.raw_payload === 'object' ? body.raw_payload : null,
          },
        })

        // TCPA opt-out / opt-in on phone-channel inbound — PARITY with the
        // TextMagic webhook so an adapter posting sms/voice here also honors STOP
        // (blacklist) and never auto-replies after opt-out. No-op for chat/email.
        const optOut = applyOptOutKeyword({ profile, channel, handle, text: messageBody })

        // Move the store's comms agent onto this thread (no-op unless the store
        // enabled autonomous reply; actual send still gated by OUTBOUND_LIVE_ENABLED).
        try {
          ensureAutonomousSubscription(profile, thread)
        } catch {
          // non-fatal
        }
        // Fire agent-autonomous reply if any agents are subscribed in
        // mode: reply. Errors here are non-fatal — adapter still gets a 200.
        let autoResults: Array<unknown> = []
        if (!optOut.stop) {
          try {
            autoResults = await maybeAutonomousReply({
              profile,
              threadId: thread.id,
              inboundMessageId: inbound.id,
            })
          } catch {
            // continue
          }
        }

        return json({
          ok: true,
          thread_id: thread.id,
          message_id: inbound.id,
          channel,
          lead_meta: leadMeta,
          opt_out: optOut.stop,
          opt_in: optOut.start,
          autonomous_replies: autoResults,
        })
      },
    },
  },
})
