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
import { readStudioConfig } from './studio-config'

export type CampaignTickResult = {
  campaign_id: string
  status: Campaign['status']
  sent: number
  failed: number
  skipped: number
  simulated?: number
  /** Template vars that had no data source for this campaign (deduped). */
  unresolved_vars?: Array<string>
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

/**
 * Audience-query keys that are FILTER directives, not template variables.
 * Everything else on an audience query is treated as an operator-authored
 * campaign-level parameter (e.g. recall_id, vehicle_year) usable in templates.
 */
const RESERVED_AUDIENCE_KEYS = new Set([
  'channel',
  'tags',
  'last_contacted_before',
  'last_contacted_after',
])

/** Render context resolved per delivery: contact + campaign + profile vars. */
export type RenderContext = Record<string, string>

/**
 * Resolve the `dealer_name` a campaign speaks as, from the profile's
 * studio.yaml: `vin.watcher.dealer_name` if present, else
 * `branding.persona_name`. Mirrors the documented fallback in studio-config.
 */
function resolveDealerName(profile: string): string {
  const { config } = readStudioConfig(profile)
  return (
    config.vin?.watcher?.dealer_name ?? config.branding?.persona_name ?? ''
  )
}

/**
 * Build the per-delivery render context by merging (lowest→highest priority):
 *   1. profile-derived vars (dealer_name)
 *   2. campaign-level params (operator-authored, non-filter audience-query keys)
 *   3. contact-derived vars (first_name, last_name from display_name)
 *
 * Campaign params come from the audience query because that's the only
 * operator-authored free-form carrier that reaches the worker — Campaign and
 * Contact rows carry no vehicle/recall/service fields (see WS-5 report).
 */
function buildRenderContext(input: {
  contact: Contact
  profile: string
  campaignParams: Record<string, unknown>
}): RenderContext {
  const ctx: RenderContext = {}

  // 1. profile-derived
  const dealer = resolveDealerName(input.profile)
  if (dealer) ctx.dealer_name = dealer

  // 2. campaign-level params (skip reserved filter keys + nullish values)
  for (const [k, v] of Object.entries(input.campaignParams)) {
    if (RESERVED_AUDIENCE_KEYS.has(k)) continue
    if (v === null || v === undefined) continue
    ctx[k] = String(v).trim()
  }

  // 3. contact-derived (authoritative for first/last name)
  const name = (input.contact.display_name ?? '').trim()
  ctx.first_name = name.split(/\s+/)[0] ?? ''
  ctx.last_name = name.includes(' ')
    ? name.split(/\s+/).slice(1).join(' ')
    : ''

  return ctx
}

/**
 * Substitute every `{{var}}` placeholder from `context`. Unknown variables
 * render to an empty string but are collected in `unresolved` so the absence
 * is visible (counted/logged), never silent.
 */
function renderTemplate(
  template: string,
  context: RenderContext,
): { text: string; unresolved: Array<string> } {
  const unresolved: Array<string> = []
  const text = template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const value = context[key]
    if (value === undefined || value === '') {
      if (!unresolved.includes(key)) unresolved.push(key)
      return ''
    }
    return value
  })
  return { text, unresolved }
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
    const unresolvedVars = new Set<string>()
    // Operator-authored campaign-level params (recall_id, vehicle_year, …) ride
    // on the audience query alongside its filter keys.
    const campaignParams = (audience.query ?? {}) as Record<string, unknown>
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
      const renderContext = buildRenderContext({
        contact,
        profile: input.profile,
        campaignParams,
      })
      const rendered = renderTemplate(c.message_template, renderContext)
      const message = rendered.text
      for (const v of rendered.unresolved) unresolvedVars.add(v)
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
    const unresolved = [...unresolvedVars]
    if (unresolved.length > 0) {
      // Visible, not silent: these placeholders had no data source for this
      // campaign and rendered empty. Operator must supply them (on the
      // audience query) or edit the template.
      console.warn(
        `[campaign-worker] campaign ${c.id} (${input.profile}) had unresolved template vars: ${unresolved.join(', ')}`,
      )
    }
    out.push({
      campaign_id: c.id,
      status: 'complete',
      sent,
      failed,
      skipped,
      simulated,
      ...(unresolved.length > 0 ? { unresolved_vars: unresolved } : {}),
    })
  }
  return out
}
