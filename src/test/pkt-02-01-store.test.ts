// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PacketRun } from '@/server/reports/packet/engine'
import { executePacket } from '@/server/reports/packet/engine'
import {
  PacketStore,
  StoreIntegrityError,
  contentSha,
} from '@/server/reports/packet/store'

const REPO = path.resolve(__dirname, '..', '..')
const LEADS = process.env.HALO_LEADS_DIR ?? '/tmp/halo-295-leads-20260831'
const HAVE = fs.existsSync(
  path.join(LEADS, 'serra-honda-21043_leads_2026-08-24_2026-08-30.xlsx'),
)

const makeRun = (): PacketRun =>
  executePacket({
    repoRoot: REPO,
    leadsDir: LEADS,
    asOf: '2026-09-02T06:51:10Z',
    engineVersion: 'pkt-exec-1',
  })

const tmpStore = () =>
  new PacketStore(fs.mkdtempSync(path.join(os.tmpdir(), 'pkt0201-store-')))

/** deep clone + remap to a different period for period-history testing */
function remapPeriod(run: PacketRun, period: string): PacketRun {
  const c = JSON.parse(JSON.stringify(run)) as PacketRun
  c.period = period
  c.run_key = `${run.run_key}-${period}`
  c.observations.forEach((o) => (o.period = period))
  c.evaluations.forEach((e) => (e.period = period))
  c.findings.forEach((f) => (f.period = period))
  c.content_sha256 = contentSha(c) // keep the run self-consistent
  return c
}

describe.runIf(HAVE)('PKT-02-01 dev store', () => {
  it('persists observations/evaluations/findings/lineage/alerts + a manifest', () => {
    const store = tmpStore()
    const run = makeRun()
    const res = store.persist(run)
    expect(res.changed).toBe(true)
    expect(res.runKey).toBe(run.run_key)
    // manifest + derived records exist
    expect(store.hasRun(run.run_key)).toBe(true)
    expect(store.periods()).toEqual([run.period])
  })

  it('is idempotent: a second identical persist changes nothing', () => {
    const store = tmpStore()
    const run = makeRun()
    store.persist(run)
    const second = store.persist(run)
    expect(second.changed).toBe(false)
  })

  it('replays: reconstructed content hashes to the stored content_sha256', () => {
    const store = tmpStore()
    const run = makeRun()
    store.persist(run)
    expect(store.reconstructedSha(run.run_key)).toBe(run.content_sha256)
    // full integrity check passes on an untouched store
    expect(() => store.verify(run.run_key)).not.toThrow()
  })

  it('keeps period history: a new period is appended, prior period preserved', () => {
    const store = tmpStore()
    const a = makeRun()
    const b = remapPeriod(a, '2026-08-17..2026-08-23')
    store.persist(a)
    store.persist(b)
    expect(store.periods().sort()).toEqual([
      '2026-08-17..2026-08-23',
      '2026-08-24..2026-08-30',
    ])
  })

  it('detects tampering: mutating a stored derived record fails verify()', () => {
    const store = tmpStore()
    const run = makeRun()
    store.persist(run)
    // out-of-band tamper of one observation record
    const obsPath = store.observationPath(run.period, 'SW-012')
    const obj = JSON.parse(fs.readFileSync(obsPath, 'utf8'))
    obj.value = 0 // massage a breach into a healthy zero
    fs.writeFileSync(obsPath, JSON.stringify(obj))
    expect(() => store.verify(run.run_key)).toThrow(StoreIntegrityError)
  })

  it('detects manifest tampering via content_sha256 mismatch', () => {
    const store = tmpStore()
    const run = makeRun()
    store.persist(run)
    const mp = store.manifestPath(run.run_key)
    const man = JSON.parse(fs.readFileSync(mp, 'utf8'))
    // mutate content but leave the pinned content_sha256 stale
    man.content.observations[0].value = 999
    fs.writeFileSync(mp, JSON.stringify(man))
    expect(() => store.verify(run.run_key)).toThrow(StoreIntegrityError)
  })

  it('deterministic rebuild: two stores yield byte-identical manifests', () => {
    const s1 = tmpStore()
    const s2 = tmpStore()
    const run = makeRun()
    s1.persist(run)
    s2.persist(run)
    const b1 = fs.readFileSync(s1.manifestPath(run.run_key))
    const b2 = fs.readFileSync(s2.manifestPath(run.run_key))
    expect(b1.equals(b2)).toBe(true)
  })
})
