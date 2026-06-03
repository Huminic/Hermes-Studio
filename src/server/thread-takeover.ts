/**
 * Human-takeover state per thread. Mirrors Nexxus's `conversation.assignedTo`
 * contract: the moment a human claims a thread, the autonomous agent MUST stop
 * replying (re-checked immediately before send). Stored in the profile Brain
 * (comms metadata). Set by the Comms inbox when a human claims/replies; cleared
 * when released back to the AI.
 */

import { openBrain } from './brain-store'

function ensureTable(profile: string, profileRoot?: string) {
  const h = openBrain(profile, { profileRoot })
  h.exec(
    `CREATE TABLE IF NOT EXISTS thread_takeover (
       thread_id TEXT PRIMARY KEY,
       assigned_to TEXT,
       ts INTEGER
     )`,
  )
  return h
}

export function assignThreadToHuman(
  profile: string,
  threadId: string,
  assignedTo: string,
  opts: { profileRoot?: string; nowMs?: number } = {},
): void {
  try {
    const h = ensureTable(profile, opts.profileRoot)
    h.run(
      `INSERT INTO thread_takeover (thread_id, assigned_to, ts) VALUES (?, ?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET assigned_to = excluded.assigned_to, ts = excluded.ts`,
      threadId,
      assignedTo,
      opts.nowMs ?? Date.now(),
    )
  } catch {
    // best effort
  }
}

export function releaseThreadToAi(
  profile: string,
  threadId: string,
  opts: { profileRoot?: string } = {},
): void {
  try {
    const h = ensureTable(profile, opts.profileRoot)
    h.run(`DELETE FROM thread_takeover WHERE thread_id = ?`, threadId)
  } catch {
    // best effort
  }
}

/** True when a human has claimed the thread → the AI must not auto-reply. */
export function isHumanAssigned(
  profile: string,
  threadId: string,
  opts: { profileRoot?: string } = {},
): boolean {
  try {
    const h = ensureTable(profile, opts.profileRoot)
    const row = h.get<{ thread_id: string }>(
      `SELECT thread_id FROM thread_takeover WHERE thread_id = ?`,
      threadId,
    )
    return !!row
  } catch {
    return false
  }
}
