import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
const PROFILE = 'serra-honda'

function writeProfile(cooldownHours?: number): void {
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
  fs.mkdirSync(dir, { recursive: true })
  const lines = [
    'branding:',
    '  persona_name: Serra Honda',
    'notifications:',
    '  lead_format: adf-xml',
    '  lead_recipient: bdc@serrahonda.example',
  ]
  if (cooldownHours !== undefined) {
    lines.push(`  notify_cooldown_hours: ${cooldownHours}`)
  }
  fs.writeFileSync(path.join(dir, 'studio.yaml'), lines.join('\n') + '\n')
}

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-cooldown-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  writeProfile()
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('lead-notify ledger (the anti-spam window)', () => {
  it('reports within-window vs after-window correctly, and 0 disables', async () => {
    const { recordLeadNotify, wasLeadNotifiedWithin } = await import(
      '@/server/messaging-hub-store'
    )
    const t0 = 1_000_000
    recordLeadNotify(PROFILE, '+15555550000', t0)
    const hour = 3_600_000
    // 1h after, within a 24h window → suppressed.
    expect(wasLeadNotifiedWithin(PROFILE, '+15555550000', 24 * hour, t0 + hour)).toBe(true)
    // 25h after → window passed → allowed again.
    expect(wasLeadNotifiedWithin(PROFILE, '+15555550000', 24 * hour, t0 + 25 * hour)).toBe(false)
    // cooldown 0 → never suppresses.
    expect(wasLeadNotifiedWithin(PROFILE, '+15555550000', 0, t0 + 1)).toBe(false)
    // unknown key → not suppressed.
    expect(wasLeadNotifiedWithin(PROFILE, 'other', 24 * hour, t0 + 1)).toBe(false)
  })
})

describe('notifyNewLead cooldown gate', () => {
  it('returns via:cooldown when the key was already notified within the window', async () => {
    const { recordLeadNotify } = await import('@/server/messaging-hub-store')
    const { notifyNewLead } = await import('@/server/lead-notifications')
    recordLeadNotify(PROFILE, '+15555551111')
    const res = await notifyNewLead({
      profile: PROFILE,
      channel: 'SMS',
      contact_handle: '+15555551111',
      phone: '+15555551111',
      message: 'hi',
    })
    expect(res.ok).toBe(false)
    expect(res.via).toBe('cooldown')
  })

  it('does NOT suppress when notify_cooldown_hours is 0', async () => {
    writeProfile(0)
    const { recordLeadNotify, _resetForTests } = await import(
      '@/server/messaging-hub-store'
    )
    _resetForTests()
    const { notifyNewLead } = await import('@/server/lead-notifications')
    recordLeadNotify(PROFILE, '+15555552222')
    const res = await notifyNewLead({
      profile: PROFILE,
      channel: 'SMS',
      contact_handle: '+15555552222',
      phone: '+15555552222',
      message: 'hi',
    })
    // Cooldown disabled → the gate is skipped. It proceeds to the real send,
    // which is unconfigured in test (no central token) — the key point is it is
    // NOT short-circuited as 'cooldown'.
    expect(res.via).not.toBe('cooldown')
  })
})
