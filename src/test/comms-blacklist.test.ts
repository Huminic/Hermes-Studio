import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'blacklist-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', 'serra-honda')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'studio.yaml'), 'branding:\n  persona_name: Serra Honda\n')
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('comms-blacklist phone normalization (opt-out reliability)', () => {
  it('a STOP stored in one phone format blocks a send addressed in another format', async () => {
    const { addToBlacklist, isBlacklisted } = await import('@/server/comms-blacklist')
    // Inbound STOP arrives with carrier formatting…
    addToBlacklist('serra-honda', '+1 (412) 654-6500', 'STOP')
    // …a later outbound addressed with the same E.164 sans punctuation is blocked.
    expect(isBlacklisted('serra-honda', '+14126546500')).toBe(true)
    expect(isBlacklisted('serra-honda', '+1 412 654 6500')).toBe(true)
    // A different number is not blocked.
    expect(isBlacklisted('serra-honda', '+14155550100')).toBe(false)
  })

  it('a bare 10-digit STOP blocks the +1 E.164 form (and vice versa)', async () => {
    const { addToBlacklist, isBlacklisted } = await import('@/server/comms-blacklist')
    // STOP recorded as a bare 10-digit handle…
    addToBlacklist('serra-honda', '4126546500', 'STOP')
    // …blocks the canonical +1 form the gate checks.
    expect(isBlacklisted('serra-honda', '+14126546500')).toBe(true)
    // And the reverse: +1 stored, bare 10-digit checked.
    addToBlacklist('serra-honda', '+12055550199', 'STOP')
    expect(isBlacklisted('serra-honda', '2055550199')).toBe(true)
  })

  it('email handles still match case-insensitively', async () => {
    const { addToBlacklist, isBlacklisted } = await import('@/server/comms-blacklist')
    addToBlacklist('serra-honda', 'Jane@Example.com', 'STOP')
    expect(isBlacklisted('serra-honda', 'jane@example.com')).toBe(true)
  })
})

describe('applyOptOutKeyword — shared STOP/START handling (webhook + inbound parity)', () => {
  it('STOP on a phone channel blacklists the handle', async () => {
    const { applyOptOutKeyword, isBlacklisted } = await import('@/server/comms-blacklist')
    const r = applyOptOutKeyword({ profile: 'serra-honda', channel: 'sms', handle: '+12055550123', text: 'STOP' })
    expect(r).toEqual({ stop: true, start: false })
    expect(isBlacklisted('serra-honda', '+12055550123')).toBe(true)
  })

  it('START on a phone channel clears the blacklist', async () => {
    const { applyOptOutKeyword, addToBlacklist, isBlacklisted } = await import('@/server/comms-blacklist')
    addToBlacklist('serra-honda', '+12055550124', 'STOP')
    const r = applyOptOutKeyword({ profile: 'serra-honda', channel: 'sms', handle: '+12055550124', text: 'START please' })
    expect(r).toEqual({ stop: false, start: true })
    expect(isBlacklisted('serra-honda', '+12055550124')).toBe(false)
  })

  it('is a no-op on non-phone channels (chat/email never opt-out via keyword)', async () => {
    const { applyOptOutKeyword, isBlacklisted } = await import('@/server/comms-blacklist')
    const r = applyOptOutKeyword({ profile: 'serra-honda', channel: 'chat', handle: 'someone', text: 'stop' })
    expect(r).toEqual({ stop: false, start: false })
    expect(isBlacklisted('serra-honda', 'someone')).toBe(false)
  })

  it('ignores ordinary replies', async () => {
    const { applyOptOutKeyword } = await import('@/server/comms-blacklist')
    expect(
      applyOptOutKeyword({ profile: 'serra-honda', channel: 'sms', handle: '+12055550125', text: 'yes I want to come in Tuesday' }),
    ).toEqual({ stop: false, start: true }) // "yes" is a carrier START keyword
    expect(
      applyOptOutKeyword({ profile: 'serra-honda', channel: 'sms', handle: '+12055550126', text: 'what time are you open?' }),
    ).toEqual({ stop: false, start: false })
  })
})
