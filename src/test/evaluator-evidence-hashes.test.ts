// @vitest-environment node
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

// Durable guard: recompute every SHA-256 recorded in Gate 2 Proof Delta A from the
// current committed bytes, so a later formatting cycle that desyncs the proof fails the
// suite instead of shipping a stale hash. Deterministic.

const ROOT = new URL('../../', import.meta.url)
const PROOF = new URL(
  '../../docs/halo/evidence/m1r/evaluator/PROOF_DELTA_A_catalog_source_state.md',
  import.meta.url,
)

const HASH16 = /^[0-9a-f]{16}$/
const PATHISH = /\.(ts|json|md)$/

function first16(u: URL): string {
  return createHash('sha256')
    .update(fs.readFileSync(u))
    .digest('hex')
    .slice(0, 16)
}

function parseRecordedHashes(
  md: string,
): Array<{ file: string; hash: string }> {
  const out: Array<{ file: string; hash: string }> = []
  for (const rawLine of md.split('\n')) {
    const tokens = [...rawLine.matchAll(/`([^`]+)`/g)].map((m) => m[1])
    const paths = tokens.filter(
      (t) =>
        t.includes('/') && PATHISH.test(t) && fs.existsSync(new URL(t, ROOT)),
    )
    const hashes = tokens.filter((t) => HASH16.test(t))
    if (paths.length === 1 && hashes.length === 1) {
      out.push({ file: paths[0], hash: hashes[0] })
    }
  }
  return out
}

describe('Gate 2 Proof Delta A recorded artifact hashes', () => {
  const md = fs.readFileSync(PROOF, 'utf8')
  const recorded = parseRecordedHashes(md)

  it('parses the full artifact set (parser did not silently under-match)', () => {
    // 16 source/script modules + 2 contracts + 2 evidence JSON = 20 recorded artifacts.
    expect(recorded.length).toBe(20)
    for (const req of [
      'src/server/reports/evaluator/spine.ts',
      'src/server/reports/evaluator/strict-predicate.ts',
      'docs/halo/evidence/m1r/evaluator/spine-ledger.json',
    ]) {
      expect(
        recorded.some((r) => r.file === req),
        `Proof Delta A must record ${req}`,
      ).toBe(true)
    }
  })

  it('every recorded first-16 SHA-256 matches the current file bytes', () => {
    for (const r of recorded) {
      expect(first16(new URL(r.file, ROOT)), `${r.file} hash drift`).toBe(
        r.hash,
      )
    }
  })
})
