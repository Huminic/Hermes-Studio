// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeXlsx } from './helpers/make-xlsx'
import {
  CATEGORICAL_SERVICE_SCAN_COLUMNS,
  LEADS_HEADERS,
} from '@/server/reports/leads/leads-family-contract'
import {
  LeadsMetricsError,
  readLeadsMetrics,
} from '@/server/reports/evaluator/leads-metrics'
import {
  BindingIntegrityError,
  loadBinding,
} from '@/server/reports/packet/binding'
import { executePacket } from '@/server/reports/packet/engine'

const REPO = path.resolve(__dirname, '..', '..')
const LEADS = process.env.HALO_LEADS_DIR ?? '/tmp/halo-295-leads-20260831'
const HONDA_FILE = path.join(
  LEADS,
  'serra-honda-21043_leads_2026-08-24_2026-08-30.xlsx',
)
const HAVE = fs.existsSync(HONDA_FILE)

const H = [...LEADS_HEADERS]
type Cells = Record<string, string>
function workbook(rows: Array<Cells>): Buffer {
  const matrix: Array<Array<string>> = [H]
  rows.forEach((cells, i) => {
    const r = new Array(H.length).fill('')
    r[H.indexOf('Lead ID')] = cells['Lead ID'] ?? String(2000 + i)
    r[H.indexOf('Dealer')] = cells['Dealer'] ?? 'Serra Honda of Sylacauga'
    r[H.indexOf('Dealer ID')] = cells['Dealer ID'] ?? '21043'
    r[H.indexOf('Lead Type')] = cells['Lead Type'] ?? 'Internet'
    r[H.indexOf('Lead Source')] =
      cells['Lead Source'] ?? 'Autotrader.Com - Lead'
    r[H.indexOf('Lead Status Type')] = cells['Lead Status Type'] ?? 'Active'
    for (const [k, v] of Object.entries(cells)) {
      const idx = H.indexOf(k)
      if (idx >= 0) r[idx] = v
    }
    matrix.push(r)
  })
  return makeXlsx(matrix)
}

const run = () =>
  executePacket({
    repoRoot: REPO,
    leadsDir: LEADS,
    asOf: '2026-09-02T06:51:10Z',
    engineVersion: 'pkt-exec-1',
  })

describe('PKT-02-01 adversarial probes (must reject / must not massage)', () => {
  it('PROBE A — rejects a Service/Parts token in a Sales categorical column', () => {
    const scanCol = CATEGORICAL_SERVICE_SCAN_COLUMNS[0]
    const buf = workbook([
      { 'Originated After Hours': 'No', [scanCol]: 'Service Drive Lead' },
    ])
    expect(() => readLeadsMetrics(buf, '21043')).toThrow(LeadsMetricsError)
  })

  it('PROBE B — rejects a wrong-dealer workbook (dealer isolation)', () => {
    const buf = workbook([
      { 'Dealer ID': '21044', 'Originated After Hours': 'No' },
    ])
    expect(() => readLeadsMetrics(buf, '21043')).toThrow(LeadsMetricsError)
  })

  it('PROBE C — SW-012 is strict AND, never OR: a lead with one touch is NOT untouched', () => {
    const buf = workbook([
      // strictly untouched: all three blank
      { 'Originated After Hours': 'No' },
      // has a First Contact Attempt -> under OR-any-blank it would wrongly count
      {
        'Originated After Hours': 'No',
        'First Contact Attempt': '2026-08-25 09:00',
      },
    ])
    const m = readLeadsMetrics(buf, '21043')
    expect(m.business_hours_population).toBe(2)
    expect(m.untouched_strict).toBe(1) // only the all-three-blank row
  })

  it('PROBE D — SW-015 denominator is reps_with_numeric, not all reps/leads', () => {
    const buf = workbook([
      {
        'Originated After Hours': 'No',
        'Sales Rep': 'RepX',
        'Actual Response Time (Min)': '5',
      },
      {
        'Originated After Hours': 'No',
        'Sales Rep': 'RepX',
        'Actual Response Time (Min)': '7',
      },
      // RepY has NO numeric response -> excluded from reps_with_numeric
      { 'Originated After Hours': 'No', 'Sales Rep': 'RepY' },
    ])
    const m = readLeadsMetrics(buf, '21043')
    expect(m.reps_with_numeric).toBe(1) // only RepX
  })

  it('PROBE E — missing is not zero: blank Actual Response is excluded from the median', () => {
    const buf = workbook([
      { 'Originated After Hours': 'No', 'Actual Response Time (Min)': '10' },
      { 'Originated After Hours': 'No' }, // blank -> missing, NOT 0
    ])
    const m = readLeadsMetrics(buf, '21043')
    expect(m.response_numeric).toBe(1)
    expect(m.response_missing).toBe(1)
    // median of [10] == 10, not median of [10,0] == 5
    expect(m.median_response_min).toBe(10)
  })

  it('PROBE F — incompatible-target withholding: SW-013/014 never graded', () => {
    if (!HAVE) return
    const r = run()
    for (const id of ['SW-013', 'SW-014']) {
      const e = r.evaluations.find((x) => x.metric_id === id)!
      expect(e.gradable_state).toBe('withheld')
      expect(e.rating).toBe('withheld')
      expect(e.threshold).toBeNull()
      expect(e.detection_fired).toBeNull()
    }
  })

  it('PROBE G — grade thresholds are the FROZEN operational targets (no tamper)', () => {
    if (!HAVE) return
    const r = run()
    const th = (id: string) =>
      r.evaluations.find((x) => x.metric_id === id)!.threshold
    expect(th('SW-011')).toBe(10)
    expect(th('SW-012')).toBe(0)
    expect(th('SW-015')).toBe(0)
  })

  it('PROBE H — a tampered binding file is rejected (sha integrity)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pkt0201-bind-'))
    const dir = path.join(tmp, 'docs/halo/contract/phase1b')
    fs.mkdirSync(dir, { recursive: true })
    const real = JSON.parse(
      fs.readFileSync(
        path.join(REPO, 'docs/halo/contract/phase1b/pkt-02-01-binding.json'),
        'utf8',
      ),
    )
    real.metrics['SW-011'].ot_anchor.threshold = 999 // massage the target
    fs.writeFileSync(
      path.join(dir, 'pkt-02-01-binding.json'),
      JSON.stringify(real, null, 2),
    )
    expect(() => loadBinding(tmp)).toThrow(BindingIntegrityError)
  })

  it('PROBE I — a tampered source (wrong bytes) is rejected end-to-end', () => {
    if (!HAVE) return
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pkt0201-src-'))
    fs.copyFileSync(
      path.join(LEADS, 'capture-manifest.json'),
      path.join(tmp, 'capture-manifest.json'),
    )
    const bad = fs.readFileSync(HONDA_FILE)
    bad[10] = bad[10] ^ 0xff
    fs.writeFileSync(
      path.join(tmp, 'serra-honda-21043_leads_2026-08-24_2026-08-30.xlsx'),
      bad,
    )
    expect(() =>
      executePacket({
        repoRoot: REPO,
        leadsDir: tmp,
        asOf: '2026-09-02T06:51:10Z',
        engineVersion: 'pkt-exec-1',
      }),
    ).toThrow()
  })
})
