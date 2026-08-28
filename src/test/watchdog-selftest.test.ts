import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

/**
 * Focused tests for the Duane-gated live self-test. NO real email is ever sent —
 * an injected fake sender stands in for the Resend-backed sendNotification. Covers:
 * exactly-one live send to the allowlisted recipient with the approved subject;
 * refusal on bad confirm, non-allowlisted recipient, and any tick/outbound flag on;
 * idempotency (sent-marker blocks a second send); precise cleanup keeps a governed
 * sibling byte-identical.
 */

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-selftest-'))
const saved = { ...process.env }
process.env.BRAIN_PROFILES_ROOT = ROOT
for (const v of ['OUTBOUND_LIVE_ENABLED', 'COMMS_TICK_ENABLED', 'SENTINEL_TICK_ENABLED']) delete process.env[v]

import {
  SELFTEST_ALLOWED_RECIPIENTS,
  SELFTEST_PROFILE,
  cleanupSelfTest,
  governedHashes,
  runLiveSelfTest,
} from '../../scripts/watchdog-fixture'
import { createNotification, listNotifications } from '../server/watchdog/notifications-store'

const RECIPIENT = SELFTEST_ALLOWED_RECIPIENTS[0]
const sha = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')

function fakeSender() {
  const calls: Array<{ to: string; subject: string }> = []
  const sender = vi.fn(async (input: { to: string; subject: string }) => {
    calls.push({ to: input.to, subject: input.subject })
    return { ok: true as const, email_id: 'evt_test_abc123' }
  })
  return { sender, calls }
}

function clearSelftestDir() {
  fs.rmSync(path.join(ROOT, SELFTEST_PROFILE), { recursive: true, force: true })
}

describe('watchdog live self-test (isolated, fake sender — no real send)', () => {
  beforeEach(() => {
    for (const v of ['OUTBOUND_LIVE_ENABLED', 'COMMS_TICK_ENABLED', 'SENTINEL_TICK_ENABLED']) delete process.env[v]
    clearSelftestDir()
  })
  afterAll(() => {
    process.env = { ...saved }
    fs.rmSync(ROOT, { recursive: true, force: true })
  })

  it('sends exactly one email to the allowlisted recipient with the approved subject', async () => {
    const { sender, calls } = fakeSender()
    const res = await runLiveSelfTest({ recipient: RECIPIENT, confirm: 'SEND-ONE', sender })

    expect(res.conversations).toBe(1)
    expect(res.firing).toBe(1)
    expect(res.dispatch.sent).toBe(true)
    expect(res.dispatch.dry_run).toBe(false)
    expect(res.dispatch.to).toBe(RECIPIENT)
    expect(res.dispatch.subject).toBe('Watchdog alert: WATCHDOG-SELFTEST conversations low')
    expect(res.dispatch.email_id).toBe('evt_test_abc123')

    expect(sender).toHaveBeenCalledTimes(1)
    expect(calls[0].to).toBe(RECIPIENT)
    expect(calls[0].subject).toBe('Watchdog alert: WATCHDOG-SELFTEST conversations low')

    // sent-marker persisted for idempotency
    expect(fs.existsSync(path.join(ROOT, SELFTEST_PROFILE, '.watchdog-selftest-sent.json'))).toBe(true)
  })

  it('refuses without the exact confirm token (no send)', async () => {
    const { sender } = fakeSender()
    await expect(runLiveSelfTest({ recipient: RECIPIENT, confirm: 'nope', sender })).rejects.toThrow(/LIVE_SELF_TEST_CONFIRM/)
    expect(sender).not.toHaveBeenCalled()
  })

  it('refuses a non-allowlisted recipient (no send)', async () => {
    const { sender } = fakeSender()
    await expect(runLiveSelfTest({ recipient: 'someone-else@example.com', confirm: 'SEND-ONE', sender })).rejects.toThrow(/not allowlisted/)
    expect(sender).not.toHaveBeenCalled()
  })

  it('refuses when any tick/outbound flag is set (no send)', async () => {
    const { sender } = fakeSender()
    process.env.COMMS_TICK_ENABLED = 'true'
    try {
      await expect(runLiveSelfTest({ recipient: RECIPIENT, confirm: 'SEND-ONE', sender })).rejects.toThrow(/must be off/)
    } finally {
      delete process.env.COMMS_TICK_ENABLED
    }
    expect(sender).not.toHaveBeenCalled()
  })

  it('is idempotent: a second run refuses and does not send again', async () => {
    const first = fakeSender()
    await runLiveSelfTest({ recipient: RECIPIENT, confirm: 'SEND-ONE', sender: first.sender })
    expect(first.sender).toHaveBeenCalledTimes(1)

    const second = fakeSender()
    await expect(runLiveSelfTest({ recipient: RECIPIENT, confirm: 'SEND-ONE', sender: second.sender })).rejects.toThrow(/sent-marker already exists/)
    expect(second.sender).not.toHaveBeenCalled()
  })

  it('cleanup removes only the self-test; a governed sibling stays byte-identical', async () => {
    createNotification(
      { profile: 'governed-store', email: 'real@dealer.example', query_name: 'real', description: 'real record' },
      1000,
    )
    const governedDb = path.join(ROOT, 'governed-store', 'brain', 'brain.db')
    const before = sha(governedDb)
    const ghBefore = governedHashes(['governed-store'])['governed-store']

    const { sender } = fakeSender()
    await runLiveSelfTest({ recipient: RECIPIENT, confirm: 'SEND-ONE', sender })

    const cleanup = cleanupSelfTest()
    expect(cleanup.deletedNotifications).toBe(1)
    expect(cleanup.deletedThreads).toBe(1)
    expect(cleanup.residualNotifications).toBe(0)
    expect(cleanup.removedDir).toBe(true)
    expect(fs.existsSync(path.join(ROOT, SELFTEST_PROFILE))).toBe(false)

    expect(sha(governedDb)).toBe(before)
    expect(governedHashes(['governed-store'])['governed-store']).toBe(ghBefore)
    expect(listNotifications('governed-store').length).toBe(1)
  })
})
