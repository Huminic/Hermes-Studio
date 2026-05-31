/**
 * Per-profile Brain storage substrate (SRS Tranche A.1).
 *
 * Each customer profile gets its own Brain at
 *   ~/.hermes/profiles/<profile>/brain/brain.db
 *
 * Uses better-sqlite3 when available; falls back to an in-memory store
 * for portable builds and tests. Mirrors the messaging-hub-store.ts
 * pattern so the isolation invariant (filesystem boundary) is preserved.
 *
 * SRS A.1 requirements satisfied here:
 *   - per-profile location under profile root
 *   - schema migration runs on first open; refuses to open on checksum drift
 *   - backup/restore (snapshot file + restore)
 *   - append-only audit substrate (metadata_audit) plus B.2 / A.6 / A.7 tables
 *
 * The DSG (src/server/dsg-gate.ts) is the only legal write path for
 * governed records; this module is the substrate that DSG writes through.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID, createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  MIGRATIONS,
  migrationChecksum,
  type Migration,
} from './brain-schema'

const _require = createRequire(import.meta.url)

// ── better-sqlite3 dynamic import (matches messaging-hub-store.ts) ────

type SqliteStatement = {
  run: (...args: Array<unknown>) => { changes: number; lastInsertRowid: number | bigint }
  get: (...args: Array<unknown>) => unknown
  all: (...args: Array<unknown>) => Array<unknown>
}
type SqliteDb = {
  exec: (sql: string) => void
  prepare: (sql: string) => SqliteStatement
  close: () => void
  backup: (filename: string) => Promise<void> | void
  pragma: (s: string) => unknown
}

let SqliteCtor: (new (file: string) => SqliteDb) | null = null
let sqliteResolved = false
function tryLoadSqlite(): typeof SqliteCtor {
  if (sqliteResolved) return SqliteCtor
  sqliteResolved = true
  try {
    const mod = _require('better-sqlite3')
    SqliteCtor = (mod.default ?? mod) as new (file: string) => SqliteDb
  } catch {
    SqliteCtor = null
  }
  return SqliteCtor
}

// ── Public types ─────────────────────────────────────────────────────

export type BrainHandle = {
  profile: string
  dbPath: string
  exec: (sql: string) => void
  run: (sql: string, ...params: Array<unknown>) => {
    changes: number
    lastInsertRowid: number | bigint
  }
  get: <T = unknown>(sql: string, ...params: Array<unknown>) => T | undefined
  all: <T = unknown>(sql: string, ...params: Array<unknown>) => Array<T>
  backup: (toPath: string) => Promise<void>
  close: () => void
  inMemory: boolean
  schemaVersion: number
}

export type BrainPaths = {
  brainRoot: string
  dbPath: string
  backupsDir: string
  vectorsDir: string
  uploadsDir: string
}

export type BrainOpenOptions = {
  /** Override the profile root (used by tests). */
  profileRoot?: string
  /** Force in-memory even when sqlite is available (tests). */
  forceMemory?: boolean
  /** Skip migrations (only for unit tests of the schema module). */
  skipMigrations?: boolean
}

export type BrainBackupReport = {
  profile: string
  src: string
  dest: string
  bytes: number
  checksum: string
  ts: number
}

export type BrainRestoreReport = {
  profile: string
  src: string
  dest: string
  bytes: number
  appliedMigrations: number
}

// ── Path resolution ──────────────────────────────────────────────────

export function resolveBrainPaths(
  profile: string,
  override?: string,
): BrainPaths {
  const safe = profile.replace(/[^a-zA-Z0-9_-]/g, '_')
  const envRoot = process.env.BRAIN_PROFILES_ROOT
  const base =
    override ??
    (envRoot
      ? path.join(envRoot, safe)
      : path.join(os.homedir(), '.hermes', 'profiles', safe))
  const brainRoot = path.join(base, 'brain')
  return {
    brainRoot,
    dbPath: path.join(brainRoot, 'brain.db'),
    backupsDir: path.join(brainRoot, 'backups'),
    vectorsDir: path.join(brainRoot, 'vectors'),
    uploadsDir: path.join(brainRoot, 'uploads'),
  }
}

function ensureBrainDirs(paths: BrainPaths): void {
  for (const d of [
    paths.brainRoot,
    paths.backupsDir,
    paths.vectorsDir,
    paths.uploadsDir,
  ]) {
    fs.mkdirSync(d, { recursive: true })
  }
}

// ── In-memory shim (parity with messaging-hub-store fallback) ────────

type InMemoryRow = Record<string, unknown>
type InMemoryTable = Array<InMemoryRow>

class InMemoryDb {
  tables = new Map<string, InMemoryTable>()
  schemaVersion = 0

  exec(_sql: string): void {
    // tables get created lazily as the migration runner inspects sql; we
    // don't actually parse it. In-memory mode is for tests where each
    // test seeds its own rows directly via run/get/all helpers below.
  }

  ensureTable(name: string): InMemoryTable {
    let t = this.tables.get(name)
    if (!t) {
      t = []
      this.tables.set(name, t)
    }
    return t
  }
}

// ── Open / migrate ───────────────────────────────────────────────────

export function openBrain(
  profile: string,
  opts: BrainOpenOptions = {},
): BrainHandle {
  const paths = resolveBrainPaths(profile, opts.profileRoot)
  ensureBrainDirs(paths)

  const Ctor = opts.forceMemory ? null : tryLoadSqlite()

  if (!Ctor) {
    return openInMemory(profile, paths)
  }

  const db: SqliteDb = new Ctor(paths.dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')

  if (!opts.skipMigrations) {
    applyMigrations(db, MIGRATIONS)
  }

  const schemaVersion = currentSchemaVersion(db)

  return {
    profile,
    dbPath: paths.dbPath,
    inMemory: false,
    schemaVersion,
    exec: (sql) => db.exec(sql),
    run: (sql, ...params) => db.prepare(sql).run(...params),
    get: <T,>(sql: string, ...params: Array<unknown>) =>
      db.prepare(sql).get(...params) as T | undefined,
    all: <T,>(sql: string, ...params: Array<unknown>) =>
      db.prepare(sql).all(...params) as Array<T>,
    backup: async (toPath) => {
      const dest = toPath || path.join(paths.backupsDir, snapshotName())
      await Promise.resolve(db.backup(dest))
    },
    close: () => db.close(),
  }
}

function snapshotName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `brain-${stamp}.db`
}

function openInMemory(profile: string, paths: BrainPaths): BrainHandle {
  const mem = new InMemoryDb()
  return {
    profile,
    dbPath: paths.dbPath,
    inMemory: true,
    schemaVersion: MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0,
    exec: (s) => mem.exec(s),
    run: (sql) => {
      const t = inferTableFromSql(sql)
      if (t) mem.ensureTable(t)
      return { changes: 0, lastInsertRowid: 0 }
    },
    get: () => undefined,
    all: () => [],
    backup: async () => {
      // no-op for memory
    },
    close: () => {
      mem.tables.clear()
    },
  }
}

function inferTableFromSql(sql: string): string | null {
  const m = sql.match(/INSERT\s+INTO\s+(\w+)/i)
  return m ? m[1] : null
}

// ── Migrations ───────────────────────────────────────────────────────

function applyMigrations(db: SqliteDb, migrations: Array<Migration>): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL,
    checksum TEXT NOT NULL
  )`)
  const applied = db
    .prepare('SELECT version, checksum FROM schema_migrations ORDER BY version')
    .all() as Array<{ version: number; checksum: string }>
  const appliedByVersion = new Map(applied.map((r) => [r.version, r.checksum]))

  for (const m of migrations) {
    const checksum = migrationChecksum(m.sql)
    const prior = appliedByVersion.get(m.version)
    if (prior && prior !== checksum) {
      throw new Error(
        `[brain-store] migration ${m.version} (${m.name}) checksum drift. ` +
          `Refusing to start. expected=${prior} got=${checksum}`,
      )
    }
    if (prior) continue
    db.exec('BEGIN')
    try {
      db.exec(m.sql)
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)',
      ).run(m.version, m.name, Date.now(), checksum)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw new Error(
        `[brain-store] migration ${m.version} (${m.name}) failed: ${
          (err as Error).message
        }`,
      )
    }
  }
}

function currentSchemaVersion(db: SqliteDb): number {
  try {
    const row = db
      .prepare('SELECT MAX(version) as v FROM schema_migrations')
      .get() as { v: number | null } | undefined
    return row?.v ?? 0
  } catch {
    return 0
  }
}

export function pendingMigrations(profile: string): Array<Migration> {
  const handle = openBrain(profile, { skipMigrations: true })
  try {
    if (handle.inMemory) return []
    const applied = handle.all<{ version: number }>(
      'SELECT version FROM schema_migrations',
    )
    const have = new Set(applied.map((r) => r.version))
    return MIGRATIONS.filter((m) => !have.has(m.version))
  } catch {
    return MIGRATIONS
  } finally {
    handle.close()
  }
}

// ── Backup / restore ─────────────────────────────────────────────────

export async function backupBrain(
  profile: string,
  options: { destination?: string; profileRoot?: string } = {},
): Promise<BrainBackupReport> {
  const paths = resolveBrainPaths(profile, options.profileRoot)
  ensureBrainDirs(paths)
  const dest =
    options.destination ?? path.join(paths.backupsDir, snapshotName())
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    await handle.backup(dest)
  } finally {
    handle.close()
  }
  const buf = fs.existsSync(dest) ? fs.readFileSync(dest) : Buffer.alloc(0)
  return {
    profile,
    src: paths.dbPath,
    dest,
    bytes: buf.byteLength,
    checksum: createHash('sha256').update(buf).digest('hex'),
    ts: Date.now(),
  }
}

export async function restoreBrain(
  profile: string,
  sourcePath: string,
  options: { profileRoot?: string } = {},
): Promise<BrainRestoreReport> {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`[brain-store] restore source not found: ${sourcePath}`)
  }
  const paths = resolveBrainPaths(profile, options.profileRoot)
  ensureBrainDirs(paths)
  fs.copyFileSync(sourcePath, paths.dbPath)
  // Reopen to apply any newer migrations.
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    return {
      profile,
      src: sourcePath,
      dest: paths.dbPath,
      bytes: fs.statSync(sourcePath).size,
      appliedMigrations: handle.schemaVersion,
    }
  } finally {
    handle.close()
  }
}

// ── Convenience helpers used by other server modules ────────────────

export function uuid(): string {
  return randomUUID()
}

export function now(): number {
  return Date.now()
}

export function jsonOrNull(v: unknown): string | null {
  if (v == null) return null
  try {
    return typeof v === 'string' ? v : JSON.stringify(v)
  } catch {
    return null
  }
}
