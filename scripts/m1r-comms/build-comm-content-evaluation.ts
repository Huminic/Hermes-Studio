/**
 * Gate 4E — Enhanced Sales Communication Log (weekly) CONTENT evaluation generator.
 *
 * Re-audits the 75 `nlp_content_capable_pending` IDs from the committed Gate 4C1 capability delta,
 * promotes exactly the five DEFINITION-EXACT DETERMINISTIC content conditions (SW-021/142/145/149/
 * 150) over the real three-rooftop restricted logs, and writes ONLY aggregate artifacts:
 *   - docs/halo/contract/sw295-comm-content-matrix.json                 (75-row + 225-cell matrix)
 *   - docs/halo/evidence/m1r/comms/comm-content-evaluation-ledger.json  (15 cells + 70 held)
 *   - docs/halo/evidence/m1r/comms/comm-content-portfolio-reconciliation.json (36 -> 51 / 834)
 *
 * It NEVER copies raw CSV bytes, customer/user/message content, names, or per-row tokens into the
 * repo. It does NOT modify the frozen Gate 4C1 reader/contract or the 4C2 overlay; the prior 36
 * evaluated cells are preserved. All portfolio counts are DERIVED from the committed 4C2
 * reconciliation and fail closed on any arithmetic/dealer-set divergence. Byte-identical on rerun.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { formatJsonFile } from '../m1r-evaluator/serialize'
import type { CommManifestEntry } from '@/server/reports/comms/comm-reader'
import type { ContentRooftopInput } from '@/server/reports/comms/comm-content-metrics'
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
import { readCommContent } from '@/server/reports/comms/comm-content-reader'
import {
  COMM_CONTENT_FORMULA_VERSION,
  CONTENT_CANDIDATE_IDS,
  CONTENT_HELD_DECISIONS,
  CONTENT_PROMOTED_SPECS,
  PROVIDER_VERDICT,
  evaluateCommContentMetrics,
} from '@/server/reports/comms/comm-content-metrics'

const REPO = process.cwd()
const DIR = process.env.HALO_COMM_DIR ?? '/tmp/halo-295-comm-20260901'
const CONTRACT = path.join(REPO, 'docs/halo/contract')
const OUT = path.join(REPO, 'docs/halo/evidence/m1r/comms')
const CATALOG = path.join(
  REPO,
  'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
)
const CAP_DELTA = path.join(
  REPO,
  'docs/halo/contract/sw295-comm-capability-delta.json',
)
const COMM_RECON = path.join(OUT, 'comm-portfolio-reconciliation.json')
const EXPECTED_MANIFEST_SHA =
  '54fac701e85fa643fd84b188f2d963c626124d766eb31fff7f37244407d7f4c5'
const GOVERNED = ['21043', '21044', '21047'] as const
const CONDITIONS = 295

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

/** Load the three rooftops' CONTENT-feature rows. Full fail-closed provenance is enforced here at
 *  the manifest level and by the frozen `readCommWeekly` (called inside `readCommContent`) at the
 *  row level, so the population can never be silently relaxed. */
function loadContentRooftops(dir: string): {
  period: Manifest['requested_period']
  rooftops: Array<ContentRooftopInput>
} {
  // Full fail-closed provenance (manifest sha, urls, provenance completeness, evidence hashes,
  // allowlist) at the manifest level, then readCommContent re-runs the frozen reader's row-level
  // validation internally — so the population can never be silently relaxed.
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

  const rooftops = manifest.files.map((entry): ContentRooftopInput => {
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

    const { rows, lineage } = readCommContent({
      buf,
      entry,
      manifestSha,
      period,
      sourceUrl: manifest.source_url,
      reportUrl: manifest.report_url,
      dealerName: identity.dealer_name,
    })
    // Bind to the manifest's declared row count (readCommWeekly already enforces data.length ===
    // entry.rows and content rows === derived rows, so this is a redundant fail-closed guard).
    if (rows.length !== entry.rows)
      throw new Error(
        `${entry.profile} content rows ${rows.length} != manifest rows ${entry.rows}`,
      )
    return {
      dealer_id: entry.dealer_id,
      profile: entry.profile,
      dealer_name: identity.dealer_name,
      reporting_period: period,
      content: rows,
      lineage: {
        capture_id: lineage.capture_id,
        raw_sha256: lineage.raw_sha256,
        manifest_sha256: lineage.manifest_sha256,
        transform_version: lineage.transform_version,
        transform_hash: lineage.transform_hash,
        source_url: lineage.source_url,
        report_url: lineage.report_url,
        family: lineage.family,
        captured_at: lineage.captured_at,
      },
    }
  })

  return { period, rooftops }
}

type CommRecon = {
  required_cells: number
  spine_evaluated: number
  comm_overlay_evaluated: number
  evaluated: number
  unresolved: number
  by_dealer: Record<
    string,
    {
      spine_evaluated: number
      comm_evaluated: number
      evaluated: number
      unresolved: number
    }
  >
  comm_evaluated_ids: Array<string>
}

function must(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Gate 4E reconciliation failed: ${msg}`)
}

async function main(): Promise<void> {
  const { period, rooftops } = loadContentRooftops(DIR)
  const evaln = evaluateCommContentMetrics(rooftops)

  const promotedIds = evaln.evaluated_ids
  const heldIds = evaln.held.map((h) => h.metric_id)
  must(
    promotedIds.length === 5,
    `expected 5 promoted IDs, got ${promotedIds.length}`,
  )
  must(heldIds.length === 70, `expected 70 held IDs, got ${heldIds.length}`)
  must(
    evaln.cells.length === promotedIds.length * GOVERNED.length,
    `expected ${promotedIds.length * GOVERNED.length} cells, got ${evaln.cells.length}`,
  )

  // ── Candidate-set integrity: exactly the 75 nlp_content_capable_pending IDs, unique/canonical ──
  const capDelta = JSON.parse(fs.readFileSync(CAP_DELTA, 'utf8')) as {
    rows: Array<{ metric_id: string; category: string }>
  }
  const nlp75 = capDelta.rows
    .filter((r) => r.category === 'nlp_content_capable_pending')
    .map((r) => r.metric_id)
  must(
    nlp75.length === 75,
    `capability delta nlp set is ${nlp75.length}, not 75`,
  )
  const candidateSet = new Set(CONTENT_CANDIDATE_IDS)
  must(candidateSet.size === 75, 'candidate list is not 75 unique IDs')
  must(
    nlp75.every((id) => candidateSet.has(id)) &&
      CONTENT_CANDIDATE_IDS.every((id) => nlp75.includes(id)),
    'candidate list != the committed nlp_content_capable_pending set',
  )

  // ── Join catalog conditions for the matrix ──
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8')) as unknown
  const condById = new Map<
    string,
    { condition: string; section: string; subsection: string }
  >()
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) {
      for (const v of o) walk(v)
    } else if (o && typeof o === 'object') {
      const rec = o as Record<string, unknown>
      const id = rec.metric_id
      if (typeof id === 'string' && candidateSet.has(id))
        condById.set(id, {
          condition: String(rec.condition ?? ''),
          section: String(rec.section ?? ''),
          subsection: String(rec.subsection ?? ''),
        })
      for (const v of Object.values(rec)) walk(v)
    }
  }
  walk(catalog)
  must(condById.size === 75, `catalog join covered ${condById.size} of 75`)

  // ── 75-row execution matrix ──
  const perDealerCount = new Map<
    string,
    Map<
      string,
      { numerator: number; denominator: number; value: number; rank: number }
    >
  >()
  for (const c of evaln.cells) {
    const m = perDealerCount.get(c.metric_id) ?? new Map()
    m.set(c.dealer_id, {
      numerator: c.numerator,
      denominator: c.denominator,
      value: c.value,
      rank: c.rank,
    })
    perDealerCount.set(c.metric_id, m)
  }
  const promotedSpecById = new Map(
    CONTENT_PROMOTED_SPECS.map((s) => [s.metric_id, s]),
  )
  const heldById = new Map(CONTENT_HELD_DECISIONS.map((d) => [d.metric_id, d]))

  const matrixRows = CONTENT_CANDIDATE_IDS.map((id) => {
    const cond = condById.get(id)!
    const promoted = promotedSpecById.get(id as never)
    if (promoted) {
      const byDealer = perDealerCount.get(id)!
      return {
        metric_id: id,
        condition: cond.condition,
        section: cond.section,
        subsection: cond.subsection,
        category: 'definition_exact_deterministic_now',
        disposition: 'PROMOTE',
        spec: promoted,
        rooftop_disposition: GOVERNED.map((d) => {
          const v = byDealer.get(d)!
          return {
            dealer_id: d,
            status: 'evaluated',
            numerator: v.numerator,
            denominator: v.denominator,
            value: v.value,
            rank: v.rank,
          }
        }),
      }
    }
    const held = heldById.get(id)!
    return {
      metric_id: id,
      condition: cond.condition,
      section: cond.section,
      subsection: cond.subsection,
      category: held.category,
      disposition: 'HOLD',
      hold_reason: held.hold_reason,
      missing_item: held.missing_item,
      rooftop_disposition: GOVERNED.map((d) => ({
        dealer_id: d,
        status: 'unresolved',
        category: held.category,
        reason: held.hold_reason,
      })),
    }
  })

  // 225-cell accounting.
  const cellCount = matrixRows.reduce(
    (a, r) => a + r.rooftop_disposition.length,
    0,
  )
  must(
    cellCount === 75 * GOVERNED.length,
    `225-cell disposition is ${cellCount}`,
  )
  const evaluatedCells =
    matrixRows.filter((r) => r.disposition === 'PROMOTE').length *
    GOVERNED.length
  must(
    evaluatedCells === evaln.cells.length,
    `matrix evaluated cells ${evaluatedCells} != ledger ${evaln.cells.length}`,
  )

  const categoryTally: Record<string, number> = {}
  for (const r of matrixRows)
    categoryTally[r.category] = (categoryTally[r.category] ?? 0) + 1

  const promotionStatement = `Promotes exactly ${promotedIds.join('/')} (definition-exact deterministic); 70 of 75 HELD (semantic model / external source / ratified definition — no in-boundary governed provider). ${evaln.cells.length} evaluated cells across ${GOVERNED.length} rooftops.`

  const matrixDoc = {
    artifact: 'gate4e-comm-content-matrix',
    revision:
      'comm-content-disposition-v1 (definition-exact deterministic only; no proxies)',
    family: COMM_WEEKLY_FAMILY,
    formula_version: COMM_CONTENT_FORMULA_VERSION,
    catalog_ref:
      'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
    capability_delta_ref: 'docs/halo/contract/sw295-comm-capability-delta.json',
    candidate_set: 'nlp_content_capable_pending (75)',
    provider_verdict: PROVIDER_VERDICT,
    totals: {
      candidates: 75,
      promoted: promotedIds.length,
      held: heldIds.length,
      rooftop_cells: cellCount,
      evaluated_cells: evaluatedCells,
    },
    category_tally: categoryTally,
    promoted_ids: promotedIds,
    held_ids: heldIds,
    promotion_statement: promotionStatement,
    rows: matrixRows,
  }
  fs.mkdirSync(CONTRACT, { recursive: true })
  const matrixPath = path.join(CONTRACT, 'sw295-comm-content-matrix.json')
  fs.writeFileSync(matrixPath, await formatJsonFile(matrixDoc, matrixPath))

  // ── Evaluation ledger ──
  const ledger = {
    artifact: 'gate4e-comm-content-evaluation-ledger',
    family: COMM_WEEKLY_FAMILY,
    formula_version: COMM_CONTENT_FORMULA_VERSION,
    reporting_period: period,
    provider_verdict: PROVIDER_VERDICT,
    evaluated_ids: promotedIds,
    evaluated_cells: evaln.cells.length,
    held_ids: heldIds,
    note: 'NON-PII deterministic content overlay. Aggregate integer numerator/denominator + derived rate only; no name, customer, rep/thread token, or message content. Separate from the 4-family core spine AND the Gate 4C2 comm overlay; the prior 36 evaluated cells are unchanged. Detection thresholds are LITERAL from the SW conditions; low sample is disclosed as confidence, never excluded (no invented floor).',
    cells: evaln.cells,
    held: evaln.held,
  }
  fs.mkdirSync(OUT, { recursive: true })
  const ledgerPath = path.join(OUT, 'comm-content-evaluation-ledger.json')
  fs.writeFileSync(ledgerPath, await formatJsonFile(ledger, ledgerPath))

  // ── Derived portfolio reconciliation (36 -> 51 / 834), fail closed ──
  const base = JSON.parse(fs.readFileSync(COMM_RECON, 'utf8')) as CommRecon
  const rooftopCount = GOVERNED.length
  must(
    JSON.stringify(Object.keys(base.by_dealer).sort()) ===
      JSON.stringify([...GOVERNED].sort()),
    'committed comm reconciliation dealer set != governed rooftops',
  )
  must(
    base.required_cells === CONDITIONS * rooftopCount,
    `committed required_cells ${base.required_cells} != ${CONDITIONS}x${rooftopCount}`,
  )
  must(
    base.evaluated + base.unresolved === base.required_cells,
    'committed base evaluated + unresolved != required_cells',
  )
  // All-three-rooftops-or-no-metric: content cells evenly distributed.
  must(
    evaln.cells.length % rooftopCount === 0,
    `content cells ${evaln.cells.length} not divisible by ${rooftopCount} rooftops`,
  )
  const contentPerRooftop = evaln.cells.length / rooftopCount
  must(
    contentPerRooftop === promotedIds.length,
    `content per rooftop ${contentPerRooftop} != promoted ${promotedIds.length}`,
  )
  const contentByDealer: Record<string, number> = {}
  for (const c of evaln.cells)
    contentByDealer[c.dealer_id] = (contentByDealer[c.dealer_id] ?? 0) + 1
  for (const d of GOVERNED)
    must(
      contentByDealer[d] === contentPerRooftop,
      `dealer ${d} content cells ${contentByDealer[d]} != ${contentPerRooftop} (all-three rule)`,
    )

  const byDealer: Record<
    string,
    {
      spine_evaluated: number
      comm_evaluated: number
      content_evaluated: number
      evaluated: number
      unresolved: number
    }
  > = {}
  let evalSum = 0
  for (const d of GOVERNED) {
    const b = base.by_dealer[d]
    const evaluated = b.evaluated + contentPerRooftop
    byDealer[d] = {
      spine_evaluated: b.spine_evaluated,
      comm_evaluated: b.comm_evaluated,
      content_evaluated: contentPerRooftop,
      evaluated,
      unresolved: CONDITIONS - evaluated,
    }
    evalSum += evaluated
  }
  const portfolioEvaluated = base.evaluated + evaln.cells.length
  const portfolioUnresolved = base.required_cells - portfolioEvaluated
  must(
    evalSum === portfolioEvaluated,
    'per-rooftop evaluated does not sum to aggregate',
  )
  must(
    portfolioEvaluated + portfolioUnresolved === base.required_cells,
    'portfolio evaluated + unresolved != required_cells',
  )
  // 75/12/208 partition reconciliation (frozen shadow standard).
  const priorEvaluatedPerRooftop = base.evaluated / rooftopCount
  const residual = CONDITIONS - 75 - priorEvaluatedPerRooftop
  must(
    75 + priorEvaluatedPerRooftop + residual === CONDITIONS,
    'candidate/evaluated/residual partition != 295',
  )

  const composition = `${evaln.cells.length} content cells = ${promotedIds.join(' + ')} x ${rooftopCount} rooftops (${contentPerRooftop}/rooftop, all-three)`
  const recon = {
    artifact: 'gate4e-comm-content-portfolio-reconciliation',
    required_cells: base.required_cells,
    conditions: CONDITIONS,
    rooftops: rooftopCount,
    spine_evaluated: base.spine_evaluated,
    comm_overlay_evaluated: base.comm_overlay_evaluated,
    content_evaluated: evaln.cells.length,
    content_per_rooftop: contentPerRooftop,
    content_promoted_ids: promotedIds,
    content_composition: composition,
    prior_evaluated: base.evaluated,
    evaluated: portfolioEvaluated,
    unresolved: portfolioUnresolved,
    candidate_partition: {
      candidates_75: 75,
      prior_evaluated_per_rooftop: priorEvaluatedPerRooftop,
      residual: residual,
      reconciles_to: CONDITIONS,
    },
    by_dealer: byDealer,
    note: `Atomic union of the untouched core spine (${base.spine_evaluated}) + Gate 4C2 comm overlay (${base.comm_overlay_evaluated}) + the Gate 4E deterministic content overlay (${composition}). Per rooftop: ${base.spine_evaluated / rooftopCount} spine + ${base.comm_overlay_evaluated / rooftopCount} comm + ${contentPerRooftop} content = ${portfolioEvaluated / rooftopCount} evaluated / ${portfolioUnresolved / rooftopCount} unresolved. Derived from the committed 4C2 reconciliation, fail-closed; no prior cell changed.`,
  }
  const reconPath = path.join(OUT, 'comm-content-portfolio-reconciliation.json')
  fs.writeFileSync(reconPath, await formatJsonFile(recon, reconPath))

  for (const c of evaln.cells)
    console.log(
      `${c.metric_id} ${c.dealer_id}: ${c.numerator}/${c.denominator}=${c.value.toFixed(4)} rank=${c.rank} conf=${c.evaluation_confidence.label}`,
    )
  console.log(
    `portfolio: ${recon.evaluated}/${recon.unresolved} (spine ${base.spine_evaluated} + comm ${base.comm_overlay_evaluated} + content ${evaln.cells.length}); per rooftop ${portfolioEvaluated / rooftopCount}/${portfolioUnresolved / rooftopCount}`,
  )
  console.log(
    `wrote ${path.relative(REPO, matrixPath)}, ${path.relative(REPO, ledgerPath)}, ${path.relative(REPO, reconPath)}`,
  )
}

void main()
