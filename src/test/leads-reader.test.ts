// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { IDENTITY, leadsWorkbook } from './helpers/leads-fixture'
import {
  coerceContacted,
  coerceLeadNumber,
  computeLeadsPrimitives,
  excelSerialToBusinessDate,
  normalizeBusinessDate,
  parseLeadRows,
  readLeads,
} from '@/server/reports/leads/leads-reader'

const D = IDENTITY['serra-honda']
const defaults = { dealer: D.dealer, dealerId: D.dealerId }

describe('Leads reader — coercion (missing is never zero)', () => {
  it('blank/"-" numeric → null; a real 0 → 0', () => {
    expect(coerceLeadNumber('')).toBeNull()
    expect(coerceLeadNumber('   ')).toBeNull()
    expect(coerceLeadNumber('-')).toBeNull()
    expect(coerceLeadNumber(undefined)).toBeNull()
    expect(coerceLeadNumber('0')).toBe(0)
    expect(coerceLeadNumber('1,234')).toBe(1234)
  })

  it('contacted: yes/no/blank → true/false/null', () => {
    expect(coerceContacted('Yes')).toBe(true)
    expect(coerceContacted('No')).toBe(false)
    expect(coerceContacted('')).toBeNull()
    expect(coerceContacted('maybe')).toBeNull()
  })
})

describe('Leads reader — business-date has no UTC shift', () => {
  it('a late-evening Excel serial keeps its calendar date (no roll to next day)', () => {
    // 46258 = 2026-08-24. .9993 ≈ 23:59 local wall-clock — must NOT roll to the 25th.
    expect(excelSerialToBusinessDate(46258)).toBe('2026-08-24')
    expect(excelSerialToBusinessDate(46258.9993)).toBe('2026-08-24')
    expect(excelSerialToBusinessDate(46258.0001)).toBe('2026-08-24')
  })
  it('normalizeBusinessDate accepts serials and ISO alike; blank → null', () => {
    expect(normalizeBusinessDate('46258.2472')).toBe('2026-08-24')
    expect(normalizeBusinessDate('2026-08-24')).toBe('2026-08-24')
    expect(normalizeBusinessDate('2026-08-24T22:00:00-04:00')).toBe(
      '2026-08-24',
    )
    expect(normalizeBusinessDate('')).toBeNull()
  })
})

describe('Leads reader — primitives + blank/zero breakdown', () => {
  it('separates blanks from genuine zeros; sums exclude blanks', () => {
    const rows = parseLeadRows(
      leadsWorkbook(
        [
          { id: 'A1', actual: '10', adjusted: '0', firstContact: '2026-08-25' },
          { id: 'A2', actual: '', adjusted: '', firstContact: '' }, // both blank
          { id: 'A3', actual: '0', adjusted: '20', firstContact: '2026-08-26' }, // real zero
        ],
        defaults,
      ),
    )
    const p = computeLeadsPrimitives(rows)
    expect(p.total_leads).toBe(3)
    expect(p.unique_lead_ids).toBe(3)
    // Actual: populated {10,0}=2, blank 1, zeros 1, sum 10 (blank excluded, not 0).
    expect(p.actual_response.populated).toBe(2)
    expect(p.actual_response.missing).toBe(1)
    expect(p.actual_response.zeros).toBe(1)
    expect(p.actual_response.sum_min).toBe(10)
    // Adjusted: populated {0,20}=2, blank 1, zeros 1.
    expect(p.adjusted_response.populated).toBe(2)
    expect(p.adjusted_response.zeros).toBe(1)
    // First customer contact blanks counted (1 of 3).
    expect(p.first_customer_contact_blanks).toBe(1)
  })

  it('all-blank response column yields null stats, never 0', () => {
    const rows = parseLeadRows(
      leadsWorkbook(
        [
          { id: 'A1', actual: '' },
          { id: 'A2', actual: '' },
        ],
        defaults,
      ),
    )
    const p = computeLeadsPrimitives(rows)
    expect(p.actual_response.populated).toBe(0)
    expect(p.actual_response.missing).toBe(2)
    expect(p.actual_response.sum_min).toBeNull()
    expect(p.actual_response.mean_min).toBeNull()
    expect(p.actual_response.min_min).toBeNull()
  })

  it('readLeads returns rows + primitives together', () => {
    const { rows, primitives } = readLeads(
      leadsWorkbook(
        [{ id: 'A1', statusType: 'Sold', sold: '2026-08-27' }],
        defaults,
      ),
    )
    expect(rows.length).toBe(1)
    expect(primitives.sold_count).toBe(1)
    expect(primitives.sold_datetime_populated).toBe(1)
  })
})
