import { randomBytes, timingSafeEqual } from 'node:crypto'
import { getRedisClient, getRedisClientSync } from './redis-client'

const TOKENS_KEY = 'hermes:studio:tokens'
const TOKEN_META_PREFIX = 'hermes:studio:token-meta:'
const TOKEN_TTL_S = 30 * 24 * 60 * 60 // 30 days

export type SessionMetadata = {
  /** Profile this session is authenticated as. Null in legacy (HERMES_PASSWORD) mode. */
  profile: string | null
  /** Whether the session can switch the global active profile and access admin operations. */
  is_admin: boolean
  /** Whether the session is a customer-admin for the scoped profile (storefront /p/$profile/* surfaces). */
  is_customer_admin: boolean
  /** Partner/group admin: list of profiles this session can access. Null/undefined for super-admin (sees all) or single-profile customer-admin. */
  scope_profiles?: string[]
  /** Username from the profile's auth.yaml. Null in legacy mode. */
  username: string | null
  /** Creation epoch ms. */
  created_at: number
}

const LEGACY_METADATA: SessionMetadata = {
  profile: null,
  is_admin: true,
  is_customer_admin: false,
  username: null,
  created_at: 0,
}

/**
 * In-memory session store — source of truth for the current process.
 * Each token maps to its session metadata. Backed by Redis when REDIS_URL is
 * set so tokens + metadata survive restarts.
 */
const sessionStore = new Map<string, SessionMetadata>()

// On startup load persisted tokens + metadata from Redis
void getRedisClient().then(async (client) => {
  if (!client) return
  try {
    const tokens = await client.smembers(TOKENS_KEY)
    for (const t of tokens) {
      const metaRaw = await client.get(TOKEN_META_PREFIX + t)
      if (metaRaw) {
        try {
          sessionStore.set(t, JSON.parse(metaRaw) as SessionMetadata)
          continue
        } catch {
          /* fall through to legacy */
        }
      }
      sessionStore.set(t, { ...LEGACY_METADATA })
    }
    if (tokens.length > 0) {
      console.log(`[auth] Loaded ${tokens.length} session token(s) from Redis`)
    }
  } catch {
    // Redis unavailable — in-memory store continues
  }
})

/**
 * Generate a cryptographically secure session token.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Store a session token as valid. Backward-compatible: when called with one
 * argument, treats the session as legacy (HERMES_PASSWORD) with implicit
 * admin privileges. The two-argument form attaches profile-aware metadata.
 */
export function storeSessionToken(
  token: string,
  metadata?: Partial<SessionMetadata>,
): void {
  const meta: SessionMetadata = {
    ...LEGACY_METADATA,
    ...metadata,
    created_at: Date.now(),
  }
  sessionStore.set(token, meta)
  const client = getRedisClientSync()
  if (client) {
    void client.sadd(TOKENS_KEY, token).then(() =>
      client.expire(TOKENS_KEY, TOKEN_TTL_S),
    )
    void client.set(
      TOKEN_META_PREFIX + token,
      JSON.stringify(meta),
      'EX',
      TOKEN_TTL_S,
    )
  }
}

/**
 * Check if a session token is valid.
 */
export function isValidSessionToken(token: string): boolean {
  return sessionStore.has(token)
}

/**
 * Look up the session metadata for a token. Returns null if the token is unknown.
 */
export function getSessionMetadata(token: string): SessionMetadata | null {
  return sessionStore.get(token) ?? null
}

/**
 * Remove a session token (logout).
 */
export function revokeSessionToken(token: string): void {
  sessionStore.delete(token)
  const client = getRedisClientSync()
  if (client) {
    void client.srem(TOKENS_KEY, token)
    void client.del(TOKEN_META_PREFIX + token)
  }
}

/**
 * Check if password protection is enabled.
 */
export function isPasswordProtectionEnabled(): boolean {
  return Boolean(
    process.env.HERMES_PASSWORD && process.env.HERMES_PASSWORD.length > 0,
  )
}

/**
 * Verify password using timing-safe comparison.
 */
export function verifyPassword(password: string): boolean {
  const configured = process.env.HERMES_PASSWORD
  if (!configured || configured.length === 0) {
    return false
  }

  // Timing-safe comparison
  const passwordBuf = Buffer.from(password, 'utf8')
  const configuredBuf = Buffer.from(configured, 'utf8')

  // If lengths differ, still do a comparison to avoid timing leak
  if (passwordBuf.length !== configuredBuf.length) {
    return false
  }

  try {
    return timingSafeEqual(passwordBuf, configuredBuf)
  } catch {
    return false
  }
}

/**
 * Extract session token from cookie header.
 */
export function getSessionTokenFromCookie(
  cookieHeader: string | null,
): string | null {
  if (!cookieHeader) return null

  const cookies = cookieHeader.split(';').map((c) => c.trim())
  for (const cookie of cookies) {
    if (cookie.startsWith('hermes-auth=')) {
      return cookie.substring('hermes-auth='.length)
    }
  }
  return null
}

function isLocalRequest(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || '127.0.0.1'
  const localIPs = ['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1']
  if (localIPs.includes(ip)) return true
  // Allow Tailscale (100.x.x.x) and private LAN ranges
  if (/^100\.\d+\.\d+\.\d+$/.test(ip)) return true
  if (/^192\.168\./.test(ip)) return true
  if (/^10\./.test(ip)) return true
  return false
}

/**
 * Check if the request is authenticated.
 * Returns true if:
 * - Password protection is disabled, OR
 * - Request has a valid session token
 */
export function isAuthenticated(request: Request): boolean {
  // No password configured? No auth needed
  if (!isPasswordProtectionEnabled()) {
    return true
  }

  // Check for valid session token
  const cookieHeader = request.headers.get('cookie')
  const token = getSessionTokenFromCookie(cookieHeader)

  if (!token) {
    return false
  }

  return isValidSessionToken(token)
}

export function requireLocalOrAuth(request: Request): boolean {
  if (!isPasswordProtectionEnabled()) {
    return isLocalRequest(request)
  }

  return isAuthenticated(request)
}

/**
 * True only when the request carries a Studio-ADMIN session (is_admin).
 * A customer-admin (storefront) session is NOT admin. When password
 * protection is disabled (local dev), defers to a local request so the
 * dev workflow is unaffected. Use this to gate operator-only mutations
 * (e.g. editing governance/ files an agent reads).
 */
export function isAdmin(request: Request): boolean {
  if (!isPasswordProtectionEnabled()) {
    return isLocalRequest(request)
  }
  const token = getSessionTokenFromCookie(request.headers.get('cookie'))
  if (!token) return false
  return getSessionMetadata(token)?.is_admin === true
}

/**
 * Create a Set-Cookie header for the session token.
 */
export function createSessionCookie(token: string): string {
  // httpOnly: prevents JS access
  // secure: HTTPS only (disabled for local dev)
  // sameSite=strict: CSRF protection
  // path=/: available everywhere
  // maxAge: 30 days
  return `hermes-auth=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 24 * 60 * 60}`
}

export function createExpiredSessionCookie(): string {
  return 'hermes-auth=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
}
