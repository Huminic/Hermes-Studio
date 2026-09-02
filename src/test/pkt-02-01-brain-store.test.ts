// @vitest-environment node
/**
 * PKT-02-01 Brain/InfoStore persistence adapter — focused proof.
 *
 * Executes the accepted real Honda-21043 packet, persists it into a DISPOSABLE
 * per-profile dev Brain (profileRoot -> tmpdir; nothing touches ~/.hermes or any
 * production db), reads it back, and proves: exact five-metric persistence, missing
 * stays NULL (never zero), SW-013/014 stay source_investigation_pending, idempotent
 * replay, deterministic content-hash reconstruction, and the fail-closed guards
 * (tamper, wrong dealer, wrong profile, Service/Parts, missing-as-zero, unknown
 * metric, unsent alert / no delivery side effect).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PacketRun } from '@/server/reports/packet/engine'
import { executePacket } from '@/server/reports/packet/engine'
import { contentSha } from '@/server/reports/packet/store'
import { openBrain } from '@/server/brain-store'
import {
  PacketBrainStoreError,
  listPacketRuns,
  persistPacketRun,
  readPacketRun,
  reconstructedContentSha,
} from '@/server/watchdog/packet-brain-store'

const REPO = path.resolve(__dirname, '..', '..')
const LEADS = process.env.HALO_LEADS_DIR ?? '/tmp/halo-295-leads-20260831'
const HAVE = fs.existsSync(
  path.join(LEADS, 'serra-honda-21043_leads_2026-08-24_2026-08-30.xlsx'),
)

const PROFILE = 'serra-honda'
const DEALER = '21043'
const PERIOD = '2026-08-24..2026-08-30'
const MEASURED = ['SW-011', 'SW-012', 'SW-015']
const PENDING = ['SW-013', 'SW-014']

const makeRun = (): PacketRun =>
  executePacket({
    repoRoot: REPO,
    leadsDir: LEADS,
    asOf: '2026-09-02T06:51:10Z',
    engineVersion: 'pkt-exec-1',
  })

/** deep clone a run and re-seal its content hash (self-consistent again). */
function clone(run: PacketRun): PacketRun {
  return JSON.parse(JSON.stringify(run)) as PacketRun
}
function reseal(run: PacketRun): PacketRun {
  run.content_sha256 = contentSha(run)
  return run
}

let tmp: string
let profileRoot: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pkt0201-brain-'))
  profileRoot = path.join(tmp, PROFILE)
})
afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe.runIf(HAVE)('PKT-02-01 Brain persistence adapter', () => {
  it('persists all five metrics exactly once and reads them back exactly', () => {
    const run = makeRun()
    const res = persistPacketRun(run, { profile: PROFILE, profileRoot })
    expect(res.changed).toBe(true)
    expect(res.rows).toEqual({
      run: 1,
      observations: 5,
      evaluations: 5,
      findings: 5,
      alert_candidates: 3, // measured metrics only
    })

    const stored = readPacketRun(run.run_key, { profile: PROFILE, profileRoot })!
    expect(stored).not.toBeNull()
    expect(stored.dealer_id).toBe(DEALER)
    expect(stored.profile).toBe(PROFILE)
    expect(stored.period).toBe(PERIOD)
    expect(stored.binding_sha256).toBe(run.binding_sha256)
    expect(stored.source_sha256).toBe(run.source_sha256)

    // Exactly the five ids, each once.
    const obsIds = stored.observations.map((o) => o.metric_id).sort()
    expect(obsIds).toEqual(['SW-011', 'SW-012', 'SW-013', 'SW-014', 'SW-015'])
    expect(new Set(obsIds).size).toBe(5)

    // Measured dispositions retained.
    for (const id of MEASURED) {
      const o = stored.observations.find((x) => x.metric_id === id)!
      expect(o.status).toBe('measured')
      expect(o.value).not.toBeNull()
    }
    // Pending dispositions retained + internal-only.
    for (const id of PENDING) {
      const o = stored.observations.find((x) => x.metric_id === id)!
      expect(o.status).toBe('source_investigation_pending')
    }
  })

  it('read-back values/dispositions equal the freshly-executed run', () => {
    const run = makeRun()
    persistPacketRun(run, { profile: PROFILE, profileRoot })
    const stored = readPacketRun(run.run_key, { profile: PROFILE, profileRoot })!
    for (const src of run.observations) {
      const got = stored.observations.find((o) => o.metric_id === src.metric_id)!
      expect(got.value).toBe(src.value)
      expect(got.numerator).toBe(src.numerator)
      expect(got.denominator).toBe(src.denominator)
      expect(got.missing).toBe(src.missing)
      expect(got.unit).toBe(src.unit)
      expect(got.status).toBe(src.status)
    }
    // Evaluations: grade-target linkage + rating preserved.
    for (const src of run.evaluations) {
      const got = stored.evaluations.find((e) => e.metric_id === src.metric_id)!
      expect(got.grade_target_id).toBe(src.grade_target_id)
      expect(got.rating).toBe(src.rating)
      expect(got.detection_fired).toBe(src.detection_fired)
      expect(got.threshold).toBe(src.threshold)
    }
  })

  it('preserves missing as NULL, never zero (SW-013/014 held open)', () => {
    const run = makeRun()
    persistPacketRun(run, { profile: PROFILE, profileRoot })
    const stored = readPacketRun(run.run_key, { profile: PROFILE, profileRoot })!
    for (const id of PENDING) {
      const o = stored.observations.find((x) => x.metric_id === id)!
      expect(o.value).toBeNull()
      expect(o.value).not.toBe(0)
      expect(o.numerator).toBeNull()
      expect(o.denominator).toBeNull()
      expect(o.source_investigation).not.toBeNull()
    }
  })

  it('reconstructs the deterministic content hash from persisted rows', () => {
    const run = makeRun()
    persistPacketRun(run, { profile: PROFILE, profileRoot })
    expect(
      reconstructedContentSha(run.run_key, { profile: PROFILE, profileRoot }),
    ).toBe(run.content_sha256)
  })

  it('is idempotent: re-persisting the identical run changes nothing', () => {
    const run = makeRun()
    persistPacketRun(run, { profile: PROFILE, profileRoot })
    const second = persistPacketRun(run, { profile: PROFILE, profileRoot })
    expect(second.changed).toBe(false)
    // Still exactly one run, five observations.
    expect(listPacketRuns({ profile: PROFILE, profileRoot })).toHaveLength(1)
    const stored = readPacketRun(run.run_key, { profile: PROFILE, profileRoot })!
    expect(stored.observations).toHaveLength(5)
    expect(stored.alert_candidates).toHaveLength(3)
  })

  it('replays the identical packet twice with no duplicate rows', () => {
    const a = makeRun()
    persistPacketRun(a, { profile: PROFILE, profileRoot })
    const b = makeRun() // identical inputs -> identical run_key + content
    expect(b.run_key).toBe(a.run_key)
    expect(b.content_sha256).toBe(a.content_sha256)
    const res = persistPacketRun(b, { profile: PROFILE, profileRoot })
    expect(res.changed).toBe(false)
    expect(listPacketRuns({ profile: PROFILE, profileRoot })).toHaveLength(1)
  })

  it('refuses a run_key collision that carries different content (fail-closed)', () => {
    const run = makeRun()
    persistPacketRun(run, { profile: PROFILE, profileRoot })
    const tampered = reseal(
      (() => {
        const c = clone(run)
        c.observations[0].value = 999
        return c
      })(),
    )
    // same run_key, different (self-consistent) content -> refuse overwrite
    tampered.run_key = run.run_key
    expect(() =>
      persistPacketRun(tampered, { profile: PROFILE, profileRoot }),
    ).toThrow(PacketBrainStoreError)
  })

  it('fail-closed: content_sha256 tamper is rejected', () => {
    const run = clone(makeRun())
    run.observations[0].value = 0 // massage a value but leave the pinned hash stale
    expect(() =>
      persistPacketRun(run, { profile: PROFILE, profileRoot }),
    ).toThrow(/content_sha256 mismatch/)
  })

  it('fail-closed: wrong dealer is rejected', () => {
    const run = reseal(
      (() => {
        const c = clone(makeRun())
        c.dealer_id = '21044' // Nissan rooftop
        return c
      })(),
    )
    expect(() =>
      persistPacketRun(run, { profile: PROFILE, profileRoot }),
    ).toThrow(/wrong dealer/)
  })

  it('fail-closed: wrong profile is rejected (one-tenant)', () => {
    const run = makeRun()
    expect(() =>
      persistPacketRun(run, { profile: 'serra-nissan', profileRoot }),
    ).toThrow(/wrong profile/)
  })

  it('fail-closed: Sales-only proof not affirming zero Service/Parts is rejected', () => {
    const run = reseal(
      (() => {
        const c = clone(makeRun())
        c.two_delta.evidence_delta.sales_only_proof =
          '3 Service/Parts tokens found in categorical columns'
        return c
      })(),
    )
    expect(() =>
      persistPacketRun(run, { profile: PROFILE, profileRoot }),
    ).toThrow(/grammar/)
  })

  it('fail-closed: a contradictory proof that merely CONTAINS "zero Service/Parts" is rejected', () => {
    const run = reseal(
      (() => {
        const c = clone(makeRun())
        // Contains the old-regex substring but is contradictory / unanchored.
        c.two_delta.evidence_delta.sales_only_proof =
          'warning: zero Service/Parts is a lie; 9 Service/Parts tokens present'
        return c
      })(),
    )
    expect(() =>
      persistPacketRun(run, { profile: PROFILE, profileRoot }),
    ).toThrow(/grammar/)
  })

  it('fail-closed: a proof naming the wrong rooftop is rejected (anchored dealer)', () => {
    const run = reseal(
      (() => {
        const c = clone(makeRun())
        c.two_delta.evidence_delta.sales_only_proof =
          '119 rows: one rooftop Dealer ID=21044; zero Service/Parts tokens in categorical columns; rest'
        return c
      })(),
    )
    expect(() =>
      persistPacketRun(run, { profile: PROFILE, profileRoot }),
    ).toThrow(/grammar/)
  })

  it('fail-closed: evidence_delta period lineage mismatch is rejected', () => {
    const run = reseal(
      (() => {
        const c = clone(makeRun())
        c.two_delta.evidence_delta.period = '2026-08-17..2026-08-23'
        return c
      })(),
    )
    expect(() =>
      persistPacketRun(run, { profile: PROFILE, profileRoot }),
    ).toThrow(/period lineage mismatch/)
  })

  it('fail-closed: evidence_delta source_sha256 lineage mismatch is rejected', () => {
    const run = reseal(
      (() => {
        const c = clone(makeRun())
        c.two_delta.evidence_delta.source_sha256 = 'deadbeef'.repeat(8)
        return c
      })(),
    )
    expect(() =>
      persistPacketRun(run, { profile: PROFILE, profileRoot }),
    ).toThrow(/source_sha256 lineage mismatch/)
  })

  it('fail-closed: a pending metric carrying a zero value is rejected (missing != zero)', () => {
    const run = reseal(
      (() => {
        const c = clone(makeRun())
        const o = c.observations.find((x) => x.metric_id === 'SW-013')!
        o.value = 0 // fabricate a zero where the value must stay missing
        return c
      })(),
    )
    expect(() =>
      persistPacketRun(run, { profile: PROFILE, profileRoot }),
    ).toThrow(/missing must stay NULL/)
  })

  it('fail-closed: an unknown metric id is rejected', () => {
    const run = reseal(
      (() => {
        const c = clone(makeRun())
        c.observations[0].metric_id = 'SW-099' // not in the frozen packet set
        return c
      })(),
    )
    expect(() =>
      persistPacketRun(run, { profile: PROFILE, profileRoot }),
    ).toThrow(/unknown metric id|missing observation/)
  })

  it('preserves UNSENT alert status and produces no delivery side effect', () => {
    const run = makeRun()
    persistPacketRun(run, { profile: PROFILE, profileRoot })
    const stored = readPacketRun(run.run_key, { profile: PROFILE, profileRoot })!
    for (const a of stored.alert_candidates) {
      expect(a.delivered).toBe(false)
      expect(a.unsent).toBe(true)
      expect(a.channel).toBe('simulated_none')
    }
    // No delivery surface was touched: the operational `notification` table
    // (the real alert-delivery store) was never created by this adapter.
    const dbPath = path.join(profileRoot, 'brain', 'brain.db')
    expect(fs.existsSync(dbPath)).toBe(true)
    const Sqlite = require('better-sqlite3')
    const db = new Sqlite(dbPath, { readonly: true })
    try {
      const t = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='notification'`,
        )
        .get()
      expect(t).toBeUndefined()
    } finally {
      db.close()
    }
  })

  it('is atomic: a mid-write failure rolls back the parent (no false no-op replay)', () => {
    const run = makeRun()
    // Ensure tables exist, then pre-seed a CONFLICTING child row (same run_key +
    // SW-011) so the first observation INSERT collides mid-transaction.
    listPacketRuns({ profile: PROFILE, profileRoot })
    const seed = openBrain(PROFILE, { profileRoot })
    seed.run(
      `INSERT INTO watchdog_packet_observation
         (run_key, metric_id, profile, period, status, calculation_kind, unit,
          source_fields, source_lineage, confidence, gradable)
       VALUES (?, 'SW-011', ?, ?, 'measured', 'duration', 'minutes', '[]', '{}', 'medium', 1)`,
      run.run_key, PROFILE, run.period,
    )
    seed.close()

    // Parent insert succeeds, then the SW-011 child insert hits the PK conflict.
    expect(() =>
      persistPacketRun(run, { profile: PROFILE, profileRoot }),
    ).toThrow()

    // Rollback proof: NO parent row survived; a later valid replay is NOT a no-op.
    expect(listPacketRuns({ profile: PROFILE, profileRoot })).toHaveLength(0)
    expect(readPacketRun(run.run_key, { profile: PROFILE, profileRoot })).toBeNull()

    // Remove the orphan seed row; a fresh persist now succeeds cleanly.
    const cleanup = openBrain(PROFILE, { profileRoot })
    cleanup.run(
      `DELETE FROM watchdog_packet_observation WHERE run_key = ? AND metric_id = 'SW-011'`,
      run.run_key,
    )
    cleanup.close()
    const res = persistPacketRun(run, { profile: PROFILE, profileRoot })
    expect(res.changed).toBe(true)
    expect(
      readPacketRun(run.run_key, { profile: PROFILE, profileRoot })!.observations,
    ).toHaveLength(5)
  })

  it('detects delivery-flag tamper: flipping delivered breaks reconstruction', () => {
    const run = makeRun()
    persistPacketRun(run, { profile: PROFILE, profileRoot })
    const db = openBrain(PROFILE, { profileRoot })
    db.run(
      `UPDATE watchdog_packet_alert_candidate SET delivered = 1 WHERE run_key = ? AND metric_id = 'SW-011'`,
      run.run_key,
    )
    db.close()
    const stored = readPacketRun(run.run_key, { profile: PROFILE, profileRoot })!
    expect(stored.alert_candidates.find((a) => a.metric_id === 'SW-011')!.delivered).toBe(true)
    expect(
      reconstructedContentSha(run.run_key, { profile: PROFILE, profileRoot }),
    ).not.toBe(run.content_sha256)
  })

  it('detects delivery-flag tamper: flipping unsent breaks reconstruction', () => {
    const run = makeRun()
    persistPacketRun(run, { profile: PROFILE, profileRoot })
    const db = openBrain(PROFILE, { profileRoot })
    db.run(
      `UPDATE watchdog_packet_alert_candidate SET unsent = 0 WHERE run_key = ? AND metric_id = 'SW-012'`,
      run.run_key,
    )
    db.close()
    expect(
      reconstructedContentSha(run.run_key, { profile: PROFILE, profileRoot }),
    ).not.toBe(run.content_sha256)
  })

  it('fail-closed: an incomplete evaluation family is rejected (exact set)', () => {
    const run = reseal(
      (() => {
        const c = clone(makeRun())
        c.evaluations = c.evaluations.filter((e) => e.metric_id !== 'SW-014')
        return c
      })(),
    )
    expect(() =>
      persistPacketRun(run, { profile: PROFILE, profileRoot }),
    ).toThrow(/evaluations: (expected exactly|missing declared)/)
  })

  it('fail-closed: an incomplete finding family is rejected (exact set)', () => {
    const run = reseal(
      (() => {
        const c = clone(makeRun())
        c.findings = c.findings.filter((f) => f.metric_id !== 'SW-011')
        return c
      })(),
    )
    expect(() =>
      persistPacketRun(run, { profile: PROFILE, profileRoot }),
    ).toThrow(/findings: (expected exactly|missing declared)/)
  })

  it('fail-closed: an extra alert candidate (pending id) is rejected (exact set)', () => {
    const run = reseal(
      (() => {
        const c = clone(makeRun())
        c.alert_simulations.push({
          metric_id: 'SW-013',
          would_fire: false,
          channel: 'simulated_none',
          delivered: false,
          unsent: true,
          message: '[SIMULATED — NOT SENT] injected',
        })
        return c
      })(),
    )
    expect(() =>
      persistPacketRun(run, { profile: PROFILE, profileRoot }),
    ).toThrow(/alert_simulations: expected exactly 3/)
  })

  it('fail-closed: a per-record period mismatch is rejected', () => {
    const run = reseal(
      (() => {
        const c = clone(makeRun())
        c.observations.find((o) => o.metric_id === 'SW-012')!.period =
          '2026-08-17..2026-08-23'
        return c
      })(),
    )
    expect(() =>
      persistPacketRun(run, { profile: PROFILE, profileRoot }),
    ).toThrow(/period .* != run period/)
  })

  it('keeps period history: a second period appends without mutating the first', () => {
    const a = makeRun()
    persistPacketRun(a, { profile: PROFILE, profileRoot })
    const b = reseal(
      (() => {
        const c = clone(a)
        const p = '2026-08-17..2026-08-23'
        c.period = p
        c.observations.forEach((o) => (o.period = p))
        c.evaluations.forEach((e) => (e.period = p))
        c.findings.forEach((f) => (f.period = p))
        c.two_delta.evidence_delta.period = p
        c.two_delta.meaning_delta.forEach(() => {})
        c.run_key = `${a.run_key}-p2`
        return c
      })(),
    )
    persistPacketRun(b, { profile: PROFILE, profileRoot })
    const runs = listPacketRuns({ profile: PROFILE, profileRoot })
    expect(runs.map((r) => r.period).sort()).toEqual([
      '2026-08-17..2026-08-23',
      '2026-08-24..2026-08-30',
    ])
    // First period still intact.
    const first = readPacketRun(a.run_key, { profile: PROFILE, profileRoot })!
    expect(first.period).toBe(PERIOD)
    expect(first.observations).toHaveLength(5)
  })
})
