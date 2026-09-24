import { describe, it, expect } from 'vitest'
import { buildTextReport, deltaOf } from '../server/text-report'

describe('deltaOf', () => {
  it('classifies up/down/even', () => {
    expect(deltaOf(14, 10)).toBe('up')
    expect(deltaOf(9, 12)).toBe('down')
    expect(deltaOf(7, 7)).toBe('even')
  })
})

describe('buildTextReport', () => {
  it('places the numbers verbatim (never invents) and follows Greeting|Data|Commentary|Outro|signature', () => {
    const msg = buildTextReport({
      leadsToday: 14,
      salesLost: 2,
      active: 31,
      needsAttention: 5,
      leadsDelta: 'up',
      salesDelta: 'up',
      agentName: 'Caroline',
      rotation: 0,
    })
    expect(msg).toBe(
      "Hey team, 14 new leads today, 2 marked lost, 31 active. 5 need attention. Leads beat yesterday, sales landed ahead of yesterday. I'll be watching the leads tonight! —Caroline",
    )
  })

  it('commentary tracks the computed deltas (down/even), with no appointment sentence', () => {
    const msg = buildTextReport({
      leadsToday: 9,
      salesLost: 3,
      active: 27,
      needsAttention: 4,
      leadsDelta: 'down',
      salesDelta: 'even',
      agentName: 'Georgia',
      rotation: 1,
    })
    expect(msg).toContain('9 new leads today, 3 marked lost, 27 active. 4 need attention.')
    expect(msg).toContain('Fewer leads than yesterday')
    expect(msg).toContain('closings held even')
    expect(msg).not.toMatch(/appoint/i)
    expect(msg.endsWith('—Georgia')).toBe(true)
  })

  it('rotation changes the chosen variants (consecutive nights differ)', () => {
    const base = {
      leadsToday: 12,
      salesLost: 1,
      active: 29,
      needsAttention: 6,
      leadsDelta: 'up' as const,
      salesDelta: 'down' as const,
      agentName: 'Caroline',
    }
    const a = buildTextReport({ ...base, rotation: 0 })
    const b = buildTextReport({ ...base, rotation: 1 })
    expect(a).not.toBe(b)
  })

  it('only ever emits sanctioned commentary phrases (no free generation)', () => {
    const allowedLeads = [
      'Leads beat yesterday',
      'More leads than yesterday',
      'Lead flow was up on yesterday',
    ]
    const msg = buildTextReport({
      leadsToday: 1,
      salesLost: 0,
      active: 1,
      needsAttention: 0,
      leadsDelta: 'up',
      salesDelta: 'up',
      agentName: 'Caroline',
      rotation: 2,
    })
    expect(allowedLeads.some((p) => msg.includes(p))).toBe(true)
  })
})
