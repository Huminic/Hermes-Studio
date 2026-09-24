/**
 * Call-recording persistence + access (P3 — Serra comms recovery).
 *
 * WHY: Vapi delivers a SHORT-LIVED presigned Cloudflare R2 URL
 * (`…r2.cloudflarestorage.com/hipaa-recordings/<id>?<sigv4>`). Once the
 * signature expires, the dealer's "listen" link returns
 * `<Code>InvalidArgument</Code><Message>Authorization</Message>` (an S3/R2 400).
 * The previous behaviour forwarded that raw URL verbatim, so links rotted.
 *
 * FIX: on the Vapi webhook, download the audio to our own disk under
 * `/mnt/storage/recordings/<profile>/<callId>.wav`, and hand the dealer an
 * AUTHENTICATED link to OUR serving route (HMAC token binding profile|callId,
 * mirroring the takeover-token pattern). A 30-day age-based reaper prunes the
 * files (HIPAA retention — the bucket is literally `hipaa-recordings`).
 *
 * This module is pure + dependency-injected (fetch, fs root) so it is unit
 * testable without network or the real `/mnt/storage`.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** 30 days. HIPAA retention window for stored call audio. */
export const RECORDING_MAX_AGE_MS = 30 * 24 * 60 * 60_000

/**
 * Signing secret for recording links. Same source as the takeover token so a
 * single deployment secret covers both. Returns null when unset (→ no token
 * can be minted, and the serving route fails closed).
 */
export function recordingSigningSecret(): string | null {
  return process.env.TAKEOVER_TOKEN_SECRET || process.env.API_SERVER_KEY || null
}

/** Filesystem root for stored recordings (env override for tests/ops). */
export function recordingsRoot(): string {
  return process.env.RECORDINGS_ROOT || '/mnt/storage/recordings'
}

/** Allow only filename-safe characters; collapse everything else. Blocks path traversal. */
function safeSegment(s: string): string {
  return (
    (s || '')
      .replace(/[^A-Za-z0-9._-]/g, '_') // drop separators/exotic chars
      .replace(/\.{2,}/g, '_') // no '..' parent-dir sequences anywhere
      .replace(/^[.]+/, '_') || // no leading dot (hidden files / '.')
    '_'
  )
}

/** Absolute on-disk path for a profile's call recording. Traversal-safe. */
export function recordingLocalPath(
  profile: string,
  callId: string,
  root: string = recordingsRoot(),
): string {
  return path.join(root, safeSegment(profile), `${safeSegment(callId)}.wav`)
}

/**
 * Mint an opaque, URL-safe token binding (profile, callId):
 * `<base64url(profile|callId)>.<base64url(hmac-sha256)>`. No expiry — access is
 * authorized for one specific recording; the file itself is reaped at 30 days.
 * Returns null when no secret is configured.
 */
export function mintRecordingToken(
  profile: string,
  callId: string,
  secret: string | null = recordingSigningSecret(),
): string | null {
  if (!secret) return null
  const body = Buffer.from(`${profile}|${callId}`, 'utf8').toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

/**
 * Verify a recording token. Returns { profile, callId } on success, or null on
 * any failure (missing secret, malformed, bad signature, profile mismatch).
 * Constant-time signature comparison.
 */
export function verifyRecordingToken(
  token: string,
  opts: { expectedProfile?: string; secret?: string | null } = {},
): { profile: string; callId: string } | null {
  const secret = opts.secret ?? recordingSigningSecret()
  if (!secret || !token) return null
  const dot = token.indexOf('.')
  if (dot === -1) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  let payload: string
  try {
    payload = Buffer.from(body, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const sep = payload.indexOf('|')
  if (sep === -1) return null
  const profile = payload.slice(0, sep)
  const callId = payload.slice(sep + 1)
  if (!profile || !callId) return null
  if (opts.expectedProfile && opts.expectedProfile !== profile) return null
  return { profile, callId }
}

/** Absolute URL to OUR authenticated serving route for a recording. */
export function recordingPublicUrl(
  profile: string,
  callId: string,
  opts: { baseUrl: string; secret?: string | null },
): string | null {
  const token = mintRecordingToken(profile, callId, opts.secret ?? recordingSigningSecret())
  if (!token) return null
  const base = opts.baseUrl.replace(/\/$/, '')
  return `${base}/api/recordings/${encodeURIComponent(profile)}/${encodeURIComponent(callId)}?t=${token}`
}

/**
 * Download a recording to disk. NEVER throws — returns { path } on success or
 * null on any failure (non-2xx, network error, empty body). The file is written
 * atomically-ish (temp + rename) with mode 0600 (PHI: not world-readable).
 */
export async function downloadRecording(opts: {
  profile: string
  callId: string
  url: string
  root?: string
  fetchImpl?: typeof fetch
}): Promise<{ path: string } | null> {
  const { profile, callId, url } = opts
  if (!url) return null
  const root = opts.root ?? recordingsRoot()
  const doFetch = opts.fetchImpl ?? fetch
  const dest = recordingLocalPath(profile, callId, root)
  try {
    const res = await doFetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) return null
    fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 })
    const tmp = `${dest}.tmp-${process.pid}`
    fs.writeFileSync(tmp, buf, { mode: 0o600 })
    fs.renameSync(tmp, dest)
    return { path: dest }
  } catch {
    return null
  }
}

/**
 * Delete recordings older than maxAgeMs (by mtime). Returns the deleted paths.
 * No-op (empty) when the root does not exist. Best-effort per file.
 */
export function reapOldRecordings(opts: {
  root?: string
  now?: number
  maxAgeMs?: number
}): string[] {
  const root = opts.root ?? recordingsRoot()
  const now = opts.now ?? Date.now()
  const maxAgeMs = opts.maxAgeMs ?? RECORDING_MAX_AGE_MS
  const deleted: string[] = []
  let profileDirs: string[]
  try {
    profileDirs = fs.readdirSync(root)
  } catch {
    return deleted
  }
  for (const pd of profileDirs) {
    const dir = path.join(root, pd)
    let entries: string[]
    try {
      if (!fs.statSync(dir).isDirectory()) continue
      entries = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      const file = path.join(dir, name)
      try {
        const st = fs.statSync(file)
        if (!st.isFile()) continue
        if (now - st.mtimeMs > maxAgeMs) {
          fs.rmSync(file)
          deleted.push(file)
        }
      } catch {
        // best effort — skip
      }
    }
  }
  return deleted
}
