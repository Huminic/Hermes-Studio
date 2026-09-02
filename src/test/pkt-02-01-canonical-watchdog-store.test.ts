// @vitest-environment node
/**
 * Canonical Semantic Watchdog InfoStore — full battery.
 *
 * Proves the versioned §7 canonical architecture (migration 5) end to end on a
 * DISPOSABLE dev Brain (profileRoot -> tmpdir; never ~/.hermes, never production):
 *   - empty-DB migration + legacy-DB coexistence;
 *   - PKT-02-01 canonical persist: exact facts/hashes, missing≠zero, reconstructed
 *     content hash == pinned, graph manifest, idempotent replay, forced rollback;
 *   - legacy→canonical backfill: row parity, canonical preference, legacy fallback,
 *     rollback path intact;
 *   - full-graph tamper detection across every child family (missing/extra/alter),
 *     metadata-not-in-content-hash tamper (grade approval), delivery-flag CHECKs,
 *     report module_run_ids ↔ link-set equality, version-bound parents;
 *   - generic genericity: a genuinely different second packet (disjoint metric set +
 *     packet_id) coexists in the same tables/API; fail-closed target authority; exact
 *     lifecycle/source/admission validation; immutable-parent collision; multiple
 *     findings per metric;
 *   - operational notification rows untouched.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  AlertSimulation,
  Evaluation,
  Finding,
  Observation,
  PacketRun,
} from '@/server/reports/packet/engine'
import type { CanonicalRunEnvelope } from '@/server/watchdog/canonical-watchdog-store'
import { executePacket } from '@/server/reports/packet/engine'
import { contentSha } from '@/server/reports/packet/store'
import { openBrain } from '@/server/brain-store'
import {
  persistPacketRun,
  readPacketRun,
} from '@/server/watchdog/packet-brain-store'
import { upsertFinding } from '@/server/watchdog/watchdog-store'
import {
  CanonicalWatchdogIntegrityError,
  CanonicalWatchdogStoreError,
  envelopeContentSha,
  persistCanonicalRunEnvelope,
  readCanonicalRun,
  readCanonicalRunRawForensic,
  reconstructedContentShaCanonical,
} from '@/server/watchdog/canonical-watchdog-store'
import {
  backfillLegacyToCanonical,
  persistPkt0201Canonical,
  readPkt0201Canonical,
} from '@/server/watchdog/pkt-02-01-canonical-adapter'
import {
  listWatchdogRuns,
  readWatchdogRun,
} from '@/server/watchdog/watchdog-run-store'

const REPO = path.resolve(__dirname, '..', '..')
const LEADS = process.env.HALO_LEADS_DIR ?? '/tmp/halo-295-leads-20260831'
const HAVE = fs.existsSync(
  path.join(LEADS, 'serra-honda-21043_leads_2026-08-24_2026-08-30.xlsx'),
)

const PROFILE = 'serra-honda'
const DEALER = '21043'
const PERIOD = '2026-08-24..2026-08-30'
const PINNED =
  'ae30c07ab4a6e9ae85461dc183c32b94e1ae50c11c5004ab2b51e4d9b965eba1'
const RUN_KEY =
  '119f77056b73c2c9a2a2a6d9ac9aa91afc63205ec674df9d01effe660e774aa7'
const MEASURED = ['SW-011', 'SW-012', 'SW-015']
const PENDING = ['SW-013', 'SW-014']

const makeRun = (): PacketRun =>
  executePacket({
    repoRoot: REPO,
    leadsDir: LEADS,
    asOf: '2026-09-02T06:51:10Z',
    engineVersion: 'pkt-exec-1',
  })
const persist = (run: PacketRun, profileRoot: string) =>
  persistPkt0201Canonical(run, { profileRoot, repoRoot: REPO })

const CANON_TABLES = [
  'watchdog_metric_definition',
  'watchdog_detection_rule',
  'watchdog_source_artifact',
  'watchdog_normalized_dataset',
  'watchdog_capability_snapshot',
  'watchdog_comparison_reference',
  'watchdog_grade_target',
  'watchdog_module_run',
  'watchdog_metric_observation',
  'watchdog_metric_evaluation',
  'watchdog_finding_metric_link',
  'watchdog_report_run',
  'watchdog_report_run_module_link',
  'watchdog_alert_candidate',
  'watchdog_finding',
]

let tmp: string
let profileRoot: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'canon-wd-'))
  profileRoot = path.join(tmp, PROFILE)
})
afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

// ── synthetic, packet-agnostic envelope (a genuinely DIFFERENT packet) ──
function syntheticEnvelope(
  over: Partial<CanonicalRunEnvelope> = {},
): CanonicalRunEnvelope {
  const profile = over.profile ?? PROFILE
  const dealer = over.dealer_id ?? DEALER
  const period = over.period ?? PERIOD
  const sha = 'a'.repeat(64)
  const lineage = {
    source_id: 'SRC-test_family-0001',
    source_sha256: sha,
    schema_contract_sha256: 'b'.repeat(64),
    receipt_sha256: 'c'.repeat(64),
    dealer_id: dealer,
    period,
    row_key: 'Row ID (10 unique)',
  }
  const observations: Array<Observation> = [
    {
      metric_id: 'SW-201',
      period,
      status: 'measured' as const,
      calculation_kind: 'rate',
      value: 0.75,
      unit: 'ratio_0_1',
      numerator: 3,
      denominator: 4,
      missing: 1,
      formula: 'n/d',
      source_fields: ['A', 'B'],
      source_lineage: lineage,
      confidence: 'medium',
      gradable: true,
      detail: { note: 'ok' },
      source_investigation: null,
    },
    {
      metric_id: 'SW-202',
      period,
      status: 'source_investigation_pending' as const,
      calculation_kind: 'rate',
      value: null,
      unit: 'ratio_0_1',
      numerator: null,
      denominator: null,
      missing: null,
      formula: null,
      source_fields: [],
      source_lineage: {
        ...lineage,
        source_sha256: null,
        receipt_sha256: null,
        row_key: null,
      },
      confidence: 'not_applicable',
      gradable: false,
      detail: null,
      source_investigation: {
        metric_id: 'SW-202',
        disposition: 'source_investigation_pending',
        searched_universe: ['A'],
        required: [],
        missing_fields: ['x'],
        evidence: 'held',
      },
    },
  ]
  const evaluations: Array<Evaluation> = [
    {
      metric_id: 'SW-201',
      period,
      gradable_state: 'graded' as const,
      threshold_id: 'TH-201',
      comparator: '>',
      threshold: 0,
      reference_id: 'CR-201',
      grade_target_id: 'GT-201',
      detection_rule: 'rate > 0',
      detection_fired: true,
      rating: 'breach' as const,
      reason: null,
    },
    {
      metric_id: 'SW-202',
      period,
      gradable_state: 'withheld' as const,
      threshold_id: null,
      comparator: null,
      threshold: null,
      reference_id: null,
      grade_target_id: 'GT-202',
      detection_rule: null,
      detection_fired: null,
      rating: 'withheld' as const,
      reason: 'pending',
    },
  ]
  const findings: Array<Finding> = [
    {
      metric_id: 'SW-201',
      period,
      severity: 'breach' as const,
      headline: 'SW-201 primary',
      detail: 'd1',
    },
    {
      metric_id: 'SW-201',
      period,
      severity: 'breach' as const,
      headline: 'SW-201 secondary',
      detail: 'd2',
    },
    {
      metric_id: 'SW-202',
      period,
      severity: 'pending' as const,
      headline: 'SW-202 held',
      detail: 'd3',
    },
  ]
  const alert_simulations: Array<AlertSimulation> = [
    {
      metric_id: 'SW-201',
      would_fire: true,
      channel: 'simulated_none' as const,
      delivered: false as const,
      unsent: true as const,
      message: '[SIMULATED — NOT SENT] SW-201',
    },
  ]
  const two_delta = {
    evidence_delta: {
      source_id: 'SRC-test_family-0001',
      source_sha256: sha,
      bytes: 100,
      schema_contract_sha256: 'b'.repeat(64),
      receipt_sha256: 'c'.repeat(64),
      dealer_id: dealer,
      period,
      row_reconciliation: '10 of 10',
      sales_only_proof: `10 rows: one rooftop Dealer ID=${dealer}; zero Service/Parts tokens in categorical columns; test`,
      missing_rule: 'blanks preserved',
    },
    meaning_delta: [],
  }
  const reconciliation = { ok: true, metrics: [] }
  const nd = `ND:test_family:${profile}:${dealer}:${period}:${sha.slice(0, 12)}`
  const said = `SA:test_family:${profile}:${dealer}:${period}:${sha.slice(0, 12)}`
  const base: CanonicalRunEnvelope = {
    profile,
    packet_id: 'PKT-TEST-COEX',
    module: 9,
    dealer_id: dealer,
    period,
    run_key: over.run_key ?? 'testrun-coex-0001',
    as_of: '2026-09-02T00:00:00Z',
    engine_version: 'test-1',
    binding_sha256: 'd'.repeat(64),
    source_sha256: sha,
    content_sha256: '',
    acceptance_state: 'packet_accepted',
    definition_version: '1.0.0',
    reference_version: '1.0.0',
    target_version: '1.0.0',
    expected_metric_ids: ['SW-201', 'SW-202'],
    measured_metric_ids: ['SW-201'],
    lifecycle_partition: {
      accepted_measured_ids: ['SW-201'],
      accepted_disposition_only_ids: [],
      rejected_ids: [],
      source_investigation_pending_ids: ['SW-202'],
    },
    observations,
    evaluations,
    findings,
    alert_simulations,
    two_delta,
    reconciliation,
    metric_definitions: [
      {
        metric_id: 'SW-201',
        metric_version: '1.0.0',
        module: 9,
        calculation_kind: 'rate',
        unit: 'ratio_0_1',
        gradable: true,
        definition_status: 'accepted',
        formula: 'n/d',
        required_fields: ['A', 'B'],
        required_sources: ['SRC-test_family-0001'],
      },
      {
        metric_id: 'SW-202',
        metric_version: '1.0.0',
        module: 9,
        calculation_kind: 'rate',
        unit: 'ratio_0_1',
        gradable: false,
        definition_status: 'accepted',
      },
    ],
    source_artifacts: [
      {
        source_artifact_id: said,
        family: 'test_family',
        source_type: 'test',
        source_sha256: sha,
        dealer_id: dealer,
        period,
        dealer_period_result: 'admitted',
        admission_receipt: { proof: 'x' },
        schema_contract_sha256: 'b'.repeat(64),
        receipt_sha256: 'c'.repeat(64),
        bytes: 100,
        row_count: 10,
      },
    ],
    normalized_datasets: [
      {
        normalized_dataset_id: nd,
        source_artifact_id: said,
        profile,
        dealer_id: dealer,
        period,
        normalized_sha256: sha,
        filter_spec: 'Sales-only',
        timezone: 'America/New_York',
      },
    ],
    detection_rules: [
      {
        detection_rule_id: 'DR-SW-201-1.0.0',
        metric_id: 'SW-201',
        metric_version: '1.0.0',
        condition: 'rate > 0',
        comparator: '>',
        threshold: 0,
        approval_state: 'approved',
        status: 'active',
      },
    ],
    grade_targets: [
      {
        grade_target_id: 'GT-201',
        target_version: '1.0.0',
        metric_id: 'SW-201',
        metric_version: '1.0.0',
        basis: 'operator_potential',
        value_or_range: '> 0',
        approval_state: 'approved',
        status: 'active',
        compatibility_result: 'compatible',
      },
      {
        grade_target_id: 'GT-202',
        target_version: '1.0.0',
        metric_id: 'SW-202',
        metric_version: '1.0.0',
        basis: 'dealer_history',
        value_or_range: 'pending',
        approval_state: 'unresolved',
        status: 'draft',
        compatibility_result: 'unresolved',
      },
    ],
    comparison_references: [
      {
        reference_id: 'CR-201',
        reference_version: '1.0.0',
        metric_id: 'SW-201',
        metric_version: '1.0.0',
        basis: 'operator_potential',
        approval_state: 'reference_only',
        status: 'active',
      },
    ],
    finding_specs: [
      {
        finding_key: 'f-201-a',
        metric_id: 'SW-201',
        period,
        severity: 'breach',
        headline: 'SW-201 primary',
        detail: 'd1',
        priority: 'high',
      },
      {
        finding_key: 'f-201-b',
        metric_id: 'SW-201',
        period,
        severity: 'breach',
        headline: 'SW-201 secondary',
        detail: 'd2',
        priority: 'high',
      },
      {
        finding_key: 'f-202',
        metric_id: 'SW-202',
        period,
        severity: 'pending',
        headline: 'SW-202 held',
        detail: 'd3',
        priority: 'medium',
      },
    ],
    report_run: {
      report_run_id: 'RR:testrun-coex-0001',
      report_lineage: two_delta,
      delivery_state: 'undelivered',
    },
    sales_only_admission: {
      proof: two_delta.evidence_delta.sales_only_proof,
      dealer_id: dealer,
      zero_service_parts: true,
    },
    dataset_id_by_metric: { 'SW-201': nd, 'SW-202': null },
    ...over,
  }
  base.content_sha256 = envelopeContentSha(base)
  return base
}

function tables(pr: string): Array<string> {
  const h = openBrain(PROFILE, { profileRoot: pr })
  return h
    .all<{
      name: string
    }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'watchdog_%' ORDER BY name`,
    )
    .map((r) => r.name)
}

// ── migration + genericity (no real leads needed) ────────────────────

describe('canonical migration + genericity', () => {
  it('migration 5 creates the full canonical graph on an empty DB', () => {
    const h = openBrain(PROFILE, { profileRoot })
    expect(h.schemaVersion).toBe(5)
    for (const t of CANON_TABLES) expect(tables(profileRoot)).toContain(t)
  })

  it('coexists with the operational watchdog_finding store (never a competing table)', () => {
    upsertFinding(
      {
        key: 'op1',
        profile: PROFILE,
        rule_id: 'r',
        category: 'inventory' as never,
        priority: 'low' as never,
        issue: 'i',
        name: 'n',
        details: 'd',
        evidence: {},
      } as never,
      1,
      { profileRoot },
    )
    const h = openBrain(PROFILE, { profileRoot })
    expect(
      h.get<{ n: number }>(`SELECT COUNT(*) n FROM watchdog_finding`)!.n,
    ).toBe(1)
  })

  it('a genuinely different second packet (disjoint metrics + packet_id) coexists', () => {
    const env = syntheticEnvelope()
    const res = persistCanonicalRunEnvelope(env, { profileRoot })
    expect(res.changed).toBe(true)
    const before = tables(profileRoot).length
    const stored = readCanonicalRun(env.run_key, {
      profile: PROFILE,
      profileRoot,
    })!
    expect(stored.packet_id).toBe('PKT-TEST-COEX')
    expect(stored.observations.map((o) => o.metric_id).sort()).toEqual([
      'SW-201',
      'SW-202',
    ])
    // no new tables created by a second packet
    expect(tables(profileRoot).length).toBe(before)
  })

  it('supports MULTIPLE findings per metric/run (two SW-201 findings coexist)', () => {
    const env = syntheticEnvelope()
    persistCanonicalRunEnvelope(env, { profileRoot })
    const h = openBrain(PROFILE, { profileRoot })
    const n = h.get<{ n: number }>(
      `SELECT COUNT(*) n FROM watchdog_finding_metric_link WHERE run_key = ? AND metric_id = 'SW-201'`,
      env.run_key,
    )!.n
    expect(n).toBe(2)
    const stored = readCanonicalRun(env.run_key, {
      profile: PROFILE,
      profileRoot,
    })!
    expect(
      stored.findings.filter((f) => f.metric_id === 'SW-201'),
    ).toHaveLength(2)
  })

  it('multi-finding content order is reconstructed independent of finding_key order', () => {
    // finding_keys in REVERSE lexical order of the content array; content_ordinal (not
    // finding_key) must drive reconstruction so the content hash still reconstructs.
    const env = syntheticEnvelope()
    env.finding_specs = [
      { ...env.finding_specs[0], finding_key: 'f-201-z' }, // content pos 0
      { ...env.finding_specs[1], finding_key: 'f-201-a' }, // content pos 1
      { ...env.finding_specs[2], finding_key: 'f-202-m' },
    ]
    // content_sha256 unchanged (findings array content/order unchanged)
    persistCanonicalRunEnvelope(env, { profileRoot })
    expect(
      reconstructedContentShaCanonical(env.run_key, {
        profile: PROFILE,
        profileRoot,
      }),
    ).toBe(env.content_sha256)
    // read verifies the full graph (would throw on any order-driven divergence)
    const stored = readCanonicalRun(env.run_key, {
      profile: PROFILE,
      profileRoot,
    })!
    expect(
      stored.findings.filter((f) => f.metric_id === 'SW-201'),
    ).toHaveLength(2)
  })

  it('fail-closed: a non-null grade_target with no supplied authority is rejected', () => {
    const env = syntheticEnvelope({ grade_targets: [] })
    expect(() => persistCanonicalRunEnvelope(env, { profileRoot })).toThrow(
      /target authority|grade_target/i,
    )
  })

  it('fail-closed: a graded evaluation against a non-approved target is rejected', () => {
    const env = syntheticEnvelope()
    env.grade_targets = env.grade_targets.map((g) =>
      g.grade_target_id === 'GT-201'
        ? { ...g, approval_state: 'unresolved' }
        : g,
    )
    env.content_sha256 = envelopeContentSha(env)
    expect(() => persistCanonicalRunEnvelope(env, { profileRoot })).toThrow(
      /non-approved target/,
    )
  })

  it('fail-closed: Sales-only admission is required (zero_service_parts must be true)', () => {
    const env = syntheticEnvelope()
    env.sales_only_admission = {
      ...env.sales_only_admission,
      zero_service_parts: false,
    }
    expect(() => persistCanonicalRunEnvelope(env, { profileRoot })).toThrow(
      /zero_service_parts/,
    )
  })

  it('fail-closed: an admitted artifact missing its admission_receipt is rejected', () => {
    const env = syntheticEnvelope()
    env.source_artifacts = [
      { ...env.source_artifacts[0], admission_receipt: null },
    ]
    expect(() => persistCanonicalRunEnvelope(env, { profileRoot })).toThrow(
      /admission_receipt/,
    )
  })

  it('fail-closed: lifecycle partition non-exclusive / union != expected is rejected', () => {
    const dup = syntheticEnvelope()
    dup.lifecycle_partition = {
      accepted_measured_ids: ['SW-201'],
      rejected_ids: ['SW-201'],
      source_investigation_pending_ids: ['SW-202'],
    }
    expect(() => persistCanonicalRunEnvelope(dup, { profileRoot })).toThrow(
      /not exclusive/,
    )
    const gap = syntheticEnvelope()
    gap.lifecycle_partition = { accepted_measured_ids: ['SW-201'] }
    expect(() => persistCanonicalRunEnvelope(gap, { profileRoot })).toThrow(
      /union != expected|no bucket/,
    )
  })

  it('fail-closed: a dataset referencing a missing source artifact is rejected', () => {
    const env = syntheticEnvelope()
    env.normalized_datasets = [
      { ...env.normalized_datasets[0], source_artifact_id: 'SA:missing' },
    ]
    expect(() => persistCanonicalRunEnvelope(env, { profileRoot })).toThrow(
      /not provided/,
    )
  })

  it('immutable-parent collision: same definition key with a different value fails', () => {
    const a = syntheticEnvelope()
    persistCanonicalRunEnvelope(a, { profileRoot })
    // second run, same metric definition KEY (SW-201@1.0.0) but a DIFFERENT formula
    const b = syntheticEnvelope({
      run_key: 'testrun-coex-0002',
      report_run: {
        report_run_id: 'RR:testrun-coex-0002',
        report_lineage: a.two_delta,
        delivery_state: 'undelivered',
      },
    })
    b.metric_definitions = b.metric_definitions.map((d) =>
      d.metric_id === 'SW-201' ? { ...d, formula: 'DIFFERENT' } : d,
    )
    b.content_sha256 = envelopeContentSha(b)
    expect(() => persistCanonicalRunEnvelope(b, { profileRoot })).toThrow(
      /immutable-parent collision/,
    )
  })

  it('receipt distinguishes inserted from already-verified shared parents', () => {
    const a = syntheticEnvelope()
    persistCanonicalRunEnvelope(a, { profileRoot })
    // identical shared parents on a second run -> verified, not re-inserted
    const b = syntheticEnvelope({
      run_key: 'testrun-coex-0003',
      report_run: {
        report_run_id: 'RR:testrun-coex-0003',
        report_lineage: a.two_delta,
        delivery_state: 'undelivered',
      },
    })
    b.content_sha256 = envelopeContentSha(b)
    const res = persistCanonicalRunEnvelope(b, { profileRoot })
    expect(res.rows.metric_definition).toBe(0)
    expect(res.verified.metric_definition).toBe(2)
    expect(res.rows.observation).toBe(2) // run-scoped rows still inserted
  })
})

// ── real PKT-02-01 canonical proof ───────────────────────────────────

describe.runIf(HAVE)('PKT-02-01 canonical persistence', () => {
  it('persists the full graph, reconstructs the PINNED content hash, records graph sha', () => {
    const run = makeRun()
    expect(run.run_key).toBe(RUN_KEY)
    const res = persist(run, profileRoot)
    expect(res.changed).toBe(true)
    expect(res.rows).toEqual({
      module_run: 1,
      metric_definition: 5,
      detection_rule: 3,
      source_artifact: 1,
      normalized_dataset: 1,
      grade_target: 5,
      comparison_reference: 3,
      observation: 5,
      evaluation: 5,
      finding: 5,
      finding_metric_link: 5,
      report_run: 1,
      alert_candidate: 3,
    })
    expect(res.graphSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(
      reconstructedContentShaCanonical(run.run_key, {
        profile: PROFILE,
        profileRoot,
      }),
    ).toBe(PINNED)
  })

  it('preserves exact PKT-02-01 facts (SW-011/012/015 measured, SW-013/014 held)', () => {
    const run = makeRun()
    persist(run, profileRoot)
    const s = readPkt0201Canonical(run.run_key, { profileRoot })!
    const o11 = s.observations.find((o) => o.metric_id === 'SW-011')!
    expect([o11.value, o11.numerator, o11.denominator, o11.missing]).toEqual([
      6, 27, 76, 49,
    ])
    const o15 = s.observations.find((o) => o.metric_id === 'SW-015')!
    expect([o15.value, o15.numerator, o15.denominator]).toEqual([0.5, 2, 4])
    const o12 = s.observations.find((o) => o.metric_id === 'SW-012')!
    expect(o12.numerator).toBe(15)
    expect(o12.denominator).toBe(76)
    for (const id of PENDING) {
      const o = s.observations.find((x) => x.metric_id === id)!
      expect(o.value).toBeNull()
      expect(o.numerator).toBeNull()
      expect(o.denominator).toBeNull()
    }
    // alerts exactly SW-011/012/015, inert
    expect(s.alert_candidates.map((a) => a.metric_id).sort()).toEqual(MEASURED)
    for (const a of s.alert_candidates) {
      expect(a.delivered).toBe(false)
      expect(a.unsent).toBe(true)
      expect(a.channel).toBe('simulated_none')
    }
  })

  it('no unapproved target makes a metric gradable or graded (SW-013/014)', () => {
    const run = makeRun()
    persist(run, profileRoot)
    const s = readPkt0201Canonical(run.run_key, { profileRoot })!
    const h = openBrain(PROFILE, { profileRoot })
    for (const id of PENDING) {
      const o = s.observations.find((x) => x.metric_id === id)!
      const e = s.evaluations.find((x) => x.metric_id === id)!
      expect(o.gradable).toBe(false)
      expect(e.gradable_state).toBe('withheld')
      expect(e.rating).toBe('withheld')
      expect(e.grade_target_id).toMatch(/^GT-01[34]$/) // original id preserved
      const gt = h.get<{
        approval_state: string
        status: string
        value_or_range: string
      }>(
        `SELECT approval_state, status, value_or_range FROM watchdog_grade_target WHERE grade_target_id = ?`,
        e.grade_target_id,
      )!
      expect(gt.approval_state).not.toBe('approved')
      expect(gt.status).not.toBe('active')
      expect(gt.value_or_range).toBe('pending')
    }
    // approved measured targets are actually approved/active
    const gt11 = h.get<{ approval_state: string; status: string }>(
      `SELECT approval_state, status FROM watchdog_grade_target WHERE grade_target_id = 'GT-OT-SW-011'`,
    )!
    expect(gt11.approval_state).toBe('approved')
    expect(gt11.status).toBe('active')
    expect(
      reconstructedContentShaCanonical(run.run_key, {
        profile: PROFILE,
        profileRoot,
      }),
    ).toBe(PINNED)
  })

  it('is idempotent: replay verifies the full graph then changes nothing', () => {
    const run = makeRun()
    persist(run, profileRoot)
    const res = persist(run, profileRoot)
    expect(res.changed).toBe(false)
  })

  it('refuses a run_key collision carrying different content', () => {
    const run = makeRun()
    persist(run, profileRoot)
    const tampered = JSON.parse(JSON.stringify(run)) as PacketRun
    tampered.observations[0].value = 999
    tampered.content_sha256 = contentSha(tampered)
    expect(() => persist(tampered, profileRoot)).toThrow(
      CanonicalWatchdogStoreError,
    )
  })

  it('forced rollback: a mid-write failure rolls back the whole graph (no partial anchor)', () => {
    const run = makeRun()
    // Ensure tables, then pre-seed a CONFLICTING report_run so the report insert (late
    // in the graph) collides mid-transaction, after module_run + children were inserted.
    readPkt0201Canonical(run.run_key, { profileRoot })
    const seed = openBrain(PROFILE, { profileRoot })
    seed.run(
      `INSERT INTO watchdog_report_run (report_run_id, profile, period, report_lineage, module_run_ids, delivery_state)
       VALUES (?, ?, ?, '{}', '[]', 'undelivered')`,
      `RR:${run.run_key}`,
      PROFILE,
      run.period,
    )
    seed.close()
    expect(() => persist(run, profileRoot)).toThrow()
    // no module_run anchor survived
    const after = openBrain(PROFILE, { profileRoot })
    expect(
      after.get<{ n: number }>(
        `SELECT COUNT(*) n FROM watchdog_module_run WHERE run_key = ?`,
        run.run_key,
      )!.n,
    ).toBe(0)
    expect(readPkt0201Canonical(run.run_key, { profileRoot })).toBeNull()
    // remove the orphan and a fresh persist succeeds
    after.run(
      `DELETE FROM watchdog_report_run WHERE report_run_id = ?`,
      `RR:${run.run_key}`,
    )
    after.close()
    expect(persist(run, profileRoot).changed).toBe(true)
  })
})

// ── backfill + compatibility (real PKT-02-01) ────────────────────────

describe.runIf(HAVE)('legacy backfill + compatibility reads', () => {
  it('backfills legacy → canonical with row parity + reconstructed hash', () => {
    const run = makeRun()
    persistPacketRun(run, { profile: PROFILE, profileRoot }) // legacy path
    const bf = backfillLegacyToCanonical(run.run_key, {
      profileRoot,
      repoRoot: REPO,
    })
    expect(bf.changed).toBe(true)
    expect(bf.legacyCounts).toEqual({
      run: 1,
      observations: 5,
      evaluations: 5,
      findings: 5,
      alert_candidates: 3,
    })
    expect(bf.canonicalRows.observation).toBe(5)
    expect(bf.parity).toBe(true)
    expect(bf.canonicalReconstructedSha).toBe(PINNED)
    expect(bf.legacyContentSha).toBe(PINNED)
  })

  it('is idempotent: re-backfill verifies the graph and changes nothing', () => {
    const run = makeRun()
    persistPacketRun(run, { profile: PROFILE, profileRoot })
    backfillLegacyToCanonical(run.run_key, { profileRoot, repoRoot: REPO })
    expect(
      backfillLegacyToCanonical(run.run_key, { profileRoot, repoRoot: REPO })
        .changed,
    ).toBe(false)
  })

  it('compatibility read prefers canonical, falls back to legacy when absent', () => {
    const run = makeRun()
    // only legacy exists -> fallback to legacy
    persistPacketRun(run, { profile: PROFILE, profileRoot })
    expect(readWatchdogRun(run.run_key, { profileRoot })!.source).toBe('legacy')
    // add canonical -> now prefers canonical; legacy still directly readable (rollback)
    backfillLegacyToCanonical(run.run_key, { profileRoot, repoRoot: REPO })
    expect(readWatchdogRun(run.run_key, { profileRoot })!.source).toBe(
      'canonical',
    )
    expect(
      readPacketRun(run.run_key, { profile: PROFILE, profileRoot }),
    ).not.toBeNull()
    expect(
      listWatchdogRuns({ profileRoot }).find((r) => r.run_key === run.run_key)!
        .source,
    ).toBe('canonical')
  })

  it('new packets write canonical only (legacy tables untouched by the canonical path)', () => {
    const run = makeRun()
    persist(run, profileRoot) // canonical only
    const h = openBrain(PROFILE, { profileRoot })
    // the canonical path never even creates the legacy watchdog_packet_* tables
    const legacy = h.get<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='watchdog_packet_run'`,
    )
    expect(legacy).toBeUndefined()
    expect(
      h.get<{ n: number }>(`SELECT COUNT(*) n FROM watchdog_module_run`)!.n,
    ).toBe(1)
  })

  it('multi-packet / multi-period coexistence adds no new tables and no overwrite', () => {
    const a = makeRun()
    persist(a, profileRoot)
    const before = tables(profileRoot).length
    // second period, same metric ids -> different run_key, coexists
    const b = JSON.parse(JSON.stringify(a)) as PacketRun
    const p2 = '2026-08-17..2026-08-23'
    b.period = p2
    b.observations.forEach((o) => (o.period = p2))
    b.evaluations.forEach((e) => (e.period = p2))
    b.findings.forEach((f) => (f.period = p2))
    b.two_delta.evidence_delta.period = p2
    b.run_key = `${a.run_key}-p2`
    b.content_sha256 = contentSha(b)
    persist(b, profileRoot)
    expect(tables(profileRoot).length).toBe(before)
    const runs = listWatchdogRuns({ profileRoot })
    expect(runs.map((r) => r.period).sort()).toContain(PERIOD)
    // first period intact
    expect(readPkt0201Canonical(a.run_key, { profileRoot })!.period).toBe(
      PERIOD,
    )
  })

  it('leaves operational notification rows untouched (no notification table created)', () => {
    const run = makeRun()
    persist(run, profileRoot)
    const h = openBrain(PROFILE, { profileRoot })
    const t = h.get<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='notification'`,
    )
    expect(t).toBeUndefined()
  })
})

// ── full-graph tamper detection (real PKT-02-01) ─────────────────────

describe.runIf(HAVE)('full-graph tamper detection', () => {
  const seed = (): PacketRun => {
    const run = makeRun()
    persist(run, profileRoot)
    return run
  }
  const expectTamper = (run: PacketRun) =>
    expect(() =>
      readCanonicalRun(run.run_key, { profile: PROFILE, profileRoot }),
    ).toThrow(CanonicalWatchdogIntegrityError)

  it('missing evaluation row', () => {
    const run = seed()
    const h = openBrain(PROFILE, { profileRoot })
    h.run(
      `DELETE FROM watchdog_metric_evaluation WHERE run_key = ? AND metric_id = 'SW-014'`,
      run.run_key,
    )
    h.close()
    expectTamper(run)
  })

  it('missing alert candidate', () => {
    const run = seed()
    const h = openBrain(PROFILE, { profileRoot })
    h.run(
      `DELETE FROM watchdog_alert_candidate WHERE run_key = ? AND metric_id = 'SW-011'`,
      run.run_key,
    )
    h.close()
    expectTamper(run)
  })

  it('extra alert candidate for a pending metric', () => {
    const run = seed()
    const h = openBrain(PROFILE, { profileRoot })
    h.run(
      `INSERT INTO watchdog_alert_candidate (run_key, metric_id, profile, period, would_fire, channel, delivered, unsent, message)
       VALUES (?, 'SW-013', ?, ?, 0, 'simulated_none', 0, 1, 'x')`,
      run.run_key,
      PROFILE,
      run.period,
    )
    h.close()
    expectTamper(run)
  })

  it('deleted finding link (coverage gap)', () => {
    const run = seed()
    const h = openBrain(PROFILE, { profileRoot })
    h.run(
      `DELETE FROM watchdog_finding_metric_link WHERE run_key = ? AND metric_id = 'SW-012'`,
      run.run_key,
    )
    h.close()
    expectTamper(run)
  })

  it('altered observation value (content hash divergence)', () => {
    const run = seed()
    const h = openBrain(PROFILE, { profileRoot })
    h.run(
      `UPDATE watchdog_metric_observation SET value = 999 WHERE run_key = ? AND metric_id = 'SW-011'`,
      run.run_key,
    )
    h.close()
    expectTamper(run)
  })

  it('altered grade-target approval_state (metadata NOT in the content hash) → graph sha', () => {
    const run = seed()
    // content hash is unaffected by grade_target.approval_state; the graph manifest is.
    expect(
      reconstructedContentShaCanonical(run.run_key, {
        profile: PROFILE,
        profileRoot,
      }),
    ).toBe(PINNED)
    const h = openBrain(PROFILE, { profileRoot })
    h.run(
      `UPDATE watchdog_grade_target SET approval_state = 'approved', status = 'active' WHERE grade_target_id = 'GT-013'`,
    )
    h.close()
    expect(
      reconstructedContentShaCanonical(run.run_key, {
        profile: PROFILE,
        profileRoot,
      }),
    ).toBe(PINNED) // content unchanged
    expectTamper(run) // but the graph manifest sha diverges
  })

  it('tampered report_run.module_run_ids (set != link table)', () => {
    const run = seed()
    const h = openBrain(PROFILE, { profileRoot })
    h.run(
      `UPDATE watchdog_report_run SET module_run_ids = '["x","y"]' WHERE report_run_id = ?`,
      `RR:${run.run_key}`,
    )
    h.close()
    expectTamper(run)
  })

  it('tampering a versioned definition parent (formula) is caught by the graph sha', () => {
    const run = seed()
    // formula is NOT in the PacketRun content hash, but the graph manifest binds the
    // exact (metric_id, metric_version) definition, so the graph sha diverges.
    expect(
      reconstructedContentShaCanonical(run.run_key, {
        profile: PROFILE,
        profileRoot,
      }),
    ).toBe(PINNED)
    const h = openBrain(PROFILE, { profileRoot })
    h.run(
      `UPDATE watchdog_metric_definition SET formula = 'TAMPERED' WHERE metric_id = 'SW-011' AND metric_version = '1.0.0'`,
    )
    h.close()
    expect(
      reconstructedContentShaCanonical(run.run_key, {
        profile: PROFILE,
        profileRoot,
      }),
    ).toBe(PINNED) // content unchanged
    expectTamper(run) // graph manifest diverges
  })

  it('the DB CHECK blocks any attempt to flip an alert to delivered/sent', () => {
    const run = seed()
    const h = openBrain(PROFILE, { profileRoot })
    expect(() =>
      h.run(
        `UPDATE watchdog_alert_candidate SET delivered = 1 WHERE run_key = ? AND metric_id = 'SW-011'`,
        run.run_key,
      ),
    ).toThrow()
    expect(() =>
      h.run(
        `UPDATE watchdog_alert_candidate SET unsent = 0 WHERE run_key = ? AND metric_id = 'SW-012'`,
        run.run_key,
      ),
    ).toThrow()
    h.close()
  })

  it('forensic raw read returns the tampered rows WITHOUT throwing', () => {
    const run = seed()
    const h = openBrain(PROFILE, { profileRoot })
    h.run(
      `DELETE FROM watchdog_metric_evaluation WHERE run_key = ? AND metric_id = 'SW-014'`,
      run.run_key,
    )
    h.close()
    const raw = readCanonicalRunRawForensic(run.run_key, {
      profile: PROFILE,
      profileRoot,
    })!
    expect(raw.evaluations).toHaveLength(4) // sees the damage, does not throw
  })
})
