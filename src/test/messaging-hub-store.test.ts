import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  // Reset module-level state
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
  const bus = await import('@/server/messaging-hub-bus')
  bus._resetMessagingBus()
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('messaging-hub-store threads', () => {
  it('creates a thread and appends messages', async () => {
    const {
      getOrCreateThread,
      appendMessage,
      getThread,
    } = await import('@/server/messaging-hub-store')
    const t = getOrCreateThread({
      profile: 'huminic',
      domain: 'chat',
      channel: 'chat',
      contact_handle: 'duane',
      assigned_agent_id: 'huminic',
    })
    expect(t.id).toBeTruthy()
    expect(t.profile).toBe('huminic')
    appendMessage({
      thread_id: t.id,
      direction: 'inbound',
      role: 'user',
      channel: 'chat',
      content: 'hello',
      author: 'duane',
    })
    const reloaded = getThread('huminic', t.id)
    expect(reloaded?.messages).toHaveLength(1)
    expect(reloaded?.messages[0].content).toBe('hello')
  })

  it('reuses an open thread for the same contact + channel + domain', async () => {
    const { getOrCreateThread } = await import('@/server/messaging-hub-store')
    const a = getOrCreateThread({
      profile: 'huminic',
      domain: 'chat',
      channel: 'chat',
      contact_handle: 'duane',
    })
    const b = getOrCreateThread({
      profile: 'huminic',
      domain: 'chat',
      channel: 'chat',
      contact_handle: 'duane',
    })
    expect(b.id).toBe(a.id)
  })

  it('correlates an SMS reply (no +) to the outbound E.164 thread (no split)', async () => {
    const { getOrCreateThread } = await import('@/server/messaging-hub-store')
    // Outbound automation/vin-watcher stores E.164 with the leading +.
    const outbound = getOrCreateThread({
      profile: 'serra-honda',
      domain: 'sales',
      channel: 'sms',
      contact_handle: '+17313946907',
      assigned_agent_id: 'caroline',
    })
    // TextMagic delivers the inbound sender WITHOUT the + (e.g. 17313946907).
    const inbound = getOrCreateThread({
      profile: 'serra-honda',
      domain: 'sales',
      channel: 'sms',
      contact_handle: '17313946907',
    })
    expect(inbound.id).toBe(outbound.id)
    // Both are stored canonically so future lookups agree.
    expect(inbound.contact_handle).toBe('+17313946907')
  })

  it('does NOT collapse different email handles (non-phone channels untouched)', async () => {
    const { getOrCreateThread } = await import('@/server/messaging-hub-store')
    const a = getOrCreateThread({
      profile: 'huminic',
      domain: 'sales',
      channel: 'email',
      contact_handle: 'a@example.com',
    })
    const b = getOrCreateThread({
      profile: 'huminic',
      domain: 'sales',
      channel: 'email',
      contact_handle: 'b@example.com',
    })
    expect(b.id).not.toBe(a.id)
  })

  it('honors an existing_thread_id', async () => {
    const { getOrCreateThread } = await import('@/server/messaging-hub-store')
    const a = getOrCreateThread({
      profile: 'huminic',
      domain: 'chat',
      channel: 'chat',
      contact_handle: 'duane',
    })
    const b = getOrCreateThread({
      profile: 'huminic',
      domain: 'chat',
      channel: 'chat',
      contact_handle: 'someone-else',
      existing_thread_id: a.id,
    })
    expect(b.id).toBe(a.id)
  })

  it('filters threads by domain and status', async () => {
    const { getOrCreateThread, listThreads, setThreadStatus } = await import(
      '@/server/messaging-hub-store'
    )
    const sales = getOrCreateThread({
      profile: 'huminic',
      domain: 'sales',
      channel: 'email',
      contact_handle: 'lead@example.com',
    })
    const service = getOrCreateThread({
      profile: 'huminic',
      domain: 'service',
      channel: 'sms',
      contact_handle: '+15555550100',
    })
    setThreadStatus('huminic', service.id, 'closed')
    const salesList = listThreads({ profile: 'huminic', domain: 'sales' })
    expect(salesList.map((t) => t.id)).toEqual([sales.id])
    const open = listThreads({ profile: 'huminic', status: 'open' })
    expect(open.map((t) => t.id)).toEqual([sales.id])
  })

  it('publishes thread_created and message_appended events', async () => {
    const { subscribeMessaging } = await import('@/server/messaging-hub-bus')
    const events: Array<{ type: string }> = []
    const unsubscribe = subscribeMessaging('huminic', (event) => {
      events.push(event)
    })
    const { getOrCreateThread, appendMessage } = await import(
      '@/server/messaging-hub-store'
    )
    const t = getOrCreateThread({
      profile: 'huminic',
      domain: 'chat',
      channel: 'chat',
      contact_handle: 'duane',
    })
    appendMessage({
      thread_id: t.id,
      direction: 'inbound',
      role: 'user',
      channel: 'chat',
      content: 'hi',
      author: 'duane',
    })
    unsubscribe()
    expect(events.some((e) => e.type === 'thread_created')).toBe(true)
    expect(events.some((e) => e.type === 'message_appended')).toBe(true)
  })

  it('deletes a thread without deleting campaign delivery history', async () => {
    const { subscribeMessaging } = await import('@/server/messaging-hub-bus')
    const events: Array<{ type: string; status?: string }> = []
    const unsubscribe = subscribeMessaging('huminic', (event) => {
      events.push({ type: event.type, status: event.status })
    })
    const {
      appendMessage,
      createAudience,
      createCampaign,
      deleteThread,
      enqueueAgentReplyJob,
      getOrCreateThread,
      getThread,
      listCampaignDeliveries,
      listQueuedReplyJobs,
      listSubscriptionsForThread,
      listThreads,
      recordCampaignDelivery,
      subscribeAgentToThread,
    } = await import('@/server/messaging-hub-store')
    const audience = createAudience({
      profile: 'huminic',
      name: 'Delete test',
      query: {},
    })
    const campaign = createCampaign({
      profile: 'huminic',
      audience_id: audience.id,
      channel: 'sms',
      message_template: 'Hello',
    })
    const thread = getOrCreateThread({
      profile: 'huminic',
      domain: 'sales',
      channel: 'sms',
      contact_handle: '+15555550100',
    })
    const message = appendMessage({
      thread_id: thread.id,
      direction: 'inbound',
      role: 'user',
      channel: 'sms',
      content: 'Please remove this thread.',
      author: '+15555550100',
    })
    subscribeAgentToThread({
      thread_id: thread.id,
      agent_id: 'caroline',
      profile: 'huminic',
      channel: 'sms',
      mode: 'reply',
      rules: {},
      created_at: Date.now(),
    })
    enqueueAgentReplyJob({
      thread_id: thread.id,
      message_id: message.id,
      agent_id: 'caroline',
      channel: 'sms',
      profile: 'huminic',
    })
    recordCampaignDelivery({
      profile: 'huminic',
      campaign_id: campaign.id,
      contact_id: 'contact-1',
      thread_id: thread.id,
      status: 'sent',
    })

    expect(deleteThread('huminic', thread.id)).toBe(true)
    expect(getThread('huminic', thread.id)).toBeNull()
    expect(listThreads({ profile: 'huminic' }).map((t) => t.id)).not.toContain(
      thread.id,
    )
    expect(listSubscriptionsForThread('huminic', thread.id)).toHaveLength(0)
    expect(listQueuedReplyJobs('huminic')).toHaveLength(0)
    expect(
      listCampaignDeliveries('huminic', campaign.id)[0].thread_id,
    ).toBeNull()
    expect(events).toContainEqual({
      type: 'thread_status_changed',
      status: 'deleted',
    })
    expect(deleteThread('huminic', thread.id)).toBe(false)
    unsubscribe()
  })

  it('dedupes contacts across channels by identifier match', async () => {
    const { upsertContact, listContacts } = await import(
      '@/server/messaging-hub-store'
    )
    const a = upsertContact({
      profile: 'huminic',
      display_name: 'Lead Smith',
      identifiers: { email: 'lead@example.com' },
    })
    const b = upsertContact({
      profile: 'huminic',
      display_name: null,
      identifiers: { email: 'lead@example.com', sms: '+15555550199' },
    })
    expect(b.id).toBe(a.id)
    const contacts = listContacts('huminic')
    expect(contacts).toHaveLength(1)
    expect(contacts[0].identifiers).toMatchObject({
      email: 'lead@example.com',
      sms: '+15555550199',
    })
    expect(contacts[0].channels.sort()).toEqual(['email', 'sms'].sort())
  })
})

describe('messaging-hub-store agent subscriptions + reply jobs (AC.5.8)', () => {
  it('subscribes an agent to a thread and lists subscriptions', async () => {
    const {
      getOrCreateThread,
      subscribeAgentToThread,
      listSubscriptionsForThread,
    } = await import('@/server/messaging-hub-store')
    const t = getOrCreateThread({
      profile: 'huminic',
      domain: 'service',
      channel: 'sms',
      contact_handle: '+15555550100',
    })
    subscribeAgentToThread({
      thread_id: t.id,
      agent_id: 'caroline',
      profile: 'huminic',
      channel: 'sms',
      mode: 'reply',
      rules: { during_hours_only: true },
      created_at: Date.now(),
    })
    const subs = listSubscriptionsForThread('huminic', t.id)
    expect(subs).toHaveLength(1)
    expect(subs[0].mode).toBe('reply')
    expect(subs[0].rules).toMatchObject({ during_hours_only: true })
  })

  it('enqueues and updates an agent_reply_job', async () => {
    const {
      enqueueAgentReplyJob,
      updateReplyJob,
      listQueuedReplyJobs,
    } = await import('@/server/messaging-hub-store')
    const job = enqueueAgentReplyJob({
      thread_id: 't1',
      message_id: 'm1',
      agent_id: 'caroline',
      channel: 'sms',
      profile: 'huminic',
    })
    expect(job.status).toBe('queued')
    expect(listQueuedReplyJobs('huminic')).toHaveLength(1)
    updateReplyJob('huminic', job.id, {
      status: 'sent',
      sent_at: Date.now(),
    })
    expect(listQueuedReplyJobs('huminic')).toHaveLength(0)
  })
})
