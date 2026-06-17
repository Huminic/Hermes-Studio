import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-tick-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', 'huminic')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    'branding:\n  persona_name: Huminic\n',
  )
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
  const bus = await import('@/server/messaging-hub-bus')
  bus._resetMessagingBus()
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('tickCampaigns', () => {
  it('runs a scheduled campaign and advances to complete', async () => {
    const {
      upsertContact,
      createAudience,
      createCampaign,
      listCampaignDeliveries,
    } = await import('@/server/messaging-hub-store')
    const { tickCampaigns } = await import('@/server/campaign-worker')
    upsertContact({
      profile: 'huminic',
      display_name: 'Sample',
      identifiers: { sms: '+15555550199' },
    })
    const audience = createAudience({
      profile: 'huminic',
      name: 'sms-test',
      query: { channel: 'sms' },
    })
    const campaign = createCampaign({
      profile: 'huminic',
      audience_id: audience.id,
      channel: 'sms',
      message_template: 'Hi {{first_name}}!',
      schedule: Date.now() - 1000,
    })
    const results = await tickCampaigns({ profile: 'huminic' })
    expect(results).toHaveLength(1)
    expect(results[0].sent + results[0].failed).toBeGreaterThan(0)
    const deliveries = listCampaignDeliveries('huminic', campaign.id)
    expect(deliveries.length).toBeGreaterThan(0)
    expect(['sent', 'failed']).toContain(deliveries[0].status)
  })

  it('renders a Service Recall template with vehicle + dealer + name vars populated', async () => {
    const { upsertContact, createAudience, createCampaign, listThreads, getThread } =
      await import('@/server/messaging-hub-store')
    const { tickCampaigns } = await import('@/server/campaign-worker')
    upsertContact({
      profile: 'huminic',
      display_name: 'Dana Reyes',
      identifiers: { email: 'dana@example.com' },
    })
    // Operator-authored campaign-level params ride on the audience query
    // alongside its filter keys (channel).
    const audience = createAudience({
      profile: 'huminic',
      name: 'recall',
      query: {
        channel: 'email',
        recall_id: '23V-456',
        vehicle_year: '2021',
        vehicle_model: 'CR-V',
      },
    })
    const template = [
      'Hi {{first_name}},',
      'Your {{vehicle_year}} {{vehicle_model}} is affected by recall {{recall_id}}.',
      '— {{dealer_name}} service',
    ].join('\n')
    createCampaign({
      profile: 'huminic',
      audience_id: audience.id,
      channel: 'email',
      message_template: template,
      schedule: Date.now() - 1000,
    })
    const results = await tickCampaigns({ profile: 'huminic' })
    expect(results).toHaveLength(1)
    // No unresolved vars: every placeholder had a source.
    expect(results[0].unresolved_vars).toBeUndefined()

    const threads = listThreads({ profile: 'huminic', limit: 10 })
    expect(threads.length).toBeGreaterThan(0)
    const thread = getThread('huminic', threads[0].id)
    const body = (thread?.messages ?? []).map((m) => m.content).join('\n')
    expect(body).not.toMatch(/\{\{.*?\}\}/) // no leftover placeholders
    expect(body).toContain('Dana') // first_name
    expect(body).toContain('2021') // vehicle_year
    expect(body).toContain('CR-V') // vehicle_model
    expect(body).toContain('23V-456') // recall_id
    expect(body).toContain('Huminic') // dealer_name ← branding.persona_name
  })

  it('renders unresolved template vars empty and reports them', async () => {
    const { upsertContact, createAudience, createCampaign } = await import(
      '@/server/messaging-hub-store'
    )
    const { tickCampaigns } = await import('@/server/campaign-worker')
    upsertContact({
      profile: 'huminic',
      display_name: 'Sam',
      identifiers: { sms: '+15555550123' },
    })
    const audience = createAudience({
      profile: 'huminic',
      name: 'due',
      query: { channel: 'sms' }, // no service_type / vehicle_model supplied
    })
    createCampaign({
      profile: 'huminic',
      audience_id: audience.id,
      channel: 'sms',
      message_template:
        'Hi {{first_name}} — your {{vehicle_model}} is due for {{service_type}}.',
      schedule: Date.now() - 1000,
    })
    const results = await tickCampaigns({ profile: 'huminic' })
    expect(results).toHaveLength(1)
    expect(results[0].unresolved_vars).toBeDefined()
    expect(results[0].unresolved_vars).toEqual(
      expect.arrayContaining(['vehicle_model', 'service_type']),
    )
    // first_name still resolved, so it is NOT reported unresolved.
    expect(results[0].unresolved_vars).not.toContain('first_name')
  })

  it('skips a contact whose thread a human has taken over (no send, can resume later)', async () => {
    const {
      upsertContact,
      createAudience,
      createCampaign,
      listCampaignDeliveries,
      getOrCreateThread,
    } = await import('@/server/messaging-hub-store')
    const { assignThreadToHuman } = await import('@/server/thread-takeover')
    const { tickCampaigns } = await import('@/server/campaign-worker')
    upsertContact({
      profile: 'huminic',
      display_name: 'Taken Over',
      identifiers: { sms: '+15555550150' },
    })
    const audience = createAudience({
      profile: 'huminic',
      name: 'sms-takeover',
      query: { channel: 'sms' },
    })
    const campaign = createCampaign({
      profile: 'huminic',
      audience_id: audience.id,
      channel: 'sms',
      message_template: 'Hi {{first_name}}!',
      schedule: Date.now() - 1000,
    })
    // A rep has already claimed this contact's thread (matches how the worker
    // creates it: same handle + channel + domain 'service').
    const thread = getOrCreateThread({
      profile: 'huminic',
      domain: 'service',
      channel: 'sms',
      contact_handle: '+15555550150',
      subject: 'taken over',
    })
    assignThreadToHuman('huminic', thread.id, 'rep@huminic.example')

    const results = await tickCampaigns({ profile: 'huminic' })
    expect(results).toHaveLength(1)
    expect(results[0].sent).toBe(0)
    expect(results[0].skipped).toBeGreaterThan(0)
    // No delivery recorded for the taken-over contact → not marked done, so a
    // future tick can still reach them once the rep hands the thread back.
    expect(listCampaignDeliveries('huminic', campaign.id)).toHaveLength(0)
  })

  it('skips not-yet-due campaigns', async () => {
    const {
      upsertContact,
      createAudience,
      createCampaign,
      listCampaignDeliveries,
    } = await import('@/server/messaging-hub-store')
    const { tickCampaigns } = await import('@/server/campaign-worker')
    upsertContact({
      profile: 'huminic',
      display_name: 'Sample',
      identifiers: { sms: '+15555550199' },
    })
    const audience = createAudience({
      profile: 'huminic',
      name: 'sms-future',
      query: { channel: 'sms' },
    })
    const campaign = createCampaign({
      profile: 'huminic',
      audience_id: audience.id,
      channel: 'sms',
      message_template: 'Hi',
      schedule: Date.now() + 60_000,
    })
    const results = await tickCampaigns({ profile: 'huminic' })
    expect(results).toHaveLength(0)
    expect(listCampaignDeliveries('huminic', campaign.id)).toHaveLength(0)
  })

  it('can force-send one draft campaign by id', async () => {
    const {
      upsertContact,
      createAudience,
      createCampaign,
      listCampaignDeliveries,
    } = await import('@/server/messaging-hub-store')
    const { tickCampaigns } = await import('@/server/campaign-worker')
    upsertContact({
      profile: 'huminic',
      display_name: 'Sample',
      identifiers: { sms: '+15555550199' },
    })
    const audience = createAudience({
      profile: 'huminic',
      name: 'sms-draft',
      query: { channel: 'sms' },
    })
    const draft = createCampaign({
      profile: 'huminic',
      audience_id: audience.id,
      channel: 'sms',
      message_template: 'Hi',
      schedule: null,
    })
    const untouched = await tickCampaigns({ profile: 'huminic' })
    expect(untouched).toHaveLength(0)
    expect(listCampaignDeliveries('huminic', draft.id)).toHaveLength(0)

    const results = await tickCampaigns({
      profile: 'huminic',
      campaign_id: draft.id,
      force: true,
    })
    expect(results).toHaveLength(1)
    expect(results[0].campaign_id).toBe(draft.id)
    expect(listCampaignDeliveries('huminic', draft.id).length).toBeGreaterThan(0)
  })
})
