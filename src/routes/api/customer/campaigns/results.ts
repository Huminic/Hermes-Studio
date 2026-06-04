/**
 * GET /api/customer/campaigns/results?profile=X&campaign_id=Y
 *
 * Per-campaign results in plain-language-ready numbers: how many people the
 * campaign targets (audience size), how many messages were delivered, and how
 * many failed. Reused by the customer Campaigns page results view.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../../server/customer-auth'
import {
  getAudience,
  getCampaign,
  listCampaignDeliveries,
} from '../../../../server/messaging-hub-store'
import { resolveAudience } from '../../../../server/audience-resolver'

export const Route = createFileRoute('/api/customer/campaigns/results')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        const campaignId = url.searchParams.get('campaign_id') ?? ''
        if (!profile || !campaignId) {
          return json(
            { ok: false, error: 'profile and campaign_id required' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const campaign = getCampaign(profile, campaignId)
        if (!campaign) {
          return json({ ok: false, error: 'Not found' }, { status: 404 })
        }
        const audience = getAudience(profile, campaign.audience_id)
        const audienceSize = audience
          ? resolveAudience({ profile, query: audience.query }).length
          : 0
        const deliveries = listCampaignDeliveries(profile, campaignId)
        let delivered = 0
        let failed = 0
        for (const d of deliveries) {
          if (d.status === 'sent') delivered++
          else if (d.status === 'failed') failed++
        }
        return json({
          ok: true,
          results: {
            campaign_id: campaignId,
            status: campaign.status,
            audience_name: audience?.name ?? null,
            audience_size: audienceSize,
            delivered,
            failed,
          },
        })
      },
    },
  },
})
