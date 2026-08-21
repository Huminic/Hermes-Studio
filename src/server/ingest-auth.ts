/**
 * Service-to-service auth + guards for the report-ingest interface
 * (`POST /api/ingest/report`).
 *
 * Unlike the customer upload route, this endpoint is called machine-to-machine
 * by central-mcp (the `studio_ingest_report` tool), which holds a shared secret.
 * Callers (Codex, later a Cloudflare Worker) are governed upstream by their MCP
 * token allowlist; this layer only trusts central-mcp's bearer secret.
 *
 * Posture: FAIL CLOSED. No secret configured → every request is rejected.
 */
import { timingSafeEqual } from 'node:crypto'

/** Default ingest-eligible profiles (Serra group + parent). Overridable via
 *  `INGEST_ELIGIBLE_PROFILES` (comma-separated). An unlisted profile is
 *  rejected so a mis-scoped call can never write another tenant's dashboard. */
const DEFAULT_ELIGIBLE = [
  'serra-honda',
  'serra-nissan',
  'tony-serra-ford',
  'ford-of-columbia',
  'hyundai-of-columbia',
  'serra-automotive',
]

export function ingestEligibleProfiles(): Array<string> {
  const raw = process.env.INGEST_ELIGIBLE_PROFILES?.trim()
  if (!raw) return DEFAULT_ELIGIBLE
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function isIngestEligible(profile: string): boolean {
  return ingestEligibleProfiles().includes(profile)
}

/**
 * DSG-gate actor identity for the ingest write. Must be one of the gate's
 * documented forms (`user:<username>` | `token:<label>` | `system:<subsystem>`);
 * a report-ingest is a subsystem, so it uses the `system:` form. Do NOT invent a
 * new `service:` identity — that is rejected by the gate (rule `unknown-actor`).
 */
export const INGEST_ACTOR = 'system:report-ingest'

/**
 * Strict base64 decode. `Buffer.from(s,'base64')` silently accepts many invalid
 * strings (skips non-alphabet chars, tolerates bad padding), so we validate the
 * charset + padding + canonical round-trip and return null on anything invalid.
 */
export function decodeBase64Strict(input: unknown): Buffer | null {
  if (typeof input !== 'string') return null
  const s = input.trim()
  if (s.length === 0 || s.length % 4 !== 0) return null
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null
  const buf = Buffer.from(s, 'base64')
  if (buf.toString('base64') !== s) return null // reject non-canonical
  return buf
}

/** Constant-time string compare that never throws on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export type SecretCheck =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string }

/**
 * Verify the `Authorization: Bearer <token>` header against
 * `INGEST_SERVICE_SECRET`. Fail-closed:
 *   - secret not configured → 503 (endpoint intentionally disabled)
 *   - missing/malformed/incorrect header → 401
 */
export function verifyIngestSecret(request: Request): SecretCheck {
  const expected = process.env.INGEST_SERVICE_SECRET?.trim()
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: 'ingest endpoint not configured (INGEST_SERVICE_SECRET unset)',
    }
  }
  const header = request.headers.get('authorization') ?? ''
  const m = header.match(/^Bearer\s+(.+)$/i)
  if (!m || !safeEqual(m[1].trim(), expected)) {
    return { ok: false, status: 401, error: 'unauthorized' }
  }
  return { ok: true }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export type PeriodHint = {
  periodStart?: string
  periodEnd?: string
  /** Present when the caller sent a hint we could not parse; ingestion still
   *  proceeds (falls back to the filename date) but the caller is warned. */
  warning?: string
}

/**
 * Parse a `period_hint`. Accepts `"YYYY-MM-DD"` (single day) or
 * `"YYYY-MM-DD/YYYY-MM-DD"` (range). Lenient: an absent or malformed hint
 * yields no override (+ a warning when malformed), so a bad hint degrades to
 * the filename-date behavior rather than failing the ingest.
 */
export function parsePeriodHint(hint: unknown): PeriodHint {
  if (hint == null || hint === '') return {}
  if (typeof hint !== 'string') {
    return { warning: 'period_hint ignored: not a string' }
  }
  const parts = hint.split('/').map((s) => s.trim())
  if (parts.length === 1 && isValidIsoDate(parts[0])) {
    return { periodStart: parts[0], periodEnd: parts[0] }
  }
  if (
    parts.length === 2 &&
    isValidIsoDate(parts[0]) &&
    isValidIsoDate(parts[1]) &&
    parts[0] <= parts[1]
  ) {
    return { periodStart: parts[0], periodEnd: parts[1] }
  }
  return {
    warning: `period_hint "${hint}" ignored: expected YYYY-MM-DD or YYYY-MM-DD/YYYY-MM-DD (start<=end)`,
  }
}
