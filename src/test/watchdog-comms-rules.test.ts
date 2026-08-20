import { describe, it, expect } from 'vitest'
import {
  COMMS_CADENCE_RULES,
  customerChasingRule,
  customerWaitingRule,
  silentAfterHotRule,
} from '@/server/watchdog/rules/comms-cadence'
import type { RuleContext } from '@/server/watchdog/watchdog-types'
import type { CockpitHubInputs } from '@/server/messaging-hub-store'

// Mon 2026-08-17 13:00 CT (business hours). CDT = UTC-5.
const NOW = Date.parse('2026-08-17T13:00:00-05:00')
const H = 3_600_000
const BH = { tz: 'America/Chicago', openH: 9, closeH: 19, closedDays: ['Sun'] }

function ctx(threads: CockpitHubInputs['threads'], msgs: Record<string, Array<{ direction: 'inbound' | 'outbound'; created_at: number; content?: string }>>, now = NOW): RuleContext {
  const messagesByThread = new Map(
    Object.entries(msgs).map(([tid, arr]) => [tid, arr.map((m) => ({ thread_id: tid, ...m }))]),
  )
  return {
    profile: 'serra-honda',
    now,
    windowDays: 30,
    hub: { threads, messagesByThread, handleToContact: new Map(), automationRunsInWindow: 0, agentRepliesInWindow: 0 },
    businessHours: BH,
    history: {},
  }
}

const thread = (id: string, handle: string) => ({ id, contact_handle: handle, channel: 'sms', created_at: NOW - 5 * 24 * H })

describe('comms cadence rules', () => {
  it('customer-waiting: fires when last msg is inbound > 4h during business hours', () => {
    const c = ctx([thread('t1', '+15551230000')], {
      t1: [
        { direction: 'outbound', created_at: NOW - 12 * H },
        { direction: 'inbound', created_at: NOW - 10 * H }, // waited 10h
      ],
    })
    const f = customerWaitingRule.run(c)
    expect(f).toHaveLength(1)
    expect(f[0].priority).toBe('medium') // 8<=10<24
    expect(f[0].name).toBe('…0000')
    expect(f[0].key).toBe('comms.customer-waiting:t1')
  })

  it('customer-waiting: does NOT fire overnight (after-hours) — availability of business time', () => {
    const night = Date.parse('2026-08-17T23:00:00-05:00')
    const c = ctx([thread('t1', '+15551230000')], {
      t1: [{ direction: 'inbound', created_at: night - 10 * H }],
    }, night)
    expect(customerWaitingRule.run(c)).toHaveLength(0)
  })

  it('customer-waiting: does NOT fire when the rep already replied last', () => {
    const c = ctx([thread('t1', '+1555')], {
      t1: [
        { direction: 'inbound', created_at: NOW - 10 * H },
        { direction: 'outbound', created_at: NOW - 9 * H },
      ],
    })
    expect(customerWaitingRule.run(c)).toHaveLength(0)
  })

  it('customer-chasing: fires on 2+ consecutive inbound; high at 3', () => {
    const c = ctx([thread('t1', '+15559876543')], {
      t1: [
        { direction: 'outbound', created_at: NOW - 20 * H },
        { direction: 'inbound', created_at: NOW - 6 * H },
        { direction: 'inbound', created_at: NOW - 5 * H },
        { direction: 'inbound', created_at: NOW - 4 * H },
      ],
    })
    const f = customerChasingRule.run(c)
    expect(f).toHaveLength(1)
    expect(f[0].priority).toBe('high') // 3 in a row
    expect(f[0].name).toBe('…6543')
  })

  it('silent-after-hot: fires when a buying signal then quiet > 72h', () => {
    const c = ctx([thread('t1', '+1555')], {
      t1: [
        { direction: 'inbound', created_at: NOW - 6 * 24 * H, content: "what's my monthly payment?" },
        { direction: 'outbound', created_at: NOW - 5 * 24 * H, content: 'let me check' },
      ],
    })
    const f = silentAfterHotRule.run(c)
    expect(f).toHaveLength(1)
    expect(f[0].category).toBe('Sales')
    expect(f[0].priority).toBe('high')
  })

  it('silent-after-hot: no fire without a buying signal', () => {
    const c = ctx([thread('t1', '+1555')], {
      t1: [{ direction: 'inbound', created_at: NOW - 6 * 24 * H, content: 'just looking, thanks' }],
    })
    expect(silentAfterHotRule.run(c)).toHaveLength(0)
  })

  it('all rules are availability-gated on teambox (skip with no hub)', () => {
    const empty: RuleContext = { profile: 'x', now: NOW, windowDays: 30, hub: null, businessHours: BH, history: {} }
    for (const rule of COMMS_CADENCE_RULES) {
      expect(rule.isAvailable(empty)).toBe(false)
      expect(rule.run(empty)).toEqual([]) // even if called, safe
    }
  })
})
