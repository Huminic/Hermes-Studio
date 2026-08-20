import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createNotification,
  deleteNotification,
  isValidEmail,
  listNotifications,
} from '@/server/watchdog/notifications-store'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-notif-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmp, '.hermes', 'profiles')
})
afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('manual notifications store', () => {
  it('validates email', () => {
    expect(isValidEmail('duanekwells@gmail.com')).toBe(true)
    expect(isValidEmail('nope')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })

  it('creates + lists a notification (alert from an issue)', () => {
    const r = createNotification(
      {
        profile: 'serra-honda',
        email: 'duanekwells@gmail.com',
        query_name: 'Customer waiting on a reply',
        description: 'Emails you when a customer has waited over 4 business hours for a response.',
        source: 'comms.customer-waiting:t1',
      },
      1000,
    )
    expect(r.ok).toBe(true)
    const rows = listNotifications('serra-honda')
    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe('duanekwells@gmail.com')
    expect(rows[0].query_name).toBe('Customer waiting on a reply')
    expect(rows[0].status).toBe('active')
  })

  it('rejects invalid email / empty name', () => {
    expect(createNotification({ profile: 'p', email: 'bad', query_name: 'x', description: 'y' }, 1)).toEqual({ ok: false, error: expect.any(String) })
    expect(createNotification({ profile: 'p', email: 'a@b.co', query_name: '  ', description: 'y' }, 1)).toEqual({ ok: false, error: expect.any(String) })
  })

  it('deletes', () => {
    const r = createNotification({ profile: 'p', email: 'a@b.co', query_name: 'q', description: 'd' }, 1)
    if (!r.ok) throw new Error('setup')
    expect(deleteNotification('p', r.id)).toBe(true)
    expect(listNotifications('p')).toHaveLength(0)
  })
})
