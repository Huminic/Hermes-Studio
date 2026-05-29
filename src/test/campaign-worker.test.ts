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
})
