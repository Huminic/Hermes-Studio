import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { INGEST_ACTOR } from '@/server/ingest-auth'

/**
 * Regression for the `service:report-ingest` unknown-actor defect: the ingest
 * write actor must be a DSG-gate-recognized identity form
 * (user:/token:/system:), and must NOT reintroduce the rejected `service:` form.
 * The accepted forms mirror dsg-gate.isKnownActor (kept in lockstep here).
 */
const ACCEPTED = /^(user:|token:|system:).+/

describe('ingest actor identity (dsg-gate contract)', () => {
  it('INGEST_ACTOR is a recognized identity form', () => {
    expect(ACCEPTED.test(INGEST_ACTOR)).toBe(true)
    expect(INGEST_ACTOR.startsWith('system:')).toBe(true)
  })

  it('does NOT use the rejected service: form (the original defect)', () => {
    expect(INGEST_ACTOR.startsWith('service:')).toBe(false)
    expect(ACCEPTED.test('service:report-ingest')).toBe(false)
  })

  it('the ingest route uses the constant, not a hard-coded service: literal', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../routes/api/ingest/report.ts'),
      'utf8',
    )
    expect(src).toContain('actor: INGEST_ACTOR')
    expect(src).not.toContain("actor: 'service:")
  })
})
