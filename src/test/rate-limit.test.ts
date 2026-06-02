import { describe, it, expect } from 'vitest'
import { stripPort, getClientIp, rateLimit } from '@/server/rate-limit'

// GAP-VER-003 regression guard.
//
// The reverse proxy (Caddy) sets X-Forwarded-For / X-Real-IP to `IP:port`
// where the ephemeral port changes every connection. getClientIp must strip
// the port so the per-IP rate-limit bucket is stable; otherwise every request
// gets a unique key and the limit never fires (the production symptom: 5 rapid
// reset-request POSTs all returned 200).

describe('stripPort (GAP-VER-003)', () => {
  it('strips an ephemeral port from an IPv4 address', () => {
    expect(stripPort('150.136.6.207:35036')).toBe('150.136.6.207')
    expect(stripPort('150.136.6.207:35044')).toBe('150.136.6.207')
  })

  it('leaves a bare IPv4 untouched', () => {
    expect(stripPort('150.136.6.207')).toBe('150.136.6.207')
  })

  it('handles bracketed IPv6 with and without a port', () => {
    expect(stripPort('[2001:db8::1]:443')).toBe('2001:db8::1')
    expect(stripPort('[2001:db8::1]')).toBe('2001:db8::1')
  })

  it('leaves a bare (unbracketed) IPv6 untouched', () => {
    expect(stripPort('2001:db8::1')).toBe('2001:db8::1')
  })

  it('trims whitespace', () => {
    expect(stripPort('  10.0.0.5:51000  ')).toBe('10.0.0.5')
  })
})

function reqWith(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/auth/reset-request', {
    method: 'POST',
    headers,
  })
}

describe('getClientIp (GAP-VER-003)', () => {
  it('returns a stable IP across requests with rotating XFF ports', () => {
    const a = getClientIp(reqWith({ 'x-forwarded-for': '150.136.6.207:35036' }))
    const b = getClientIp(reqWith({ 'x-forwarded-for': '150.136.6.207:35044' }))
    expect(a).toBe('150.136.6.207')
    expect(b).toBe('150.136.6.207')
    expect(a).toBe(b)
  })

  it('uses the left-most XFF entry, port-stripped', () => {
    expect(
      getClientIp(reqWith({ 'x-forwarded-for': '203.0.113.5:9000, 10.0.0.1:80' })),
    ).toBe('203.0.113.5')
  })

  it('falls back to X-Real-IP (port-stripped) when XFF is absent', () => {
    expect(getClientIp(reqWith({ 'x-real-ip': '198.51.100.9:42000' }))).toBe(
      '198.51.100.9',
    )
  })

  it('falls back to "local" when no forwarding headers are present', () => {
    expect(getClientIp(reqWith({}))).toBe('local')
  })
})

describe('rate limit accumulates with the stabilized key (GAP-VER-003)', () => {
  it('blocks the 4th request from rotating-port XFF (3/window)', () => {
    const key = `auth-reset:${getClientIp(reqWith({ 'x-forwarded-for': '198.51.100.50:1000' }))}`
    // Simulate 3 allowed + 1 blocked, mirroring the reset-request handler.
    const results: Array<boolean> = []
    for (let port = 1000; port < 1004; port++) {
      // Each request arrives on a different ephemeral port, but the key must
      // be identical because the port is stripped.
      const ip = getClientIp(
        reqWith({ 'x-forwarded-for': `198.51.100.50:${port}` }),
      )
      results.push(rateLimit(`auth-reset:${ip}`, 3, 60_000))
    }
    expect(results).toEqual([true, true, true, false])
    expect(key).toBe('auth-reset:198.51.100.50')
  })
})
