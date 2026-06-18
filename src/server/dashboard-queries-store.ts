/**
 * Saved "Ask AI" queries for the Dashboard Custom tab. Per-profile, stored in a
 * lazily-created Brain table (tenant-scoped, mirrors the report_* pattern). UI
 * state only — not governed knowledge, so it does not flow through DSG.
 */

import { openBrain, now as brainNow, uuid } from './brain-store'
import type { BrainHandle } from './brain-store'

export type SavedQuery = { id: string; text: string; created_at: number }

function ensureTable(handle: BrainHandle): void {
  handle.exec(`CREATE TABLE IF NOT EXISTS dashboard_saved_queries (
    id TEXT PRIMARY KEY, ts INTEGER, text TEXT, tenant TEXT
  )`)
}

export function listSavedQueries(
  profile: string,
  opts: { profileRoot?: string; limit?: number } = {},
): Array<SavedQuery> {
  const handle = openBrain(profile, { profileRoot: opts.profileRoot })
  try {
    ensureTable(handle)
    return handle
      .all<{ id: string; ts: number; text: string }>(
        `SELECT id, ts, text FROM dashboard_saved_queries
         WHERE tenant = ? ORDER BY ts DESC LIMIT ?`,
        profile,
        opts.limit ?? 100,
      )
      .map((r) => ({ id: r.id, text: r.text, created_at: r.ts }))
  } finally {
    handle.close()
  }
}

export function saveQuery(
  profile: string,
  text: string,
  opts: { profileRoot?: string } = {},
): { ok: true; query: SavedQuery } | { ok: false; error: string } {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: 'Empty query.' }
  if (trimmed.length > 1000) return { ok: false, error: 'Query is too long.' }
  const handle = openBrain(profile, { profileRoot: opts.profileRoot })
  try {
    ensureTable(handle)
    const id = uuid()
    const ts = brainNow()
    handle.run(
      `INSERT INTO dashboard_saved_queries (id, ts, text, tenant) VALUES (?, ?, ?, ?)`,
      id,
      ts,
      trimmed,
      profile,
    )
    return { ok: true, query: { id, text: trimmed, created_at: ts } }
  } finally {
    handle.close()
  }
}

export function deleteSavedQuery(
  profile: string,
  id: string,
  opts: { profileRoot?: string } = {},
): { ok: true } {
  const handle = openBrain(profile, { profileRoot: opts.profileRoot })
  try {
    ensureTable(handle)
    handle.run(
      `DELETE FROM dashboard_saved_queries WHERE id = ? AND tenant = ?`,
      id,
      profile,
    )
    return { ok: true }
  } finally {
    handle.close()
  }
}
