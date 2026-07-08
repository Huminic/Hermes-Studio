/**
 * Per-profile outbound blacklist (STOP / opt-out / DNC). Mirrors Nexxus's
 * `sms_blacklist`: when a contact texts STOP (or is otherwise opted out), their
 * handle is added here and the CommGate refuses outbound to it. Stored in the
 * profile Brain (comms metadata) so it travels with the profile.
 */

import { openBrain } from './brain-store'
import { toE164 } from './phone-handle'

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

/**
 * Normalise a handle for comparison. Phone-shaped handles canonicalize to "+"
 * and digits so a STOP from "+1 (415) 555-0100" reliably blocks a later send to
 * "+14155550100"; email/other handles lowercase. addToBlacklist and
 * isBlacklisted both use this, so an inbound opt-out and an outbound recipient
 * compare equal even when the carrier posts a different phone format.
 */
function norm(handle: string): string {
  const t = handle.trim()
  // Phone-shaped → canonical E.164 (adds +1 to a bare 10-digit), the SAME form
  // producers/gate use — so a STOP stored as "+14155550100" blocks a later send
  // whether the recipient handle arrives as "4155550100", "+1 (415) 555-0100",
  // or "+14155550100". Falls back to digits-only if unparseable.
  if (/^\+?[\d()\-.\s]+$/.test(t)) return toE164(t) ?? t.replace(/[^\d+]/g, '')
  return t.toLowerCase()
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

/** TCPA opt-out / opt-in keywords (carrier-standard). Matched on the first word. */
export const STOP_RE = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|optout|opt-out)\b/i
export const START_RE = /^\s*(start|unstop|yes|subscribe)\b/i

/** Phone-shaped channels where STOP/START opt-out keywords apply. */
const OPT_OUT_CHANNELS: ReadonlySet<string> = new Set([
  'sms',
  'textmagic',
  'voice',
  'phone',
  'vapi',
])

/**
 * Apply a carrier-standard STOP/START keyword from an inbound message: STOP →
 * blacklist the handle (CommGate then refuses all future outbound), START →
 * clear it. Shared by the TextMagic webhook AND the generic inbound endpoint so
 * every inbound phone path honors opt-out identically. No-op for non-phone
 * channels. The handle is normalized in {@link addToBlacklist} to canonical
 * E.164, so it matches outbound recipients regardless of format.
 */
export function applyOptOutKeyword(input: {
  profile: string
  channel: string
  handle: string
  text: string
  profileRoot?: string
  nowMs?: number
}): { stop: boolean; start: boolean } {
  if (!OPT_OUT_CHANNELS.has(input.channel)) return { stop: false, start: false }
  const stop = STOP_RE.test(input.text)
  const start = !stop && START_RE.test(input.text)
  const opts = { profileRoot: input.profileRoot, nowMs: input.nowMs }
  if (stop) addToBlacklist(input.profile, input.handle, 'STOP (inbound SMS)', opts)
  else if (start) removeFromBlacklist(input.profile, input.handle, opts)
  return { stop, start }
}
