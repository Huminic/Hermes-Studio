// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { LeadsProvenance } from '@/server/reports/leads/leads-classifier'
import { classifyLeadsDelivery } from '@/server/reports/leads/leads-classifier'
import { readLeads } from '@/server/reports/leads/leads-reader'
import { isManifestAllowlisted } from '@/server/reports/leads/leads-family-contract'

// Real governed files are PII-bearing and are NOT committed; they live only in the
// operator's capture directory. This suite runs when they are present and proves
// the exact bytes recompute to the committed non-PII golden. The golden's SHA-256
// anchors the exact real bytes so anyone can re-verify out-of-band.
const DIR = process.env.HALO_LEADS_DIR ?? '/tmp/halo-295-leads-20260831'
const MANIFEST = path.join(DIR, 'capture-manifest.json')
const HAVE = fs.existsSync(MANIFEST)
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

const GOLDEN = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../docs/halo/evidence/m1r/leads/leads-real-golden.json',
      import.meta.url,
    ),
    'utf8',
  ),
)

describe('Leads real-file golden — committed golden is non-PII', () => {
  it('golden carries no row-level PII values (only schema header labels)', () => {
    const text = JSON.stringify(GOLDEN.files) // exclude the headers[] schema array
    expect(text).not.toMatch(/\b[A-HJ-NPR-Z0-9]{17}\b/) // no VIN-shaped tokens
    expect(text.toLowerCase()).not.toContain('cobuyer')
    expect(GOLDEN.header_count).toBe(57)
  })
})

describe.runIf(HAVE)(
  'Leads real-file golden — recompute from real bytes',
  () => {
    const manifest = HAVE
      ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
      : { files: [] }
    const allowlist = manifest.files.map(
      (f: { filename: string; sha256: string; bytes: number }) => ({
        filename: f.filename,
        sha256: f.sha256,
        bytes: f.bytes,
      }),
    )

    it('every real file is manifest-allowlisted, holds with ZERO gaps, and matches golden', () => {
      for (const mf of manifest.files) {
        const buf = fs.readFileSync(path.join(DIR, mf.filename))
        const gotSha = sha256(buf)
        expect(
          isManifestAllowlisted(
            { filename: mf.filename, sha256: gotSha, bytes: buf.length },
            allowlist,
          ),
          mf.filename,
        ).toBe(true)

        const prov: LeadsProvenance = {
          capture_id: mf.capture_id,
          profile: mf.profile,
          dealer_id: mf.dealer_id,
          dealer_name: mf.dealer,
          source_url: mf.source_url,
          captured_at: mf.captured_at,
          declared_report_kind: mf.declared_report_kind,
          filter_evidence: mf.filter_evidence,
          reporting_period: manifest.reporting_period,
          declared_rows: mf.rows,
          declared_sha256: mf.sha256,
          filename: mf.filename,
        }
        const cls = classifyLeadsDelivery(buf, prov)
        expect(cls.status, `${mf.filename}: ${JSON.stringify(cls)}`).toBe(
          'held',
        )
        if (cls.status !== 'held') continue
        expect(cls.provenance_gaps, mf.filename).toEqual([])

        const g = GOLDEN.files.find(
          (x: { profile: string }) => x.profile === mf.profile,
        )
        const { primitives } = readLeads(buf)
        expect(gotSha).toBe(g.sha256)
        expect(primitives.total_leads).toBe(g.data_rows)
        expect(primitives.unique_lead_ids).toBe(g.lead_id_unique)
        expect(primitives.service_parts_leakage_rows).toBe(0)
        expect(primitives.by_lead_type).toEqual(g.by_lead_type)
        expect(primitives.by_lead_status_type).toEqual(g.by_lead_status_type)
        expect(primitives.sold_count).toBe(g.sold_count)
        // Missing != zero: blank/zero breakdown matches the pinned golden.
        expect(primitives.actual_response.missing).toBe(
          g.actual_response.blanks,
        )
        expect(primitives.actual_response.zeros).toBe(g.actual_response.zeros)
        expect(primitives.adjusted_response.missing).toBe(
          g.adjusted_response.blanks,
        )
        expect(primitives.adjusted_response.zeros).toBe(
          g.adjusted_response.zeros,
        )
        expect(primitives.first_customer_contact_blanks).toBe(
          g.first_customer_contact_blanks,
        )
      }
    })

    it('filter-evidence screenshot hash matches the manifest (when present)', () => {
      const fe = manifest.files[0]?.filter_evidence
      const fePath = fe ? path.join(DIR, fe.filename) : ''
      if (!fe || !fs.existsSync(fePath)) return
      expect(sha256(fs.readFileSync(fePath))).toBe(fe.sha256)
    })

    it('every referenced capture-evidence JPEG exists and hash-matches — no missing-file claim (shadow #1)', () => {
      const evidence: Array<{ filename: string; sha256: string }> =
        manifest.capture_evidence ?? []
      expect(evidence.length).toBeGreaterThanOrEqual(4) // filter + 3 per-store tables
      for (const e of evidence) {
        const p = path.join(DIR, e.filename)
        expect(fs.existsSync(p), `${e.filename} present`).toBe(true)
        // Validate hash only — never read/echo PII contents.
        expect(sha256(fs.readFileSync(p)), e.filename).toBe(e.sha256)
      }
    })
  },
)

describe('Leads hold-proof — capture evidence recorded, none missing (shadow #1)', () => {
  const HOLD = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../docs/halo/evidence/m1r/leads/leads-hold-proof.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  it('durable hold-proof lists all capture evidence with no absent/mismatched entry', () => {
    expect(HOLD.capture_evidence.length).toBeGreaterThanOrEqual(4)
    for (const e of HOLD.capture_evidence) {
      expect(e.present, e.filename).toBe(true)
      expect(e.hash_match, e.filename).toBe(true)
    }
    expect(HOLD.capture_evidence_note).toMatch(/never committed/i)
  })
})
