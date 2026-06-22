/**
 * Lead opportunities — defensible lead COUNTS from the live VinSolutions API.
 *
 * The dashboard funnel's Leads stage must reconcile to the CRM. The uploaded ROI
 * report's `total_leads` column includes BAD + DUPLICATE rows and blends service,
 * inflating the count ~1.7–2x. This module instead derives counts from the
 * lead-level API (`vin_query_leads`), which carries `contact` (customer id),
 * `leadType`, and `leadStatusType` — enough to scope to SALES, drop BAD, and
 * dedupe by contact, which the pre-summed report cannot.
 *
 * Rules (grounded on a live hyundai-of-columbia sample, 2026-05-20→06-19, all 60
 * pages — see work/2026-06-19-dashboard-data-investigation.md, NOT assumed):
 *   - leadType:       SALES = INTERNET | PHONE | WALK_IN ;
 *                     dropped (non-sales) = SERVICE | PARTS_ORDER
 *   - leadStatusType: dropped = BAD ;  SOLD marks a sold opportunity
 *   - dedupe key:     `contact` (fall back to leadId when a row carries no contact)
 *
 * The pure core `summarizeOpportunities` is unit-tested with fixtures; the IO
 * wrapper `buildLeadOpportunities` paginates EVERY page before summarizing (the
 * legacy `buildLeadFunnel` only read the first page). Timing / gross / appts /
 * sold-detail come from the uploaded report, never from here.
 */

import { callCentralMcpTool } from './central-mcp'
import { resolveVinOrgId } from './vin-client'
import { readStudioConfig } from './studio-config'
import { hasVinScope } from './customer-reports'
import type { StudioConfig } from '../lib/studio-config'

const DAY_MS = 24 * 60 * 60 * 1000

/** Page size VinSolutions returns for `vin_query_leads`. */
export const VIN_PAGE_SIZE = 50
/** Hard ceiling on pages fetched per build, so a bad totalItems can't run away.
 *  200 pages × 50 = 10,000 leads/window. If hit, it is reported, never silent. */
export const MAX_PAGES = 200

// Authoritative VinSolutions lead types (vin_get_lead_types, verified live across
// hyundai/ford/serra-honda on 2026-06-22): INTERNET, WALK_IN, PHONE, IMPORT,
// PARTS_ORDER, SERVICE, WEBSITE_CHAT, WHOLESALE, REFERRAL, PREVIOUS_CUSTOMER.
// Retail SALES opportunities = every customer-facing lead type EXCEPT the
// non-retail desks (service, parts, wholesale). Earlier this was just
// INTERNET/PHONE/WALK_IN, which silently undercounted stores using REFERRAL etc.
export const SALES_LEAD_TYPES = new Set([
  'INTERNET',
  'PHONE',
  'WALK_IN',
  'REFERRAL',
  'PREVIOUS_CUSTOMER',
  'WEBSITE_CHAT',
  'IMPORT',
])
export const DROPPED_LEAD_TYPES = new Set(['SERVICE', 'PARTS_ORDER', 'WHOLESALE'])
export const BAD_STATUS_TYPES = new Set(['BAD'])
export const SOLD_STATUS_TYPES = new Set(['SOLD'])

// ── Field extraction (VIN response shape isn't owned by us — accept variants) ─

function firstString(lead: Record<string, unknown>, keys: Array<string>): string {
  for (const k of keys) {
    const v = lead[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return ''
}

/** Enum-ish field, upper-cased for stable comparison against the rule sets. */
function leadTypeOf(lead: Record<string, unknown>): string {
  return firstString(lead, ['leadType', 'lead_type', 'type']).toUpperCase()
}

function statusTypeOf(lead: Record<string, unknown>): string {
  return firstString(lead, [
    'leadStatusType',
    'lead_status_type',
    'statusType',
  ]).toUpperCase()
}

/** Customer id used to dedupe touches into one opportunity. */
function contactOf(lead: Record<string, unknown>): string {
  return firstString(lead, ['contact', 'contactId', 'contact_id', 'customerId'])
}

function leadIdOf(lead: Record<string, unknown>): string {
  return firstString(lead, ['leadId', 'lead_id', 'id'])
}

/** Raw lead source value — VinSolutions returns a URL href, e.g.
 *  https://api.vinsolutions.com/leadsources/id/3742136?dealerid=13399 */
function leadSourceOf(lead: Record<string, unknown>): string {
  return firstString(lead, ['leadSource', 'lead_source', 'source']) || 'Unknown'
}

/** Extract the numeric VinSolutions lead-source id from a source URL, or null. */
function leadSourceIdOf(raw: string): string | null {
  const m = raw.match(/leadsources\/id\/(\d+)/)
  return m ? m[1] : null
}

/** Clean a VinSolutions lead-source name (strips control chars + trailing dashes). */
function cleanSourceName(name: string): string {
  return name.replace(/\s+/g, ' ').replace(/[\s-]+$/, '').trim()
}

/**
 * Resolve a raw lead-source value to a human label: the resolved name when the
 * id→name map has it, else "Source <id>" (never a raw API URL on screen), else
 * the raw value (already a plain name).
 */
function resolveSourceLabel(raw: string, names?: Map<string, string>): string {
  const id = leadSourceIdOf(raw)
  if (id && names?.get(id)) return names.get(id) as string
  if (id) return `Source ${id}`
  return raw || 'Unknown'
}

// ── Pure summary core ────────────────────────────────────────────────────────

export type LeadSourceOpportunities = {
  lead_source: string
  opportunities: number
  /** Deduped sales opportunities from this source whose status is SOLD. */
  sold: number
}

export type OpportunitySummary = {
  /** Every row the API returned for the window (incl. service + bad + dupes). */
  raw_total: number
  /** Deduped sales, non-bad leads — globally unique contacts. */
  opportunities: number
  /** Deduped sales opportunities whose status is SOLD. */
  sold: number
  /** Per-source deduped opportunities (a contact spanning sources counts once
   *  per source, so the sum may exceed `opportunities` — documented, expected). */
  by_source: Array<LeadSourceOpportunities>
  /** What was removed and why — provenance for a defensible count. */
  dropped: {
    non_sales: number
    bad: number
    duplicates: number
    no_contact: number
    /** Non-sales leadType values seen that are NOT in the known set
     *  (SERVICE/PARTS_ORDER). A populated list means a store emitted a leadType
     *  the sales-scope rule doesn't recognize — a potential silent UNDERCOUNT,
     *  surfaced here so it never goes unnoticed. */
    unrecognized_types: Array<string>
  }
}

/**
 * Reduce raw `vin_query_leads` rows to defensible opportunity counts.
 * Order: drop non-sales leadType → drop BAD status → dedupe by contact.
 * A row with no contact falls back to its leadId as the dedupe key (never
 * silently dropped) and is also tallied under `dropped.no_contact` for audit.
 */
export function summarizeOpportunities(
  leads: Array<Record<string, unknown>>,
  sourceNames?: Map<string, string>,
): OpportunitySummary {
  let nonSales = 0
  let bad = 0
  let noContact = 0
  let salesNonBadRows = 0

  const seenGlobal = new Set<string>()
  const soldGlobal = new Set<string>()
  const perSource = new Map<string, Set<string>>()
  const perSourceSold = new Map<string, Set<string>>()
  const unrecognized = new Set<string>()

  for (const lead of leads) {
    const lt = leadTypeOf(lead)
    // Drop anything not affirmatively a sales lead type (SERVICE/PARTS_ORDER,
    // plus any unrecognized/blank type — fail toward NOT counting it as sales).
    if (!SALES_LEAD_TYPES.has(lt)) {
      nonSales++
      // Flag a non-sales type that is NOT a known non-sales type — it may be an
      // unmapped SALES type at this store, i.e. a silent undercount. Make it loud.
      if (lt !== '' && !DROPPED_LEAD_TYPES.has(lt)) unrecognized.add(lt)
      continue
    }
    const st = statusTypeOf(lead)
    if (BAD_STATUS_TYPES.has(st)) {
      bad++
      continue
    }
    salesNonBadRows++
    const contact = contactOf(lead)
    if (!contact) noContact++
    const key = contact || leadIdOf(lead) || `__row_${salesNonBadRows}`

    const src = resolveSourceLabel(leadSourceOf(lead), sourceNames)
    seenGlobal.add(key)
    let set = perSource.get(src)
    if (!set) {
      set = new Set<string>()
      perSource.set(src, set)
    }
    set.add(key)

    if (SOLD_STATUS_TYPES.has(st)) {
      soldGlobal.add(key)
      let ss = perSourceSold.get(src)
      if (!ss) {
        ss = new Set<string>()
        perSourceSold.set(src, ss)
      }
      ss.add(key)
    }
  }

  const by_source: Array<LeadSourceOpportunities> = Array.from(perSource.entries())
    .map(([lead_source, set]) => ({
      lead_source,
      opportunities: set.size,
      sold: perSourceSold.get(lead_source)?.size ?? 0,
    }))
    .sort((a, b) => b.opportunities - a.opportunities)

  return {
    raw_total: leads.length,
    opportunities: seenGlobal.size,
    sold: soldGlobal.size,
    by_source,
    dropped: {
      non_sales: nonSales,
      bad,
      duplicates: salesNonBadRows - seenGlobal.size,
      no_contact: noContact,
      unrecognized_types: Array.from(unrecognized).sort(),
    },
  }
}

// ── Paginated fetch ──────────────────────────────────────────────────────────

/** Minimal shape of the central-mcp tool caller (injectable for tests). */
export type CallCentralMcp = (
  tool: string,
  args: Record<string, unknown>,
  opts?: { timeoutMs?: number },
) => Promise<{ ok: boolean; data?: unknown; error?: string; unconfigured?: boolean }>

/** Pull rows out of the common VIN payload shapes. */
function extractRows(data: unknown): Array<Record<string, unknown>> | null {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>
  if (data && typeof data === 'object') {
    for (const key of ['items', 'leads', 'data', 'results', 'records']) {
      const v = (data as Record<string, unknown>)[key]
      if (Array.isArray(v)) return v as Array<Record<string, unknown>>
    }
  }
  return null
}

/** The window's true total when the payload reports it, else null (unknown). */
function totalItemsOf(data: unknown): number | null {
  if (data && typeof data === 'object') {
    const t = (data as { totalItems?: unknown }).totalItems
    if (typeof t === 'number') return t
  }
  return null
}

/**
 * Fetch the org's lead-source id→name map via `vin_get_lead_sources`. Best-effort:
 * on any failure returns an empty map (labels fall back to "Source <id>"), so a
 * naming hiccup never blocks the defensible counts.
 */
export async function fetchLeadSources(input: {
  orgId: string
  timeoutMs?: number
  call?: CallCentralMcp
}): Promise<Map<string, string>> {
  const call = input.call ?? (callCentralMcpTool as CallCentralMcp)
  const map = new Map<string, string>()
  const r = await call('vin_get_lead_sources', { orgId: input.orgId }, { timeoutMs: input.timeoutMs ?? 15_000 })
  if (!r.ok) return map
  const rows = extractRows(r.data) ?? []
  for (const row of rows) {
    const id = firstString(row, ['leadSourceId']) || leadSourceIdOf(firstString(row, ['href']))
    const name = cleanSourceName(firstString(row, ['leadSourceName', 'name']))
    if (id && name) map.set(id, name)
  }
  return map
}

export type FetchAllLeadsResult =
  | {
      ok: true
      leads: Array<Record<string, unknown>>
      pages: number
      capped: boolean
      /** Known totalItems but fewer rows fetched — a partial/transient fetch. */
      incomplete: boolean
    }
  | { ok: false; reason: string }

/**
 * Fetch ALL pages of `vin_query_leads` for an org + ISO window. Reads
 * `totalItems` from page 1 to bound the loop; stops on an empty page; caps at
 * MAX_PAGES (capped:true is surfaced so a truncated window is never silent).
 */
export async function fetchAllLeads(input: {
  orgId: string
  startDate: string
  endDate: string
  timeoutMs?: number
  call?: CallCentralMcp
}): Promise<FetchAllLeadsResult> {
  const call = input.call ?? (callCentralMcpTool as CallCentralMcp)
  const timeoutMs = input.timeoutMs ?? 15_000
  const leads: Array<Record<string, unknown>> = []
  let totalItems: number | null = null
  let pagesFetched = 0
  let capped = false

  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await call(
      'vin_query_leads',
      {
        orgId: input.orgId,
        startDate: input.startDate,
        endDate: input.endDate,
        pageNumber: page,
        pageSize: VIN_PAGE_SIZE,
      },
      { timeoutMs },
    )
    if (!r.ok) {
      return {
        ok: false,
        reason: r.unconfigured ? 'unconfigured' : r.error ?? 'lead query failed',
      }
    }
    const rows = extractRows(r.data)
    if (!rows) return { ok: false, reason: 'unexpected lead response shape' }
    if (page === 1) totalItems = totalItemsOf(r.data)
    leads.push(...rows)
    pagesFetched = page

    // An empty page always ends the loop (genuine end of data).
    if (rows.length === 0) break
    if (totalItems != null) {
      // Known total: page until we reach it. Do NOT stop on a short page — the
      // API occasionally returns a short page mid-stream (observed: serra-nissan
      // flickered 32 vs 228), and stopping there would silently undercount.
      if (leads.length >= totalItems) break
    } else if (rows.length < VIN_PAGE_SIZE) {
      // Unknown total: a short page is the only end-of-data signal.
      break
    }
    if (page === MAX_PAGES) capped = true
  }

  // Known total but we ended short → an incomplete/transient fetch, never to be
  // shown as a confident count.
  const incomplete = totalItems != null && leads.length < totalItems
  return { ok: true, leads, pages: pagesFetched, capped, incomplete }
}

// ── Top-level build (profile → defensible opportunity summary) ────────────────

export type LeadOpportunitiesResult =
  | {
      available: true
      source: 'vin-live'
      window_days: number
      summary: OpportunitySummary
      pages: number
      capped: boolean
    }
  | { available: false; source: 'vin-live' | 'none'; reason: string }

/**
 * Build defensible lead opportunities for a profile over a trailing window.
 * Mirrors buildLeadFunnel's availability contract: a store without VIN scope or
 * a resolvable org id returns available:false with a dealer-safe reason — never
 * a fabricated number.
 */
export async function buildLeadOpportunities(
  profile: string,
  opts: {
    now?: number
    windowDays?: number
    vinTimeoutMs?: number
    config?: StudioConfig
    call?: CallCentralMcp
  } = {},
): Promise<LeadOpportunitiesResult> {
  const now = opts.now ?? Date.now()
  const windowDays = opts.windowDays ?? 30
  const config = opts.config ?? readStudioConfig(profile).config

  if (!hasVinScope(config)) {
    return {
      available: false,
      source: 'none',
      reason: 'Lead reporting is not enabled for this store yet.',
    }
  }
  const org = resolveVinOrgId(profile, config)
  if (!org.ok) {
    return { available: false, source: 'vin-live', reason: org.reason }
  }

  const fetched = await fetchAllLeads({
    orgId: org.orgId,
    startDate: new Date(now - windowDays * DAY_MS).toISOString(),
    endDate: new Date(now).toISOString(),
    timeoutMs: opts.vinTimeoutMs,
    call: opts.call,
  })
  if (!fetched.ok) {
    console.warn(`[lead-opportunities] ${profile} live lead query failed: ${fetched.reason}`)
    return {
      available: false,
      source: 'vin-live',
      reason: 'Lead reporting is temporarily unavailable.',
    }
  }

  // Resolve lead-source id→name so per-source rows show real names (and match the
  // uploaded report by name), not raw VinSolutions URLs.
  const sourceNames = await fetchLeadSources({
    orgId: org.orgId,
    timeoutMs: opts.vinTimeoutMs,
    call: opts.call,
  })

  return {
    available: true,
    source: 'vin-live',
    window_days: windowDays,
    summary: summarizeOpportunities(fetched.leads, sourceNames),
    pages: fetched.pages,
    // An incomplete/transient fetch undercounts just like a capped one — surface
    // it the same way so the dashboard never presents it as a confident count.
    capped: fetched.capped || fetched.incomplete,
  }
}
