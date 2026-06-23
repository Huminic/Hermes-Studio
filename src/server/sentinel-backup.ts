/**
 * Sentinel daily backup — snapshots every per-profile SQLite database so the
 * digest can TRUTHFULLY confirm a backup happened (there was no automated
 * backup before this).
 *
 * Uses SQLite `VACUUM INTO`, which produces a consistent copy of a live
 * WAL database (safe while the app is using it) — not a raw file copy.
 * Snapshots land in <home>/.hermes/backups/<stamp>/<profile>/<db>; the last
 * `retain` stamped dirs are kept, older ones pruned. Fully fail-safe and
 * per-database isolated: one bad DB never aborts the rest.
 */
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const _require = createRequire(import.meta.url)

export type BackupReport = {
  ok: boolean
  dbCount: number
  bytes: number
  dir: string | null
  at: number
  errors: Array<string>
}

function stampFromMs(ms: number): string {
  // Deterministic, filesystem-safe: YYYY-MM-DDTHH-MM-SS (UTC).
  return new Date(ms).toISOString().replace(/[:.]/g, '-').replace(/-\d+Z$/, 'Z')
}

/** Recursively collect *.db files under dir, skipping any `backups` folder. */
function findDbs(dir: string, out: Array<string> = []): Array<string> {
  let entries: Array<fs.Dirent> = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === 'backups' || e.name === 'node_modules') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) findDbs(full, out)
    else if (e.isFile() && e.name.endsWith('.db')) out.push(full)
  }
  return out
}

export type BackupOptions = { homeDir?: string; now?: number; retain?: number }

export function runDailyBackup(opts: BackupOptions = {}): BackupReport {
  const now = opts.now ?? Date.now()
  const retain = opts.retain ?? 7
  const home = opts.homeDir ?? os.homedir()
  const profilesRoot = path.join(home, '.hermes', 'profiles')
  const backupsRoot = path.join(home, '.hermes', 'backups')
  const destDir = path.join(backupsRoot, stampFromMs(now))
  const report: BackupReport = { ok: false, dbCount: 0, bytes: 0, dir: destDir, at: now, errors: [] }

  let Database: typeof import('better-sqlite3')
  try {
    Database = _require('better-sqlite3') as typeof import('better-sqlite3')
  } catch (e) {
    report.errors.push(`better-sqlite3 unavailable: ${msg(e)}`)
    report.dir = null
    return report
  }

  const dbs = findDbs(profilesRoot)
  for (const src of dbs) {
    const rel = path.relative(profilesRoot, src)
    const dest = path.join(destDir, rel)
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      const db = new Database(src, { readonly: true })
      try {
        db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`)
      } finally {
        db.close()
      }
      report.dbCount++
      try {
        report.bytes += fs.statSync(dest).size
      } catch {
        /* size best-effort */
      }
    } catch (e) {
      report.errors.push(`${rel}: ${msg(e)}`)
    }
  }

  report.ok = report.dbCount > 0 && report.errors.length === 0
  pruneOld(backupsRoot, retain, report)
  return report
}

function pruneOld(backupsRoot: string, retain: number, report: BackupReport): void {
  try {
    const dirs = fs
      .readdirSync(backupsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort() // ISO stamps sort chronologically
    const toDelete = dirs.slice(0, Math.max(0, dirs.length - retain))
    for (const d of toDelete) {
      try {
        fs.rmSync(path.join(backupsRoot, d), { recursive: true, force: true })
      } catch (e) {
        report.errors.push(`prune ${d}: ${msg(e)}`)
      }
    }
  } catch {
    /* no backups dir yet */
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
