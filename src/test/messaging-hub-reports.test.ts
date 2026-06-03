import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-reports-'))
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

async function seedComms(profile: string) {
  const { getOrCreateThread, appendMessage } = await import(
    '@/server/messaging-hub-store'
  )
  const sales = getOrCreateThread({
    profile,
    domain: 'sales',
    channel: 'sms',
    contact_handle: '+15555550100',
  })
  appendMessage({
    thread_id: sales.id,
    direction: 'inbound',
    role: 'user',
    channel: 'sms',
    content: 'interested in a truck',
    author: '+15555550100',
  })
  appendMessage({
    thread_id: sales.id,
    direction: 'outbound',
    role: 'assistant',
    channel: 'sms',
    content: 'great, here are options',
    author: 'caroline',
  })
  const service = getOrCreateThread({
    profile,
    domain: 'service',
    channel: 'email',
    contact_handle: 'owner@example.com',
  })
  appendMessage({
    thread_id: service.id,
    direction: 'inbound',
    role: 'user',
    channel: 'email',
    content: 'recall question',
    author: 'owner@example.com',
  })
  return { sales, service }
}

describe('messaging-hub report aggregates', () => {
  it('aggregateMessages counts direction + per-channel', async () => {
    const { aggregateMessages } = await import('@/server/messaging-hub-store')
    await seedComms('serra-honda')
    const stats = aggregateMessages('serra-honda')
    expect(stats.total).toBe(3)
    expect(stats.inbound).toBe(2)
    expect(stats.outbound).toBe(1)
    expect(stats.by_channel.sms).toEqual({ inbound: 1, outbound: 1 })
    expect(stats.by_channel.email).toEqual({ inbound: 1, outbound: 0 })
  })

  it('aggregateMessages honors the sinceMs window', async () => {
    const { aggregateMessages } = await import('@/server/messaging-hub-store')
    await seedComms('serra-honda')
    // All seeded messages are "now"; a future window excludes them.
    const future = aggregateMessages('serra-honda', Date.now() + 60_000)
    expect(future.total).toBe(0)
  })

  it('aggregateThreads splits sales vs service and open/closed', async () => {
    const { aggregateThreads, setThreadStatus } = await import(
      '@/server/messaging-hub-store'
    )
    const { service } = await seedComms('serra-honda')
    setThreadStatus('serra-honda', service.id, 'closed')
    const stats = aggregateThreads('serra-honda')
    expect(stats.total).toBe(2)
    expect(stats.open).toBe(1)
    expect(stats.closed).toBe(1)
    expect(stats.by_domain).toMatchObject({ sales: 1, service: 1 })
  })

  it('aggregateCampaignDeliveries rolls up status + deliveries', async () => {
    const {
      createAudience,
      createCampaign,
      recordCampaignDelivery,
      aggregateCampaignDeliveries,
    } = await import('@/server/messaging-hub-store')
    const aud = createAudience({
      profile: 'serra-honda',
      name: 'recall',
      query: {},
    })
    const camp = createCampaign({
      profile: 'serra-honda',
      audience_id: aud.id,
      channel: 'sms',
      message_template: 'Service due',
    })
    recordCampaignDelivery({
      profile: 'serra-honda',
      campaign_id: camp.id,
      contact_id: 'c1',
      thread_id: null,
      status: 'sent',
    })
    recordCampaignDelivery({
      profile: 'serra-honda',
      campaign_id: camp.id,
      contact_id: 'c2',
      thread_id: null,
      status: 'failed',
      error: 'no number',
    })
    const stats = aggregateCampaignDeliveries('serra-honda')
    expect(stats.campaigns).toBe(1)
    expect(stats.deliveries_sent).toBe(1)
    expect(stats.deliveries_failed).toBe(1)
    expect(stats.by_status.draft).toBe(1)
  })

  it('returns zeroed shapes for an empty profile', async () => {
    const { aggregateMessages, aggregateThreads, aggregateCampaignDeliveries } =
      await import('@/server/messaging-hub-store')
    expect(aggregateMessages('empty').total).toBe(0)
    expect(aggregateThreads('empty').total).toBe(0)
    expect(aggregateCampaignDeliveries('empty').campaigns).toBe(0)
  })
})
