/**
 * Campaign send worker — AC.8.4.
 *
 * Picks scheduled campaigns whose send_at has elapsed, resolves their
 * audience, dispatches one message per contact via the right adapter,
 * and advances the campaign through in_progress → complete.
 *
 * The worker is invoked by an internal endpoint (POST /api/admin/campaigns/tick)
 * which the operator can hit via cron or a Hermes scheduled job. It's
 * idempotent: re-running it doesn't re-send already-delivered contacts.
 */

import {
  getAudience,
  listCampaigns,
  listCampaignDeliveries,
  recordCampaignDelivery,
  getOrCreateThread,
  appendMessage,
  updateCampaignStatus,
  type Campaign,
  type Contact,
} from './messaging-hub-store'
import { dispatchOutbound } from './messaging-adapters'
import { resolveAudience } from './audience-resolver'

export type CampaignTickResult = {
  campaign_id: string
  status: Campaign['status']
  sent: number
  failed: number
  skipped: number
  simulated?: number
}

function pickHandle(contact: Contact, channel: string): string | null {
  // Match the most-specific identifier for the channel.
  if (channel === 'email' && contact.identifiers.email) {
    return contact.identifiers.email
  }
  if ((channel === 'sms' || channel === 'textmagic') && contact.identifiers.sms) {
    return contact.identifiers.sms
  }
  if ((channel === 'voice' || channel === 'phone') && contact.identifiers.phone) {
    return contact.identifiers.phone
  }
  // Fall back to first identifier present
  const first = Object.values(contact.identifiers)[0]
  return first ?? null
}

function renderTemplate(template: string, contact: Contact): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    if (key === 'first_name') {
      const name = contact.display_name ?? ''
      return name.split(' ')[0] ?? ''
    }
    if (key === 'last_name') {
      const parts = (contact.display_name ?? '').split(' ')
      return parts.slice(1).join(' ')
    }
    return ''
  })
}

export async function tickCampaigns(input: {
  profile: string
  now?: number
}): Promise<Array<CampaignTickResult>> {
  const now = input.now ?? Date.now()
  const out: Array<CampaignTickResult> = []
  for (const c of listCampaigns(input.profile)) {
    if (c.status === 'complete' || c.status === 'failed' || c.status === 'draft') {
      continue
    }
    if (c.schedule && c.schedule > now) {
      continue
    }
    updateCampaignStatus(input.profile, c.id, 'in_progress')
    const audience = getAudience(input.profile, c.audience_id)
    if (!audience) {
      updateCampaignStatus(input.profile, c.id, 'failed')
      out.push({
        campaign_id: c.id,
        status: 'failed',
        sent: 0,
        failed: 0,
        skipped: 0,
      })
      continue
    }
    const contacts = resolveAudience({
      profile: input.profile,
      query: audience.query,
    })
    const previousDeliveries = new Set(
      listCampaignDeliveries(input.profile, c.id).map((d) => d.contact_id),
    )
    let sent = 0
    let failed = 0
    let skipped = 0
    let simulated = 0
    for (const contact of contacts) {
      if (previousDeliveries.has(contact.id)) {
        skipped++
        continue
      }
      const handle = pickHandle(contact, c.channel)
      if (!handle) {
        recordCampaignDelivery({
          profile: input.profile,
          campaign_id: c.id,
          contact_id: contact.id,
          thread_id: null,
          status: 'failed',
          error: `No handle for channel ${c.channel}`,
        })
        failed++
        continue
      }
      const message = renderTemplate(c.message_template, contact)
      const thread = getOrCreateThread({
        profile: input.profile,
        domain: 'service',
        channel: c.channel,
        contact_handle: handle,
        subject: `campaign · ${c.id.slice(0, 6)}`,
      })
      const adapterResult = await dispatchOutbound({
        profile: input.profile,
        channel: c.channel,
        thread,
        content: message,
      })
      appendMessage({
        thread_id: thread.id,
        direction: 'outbound',
        role: 'assistant',
        channel: c.channel,
        content: message,
        author: 'campaign',
        metadata: {
          campaign_id: c.id,
          adapter_status: adapterResult.status,
          via: adapterResult.via,
        },
      })
      if (adapterResult.status === 'simulated') {
        // Local-only record (e.g. chat) — nothing was actually delivered to a
        // real recipient, so it must NOT count as a 'sent' delivery (that would
        // inflate campaign reach). Tracked separately.
        simulated++
      } else if (adapterResult.status === 'sent') {
        recordCampaignDelivery({
          profile: input.profile,
          campaign_id: c.id,
          contact_id: contact.id,
          thread_id: thread.id,
          status: 'sent',
        })
        sent++
      } else {
        recordCampaignDelivery({
          profile: input.profile,
          campaign_id: c.id,
          contact_id: contact.id,
          thread_id: thread.id,
          status: 'failed',
          error: adapterResult.error ?? adapterResult.status,
        })
        failed++
      }
    }
    updateCampaignStatus(input.profile, c.id, 'complete')
    out.push({
      campaign_id: c.id,
      status: 'complete',
      sent,
      failed,
      skipped,
      simulated,
    })
  }
  return out
}
