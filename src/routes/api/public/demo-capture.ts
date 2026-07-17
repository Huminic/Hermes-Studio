/**
 * POST /api/public/demo-capture   (public — Huminic Motors demo site)
 *
 * The demo lead-capture gate. A visitor on demo.huminic.app submits their OWN
 * name/phone/email to unlock interactive tools. This:
 *   1. REGISTERS the contact in the demo-safe allowlist (so — and ONLY so — the
 *      demo can send real SMS/callback to that one visitor; see demo-comms-guard).
 *   2. Creates a visible lead + thread in the demo tenant's messaging-hub, so it
 *      surfaces on the back-end (Teambox / Activity / dashboard) — the dual-site
 *      "watch the lead appear" moment.
 *   3. Sends ONE demo-safe, watermarked first-touch SMS to the visitor (best
 *      effort — gated by checkCommGate + the demo guard; skipped/unconfigured
 *      until the tenant's SMS number is provisioned or outbound is enabled).
 *
 * Only works for a DEMO profile (isDemoProfile). Body:
 *   { profile, session_id, name?, phone, email, context? }
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
import { dispatchOutbound } from '../../../server/messaging-adapters'
import {
  isDemoProfile,
  registerDemoContact,
  watermarkDemo,
  demoRateOk,
  demoRateRecord,
} from '../../../server/demo-comms-guard'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cross-Origin-Resource-Policy': 'cross-origin',
}
function reply(data: unknown, status = 200): Response {
  return json(data as never, { status, headers: CORS })
}

/** First-touch SMS from the demo assistant. Watermarked by the guard wrapper. */
function firstTouchSms(name: string, config: { branding?: { persona_name?: string } }): string {
  const store = config.branding?.persona_name ?? 'Huminic Motors'
  const who = name ? `${name}, ` : ''
  return `Hi ${who}this is Anastasia with ${store}. Thanks for stopping by — I can help with inventory, pricing, a test drive, or service. What are you looking for today?`
}

export const Route = createFileRoute('/api/public/demo-capture')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const sessionId =
          typeof body.session_id === 'string' && body.session_id.trim()
            ? body.session_id.trim()
            : `demo-${Date.now()}`
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
        const email = typeof body.email === 'string' ? body.email.trim() : ''
        const context = typeof body.context === 'string' ? body.context.trim() : ''

        if (!profile || !isDemoProfile(profile)) {
          return reply({ ok: false, error: 'not a demo profile' }, 400)
        }
        if (!phone && !email) {
          return reply({ ok: false, error: 'phone or email required' }, 400)
        }
        let cfg
        try {
          const r = readStudioConfig(profile)
          if (r.source !== 'file') return reply({ ok: false, error: 'unknown profile' }, 404)
          cfg = r.config
        } catch {
          return reply({ ok: false, error: 'unknown profile' }, 404)
        }

        // 1. Register the visitor in the demo-safe allowlist (this session only).
        registerDemoContact(profile, sessionId, { phone, email })

        // 2. Create the visible lead + thread on the back end.
        const handle = phone || email
        upsertContact({
          profile,
          display_name: name || null,
          identifiers: phone ? { sms: phone } : { email },
        })
        const thread = getOrCreateThread({
          profile,
          domain: 'sales',
          channel: phone ? 'sms' : 'form',
          subject: 'Demo site visitor',
          contact_handle: handle,
        })
        appendMessage({
          thread_id: thread.id,
          direction: 'inbound',
          role: 'user',
          channel: phone ? 'sms' : 'form',
          content: context
            ? `Demo visitor engaged: ${context}`
            : `${name || 'A visitor'} started a session on the demo site.`,
          author: name || handle,
          metadata: { name, phone, email, context, session_id: sessionId, via: 'demo-capture' },
        })
        const notified = await notifyNewLead({
          profile,
          channel: 'demo site',
          event: 'website_form',
          contact_handle: handle,
          name: name || null,
          phone: phone || undefined,
          message: context || 'Engaged on the demo site.',
          subjectPrefix: 'Demo lead',
          cooldownKey: handle,
        }).catch(() => ({ ok: false, via: 'error' as const }))

        // 3. Best-effort demo-safe first-touch SMS (visitor-only; guard-enforced).
        let outreach: { attempted: boolean; status?: string; reason?: string } = {
          attempted: false,
        }
        if (phone && demoRateOk(sessionId, 'sms')) {
          const res = await dispatchOutbound({
            profile,
            channel: 'sms',
            thread,
            content: watermarkDemo(firstTouchSms(name, cfg)),
          }).catch((e) => ({ status: 'error', via: 'sms', error: String(e) }) as const)
          outreach = { attempted: true, status: res.status, reason: (res as { error?: string }).error }
          if (res.status === 'sent') demoRateRecord(sessionId, 'sms')
        }

        return reply({
          ok: true,
          thread_id: thread.id,
          notified: notified.ok,
          outreach,
        })
      },
    },
  },
})
