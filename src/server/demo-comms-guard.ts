/**
 * Demo-safe communications guard — the #1 safeguard for the Huminic Motors demo.
 *
 * The demo lets a prospect experience REAL proactive outreach (SMS, AI callback)
 * on their OWN phone/email. That is only safe if every outbound send is
 * hard-bounded to the current session's captured contact and can NEVER reach a
 * third party. This module is that bound. It is consulted INSIDE checkCommGate
 * (the single fail-closed choke point), so no send path can bypass it.
 *
 * Guarantees:
 *  - HARD ALLOWLIST: for a demo profile, a regulated send (sms/voice) may only
 *    reach a phone/email registered to an ACTIVE demo session. Anything else is
 *    a CRITICAL drop (logged), never sent.
 *  - PER-SESSION RATE LIMIT: <=10 SMS and <=3 calls per demo session.
 *  - WATERMARK: every demo message carries a "Huminic demo" watermark.
 *  - RETENTION: registrations auto-expire (default 2h) and are purged on reset.
 *
 * Demo profiles are an explicit, env-overridable allowlist (default
 * "huminic-motors"). A production profile can never be a demo profile unless
 * named here, so the bypasses this module grants can never touch a real tenant.
 */

/** Which profiles are demo tenants. Explicit + env-overridable; prod-safe. */
const DEMO_PROFILES: ReadonlySet<string> = new Set(
  (process.env.DEMO_PROFILES ?? 'huminic-motors')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

export function isDemoProfile(profile: string): boolean {
  return DEMO_PROFILES.has(profile)
}

/**
 * PERSISTENT demo test recipients (env DEMO_TEST_RECIPIENTS, comma-separated
 * phones/emails). Always allowed for demo profiles — this is how a REP testing
 * workspace functions (campaigns, automations, manual sends) makes THEMSELF the
 * only reachable recipient without going through the public-site capture. A
 * campaign in the demo tenant fans out to its contact list, but the guard drops
 * every destination except these test recipients (and any live session's own
 * captured contact), so a demo campaign can never reach a real person.
 */
function persistentTestRecipients(): Set<string> {
  const raw = process.env.DEMO_TEST_RECIPIENTS ?? ''
  const out = new Set<string>()
  for (const entry of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    out.add(entry.includes('@') ? 'e:' + normEmail(entry) : 'p:' + normPhone(entry))
  }
  return out
}

/** Default registration TTL — matches the demo lead retention window. */
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000 // 2h
const SMS_CAP_PER_SESSION = 10
const CALL_CAP_PER_SESSION = 3
const DEMO_WATERMARK = ' [Huminic demo]'

type Registration = { sessionId: string; expiresAt: number }

/** profile -> normalized contact -> registration */
const allowlist = new Map<string, Map<string, Registration>>()
/** sessionId -> per-session counters */
const rateBySession = new Map<string, { sms: number; calls: number }>()

/** Normalize a US/E.164 phone to '1XXXXXXXXXX' for comparison. '' if not usable. */
export function normPhone(raw: string): string {
  const digits = String(raw ?? '').replace(/[^\d]/g, '')
  if (digits.length === 10) return '1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return digits
  return digits // fall back to whatever digits we have (still exact-match only)
}

export function normEmail(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
}

/** True if `to` looks like an email (has an @), else treated as a phone. */
function isEmail(to: string): boolean {
  return to.includes('@')
}

function normContact(to: string): string {
  return isEmail(to) ? 'e:' + normEmail(to) : 'p:' + normPhone(to)
}

/**
 * Register the current demo session's captured contact(s). Called by the
 * lead-capture endpoint. Idempotent per (profile, contact); refreshes the TTL.
 */
export function registerDemoContact(
  profile: string,
  sessionId: string,
  contact: { phone?: string | null; email?: string | null },
  opts?: { ttlMs?: number; nowMs?: number },
): void {
  if (!isDemoProfile(profile)) return
  const now = opts?.nowMs ?? Date.now()
  const expiresAt = now + (opts?.ttlMs ?? DEFAULT_TTL_MS)
  let m = allowlist.get(profile)
  if (!m) {
    m = new Map()
    allowlist.set(profile, m)
  }
  if (contact.phone && normPhone(contact.phone)) {
    m.set('p:' + normPhone(contact.phone), { sessionId, expiresAt })
  }
  if (contact.email && normEmail(contact.email)) {
    m.set('e:' + normEmail(contact.email), { sessionId, expiresAt })
  }
}

/** Does an ACTIVE demo session — or a persistent test recipient — own this destination? */
export function demoAllowlistHas(profile: string, to: string, nowMs?: number): boolean {
  const key = normContact(to)
  // Persistent rep/tester recipients (env) are always allowed for demo profiles.
  if (persistentTestRecipients().has(key)) return true
  const now = nowMs ?? Date.now()
  const m = allowlist.get(profile)
  if (!m) return false
  const reg = m.get(key)
  if (!reg) return false
  if (reg.expiresAt <= now) {
    m.delete(key) // lazy purge
    return false
  }
  return true
}

/** Look up the owning session for a destination (null if none/expired). */
export function demoSessionFor(profile: string, to: string, nowMs?: number): string | null {
  const now = nowMs ?? Date.now()
  const reg = allowlist.get(profile)?.get(normContact(to))
  if (!reg || reg.expiresAt <= now) return null
  return reg.sessionId
}

/**
 * The hard allowlist decision used inside checkCommGate. Returns ok:false with a
 * CRITICAL reason when the destination is not the current session's own contact.
 */
export function checkDemoAllowlist(
  profile: string,
  channel: string,
  to: string,
  nowMs?: number,
): { ok: true } | { ok: false; reason: string } {
  if (demoAllowlistHas(profile, to, nowMs)) return { ok: true }
  const reason = `demo-safe guard: ${channel} destination ${to} is NOT the current demo session's captured contact — dropped`
  // CRITICAL: a non-visitor destination reached a demo send path. Never sent.
  console.error(`[demo-comms-guard] CRITICAL BLOCK ${profile}: ${reason}`)
  return { ok: false, reason }
}

/** Per-session rate check. kind: 'sms' | 'call'. Does NOT increment. */
export function demoRateOk(sessionId: string, kind: 'sms' | 'call'): boolean {
  const c = rateBySession.get(sessionId) ?? { sms: 0, calls: 0 }
  return kind === 'sms' ? c.sms < SMS_CAP_PER_SESSION : c.calls < CALL_CAP_PER_SESSION
}

/** Record one demo send against the session's counters (call after a send). */
export function demoRateRecord(sessionId: string, kind: 'sms' | 'call'): void {
  const c = rateBySession.get(sessionId) ?? { sms: 0, calls: 0 }
  if (kind === 'sms') c.sms += 1
  else c.calls += 1
  rateBySession.set(sessionId, c)
}

/** Append the demo watermark to an outbound message (idempotent). */
export function watermarkDemo(content: string): string {
  const s = String(content ?? '')
  return s.includes(DEMO_WATERMARK.trim()) ? s : s + DEMO_WATERMARK
}

/** Purge one demo session's registrations + counters (for the <60s reset). */
export function resetDemoSession(sessionId: string): void {
  rateBySession.delete(sessionId)
  for (const m of allowlist.values()) {
    for (const [k, reg] of m) if (reg.sessionId === sessionId) m.delete(k)
  }
}

/** Purge ALL demo state for a profile (full tenant reset). */
export function resetDemoProfile(profile: string): void {
  const m = allowlist.get(profile)
  if (m) {
    for (const reg of m.values()) rateBySession.delete(reg.sessionId)
    allowlist.delete(profile)
  }
}

/** Test-only: clear all in-memory state. */
export function __resetDemoGuardForTests(): void {
  allowlist.clear()
  rateBySession.clear()
}
