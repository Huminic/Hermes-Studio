import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  assignThreadToHuman,
  releaseThreadToAi,
  isHumanAssigned,
} from '@/server/thread-takeover'

describe('thread-takeover (human-takeover pause state)', () => {
  let root: string
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'takeover-'))
  })
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('assign → isHumanAssigned true → release → false', () => {
    const opts = { profileRoot: root }
    expect(isHumanAssigned('p', 'thread-1', opts)).toBe(false)
    assignThreadToHuman('p', 'thread-1', 'duane', opts)
    expect(isHumanAssigned('p', 'thread-1', opts)).toBe(true)
    // a different thread is unaffected
    expect(isHumanAssigned('p', 'thread-2', opts)).toBe(false)
    releaseThreadToAi('p', 'thread-1', opts)
    expect(isHumanAssigned('p', 'thread-1', opts)).toBe(false)
  })

  it('re-assign updates the owner without duplicating', () => {
    const opts = { profileRoot: root }
    assignThreadToHuman('p', 't', 'alice', opts)
    assignThreadToHuman('p', 't', 'bob', opts)
    expect(isHumanAssigned('p', 't', opts)).toBe(true)
  })
})
