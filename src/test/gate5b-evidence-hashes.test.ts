// @vitest-environment node
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

// Durable guard: recompute every SHA-256 recorded in the Gate 5B proof delta from the current
// committed bytes, so a later formatting cycle (or a silent artifact edit) that desyncs the proof
// fails the suite instead of shipping a stale hash.

const PROOF = new URL(
  '../../docs/halo/evidence/m1r/gate5b/PROOF_DELTA_L_synthesis_audit.md',
  import.meta.url,
)
const HASH16 = /^[0-9a-f]{16}$/
const PATHISH = /\.(ts|json|md)$/

function first16(rel: string): string {
  return createHash('sha256')
    .update(fs.readFileSync(new URL(`../../${rel}`, import.meta.url)))
    .digest('hex')
    .slice(0, 16)
}

function parseRecordedHashes(): Array<{ file: string; hash: string }> {
  const md = fs.readFileSync(PROOF, 'utf8')
  const out: Array<{ file: string; hash: string }> = []
  for (const line of md.split('\n')) {
    const m = /^\|\s*`([^`]+)`\s*\|\s*`([0-9a-f]{16})`\s*\|$/.exec(line.trim())
    if (m && PATHISH.test(m[1])) out.push({ file: m[1], hash: m[2] })
  }
  return out
}

describe('Gate 5B evidence hashes', () => {
  const recorded = parseRecordedHashes()

  it('records twelve artifact/source hashes', () => {
    expect(recorded).toHaveLength(12)
    for (const r of recorded) expect(r.hash).toMatch(HASH16)
  })

  it('every recorded hash matches the committed bytes', () => {
    for (const { file, hash } of recorded)
      expect(first16(file), file).toBe(hash)
  })
})
