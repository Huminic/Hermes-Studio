/**
 * Manual / alert notifications store (per-profile brain.db). Distinct from the
 * studio's notification *routing rules*: this is a table of concrete alerts a
 * user created (e.g. from an Issue's "Create Alert"), shown on the Notifications
 * page. Each carries the email, a human query name, and a non-technical
 * description of what it watches.
 */
import { openBrain, uuid } from '../brain-store'

export type NotificationRecord = {
  id: string
  profile: string
  email: string
  /** Human name of the underlying query/rule (e.g. "Customer waiting on a reply"). */
  query_name: string
  /** Non-technical description of what it does (shown in the modal + list). */
  description: string
  /** Origin: a watchdog finding key, 'manual', etc. */
  source: string
  status: 'active' | 'paused'
  created_at: number
}

type Handle = ReturnType<typeof openBrain>

function ensure(profile: string, profileRoot?: string): Handle {
  const h = openBrain(profile, { profileRoot })
  h.exec(
    `CREATE TABLE IF NOT EXISTS notification (
       id          TEXT PRIMARY KEY,
       profile     TEXT NOT NULL,
       email       TEXT NOT NULL,
       query_name  TEXT NOT NULL,
       description TEXT NOT NULL,
       source      TEXT NOT NULL DEFAULT 'manual',
       status      TEXT NOT NULL DEFAULT 'active',
       created_at  INTEGER NOT NULL
     )`,
  )
  return h
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim())
}

export function createNotification(
  input: {
    profile: string
    email: string
    query_name: string
    description: string
    source?: string
  },
  now: number,
  opts: { profileRoot?: string } = {},
): { ok: true; id: string } | { ok: false; error: string } {
  if (!isValidEmail(input.email)) return { ok: false, error: 'A valid email is required.' }
  if (!input.query_name.trim()) return { ok: false, error: 'A query name is required.' }
  const h = ensure(input.profile, opts.profileRoot)
  const id = uuid()
  h.run(
    `INSERT INTO notification (id, profile, email, query_name, description, source, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
    id, input.profile, input.email.trim(), input.query_name.trim(),
    input.description.trim(), input.source ?? 'manual', now,
  )
  return { ok: true, id }
}

export function listNotifications(
  profile: string,
  opts: { limit?: number; profileRoot?: string } = {},
): Array<NotificationRecord> {
  const h = ensure(profile, opts.profileRoot)
  return h.all<NotificationRecord>(
    `SELECT * FROM notification WHERE profile = ? ORDER BY created_at DESC LIMIT ?`,
    profile, opts.limit ?? 200,
  )
}

export function deleteNotification(
  profile: string,
  id: string,
  opts: { profileRoot?: string } = {},
): boolean {
  const h = ensure(profile, opts.profileRoot)
  return h.run(`DELETE FROM notification WHERE profile = ? AND id = ?`, profile, id).changes > 0
}
