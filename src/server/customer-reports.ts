/**
 * Customer reports (P3 native reports) — the Data page backend.
 *
 * Mirrors the Nexxus Insights model: hardcoded rollups over the operational
 * store, surfaced as a customer-facing dashboard. Three report blocks:
 *
 *   1. Comms volume    — message counts (in/out, per channel) + sales/service
 *                        thread split, over the messaging-hub.db for the profile.
 *   2. Campaigns       — campaign counts by status + delivery sent/failed totals.
 *   3. Lead funnel     — LIVE federated VinSolutions. VIN is queried live via
 *                        central-mcp (`vin_query_leads`) only when the profile
 *                        declares a VIN federation read-scope; it is NEVER synced
 *                        and the Brain never holds it. When the scope is absent or
 *                        VIN is unconfigured/unreachable, the block is marked
 *                        unavailable with a reason — no fabricated numbers.
 *
 * Locked scope (operator-confirmed): reports are native over live federated VIN
 * + Brain. No Metabase warehouse, no VIN sync.
 */

import { callCentralMcpTool } from './central-mcp'
import { resolveLeadNames, resolveVinOrgId } from './vin-client'
import {
  aggregateCampaignDeliveries,
  aggregateMessages,
  aggregateMessagesByAuthor,
  aggregateThreads
} from './messaging-hub-store'
import { openBrain } from './brain-store'
import { WATCHER_AUTHOR } from './vin-watcher'
import { readStudioConfig } from './studio-config'
import type {CampaignStats, MessageStats, ThreadStats} from './messaging-hub-store';
import type { StudioConfig } from '../lib/studio-config'

export type CommsReport = {
  window_days: number
  messages: MessageStats
  threads: ThreadStats
  /** Convenience metric callouts the operator's dashboard tiles map to. */
  calls_in: number
  texts_out: number
}

/**
 * Immediate + 24h follow-up performance (WS-2 vin-watcher). Combines the
 * per-profile Brain trigger ledger (`vin_watcher_trigger`: how many distinct
 * phones got an `immediate` vs `checkin` trigger, and the most-recent fire)
 * with the hub messages the watcher actually authored (sent into a thread).
 */
export type FollowupReport = {
  /** Distinct phones that received an immediate first-touch trigger. */
  immediate_triggers: number
  /** Distinct phones that received a 24h check-in trigger. */
  checkin_triggers: number
  /** Most-recent trigger fire across both kinds (epoch ms), or null. */
  last_fire: number | null
  /** Follow-up texts the watcher authored into the hub. */
  sends: { total: number; outbound: number; by_channel: Record<string, number> }
}

/** A recent lead with its VIN-resolved name (two-step), for the funnel display. */
export type LeadFunnelEntry = {
  name: string | null
  status: string
  vehicle: string | null
  created: string | null
}

export type LeadFunnelReport =
  | {
      available: true
      source: 'vin-live'
      total: number
      by_status: Record<string, number>
      /** Most-recent leads with resolved names (≤ rate cap). */
      recent: Array<LeadFunnelEntry>
      /** How many leads had names resolved via vin_get_contact this build. */
      resolved_names: number
    }
  | {
      available: false
      source: 'vin-live' | 'none'
      reason: string
    }

export type CustomerReports = {
  profile: string
  generated_at: number
  comms: CommsReport
  followups: FollowupReport
  campaigns: CampaignStats
  lead_funnel: LeadFunnelReport
}

const DEFAULT_WINDOW_DAYS = 30

/** True when the profile's federation read-scopes authorize live VIN access. */
export function hasVinScope(config: StudioConfig): boolean {
  return (config.federation?.read_scopes ?? []).some((s) =>
    s.toLowerCase().includes('vin'),
  )
}

/**
 * Coerce a central-mcp `vin_query_leads` payload into a list of lead records.
 * VIN's response shape isn't owned by us, so accept the common shapes
 * (bare array, {leads:[…]}, {data:[…]}, {results:[…]}) and bail otherwise.
 */
function extractLeads(data: unknown): Array<Record<string, unknown>> | null {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>
  if (data && typeof data === 'object') {
    for (const key of ['leads', 'data', 'results', 'records']) {
      const v = (data as Record<string, unknown>)[key]
      if (Array.isArray(v)) return v as Array<Record<string, unknown>>
    }
  }
  return null
}

function statusOf(lead: Record<string, unknown>): string {
  for (const key of ['status', 'lead_status', 'stage', 'disposition']) {
    const v = lead[key]
    if (typeof v === 'string' && v.trim()) return v.trim().toLowerCase()
  }
  return 'unknown'
}

async function buildLeadFunnel(
  profile: string,
  config: StudioConfig,
  opts: { now: number; sinceMs: number; vinTimeoutMs?: number },
): Promise<LeadFunnelReport> {
  if (!hasVinScope(config)) {
    return {
      available: false,
      source: 'none',
      reason:
        'No VIN federation read-scope on this profile. Lead funnel reads live VinSolutions; add a vin scope to studio.yaml federation.read_scopes to enable it.',
    }
  }
  // VIN is keyed by the Nexxus org UUID (not the profile slug). Without it the
  // broker can't map to the dealer — surface the gap rather than send a bad id.
  const org = resolveVinOrgId(profile, config)
  if (!org.ok) {
    return { available: false, source: 'vin-live', reason: org.reason }
  }
  // vin_query_leads requires an ISO date window (startDate/endDate are not
  // optional on the broker schema); derive it from the report window.
  const r = await callCentralMcpTool(
    'vin_query_leads',
    {
      orgId: org.orgId,
      startDate: new Date(opts.sinceMs).toISOString(),
      endDate: new Date(opts.now).toISOString(),
    },
    { timeoutMs: opts.vinTimeoutMs ?? 15_000 },
  )
  if (!r.ok) {
    return {
      available: false,
      source: 'vin-live',
      reason: r.unconfigured
        ? 'central-mcp / VinSolutions not configured (token missing).'
        : `VinSolutions query failed: ${r.error}`,
    }
  }
  const leads = extractLeads(r.data)
  if (!leads) {
    return {
      available: false,
      source: 'vin-live',
      reason: 'Unexpected VinSolutions response shape (no lead list found).',
    }
  }
  const by_status: Record<string, number> = {}
  for (const lead of leads) {
    const s = statusOf(lead)
    by_status[s] = (by_status[s] ?? 0) + 1
  }
  // Two-step: enrich the most-recent leads with real names (≤ rate cap).
  const cap = config.vin.name_resolve_cap
  const resolved = await resolveLeadNames(leads, {
    orgId: org.orgId,
    cap,
    timeoutMs: opts.vinTimeoutMs ?? 15_000,
  })
  const recent: Array<LeadFunnelEntry> = resolved
    .slice(0, cap)
    .map((lead) => ({
      name: lead.resolved_name,
      status: statusOf(lead),
      vehicle:
        (typeof lead.vehicleOfInterest === 'string' && lead.vehicleOfInterest) ||
        (typeof lead.vehicle === 'string' && lead.vehicle) ||
        null,
      created:
        (typeof lead.createdUtc === 'string' && lead.createdUtc) ||
        (typeof lead.created === 'string' && lead.created) ||
        null,
    }))
  const resolved_names = resolved.filter((l) => l.resolved_name).length
  return {
    available: true,
    source: 'vin-live',
    total: leads.length,
    by_status,
    recent,
    resolved_names,
  }
}

/**
 * Read the vin-watcher follow-up performance for a profile. The trigger ledger
 * is per-profile in the Brain (`vin_watcher_trigger`), so a failed/absent Brain
 * yields zeros rather than an error — the Data page shows "no follow-ups yet".
 */
function buildFollowupReport(profile: string, sinceMs: number): FollowupReport {
  let immediate_triggers = 0
  let checkin_triggers = 0
  let last_fire: number | null = null
  try {
    const h = openBrain(profile)
    // The table is created lazily by the watcher; guard with IF EXISTS via a
    // try/catch so a profile that never ran the watcher just reports zeros.
    h.exec(
      `CREATE TABLE IF NOT EXISTS vin_watcher_trigger (
         phone TEXT, kind TEXT, ts INTEGER, PRIMARY KEY (phone, kind)
       )`,
    )
    const rows = h.all<{ kind: string; n: number; latest: number }>(
      `SELECT kind, COUNT(*) AS n, MAX(ts) AS latest
         FROM vin_watcher_trigger GROUP BY kind`,
    )
    for (const r of rows) {
      if (r.kind === 'immediate') immediate_triggers = r.n
      else if (r.kind === 'checkin') checkin_triggers = r.n
      if (typeof r.latest === 'number')
        last_fire = last_fire === null ? r.latest : Math.max(last_fire, r.latest)
    }
  } catch {
    // Brain unavailable → report zeros (the hub sends below still surface).
  }
  const authored = aggregateMessagesByAuthor(profile, WATCHER_AUTHOR, sinceMs)
  return {
    immediate_triggers,
    checkin_triggers,
    last_fire,
    sends: {
      total: authored.total,
      outbound: authored.outbound,
      by_channel: authored.by_channel,
    },
  }
}

/**
 * Assemble the full report set for a profile. `now`/`windowDays` are injectable
 * for tests. Comms + campaigns are always available (local store); the lead
 * funnel is live-federated and may be unavailable with a reason.
 */
export async function buildCustomerReports(
  profile: string,
  opts: { now?: number; windowDays?: number; vinTimeoutMs?: number } = {},
): Promise<CustomerReports> {
  const now = opts.now ?? Date.now()
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS
  const sinceMs = now - windowDays * 24 * 60 * 60 * 1000
  const { config } = readStudioConfig(profile)

  const messages = aggregateMessages(profile, sinceMs)
  const comms: CommsReport = {
    window_days: windowDays,
    messages,
    threads: aggregateThreads(profile),
    // calls in = inbound voice; texts out = outbound sms (incl. watcher).
    calls_in: messages.by_channel.voice?.inbound ?? 0,
    texts_out: messages.by_channel.sms?.outbound ?? 0,
  }
  const followups = buildFollowupReport(profile, sinceMs)
  const campaigns = aggregateCampaignDeliveries(profile)
  const lead_funnel = await buildLeadFunnel(profile, config, {
    now,
    sinceMs,
    vinTimeoutMs: opts.vinTimeoutMs,
  })

  return {
    profile,
    generated_at: now,
    comms,
    followups,
    campaigns,
    lead_funnel,
  }
}
