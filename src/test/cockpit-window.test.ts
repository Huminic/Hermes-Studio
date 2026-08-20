import { describe, it, expect } from 'vitest'
import {
  afterHours,
  computeCockpitWindow,
  type BusinessHours,
  type HubMessage,
  type HubThread,
} from '@/server/cockpit/cockpit-window'

// Serra sales hours: Mon-Sat 9-19 CT, Sunday closed.
const BH: BusinessHours = {
  tz: 'America/Chicago',
  openH: 9,
  closeH: 19,
  closedDays: ['Sun'],
}

// Helper: an epoch ms for a given local CT wall time on a known date.
// 2026-08-17 is a Monday. Use UTC offsets: CT (CDT) = UTC-5 in August.
const CDT = (dayISO: string, hour: number) =>
  Date.parse(`${dayISO}T${String(hour).padStart(2, '0')}:00:00-05:00`)

describe('afterHours (store business hours)', () => {
  it('midday on an open weekday is business hours', () => {
    expect(afterHours(CDT('2026-08-17', 13), BH)).toBe(false) // Mon 1pm
  })
  it('before open and after close are after-hours', () => {
    expect(afterHours(CDT('2026-08-17', 7), BH)).toBe(true) // Mon 7am
    expect(afterHours(CDT('2026-08-17', 20), BH)).toBe(true) // Mon 8pm
  })
  it('Sunday is always after-hours (closed day)', () => {
    expect(afterHours(CDT('2026-08-16', 13), BH)).toBe(true) // Sun 1pm
  })
})

describe('computeCockpitWindow (port of compute_window)', () => {
  const since = CDT('2026-08-10', 0)

  it('empty inputs are availability-safe (zeros, null median, no throw)', () => {
    const w = computeCockpitWindow({
      threads: [],
      messagesByThread: new Map(),
      handleToContact: new Map(),
      bh: BH,
      sinceMs: since,
    })
    expect(w.touched).toBe(0)
    expect(w.after_hours_pct).toBe(0)
    expect(w.median_reply_secs).toBeNull()
  })

  it('dedupes touched by contact identity, counts after-hours, computes median reply', () => {
    const threads: Array<HubThread> = [
      { id: 't1', contact_handle: '+1555', channel: 'sms', created_at: CDT('2026-08-17', 13) }, // biz hours
      { id: 't2', contact_handle: '+1555', channel: 'sms', created_at: CDT('2026-08-17', 22) }, // after hours, SAME contact
      { id: 't3', contact_handle: '+1777', channel: 'chat', created_at: CDT('2026-08-16', 13) }, // Sun => after hours, diff contact
    ]
    const messagesByThread = new Map<string, Array<HubMessage>>([
      // customer first at 13:00:00, rep replies 8s later → latency 8s
      ['t1', [
        { thread_id: 't1', direction: 'inbound', created_at: CDT('2026-08-17', 13) },
        { thread_id: 't1', direction: 'outbound', created_at: CDT('2026-08-17', 13) + 8000 },
        { thread_id: 't1', direction: 'inbound', created_at: CDT('2026-08-17', 13) + 20000 }, // 2nd inbound => conversed
      ]],
      ['t2', [{ thread_id: 't2', direction: 'outbound', created_at: CDT('2026-08-17', 22) }]],
      ['t3', [
        { thread_id: 't3', direction: 'inbound', created_at: CDT('2026-08-16', 13), content: 'can I schedule a test drive tomorrow?' },
        { thread_id: 't3', direction: 'outbound', created_at: CDT('2026-08-16', 13) + 4000 }, // latency 4s
      ]],
    ])
    // '+1555' both map to contact C1; '+1777' to C2
    const handleToContact = new Map([['+1555', 'C1'], ['+1777', 'C2']])

    const w = computeCockpitWindow({ threads, messagesByThread, handleToContact, bh: BH, sinceMs: since })

    expect(w.threads).toBe(3)
    expect(w.touched).toBe(2) // C1 (t1+t2 deduped) + C2
    expect(w.ah_threads).toBe(2) // t2 (10pm) + t3 (Sunday)
    expect(w.after_hours_pct).toBe(66.7) // 2/3
    expect(w.conversed).toBe(1) // t1 has 2 inbound
    expect(w.intent).toBe(1) // t3 "test drive"
    expect(w.median_reply_secs).toBe(8) // latencies [4,8]; index floor(2/2)=1 => 8 (matches compute.py)
  })

  it('excludes threads created before the window', () => {
    const threads: Array<HubThread> = [
      { id: 'old', contact_handle: 'a', channel: 'sms', created_at: since - 1 },
      { id: 'new', contact_handle: 'b', channel: 'sms', created_at: since + 1 },
    ]
    const w = computeCockpitWindow({
      threads,
      messagesByThread: new Map(),
      handleToContact: new Map(),
      bh: BH,
      sinceMs: since,
    })
    expect(w.threads).toBe(1)
    expect(w.touched).toBe(1)
  })
})
