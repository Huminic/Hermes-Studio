/**
 * Gate 4C1 — deterministic Enhanced Sales Communication Log (weekly) ADMISSION generator.
 *
 * Reads the restricted /tmp handoff (manifest + three rooftop CSVs, sha-verified), validates
 * browser provenance + every fail-closed reader gate, and writes ONLY a NON-PII admission
 * proof: per-rooftop aggregates + lineage + manifest/evidence hashes. It NEVER copies raw CSV
 * bytes, customer/user/message content, or names into the repo. Prettier-clean + byte-
 * identical on rerun. No /srv, no promotion, no ledger mutation.
 *
 * Output: docs/halo/evidence/m1r/comms/comm-admission-aggregates.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { formatJsonFile } from '../m1r-evaluator/serialize'
import type { CommManifestEntry } from '@/server/reports/comms/comm-reader'
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
import {
  readCommWeekly,
  toAdmissionProof,
} from '@/server/reports/comms/comm-reader'

const REPO = process.cwd()
const DIR = process.env.HALO_COMM_DIR ?? '/tmp/halo-295-comm-20260901'
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

export function buildCommAdmission(dir: string, repoRoot: string): unknown {
  const manifestPath = path.join(dir, 'capture-manifest.json')
  const manifestSha = sha256File(manifestPath)
  if (manifestSha !== EXPECTED_MANIFEST_SHA)
    throw new Error(`manifest SHA ${manifestSha} != expected`)
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest

  if (manifest.declared_report_kind !== EXPECTED_REPORT_KIND)
    throw new Error(
      `declared_report_kind "${manifest.declared_report_kind}" != ${EXPECTED_REPORT_KIND}`,
    )
  if (!admitSourceUrl(manifest.source_url))
    throw new Error('manifest source_url not admitted (VinConnect host)')
  if (!admitReportUrl(manifest.report_url))
    throw new Error('manifest report_url not admitted (reporting host)')

  const period = {
    start: manifest.requested_period.start,
    end: manifest.requested_period.end,
    timezone: manifest.requested_period.timezone,
  }
  const allowlist = manifest.files.map((f) => ({
    filename: f.filename,
    sha256: f.sha256,
    bytes: f.bytes,
  }))

  const perProfile = manifest.files.map((entry) => {
    // Provenance completeness + capture-id + evidence-hash recompute (fail closed).
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
      throw new Error(`${entry.profile} bad capture_id ${entry.capture_id}`)
    const idFromCapture = CAPTURE_ID_RE.exec(entry.capture_id)![1]
    if (idFromCapture !== entry.dealer_id)
      throw new Error(`${entry.profile} capture_id rooftop != dealer_id`)
    const identity = (
      DEALER_IDENTITY as Record<
        string,
        { dealer_id: string; dealer_name: string } | undefined
      >
    )[entry.profile]
    if (!identity || identity.dealer_id !== entry.dealer_id)
      throw new Error(`${entry.profile} rooftop identity mismatch`)

    // Recompute screenshot + CSV hashes from the manifest-named files (fail closed).
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
    return toAdmissionProof(derivative)
  })

  return {
    artifact: 'gate4c1-comm-weekly-admission',
    family: COMM_WEEKLY_FAMILY,
    contract_state: 'proposed_extension_pending_consumer_acceptance',
    manifest_sha256: manifestSha,
    reporting_period: period,
    source_url: manifest.source_url,
    report_url: manifest.report_url,
    note: 'NON-PII admission proof. Raw CSVs remain restricted in /tmp and are never committed; no Customer/User/Message Content/name is persisted. This gate admits the family + proves provenance/schema/Sales-only; it promotes NO SW metric.',
    rooftops: perProfile,
  }
}

async function main(): Promise<void> {
  const obj = buildCommAdmission(DIR, REPO)
  fs.mkdirSync(OUT, { recursive: true })
  const p = path.join(OUT, 'comm-admission-aggregates.json')
  fs.writeFileSync(p, await formatJsonFile(obj, p))
  const o = obj as {
    rooftops: Array<{
      aggregates: {
        profile: string
        rows: number
        unique_lead_ids: number
        unique_reps: number
      }
    }>
  }
  for (const r of o.rooftops)
    console.log(
      `${r.aggregates.profile}: rows=${r.aggregates.rows} leads=${r.aggregates.unique_lead_ids} reps=${r.aggregates.unique_reps}`,
    )
  console.log(`wrote ${path.relative(REPO, p)}`)
}

void main()
