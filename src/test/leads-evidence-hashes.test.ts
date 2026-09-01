// @vitest-environment node
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

// Durable guard for the source-gate evidence (shadow hash correction).
//
// Proof Delta A records a SHA-256 (first 16 hex) for every committed source-gate
// artifact. A prettier/formatting pass once changed the source bytes AFTER those
// hashes were written, leaving four stale values. This test recomputes each
// recorded hash from the current file bytes so any future formatting cycle that
// desyncs the proof fails loudly instead of shipping a stale hash. Deterministic:
// SHA-256 of committed bytes, no timestamps or randomness.

const ROOT = new URL('../../', import.meta.url)
const PROOF = new URL(
  '../../docs/halo/evidence/m1r/leads/PROOF_DELTA_A_scope_state.md',
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

// Parse every markdown table row that carries exactly one repo-relative file path
// (backticked, resolving to a real committed file) and exactly one backticked
// 16-hex hash. Rows without a committed file path (raw PII exports, the manifest
// digest, the multi-file test row) are intentionally skipped.
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

describe('Proof Delta A recorded artifact hashes (shadow hash correction)', () => {
  const md = fs.readFileSync(PROOF, 'utf8')
  const recorded = parseRecordedHashes(md)

  it('parses the full artifact set (parser did not silently under-match)', () => {
    // 4 source files + 3 contract JSON + 3 evidence JSON = 10 recorded artifacts.
    expect(recorded.length).toBe(10)
    for (const req of [
      'src/server/reports/provisional/xlsx-reader.ts',
      'src/server/reports/leads/leads-family-contract.ts',
      'src/server/reports/leads/leads-classifier.ts',
      'src/server/reports/leads/leads-reader.ts',
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
