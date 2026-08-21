import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  verifyIngestSecret,
  isIngestEligible,
  ingestEligibleProfiles,
  parsePeriodHint,
  decodeBase64Strict,
} from '@/server/ingest-auth'

describe('decodeBase64Strict', () => {
  it('decodes canonical base64', () => {
    const b = decodeBase64Strict(Buffer.from('hello').toString('base64'))
    expect(b?.toString()).toBe('hello')
  })
  it('rejects non-canonical / invalid strings that Buffer.from silently accepts', () => {
    expect(decodeBase64Strict('not base64!!')).toBeNull()
    expect(decodeBase64Strict('abc')).toBeNull() // length % 4 != 0
    expect(decodeBase64Strict('aGVsbG8')).toBeNull() // missing padding
    expect(decodeBase64Strict('aGVs bG8=')).toBeNull() // embedded space
    expect(decodeBase64Strict('')).toBeNull()
    expect(decodeBase64Strict(123 as unknown)).toBeNull()
  })
})

const ENV = ['INGEST_SERVICE_SECRET', 'INGEST_ELIGIBLE_PROFILES'] as const
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = {}
  for (const k of ENV) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

function req(auth?: string): Request {
  return new Request('http://studio.local/api/ingest/report', {
    method: 'POST',
    headers: auth ? { authorization: auth } : {},
  })
}

describe('verifyIngestSecret (fail-closed)', () => {
  it('503 when no secret is configured', () => {
    const r = verifyIngestSecret(req('Bearer anything'))
    expect(r).toEqual({ ok: false, status: 503, error: expect.any(String) })
  })

  it('401 when the header is missing', () => {
    process.env.INGEST_SERVICE_SECRET = 's3cr3t'
    const r = verifyIngestSecret(req())
    expect(r).toMatchObject({ ok: false, status: 401 })
  })

  it('401 on a wrong token', () => {
    process.env.INGEST_SERVICE_SECRET = 's3cr3t'
    expect(verifyIngestSecret(req('Bearer nope'))).toMatchObject({
      ok: false,
      status: 401,
    })
  })

  it('401 on a length-mismatched token (no throw)', () => {
    process.env.INGEST_SERVICE_SECRET = 's3cr3t'
    expect(verifyIngestSecret(req('Bearer x'))).toMatchObject({ ok: false })
  })

  it('accepts the correct token, case-insensitive scheme', () => {
    process.env.INGEST_SERVICE_SECRET = 's3cr3t'
    expect(verifyIngestSecret(req('Bearer s3cr3t'))).toEqual({ ok: true })
    expect(verifyIngestSecret(req('bearer s3cr3t'))).toEqual({ ok: true })
  })
})

describe('ingest-eligible profiles', () => {
  it('defaults include the Serra group + parent, exclude others', () => {
    expect(isIngestEligible('serra-nissan')).toBe(true)
    expect(isIngestEligible('tony-serra-ford')).toBe(true)
    expect(isIngestEligible('serra-automotive')).toBe(true)
    expect(isIngestEligible('some-other-tenant')).toBe(false)
  })

  it('honors an env override allowlist', () => {
    process.env.INGEST_ELIGIBLE_PROFILES = 'serra-honda, only-this'
    expect(ingestEligibleProfiles()).toEqual(['serra-honda', 'only-this'])
    expect(isIngestEligible('only-this')).toBe(true)
    expect(isIngestEligible('serra-nissan')).toBe(false)
  })
})

describe('parsePeriodHint', () => {
  it('single ISO date → start=end', () => {
    expect(parsePeriodHint('2026-08-10')).toEqual({
      periodStart: '2026-08-10',
      periodEnd: '2026-08-10',
    })
  })

  it('range → start/end', () => {
    expect(parsePeriodHint('2026-08-04/2026-08-10')).toEqual({
      periodStart: '2026-08-04',
      periodEnd: '2026-08-10',
    })
  })

  it('absent hint → no override, no warning', () => {
    expect(parsePeriodHint(undefined)).toEqual({})
    expect(parsePeriodHint('')).toEqual({})
  })

  it('malformed → warning, no dates (lenient fallback)', () => {
    const r = parsePeriodHint('last week')
    expect(r.periodStart).toBeUndefined()
    expect(r.warning).toContain('ignored')
  })

  it('reversed range (start>end) → warning, no dates', () => {
    const r = parsePeriodHint('2026-08-10/2026-08-04')
    expect(r.periodStart).toBeUndefined()
    expect(r.warning).toBeDefined()
  })

  it('non-string → warning', () => {
    expect(parsePeriodHint(12345 as unknown).warning).toBeDefined()
  })

  it('rejects an impossible calendar date', () => {
    expect(parsePeriodHint('2026-02-31').warning).toBeDefined()
  })
})
