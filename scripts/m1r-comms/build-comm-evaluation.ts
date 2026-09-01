/**
 * Gate 4C2 — Enhanced Sales Communication Log (weekly) EVALUATION generator.
 *
 * Reads the restricted /tmp handoff (manifest + three rooftop CSVs, sha + provenance verified
 * exactly as the admission generator does), builds each rooftop's NON-PII derivative, evaluates
 * the two semantically-exact promoted metrics (SW-022, SW-133; SW-137 held as a candidate
 * guard), and writes ONLY aggregate artifacts:
 *   - docs/halo/contract/sw295-comm-metric-specs.json      (versioned spec; one row per pending ID)
 *   - docs/halo/evidence/m1r/comms/comm-evaluation-ledger.json      (6 evaluated cells + 10 held)
 *   - docs/halo/evidence/m1r/comms/comm-portfolio-reconciliation.json (spine 30 + comm 6 = 36/849)
 *
 * It NEVER copies raw CSV bytes, customer/user/message content, names, or per-row tokens into
 * the repo. The core 4-family spine is untouched; the prior 30 evaluated cells are preserved
 * byte-semantically. Prettier-clean + byte-identical on rerun. No /srv, no PDF, no production.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { formatJsonFile } from '../m1r-evaluator/serialize'
import type { CommManifestEntry } from '@/server/reports/comms/comm-reader'
import type { CommRooftopInput } from '@/server/reports/comms/comm-metrics'
import {
  CAPTURE_ID_RE,
  COMM_WEEKLY_FAMILY,
  DEALER_IDENTITY,
  EXPECTED_REPORT_KIND,
  admitReportUrl,
  admitSourceUrl,
  evaluateProvenanceCompleteness,
  isManifestAllowlisted,
} from '@/server/reports/comms/comm-family-contract'
import { readCommWeekly } from '@/server/reports/comms/comm-reader'
import {
  COMM_FORMULA_VERSION,
  COMM_METRIC_SPECS,
  evaluateCommMetrics,
} from '@/server/reports/comms/comm-metrics'

const REPO = process.cwd()
const DIR = process.env.HALO_COMM_DIR ?? '/tmp/halo-295-comm-20260901'
const CONTRACT = path.join(REPO, 'docs/halo/contract')
const OUT = path.join(REPO, 'docs/halo/evidence/m1r/comms')
const EXPECTED_MANIFEST_SHA =
  '54fac701e85fa643fd84b188f2d963c626124d766eb31fff7f37244407d7f4c5'

const sha256File = (p: string) =>
  createHash('sha256').update(fs.readFileSync(p)).digest('hex')

type Manifest = {
  declared_report_kind: string
  source_url: string
  report_url: string
  requested_period: { start: string; end: string; timezone: string }
  files: Array<
    CommManifestEntry & {
      filter_evidence: string
      applied_result_evidence: string
    }
  >
}

/** Validate provenance exactly like admission, but keep the full derivative (with derived rows). */
export function loadCommRooftops(dir: string): {
  period: Manifest['requested_period']
  rooftops: Array<CommRooftopInput>
} {
  const manifestPath = path.join(dir, 'capture-manifest.json')
  const manifestSha = sha256File(manifestPath)
  if (manifestSha !== EXPECTED_MANIFEST_SHA)
    throw new Error(`manifest SHA ${manifestSha} != expected`)
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest
  if (manifest.declared_report_kind !== EXPECTED_REPORT_KIND)
    throw new Error(`declared_report_kind != ${EXPECTED_REPORT_KIND}`)
  if (!admitSourceUrl(manifest.source_url))
    throw new Error('manifest source_url not admitted')
  if (!admitReportUrl(manifest.report_url))
    throw new Error('manifest report_url not admitted')

  const period = manifest.requested_period
  const allowlist = manifest.files.map((f) => ({
    filename: f.filename,
    sha256: f.sha256,
    bytes: f.bytes,
  }))

  const rooftops = manifest.files.map((entry): CommRooftopInput => {
    const prov: Record<string, unknown> = {
      capture_id: entry.capture_id,
      profile: entry.profile,
      dealer_id: entry.dealer_id,
      dealer_name: entry.dealer,
      source_url: manifest.source_url,
      report_url: manifest.report_url,
      captured_at: entry.captured_at,
      declared_report_kind: manifest.declared_report_kind,
      reporting_period: period,
      declared_rows: entry.rows,
      declared_columns: entry.columns,
      declared_unique_lead_ids: entry.unique_lead_ids,
      declared_sha256: entry.sha256,
      filename: entry.filename,
      filter_evidence_sha256: entry.filter_evidence_sha256,
      applied_result_evidence_sha256: entry.applied_result_evidence_sha256,
    }
    const { gaps } = evaluateProvenanceCompleteness(prov)
    if (gaps.length)
      throw new Error(`${entry.profile} provenance gaps: ${gaps.join(', ')}`)
    if (!CAPTURE_ID_RE.test(entry.capture_id))
      throw new Error(`${entry.profile} bad capture_id`)
    const identity = (
      DEALER_IDENTITY as Record<
        string,
        { dealer_id: string; dealer_name: string } | undefined
      >
    )[entry.profile]
    if (!identity || identity.dealer_id !== entry.dealer_id)
      throw new Error(`${entry.profile} rooftop identity mismatch`)
    if (
      sha256File(path.join(dir, entry.filter_evidence)) !==
      entry.filter_evidence_sha256
    )
      throw new Error(`${entry.profile} filter evidence hash drift`)
    if (
      sha256File(path.join(dir, entry.applied_result_evidence)) !==
      entry.applied_result_evidence_sha256
    )
      throw new Error(`${entry.profile} applied-result evidence hash drift`)
    const buf = fs.readFileSync(path.join(dir, entry.filename))
    if (
      !isManifestAllowlisted(
        {
          filename: entry.filename,
          sha256: sha256File(path.join(dir, entry.filename)),
          bytes: buf.byteLength,
        },
        allowlist,
      )
    )
      throw new Error(`${entry.profile} not manifest-allowlisted`)

    const derivative = readCommWeekly({
      buf,
      entry,
      manifestSha,
      period,
      sourceUrl: manifest.source_url,
      reportUrl: manifest.report_url,
      dealerName: identity.dealer_name,
    })
    return {
      dealer_id: entry.dealer_id,
      profile: entry.profile,
      dealer_name: identity.dealer_name,
      reporting_period: period,
      derived: derivative.derived_rows,
      lineage: derivative.lineage,
    }
  })

  return { period, rooftops }
}

function readSpineSummary(): {
  evaluated: number
  unresolved: number
  by_dealer: Record<string, { evaluated: number; unresolved: number }>
  evaluated_ids: Array<string>
  required_cells: number
} {
  const p = path.join(
    REPO,
    'docs/halo/evidence/m1r/evaluator/spine-summary.json',
  )
  return JSON.parse(fs.readFileSync(p, 'utf8')) as ReturnType<
    typeof readSpineSummary
  >
}

async function main(): Promise<void> {
  const { period, rooftops } = loadCommRooftops(DIR)
  const evaln = evaluateCommMetrics(rooftops)

  if (evaln.cells.length !== 6)
    throw new Error(`expected 6 evaluated cells, got ${evaln.cells.length}`)
  if (evaln.held.length !== 10)
    throw new Error(`expected 10 held IDs, got ${evaln.held.length}`)

  // 1. Versioned semantic spec (one explicit row per pending ID).
  const specDoc = {
    artifact: 'gate4c2-comm-metric-specs',
    revision: 'comm-metric-spec-v1 (semantically exact; no proxies)',
    family: COMM_WEEKLY_FAMILY,
    formula_version: COMM_FORMULA_VERSION,
    catalog_ref:
      'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
    evaluation_eligible_ids: COMM_METRIC_SPECS.filter(
      (s) => s.eligibility === 'evaluation_eligible',
    ).map((s) => s.metric_id),
    held_ids: COMM_METRIC_SPECS.filter((s) => s.eligibility === 'held').map(
      (s) => s.metric_id,
    ),
    note: 'One explicit row per pending ID. Promotes exactly SW-022/SW-133/SW-137 (semantically exact structural definitions). Baselines are internal operational targets (red-flag rate ideal = 0), NOT industry benchmarks. Missing is never zero.',
    specs: COMM_METRIC_SPECS,
  }
  fs.mkdirSync(CONTRACT, { recursive: true })
  const specPath = path.join(CONTRACT, 'sw295-comm-metric-specs.json')
  fs.writeFileSync(specPath, await formatJsonFile(specDoc, specPath))

  // 2. Evaluation ledger (9 cells + 9 held).
  const ledger = {
    artifact: 'gate4c2-comm-evaluation-ledger',
    family: COMM_WEEKLY_FAMILY,
    formula_version: COMM_FORMULA_VERSION,
    reporting_period: period,
    evaluated_ids: evaln.evaluated_ids,
    evaluated_cells: evaln.cells.length,
    held_ids: evaln.held.map((h) => h.metric_id),
    note: 'NON-PII overlay. Aggregate integer numerator/denominator + derived rate only; no name, customer, rep/thread token, or message content. Separate from the 4-family core spine; the prior 30 evaluated cells are unchanged. Promotes zero metrics into the core spine ledger.',
    cells: evaln.cells,
    held: evaln.held,
  }
  fs.mkdirSync(OUT, { recursive: true })
  const ledgerPath = path.join(OUT, 'comm-evaluation-ledger.json')
  fs.writeFileSync(ledgerPath, await formatJsonFile(ledger, ledgerPath))

  // 3. Portfolio reconciliation (atomic; preserves the spine 30 byte-semantically).
  const spine = readSpineSummary()
  const overlap = evaln.evaluated_ids.filter((id) =>
    spine.evaluated_ids.includes(id),
  )
  if (overlap.length)
    throw new Error(
      `comm IDs overlap spine evaluated_ids: ${overlap.join(',')}`,
    )
  const commByDealer: Record<string, number> = {}
  for (const c of evaln.cells)
    commByDealer[c.dealer_id] = (commByDealer[c.dealer_id] ?? 0) + 1
  const byDealer: Record<
    string,
    {
      spine_evaluated: number
      comm_evaluated: number
      evaluated: number
      unresolved: number
    }
  > = {}
  for (const [d, s] of Object.entries(spine.by_dealer)) {
    const comm = commByDealer[d] ?? 0
    byDealer[d] = {
      spine_evaluated: s.evaluated,
      comm_evaluated: comm,
      evaluated: s.evaluated + comm,
      unresolved: s.unresolved - comm,
    }
  }
  const portfolioEvaluated = spine.evaluated + evaln.cells.length
  const recon = {
    artifact: 'gate4c2-portfolio-reconciliation',
    required_cells: spine.required_cells,
    spine_evaluated: spine.evaluated,
    comm_overlay_evaluated: evaln.cells.length,
    evaluated: portfolioEvaluated,
    unresolved: spine.required_cells - portfolioEvaluated,
    by_dealer: byDealer,
    spine_evaluated_ids: spine.evaluated_ids,
    comm_evaluated_ids: evaln.evaluated_ids,
    portfolio_evaluated_ids: [
      ...spine.evaluated_ids,
      ...evaln.evaluated_ids,
    ].sort(),
    note: 'Atomic union of the untouched 4-family core spine (30, byte-semantically preserved) and the separate privacy-minimized comm overlay (9 = SW-022/133/137 x 3 rooftops). No core-spine cell changed; comm-derived PII never enters buildSpine.',
  }
  const reconPath = path.join(OUT, 'comm-portfolio-reconciliation.json')
  fs.writeFileSync(reconPath, await formatJsonFile(recon, reconPath))

  for (const c of evaln.cells)
    console.log(
      `${c.metric_id} ${c.dealer_id}: ${c.numerator}/${c.denominator}=${c.value.toFixed(4)} rank=${c.rank} conf=${c.evaluation_confidence.label}`,
    )
  console.log(
    `portfolio: ${recon.evaluated}/${recon.unresolved} (spine ${spine.evaluated} + comm ${evaln.cells.length})`,
  )
  console.log(
    `wrote ${path.relative(REPO, specPath)}, ${path.relative(REPO, ledgerPath)}, ${path.relative(REPO, reconPath)}`,
  )
}

void main()
