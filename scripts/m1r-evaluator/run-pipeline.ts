/**
 * Gate 3 — deterministic pipeline runner (preflight). Writes the INTERNAL preflight
 * artifact for the 30 evaluated + 855 unresolved cells. Prettier-clean + byte-identical on
 * rerun; NON-PII. Refuses 'customer_final' mode (evaluated_count != 885) — never renders a
 * partial customer PDF.
 *
 * Usage: tsx scripts/m1r-evaluator/run-pipeline.ts [--mode preflight|customer_final] [--profile serra-honda] [--dealer 21043]
 */
import fs from 'node:fs'
import path from 'node:path'
import { formatJsonFile } from './serialize'
import type { PipelineMode } from '@/server/reports/evaluator/pipeline'
import { runPipeline } from '@/server/reports/evaluator/pipeline'

const REPO = process.cwd()
const FRESH = process.env.HALO_FRESH_DIR ?? '/tmp/halo-295-fresh-20260831'
const OUT = path.join(REPO, 'docs/halo/evidence/m1r/evaluator')

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null
}

async function main(): Promise<void> {
  const mode = (arg('mode') ?? 'preflight') as PipelineMode
  const result = runPipeline({
    freshDir: FRESH,
    repoRoot: REPO,
    mode,
    profile: arg('profile'),
    dealerId: arg('dealer'),
  })

  console.log(`mode=${result.mode} ok=${result.ok}`)
  for (const s of result.stages)
    console.log(`  [${s.ok ? 'ok' : 'REFUSED'}] ${s.name}: ${s.note}`)
  if (result.refusal_reason) console.log(`REFUSAL: ${result.refusal_reason}`)

  if (mode === 'customer_final') {
    // Never write a customer deliverable at this gate — only report the refusal.
    return
  }
  fs.mkdirSync(OUT, { recursive: true })
  const p = path.join(OUT, 'pipeline-preflight.json')
  fs.writeFileSync(p, await formatJsonFile(result.preflight, p))
  console.log(`wrote ${path.relative(REPO, p)}`)
}

void main()
