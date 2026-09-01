// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EvalRow } from '@/server/reports/evaluator/types'
import type { AcceptedEvidence } from '@/server/reports/evaluator/promotion-probe'
import { loadCatalogDetail } from '@/server/reports/evaluator/closure'
import {
  CANONICAL_BINDING,
  buildAcceptedEvidence,
  probeConditions,
} from '@/server/reports/evaluator/promotion-probe'
import { assembleGate2Inputs } from '@/server/reports/evaluator/build-from-fresh'
import { buildSpine } from '@/server/reports/evaluator/spine'

const REPO = path.resolve(__dirname, '..', '..')
const FRESH = process.env.HALO_FRESH_DIR ?? '/tmp/halo-295-fresh-20260831'
const HAVE = fs.existsSync(path.join(FRESH, 'manifest.json'))
const LEDGER = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/evidence/m1r/evaluator/spine-ledger.json'),
    'utf8',
  ),
) as { rows: Array<EvalRow> }
const PROBE = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/evidence/m1r/evaluator/promotion-probe.json'),
    'utf8',
  ),
) as {
  records: Array<Record<string, unknown>>
  summary: { promoted: number; promoted_ids: Array<string> }
}
const details = loadCatalogDetail(
  JSON.parse(
    fs.readFileSync(
      path.join(
        REPO,
        'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
      ),
      'utf8',
    ),
  ),
)
const SCHED = JSON.parse(
  fs.readFileSync(
    path.join(
      REPO,
      'docs/halo/evidence/m1r/scheduled/native-scheduled-evidence.json',
    ),
    'utf8',
  ),
) as {
  deliveries: Array<{
    profile: string
    family: string
    sha256: string
    filename: string
    period_hint: string
    validation_state: string
  }>
}
const ACCEPTED: AcceptedEvidence = buildAcceptedEvidence(
  SCHED.deliveries
    .filter((d) => d.validation_state === 'held')
    .map((d) => ({
      profile: d.profile,
      family: d.family,
      sha256: d.sha256,
      filename: d.filename,
      period_hint: d.period_hint,
    })),
)

describe('Gate 3 promotion probe — evidence-derived + allowlist-bound (Defect 1 repair)', () => {
  it('canonical bindings match the LIVE catalog (not stale)', () => {
    for (const [id, b] of Object.entries(CANONICAL_BINDING)) {
      expect(details.find((d) => d.metric_id === id)!.condition, id).toBe(
        b.condition,
      )
    }
  })
  it('committed probe recomputes byte-identically from the real spine ledger + allowlist', () => {
    const { records } = probeConditions(details, LEDGER.rows, ACCEPTED)
    expect(JSON.stringify(records)).toBe(JSON.stringify(PROBE.records))
    expect(PROBE.summary.promoted).toBe(3)
    expect(PROBE.summary.promoted_ids).toEqual(['SW-031', 'SW-032', 'SW-041'])
  })
  it('promoted records carry allowlist-bound per-dealer evidence (SHA + period bound)', () => {
    for (const r of PROBE.records.filter((x) => x.promoted === true)) {
      const ev = r.evidence_by_dealer as Array<Record<string, unknown>>
      expect(ev.length).toBe(3)
      expect(new Set(ev.map((e) => e.dealer_id)).size).toBe(3) // distinct dealers
      for (const e of ev) {
        expect(e.strict_predicate_pass).toBe(true)
        expect(e.sha_allowlisted).toBe(true)
        expect(e.row_period_equals_lineage).toBe(true)
        expect(e.source_family).toBe(r.spec_source_family)
      }
    }
    for (const r of PROBE.records)
      expect(r).not.toHaveProperty('tested_families')
  })
})

describe.runIf(HAVE)(
  'Gate 3 promotion probe — adversarial regressions (shadow reproductions)',
  () => {
    const inputs = assembleGate2Inputs({ freshDir: FRESH, repoRoot: REPO })
    const spine = buildSpine(inputs)
    const clone = () => JSON.parse(JSON.stringify(spine.rows)) as Array<EvalRow>
    const probe = (rows: Array<EvalRow>, cat = details) =>
      probeConditions(cat, rows, ACCEPTED)
    const promotedOf = (rows: Array<EvalRow>, id: string, cat = details) =>
      probe(rows, cat).records.find((r) => r.metric_id === id)!.promoted

    it('POSITIVE: exactly SW-031/032/041 promote from the real byte-backed build', () => {
      const { summary } = probe(spine.rows)
      expect(summary.promoted).toBe(3)
      expect(summary.promoted_ids).toEqual(['SW-031', 'SW-032', 'SW-041'])
    })
    it('empty evidence / empty allowlist cannot promote', () => {
      expect(probeConditions(details, [], ACCEPTED).summary.promoted).toBe(0)
      expect(
        probeConditions(details, spine.rows, { held_deliveries: [] }).summary
          .promoted,
      ).toBe(0)
    })
    it('wrong-but-64-hex lineage SHA cannot promote', () => {
      const rows = clone()
      for (const r of rows)
        if (r.metric_id === 'SW-031' && r.source_lineage)
          r.source_lineage.artifact_sha256 = 'a'.repeat(64)
      expect(promotedOf(rows, 'SW-031')).toBe(false)
    })
    it('wrong source_fields / wrong formula cannot promote', () => {
      const rf = clone()
      for (const r of rf)
        if (r.metric_id === 'SW-032') r.source_fields = ['bogus']
      expect(promotedOf(rf, 'SW-032')).toBe(false)
      const ff = clone()
      for (const r of ff) if (r.metric_id === 'SW-041') r.formula = 'made up'
      expect(promotedOf(ff, 'SW-041')).toBe(false)
    })
    it('wrong baseline id / comparator / direction / value cannot promote', () => {
      const mk = (mut: (r: EvalRow) => void, id: string) => {
        const rows = clone()
        for (const r of rows) if (r.metric_id === id && r.baseline) mut(r)
        return promotedOf(rows, id)
      }
      expect(mk((r) => (r.baseline!.id = 'OT-WRONG'), 'SW-031')).toBe(false)
      expect(mk((r) => (r.baseline!.comparator = '>'), 'SW-032')).toBe(false)
      expect(
        mk((r) => (r.baseline!.direction = 'lower_is_better'), 'SW-031'),
      ).toBe(false)
      expect(mk((r) => (r.baseline!.value = 0.9), 'SW-041')).toBe(false)
    })
    it('row↔lineage dealer / family / profile mismatch cannot promote', () => {
      const dm = clone()
      for (const r of dm)
        if (r.metric_id === 'SW-031' && r.source_lineage)
          r.source_lineage.dealer_id = '99999'
      expect(promotedOf(dm, 'SW-031')).toBe(false)
      const fm = clone()
      for (const r of fm)
        if (r.metric_id === 'SW-032' && r.source_lineage)
          r.source_lineage.family = 'crm_sales_gross'
      expect(promotedOf(fm, 'SW-032')).toBe(false)
      const pm = clone()
      for (const r of pm)
        if (r.metric_id === 'SW-041') r.profile = 'not-a-profile'
      expect(promotedOf(pm, 'SW-041')).toBe(false)
    })
    it('row↔lineage period mismatch cannot promote', () => {
      const rows = clone()
      for (const r of rows)
        if (r.metric_id === 'SW-031')
          r.reporting_period = {
            start: '2020-01-01',
            end: '2020-01-07',
            timezone: 'America/New_York',
          }
      expect(promotedOf(rows, 'SW-031')).toBe(false)
    })
    it('CO-MUTATED row+lineage period (SHA still valid) cannot promote', () => {
      const rows = clone()
      const bogus = {
        start: '2020-01-01',
        end: '2020-01-07',
        timezone: 'America/New_York',
      }
      for (const r of rows)
        if (r.metric_id === 'SW-031' && r.source_lineage) {
          r.reporting_period = { ...bogus }
          r.source_lineage.reporting_period = { ...bogus }
          // SHA + filename untouched (still allowlisted); only the period is misstated.
        }
      expect(promotedOf(rows, 'SW-031')).toBe(false)
    })
    it('swapped lineage filename (SHA still valid) cannot promote', () => {
      const rows = clone()
      for (const r of rows)
        if (r.metric_id === 'SW-032' && r.source_lineage)
          r.source_lineage.artifact_filename = 'Evil-Report.xlsx'
      expect(promotedOf(rows, 'SW-032')).toBe(false)
    })
    it('mutated period_hint cannot promote', () => {
      const rows = clone()
      for (const r of rows)
        if (r.metric_id === 'SW-041' && r.source_lineage)
          r.source_lineage.period_hint = '2020-01-01/2020-01-07'
      expect(promotedOf(rows, 'SW-041')).toBe(false)
    })
    it('row.condition mutated away from canonical cannot promote', () => {
      const rows = clone()
      for (const r of rows)
        if (r.metric_id === 'SW-031')
          r.condition = 'Not the canonical condition.'
      expect(promotedOf(rows, 'SW-031')).toBe(false)
    })
    it('duplicate one dealer replacing another cannot promote', () => {
      const rows = spine.rows.filter(
        (r) => !(r.metric_id === 'SW-031' && r.dealer_id === '21047'),
      )
      const dup = JSON.parse(
        JSON.stringify(
          spine.rows.find(
            (r) => r.metric_id === 'SW-031' && r.dealer_id === '21043',
          ),
        ),
      ) as EvalRow
      rows.push(dup) // now two 21043 cells, no 21047
      expect(promotedOf(rows, 'SW-031')).toBe(false)
    })
    it('SW-031 mutated to an external-only condition cannot promote (definition incompatible)', () => {
      const mutated = details.map((d) =>
        d.metric_id === 'SW-031'
          ? {
              ...d,
              condition: 'Third-party enrichment indicates a switch.',
              acquisition_class: 'Separate external source required',
            }
          : d,
      )
      expect(promotedOf(spine.rows, 'SW-031', mutated)).toBe(false)
    })
    it('condition-TEXT-only mutation (held class kept) cannot promote', () => {
      const mutated = details.map((d) =>
        d.metric_id === 'SW-032'
          ? { ...d, condition: 'Totally different.' }
          : d,
      )
      expect(promotedOf(spine.rows, 'SW-032', mutated)).toBe(false)
    })
  },
)
