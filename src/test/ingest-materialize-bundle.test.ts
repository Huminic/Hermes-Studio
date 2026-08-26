import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { materializeTrio } from '@/server/ingest/materialize-bundle'

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'vin006-mat-')) })
afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }) } catch { /* ignore */ } })

const RAW = 'OPPORTUNITIES (3).csv'          // real browser basename (spaces + parens)
const DER = 'response-times-canonical-v1.csv'
const rawBuf = Buffer.from('raw,data\n1,2\n')
const derBuf = Buffer.from('der,data\n3,4\n')
const manifestJson = JSON.stringify({ ok: true, schema_version: 'x' }, null, 2)

// Mirror the route's path construction: temp staged ONE level under inbound; target two levels.
function materialize(umaskVal?: number) {
  const INBOUND = path.join(root, 'inbound')
  const profile = 'serra-honda'
  const captureId = 'vinsolutions-response-times-serra-honda-2026-08-25'
  const profDir = path.join(INBOUND, profile)
  const target = path.join(profDir, captureId)
  const tmp = path.join(INBOUND, `.tmp-${profile}-${captureId}-test`)
  fs.mkdirSync(INBOUND, { recursive: true })
  const prev = umaskVal !== undefined ? process.umask(umaskVal) : undefined
  try {
    materializeTrio({ profDir, tmp, target, rawFile: RAW, rawBuf, derFile: DER, derBuf, manifestJson })
  } finally {
    if (prev !== undefined) process.umask(prev)
  }
  return { INBOUND, profile, target, tmp }
}

describe('materializeTrio', () => {
  it('writes the trio with exact content, immutable 0444 files, traversable dir, and consumes tmp', () => {
    const { target, tmp } = materialize()
    expect(fs.readFileSync(path.join(target, RAW))).toEqual(rawBuf)
    expect(fs.readFileSync(path.join(target, DER))).toEqual(derBuf)
    expect(fs.readFileSync(path.join(target, 'manifest.v1.json'), 'utf8')).toBe(manifestJson)
    for (const f of [RAW, DER, 'manifest.v1.json']) {
      expect(fs.statSync(path.join(target, f)).mode & 0o777, f).toBe(0o444)
    }
    expect(fs.statSync(target).mode & 0o700).toBe(0o700) // target dir traversable (owner rwx)
    expect(fs.existsSync(tmp)).toBe(false)               // atomic reveal consumed the temp dir
  })

  it('succeeds under a restrictive umask 0177 (regression for the EACCES materialize failure)', () => {
    // Before the fix, umask 0177 made the temp dir 0600 (no owner-execute) → EACCES writing inside.
    const { target } = materialize(0o177)
    expect(fs.existsSync(path.join(target, RAW))).toBe(true)
    for (const f of [RAW, DER, 'manifest.v1.json']) {
      expect(fs.statSync(path.join(target, f)).mode & 0o777, f).toBe(0o444) // exactly 0444, not umask-masked 0400
    }
    expect(fs.statSync(target).mode & 0o700).toBe(0o700) // owner rwx despite the hostile umask
  })

  it('stages temp OUTSIDE the reconcile watcher glob inbound/*/*/manifest.v1.json', () => {
    const { INBOUND, target } = materialize()
    // Enumerate every manifest exactly two levels under inbound (the watcher glob).
    const twoLevel = fs.readdirSync(INBOUND)
      .map((d) => path.join(INBOUND, d))
      .filter((p) => fs.statSync(p).isDirectory())
      .flatMap((prof) => fs.readdirSync(prof).map((cap) => path.join(prof, cap, 'manifest.v1.json')))
      .filter((p) => fs.existsSync(p))
    expect(twoLevel).toEqual([path.join(target, 'manifest.v1.json')]) // only the revealed target — never a tmp
    // No leftover .tmp-* directly under inbound, and none was ever inside inbound/<profile>/.
    expect(fs.readdirSync(INBOUND).filter((d) => d.startsWith('.tmp-'))).toEqual([])
  })

  it('throws (fail-closed) when the target parent path is unusable, leaving no partial target', () => {
    const INBOUND = path.join(root, 'inbound')
    const profDir = path.join(INBOUND, 'serra-honda')
    const target = path.join(profDir, 'capX')
    const tmp = path.join(INBOUND, '.tmp-serra-honda-capX-test')
    fs.mkdirSync(INBOUND, { recursive: true })
    // Make profDir a FILE so mkdirSync(profDir) fails → materialize throws, target never created.
    fs.writeFileSync(profDir, 'not a dir')
    expect(() => materializeTrio({ profDir, tmp, target, rawFile: RAW, rawBuf, derFile: DER, derBuf, manifestJson })).toThrow()
    expect(fs.existsSync(target)).toBe(false)
  })
})
