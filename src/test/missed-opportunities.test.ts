import { describe, expect, it } from 'vitest'
import {
  buildMissedOpportunities,
  renderMissedOpportunitiesHtml,
} from '@/server/reports/missed-opportunities'

const P = 'missfix'

async function hub() {
  return await import('@/server/messaging-hub-store')
}

describe('buildMissedOpportunities', () => {
  it('counts unanswered non-takeover inbound, excludes takeovers + opt-outs + our-last-word', async () => {
    const { getOrCreateThread, appendMessage } = await hub()
    const { assignThreadToHuman } = await import('@/server/thread-takeover')

    // A: customer waiting, no takeover → MISS
    const a = getOrCreateThread({ profile: P, domain: 'sales', channel: 'sms', contact_handle: '+15550000001', assigned_agent_id: 'caroline' })
    appendMessage({ thread_id: a.id, direction: 'inbound', role: 'user', channel: 'sms', content: 'are you there?', author: 'cust' })

    // B: customer waiting BUT a rep took it over → excluded (their follow-up)
    const b = getOrCreateThread({ profile: P, domain: 'sales', channel: 'sms', contact_handle: '+15550000002', assigned_agent_id: 'caroline' })
    appendMessage({ thread_id: b.id, direction: 'inbound', role: 'user', channel: 'sms', content: 'still waiting', author: 'cust' })
    assignThreadToHuman(P, b.id, 'rep')

    // C: last inbound is an opt-out → excluded
    const c = getOrCreateThread({ profile: P, domain: 'sales', channel: 'sms', contact_handle: '+15550000003', assigned_agent_id: 'caroline' })
    appendMessage({ thread_id: c.id, direction: 'inbound', role: 'user', channel: 'sms', content: 'STOP', author: 'cust' })

    // D: we had the last word → not waiting on us
    const d = getOrCreateThread({ profile: P, domain: 'sales', channel: 'sms', contact_handle: '+15550000004', assigned_agent_id: 'caroline' })
    appendMessage({ thread_id: d.id, direction: 'inbound', role: 'user', channel: 'sms', content: 'hi', author: 'cust' })
    appendMessage({ thread_id: d.id, direction: 'outbound', role: 'assistant', channel: 'sms', content: 'hello!', author: 'caroline' })

    const report = buildMissedOpportunities(P, { slaMs: 0, windowDays: 3650 })
    const unanswered = report.sections.find((s) => s.key === 'unanswered_inbound')!

    const contacts = unanswered.items.map((i) => i.contact)
    expect(contacts).toContain('+15550000001') // A counted
    expect(contacts).not.toContain('+15550000002') // B taken over → excluded
    expect(contacts).not.toContain('+15550000003') // C opt-out → excluded
    expect(contacts).not.toContain('+15550000004') // D our last word → excluded
    expect(report.excluded_taken_over).toBeGreaterThanOrEqual(1)
  })

  it('counts Guardian holds that never released', async () => {
    const { getOrCreateThread, appendMessage, createGuardianHold } = await hub()
    const t = getOrCreateThread({ profile: 'missfix2', domain: 'sales', channel: 'sms', contact_handle: '+15559990000', assigned_agent_id: 'caroline' })
    const m = appendMessage({ thread_id: t.id, direction: 'inbound', role: 'user', channel: 'sms', content: 'what is the price?', author: 'cust' })
    createGuardianHold({ profile: 'missfix2', thread_id: t.id, message_id: m.id, agent_id: 'caroline', channel: 'sms', reason: 'unbacked' })

    const report = buildMissedOpportunities('missfix2', { slaMs: 0, windowDays: 3650 })
    const held = report.sections.find((s) => s.key === 'reply_held_unsent')!
    expect(held.count).toBeGreaterThanOrEqual(1)
    expect(report.total).toBeGreaterThanOrEqual(1)
  })

  it('renders standalone HTML with the total and section titles', () => {
    const report = buildMissedOpportunities('missfix', { slaMs: 0, windowDays: 3650 })
    const html = renderMissedOpportunitiesHtml(report)
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('Missed Opportunities')
    expect(html).toContain('waiting on a reply')
    expect(html).toMatch(/verify against your own records/i)
  })
})
