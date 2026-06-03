import { describe, it, expect, vi, beforeEach } from 'vitest'

const tickCampaigns = vi.fn()
const listProfiles = vi.fn()
const listThreads = vi.fn()
const getThread = vi.fn()
const publishMessagingEvent = vi.fn()

// brain-backed escalation marker — in-memory fake so "already escalated" works.
const escalated = new Set<string>()
vi.mock('@/server/brain-store', () => ({
  openBrain: () => ({
    exec: () => {},
    run: (_sql: string, threadId: string) => escalated.add(threadId),
    get: (_sql: string, threadId: string) =>
      escalated.has(threadId) ? { thread_id: threadId } : undefined,
    all: () => [],
  }),
  now: () => Date.now(),
}))
vi.mock('@/server/profiles-browser', () => ({ listProfiles: () => listProfiles() }))
vi.mock('@/server/messaging-hub-store', () => ({
  listThreads: (o: unknown) => listThreads(o),
  getThread: (p: string, id: string) => getThread(p, id),
}))
vi.mock('@/server/messaging-hub-bus', () => ({
  publishMessagingEvent: (p: string, e: unknown) => publishMessagingEvent(p, e),
}))
vi.mock('@/server/campaign-worker', () => ({ tickCampaigns: (o: unknown) => tickCampaigns(o) }))

import { runDueWork, ESCALATE_AFTER_MS, checkEscalations } from '@/server/comms-scheduler'

const NOW = Date.UTC(2026, 5, 3, 15, 0, 0)

describe('comms-scheduler runDueWork', () => {
  beforeEach(() => {
    escalated.clear()
    tickCampaigns.mockReset().mockResolvedValue([{ sent: 2 }])
    listProfiles.mockReset().mockReturnValue([{ name: 'serra-honda' }, { name: 'huminic' }])
    listThreads.mockReset().mockReturnValue([])
    getThread.mockReset()
    publishMessagingEvent.mockReset()
  })

  it('ticks campaigns for every profile', async () => {
    const s = await runDueWork({ now: NOW })
    expect(s.profiles).toBe(2)
    expect(tickCampaigns).toHaveBeenCalledTimes(2)
    expect(s.campaignsSent).toBe(4) // 2 profiles × 2 sent
  })

  it('escalates an unanswered inbound older than the window, once', async () => {
    listThreads.mockReturnValue([{ id: 't1' }])
    getThread.mockReturnValue({
      messages: [
        { direction: 'inbound', created_at: NOW - (ESCALATE_AFTER_MS + 60_000) },
      ],
    })
    const first = checkEscalations('serra-honda', NOW)
    expect(first).toEqual(['t1'])
    expect(publishMessagingEvent).toHaveBeenCalledWith(
      'serra-honda',
      expect.objectContaining({ type: 'thread_escalated', thread_id: 't1' }),
    )
    // second pass does not re-escalate
    const second = checkEscalations('serra-honda', NOW)
    expect(second).toEqual([])
  })

  it('does NOT escalate a fresh inbound or an already-answered thread', async () => {
    listThreads.mockReturnValue([{ id: 'fresh' }, { id: 'answered' }])
    getThread.mockImplementation((_p: string, id: string) =>
      id === 'fresh'
        ? { messages: [{ direction: 'inbound', created_at: NOW - 60_000 }] }
        : { messages: [{ direction: 'inbound', created_at: NOW - 99_000_000 }, { direction: 'outbound', created_at: NOW - 1000 }] },
    )
    expect(checkEscalations('serra-honda', NOW)).toEqual([])
  })
})
