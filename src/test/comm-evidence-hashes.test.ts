// @vitest-environment node
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

// Durable guard: recompute every SHA-256 recorded in the Gate 4C1 comm proof delta from the
// current committed bytes, so a later formatting cycle that desyncs the proof fails the suite.

const ROOT = new URL('../../', import.meta.url)
const PROOF = new URL(
  '../../docs/halo/evidence/m1r/comms/PROOF_DELTA_A_comm_admission.md',
  import.meta.url,
)
const PROOF_C = new URL(
  '../../docs/halo/evidence/m1r/comms/PROOF_DELTA_C_comm_evaluation.md',
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
    if (paths.length === 1 && hashes.length === 1)
      out.push({ file: paths[0], hash: hashes[0] })
  }
  return out
}

describe('Gate 4C1 comm proof delta recorded artifact hashes', () => {
  const md = fs.readFileSync(PROOF, 'utf8')
  const recorded = parseRecordedHashes(md)

  it('parses the full artifact set (6 modules/scripts + 3 contract + 1 contract md + 1 evidence = 11)', () => {
    expect(recorded.length).toBe(11)
    for (const req of [
      'src/server/reports/comms/comm-family-contract.ts',
      'src/server/reports/comms/comm-reader.ts',
      'scripts/m1r-comms/comm-capability-decisions.ts',
      'docs/halo/evidence/m1r/comms/comm-admission-aggregates.json',
    ])
      expect(
        recorded.some((r) => r.file === req),
        `must record ${req}`,
      ).toBe(true)
  })

  it('every recorded first-16 SHA-256 matches the current file bytes', () => {
    for (const r of recorded)
      expect(first16(new URL(r.file, ROOT)), `${r.file} hash drift`).toBe(
        r.hash,
      )
  })
})

describe('Gate 4C2 comm evaluation proof delta recorded artifact hashes', () => {
  const md = fs.readFileSync(PROOF_C, 'utf8')
  const recorded = parseRecordedHashes(md)

  it('parses the full Gate 4C2 artifact set (2 modules/scripts + 1 contract + 2 evidence = 5)', () => {
    expect(recorded.length).toBe(5)
    for (const req of [
      'src/server/reports/comms/comm-metrics.ts',
      'scripts/m1r-comms/build-comm-evaluation.ts',
      'docs/halo/contract/sw295-comm-metric-specs.json',
      'docs/halo/evidence/m1r/comms/comm-evaluation-ledger.json',
      'docs/halo/evidence/m1r/comms/comm-portfolio-reconciliation.json',
    ])
      expect(
        recorded.some((r) => r.file === req),
        `must record ${req}`,
      ).toBe(true)
  })

  it('every recorded first-16 SHA-256 matches the current file bytes', () => {
    for (const r of recorded)
      expect(first16(new URL(r.file, ROOT)), `${r.file} hash drift`).toBe(
        r.hash,
      )
  })
})
