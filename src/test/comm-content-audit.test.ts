// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { ContentRooftopInput } from '@/server/reports/comms/comm-content-metrics'
import type { CommContentRow } from '@/server/reports/comms/comm-content-reader'
import {
  CONTENT_CANDIDATE_IDS,
  CONTENT_HELD_DECISIONS,
  CONTENT_PROMOTED_IDS,
  CONTENT_PROMOTED_SPECS,
  CONTENT_SPEC_KEYS,
  CommContentMetricError,
  buildHeldSpec,
  evaluateCommContentMetrics,
  sw021,
  sw142,
  sw145,
  sw149,
  sw150,
} from '@/server/reports/comms/comm-content-metrics'
import { readCommContent } from '@/server/reports/comms/comm-content-reader'
import { DEALER_IDENTITY } from '@/server/reports/comms/comm-family-contract'

const REPO = path.resolve(__dirname, '..', '..')
const COMM_DIR = process.env.HALO_COMM_DIR ?? '/tmp/halo-295-comm-20260901'
const HAVE = fs.existsSync(path.join(COMM_DIR, 'capture-manifest.json'))

function row(p: Partial<CommContentRow>): CommContentRow {
  return {
    comm_token: 'c',
    thread_token: 't',
    rep_token: 'r',
    person_token: 'p',
    direction: 'Outbound',
    channel: 'Text',
    activity_date: '2026-08-24',
    activity_iso: '2026-08-24T09:00:00-04:00',
    content_present: true,
    word_count: 20,
    has_unfilled_merge_tag: false,
    is_link_only: false,
    body_identity_hash: 'h',
    ...p,
  }
}

describe('Gate 4E content evaluators — deterministic, literal denominators', () => {
  it('SW-142: unfilled merge tag / eligible written; Logged Call + Inbound excluded', () => {
    const rows = [
      row({ has_unfilled_merge_tag: true }),
      row({}),
      row({}),
      row({ channel: 'Logged Call', has_unfilled_merge_tag: true }), // excluded (not written)
      row({ direction: 'Inbound', has_unfilled_merge_tag: true }), // excluded (inbound)
    ]
    const c = sw142(rows)
    expect(c.numerator).toBe(1)
    expect(c.denominator).toBe(3)
  })

  it('SW-149: reps with mean word count < 15 (no floor; low sample disclosed)', () => {
    const rows = [
      row({ rep_token: 'A', word_count: 10 }),
      row({ rep_token: 'A', word_count: 10 }),
      row({ rep_token: 'B', word_count: 20 }),
      row({ rep_token: 'B', word_count: 20 }),
    ]
    const c = sw149(rows)
    expect(c.numerator).toBe(1)
    expect(c.denominator).toBe(2)
    expect(c.low_sample_flagged).toBe(1) // rep A has 2 (<5) messages — disclosed, not excluded
  })

  it('SW-150: reps whose EVERY written message is link-only', () => {
    const rows = [
      row({ rep_token: 'A', is_link_only: true }),
      row({ rep_token: 'A', is_link_only: true }),
      row({ rep_token: 'B', is_link_only: true }),
      row({ rep_token: 'B', is_link_only: false }),
    ]
    const c = sw150(rows)
    expect(c.numerator).toBe(1)
    expect(c.denominator).toBe(2)
  })

  it('SW-145: (body,day) groups sent to > 5 distinct customers', () => {
    const broadcast = Array.from({ length: 6 }, (_, i) =>
      row({ person_token: `p${i}`, body_identity_hash: 'X' }),
    )
    const other = [row({ person_token: 'q', body_identity_hash: 'Y' })]
    const c = sw145([...broadcast, ...other])
    expect(c.numerator).toBe(1) // group X reached 6 (>5) distinct customers
    expect(c.denominator).toBe(2) // two distinct (body,day) groups
  })

  it('SW-145: same body split across two days is two groups (never over-counts a day)', () => {
    const day1 = Array.from({ length: 6 }, (_, i) =>
      row({
        activity_date: '2026-08-24',
        person_token: `p${i}`,
        body_identity_hash: 'X',
      }),
    )
    const day2 = Array.from({ length: 3 }, (_, i) =>
      row({
        activity_date: '2026-08-25',
        person_token: `d2p${i}`,
        body_identity_hash: 'X',
      }),
    )
    const c = sw145([...day1, ...day2])
    expect(c.numerator).toBe(1) // only day1 exceeded 5
    expect(c.denominator).toBe(2)
  })

  it('SW-021: reps whose modal identical body covers > 70% of distinct leads', () => {
    const repA = [
      row({ rep_token: 'A', thread_token: 't1', body_identity_hash: 'X' }),
      row({ rep_token: 'A', thread_token: 't2', body_identity_hash: 'X' }),
      row({ rep_token: 'A', thread_token: 't3', body_identity_hash: 'X' }),
    ]
    const repB = [
      row({ rep_token: 'B', thread_token: 'u1', body_identity_hash: 'M' }),
      row({ rep_token: 'B', thread_token: 'u2', body_identity_hash: 'N' }),
      row({ rep_token: 'B', thread_token: 'u3', body_identity_hash: 'O' }),
    ]
    const c = sw021([...repA, ...repB])
    expect(c.numerator).toBe(1) // rep A: 3/3 = 100% > 70%
    expect(c.denominator).toBe(2)
  })

  it('SW-021: a single-lead rep is a LITERAL degenerate flag (disclosed, not excluded)', () => {
    const c = sw021([
      row({ rep_token: 'A', thread_token: 't1', body_identity_hash: 'X' }),
    ])
    expect(c.numerator).toBe(1) // 1/1 = 100% > 70% (literal)
    expect(c.denominator).toBe(1)
    expect(c.low_sample_flagged).toBe(1) // disclosed as degenerate low sample
  })
})

describe('Gate 4E evaluation — all-three-rooftops, fail-closed, dealer isolation', () => {
  const lineage = {
    capture_id: 'VIN-COMM-WEEKLY-20260831-21043',
    raw_sha256: 'x',
    manifest_sha256: 'y',
    transform_version: 'v',
    transform_hash: 'h',
    source_url: 's',
    report_url: 'r',
    family: 'enhanced_sales_communication_log_weekly',
    captured_at: '2026-08-31T00:00:00-04:00',
  }
  const okContent = (): Array<CommContentRow> => [
    row({
      rep_token: 'A',
      thread_token: 't1',
      body_identity_hash: 'X',
      word_count: 30,
    }),
    row({
      rep_token: 'B',
      thread_token: 't2',
      body_identity_hash: 'Y',
      word_count: 30,
    }),
  ]
  const rt = (
    dealer: string,
    content: Array<CommContentRow>,
  ): ContentRooftopInput => ({
    dealer_id: dealer,
    profile: dealer,
    dealer_name: dealer,
    reporting_period: {
      start: '2026-08-24',
      end: '2026-08-30',
      timezone: 'America/New_York',
    },
    content,
    lineage,
  })

  it('produces 5 promoted IDs x 3 rooftops = 15 cells + 70 held', () => {
    const e = evaluateCommContentMetrics([
      rt('21043', okContent()),
      rt('21044', okContent()),
      rt('21047', okContent()),
    ])
    expect(e.cells.length).toBe(15)
    expect(e.held.length).toBe(70)
    expect([...e.evaluated_ids].sort()).toEqual(
      [...CONTENT_PROMOTED_IDS].sort(),
    )
    // every promoted ID has a cell at every rooftop (all-three)
    for (const id of CONTENT_PROMOTED_IDS)
      for (const d of ['21043', '21044', '21047'])
        expect(
          e.cells.some((c) => c.metric_id === id && c.dealer_id === d),
        ).toBe(true)
  })

  it('fails closed (unresolved, not zero) when a rooftop has an empty eligible population', () => {
    expect(() =>
      evaluateCommContentMetrics([
        rt('21043', okContent()),
        rt('21044', []),
        rt('21047', okContent()),
      ]),
    ).toThrow(CommContentMetricError)
  })

  it('dealer isolation: a red flag at one rooftop does not appear at another', () => {
    const flagged = [
      row({
        rep_token: 'A',
        thread_token: 't1',
        body_identity_hash: 'X',
        word_count: 3,
      }),
    ]
    const e = evaluateCommContentMetrics([
      rt('21043', flagged), // SW-149: 1/1 flagged
      rt('21044', okContent()), // SW-149: 0/2
      rt('21047', okContent()),
    ])
    const honda = e.cells.find(
      (c) => c.metric_id === 'SW-149' && c.dealer_id === '21043',
    )!
    const nissan = e.cells.find(
      (c) => c.metric_id === 'SW-149' && c.dealer_id === '21044',
    )!
    expect(honda.numerator).toBe(1)
    expect(nissan.numerator).toBe(0)
  })
})

describe('Gate 4E disposition table integrity', () => {
  it('exactly 75 unique candidates = 5 promoted + 70 held', () => {
    expect(new Set(CONTENT_CANDIDATE_IDS).size).toBe(75)
    expect(CONTENT_PROMOTED_SPECS.length).toBe(5)
    expect(CONTENT_HELD_DECISIONS.length).toBe(70)
    expect(CONTENT_PROMOTED_IDS).toEqual([
      'SW-021',
      'SW-142',
      'SW-145',
      'SW-149',
      'SW-150',
    ])
  })
  it('every held decision has a category and a hold reason; none is a promote', () => {
    for (const d of CONTENT_HELD_DECISIONS) {
      expect(d.disposition).toBe('hold')
      expect(d.hold_reason && d.hold_reason.length > 0).toBe(true)
      expect(d.category).not.toBe('definition_exact_deterministic_now')
    }
  })
})

describe('Gate 4E-R1 — every candidate row carries a schema-complete spec', () => {
  const matrix = JSON.parse(
    fs.readFileSync(
      path.join(REPO, 'docs/halo/contract/sw295-comm-content-matrix.json'),
      'utf8',
    ),
  ) as {
    spec_schema: Array<string>
    rows: Array<{
      metric_id: string
      disposition: string
      spec: Record<string, unknown>
    }>
  }
  const REQUIRED = [...CONTENT_SPEC_KEYS].sort()
  const STRING_KEYS = REQUIRED.filter((k) => k !== 'source_fields')

  it('the derived spec schema is exactly 14 keys and matches the committed matrix', () => {
    expect(CONTENT_SPEC_KEYS.length).toBe(14)
    expect([...matrix.spec_schema].sort()).toEqual(REQUIRED)
  })

  it('all 75 rows have a spec with EXACTLY the required keys and correct types', () => {
    expect(matrix.rows.length).toBe(75)
    for (const r of matrix.rows) {
      expect(r.spec, `${r.metric_id} has spec`).toBeTruthy()
      expect(Object.keys(r.spec).sort(), `${r.metric_id} keys`).toEqual(
        REQUIRED,
      )
      for (const k of STRING_KEYS)
        expect(typeof r.spec[k], `${r.metric_id}.${k} is string`).toBe('string')
      expect(
        Array.isArray(r.spec.source_fields),
        `${r.metric_id}.source_fields is array`,
      ).toBe(true)
    }
  })

  it('HOLD specs cannot masquerade as executable/promoted definitions', () => {
    const promoted = new Set(CONTENT_PROMOTED_IDS as ReadonlyArray<string>)
    for (const r of matrix.rows) {
      if (r.disposition !== 'HOLD') continue
      expect(promoted.has(r.metric_id)).toBe(false)
      expect(r.spec.numerator).toBe('unresolved (held)')
      expect(r.spec.denominator).toBe('unresolved (held)')
      expect(r.spec.detection_threshold).toBe('unresolved (held)')
      expect(r.spec.baseline_basis).toBe('unresolved (held)')
      expect(r.spec.rank_direction).toBe('not_applicable (held)')
    }
  })

  it('PROMOTE specs carry executable (non-held) numerators', () => {
    const promoted = new Set(CONTENT_PROMOTED_IDS as ReadonlyArray<string>)
    for (const r of matrix.rows) {
      if (r.disposition !== 'PROMOTE') continue
      expect(promoted.has(r.metric_id)).toBe(true)
      expect(r.spec.numerator).not.toBe('unresolved (held)')
      expect(r.spec.denominator).not.toBe('unresolved (held)')
    }
  })

  it('buildHeldSpec is schema-complete and non-executable for a bare decision', () => {
    const s = buildHeldSpec(
      {
        metric_id: 'SW-999',
        category: 'outside_accepted_evidence',
        disposition: 'hold',
      },
      {
        condition: 'x',
        period_grain_population: '',
        limitations_false_positives: '',
        minimum_history: '',
      },
    )
    expect(Object.keys(s).sort()).toEqual(REQUIRED)
    expect(s.numerator).toBe('unresolved (held)')
    expect(s.population).toBe('unresolved (held)') // empty catalog ⇒ explicit unresolved
  })
})

describe('Gate 4E committed artifacts reconcile', () => {
  const matrix = JSON.parse(
    fs.readFileSync(
      path.join(REPO, 'docs/halo/contract/sw295-comm-content-matrix.json'),
      'utf8',
    ),
  )
  const recon = JSON.parse(
    fs.readFileSync(
      path.join(
        REPO,
        'docs/halo/evidence/m1r/comms/comm-content-portfolio-reconciliation.json',
      ),
      'utf8',
    ),
  )
  const comm = JSON.parse(
    fs.readFileSync(
      path.join(
        REPO,
        'docs/halo/evidence/m1r/comms/comm-portfolio-reconciliation.json',
      ),
      'utf8',
    ),
  )

  it('matrix: 75 candidates, 5 promote, 70 hold, 225 cells, 15 evaluated', () => {
    expect(matrix.totals).toMatchObject({
      candidates: 75,
      promoted: 5,
      held: 70,
      rooftop_cells: 225,
      evaluated_cells: 15,
    })
    expect(
      Object.values(matrix.category_tally).reduce(
        (a: number, b) => a + (b as number),
        0,
      ),
    ).toBe(75)
  })

  it('reconciliation derives 36 -> 51 / 834 (17/278 per rooftop) from the committed 4C2 base', () => {
    expect(recon.prior_evaluated).toBe(comm.evaluated) // 36, not hardcoded
    expect(recon.content_evaluated).toBe(15)
    expect(recon.evaluated).toBe(51)
    expect(recon.unresolved).toBe(834)
    expect(recon.evaluated + recon.unresolved).toBe(recon.required_cells)
    for (const d of ['21043', '21044', '21047']) {
      expect(recon.by_dealer[d].evaluated).toBe(17)
      expect(recon.by_dealer[d].unresolved).toBe(278)
    }
    expect(recon.candidate_partition).toMatchObject({
      candidates_75: 75,
      prior_evaluated_per_rooftop: 12,
      residual: 208,
      reconciles_to: 295,
    })
  })
})

// Byte-backed: recompute two metrics for Honda from the REAL restricted capture and assert they
// match the committed ledger — proving the aggregate evidence is grounded in the actual data.
describe.skipIf(!HAVE)(
  'Gate 4E is byte-backed by the real Honda capture',
  () => {
    it('SW-142 and SW-149 recomputed from raw bytes match the committed ledger cells', () => {
      const manifestPath = path.join(COMM_DIR, 'capture-manifest.json')
      const manifestSha = createHash('sha256')
        .update(fs.readFileSync(manifestPath))
        .digest('hex')
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        source_url: string
        report_url: string
        requested_period: { start: string; end: string; timezone: string }
        files: Array<
          Record<string, string> & { dealer_id: string; filename: string }
        >
      }
      const entry = manifest.files.find((f) => f.dealer_id === '21043')!
      const identity = (
        DEALER_IDENTITY as Record<
          string,
          { dealer_id: string; dealer_name: string }
        >
      )[entry.profile]
      const { rows } = readCommContent({
        buf: fs.readFileSync(path.join(COMM_DIR, entry.filename)),

        entry: entry as any,
        manifestSha,
        period: manifest.requested_period,
        sourceUrl: manifest.source_url,
        reportUrl: manifest.report_url,
        dealerName: identity.dealer_name,
      })
      const c142 = sw142(rows)
      const c149 = sw149(rows)

      const ledger = JSON.parse(
        fs.readFileSync(
          path.join(
            REPO,
            'docs/halo/evidence/m1r/comms/comm-content-evaluation-ledger.json',
          ),
          'utf8',
        ),
      ) as {
        cells: Array<{
          metric_id: string
          dealer_id: string
          numerator: number
          denominator: number
        }>
      }
      const led142 = ledger.cells.find(
        (c) => c.metric_id === 'SW-142' && c.dealer_id === '21043',
      )!
      const led149 = ledger.cells.find(
        (c) => c.metric_id === 'SW-149' && c.dealer_id === '21043',
      )!
      expect(c142.numerator).toBe(led142.numerator)
      expect(c142.denominator).toBe(led142.denominator)
      expect(c149.numerator).toBe(led149.numerator)
      expect(c149.denominator).toBe(led149.denominator)
    })
  },
)
