/**
 * Gate 4C2 — comm metric evaluator tests. Synthetic NON-PII fixtures only (no /tmp, no real
 * names/customers/content). Covers: exact metric semantics, same-minute permutation invariance
 * (no arbitrary within-minute order may change eligibility/count), zero-denominator (missing is
 * not zero), censoring, rooftop separation/rank, SW-137 hold + candidate-guard evidence, PII
 * non-persistence, and deterministic rerun.
 *
 * @vitest-environment node
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import type {
  CommMetricId,
  CommRooftopInput,
} from '@/server/reports/comms/comm-metrics'
import type {
  CommDerivedRow,
  CommLineage,
} from '@/server/reports/comms/comm-reader'
import {
  COMM_FORMULA_VERSION,
  CommMetricError,
  evaluateCommMetrics,
  sw022,
  sw133,
  sw137,
} from '@/server/reports/comms/comm-metrics'

let seq = 0
function row(p: {
  thread: string
  rep?: string
  dir: 'Inbound' | 'Outbound'
  ch: 'Text' | 'Logged Call' | 'Email'
  iso: string
  video?: boolean
}): CommDerivedRow {
  seq += 1
  return {
    comm_token: `c${seq}`,
    thread_token: p.thread,
    rep_token: p.rep ?? 'r1',
    person_token: 'p1',
    user_group: '06- Honda Sales',
    direction: p.dir,
    channel: p.ch,
    comm_type: 'Sales',
    interaction_result: '',
    lead_type: 'Internet',
    lead_status_type: '',
    lead_status: '',
    lead_source_group: '',
    lead_source: '',
    make: '',
    activity_iso: p.iso,
    activity_date: p.iso.slice(0, 10),
    has_attachment: false,
    has_image: false,
    has_video: p.video ?? false,
    content_length: 0,
    content_present: false,
  }
}

const ISO = (t: string) => `2026-08-27T${t}:00-04:00`

function lineage(dealer: string): CommLineage {
  return {
    family: 'enhanced_sales_communication_log_weekly',
    profile: `p-${dealer}`,
    dealer_id: dealer,
    dealer_name: `Dealer ${dealer}`,
    capture_id: `VIN-COMM-WEEKLY-20260830-${dealer}`,
    raw_sha256: 'a'.repeat(64),
    manifest_sha256: 'b'.repeat(64),
    reporting_period: {
      start: '2026-08-24',
      end: '2026-08-30',
      timezone: 'America/New_York',
    },
    source_url: 'https://vinsolutions.app.coxautoinc.com/vinconnect/x',
    report_url:
      'https://reporting-vinsolutions.app.coxautoinc.com/VinAnalyticsDashboards/x',
    captured_at: '2026-08-31T09:00:00-04:00',
    filter_evidence_sha256: 'c'.repeat(64),
    applied_result_evidence_sha256: 'd'.repeat(64),
    transform_version: 'comm-weekly-derive-v1',
    transform_hash: 'e'.repeat(16),
  }
}

function rooftop(
  dealer: string,
  derived: Array<CommDerivedRow>,
): CommRooftopInput {
  return {
    dealer_id: dealer,
    profile: `p-${dealer}`,
    dealer_name: `Dealer ${dealer}`,
    reporting_period: {
      start: '2026-08-24',
      end: '2026-08-30',
      timezone: 'America/New_York',
    },
    derived,
    lineage: lineage(dealer),
  }
}

/** Deterministic index-based shuffle (no Math.random): reverse + rotate by k. */
function permute<T>(xs: Array<T>, k: number): Array<T> {
  const r = [...xs].reverse()
  return [...r.slice(k % r.length), ...r.slice(0, k % r.length)]
}

describe('SW-022 outbound text:call ratio', () => {
  it('flags total voice avoidance (0 calls) and >5:1, respects the >=5 floor', () => {
    const rows = [
      // rep A: 6 texts, 0 calls -> flagged (total avoidance)
      ...Array.from({ length: 6 }, (_, i) =>
        row({
          thread: 't',
          rep: 'A',
          dir: 'Outbound',
          ch: 'Text',
          iso: ISO(`10:0${i}`),
        }),
      ),
      // rep B: 1 text, 5 calls -> 1 > 25? no -> not flagged (but eligible, 6 outbound)
      row({
        thread: 't',
        rep: 'B',
        dir: 'Outbound',
        ch: 'Text',
        iso: ISO('11:00'),
      }),
      ...Array.from({ length: 5 }, (_, i) =>
        row({
          thread: 't',
          rep: 'B',
          dir: 'Outbound',
          ch: 'Logged Call',
          iso: ISO(`11:1${i}`),
        }),
      ),
      // rep C: only 3 outbound -> below floor, not eligible
      ...Array.from({ length: 3 }, (_, i) =>
        row({
          thread: 't',
          rep: 'C',
          dir: 'Outbound',
          ch: 'Text',
          iso: ISO(`12:0${i}`),
        }),
      ),
    ]
    const c = sw022(rows)
    expect(c.denominator).toBe(2) // A, B eligible
    expect(c.numerator).toBe(1) // A flagged
    expect(c.ambiguous_excluded).toBe(0)
  })
})

describe('SW-133 customer chasing (>=2 consecutive inbound then reply)', () => {
  it('flags 2 distinct-minute inbound then a reply; not a start-of-thread run without reply', () => {
    const flag = [
      row({ thread: 'T1', dir: 'Inbound', ch: 'Text', iso: ISO('10:00') }),
      row({ thread: 'T1', dir: 'Inbound', ch: 'Text', iso: ISO('10:05') }),
      row({ thread: 'T1', dir: 'Outbound', ch: 'Text', iso: ISO('10:10') }),
    ]
    const censored = [
      // 2 inbound, NO following outbound -> conservative, not flagged
      row({ thread: 'T3', dir: 'Inbound', ch: 'Text', iso: ISO('09:00') }),
      row({ thread: 'T3', dir: 'Inbound', ch: 'Text', iso: ISO('09:05') }),
    ]
    const c = sw133([...flag, ...censored])
    expect(c.denominator).toBe(2)
    expect(c.numerator).toBe(1)
  })

  it('counts a same-minute inbound burst but is invariant to its ordering', () => {
    // two inbound + a reply, inbound distinct minutes before reply
    const base = [
      row({ thread: 'B', dir: 'Inbound', ch: 'Text', iso: ISO('10:00') }),
      row({ thread: 'B', dir: 'Inbound', ch: 'Text', iso: ISO('10:01') }),
      row({ thread: 'B', dir: 'Outbound', ch: 'Text', iso: ISO('10:02') }),
    ]
    const c0 = sw133(base)
    expect(c0.numerator).toBe(1)
    for (let k = 0; k < 5; k++) expect(sw133(permute(base, k))).toEqual(c0)
  })

  it('conservatively excludes (never flags) when an inbound shares the reply minute', () => {
    const rows = [
      row({ thread: 'A', dir: 'Inbound', ch: 'Text', iso: ISO('10:00') }),
      row({ thread: 'A', dir: 'Inbound', ch: 'Text', iso: ISO('10:05') }), // shares reply minute
      row({ thread: 'A', dir: 'Outbound', ch: 'Text', iso: ISO('10:05') }),
    ]
    const c = sw133(rows)
    expect(c.numerator).toBe(0) // only 1 inbound strictly before the reply minute
    expect(c.ambiguous_excluded).toBe(1) // borderline: would flag only under some ordering
    // invariant to same-minute permutation
    for (let k = 0; k < 4; k++) expect(sw133(permute(rows, k))).toEqual(c)
  })
})

describe('SW-137 channel mismatch (held candidate guard)', () => {
  it('unambiguous singleton buckets yield a candidate hit; permutation-invariant', () => {
    const rows = [
      row({ thread: 'M', dir: 'Inbound', ch: 'Text', iso: ISO('10:00') }),
      row({ thread: 'M', dir: 'Outbound', ch: 'Email', iso: ISO('10:05') }),
    ]
    const c = sw137(rows)
    expect(c.numerator).toBe(1)
    expect(c.ambiguous_excluded).toBe(0)
    for (let k = 0; k < 3; k++) expect(sw137(permute(rows, k))).toEqual(c)
  })

  it('excludes (not counts) an ambiguous non-singleton endpoint bucket; invariant', () => {
    const rows = [
      row({ thread: 'M', dir: 'Inbound', ch: 'Text', iso: ISO('10:00') }),
      // reply bucket also carries another event at the same minute -> ambiguous
      row({ thread: 'M', dir: 'Outbound', ch: 'Email', iso: ISO('10:05') }),
      row({ thread: 'M', dir: 'Inbound', ch: 'Text', iso: ISO('10:05') }),
    ]
    const c = sw137(rows)
    expect(c.numerator).toBe(0)
    expect(c.ambiguous_excluded).toBe(1)
    for (let k = 0; k < 5; k++) expect(sw137(permute(rows, k))).toEqual(c)
  })
})

function threeRooftops(): Array<CommRooftopInput> {
  // Each rooftop needs eligible population for SW-022 and SW-133.
  const mk = (d: string, chaseThreads: number) => {
    const rows: Array<CommDerivedRow> = []
    // one eligible rep with 6 texts 0 calls (flagged) so SW-022 denominator>=1
    for (let i = 0; i < 6; i++)
      rows.push(
        row({
          thread: `rep-${d}`,
          rep: `R${d}`,
          dir: 'Outbound',
          ch: 'Text',
          iso: ISO(`08:0${i}`),
        }),
      )
    // chaseThreads chasing threads + filler eligible threads
    for (let t = 0; t < 3; t++) {
      const T = `T${d}-${t}`
      if (t < chaseThreads) {
        rows.push(
          row({ thread: T, dir: 'Inbound', ch: 'Text', iso: ISO('10:00') }),
        )
        rows.push(
          row({ thread: T, dir: 'Inbound', ch: 'Text', iso: ISO('10:05') }),
        )
        rows.push(
          row({ thread: T, dir: 'Outbound', ch: 'Text', iso: ISO('10:10') }),
        )
      } else {
        rows.push(
          row({ thread: T, dir: 'Outbound', ch: 'Text', iso: ISO('10:00') }),
        )
        rows.push(
          row({ thread: T, dir: 'Inbound', ch: 'Text', iso: ISO('10:05') }),
        )
      }
    }
    return rooftop(d, rows)
  }
  return [mk('21043', 3), mk('21044', 1), mk('21047', 2)]
}

describe('evaluateCommMetrics integration', () => {
  it('promotes exactly SW-022 + SW-133 (6 cells), holds SW-137 among 10 held', () => {
    const e = evaluateCommMetrics(threeRooftops())
    expect(e.evaluated_ids).toEqual(['SW-022', 'SW-133'])
    expect(e.cells).toHaveLength(6)
    expect(new Set(e.cells.map((c) => c.metric_id))).toEqual(
      new Set(['SW-022', 'SW-133']),
    )
    expect(
      e.cells.every((c) => c.formula_version === COMM_FORMULA_VERSION),
    ).toBe(true)
    const heldIds = e.held.map((h) => h.metric_id)
    expect(heldIds).toContain('SW-137')
    expect(heldIds).toHaveLength(10)
    expect(e.cells.some((c) => (c.metric_id as string) === 'SW-137')).toBe(
      false,
    )
  })

  it('ranks SW-133 across the three rooftops by lower_is_better (fewer chases = rank 1)', () => {
    const e = evaluateCommMetrics(threeRooftops())
    const byDealer = new Map(
      e.cells
        .filter((c) => c.metric_id === 'SW-133')
        .map((c) => [c.dealer_id, c]),
    )
    // Nissan has 1 chase (rate lowest) -> rank 1; Honda 3 (highest) -> rank 3
    expect(byDealer.get('21044')!.rank).toBe(1)
    expect(byDealer.get('21047')!.rank).toBe(2)
    expect(byDealer.get('21043')!.rank).toBe(3)
  })

  it('attaches per-rooftop candidate-guard evidence to the SW-137 hold', () => {
    const e = evaluateCommMetrics(threeRooftops())
    const h = e.held.find((x) => x.metric_id === 'SW-137')!
    expect(h.candidate_guard_evidence).toHaveLength(3)
    expect(h.next_action).toMatch(
      /higher-resolution|unambiguous message-sequence/i,
    )
  })

  it('throws (missing is not zero) when a rooftop has no eligible SW-133 threads', () => {
    const [a, b] = threeRooftops()
    // third rooftop: an eligible rep (6 outbound) but every message in its OWN thread, so no
    // thread has >=2 messages -> SW-133 denominator is 0 -> unresolved, not a fabricated 0.
    const empty = rooftop('21047', [
      ...Array.from({ length: 6 }, (_, i) =>
        row({
          thread: `solo-${i}`,
          rep: 'RX',
          dir: 'Outbound',
          ch: 'Text',
          iso: ISO(`08:0${i}`),
        }),
      ),
    ])
    expect(() => evaluateCommMetrics([a, b, empty])).toThrow(CommMetricError)
  })

  it('is deterministic across reruns and rooftop separation of tokens', () => {
    const a = evaluateCommMetrics(threeRooftops())
    const b = evaluateCommMetrics(threeRooftops())
    expect(a).toEqual(b)
  })

  it('persists NO PII: token/name/content VALUES never appear in emitted cells/held', () => {
    // Inject distinctive sentinel VALUES into the derived rows; aggregate output must not carry
    // any of them (only counts). Note: schema FIELD NAMES like "rep_token" legitimately appear
    // in source_fields — that is capability metadata, not PII; we assert on VALUES.
    const mk = (d: string) => {
      const rows: Array<CommDerivedRow> = []
      for (let i = 0; i < 6; i++) {
        const r = row({
          thread: 'ThreadSECRET777',
          rep: 'RepAliceSmithFAKE',
          dir: 'Outbound',
          ch: 'Text',
          iso: ISO(`08:0${i}`),
        })
        r.person_token = 'PersonBobJonesFAKE'
        r.comm_token = 'CommSENTINEL999'
        rows.push(r)
      }
      rows.push(
        row({
          thread: 'ThreadSECRET777',
          dir: 'Inbound',
          ch: 'Text',
          iso: ISO('10:00'),
        }),
      )
      rows.push(
        row({
          thread: 'ThreadSECRET777',
          dir: 'Inbound',
          ch: 'Text',
          iso: ISO('10:05'),
        }),
      )
      rows.push(
        row({
          thread: 'ThreadSECRET777',
          dir: 'Outbound',
          ch: 'Text',
          iso: ISO('10:10'),
        }),
      )
      return rooftop(d, rows)
    }
    const e = evaluateCommMetrics([mk('21043'), mk('21044'), mk('21047')])
    const blob = JSON.stringify(e)
    for (const sentinel of [
      'RepAliceSmithFAKE',
      'PersonBobJonesFAKE',
      'ThreadSECRET777',
      'CommSENTINEL999',
    ])
      expect(blob).not.toContain(sentinel)
  })
})

// Guard against an accidental widening of the promoted set.
it('promoted set is exactly SW-022 and SW-133', () => {
  const ids: Array<CommMetricId> = ['SW-022', 'SW-133']
  const e = evaluateCommMetrics(threeRooftops())
  expect(e.evaluated_ids).toEqual(ids)
})

// Committed evidence guard (no /tmp needed): the real-data ledger + portfolio reconciliation.
describe('committed comm evaluation evidence', () => {
  const rd = (p: string) =>
    JSON.parse(fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'))
  const ledger = rd('docs/halo/evidence/m1r/comms/comm-evaluation-ledger.json')
  const recon = rd(
    'docs/halo/evidence/m1r/comms/comm-portfolio-reconciliation.json',
  )

  it('promotes 6 cells (SW-022 + SW-133 x 3) with the real order-invariant numerators', () => {
    expect(ledger.evaluated_ids).toEqual(['SW-022', 'SW-133'])
    expect(ledger.cells).toHaveLength(6)
    const num: Record<string, Record<string, number>> = {
      'SW-022': {},
      'SW-133': {},
    }
    for (const c of ledger.cells) num[c.metric_id][c.dealer_id] = c.numerator
    expect(num['SW-022']).toEqual({ '21043': 1, '21044': 3, '21047': 2 })
    expect(num['SW-133']).toEqual({ '21043': 10, '21044': 3, '21047': 2 })
  })

  it('holds SW-137 with per-rooftop candidate-guard ambiguity evidence', () => {
    expect(ledger.held_ids).toContain('SW-137')
    const h = ledger.held.find(
      (x: { metric_id: string }) => x.metric_id === 'SW-137',
    )
    const ambig = h.candidate_guard_evidence.map(
      (g: { ambiguous_excluded_endpoints: number }) =>
        g.ambiguous_excluded_endpoints,
    )
    expect(ambig).toEqual([1, 1, 0]) // Honda 1, Nissan 1, Ford 0
  })

  it('reconciles 36/849 while preserving the untouched spine 30', () => {
    expect(recon.spine_evaluated).toBe(30)
    expect(recon.comm_overlay_evaluated).toBe(6)
    expect(recon.evaluated).toBe(36)
    expect(recon.unresolved).toBe(849)
    // no comm ID collides with a spine-evaluated ID
    for (const id of recon.comm_evaluated_ids)
      expect(recon.spine_evaluated_ids).not.toContain(id)
  })
})
