/**
 * GET  /api/customer/campaigns?profile=X — list campaigns
 * POST /api/customer/campaigns — create a campaign (body: profile, audience_id, channel, message_template, schedule?, template?)
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../../server/customer-auth'
import {
  createCampaign,
  listCampaigns,
} from '../../../../server/messaging-hub-store'
import { listCampaignTemplates } from '../../../../server/campaign-templates'

export const Route = createFileRoute('/api/customer/campaigns/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) {
          return json({ ok: false, error: 'profile required' }, { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        return json({
          ok: true,
          campaigns: listCampaigns(profile),
          templates: listCampaignTemplates(profile),
        })
      },
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const audienceId =
          typeof body.audience_id === 'string' ? body.audience_id : ''
        const channel = typeof body.channel === 'string' ? body.channel : ''
        const messageTemplate =
          typeof body.message_template === 'string'
            ? body.message_template
            : ''
        const schedule =
          typeof body.schedule === 'number' ? body.schedule : null
        const template =
          typeof body.template === 'string' ? body.template : null
        if (!profile || !audienceId || !channel || !messageTemplate) {
          return json(
            {
              ok: false,
              error:
                'profile, audience_id, channel, message_template required',
            },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const campaign = createCampaign({
          profile,
          audience_id: audienceId,
          channel,
          message_template: messageTemplate,
          schedule,
          template,
        })
        return json({ ok: true, campaign })
      },
    },
  },
})
