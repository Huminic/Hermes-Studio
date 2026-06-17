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

  it('email handles still match case-insensitively', async () => {
    const { addToBlacklist, isBlacklisted } = await import('@/server/comms-blacklist')
    addToBlacklist('serra-honda', 'Jane@Example.com', 'STOP')
    expect(isBlacklisted('serra-honda', 'jane@example.com')).toBe(true)
  })
})
