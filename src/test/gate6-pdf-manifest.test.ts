// @vitest-environment node
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

// Gate 6 focused test: the committed PDF manifest and the committed PDFs are internally consistent and
// byte-stable. Every recorded SHA-256 is recomputed from the committed PDF bytes, and every customer
// safety / coverage check the QA recorded is asserted here so a regression fails the suite.

const url = (p: string) => new URL(`../../${p}`, import.meta.url)
const read = (p: string) => JSON.parse(fs.readFileSync(url(p), 'utf8'))
const MANIFEST = read('docs/halo/evidence/m1r/gate6/gate6-pdf-manifest.json')

const EXPECTED = [
  { id: '21043', dealer: 'Serra Honda of Sylacauga' },
  { id: '21044', dealer: 'Serra Nissan of Sylacauga' },
  { id: '21047', dealer: 'Tony Serra Ford' },
]

describe('Gate 6 - PDF manifest + committed PDFs', () => {
  it('manifest covers the three dealers with 17/278/295 coverage', () => {
    expect(MANIFEST.artifact).toBe('gate6-pdf-manifest')
    expect(MANIFEST.coverage_per_dealer).toEqual({
      evaluated: 17,
      not_measured: 278,
      total: 295,
    })
    expect(MANIFEST.reports).toHaveLength(3)
    expect(MANIFEST.reports.map((r: any) => r.dealer_id).sort()).toEqual([
      '21043',
      '21044',
      '21047',
    ])
  })

  it('every report passed the customer-safety and coverage checks', () => {
    for (const r of MANIFEST.reports) {
      const tc = r.text_checks
      expect(tc.store_name_present).toBe(true)
      expect(tc.store_id_present).toBe(true)
      expect(tc.period_present).toBe(true)
      expect(tc.sw_ids_present).toBe(295)
      expect(tc.appendix_exact_295).toBe(true)
      expect(tc.totals_17_278_295_present).toBe(true)
      expect(tc.forbidden_customer_terms).toBe(0)
      expect(tc.pii_matches).toBe(0)
      expect(r.pages).toBe(34)
      expect(String(r.visual_qa)).toMatch(/^PASS/)
    }
  })

  it('each committed PDF exists and its SHA-256 matches the manifest (byte-stable)', () => {
    for (const meta of EXPECTED) {
      const r = MANIFEST.reports.find((x: any) => x.dealer_id === meta.id)
      expect(r, meta.id).toBeTruthy()
      expect(r.dealer).toBe(meta.dealer)
      const bytes = fs.readFileSync(url(r.file))
      expect(bytes.length).toBe(r.bytes)
      const sha = createHash('sha256').update(bytes).digest('hex')
      expect(sha, r.file).toBe(r.sha256)
      // A valid PDF header, as a light structural sanity check.
      expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    }
  })
})
