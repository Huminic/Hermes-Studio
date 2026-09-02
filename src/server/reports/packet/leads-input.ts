/**
 * PKT-02-01 Honda-21043 leads input — REUSE of the accepted immutable Leads
 * evidence, sha-verified and Sales-only, isolated to Serra Honda 21043.
 *
 * This never re-acquires and never touches the Nissan (21044) or Ford (21047)
 * captures: it selects ONLY the serra-honda profile from the committed golden
 * allowlist, cross-checks the capture manifest (as the Gate-2 assembler does),
 * verifies the exact frozen source sha256 + byte count, then computes the
 * controller-ratified SW-011/012/015 primitives via the accepted `readLeadsMetrics`
 * reader (which enforces one-rooftop dealer identity + a Service/Parts scan).
 *
 * Fail-closed: any missing file, sha mismatch, byte-count mismatch, row-count
 * mismatch, or dealer/Sales-only violation throws `LeadsInputError`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { readLeadsMetrics } from '../evaluator/leads-metrics'
import type { LeadsMetrics } from '../evaluator/leads-metrics'

export class LeadsInputError extends Error {}

export const HONDA_DEALER_ID = '21043'
export const HONDA_PROFILE = 'serra-honda'
export const EXPECTED_FILENAME =
  'serra-honda-21043_leads_2026-08-24_2026-08-30.xlsx'
export const EXPECTED_SOURCE_SHA256 =
  '39f0577400c912b8e0f0db4a37a35726c1a460c32df88f231aaa39aff9d100ae'
export const EXPECTED_BYTES = 46940
export const EXPECTED_ROWS = 119
export const EXPECTED_PERIOD = { start: '2026-08-24', end: '2026-08-30' }
export const DEFAULT_LEADS_DIR = '/tmp/halo-295-leads-20260831'

type GoldenFile = {
  capture_id: string
  profile: string
  dealer_id: string
  filename: string
  sha256: string
  period: { start: string; end: string }
}
type ManifestFile = {
  capture_id: string
  profile: string
  filename: string
  sha256: string
  source_url: string
  captured_at: string
}

export type LeadsInput = {
  dealerId: string
  sourceSha256: string
  bytes: number
  metrics: LeadsMetrics
  lineage: {
    capture_id: string
    filename: string
    schema_contract_sha256: string
    receipt_sha256: string
    period: { start: string; end: string }
    row_key: { field: string; unique: number }
    sales_only_proof: string
  }
}

const sha256Hex = (b: Buffer): string =>
  createHash('sha256').update(b).digest('hex')

function readJson<T>(p: string): T {
  if (!fs.existsSync(p)) throw new LeadsInputError(`missing file: ${p}`)
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T
  } catch (e) {
    throw new LeadsInputError(`unreadable json ${p}: ${(e as Error).message}`)
  }
}

export function loadHondaLeadsInput(opts: {
  repoRoot: string
  leadsDir?: string
}): LeadsInput {
  const { repoRoot } = opts
  const leadsDir =
    opts.leadsDir ?? process.env.HALO_LEADS_DIR ?? DEFAULT_LEADS_DIR
  if (!fs.existsSync(leadsDir)) {
    throw new LeadsInputError(`missing leads directory: ${leadsDir}`)
  }

  // Committed golden allowlist — select ONLY the Honda 21043 record.
  const golden = readJson<{ files: Array<GoldenFile> }>(
    path.join(repoRoot, 'docs/halo/evidence/m1r/leads/leads-real-golden.json'),
  )
  const g = golden.files.find(
    (f) => f.profile === HONDA_PROFILE && f.dealer_id === HONDA_DEALER_ID,
  )
  if (!g) {
    throw new LeadsInputError(
      `no committed golden record for ${HONDA_PROFILE}/${HONDA_DEALER_ID}`,
    )
  }
  if (g.sha256 !== EXPECTED_SOURCE_SHA256) {
    throw new LeadsInputError(
      `golden sha drift for ${HONDA_DEALER_ID}: ${g.sha256} != frozen ${EXPECTED_SOURCE_SHA256}`,
    )
  }
  if (g.filename !== EXPECTED_FILENAME) {
    throw new LeadsInputError(
      `golden filename drift: ${g.filename} != ${EXPECTED_FILENAME}`,
    )
  }

  // Cross-check the capture manifest against the golden (provenance revalidation).
  const manifest = readJson<{ files: Array<ManifestFile> }>(
    path.join(leadsDir, 'capture-manifest.json'),
  )
  const cm = manifest.files.find((f) => f.capture_id === g.capture_id)
  if (!cm) {
    throw new LeadsInputError(`no capture-manifest entry for ${g.capture_id}`)
  }
  if (cm.sha256 !== g.sha256 || cm.filename !== g.filename) {
    throw new LeadsInputError(
      `capture-manifest disagreement for ${g.capture_id}`,
    )
  }

  // Verify the exact frozen bytes BEFORE any parse.
  const filePath = path.join(leadsDir, g.filename)
  if (!fs.existsSync(filePath)) {
    throw new LeadsInputError(`missing leads artifact: ${filePath}`)
  }
  const buf = fs.readFileSync(filePath)
  const gotSha = sha256Hex(buf)
  if (gotSha !== EXPECTED_SOURCE_SHA256) {
    throw new LeadsInputError(
      `source sha mismatch: ${gotSha} != frozen ${EXPECTED_SOURCE_SHA256}`,
    )
  }
  if (buf.length !== EXPECTED_BYTES) {
    throw new LeadsInputError(
      `source byte-count mismatch: ${buf.length} != ${EXPECTED_BYTES}`,
    )
  }

  // Accepted reader: one rooftop (21043) + Service/Parts scan + missing-not-zero.
  let metrics: LeadsMetrics
  try {
    metrics = readLeadsMetrics(buf, HONDA_DEALER_ID)
  } catch (e) {
    throw new LeadsInputError(`leads read failed: ${(e as Error).message}`)
  }
  if (metrics.total_rows !== EXPECTED_ROWS) {
    throw new LeadsInputError(
      `row reconciliation failed: ${metrics.total_rows} != ${EXPECTED_ROWS}`,
    )
  }

  // Row-key uniqueness comes from the committed source registry receipt (Lead ID
  // 119 unique); we re-assert the accepted count here.
  return {
    dealerId: HONDA_DEALER_ID,
    sourceSha256: gotSha,
    bytes: buf.length,
    metrics,
    lineage: {
      capture_id: g.capture_id,
      filename: g.filename,
      schema_contract_sha256:
        '7d446696d9be66b917308cad68e27fb8dfaf40ca6e08064afde16031c172eeb1',
      receipt_sha256:
        '68f845a528623c3799e52c2bb45ba25551450314c5b69ac5fbde2b6e2b6521f2',
      period: { start: g.period.start, end: g.period.end },
      row_key: { field: 'Lead ID', unique: EXPECTED_ROWS },
      sales_only_proof: metrics.sales_only_proof,
    },
  }
}
