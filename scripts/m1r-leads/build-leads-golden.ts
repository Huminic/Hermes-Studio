/**
 * M1R Leads input gate — repeatable golden + hold-proof builder.
 *
 * Reads ONLY the exact manifest-allowlisted VinSolutions Custom Reporting "Leads"
 * browser exports from a directory (default /tmp/halo-295-leads-20260831, override
 * HALO_LEADS_DIR). It never globs: each candidate must match the manifest by
 * filename + SHA-256 + byte size or the build aborts. Any other workbook in the
 * directory (e.g. a rejected/contaminated or pre-gate variant) is not consumed.
 *
 * For each allowlisted file it runs the FAIL-CLOSED classifier (must be `held`),
 * computes non-PII metric primitives via the reader, and writes two internal
 * evidence artifacts:
 *   docs/halo/evidence/m1r/leads/leads-real-golden.json   (non-PII structural golden)
 *   docs/halo/evidence/m1r/leads/leads-hold-proof.json    (classification proof)
 *
 * Read-only on source files; writes ONLY the two evidence files. No promotion, no
 * /srv, no Brain, no network. Deterministic: re-running against the same real
 * files reproduces byte-identical golden JSON (no timestamps/randomness).
 *
 *   node_modules/.bin/tsx scripts/m1r-leads/build-leads-golden.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { classifyLeadsDelivery } from '../../src/server/reports/leads/leads-classifier'
import { readLeads } from '../../src/server/reports/leads/leads-reader'
import {
  LEADS_HEADERS,
  isManifestAllowlisted,
} from '../../src/server/reports/leads/leads-family-contract'
import type { LeadsProvenance } from '../../src/server/reports/leads/leads-classifier'
import type { AllowlistEntry } from '../../src/server/reports/leads/leads-family-contract'

const DIR = process.env.HALO_LEADS_DIR ?? '/tmp/halo-295-leads-20260831'
const OUT = path.resolve('docs/halo/evidence/m1r/leads')
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

type ManifestFile = {
  capture_id: string
  captured_at: string
  source_url: string
  declared_report_kind: string
  filter_evidence: { filename: string; sha256: string }
  profile: string
  dealer: string
  dealer_id: string
  filename: string
  bytes: number
  sha256: string
  rows: number
}
type CaptureEvidence = {
  filename: string
  sha256: string
  description?: string
}
type Manifest = {
  capture_date: string
  reporting_period: { start: string; end: string }
  source: { dataset: string; source_url_host: string; source_url_path: string }
  filters: unknown
  files: Array<ManifestFile>
  capture_evidence?: Array<CaptureEvidence>
}

function main(): void {
  const manifest: Manifest = JSON.parse(
    fs.readFileSync(path.join(DIR, 'capture-manifest.json'), 'utf8'),
  )
  const allowlist: Array<AllowlistEntry> = manifest.files.map((f) => ({
    filename: f.filename,
    sha256: f.sha256,
    bytes: f.bytes,
  }))
  fs.mkdirSync(OUT, { recursive: true })

  // Verify every referenced capture-evidence artifact (filter + per-store table
  // screenshots) by existence + SHA-256 only. These JPEGs contain customer PII:
  // they are NEVER committed and their contents are NEVER read/echoed.
  const captureEvidence = (manifest.capture_evidence ?? []).map((e) => {
    const p = path.join(DIR, e.filename)
    const present = fs.existsSync(p)
    const hash_match = present ? sha256(fs.readFileSync(p)) === e.sha256 : null
    if (present && hash_match === false)
      throw new Error(`${e.filename}: capture-evidence hash mismatch`)
    return {
      filename: e.filename,
      sha256: e.sha256,
      present,
      hash_match,
      description: e.description ?? null,
    }
  })

  const goldenFiles: Array<Record<string, unknown>> = []
  const holdProof: Array<Record<string, unknown>> = []

  for (const mf of manifest.files) {
    const buf = fs.readFileSync(path.join(DIR, mf.filename))
    const gotSha = sha256(buf)
    // Allowlist gate: exact filename + sha + bytes, or refuse to consume.
    if (
      !isManifestAllowlisted(
        { filename: mf.filename, sha256: gotSha, bytes: buf.length },
        allowlist,
      )
    )
      throw new Error(
        `${mf.filename}: not manifest-allowlisted (sha/bytes mismatch) — refusing to consume`,
      )

    // Verify the per-file filter-evidence artifact hash when present locally
    // (proves the provenance points at the real, unmodified screenshot).
    let filterEvidenceVerified: boolean | null = null
    const fePath = path.join(DIR, mf.filter_evidence.filename)
    if (fs.existsSync(fePath))
      filterEvidenceVerified =
        sha256(fs.readFileSync(fePath)) === mf.filter_evidence.sha256

    const prov: LeadsProvenance = {
      capture_id: mf.capture_id,
      profile: mf.profile,
      dealer_id: mf.dealer_id,
      dealer_name: mf.dealer,
      // Per-file provenance from the strengthened manifest (never invented):
      source_url: mf.source_url,
      captured_at: mf.captured_at, // ISO-8601 with -04:00 offset (macOS birth ts)
      declared_report_kind: mf.declared_report_kind,
      filter_evidence: mf.filter_evidence,
      reporting_period: manifest.reporting_period,
      declared_rows: mf.rows,
      declared_sha256: mf.sha256,
      filename: mf.filename,
    }
    const cls = classifyLeadsDelivery(buf, prov)
    if (cls.status !== 'held')
      throw new Error(
        `${mf.filename}: expected held, got ${JSON.stringify(cls)}`,
      )
    if (cls.provenance_gaps.length > 0)
      throw new Error(
        `${mf.filename}: expected zero provenance gaps, got ${JSON.stringify(cls.provenance_gaps)}`,
      )
    if (filterEvidenceVerified === false)
      throw new Error(`${mf.filename}: filter-evidence hash mismatch`)

    const { primitives } = readLeads(buf)
    goldenFiles.push({
      capture_id: mf.capture_id,
      profile: mf.profile,
      dealer_id: mf.dealer_id,
      dealer_name: mf.dealer,
      filename: mf.filename,
      bytes: buf.length,
      sha256: gotSha,
      column_count: LEADS_HEADERS.length,
      data_rows: primitives.total_leads,
      period: manifest.reporting_period,
      lead_id_populated: primitives.total_leads, // classifier proves no blank Lead IDs
      lead_id_unique: primitives.unique_lead_ids,
      service_parts_leakage_rows: primitives.service_parts_leakage_rows,
      by_lead_type: primitives.by_lead_type,
      by_lead_status_type: primitives.by_lead_status_type,
      sold_count: primitives.sold_count,
      sold_datetime_populated: primitives.sold_datetime_populated,
      contacted: {
        Yes: primitives.contacted_yes,
        No: primitives.contacted_no,
        missing: primitives.contacted_missing,
      },
      first_customer_contact_blanks: primitives.first_customer_contact_blanks,
      actual_response: {
        populated: primitives.actual_response.populated,
        blanks: primitives.actual_response.missing,
        zeros: primitives.actual_response.zeros,
        sum_min: primitives.actual_response.sum_min,
        min_min: primitives.actual_response.min_min,
        max_min: primitives.actual_response.max_min,
      },
      adjusted_response: {
        populated: primitives.adjusted_response.populated,
        blanks: primitives.adjusted_response.missing,
        zeros: primitives.adjusted_response.zeros,
        sum_min: primitives.adjusted_response.sum_min,
        min_min: primitives.adjusted_response.min_min,
        max_min: primitives.adjusted_response.max_min,
      },
    })
    holdProof.push({
      profile: mf.profile,
      filename: mf.filename,
      sha256: gotSha,
      status: cls.status,
      captured_at: mf.captured_at,
      source_url_host: new URL(mf.source_url).hostname,
      declared_report_kind: mf.declared_report_kind,
      filter_evidence: mf.filter_evidence,
      filter_evidence_verified: filterEvidenceVerified,
      checks_passed: cls.checks_passed,
      provenance_gaps: cls.provenance_gaps,
      provenance_needed: cls.provenance_needed,
    })

    console.log(
      `${mf.profile}: ${cls.status} rows=${primitives.total_leads} unique=${primitives.unique_lead_ids} svc/parts=${primitives.service_parts_leakage_rows} gaps=${cls.provenance_gaps.join('|') || 'none'}`,
    )
  }

  const golden = {
    artifact: 'm1r-leads-real-golden',
    family: 'vinsolutions_custom_reporting_leads',
    note: 'Non-PII structural golden recomputed from the three real governed Leads exports. No customer names/VINs/PII. SHA-256 anchors the exact real bytes; source files are NOT committed.',
    reporting_period: manifest.reporting_period,
    header_count: LEADS_HEADERS.length,
    headers: LEADS_HEADERS,
    files: goldenFiles,
  }
  fs.writeFileSync(
    path.join(OUT, 'leads-real-golden.json'),
    JSON.stringify(golden, null, 2) + '\n',
    'utf8',
  )
  fs.writeFileSync(
    path.join(OUT, 'leads-hold-proof.json'),
    JSON.stringify(
      {
        artifact: 'm1r-leads-hold-proof',
        family: 'vinsolutions_custom_reporting_leads',
        promoted: false,
        wrote_srv: false,
        wrote_brain: false,
        capture_evidence_note:
          'Capture-evidence JPEGs (filter + per-store table) contain customer PII: verified by existence + SHA-256 only, never committed or read.',
        capture_evidence: captureEvidence,
        results: holdProof,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  )

  console.log(
    `\nWrote ${path.relative(process.cwd(), OUT)}/leads-real-golden.json + leads-hold-proof.json`,
  )
}

main()
