/**
 * Simple in-memory rate limiter (no external deps).
 * Uses a sliding window approach per key.
 */

const store = new Map<string, { timestamps: Array<number> }>()

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 120_000)
    if (entry.timestamps.length === 0) store.delete(key)
  }
}, 300_000)

/**
 * Check if a request is allowed under the rate limit.
 * @returns true if allowed, false if blocked
 */
export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const now = Date.now()
  let entry = store.get(key)
  if (!entry) {
    entry = { timestamps: [] }
    store.set(key, entry)
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs)

  if (entry.timestamps.length >= maxRequests) {
    return false
  }

  entry.timestamps.push(now)
  return true
}

/**
 * Strip a trailing `:port` from a forwarded address token so the rate-limit
 * key is a stable per-client IP.
 *
 * The reverse proxy in front of this app (Caddy) sets `X-Forwarded-For` /
 * `X-Real-IP` to `{remote}`, which is `IP:port` — and the ephemeral source
 * port changes on every TCP connection. Without stripping the port, every
 * request produced a unique key and the per-IP rate limit never accumulated
 * (GAP-VER-003: reset-request returned 200 for unlimited rapid calls in
 * production while limiting correctly when hit directly with no proxy header).
 *
 * Handles: `IPv4:port`, `[IPv6]:port`, bare `IPv4`, bare `IPv6`, and `[IPv6]`.
 */
export function stripPort(addr: string): string {
  const s = addr.trim()
  if (!s) return s
  // Bracketed IPv6, optionally with a port: [::1] or [::1]:443
  if (s.startsWith('[')) {
    const end = s.indexOf(']')
    return end === -1 ? s : s.slice(1, end)
  }
  // Exactly one colon => IPv4:port. Bare IPv4 (no colon) and bare IPv6
  // (many colons, unbracketed) are returned unchanged.
  const first = s.indexOf(':')
  if (first !== -1 && first === s.lastIndexOf(':')) {
    return s.slice(0, first)
  }
  return s
}

/**
 * Extract a stable client IP from request for the rate limiting key.
 * Prefers the left-most X-Forwarded-For entry, falls back to X-Real-IP,
 * then to a constant. Always port-stripped (see {@link stripPort}).
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded && forwarded.trim()) {
    return stripPort(forwarded.split(',')[0])
  }
  const realIp = request.headers.get('x-real-ip')
  if (realIp && realIp.trim()) {
    return stripPort(realIp)
  }
  return 'local'
}

/**
 * Return a 429 Too Many Requests response.
 */
export function rateLimitResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'Too many requests, please try again later' }),
    {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

/**
 * Lightweight CSRF check: reject POST/PUT/PATCH/DELETE that don't send
 * `Content-Type: application/json`. Browsers won't set this header on
 * a simple form/navigation request, so its presence indicates a
 * programmatic call (JS fetch, curl, etc.).
 *
 * Returns `null` when the check passes, or a 415 Response to send back.
 */
export function requireJsonContentType(request: Request): Response | null {
  const method = request.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null
  const ct = request.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) return null
  return new Response(
    JSON.stringify({ error: 'Content-Type must be application/json' }),
    { status: 415, headers: { 'Content-Type': 'application/json' } },
  )
}

/**
 * Sanitize error for response — hide details in production.
 */
export function safeErrorMessage(err: unknown): string {
  if (process.env.NODE_ENV === 'production') {
    return 'Internal server error'
  }
  return err instanceof Error ? err.message : String(err)
}
