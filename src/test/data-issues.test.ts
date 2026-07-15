import { describe, expect, it } from 'vitest'
import { buildDataIssues, renderDataIssuesHtml } from '@/server/reports/data-issues'

const P = 'difix'

describe('buildDataIssues', () => {
  it('flags open threads with no assigned owner', async () => {
    const { getOrCreateThread, appendMessage } = await import('@/server/messaging-hub-store')
    // Unassigned open thread (no assigned_agent_id).
    const t = getOrCreateThread({ profile: P, domain: 'sales', channel: 'sms', contact_handle: '+15557770000' })
    appendMessage({ thread_id: t.id, direction: 'inbound', role: 'user', channel: 'sms', content: 'hi', author: 'cust' })

    const report = buildDataIssues(P, { windowDays: 3650 })
    const unassigned = report.sections.find((s) => s.key === 'unassigned')!
    expect(unassigned.items.some((i) => i.subject === '+15557770000')).toBe(true)
    expect(report.total).toBeGreaterThanOrEqual(1)
  })

  it('has all four hygiene sections and renders HTML', () => {
    const report = buildDataIssues(P, { windowDays: 3650 })
    expect(report.sections.map((s) => s.key)).toEqual([
      'undeliverable',
      'unassigned',
      'stuck_holds',
      'fragmented',
    ])
    const html = renderDataIssuesHtml(report)
    expect(html).toContain('Data Issues')
    expect(html).toContain('no owner')
  })
})
