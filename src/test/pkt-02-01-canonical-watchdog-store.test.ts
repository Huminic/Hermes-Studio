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
  const runKey = over.run_key ?? 'testrun-coex-0001'
  const fk = (s: string): string => `${runKey}:${s}` // run-namespaced finding keys
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
      metric_id: 'TEST-METRIC-A',
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
      metric_id: 'TEST-METRIC-B',
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
        metric_id: 'TEST-METRIC-B',
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
      metric_id: 'TEST-METRIC-A',
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
      metric_id: 'TEST-METRIC-B',
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
      metric_id: 'TEST-METRIC-A',
      period,
      severity: 'breach' as const,
      headline: 'TEST-METRIC-A primary',
      detail: 'd1',
    },
    {
      metric_id: 'TEST-METRIC-A',
      period,
      severity: 'breach' as const,
      headline: 'TEST-METRIC-A secondary',
      detail: 'd2',
    },
    {
      metric_id: 'TEST-METRIC-B',
      period,
      severity: 'pending' as const,
      headline: 'TEST-METRIC-B held',
      detail: 'd3',
    },
  ]
  const alert_simulations: Array<AlertSimulation> = [
    {
      metric_id: 'TEST-METRIC-A',
      would_fire: true,
      channel: 'simulated_none' as const,
      delivered: false as const,
      unsent: true as const,
      message: '[SIMULATED — NOT SENT] TEST-METRIC-A',
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
    run_key: runKey,
    as_of: '2026-09-02T00:00:00Z',
    engine_version: 'test-1',
    binding_sha256: 'd'.repeat(64),
    source_sha256: sha,
    content_sha256: '',
    acceptance_state: 'packet_accepted',
    definition_version: '1.0.0',
    reference_version: '1.0.0',
    target_version: '1.0.0',
    expected_metric_ids: ['TEST-METRIC-A', 'TEST-METRIC-B'],
    measured_metric_ids: ['TEST-METRIC-A'],
    lifecycle_partition: {
      accepted_measured_ids: ['TEST-METRIC-A'],
      accepted_disposition_only_ids: [],
      rejected_ids: [],
      source_investigation_pending_ids: ['TEST-METRIC-B'],
      calculation_pending_ids: [],
    },
    observations,
    evaluations,
    findings,
    alert_simulations,
    two_delta,
    reconciliation,
    metric_definitions: [
      {
        metric_id: 'TEST-METRIC-A',
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
        metric_id: 'TEST-METRIC-B',
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
        admission_receipt: {
          source_sha256: sha,
          schema_contract_sha256: 'b'.repeat(64),
          bytes: 100,
          row_count: 10,
          profile,
          dealer_id: dealer,
          period,
          admitted: true as const,
          zero_service_parts: true as const,
          sales_only_proof: two_delta.evidence_delta.sales_only_proof,
          provenance: { proof: 'x' },
        },
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
        detection_rule_id: 'DR-TEST-METRIC-A-1.0.0',
        metric_id: 'TEST-METRIC-A',
        metric_version: '1.0.0',
        threshold_id: 'TH-201',
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
        metric_id: 'TEST-METRIC-A',
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
        metric_id: 'TEST-METRIC-B',
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
        metric_id: 'TEST-METRIC-A',
        metric_version: '1.0.0',
        basis: 'operator_potential',
        approval_state: 'reference_only',
        status: 'active',
      },
    ],
    finding_specs: [
      {
        finding_key: fk('f-201-a'),
        metric_id: 'TEST-METRIC-A',
        period,
        severity: 'breach',
        headline: 'TEST-METRIC-A primary',
        detail: 'd1',
        priority: 'high',
      },
      {
        finding_key: fk('f-201-b'),
        metric_id: 'TEST-METRIC-A',
        period,
        severity: 'breach',
        headline: 'TEST-METRIC-A secondary',
        detail: 'd2',
        priority: 'high',
      },
      {
        finding_key: fk('f-202'),
        metric_id: 'TEST-METRIC-B',
        period,
        severity: 'pending',
        headline: 'TEST-METRIC-B held',
        detail: 'd3',
        priority: 'medium',
      },
    ],
    capability_snapshots: [],
    report_run: {
      report_run_id: `RR:${runKey}`,
      report_lineage: two_delta,
      delivery_state: 'undelivered',
      activation_state: 'inactive',
    },
    sales_only_admission: {
      proof: two_delta.evidence_delta.sales_only_proof,
      dealer_id: dealer,
      zero_service_parts: true,
    },
    dataset_id_by_metric: { 'TEST-METRIC-A': nd, 'TEST-METRIC-B': null },
    detection_rule_id_by_metric: {
      'TEST-METRIC-A': 'DR-TEST-METRIC-A-1.0.0',
      'TEST-METRIC-B': null,
    },
    disposition_by_metric: {
      'TEST-METRIC-A': 'measured_validated',
      'TEST-METRIC-B': 'source_investigation_pending',
    },
    evaluation_state_by_metric: {
      'TEST-METRIC-A': 'measured_graded',
      'TEST-METRIC-B': 'not_measured',
    },
    affirmative_investigation_evidence_ref_by_metric: {
      'TEST-METRIC-A': null,
      'TEST-METRIC-B': null,
    },
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
  it('migrations 5+6 create the full canonical graph on an empty DB', () => {
    const h = openBrain(PROFILE, { profileRoot })
    expect(h.schemaVersion).toBe(6)
    for (const t of CANON_TABLES) expect(tables(profileRoot)).toContain(t)
    // v6 additive lineage-link tables present
    for (const t of [
      'watchdog_run_source_artifact',
      'watchdog_run_normalized_dataset',
      'watchdog_run_capability_snapshot',
      'watchdog_evaluation_detection_rule',
    ])
      expect(tables(profileRoot)).toContain(t)
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
      'TEST-METRIC-A',
      'TEST-METRIC-B',
    ])
    // no new tables created by a second packet
    expect(tables(profileRoot).length).toBe(before)
  })

  it('supports MULTIPLE findings per metric/run (two TEST-METRIC-A findings coexist)', () => {
    const env = syntheticEnvelope()
    persistCanonicalRunEnvelope(env, { profileRoot })
    const h = openBrain(PROFILE, { profileRoot })
    const n = h.get<{ n: number }>(
      `SELECT COUNT(*) n FROM watchdog_finding_metric_link WHERE run_key = ? AND metric_id = 'TEST-METRIC-A'`,
      env.run_key,
    )!.n
    expect(n).toBe(2)
    const stored = readCanonicalRun(env.run_key, {
      profile: PROFILE,
      profileRoot,
    })!
    expect(
      stored.findings.filter((f) => f.metric_id === 'TEST-METRIC-A'),
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
      stored.findings.filter((f) => f.metric_id === 'TEST-METRIC-A'),
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
      {
        ...env.source_artifacts[0],
        admission_receipt:
          null as unknown as (typeof env.source_artifacts)[0]['admission_receipt'],
      },
    ]
    expect(() => persistCanonicalRunEnvelope(env, { profileRoot })).toThrow(
      /admission_receipt/,
    )
  })

  it('fail-closed: lifecycle non-exclusive / missing bucket / arbitrary bucket rejected', () => {
    // all five keys present, but an id appears in two buckets (not exclusive)
    const dup = syntheticEnvelope()
    dup.lifecycle_partition = {
      accepted_measured_ids: ['TEST-METRIC-A'],
      accepted_disposition_only_ids: [],
      rejected_ids: ['TEST-METRIC-A'],
      source_investigation_pending_ids: ['TEST-METRIC-B'],
      calculation_pending_ids: [],
    }
    expect(() => persistCanonicalRunEnvelope(dup, { profileRoot })).toThrow(
      /not exclusive/,
    )
    // a required bucket key missing
    const gap = syntheticEnvelope()
    gap.lifecycle_partition = { accepted_measured_ids: ['TEST-METRIC-A'] }
    expect(() => persistCanonicalRunEnvelope(gap, { profileRoot })).toThrow(
      /missing required bucket/,
    )
    // an arbitrary (non-vocabulary) bucket key
    const bad = syntheticEnvelope()
    bad.lifecycle_partition = {
      ...syntheticEnvelope().lifecycle_partition,
      made_up_bucket: [],
    }
    expect(() => persistCanonicalRunEnvelope(bad, { profileRoot })).toThrow(
      /unknown bucket/,
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
    // second run, same metric definition KEY (TEST-METRIC-A@1.0.0) but a DIFFERENT formula
    const b = syntheticEnvelope({
      run_key: 'testrun-coex-0002',
      report_run: {
        report_run_id: 'RR:testrun-coex-0002',
        report_lineage: a.two_delta,
        delivery_state: 'undelivered',
      },
    })
    b.metric_definitions = b.metric_definitions.map((d) =>
      d.metric_id === 'TEST-METRIC-A' ? { ...d, formula: 'DIFFERENT' } : d,
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

// ── Part A consolidated-control adversarial tests (items 1–10) ───────
describe('Part A controls — adversarial', () => {
  const reject = (mut: (e: CanonicalRunEnvelope) => void, re: RegExp) => {
    const env = syntheticEnvelope()
    mut(env)
    if (env.content_sha256 === '' || true) {
      // most mutations are outside the content hash; reseal only if content changed
    }
    expect(() => persistCanonicalRunEnvelope(env, { profileRoot })).toThrow(re)
  }

  // item 1 (replay): same content hash, changed as_of/disposition → fail (not no-op)
  it('replay with a changed as_of (same content hash) fails, not a no-op', () => {
    const env = syntheticEnvelope()
    persistCanonicalRunEnvelope(env, { profileRoot })
    const again = syntheticEnvelope() // same run_key + content
    again.as_of = '2099-01-01T00:00:00Z' // not in content hash; IS in graph manifest
    expect(again.content_sha256).toBe(env.content_sha256)
    expect(() => persistCanonicalRunEnvelope(again, { profileRoot })).toThrow(
      CanonicalWatchdogIntegrityError,
    )
  })

  // item 2: exact membership
  it('extra/missing/duplicate metric definition rejected', () => {
    reject(
      (e) =>
        e.metric_definitions.push({
          ...e.metric_definitions[0],
          metric_id: 'SW-999',
        }),
      /metric_definitions/,
    )
    reject(
      (e) => (e.metric_definitions = [e.metric_definitions[0]]),
      /metric_definitions/,
    )
    reject(
      (e) => (e.metric_definitions[1] = { ...e.metric_definitions[0] }),
      /duplicate metric_id/,
    )
  })
  it('unused detection rule / grade target / reference rejected', () => {
    reject(
      (e) =>
        e.detection_rules.push({
          ...e.detection_rules[0],
          detection_rule_id: 'DR-UNUSED',
        }),
      /detection_rules supplied != linked/,
    )
    reject(
      (e) =>
        e.grade_targets.push({
          ...e.grade_targets[0],
          grade_target_id: 'GT-UNUSED',
        }),
      /grade_targets supplied != used/,
    )
  })
  it('module-inconsistent metric definition rejected', () => {
    reject((e) => (e.metric_definitions[0].module = 99), /module 99 != run/)
  })

  // item 5: authority identity
  it('detection-rule threshold/comparator mismatch + non-approved rejected', () => {
    reject(
      (e) => (e.detection_rules[0].threshold_id = 'WRONG'),
      /threshold_id mismatch/,
    )
    reject(
      (e) => (e.detection_rules[0].comparator = '<'),
      /comparator mismatch/,
    )
    reject(
      (e) => (e.detection_rules[0].approval_state = 'unresolved'),
      /approved\+active/,
    )
  })
  it('cross-metric grade-target authority rejected', () => {
    reject(
      (e) => (e.grade_targets[0].metric_id = 'TEST-METRIC-B'),
      /grade_targets supplied != used|metric\/version mismatch/,
    )
  })
  it('ambiguous duplicate authority id rejected', () => {
    reject(
      (e) =>
        e.grade_targets.push({
          ...e.grade_targets[0],
          target_version: '2.0.0',
        }),
      /ambiguous duplicate id|supplied != used/,
    )
  })

  // item 6: capability
  it('target capability_snapshot_id not supplied rejected', () => {
    reject(
      (e) => (e.grade_targets[0].capability_snapshot_id = 'CAP-NONE'),
      /not supplied/,
    )
  })

  // frozen contract: genuinely_not_available needs the EXACT named ref, not prose
  it('genuinely_not_available without affirmative_investigation_evidence_ref fails (even with prose)', () => {
    const mkGNA = (ref: string | null): CanonicalRunEnvelope => {
      const e = syntheticEnvelope()
      e.lifecycle_partition.source_investigation_pending_ids = []
      e.lifecycle_partition.accepted_disposition_only_ids = ['TEST-METRIC-B']
      e.disposition_by_metric['TEST-METRIC-B'] = 'genuinely_not_available'
      e.evaluation_state_by_metric['TEST-METRIC-B'] = 'not_measured'
      // generic prose is PRESENT but must NOT satisfy the gate
      e.observations[1].source_investigation = {
        metric_id: 'TEST-METRIC-B',
        disposition: 'genuinely_not_available',
        searched_universe: ['A'],
        required: [],
        missing_fields: ['x'],
        evidence: 'we looked everywhere, prose only',
      } as never
      e.affirmative_investigation_evidence_ref_by_metric['TEST-METRIC-B'] = ref
      e.content_sha256 = envelopeContentSha(e)
      return e
    }
    expect(() =>
      persistCanonicalRunEnvelope(mkGNA('   '), { profileRoot }),
    ).toThrow(/affirmative_investigation_evidence_ref/)
    expect(() =>
      persistCanonicalRunEnvelope(mkGNA(null), { profileRoot }),
    ).toThrow(/affirmative_investigation_evidence_ref/)
    const ok = mkGNA('EVID-REF-0001')
    ok.run_key = 'testrun-gna-ok'
    ok.report_run = { ...ok.report_run, report_run_id: 'RR:testrun-gna-ok' }
    ok.content_sha256 = envelopeContentSha(ok)
    expect(persistCanonicalRunEnvelope(ok, { profileRoot }).changed).toBe(true)
    const h = openBrain(PROFILE, { profileRoot })
    const ref = h.get<{ affirmative_investigation_evidence_ref: string }>(
      `SELECT affirmative_investigation_evidence_ref FROM watchdog_metric_observation WHERE run_key=? AND metric_id='TEST-METRIC-B'`,
      ok.run_key,
    )!
    h.close()
    expect(ref.affirmative_investigation_evidence_ref).toBe('EVID-REF-0001')
  })

  // Defect-B strict IFF: EVERY non-GNA metric requires literal null. A non-null ref —
  // nonblank string, '', whitespace, or undefined — on a non-GNA metric is REJECTED.
  it('non-GNA metric with any non-null affirmative_investigation_evidence_ref is rejected', () => {
    const mk = (ref: unknown): CanonicalRunEnvelope => {
      const e = syntheticEnvelope()
      // TEST-METRIC-A is measured_validated (accepted_measured) → NOT GNA.
      e.affirmative_investigation_evidence_ref_by_metric['TEST-METRIC-A'] =
        ref as never
      e.content_sha256 = envelopeContentSha(e)
      return e
    }
    for (const bad of ['nonblank-ref', '', '   ', undefined]) {
      expect(() =>
        persistCanonicalRunEnvelope(mk(bad), { profileRoot }),
      ).toThrow(/affirmative_investigation_evidence_ref === null/)
    }
  })

  // Defect-B: GNA requires a trimmed non-empty STRING — a non-string ref is rejected.
  it('genuinely_not_available with a non-string affirmative ref is rejected', () => {
    const e = syntheticEnvelope()
    e.lifecycle_partition.source_investigation_pending_ids = []
    e.lifecycle_partition.accepted_disposition_only_ids = ['TEST-METRIC-B']
    e.disposition_by_metric['TEST-METRIC-B'] = 'genuinely_not_available'
    e.evaluation_state_by_metric['TEST-METRIC-B'] = 'not_measured'
    e.affirmative_investigation_evidence_ref_by_metric['TEST-METRIC-B'] =
      123 as never
    e.content_sha256 = envelopeContentSha(e)
    expect(() => persistCanonicalRunEnvelope(e, { profileRoot })).toThrow(
      /trimmed non-empty string/,
    )
  })

  // generic read-path: the three governed fields survive persist → readback EXACTLY
  it('readback exposes disposition / evaluation_state / affirmative ref (normal states)', () => {
    const env = syntheticEnvelope()
    persistCanonicalRunEnvelope(env, { profileRoot })
    const s = readCanonicalRun(env.run_key, { profile: PROFILE, profileRoot })!
    expect(s.read_shape_version).toBe(2)
    expect(s.disposition_by_metric).toEqual({
      'TEST-METRIC-A': 'measured_validated',
      'TEST-METRIC-B': 'source_investigation_pending',
    })
    expect(s.evaluation_state_by_metric).toEqual({
      'TEST-METRIC-A': 'measured_graded',
      'TEST-METRIC-B': 'not_measured',
    })
    expect(s.affirmative_investigation_evidence_ref_by_metric).toEqual({
      'TEST-METRIC-A': null,
      'TEST-METRIC-B': null,
    })
  })
  it('readback exposes the exact affirmative_investigation_evidence_ref for a GNA metric', () => {
    const e = syntheticEnvelope()
    e.lifecycle_partition.source_investigation_pending_ids = []
    e.lifecycle_partition.accepted_disposition_only_ids = ['TEST-METRIC-B']
    e.disposition_by_metric['TEST-METRIC-B'] = 'genuinely_not_available'
    e.evaluation_state_by_metric['TEST-METRIC-B'] = 'not_measured'
    e.affirmative_investigation_evidence_ref_by_metric['TEST-METRIC-B'] = 'EVID-GNA-7'
    e.content_sha256 = envelopeContentSha(e)
    persistCanonicalRunEnvelope(e, { profileRoot })
    const s = readCanonicalRun(e.run_key, { profile: PROFILE, profileRoot })!
    expect(s.disposition_by_metric['TEST-METRIC-B']).toBe('genuinely_not_available')
    expect(s.evaluation_state_by_metric['TEST-METRIC-B']).toBe('not_measured')
    expect(s.affirmative_investigation_evidence_ref_by_metric['TEST-METRIC-B']).toBe(
      'EVID-GNA-7',
    )
    // backward compatibility: v1 engine record arrays still present + correct
    expect(s.observations.map((o) => o.metric_id).sort()).toEqual([
      'TEST-METRIC-A',
      'TEST-METRIC-B',
    ])
  })

  // item 7: report inertness
  it('report lineage != two_delta / delivered / activated rejected', () => {
    reject(
      (e) =>
        (e.report_run.report_lineage = {
          ...e.two_delta,
          meaning_delta: [{ x: 1 } as never],
        }),
      /report_lineage != env.two_delta/,
    )
    reject(
      (e) => (e.report_run.delivery_state = 'delivered'),
      /must be undelivered/,
    )
    reject(
      (e) => (e.report_run.activation_state = 'active'),
      /must be inactive/,
    )
  })

  // item 4: admission receipt + source lineage
  it('empty sales-only proof / null identity / lineage mismatch rejected', () => {
    reject(
      (e) => (e.source_artifacts[0].admission_receipt.sales_only_proof = '  '),
      /empty sales_only_proof/,
    )
    reject((e) => {
      e.source_artifacts[0].bytes = null
      e.source_artifacts[0].admission_receipt.bytes = null
    }, /contracted identity field 'bytes' is null/)
    reject(
      (e) => (e.observations[0].source_lineage.source_sha256 = 'f'.repeat(64)),
      /source_lineage source_sha256 != artifact/,
    )
  })

  // item 1/6/lifecycle: exact-key maps + bucket vocabulary/semantics
  it('exact-key map missing / arbitrary bucket / bad disposition rejected', () => {
    reject(
      (e) => delete e.dataset_id_by_metric['TEST-METRIC-B'],
      /dataset_id_by_metric keys/,
    )
    reject(
      (e) => delete e.detection_rule_id_by_metric['TEST-METRIC-B'],
      /detection_rule_id_by_metric keys/,
    )
    reject(
      (e) => delete e.disposition_by_metric['TEST-METRIC-B'],
      /disposition_by_metric keys/,
    )
    reject((e) => {
      e.lifecycle_partition = {
        ...syntheticEnvelope().lifecycle_partition,
        made_up: [],
      }
    }, /unknown bucket/)
  })
  it('disposition/eval-state not admitted by its bucket rejected (SIP-as-disposition-only, calc-graded)', () => {
    // put source_investigation_pending metric into disposition-only → rejected
    reject((e) => {
      e.lifecycle_partition.accepted_disposition_only_ids = ['TEST-METRIC-B']
      e.lifecycle_partition.source_investigation_pending_ids = []
    }, /not admitted by bucket/)
  })

  // item 3: manifest tamper (finding parent, as_of, disposition, capability, links)
  it('finding-parent column tamper is caught by the graph sha', () => {
    const env = syntheticEnvelope()
    persistCanonicalRunEnvelope(env, { profileRoot })
    const h = openBrain(PROFILE, { profileRoot })
    h.run(
      `UPDATE watchdog_finding SET details = 'TAMPERED' WHERE key = ?`,
      `${env.run_key}:f-201-a`,
    )
    h.close()
    expect(() =>
      readCanonicalRun(env.run_key, { profile: PROFILE, profileRoot }),
    ).toThrow(CanonicalWatchdogIntegrityError)
  })
  it('run-lineage link deletion is caught', () => {
    const env = syntheticEnvelope()
    persistCanonicalRunEnvelope(env, { profileRoot })
    const h = openBrain(PROFILE, { profileRoot })
    h.run(
      `DELETE FROM watchdog_run_source_artifact WHERE run_key = ?`,
      env.run_key,
    )
    h.close()
    expect(() =>
      readCanonicalRun(env.run_key, { profile: PROFILE, profileRoot }),
    ).toThrow(CanonicalWatchdogIntegrityError)
  })

  // Defect-A (superseding): a calculation_pending observation carrying ANY non-null
  // value is REJECTED — there is no measured_unscored / measured_abstained value
  // exception. This replaces the prior "provisional value persists" test.
  it('calculation_pending with a non-null value is rejected (no measured_unscored value exception)', () => {
    const env = syntheticEnvelope()
    env.lifecycle_partition.source_investigation_pending_ids = []
    env.lifecycle_partition.calculation_pending_ids = ['TEST-METRIC-B']
    env.disposition_by_metric['TEST-METRIC-B'] = 'data_acquired_calculation_pending'
    env.evaluation_state_by_metric['TEST-METRIC-B'] = 'measured_unscored'
    env.observations[1].value = 0.0357 // provisional value — now forbidden
    env.observations[1].source_lineage = {
      ...env.observations[0].source_lineage,
    }
    env.dataset_id_by_metric['TEST-METRIC-B'] = env.dataset_id_by_metric['TEST-METRIC-A']
    env.content_sha256 = envelopeContentSha(env)
    expect(() => persistCanonicalRunEnvelope(env, { profileRoot })).toThrow(
      /calculation_pending must have NULL value/,
    )
  })

  // The contract-valid calculation_pending shape: value===null, ungraded/withheld.
  it('calculation_pending with value===null persists ungraded/withheld', () => {
    const env = syntheticEnvelope()
    env.lifecycle_partition.source_investigation_pending_ids = []
    env.lifecycle_partition.calculation_pending_ids = ['TEST-METRIC-B']
    env.disposition_by_metric['TEST-METRIC-B'] = 'data_acquired_calculation_pending'
    env.evaluation_state_by_metric['TEST-METRIC-B'] = 'not_measured'
    // value stays null (default). No grade/baseline/customer projection.
    env.content_sha256 = envelopeContentSha(env)
    const res = persistCanonicalRunEnvelope(env, { profileRoot })
    expect(res.changed).toBe(true)
    const s = readCanonicalRun(env.run_key, { profile: PROFILE, profileRoot })!
    const o = s.observations.find((x) => x.metric_id === 'TEST-METRIC-B')!
    expect(o.value).toBeNull()
    expect(
      s.evaluations.find((e) => e.metric_id === 'TEST-METRIC-B')!.gradable_state,
    ).not.toBe('graded')
  })

  // Two-artifact / two-hash: BOTH mapped observations in contract-valid
  // accepted_measured state (no calculation_pending / PKT-02-02 semantics). Proves
  // per-artifact Sales-only isolation — contamination in artifact 2 is rejected.
  it('two-artifact/two-hash (both accepted_measured) persists; artifact-2 contamination rejected', () => {
    const mk = (): CanonicalRunEnvelope => {
      const e = syntheticEnvelope()
      const sha2 = 'e'.repeat(64)
      const said2 = `SA2:${sha2.slice(0, 12)}`
      const nd2 = `ND2:${sha2.slice(0, 12)}`
      e.source_artifacts.push({
        ...e.source_artifacts[0],
        source_artifact_id: said2,
        source_sha256: sha2,
        admission_receipt: {
          ...e.source_artifacts[0].admission_receipt,
          source_sha256: sha2,
        },
      })
      e.normalized_datasets.push({
        ...e.normalized_datasets[0],
        normalized_dataset_id: nd2,
        source_artifact_id: said2,
        normalized_sha256: sha2,
      })
      // TEST-METRIC-B → accepted_measured (measured_validated / measured_unscored), a
      // contract-valid measured value bound to artifact 2 with matching lineage,
      // ungraded. No calculation_pending / measured_unscored-value carve-out.
      e.lifecycle_partition.source_investigation_pending_ids = []
      e.lifecycle_partition.accepted_measured_ids = ['TEST-METRIC-A', 'TEST-METRIC-B']
      e.measured_metric_ids = ['TEST-METRIC-A', 'TEST-METRIC-B']
      e.disposition_by_metric['TEST-METRIC-B'] = 'measured_validated'
      e.evaluation_state_by_metric['TEST-METRIC-B'] = 'measured_unscored'
      // accepted_measured requires alert_simulations to cover the measured set —
      // add an inert (never-sent) simulation for the newly-measured TEST-METRIC-B.
      e.alert_simulations.push({
        metric_id: 'TEST-METRIC-B',
        would_fire: false,
        channel: 'simulated_none',
        delivered: false as const,
        unsent: true as const,
        message: '[SIMULATED — NOT SENT] TEST-METRIC-B',
      })
      e.observations[1].status = 'measured'
      e.observations[1].value = 0.5
      e.observations[1].numerator = 1
      e.observations[1].denominator = 2
      e.observations[1].source_investigation = null
      e.observations[1].source_lineage = {
        ...e.observations[0].source_lineage,
        source_sha256: sha2,
      }
      e.dataset_id_by_metric['TEST-METRIC-B'] = nd2
      e.content_sha256 = envelopeContentSha(e)
      return e
    }
    const ok = mk()
    expect(persistCanonicalRunEnvelope(ok, { profileRoot }).changed).toBe(true)
    const s = readCanonicalRun(ok.run_key, { profile: PROFILE, profileRoot })!
    expect(s.observations.find((o) => o.metric_id === 'TEST-METRIC-B')!.value).toBe(0.5)
    // contaminate ONLY artifact 2
    const bad = mk()
    bad.run_key = 'testrun-coex-badart2'
    bad.report_run = {
      ...bad.report_run,
      report_run_id: 'RR:testrun-coex-badart2',
    }
    bad.source_artifacts[1].admission_receipt.zero_service_parts =
      false as unknown as true
    bad.content_sha256 = envelopeContentSha(bad)
    expect(() => persistCanonicalRunEnvelope(bad, { profileRoot })).toThrow(
      /zero_service_parts/,
    )
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
      capability_snapshot: 0,
      grade_target: 5,
      comparison_reference: 3,
      observation: 5,
      evaluation: 5,
      finding: 5,
      finding_metric_link: 5,
      report_run: 1,
      alert_candidate: 3,
      run_source_link: 1,
      run_dataset_link: 1,
      run_capability_link: 0,
      eval_rule_link: 3,
    })
    // First-write inserted counts reconcile exactly with the counted linked graph.
    const replay = persist(makeRun(), profileRoot)
    expect(replay.changed).toBe(false)
    expect(replay.verified).toEqual(res.rows)
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
    b.observations.forEach((o) => {
      o.period = p2
      o.source_lineage.period = p2 // lineage period must track the run period
    })
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
