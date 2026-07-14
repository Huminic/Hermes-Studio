import { describe, expect, it } from 'vitest'
import {
  buildAiConversationInsights,
  gatherConversationContext,
  renderAiConversationInsightsHtml,
  type LlmComplete,
} from '@/server/reports/ai-conversation-insights'

const P = 'acifix'

async function seed() {
  const { getOrCreateThread, appendMessage } = await import('@/server/messaging-hub-store')
  const t = getOrCreateThread({ profile: P, domain: 'sales', channel: 'sms', contact_handle: '+15551230000', assigned_agent_id: 'caroline' })
  appendMessage({ thread_id: t.id, direction: 'inbound', role: 'user', channel: 'sms', content: 'do you have the Prologue in silver?', author: 'cust' })
  appendMessage({ thread_id: t.id, direction: 'outbound', role: 'assistant', channel: 'sms', content: 'Let me check and get back to you!', author: 'caroline' })
}

describe('ai conversation insights', () => {
  it('assembles a transcript from hub threads', async () => {
    await seed()
    const ctx = gatherConversationContext(P, { windowDays: 3650 })
    expect(ctx.threadCount).toBeGreaterThanOrEqual(1)
    expect(ctx.messageCount).toBeGreaterThanOrEqual(2)
    expect(ctx.transcript).toContain('Customer:')
    expect(ctx.transcript).toContain('Agent:')
  })

  it('passes transcripts to the injected LLM and returns the insights', async () => {
    await seed()
    const stub: LlmComplete = async (_system, user) => {
      expect(user).toContain('Prologue') // real transcript reached the model
      return { ok: true, text: '1) Common questions: inventory availability.', via: 'hermes' }
    }
    const report = await buildAiConversationInsights(P, { windowDays: 3650 }, { complete: stub })
    expect(report.available).toBe(true)
    if (report.available) expect(report.insights).toMatch(/Common questions/)
  })

  it('returns available:false honestly when no provider is configured', async () => {
    await seed()
    const stub: LlmComplete = async () => ({ ok: false, unconfigured: true, error: 'no provider' })
    const report = await buildAiConversationInsights(P, { windowDays: 3650 }, { complete: stub })
    expect(report.available).toBe(false)
    if (!report.available) expect(report.reason).toMatch(/provider/i)
  })

  it('renders HTML for an available report', async () => {
    const report = await buildAiConversationInsights(P, { windowDays: 3650 }, {
      complete: async () => ({ ok: true, text: 'insightful summary', via: 'hermes' }),
    })
    const html = renderAiConversationInsightsHtml(report)
    expect(html).toContain('AI Conversation Insights')
    expect(html).toContain('insightful summary')
  })
})
