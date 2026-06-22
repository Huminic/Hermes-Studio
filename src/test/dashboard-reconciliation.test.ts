/**
 * Reconciliation: API-derived lead opportunities vs the real CRM report, at
 * LEAD-SOURCE granularity (goal TESTING item 2).
 *
 * SKIPPED until the operator drops both fixtures in fixtures/reconciliation/
 * (see that README). It is deliberately NOT run against synthetic data — a
 * passing reconciliation must use real CRM data or it would falsely certify.
 *
 * Documented rule (the defensible difference vs the CRM's raw totals):
 *   - API counts are SALES-scoped (INTERNET/PHONE/WALK_IN; drop SERVICE/PARTS),
 *     BAD dropped, and deduped by `contact`.
 *   - Therefore, per lead source, the API opportunity count MUST be ≤ the
 *     report's raw Total_Leads (a deduped/scoped subset can never exceed the
 *     raw count). This is the hard invariant asserted below.
 *   - The residual delta vs the report's Good_Leads is printed per source for
 *     the write-up; TOLERANCE is the band within which we consider the API count
 *     reconciled to the report's deduped figure once certified against the CSV.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/server/report-ingest'
import { summarizeOpportunities } from '@/server/lead-opportunities'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIX = path.join(HERE, 'fixtures', 'reconciliation')
const CSV = path.join(FIX, 'report.csv')
const API = path.join(FIX, 'api-leads.json')
const HAVE_FIXTURES = fs.existsSync(CSV) && fs.existsSync(API)

/** Documented reconciliation tolerance (per-source), pending certification. */
const TOLERANCE = 0.05

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function reportBySource(csvText: string): Map<string, { total: number; good: number }> {
  const m = parseCsv(csvText)
  const header = m[0].map((h) => h.trim().toLowerCase())
  const iSrc = header.indexOf('lead_source')
  const iTotal = header.indexOf('total_leads')
  const iGood = header.indexOf('good_leads')
  const out = new Map<string, { total: number; good: number }>()
  for (let r = 1; r < m.length; r++) {
    const row = m[r]
    if (!row[iSrc]) continue
    out.set(norm(row[iSrc]), {
      total: Number(String(row[iTotal] ?? '0').replace(/[^0-9.]/g, '')) || 0,
      good: Number(String(row[iGood] ?? '0').replace(/[^0-9.]/g, '')) || 0,
    })
  }
  return out
}

function apiRows(jsonText: string): Array<Record<string, unknown>> {
  const data = JSON.parse(jsonText)
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.items)) return data.items
  throw new Error('api-leads.json must be an array or { items: [...] }')
}

describe('dashboard reconciliation (API vs CRM report, per lead source)', () => {
  it.skipIf(!HAVE_FIXTURES)(
    'API per-source opportunities are a defensible subset of the report (deduped ≤ raw)',
    () => {
      const report = reportBySource(fs.readFileSync(CSV, 'utf8'))
      const summary = summarizeOpportunities(apiRows(fs.readFileSync(API, 'utf8')))

      const lines: Array<string> = []
      for (const src of summary.by_source) {
        const rep = report.get(norm(src.lead_source))
        if (!rep) {
          lines.push(`  ${src.lead_source}: api=${src.opportunities} (no report row)`)
          continue
        }
        // Hard invariant: a sales-scoped, deduped count cannot exceed raw total.
        expect(
          src.opportunities,
          `${src.lead_source}: API ${src.opportunities} must be ≤ report Total_Leads ${rep.total}`,
        ).toBeLessThanOrEqual(rep.total)

        const deltaVsGood = rep.good > 0 ? (src.opportunities - rep.good) / rep.good : null
        lines.push(
          `  ${src.lead_source}: api=${src.opportunities} total=${rep.total} good=${rep.good}` +
            (deltaVsGood != null ? ` Δvs_good=${(deltaVsGood * 100).toFixed(1)}%` : ''),
        )
      }
      // Surface the per-source picture for the reconciliation write-up.
      // eslint-disable-next-line no-console
      console.log(
        `Reconciliation (tolerance ±${(TOLERANCE * 100).toFixed(0)}% vs Good_Leads):\n` +
          lines.join('\n'),
      )
      expect(summary.opportunities).toBeGreaterThan(0)
    },
  )

  it('the reconciliation harness is present and waits on operator fixtures', () => {
    // Always-on guard so the suite records that reconciliation is wired but
    // pending data (never silently absent).
    expect(typeof summarizeOpportunities).toBe('function')
    if (!HAVE_FIXTURES) {
      expect(fs.existsSync(path.join(FIX, 'README.md'))).toBe(true)
    }
  })
})
