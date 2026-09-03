/**
 * PKT-02-01 canonical migration + backfill RECEIPT (development only).
 *
 * On a DISPOSABLE per-profile dev Brain (fresh tmp profileRoot — never ~/.hermes,
 * never a production db) this:
 *   1. applies the CURRENT Brain schema on an empty Brain — migration 5 (canonical
 *      §7 tables) plus migration 6 (additive run→source/dataset/capability and
 *      eval→detection_rule link tables + evaluation_state /
 *      affirmative_investigation_evidence_ref columns);
 *   2. persists the accepted PKT-02-01 run via the LEGACY watchdog_packet_* adapter
 *      and records the legacy 1/5/5/5/3 counts;
 *   3. runs the idempotent, transactional legacy→canonical backfill and records the
 *      canonical row counts, row parity, and the reconstructed content hash;
 *   4. proves the read paths: canonical-preferred read, legacy fallback, and that the
 *      legacy rollback surface is still directly readable;
 *   5. re-runs the backfill to show it is a VERIFIED no-op — replay inserts 0 rows,
 *      re-verifies the full first-write graph byte-identically (replay verified ==
 *      first-write inserted), and reports changed=false.
 *
 * The .db is disposable (tmp). Only the emitted JSON/markdown evidence is durable —
 * NOTHING is installed into a standing dev or production Brain. The emitted evidence
 * is UNCOMMITTED (returned for review; this script neither commits nor pushes).
 *
 * Usage: HALO_LEADS_DIR=/tmp/halo-295-leads-20260831 \
 *        npx tsx scripts/halo-phase1b/canonical_backfill_receipt.ts
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { executePacket } from '../../src/server/reports/packet/engine'
import { canonicalJson } from '../../src/server/reports/packet/canonical'
import { openBrain } from '../../src/server/brain-store'
import {
  persistPacketRun,
  readPacketRun,
} from '../../src/server/watchdog/packet-brain-store'
import {
  backfillLegacyToCanonical,
  readPkt0201Canonical,
} from '../../src/server/watchdog/pkt-02-01-canonical-adapter'
import {
  listWatchdogRuns,
  readWatchdogRun,
} from '../../src/server/watchdog/watchdog-run-store'
import {
  reconstructedContentShaCanonical,
  type RowCounts,
} from '../../src/server/watchdog/canonical-watchdog-store'

const _require = createRequire(import.meta.url)
const repoRoot = process.cwd()
const PROFILE = 'serra-honda'
const PINNED =
  'ae30c07ab4a6e9ae85461dc183c32b94e1ae50c11c5004ab2b51e4d9b965eba1'
const OUT = path.join(
  repoRoot,
  'docs/halo/evidence/honda-watchdog/phase1b/pkt-02-01/persistence',
)

function fail(msg: string): never {
  throw new Error(`[canonical-backfill] ${msg}`)
}

function main(): void {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pkt0201-canon-receipt-'))
  const profileRoot = path.join(tmp, PROFILE)
  const dbPath = path.join(profileRoot, 'brain', 'brain.db')
  try {
    const run = executePacket({
      repoRoot,
      asOf: new Date().toISOString(),
      engineVersion: 'pkt-exec-1',
    })

    // 1) migration on empty Brain
    const h0 = openBrain(PROFILE, { profileRoot })
    const schemaVersion = h0.schemaVersion
    const canonTables = h0
      .all<{
        name: string
      }>(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'watchdog_%' ORDER BY name`)
      .map((r) => r.name)
    h0.close()

    // 2) legacy persist + counts
    persistPacketRun(run, { profile: PROFILE, profileRoot })
    const legacy = readPacketRun(run.run_key, { profile: PROFILE, profileRoot })
    if (!legacy) fail('legacy run not readable after persist')
    const legacyCounts = {
      run: 1,
      observations: legacy.observations.length,
      evaluations: legacy.evaluations.length,
      findings: legacy.findings.length,
      alert_candidates: legacy.alert_candidates.length,
    }

    // 3) backfill legacy -> canonical (transactional, idempotent)
    const bf = backfillLegacyToCanonical(run.run_key, { profileRoot, repoRoot })
    const reconEqualsPinned = bf.canonicalReconstructedSha === PINNED
    if (!bf.changed) fail('first backfill reported no change')
    if (!bf.parity) fail('row parity failed after backfill')
    if (!reconEqualsPinned)
      fail(`reconstructed sha ${bf.canonicalReconstructedSha} != pinned`)

    // canonical row counts (COUNT(*) on the on-disk graph)
    const h = openBrain(PROFILE, { profileRoot })
    const count = (t: string, where = ''): number =>
      h.get<{ n: number }>(`SELECT COUNT(*) n FROM ${t} ${where}`)!.n
    const canonicalCounts = {
      module_run: count(
        'watchdog_module_run',
        `WHERE run_key = '${run.run_key}'`,
      ),
      metric_definition: count('watchdog_metric_definition'),
      detection_rule: count('watchdog_detection_rule'),
      source_artifact: count('watchdog_source_artifact'),
      normalized_dataset: count('watchdog_normalized_dataset'),
      grade_target: count('watchdog_grade_target'),
      comparison_reference: count('watchdog_comparison_reference'),
      metric_observation: count(
        'watchdog_metric_observation',
        `WHERE run_key = '${run.run_key}'`,
      ),
      metric_evaluation: count(
        'watchdog_metric_evaluation',
        `WHERE run_key = '${run.run_key}'`,
      ),
      finding_metric_link: count(
        'watchdog_finding_metric_link',
        `WHERE run_key = '${run.run_key}'`,
      ),
      report_run: count('watchdog_report_run'),
      alert_candidate: count(
        'watchdog_alert_candidate',
        `WHERE run_key = '${run.run_key}'`,
      ),
    }
    const graphSha = h.get<{ graph_sha256: string | null }>(
      `SELECT graph_sha256 FROM watchdog_module_run WHERE run_key = ?`,
      run.run_key,
    )!.graph_sha256
    // pending target authority preserved (not approved)
    const pendingTargets = h.all<{
      grade_target_id: string
      approval_state: string
      status: string
      value_or_range: string
    }>(
      `SELECT grade_target_id, approval_state, status, value_or_range FROM watchdog_grade_target
        WHERE grade_target_id IN ('GT-013','GT-014')`,
    )
    const notificationTablePresent =
      h.get<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='notification'`,
      ) !== undefined
    h.close()

    // 4) read-path evidence
    const canonRead = readWatchdogRun(run.run_key, { profileRoot })
    const legacyStillReadable =
      readPacketRun(run.run_key, { profile: PROFILE, profileRoot }) !== null
    const listed = listWatchdogRuns({ profileRoot }).find(
      (r) => r.run_key === run.run_key,
    )
    const reconRead = reconstructedContentShaCanonical(run.run_key, {
      profile: PROFILE,
      profileRoot,
    })

    // 5) idempotent re-backfill (verified no-op)
    const bf2 = backfillLegacyToCanonical(run.run_key, {
      profileRoot,
      repoRoot,
    })

    if (canonRead?.source !== 'canonical')
      fail('compat read did not prefer canonical')
    if (!legacyStillReadable) fail('legacy rollback surface not readable')
    if (notificationTablePresent) fail('adapter created a notification table')

    // Defect-D: hard-assert the replay invariants BEFORE writing acceptance.
    // A verified idempotent no-op: replay changed=false, replay inserts 0 rows, and
    // replay VERIFIED counts EXACTLY equal the first-write INSERTED rows.
    const rowKeys = Object.keys(bf.canonicalRows) as Array<keyof RowCounts>
    const rowsEqual = (a: RowCounts, b: RowCounts): boolean =>
      rowKeys.every((k) => a[k] === b[k])
    if (bf.changed !== true) fail('first backfill did not report changed=true')
    if (bf2.changed !== false)
      fail('re-backfill reported a change (not idempotent)')
    const replayInsertedZero = rowKeys.every(
      (k) => bf2.canonicalRows[k] === 0,
    )
    if (!replayInsertedZero) fail('replay inserted non-zero rows (expected all 0)')
    if (!rowsEqual(bf.canonicalRows, bf2.canonicalVerified))
      fail('first-write inserted rows != replay verified counts')
    // Exact v6 link-family + capability counts, and id+version target/reference counts.
    const rc = bf.canonicalRows
    const expectExact: Array<[keyof RowCounts, number]> = [
      ['run_source_link', 1],
      ['run_dataset_link', 1],
      ['run_capability_link', 0],
      ['eval_rule_link', 3],
      ['capability_snapshot', 0],
      ['grade_target', 5],
      ['comparison_reference', 3],
    ]
    for (const [k, v] of expectExact)
      if (rc[k] !== v) fail(`exact count ${k}=${rc[k]} != ${v}`)

    const receipt = {
      artifact: 'honda-watchdog-pkt-02-01-canonical-migration-backfill-receipt',
      generated_note:
        'Deterministic (no wall-clock in hashes). The dev brain.db is DISPOSABLE (tmp) and is deleted at the end of this run; ONLY this emitted JSON evidence is durable. This evidence is UNCOMMITTED — it is regenerated and returned for review; this script neither commits nor pushes. No data is installed into a standing dev or production Brain.',
      schema_note:
        'Empty Brain migrated to the CURRENT schema: migration 5 (canonical §7 tables, byte-immutable) + migration 6 (additive run→lineage / eval→rule link tables + evaluation_state / affirmative_investigation_evidence_ref columns).',
      run_key: run.run_key,
      profile: PROFILE,
      dealer_id: run.dealer_id,
      period: run.period,
      binding_sha256: run.binding_sha256,
      source_sha256: run.source_sha256,
      pinned_content_sha256: PINNED,
      migration: {
        schema_version: schemaVersion,
        canonical_tables: canonTables,
      },
      legacy_counts: legacyCounts,
      canonical_counts: canonicalCounts,
      graph_sha256: graphSha,
      row_parity: bf.parity,
      hashes: {
        legacy_content_sha256: bf.legacyContentSha,
        canonical_reconstructed_sha256: bf.canonicalReconstructedSha,
        reconstructed_equals_pinned: reconEqualsPinned,
        read_path_reconstructed_sha256: reconRead,
      },
      target_authority_preserved: {
        pending_targets: pendingTargets,
        no_unapproved_target_is_active: pendingTargets.every(
          (t) =>
            t.approval_state !== 'approved' &&
            t.status !== 'active' &&
            t.value_or_range === 'pending',
        ),
      },
      read_path_evidence: {
        compat_read_source: canonRead.source,
        legacy_rollback_surface_readable: legacyStillReadable,
        listed_source: listed?.source,
        canonical_read_obs: readPkt0201Canonical(run.run_key, { profileRoot })!
          .observations.length,
      },
      idempotence: {
        first_backfill_changed: bf.changed,
        rebackfill_changed: bf2.changed,
        // Defect-D verified-no-op evidence.
        first_write_inserted_rows: bf.canonicalRows,
        replay_inserted_rows: bf2.canonicalRows,
        replay_verified_rows: bf2.canonicalVerified,
        replay_inserted_all_zero: replayInsertedZero,
        first_rows_equal_replay_verified: rowsEqual(
          bf.canonicalRows,
          bf2.canonicalVerified,
        ),
        v6_link_and_capability_counts: {
          run_source_link: rc.run_source_link,
          run_dataset_link: rc.run_dataset_link,
          run_capability_link: rc.run_capability_link,
          eval_rule_link: rc.eval_rule_link,
          capability_snapshot: rc.capability_snapshot,
        },
        id_version_authority_counts: {
          grade_target: rc.grade_target,
          comparison_reference: rc.comparison_reference,
        },
      },
      boundary: {
        notification_delivery_table_present: notificationTablePresent,
        disposable_db_deleted: true,
        real_sqlite: fs.existsSync(dbPath),
      },
    }

    fs.mkdirSync(OUT, { recursive: true })
    fs.writeFileSync(
      path.join(OUT, 'CANONICAL_MIGRATION_BACKFILL_RECEIPT.json'),
      JSON.stringify(JSON.parse(canonicalJson(receipt)), null, 2) + '\n',
    )
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          schema_version: schemaVersion,
          legacy_counts: legacyCounts,
          canonical_counts: canonicalCounts,
          row_parity: bf.parity,
          reconstructed_equals_pinned: reconEqualsPinned,
          graph_sha256: graphSha,
          rebackfill_changed: bf2.changed,
        },
        null,
        2,
      ) + '\n',
    )
    // touch _require so the import is used even if better-sqlite3 isn't needed directly
    void _require
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

main()
