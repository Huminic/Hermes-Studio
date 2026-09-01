/**
 * Deterministic Gate 2 spine generator (thin wrapper over buildSpineFromFresh).
 *
 * Writes NON-PII evidence:
 *   - docs/halo/evidence/m1r/evaluator/spine-ledger.json   (all 885 rows, aggregates only)
 *   - docs/halo/evidence/m1r/evaluator/spine-summary.json  (counts)
 * No timestamps/randomness -> byte-identical on rerun. Never writes raw files or PII.
 */
import fs from 'node:fs'
import path from 'node:path'
import { buildSpineFromFresh } from '@/server/reports/evaluator/build-from-fresh'

const REPO = process.cwd()
const FRESH = process.env.HALO_FRESH_DIR ?? '/tmp/halo-295-fresh-20260831'
const OUT = path.join(REPO, 'docs/halo/evidence/m1r/evaluator')

function main(): void {
  const spine = buildSpineFromFresh({ freshDir: FRESH, repoRoot: REPO })
  fs.mkdirSync(OUT, { recursive: true })
  const ledger = {
    artifact: 'gate2-spine-ledger',
    required_cells: 885,
    rows: spine.rows,
  }
  fs.writeFileSync(
    path.join(OUT, 'spine-ledger.json'),
    JSON.stringify(ledger, null, 2) + '\n',
  )
  fs.writeFileSync(
    path.join(OUT, 'spine-summary.json'),
    JSON.stringify(
      { artifact: 'gate2-spine-summary', ...spine.summary },
      null,
      2,
    ) + '\n',
  )
  const s = spine.summary
  console.log(
    `rows=${spine.rows.length} evaluated=${s.evaluated} unresolved=${s.unresolved}`,
  )
  console.log(`evaluated_ids=${s.evaluated_ids.join(',')}`)
  console.log(`by_dealer=${JSON.stringify(s.by_dealer)}`)
  console.log(`by_source_family=${JSON.stringify(s.by_source_family)}`)
}

main()
