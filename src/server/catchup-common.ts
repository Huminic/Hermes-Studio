/**
 * Shared helpers for the catch-up scripts (immediate + follow-up): VIN response
 * shaping, paginated lead fetch, and local-midnight math. Kept pure/injectable
 * so the gather modules are unit-tested without a live broker.
 */

import type { CentralMcpResult } from './central-mcp'

export type CallFn = (
  tool: string,
  args: Record<string, unknown>,
  opts?: { timeoutMs?: number },
) => Promise<CentralMcpResult>

export const PAGE_LIMIT = 100
export const MAX_PAGES = 20

/** Instant (ms) of local midnight TODAY in `tz`, robust across DST. */
export function localMidnight(tz: string, nowMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(nowMs))
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
  const s = parseInt(parts.find((p) => p.type === 'second')?.value ?? '0', 10)
  return nowMs - ((h * 3600 + m * 60 + s) * 1000 + (nowMs % 1000))
}

export function extractLeads(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    for (const key of ['items', 'leads', 'rows']) {
      if (Array.isArray(o[key])) return o[key] as Array<Record<string, unknown>>
    }
  }
  return []
}

function totalItemsOf(data: unknown): number | null {
  if (data && typeof data === 'object') {
    const t = (data as { totalItems?: unknown }).totalItems
    if (typeof t === 'number') return t
  }
  return null
}

export function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number') return String(v)
  return null
}

/**
 * A plausible, deliverable E.164 handle: '+' then 10–15 digits, no leading zero.
 * Guards against dirty VIN phone data (7-digit fragments, fused extensions,
 * leading zeros) that `toE164` would otherwise mint into a wrong-number send
 * (e.g. "731-3946" → "+7313946", "…ext 5" → fused digits). US numbers are
 * "+1" + 10 digits = 11 total. A canonicalized handle that fails this is dropped
 * by the catch-up gathers rather than texted.
 */
export function isValidSmsE164(handle: string): boolean {
  // US/NANP only (these are US dealership leads): +1 + area code [2-9]XX +
  // exchange [2-9]XX + 4 digits. Rejects 7-digit fragments, fused extensions,
  // leading-zero junk, and mis-parsed international numbers (e.g. an extension
  // fused onto a "+7…"). NOTE: a structurally-valid but UNASSIGNED area code
  // (e.g. 676) still passes and will bounce at the carrier (logged, non-fatal) —
  // full assigned-NANP validation would need an area-code table.
  return /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(handle)
}

/** Best-effort readable vehicle from a raw lead row (often only hrefs exist). */
export function leadVehicle(lead: Record<string, unknown>): string | null {
  const v = lead.vehicleOfInterest ?? lead.vehicle ?? lead.VehicleOfInterest
  if (typeof v === 'string' && v.trim() && !v.startsWith('http')) return v.trim()
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    const parts = [o.year, o.make, o.model, o.Year, o.Make, o.Model]
      .filter((x) => typeof x === 'string' || typeof x === 'number')
      .map(String)
    if (parts.length) return parts.join(' ').trim()
  }
  return null
}

export type FetchLeadsResult =
  | { ok: true; leads: Array<Record<string, unknown>> }
  | { ok: false; error: string; leads: Array<Record<string, unknown>> }

/** Paginate vin_query_leads across a date window. Stops on a short/complete page. */
export async function fetchLeadsPaged(input: {
  call: CallFn
  orgId: string
  startDate: string
  endDate: string
}): Promise<FetchLeadsResult> {
  const raw: Array<Record<string, unknown>> = []
  let total: number | null = null
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await input.call('vin_query_leads', {
      orgId: input.orgId,
      startDate: input.startDate,
      endDate: input.endDate,
      limit: PAGE_LIMIT,
      pageNumber: page,
    })
    if (!res.ok) return { ok: false, error: `vin_query_leads failed (page ${page}): ${res.error}`, leads: raw }
    const items = extractLeads(res.data)
    raw.push(...items)
    total = total ?? totalItemsOf(res.data)
    if (items.length < PAGE_LIMIT) break
    if (total != null && raw.length >= total) break
  }
  return { ok: true, leads: raw }
}
