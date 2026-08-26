import { afterAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

/**
 * Deterministic, isolated exercise of the watchdog notification fixture:
 * seed → prove (fires, dry-run, nothing sent, outbound off) → cleanup, all under
 * a temp BRAIN_PROFILES_ROOT. A sibling "governed" profile with a real record
 * must be byte-identical before and after (isolation proof). No /srv dependency.
 */

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-fixture-'))
const savedRoot = process.env.BRAIN_PROFILES_ROOT
const savedOutbound = process.env.OUTBOUND_LIVE_ENABLED
const savedTick = process.env.COMMS_TICK_ENABLED
process.env.BRAIN_PROFILES_ROOT = ROOT
delete process.env.OUTBOUND_LIVE_ENABLED
delete process.env.COMMS_TICK_ENABLED

// Imported AFTER env is set so the store modules resolve the isolated root.
import {
  FIXTURE_PROFILE,
  RECIPIENT,
  TAG,
  cleanupFixture,
  governedHashes,
  proveFixture,
  quarantineStale,
  seedFixture,
} from '../../scripts/watchdog-fixture'
import { createNotification, listNotifications } from '../server/watchdog/notifications-store'

const sha = (file: string) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

describe('watchdog notification fixture (isolated seed → prove → cleanup)', () => {
  afterAll(() => {
    if (savedRoot === undefined) delete process.env.BRAIN_PROFILES_ROOT
    else process.env.BRAIN_PROFILES_ROOT = savedRoot
    if (savedOutbound !== undefined) process.env.OUTBOUND_LIVE_ENABLED = savedOutbound
    if (savedTick !== undefined) process.env.COMMS_TICK_ENABLED = savedTick
    fs.rmSync(ROOT, { recursive: true, force: true })
  })

  it('fires in dry-run with outbound disabled and cleans up only the fixture', async () => {
    // A sibling governed profile holding a "real" record — must not be touched.
    createNotification(
      { profile: 'governed-store', email: 'real@dealer.example', query_name: 'real', description: 'real record' },
      1000,
    )
    const governedDb = path.join(ROOT, 'governed-store', 'brain', 'brain.db')
    const governedBefore = sha(governedDb)
    // Full file-set hash (brain.db + messaging-hub.db + WAL/SHM) — the script's
    // own isolation-evidence method.
    const ghBefore = governedHashes(['governed-store'])['governed-store']

    const marker = seedFixture()
    expect(marker.alertId).toBeTruthy()
    expect(marker.threadId).toBeTruthy()

    // Evaluate "now" AFTER seeding so the freshly-created thread is inside the window.
    const now = Date.now()
    const sender = vi.fn(async () => ({ ok: true as const, id: 'must-not-be-called' }))
    const proof = await proveFixture(now, { sender })

    expect(proof.conversations).toBe(1) // real seeded value, not a fabricated 0
    expect(proof.fires).toBe(1) // the tagged alert decides to fire
    expect(proof.firingMessages[0]).toMatch(/fell below 5 \(now 1\)/)
    expect(proof.outboundEnabled).toBe(false) // provably disabled
    expect(proof.commsTickEnabled).toBe(false)
    expect(proof.dispatch).toEqual([{ to: RECIPIENT, dry_run: true, sent: false }])
    expect(sender).not.toHaveBeenCalled() // nothing sent
    expect(proof.notificationRecords).toBe(1) // the record exists

    // governed record untouched through seed + prove
    expect(sha(governedDb)).toBe(governedBefore)

    const cleanup = cleanupFixture()
    expect(cleanup.deletedNotifications).toBe(1)
    expect(cleanup.deletedThreads).toBe(1)
    expect(cleanup.residualNotifications).toBe(0)
    expect(cleanup.removedDir).toBe(true)
    expect(fs.existsSync(path.join(ROOT, FIXTURE_PROFILE))).toBe(false)

    // governed record STILL byte-identical and intact after cleanup
    expect(sha(governedDb)).toBe(governedBefore)
    expect(governedHashes(['governed-store'])['governed-store']).toBe(ghBefore)
    expect(listNotifications('governed-store').length).toBe(1)
  })

  it('refuses a broad / production root (only the analytics root or OS temp allowed)', () => {
    const prev = process.env.BRAIN_PROFILES_ROOT
    for (const bad of ['/', '/srv', '/home/someone/.hermes/profiles']) {
      process.env.BRAIN_PROFILES_ROOT = bad
      expect(() => seedFixture()).toThrow(/Refusing BRAIN_PROFILES_ROOT/i)
    }
    process.env.BRAIN_PROFILES_ROOT = prev
  })

  it('refuses a temp symlink that escapes os.tmpdir (lexical + canonical enforced)', () => {
    const prev = process.env.BRAIN_PROFILES_ROOT
    // A symlink lexically under tmp whose target ('/') is NOT under tmp.
    const link = path.join(ROOT, 'escape-link')
    fs.symlinkSync('/', link)
    try {
      process.env.BRAIN_PROFILES_ROOT = link
      expect(() => seedFixture()).toThrow(/Refusing BRAIN_PROFILES_ROOT/i)
    } finally {
      process.env.BRAIN_PROFILES_ROOT = prev
      fs.rmSync(link, { force: true })
    }
  })

  it('refuses to seed over a pre-existing fixture dir', () => {
    fs.mkdirSync(path.join(ROOT, FIXTURE_PROFILE), { recursive: true })
    expect(() => seedFixture()).toThrow(/already exists/i)
    fs.rmSync(path.join(ROOT, FIXTURE_PROFILE), { recursive: true, force: true })
  })

  it('refuses cleanup without a valid ready marker (never rm an unowned dir)', () => {
    const dir = path.join(ROOT, FIXTURE_PROFILE)
    const mk = path.join(dir, '.watchdog-fixture.json')
    // (a) missing marker
    fs.mkdirSync(dir, { recursive: true })
    expect(() => cleanupFixture()).toThrow(/missing\/unreadable fixture marker/i)
    // (b) invalid marker (wrong tag / missing ids)
    fs.writeFileSync(mk, JSON.stringify({ tag: 'NOPE', profile: FIXTURE_PROFILE }))
    expect(() => cleanupFixture()).toThrow(/ownership validation/i)
    // (c) well-formed but provisional (phase=seeding) → refused (cleanup accepts ready only)
    fs.writeFileSync(
      mk,
      JSON.stringify({ tag: TAG, profile: FIXTURE_PROFILE, recipient: RECIPIENT, runId: 'r1', phase: 'seeding', threadId: 't', alertId: 'a', seededAt: 1 }),
    )
    expect(() => cleanupFixture()).toThrow(/ownership validation/i)
    // dir must still exist — cleanup never removed it
    expect(fs.existsSync(dir)).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('quarantines a partial dir (never blind-rm) when a write fails after the first app-layer write', () => {
    // Ensure the sibling governed record exists so its hash is meaningful.
    createNotification(
      { profile: 'governed-store', email: 'real@dealer.example', query_name: 'real', description: 'real record' },
      1000,
    )
    const ghBefore = governedHashes(['governed-store'])['governed-store']

    let qpath = ''
    expect(() => {
      try {
        seedFixture(Date.now(), {
          onAfterFirstWrite: () => {
            throw new Error('injected failure after first app-layer write')
          },
        })
      } catch (e) {
        qpath = String((e as Error).message).replace(/^[\s\S]*quarantined partial fixture to /, '')
        throw e
      }
    }).toThrow(/quarantined partial fixture/i)

    // No unowned residue left in the isolated root …
    expect(fs.existsSync(path.join(ROOT, FIXTURE_PROFILE))).toBe(false)
    // … it was moved to a uniquely-named quarantine dir under os.tmpdir.
    expect(qpath).toMatch(/wd-fixture-quarantine-/)
    expect(fs.existsSync(qpath)).toBe(true)
    // governed sibling untouched across the failed attempt
    expect(governedHashes(['governed-store'])['governed-store']).toBe(ghBefore)

    // The test removes ONLY that temp quarantine.
    fs.rmSync(qpath, { recursive: true, force: true })
  })

  it('quarantineStale moves an empty markerless dir but refuses ready/non-empty dirs', () => {
    const dir = path.join(ROOT, FIXTURE_PROFILE)

    // (a) empty, markerless dir (the poll/GET-initialized artifact) → quarantined
    fs.mkdirSync(dir, { recursive: true })
    const res = quarantineStale()
    expect(res.quarantined).toMatch(/wd-fixture-quarantine-stale-/)
    expect(fs.existsSync(dir)).toBe(false)
    expect(fs.existsSync(res.quarantined as string)).toBe(true)
    fs.rmSync(res.quarantined as string, { recursive: true, force: true })

    // (b) a READY-marker dir → refused (that is a live fixture → use cleanup)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.watchdog-fixture.json'),
      JSON.stringify({ tag: TAG, profile: FIXTURE_PROFILE, recipient: RECIPIENT, runId: 'r', phase: 'ready', threadId: 't', alertId: 'a', seededAt: 1 }),
    )
    expect(() => quarantineStale()).toThrow(/use cleanup instead/i)
    fs.rmSync(dir, { recursive: true, force: true })

    // (c) a non-empty dir (holds a notification) → refused
    createNotification({ profile: FIXTURE_PROFILE, email: RECIPIENT, query_name: 'x', description: 'y' }, 1)
    expect(() => quarantineStale()).toThrow(/not empty/i)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
