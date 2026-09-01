// @vitest-environment node
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

// Durable guard: recompute every SHA-256 recorded in Gate 3 Proof Delta A from the current
// committed bytes, so a later formatting cycle that desyncs the proof fails the suite.

const ROOT = new URL('../../', import.meta.url)
const PROOF = new URL(
  '../../docs/halo/evidence/m1r/evaluator/PROOF_DELTA_A_gate3_closure.md',
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

describe('Gate 3 Proof Delta A recorded artifact hashes', () => {
  const md = fs.readFileSync(PROOF, 'utf8')
  const recorded = parseRecordedHashes(md)

  it('parses the full Gate 3 artifact set (parser did not silently under-match)', () => {
    // 4 modules + 2 scripts + 2 contract + 4 evidence = 12 recorded artifacts.
    expect(recorded.length).toBe(12)
    for (const req of [
      'src/server/reports/evaluator/pipeline.ts',
      'docs/halo/evidence/m1r/evaluator/closure-registry.json',
      'docs/halo/contract/acquisition-contract.json',
    ]) {
      expect(
        recorded.some((r) => r.file === req),
        `Gate 3 Proof Delta A must record ${req}`,
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
