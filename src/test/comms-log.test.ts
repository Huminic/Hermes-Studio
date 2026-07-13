import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordCommsOutcome, countCommsByRecipient } from '@/server/comms-log'

const NOW = 1_750_000_000_000

let tmpHome: string

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'commslog-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  fs.mkdirSync(path.join(tmpHome, '.hermes', 'profiles', 'p1'), {
    recursive: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  try {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('countCommsByRecipient', () => {
  it('attributes per-recipient ok/error by unnesting the recipients array', () => {
    // A dead mailbox: 6 sends, all error. Each fan-out row names one recipient.
    for (let i = 0; i < 6; i++) {
      recordCommsOutcome(
        'p1',
        {
          direction: 'outbound',
          channel: 'email',
          actor: 'system:lead-notify',
          recipients: ['victoria@misscommunicationconsulting.com'],
          outcome: 'error',
        },
        NOW - i * 1000,
      )
    }
    // A healthy DMS intake: 5 ok, 1 error.
    for (let i = 0; i < 5; i++) {
      recordCommsOutcome(
        'p1',
        {
          direction: 'outbound',
          channel: 'email',
          actor: 'system:lead-notify',
          recipients: ['leads@serrahonda.co'],
          outcome: 'ok',
        },
        NOW - i * 1000,
      )
    }
    recordCommsOutcome(
      'p1',
      {
        direction: 'outbound',
        channel: 'email',
        actor: 'system:lead-notify',
        recipients: ['leads@serrahonda.co'],
        outcome: 'error',
      },
      NOW,
    )

    const rows = countCommsByRecipient('p1', 24 * 60 * 60_000, NOW + 1, 'email')
    const byAddr = Object.fromEntries(rows.map((r) => [r.recipient, r]))

    expect(byAddr['victoria@misscommunicationconsulting.com']).toEqual({
      recipient: 'victoria@misscommunicationconsulting.com',
      ok: 0,
      error: 6,
      total: 6,
    })
    expect(byAddr['leads@serrahonda.co']).toEqual({
      recipient: 'leads@serrahonda.co',
      ok: 5,
      error: 1,
      total: 6,
    })
  })

  it('respects the time window (old rows excluded) and returns [] when empty', () => {
    recordCommsOutcome(
      'p1',
      {
        direction: 'outbound',
        channel: 'email',
        actor: 'system:lead-notify',
        recipients: ['old@dealer.co'],
        outcome: 'error',
      },
      NOW - 48 * 60 * 60_000, // 48h ago — outside a 24h window
    )
    const rows = countCommsByRecipient('p1', 24 * 60 * 60_000, NOW, 'email')
    expect(rows).toEqual([])
  })
})
