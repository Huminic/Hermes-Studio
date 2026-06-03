/**
 * Per-profile outbound blacklist (STOP / opt-out / DNC). Mirrors Nexxus's
 * `sms_blacklist`: when a contact texts STOP (or is otherwise opted out), their
 * handle is added here and the CommGate refuses outbound to it. Stored in the
 * profile Brain (comms metadata) so it travels with the profile.
 */

import { openBrain } from './brain-store'

function ensureTable(profile: string, profileRoot?: string) {
  const h = openBrain(profile, { profileRoot })
  h.exec(
    `CREATE TABLE IF NOT EXISTS comms_blacklist (
       handle TEXT PRIMARY KEY,
       reason TEXT,
       ts INTEGER
     )`,
  )
  return h
}

/** Normalise a handle for comparison (strip spaces; keep digits/+ for phones). */
function norm(handle: string): string {
  return handle.trim().toLowerCase()
}

export function addToBlacklist(
  profile: string,
  handle: string,
  reason = 'STOP',
  opts: { profileRoot?: string; nowMs?: number } = {},
): void {
  try {
    const h = ensureTable(profile, opts.profileRoot)
    h.run(
      `INSERT INTO comms_blacklist (handle, reason, ts) VALUES (?, ?, ?)
       ON CONFLICT(handle) DO UPDATE SET reason = excluded.reason, ts = excluded.ts`,
      norm(handle),
      reason,
      opts.nowMs ?? Date.now(),
    )
  } catch {
    // brain unavailable (portable build) — best effort
  }
}

export function isBlacklisted(
  profile: string,
  handle: string,
  opts: { profileRoot?: string } = {},
): boolean {
  try {
    const h = ensureTable(profile, opts.profileRoot)
    const row = h.get<{ handle: string }>(
      `SELECT handle FROM comms_blacklist WHERE handle = ?`,
      norm(handle),
    )
    return !!row
  } catch {
    return false
  }
}

export function removeFromBlacklist(
  profile: string,
  handle: string,
  opts: { profileRoot?: string } = {},
): void {
  try {
    const h = ensureTable(profile, opts.profileRoot)
    h.run(`DELETE FROM comms_blacklist WHERE handle = ?`, norm(handle))
  } catch {
    // best effort
  }
}
