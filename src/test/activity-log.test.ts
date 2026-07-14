import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordCommsOutcome } from '@/server/comms-log'
import { listRecentActivity, activitySummary } from '@/server/activity-log'

let tmpHome: string

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  fs.mkdirSync(path.join(tmpHome, '.hermes', 'profiles', 'p1'), { recursive: true })
})
afterEach(() => {
  vi.restoreAllMocks()
  try {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('activity-log', () => {
  it('returns [] with no DB and never throws', () => {
    expect(listRecentActivity('nope')).toEqual([])
    expect(activitySummary('nope')).toEqual({ total: 0, failures: 0, byChannel: {} })
  })

  it('lists recent events newest-first with parsed recipients + outcome', () => {
    const NOW = 1_750_000_000_000
    recordCommsOutcome('p1', {
      direction: 'outbound', channel: 'sms', actor: 'system:sms-send',
      recipients: ['+12025550001'], outcome: 'ok',
    }, NOW - 2000)
    recordCommsOutcome('p1', {
      direction: 'outbound', channel: 'sms', actor: 'system:sms-send',
      recipients: ['+12025550002'], body_summary: 'provider rejected', outcome: 'error',
    }, NOW - 1000)

    const items = listRecentActivity('p1', { limit: 10 })
    expect(items).toHaveLength(2)
    // newest first
    expect(items[0].recipients).toEqual(['+12025550002'])
    expect(items[0].outcome).toBe('error')
    expect(items[0].summary).toBe('provider rejected')
    expect(items[1].outcome).toBe('ok')
  })

  it('summarizes the last 24h (total + failures + byChannel)', () => {
    const NOW = Date.now()
    recordCommsOutcome('p1', { direction: 'outbound', channel: 'sms', actor: 'a', recipients: ['+1'], outcome: 'ok' }, NOW - 1000)
    recordCommsOutcome('p1', { direction: 'outbound', channel: 'sms', actor: 'a', recipients: ['+2'], outcome: 'error' }, NOW - 2000)
    recordCommsOutcome('p1', { direction: 'outbound', channel: 'email', actor: 'a', recipients: ['x@y.co'], outcome: 'ok' }, NOW - 3000)
    const s = activitySummary('p1', { now: NOW })
    expect(s.total).toBe(3)
    expect(s.failures).toBe(1)
    expect(s.byChannel.sms).toBe(2)
    expect(s.byChannel.email).toBe(1)
  })
})
