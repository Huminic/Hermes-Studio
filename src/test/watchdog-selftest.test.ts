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
 * a DURABLE receipt that survives profile cleanup and blocks a second send;
 * failure paths (provider not-sent / thrown sender) that auto-remove only the
 * synthetic profile, write no receipt, and leave the governed sibling unchanged.
 */

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-selftest-'))
const saved = { ...process.env }
process.env.BRAIN_PROFILES_ROOT = ROOT
for (const v of ['OUTBOUND_LIVE_ENABLED', 'COMMS_TICK_ENABLED', 'SENTINEL_TICK_ENABLED']) delete process.env[v]

import {
  SELFTEST_ALLOWED_RECIPIENTS,
  SELFTEST_PROFILE,
  SELFTEST_SUBJECT,
  cleanupSelfTest,
  recordExternalSelftestReceipt,
  runLiveSelfTest,
} from '../../scripts/watchdog-fixture'
import { createNotification, listNotifications } from '../server/watchdog/notifications-store'

const RECIPIENT = SELFTEST_ALLOWED_RECIPIENTS[0]
const RECEIPT = path.join(ROOT, '.watchdog-selftest-receipt.json')

// Deterministic isolation proof: a LOGICAL-content hash of the sibling's rows.
// (Live SQLite file bytes are unstable in-process — WAL/SHM sidecars shift with no
// logical change; the real live run hashes governed FILE sets while quiescent.)
function govHash(profile: string): string {
  const rows = listNotifications(profile).map((n) => ({
    id: n.id, email: n.email, query_name: n.query_name, description: n.description,
    source: n.source, status: n.status, created_at: n.created_at, metric_id: n.metric_id, last_fired_at: n.last_fired_at,
  }))
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}

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
    fs.rmSync(RECEIPT, { force: true }) // reset the durable one-time receipt per test
    fs.rmSync(path.join(ROOT, 'governed-store'), { recursive: true, force: true }) // fresh sibling per test
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

    // Durable receipt persisted OUTSIDE the profile dir, mode 0600, non-secret.
    expect(fs.existsSync(RECEIPT)).toBe(true)
    expect(fs.statSync(RECEIPT).mode & 0o777).toBe(0o600)
    const receipt = JSON.parse(fs.readFileSync(RECEIPT, 'utf8'))
    expect(receipt.to).toBe(RECIPIENT)
    expect(receipt.email_id).toBe('evt_test_abc123')
    expect(JSON.stringify(receipt)).not.toContain('token')
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

  it('is idempotent: a second run refuses via the durable receipt and does not send again', async () => {
    const first = fakeSender()
    await runLiveSelfTest({ recipient: RECIPIENT, confirm: 'SEND-ONE', sender: first.sender })
    expect(first.sender).toHaveBeenCalledTimes(1)

    const second = fakeSender()
    await expect(runLiveSelfTest({ recipient: RECIPIENT, confirm: 'SEND-ONE', sender: second.sender })).rejects.toThrow(/durable self-test sent receipt/)
    expect(second.sender).not.toHaveBeenCalled()
  })

  it('receipt survives profile cleanup: post-cleanup rerun refuses, sender called 0 times', async () => {
    const first = fakeSender()
    await runLiveSelfTest({ recipient: RECIPIENT, confirm: 'SEND-ONE', sender: first.sender })
    expect(first.sender).toHaveBeenCalledTimes(1)

    // Remove the synthetic profile entirely — the durable receipt must remain.
    cleanupSelfTest()
    expect(fs.existsSync(path.join(ROOT, SELFTEST_PROFILE))).toBe(false)
    expect(fs.existsSync(RECEIPT)).toBe(true)

    const second = fakeSender()
    await expect(runLiveSelfTest({ recipient: RECIPIENT, confirm: 'SEND-ONE', sender: second.sender })).rejects.toThrow(/durable self-test sent receipt/)
    expect(second.sender).toHaveBeenCalledTimes(0)
  })

  it('provider not-sent (ok:false): returns sent:false, auto-removes only the profile, no receipt, governed unchanged', async () => {
    createNotification(
      { profile: 'governed-store', email: 'real@dealer.example', query_name: 'real', description: 'real record' },
      1000,
    )
    const gh = govHash('governed-store')

    const failing = vi.fn(async () => ({ ok: false as const, error: 'CENTRAL_MCP_STUDIO_TOKEN not configured' }))
    const res = await runLiveSelfTest({ recipient: RECIPIENT, confirm: 'SEND-ONE', sender: failing })

    expect(res.dispatch.sent).toBe(false)
    expect(fs.existsSync(path.join(ROOT, SELFTEST_PROFILE))).toBe(false) // owned profile removed
    expect(fs.existsSync(RECEIPT)).toBe(false) // NO receipt on failure
    expect(govHash('governed-store')).toBe(gh)

    // One-time not consumed — a later good send still works.
    const ok = fakeSender()
    const res2 = await runLiveSelfTest({ recipient: RECIPIENT, confirm: 'SEND-ONE', sender: ok.sender })
    expect(res2.dispatch.sent).toBe(true)
    expect(fs.existsSync(RECEIPT)).toBe(true)
  })

  it('sender throws: rejects, auto-removes only the profile, no receipt, governed unchanged', async () => {
    createNotification(
      { profile: 'governed-store', email: 'real@dealer.example', query_name: 'real', description: 'real record' },
      1000,
    )
    const gh = govHash('governed-store')

    const thrower = vi.fn(async () => {
      throw new Error('transport blew up')
    })
    await expect(runLiveSelfTest({ recipient: RECIPIENT, confirm: 'SEND-ONE', sender: thrower })).rejects.toThrow(/transport blew up/)

    expect(fs.existsSync(path.join(ROOT, SELFTEST_PROFILE))).toBe(false) // owned profile removed
    expect(fs.existsSync(RECEIPT)).toBe(false) // NO receipt on failure
    expect(govHash('governed-store')).toBe(gh)
  })

  it('cleanup removes only the self-test; a governed sibling stays byte-identical', async () => {
    createNotification(
      { profile: 'governed-store', email: 'real@dealer.example', query_name: 'real', description: 'real record' },
      1000,
    )
    const ghBefore = govHash('governed-store')

    const { sender } = fakeSender()
    await runLiveSelfTest({ recipient: RECIPIENT, confirm: 'SEND-ONE', sender })

    const cleanup = cleanupSelfTest()
    expect(cleanup.deletedNotifications).toBe(1)
    expect(cleanup.deletedThreads).toBe(1)
    expect(cleanup.residualNotifications).toBe(0)
    expect(cleanup.removedDir).toBe(true)
    expect(fs.existsSync(path.join(ROOT, SELFTEST_PROFILE))).toBe(false)

    // Governed sibling untouched (robust file-set hash incl. WAL/SHM).
    expect(govHash('governed-store')).toBe(ghBefore)
    expect(listNotifications('governed-store').length).toBe(1)
  })

  // ── record-external-selftest-receipt (external transport already sent) ──────
  it('record-external: exact success writes a durable 0600 receipt, no profile/DB touch', () => {
    const res = recordExternalSelftestReceipt({
      confirm: 'SEND-ONE',
      recipient: RECIPIENT,
      subject: SELFTEST_SUBJECT,
      email_id: '6aba7036-d6e9-4083-a47a-636b5c8e975e',
    })
    expect(res.wrote).toBe(true)
    expect(res.runId).toBeTruthy()

    expect(fs.existsSync(RECEIPT)).toBe(true)
    expect(fs.statSync(RECEIPT).mode & 0o777).toBe(0o600)
    const receipt = JSON.parse(fs.readFileSync(RECEIPT, 'utf8'))
    expect(receipt.to).toBe(RECIPIENT)
    expect(receipt.subject).toBe(SELFTEST_SUBJECT)
    expect(receipt.email_id).toBe('6aba7036-d6e9-4083-a47a-636b5c8e975e')
    expect(receipt.transport).toBe('central-mcp-resend')
    expect(JSON.stringify(receipt)).not.toContain('token')

    // No profile/DB was created.
    expect(fs.existsSync(path.join(ROOT, SELFTEST_PROFILE))).toBe(false)
  })

  it('record-external: refuses on mismatched fields, writing nothing', () => {
    const good = { confirm: 'SEND-ONE', recipient: RECIPIENT, subject: SELFTEST_SUBJECT, email_id: 'evt_x' }
    expect(() => recordExternalSelftestReceipt({ ...good, confirm: 'nope' })).toThrow(/LIVE_SELF_TEST_CONFIRM/)
    expect(() => recordExternalSelftestReceipt({ ...good, recipient: 'someone-else@example.com' })).toThrow(/not allowlisted/)
    expect(() => recordExternalSelftestReceipt({ ...good, subject: 'Wrong subject' })).toThrow(/subject does not match/)
    expect(() => recordExternalSelftestReceipt({ ...good, email_id: '' })).toThrow(/non-empty/)
    expect(() => recordExternalSelftestReceipt({ ...good, email_id: '   ' })).toThrow(/non-empty/)
    expect(fs.existsSync(RECEIPT)).toBe(false)
  })

  it('record-external: refuses an existing receipt and never overwrites (one-time)', () => {
    recordExternalSelftestReceipt({ confirm: 'SEND-ONE', recipient: RECIPIENT, subject: SELFTEST_SUBJECT, email_id: 'evt_first' })
    expect(fs.existsSync(RECEIPT)).toBe(true)

    expect(() =>
      recordExternalSelftestReceipt({ confirm: 'SEND-ONE', recipient: RECIPIENT, subject: SELFTEST_SUBJECT, email_id: 'evt_second' }),
    ).toThrow(/durable self-test sent receipt/)

    const receipt = JSON.parse(fs.readFileSync(RECEIPT, 'utf8'))
    expect(receipt.email_id).toBe('evt_first') // not overwritten
  })
})
