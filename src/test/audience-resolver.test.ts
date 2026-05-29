import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aud-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('resolveAudience', () => {
  it('filters by channel', async () => {
    const { upsertContact } = await import('@/server/messaging-hub-store')
    const { resolveAudience } = await import('@/server/audience-resolver')
    upsertContact({
      profile: 'huminic',
      display_name: 'A',
      identifiers: { email: 'a@example.com' },
    })
    upsertContact({
      profile: 'huminic',
      display_name: 'B',
      identifiers: { sms: '+15555550100' },
    })
    upsertContact({
      profile: 'huminic',
      display_name: 'C',
      identifiers: { email: 'c@example.com', sms: '+15555550101' },
    })
    const sms = resolveAudience({ profile: 'huminic', query: { channel: 'sms' } })
    expect(sms.map((c) => c.display_name).sort()).toEqual(['B', 'C'])
    const email = resolveAudience({
      profile: 'huminic',
      query: { channel: 'email' },
    })
    expect(email.map((c) => c.display_name).sort()).toEqual(['A', 'C'])
  })

  it('returns all when query is empty', async () => {
    const { upsertContact } = await import('@/server/messaging-hub-store')
    const { resolveAudience } = await import('@/server/audience-resolver')
    upsertContact({
      profile: 'huminic',
      display_name: 'A',
      identifiers: { email: 'a@example.com' },
    })
    upsertContact({
      profile: 'huminic',
      display_name: 'B',
      identifiers: { sms: '+15555550100' },
    })
    const all = resolveAudience({ profile: 'huminic', query: {} })
    expect(all).toHaveLength(2)
  })
})
