/**
 * Unit tests for the defensible lead-opportunity engine.
 *
 * Covers the three rules that fix the ~1.7–2x funnel inflation — sales scoping,
 * BAD drop, dedupe-by-contact — plus per-source counts, sold tally, the
 * no-contact fallback, and full pagination of vin_query_leads.
 */
import { describe, expect, it } from 'vitest'
import {
  summarizeOpportunities,
  fetchAllLeads,
  VIN_PAGE_SIZE,
  MAX_PAGES,
  type CallCentralMcp,
} from '@/server/lead-opportunities'

const lead = (
  over: Partial<{
    leadType: string
    leadStatusType: string
    contact: string
    leadId: string
    leadSource: string
  }> = {},
): Record<string, unknown> => ({
  leadType: 'INTERNET',
  leadStatusType: 'ACTIVE',
  contact: 'c1',
  leadId: 'l1',
  leadSource: 'AutoTrader',
  ...over,
})

describe('summarizeOpportunities', () => {
  it('drops non-sales lead types (SERVICE, PARTS_ORDER, unknown)', () => {
    const s = summarizeOpportunities([
      lead({ leadType: 'INTERNET', contact: 'a' }),
      lead({ leadType: 'PHONE', contact: 'b' }),
      lead({ leadType: 'WALK_IN', contact: 'c' }),
      lead({ leadType: 'SERVICE', contact: 'd' }),
      lead({ leadType: 'PARTS_ORDER', contact: 'e' }),
      lead({ leadType: 'MYSTERY', contact: 'f' }),
      lead({ leadType: '', contact: 'g' }),
    ])
    expect(s.opportunities).toBe(3) // a, b, c
    expect(s.dropped.non_sales).toBe(4) // SERVICE, PARTS_ORDER, MYSTERY, blank
    // MYSTERY is an UNRECOGNIZED non-sales type (potential undercount); the known
    // non-sales types (SERVICE/PARTS_ORDER) and blank are not flagged.
    expect(s.dropped.unrecognized_types).toEqual(['MYSTERY'])
  })

  it('drops BAD-status leads', () => {
    const s = summarizeOpportunities([
      lead({ contact: 'a', leadStatusType: 'ACTIVE' }),
      lead({ contact: 'b', leadStatusType: 'BAD' }),
      lead({ contact: 'c', leadStatusType: 'SOLD' }),
    ])
    expect(s.opportunities).toBe(2) // a, c
    expect(s.dropped.bad).toBe(1)
  })

  it('dedupes multiple touches from the same contact into one opportunity', () => {
    const s = summarizeOpportunities([
      lead({ contact: 'dup', leadId: 'l1' }),
      lead({ contact: 'dup', leadId: 'l2' }),
      lead({ contact: 'dup', leadId: 'l3' }),
      lead({ contact: 'solo', leadId: 'l4' }),
    ])
    expect(s.opportunities).toBe(2) // dup (once) + solo
    expect(s.dropped.duplicates).toBe(2) // two extra dup rows
    expect(s.raw_total).toBe(4)
  })

  it('counts SOLD opportunities deduped', () => {
    const s = summarizeOpportunities([
      lead({ contact: 'a', leadStatusType: 'SOLD' }),
      lead({ contact: 'a', leadStatusType: 'SOLD' }), // same contact, still one sold
      lead({ contact: 'b', leadStatusType: 'COMPLETE' }),
    ])
    expect(s.sold).toBe(1)
    expect(s.opportunities).toBe(2)
  })

  it('produces per-source deduped counts sorted desc', () => {
    const s = summarizeOpportunities([
      lead({ contact: 'a', leadSource: 'AutoTrader' }),
      lead({ contact: 'b', leadSource: 'AutoTrader' }),
      lead({ contact: 'a', leadSource: 'AutoTrader' }), // dup within source
      lead({ contact: 'c', leadSource: 'Cars.com' }),
    ])
    expect(s.by_source).toEqual([
      { lead_source: 'AutoTrader', opportunities: 2 },
      { lead_source: 'Cars.com', opportunities: 1 },
    ])
  })

  it('falls back to leadId when a sales lead has no contact, and tallies it', () => {
    const s = summarizeOpportunities([
      lead({ contact: '', leadId: 'l1' }),
      lead({ contact: '', leadId: 'l2' }),
    ])
    expect(s.opportunities).toBe(2) // distinct leadIds, never silently dropped
    expect(s.dropped.no_contact).toBe(2)
  })

  it('resolves lead-source URLs to names (never shows a raw URL)', () => {
    const names = new Map([
      ['196', 'AutoTrader'],
      ['33340', 'Cargurus'],
    ])
    const s = summarizeOpportunities(
      [
        lead({ contact: 'a', leadSource: 'https://api.vinsolutions.com/leadsources/id/196?dealerid=13399' }),
        lead({ contact: 'b', leadSource: 'https://api.vinsolutions.com/leadsources/id/33340?dealerid=13399' }),
        lead({ contact: 'c', leadSource: 'https://api.vinsolutions.com/leadsources/id/999?dealerid=13399' }), // unmapped
      ],
      names,
    )
    const labels = s.by_source.map((r) => r.lead_source)
    expect(labels).toContain('AutoTrader')
    expect(labels).toContain('Cargurus')
    expect(labels).toContain('Source 999') // unmapped id → label, never a URL
    expect(labels.some((l) => l.startsWith('http'))).toBe(false)
  })

  it('handles an empty window', () => {
    const s = summarizeOpportunities([])
    expect(s).toEqual({
      raw_total: 0,
      opportunities: 0,
      sold: 0,
      by_source: [],
      dropped: { non_sales: 0, bad: 0, duplicates: 0, no_contact: 0, unrecognized_types: [] },
    })
  })
})

describe('fetchAllLeads (pagination)', () => {
  const pagedCall = (totalItems: number): CallCentralMcp => {
    return async (_tool, args) => {
      const page = Number(args.pageNumber)
      const pageSize = Number(args.pageSize)
      const start = (page - 1) * pageSize
      const items = Array.from({ length: Math.max(0, Math.min(pageSize, totalItems - start)) }, (_, i) => ({
        leadId: `l${start + i}`,
        contact: `c${start + i}`,
        leadType: 'INTERNET',
        leadStatusType: 'ACTIVE',
        leadSource: 'AutoTrader',
      }))
      return { ok: true, data: { totalItems, pageSize, pageNumber: page, items } }
    }
  }

  it('fetches every page until totalItems is reached', async () => {
    const r = await fetchAllLeads({
      orgId: 'org',
      startDate: '2026-05-01T00:00:00.000Z',
      endDate: '2026-06-01T00:00:00.000Z',
      call: pagedCall(125), // 3 pages at pageSize 50
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.leads).toHaveLength(125)
      expect(r.pages).toBe(3)
      expect(r.capped).toBe(false)
      expect(VIN_PAGE_SIZE).toBe(50)
    }
  })

  it('stops on the first (and only) page when totalItems fits', async () => {
    const r = await fetchAllLeads({
      orgId: 'org',
      startDate: 's',
      endDate: 'e',
      call: pagedCall(10),
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.leads).toHaveLength(10)
      expect(r.pages).toBe(1)
    }
  })

  it('keeps paging when totalItems is absent, stopping on a short final page', async () => {
    // Payload carries NO totalItems; a full first page must NOT be mistaken for
    // the whole window (the under-fetch the fix prevents).
    const counts = [50, 50, 20]
    const call: CallCentralMcp = async (_tool, args) => {
      const page = Number(args.pageNumber)
      const n = counts[page - 1] ?? 0
      const items = Array.from({ length: n }, (_, i) => ({
        leadId: `p${page}-${i}`,
        contact: `p${page}-${i}`,
        leadType: 'INTERNET',
        leadStatusType: 'ACTIVE',
      }))
      return { ok: true, data: { items } } // no totalItems
    }
    const r = await fetchAllLeads({ orgId: 'o', startDate: 's', endDate: 'e', call })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.leads).toHaveLength(120)
      expect(r.pages).toBe(3)
      expect(r.capped).toBe(false)
    }
  })

  it('flags capped when the page ceiling is hit', async () => {
    // Always-full pages, no totalItems → never a short page → hits MAX_PAGES.
    const call: CallCentralMcp = async (_tool, args) => {
      const page = Number(args.pageNumber)
      const items = Array.from({ length: VIN_PAGE_SIZE }, (_, i) => ({
        leadId: `${page}-${i}`,
        contact: `${page}-${i}`,
        leadType: 'INTERNET',
        leadStatusType: 'ACTIVE',
      }))
      return { ok: true, data: { items } }
    }
    const r = await fetchAllLeads({ orgId: 'o', startDate: 's', endDate: 'e', call })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.capped).toBe(true)
      expect(r.pages).toBe(MAX_PAGES)
    }
  })

  it('surfaces a failed call with a reason', async () => {
    const r = await fetchAllLeads({
      orgId: 'org',
      startDate: 's',
      endDate: 'e',
      call: async () => ({ ok: false, error: 'boom' }),
    })
    expect(r).toEqual({ ok: false, reason: 'boom' })
  })

  it('labels an unconfigured broker', async () => {
    const r = await fetchAllLeads({
      orgId: 'org',
      startDate: 's',
      endDate: 'e',
      call: async () => ({ ok: false, unconfigured: true }),
    })
    expect(r).toEqual({ ok: false, reason: 'unconfigured' })
  })
})
