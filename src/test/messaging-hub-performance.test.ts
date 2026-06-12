import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-perf-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
  const bus = await import('@/server/messaging-hub-bus')
  bus._resetMessagingBus()
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

/**
 * Seed a profile with leads (threads) across channels + domains:
 *   - sales / voice   : 2 messages (1 in, 1 out)
 *   - sales / chat     : 1 message (in)
 *   - service / sms    : 1 message (in)
 *   - service / email  : 0 messages (thread only)
 * Aggregate expectation: 4 leads, 4 messages.
 */
async function seedPerf(profile: string) {
  const { getOrCreateThread, appendMessage } = await import(
    '@/server/messaging-hub-store'
  )
  const salesVoice = getOrCreateThread({
    profile,
    domain: 'sales',
    channel: 'voice',
    contact_handle: '+15555550100',
  })
  appendMessage({
    thread_id: salesVoice.id,
    direction: 'inbound',
    role: 'user',
    channel: 'voice',
    content: 'call in',
    author: '+15555550100',
  })
  appendMessage({
    thread_id: salesVoice.id,
    direction: 'outbound',
    role: 'assistant',
    channel: 'voice',
    content: 'callback',
    author: 'caroline',
  })
  const salesChat = getOrCreateThread({
    profile,
    domain: 'sales',
    channel: 'chat',
    contact_handle: 'web-visitor-1',
  })
  appendMessage({
    thread_id: salesChat.id,
    direction: 'inbound',
    role: 'user',
    channel: 'chat',
    content: 'price?',
    author: 'web-visitor-1',
  })
  const serviceSms = getOrCreateThread({
    profile,
    domain: 'service',
    channel: 'sms',
    contact_handle: '+15555550200',
  })
  appendMessage({
    thread_id: serviceSms.id,
    direction: 'inbound',
    role: 'user',
    channel: 'sms',
    content: 'recall?',
    author: '+15555550200',
  })
  // Thread-only lead (no messages) to confirm thread vs message counts diverge.
  getOrCreateThread({
    profile,
    domain: 'service',
    channel: 'email',
    contact_handle: 'owner@example.com',
  })
}

describe('aggregatePerformance', () => {
  it('groups leads + messages by channel and domain with aggregate totals', async () => {
    const { aggregatePerformance } = await import(
      '@/server/messaging-hub-store'
    )
    await seedPerf('serra-honda')
    const p = aggregatePerformance('serra-honda')

    // Aggregate
    expect(p.threads.total).toBe(4)
    expect(p.messages.total).toBe(4)

    // Leads by channel
    expect(p.threads.by_channel).toEqual({
      voice: 1,
      chat: 1,
      sms: 1,
      email: 1,
    })
    // Leads by domain/type
    expect(p.threads.by_domain).toEqual({ sales: 2, service: 2 })

    // Messages by channel (email thread has no messages)
    expect(p.messages.by_channel).toEqual({ voice: 2, chat: 1, sms: 1 })
    // Messages by domain/type (resolved via parent thread)
    expect(p.messages.by_domain).toEqual({ sales: 3, service: 1 })
  })

  it('honors the sinceMs window (future window excludes everything)', async () => {
    const { aggregatePerformance } = await import(
      '@/server/messaging-hub-store'
    )
    await seedPerf('serra-honda')
    const future = aggregatePerformance('serra-honda', Date.now() + 60_000)
    expect(future.threads.total).toBe(0)
    expect(future.messages.total).toBe(0)
    expect(future.threads.by_channel).toEqual({})
    expect(future.messages.by_domain).toEqual({})
  })

  it('returns zeroed shapes for an empty profile', async () => {
    const { aggregatePerformance } = await import(
      '@/server/messaging-hub-store'
    )
    const p = aggregatePerformance('empty')
    expect(p.threads.total).toBe(0)
    expect(p.messages.total).toBe(0)
    expect(p.threads.by_channel).toEqual({})
    expect(p.threads.by_domain).toEqual({})
    expect(p.messages.by_channel).toEqual({})
    expect(p.messages.by_domain).toEqual({})
  })
})
