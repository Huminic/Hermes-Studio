import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runDailyBackup } from '@/server/sentinel-backup'

const _require = createRequire(import.meta.url)

let home: string

function makeDb(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const Database = _require('better-sqlite3')
  const db = new Database(file)
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
  db.prepare('INSERT INTO t (v) VALUES (?)').run('hello')
  db.close()
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'bkp-test-'))
  makeDb(path.join(home, '.hermes', 'profiles', 'serra-honda', 'brain', 'brain.db'))
  makeDb(path.join(home, '.hermes', 'profiles', 'serra-honda', 'messaging-hub.db'))
})
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true })
})

describe('runDailyBackup', () => {
  it('backs up every profile database via VACUUM INTO', () => {
    const r = runDailyBackup({ homeDir: home, now: 1_750_000_000_000 })
    expect(r.ok).toBe(true)
    expect(r.dbCount).toBe(2)
    expect(r.bytes).toBeGreaterThan(0)
    expect(r.errors).toEqual([])
    // snapshots exist and are valid sqlite copies
    const brainCopy = path.join(r.dir!, 'serra-honda', 'brain', 'brain.db')
    expect(fs.existsSync(brainCopy)).toBe(true)
    const Database = _require('better-sqlite3')
    const db = new Database(brainCopy, { readonly: true })
    expect((db.prepare('SELECT COUNT(*) c FROM t').get() as { c: number }).c).toBe(1)
    db.close()
  })

  it('prunes to the retain limit', () => {
    for (let i = 0; i < 4; i++) {
      runDailyBackup({ homeDir: home, now: 1_750_000_000_000 + i * 86_400_000, retain: 2 })
    }
    const stamps = fs.readdirSync(path.join(home, '.hermes', 'backups'))
    expect(stamps.length).toBe(2)
  })

  it('does not skip the backups dir itself (no recursion blowup) and is fail-safe on empty home', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'bkp-empty-'))
    const r = runDailyBackup({ homeDir: empty, now: 1_750_000_000_000 })
    expect(r.dbCount).toBe(0)
    expect(r.ok).toBe(false) // nothing to back up
    fs.rmSync(empty, { recursive: true, force: true })
  })
})
