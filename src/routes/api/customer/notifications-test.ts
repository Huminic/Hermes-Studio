/**
 * POST /api/customer/notifications-test — send a SAMPLE lead notification to a
 * single recipient using a chosen template, so the dealer can preview exactly
 * what an alert looks like (#NW).
 *
 * Body: { profile, to, format?: 'email' | 'adf-xml', label? }
 *
 * It builds a representative {@link AdfLead} (name, phone, a short call summary,
 * and a recording link so the transcript/recording affordance shows) and routes
 * it through the SAME production path the webhooks use ({@link notifyDealer} →
 * {@link renderDealerNotificationEmail}). The email is therefore byte-identical
 * to a real Vapi/Tavus/widget lead alert — there is no separate "test" template.
 * The subject is prefixed "[TEST]" so a preview is never mistaken for a real lead.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import { notifyDealer } from '../../../server/lead-notifications'
import type { AdfLead } from '../../../server/adf-xml'

export const Route = createFileRoute('/api/customer/notifications-test')({
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
        const to = typeof body.to === 'string' ? body.to.trim() : ''
        const format =
          body.format === 'adf-xml'
            ? 'adf-xml'
            : body.format === 'email'
              ? 'email'
              : undefined
        if (!profile) {
          return json({ ok: false, error: 'profile required' }, { status: 400 })
        }
        if (!to || !to.includes('@')) {
          return json(
            { ok: false, error: 'a valid recipient email is required' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }

        const sample: AdfLead = {
          request_date: new Date().toISOString(),
          customer: {
            first_name: 'Sample',
            last_name: 'Customer',
            full_name: 'Sample Customer',
            phone: '+15551234567',
            preferred_contact: 'phone',
          },
          vehicles: [],
          comments:
            'This is a SAMPLE lead notification sent from the Notifications page so you can confirm how alerts look and where they land. No action is needed.',
          vendor: { name: 'Phone call' },
          recording_url: 'https://example.com/sample-call-recording.mp3',
          recording_kind: 'audio',
        }

        const result = await notifyDealer({
          profile,
          event: sample,
          subjectPrefix: '[TEST] New AI voice lead',
          forceTo: to,
          forceFormat: format,
        })

        if (!result.ok) {
          return json(
            { ok: false, error: result.reason ?? `not sent (${result.via})`, via: result.via },
            { status: 502 },
          )
        }
        return json({ ok: true, external_id: result.external_id ?? null, format: result.format })
      },
    },
  },
})
