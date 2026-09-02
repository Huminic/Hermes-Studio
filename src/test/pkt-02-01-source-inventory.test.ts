// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { LEADS_HEADERS } from '@/server/reports/leads/leads-family-contract'
import {
  SourceInventoryError,
  inventorySourceFields,
} from '@/server/reports/packet/source-inventory'

describe('PKT-02-01 finite source-field inventory (SW-013/SW-014)', () => {
  it('SW-013 is source_investigation_pending against the accepted 57-header schema', () => {
    const inv = inventorySourceFields('SW-013', LEADS_HEADERS)
    expect(inv.disposition).toBe('source_investigation_pending')
    expect(inv.searched_universe).toHaveLength(57)
    expect(inv.missing_fields).toEqual([
      'authoritative_opening_schedule',
      'first_human_response_timestamp',
    ])
    // evidence names the searched universe, never derives a value
    expect(inv.evidence).toMatch(/57/)
  })

  it('SW-014 is source_investigation_pending against the accepted schema', () => {
    const inv = inventorySourceFields('SW-014', LEADS_HEADERS)
    expect(inv.disposition).toBe('source_investigation_pending')
    expect(inv.missing_fields).toEqual([
      'first_response_actor_classification',
      'human_touch_event_timestamps',
    ])
  })

  it('records forbidden proxies present but NEVER uses them to satisfy a capability', () => {
    const inv = inventorySourceFields('SW-013', LEADS_HEADERS)
    const human = inv.required.find(
      (r) => r.key === 'first_human_response_timestamp',
    )!
    expect(human.present).toBe(false)
    expect(human.satisfied_by).toBeNull()
    // the schema DOES contain response-time columns — they are logged as forbidden
    // proxies, not used as a stand-in for a first-human timestamp
    expect(human.forbidden_proxies_present).toContain(
      'Actual Response Time (Min)',
    )
    expect(human.forbidden_proxies_present).toContain(
      'Adjusted Response Time (Min)',
    )
  })

  it('flips to satisfiable ONLY when the exact authoritative fields exist (real detection, not hardcoded)', () => {
    const augmented = [
      ...LEADS_HEADERS,
      'Dealership Opening Hours Schedule',
      'First Human Response Datetime',
    ]
    const inv = inventorySourceFields('SW-013', augmented)
    expect(inv.disposition).toBe('source_satisfiable')
    expect(inv.missing_fields).toEqual([])
    const sched = inv.required.find(
      (r) => r.key === 'authoritative_opening_schedule',
    )!
    expect(sched.present).toBe(true)
    expect(sched.satisfied_by).toBe('Dealership Opening Hours Schedule')
  })

  it('rejects an unknown metric id', () => {
    expect(() => inventorySourceFields('SW-011', LEADS_HEADERS)).toThrow(
      SourceInventoryError,
    )
  })
})
