/**
 * Vitest for pii-redactor (closes P-SRS-F7 / AC-DR-006).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  regexRedact,
  isRedactionRequired,
  maybeRedactForEmbedding,
  registerPiiRedactor,
  _resetRedactorsForTests,
} from '../server/pii-redactor'

let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  savedEnv = {
    EMBED_PII_REDACTOR: process.env.EMBED_PII_REDACTOR,
    EMBED_PII_REDACTOR_ALWAYS: process.env.EMBED_PII_REDACTOR_ALWAYS,
  }
  _resetRedactorsForTests()
})

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('regexRedact', () => {
  it('redacts SSN', () => {
    const r = regexRedact('user 123-45-6789 logged in')
    expect(r.redactedText).toContain('[SSN]')
    expect(r.redactedText).not.toContain('123-45-6789')
    expect(r.counts.ssn).toBe(1)
  })

  it('redacts email', () => {
    const r = regexRedact('email: duane@example.com is on file')
    expect(r.redactedText).toContain('[EMAIL]')
    expect(r.redactedText).not.toContain('duane@example.com')
    expect(r.counts.email).toBe(1)
  })

  it('redacts phone', () => {
    const r = regexRedact('Phone +1-412-654-6500 or 412.654.6500')
    expect(r.redactedText).toMatch(/\[PHONE\].*\[PHONE\]/)
    expect(r.counts.phone).toBeGreaterThanOrEqual(2)
  })

  it('redacts credit-card-like digit runs', () => {
    const r = regexRedact('Card 4111111111111111 used')
    expect(r.redactedText).toContain('[CC]')
    expect(r.counts.cc).toBe(1)
  })

  it('leaves non-PII unchanged', () => {
    const text = 'Generic content without any sensitive info.'
    const r = regexRedact(text)
    expect(r.redactedText).toBe(text)
    expect(r.counts).toEqual({ ssn: 0, cc: 0, email: 0, phone: 0, custom: 0 })
  })

  it('redacts multiple instances + multiple categories', () => {
    const r = regexRedact(
      'a@b.com or c@d.org with phone 4126546500 and ssn 111-22-3333',
    )
    expect(r.counts.email).toBe(2)
    expect(r.counts.phone).toBeGreaterThanOrEqual(1)
    expect(r.counts.ssn).toBe(1)
  })
})

describe('isRedactionRequired', () => {
  it('false for local model by default', () => {
    expect(isRedactionRequired('local-hash-v1')).toBe(false)
    expect(isRedactionRequired('local-bge-v1')).toBe(false)
  })

  it('true for any non-local model', () => {
    expect(isRedactionRequired('openai-text-embedding-3-large')).toBe(true)
    expect(isRedactionRequired('cohere-embed-v3')).toBe(true)
    expect(isRedactionRequired('voyage-2')).toBe(true)
  })

  it('honors EMBED_PII_REDACTOR_ALWAYS=1 (force on)', () => {
    process.env.EMBED_PII_REDACTOR_ALWAYS = '1'
    expect(isRedactionRequired('local-hash-v1')).toBe(true)
  })
})

describe('maybeRedactForEmbedding', () => {
  it('local model is pass-through; no redactor needed', async () => {
    const r = await maybeRedactForEmbedding('local-hash-v1', 'a@b.com test')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.text).toBe('a@b.com test') // unchanged
      expect(r.counts).toBeNull()
    }
  })

  it('remote model with no redactor configured refuses', async () => {
    delete process.env.EMBED_PII_REDACTOR
    const r = await maybeRedactForEmbedding('openai-text-embedding-3-large', 'a@b.com')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('redactor-required')
  })

  it('remote model with default redactor produces redacted text', async () => {
    process.env.EMBED_PII_REDACTOR = 'default'
    const r = await maybeRedactForEmbedding(
      'openai-text-embedding-3-large',
      'duane@example.com lead',
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.text).toContain('[EMAIL]')
      expect(r.counts?.email).toBe(1)
    }
  })

  it('remote model with EMBED_PII_REDACTOR=off refuses', async () => {
    process.env.EMBED_PII_REDACTOR = 'off'
    const r = await maybeRedactForEmbedding('openai-text-embedding-3-large', 'a@b.com')
    expect(r.ok).toBe(false)
  })

  it('custom redactor honored via registry + EMBED_PII_REDACTOR=<name>', async () => {
    registerPiiRedactor('custom-allcaps', (t) => ({
      redactedText: t.toUpperCase(),
      counts: { ssn: 0, cc: 0, email: 0, phone: 0, custom: 1 },
    }))
    process.env.EMBED_PII_REDACTOR = 'custom-allcaps'
    const r = await maybeRedactForEmbedding(
      'cohere-embed-v3',
      'lowercase text',
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.text).toBe('LOWERCASE TEXT')
      expect(r.counts?.custom).toBe(1)
    }
  })

  it('EMBED_PII_REDACTOR_ALWAYS=1 + local model + redactor configured → redacts', async () => {
    process.env.EMBED_PII_REDACTOR_ALWAYS = '1'
    process.env.EMBED_PII_REDACTOR = 'default'
    const r = await maybeRedactForEmbedding('local-hash-v1', 'a@b.com')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.text).toContain('[EMAIL]')
  })
})
