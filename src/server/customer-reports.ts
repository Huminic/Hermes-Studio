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
import {
  aggregateMessages,
  aggregateThreads,
  aggregateCampaignDeliveries,
  type MessageStats,
  type ThreadStats,
  type CampaignStats,
} from './messaging-hub-store'
import { readStudioConfig } from './studio-config'
import type { StudioConfig } from '../lib/studio-config'

export type CommsReport = {
  window_days: number
  messages: MessageStats
  threads: ThreadStats
}

export type LeadFunnelReport =
  | {
      available: true
      source: 'vin-live'
      total: number
      by_status: Record<string, number>
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
  opts: { now: number; vinTimeoutMs?: number },
): Promise<LeadFunnelReport> {
  if (!hasVinScope(config)) {
    return {
      available: false,
      source: 'none',
      reason:
        'No VIN federation read-scope on this profile. Lead funnel reads live VinSolutions; add a vin scope to studio.yaml federation.read_scopes to enable it.',
    }
  }
  const r = await callCentralMcpTool(
    'vin_query_leads',
    { profile },
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
  return { available: true, source: 'vin-live', total: leads.length, by_status }
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

  const comms: CommsReport = {
    window_days: windowDays,
    messages: aggregateMessages(profile, sinceMs),
    threads: aggregateThreads(profile),
  }
  const campaigns = aggregateCampaignDeliveries(profile)
  const lead_funnel = await buildLeadFunnel(profile, config, {
    now,
    vinTimeoutMs: opts.vinTimeoutMs,
  })

  return { profile, generated_at: now, comms, campaigns, lead_funnel }
}
