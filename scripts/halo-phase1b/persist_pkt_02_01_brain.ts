/**
 * PKT-02-01 Brain/InfoStore persistence proof (development only).
 *
 * Executes the ACCEPTED real Honda-21043 Sales packet (SW-011..015), persists it
 * into a DISPOSABLE per-profile dev Brain (a fresh tmp profileRoot — never ~/.hermes,
 * never a production db), reads it back, replays it to prove idempotence, verifies
 * the deterministic content-hash reconstruction, and asserts the fail-closed / no-
 * delivery boundaries. Emits durable machine-readable evidence + an internal
 * checkpoint. The .db itself is disposable (tmp); only the JSON/markdown evidence is
 * durable.
 *
 * Usage: npx tsx scripts/halo-phase1b/persist_pkt_02_01_brain.ts
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { executePacket } from '../../src/server/reports/packet/engine'
import { canonicalJson } from '../../src/server/reports/packet/canonical'
import {
  listPacketRuns,
  persistPacketRun,
  readPacketRun,
  reconstructedContentSha,
} from '../../src/server/watchdog/packet-brain-store'

const _require = createRequire(import.meta.url)
const repoRoot = process.cwd()
const PROFILE = 'serra-honda'
const OUT = path.join(
  repoRoot,
  'docs/halo/evidence/honda-watchdog/phase1b/pkt-02-01/persistence',
)

function fail(msg: string): never {
  throw new Error(`[persist-proof] ${msg}`)
}

function main(): void {
  // Disposable dev Brain — fresh tmp profile root, removed at the end.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pkt0201-brain-proof-'))
  const profileRoot = path.join(tmp, PROFILE)
  const dbPath = path.join(profileRoot, 'brain', 'brain.db')

  try {
    const asOf = new Date().toISOString()
    const run = executePacket({ repoRoot, asOf, engineVersion: 'pkt-exec-1' })

    // 1) Persist.
    const first = persistPacketRun(run, { profile: PROFILE, profileRoot })
    if (!first.changed) fail('first persist reported no change')

    // 2) Read back and prove all five metrics exactly once.
    const stored = readPacketRun(run.run_key, { profile: PROFILE, profileRoot })
    if (!stored) fail('read-back returned null')
    const obsIds = stored.observations.map((o) => o.metric_id).sort()
    const expectIds = ['SW-011', 'SW-012', 'SW-013', 'SW-014', 'SW-015']
    if (canonicalJson(obsIds) !== canonicalJson(expectIds))
      fail(`metric id set mismatch: ${obsIds.join(',')}`)
    if (stored.dealer_id !== '21043') fail('dealer mismatch on read-back')
    if (stored.period !== '2026-08-24..2026-08-30') fail('period mismatch')

    // 3) Reconstructed content hash equals the pinned content_sha256.
    const rsha = reconstructedContentSha(run.run_key, { profile: PROFILE, profileRoot })
    if (rsha !== run.content_sha256)
      fail(`reconstructed sha mismatch: ${rsha} != ${run.content_sha256}`)

    // 4) Replay: a second identical persist changes nothing; no duplicate rows.
    const second = persistPacketRun(run, { profile: PROFILE, profileRoot })
    if (second.changed) fail('replay mutated the store (not idempotent)')
    const runs = listPacketRuns({ profile: PROFILE, profileRoot })
    if (runs.length !== 1) fail(`replay produced ${runs.length} runs, expected 1`)
    const after = readPacketRun(run.run_key, { profile: PROFILE, profileRoot })!
    if (after.observations.length !== 5) fail('replay changed observation count')

    // 5) Prove real sqlite (not the in-memory shim) + no delivery surface.
    if (!fs.existsSync(dbPath)) fail('no brain.db on disk (in-memory shim?)')
    const Sqlite = _require('better-sqlite3')
    const db = new Sqlite(dbPath, { readonly: true })
    let tables: Array<string>
    let notificationTablePresent: boolean
    let rowCounts: Record<string, number>
    try {
      tables = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'watchdog_packet_%' ORDER BY name`,
        )
        .all()
        .map((r: { name: string }) => r.name)
      notificationTablePresent =
        db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='notification'`,
          )
          .get() !== undefined
      rowCounts = Object.fromEntries(
        tables.map((t) => [
          t,
          (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n,
        ]),
      )
    } finally {
      db.close()
    }
    if (notificationTablePresent)
      fail('adapter touched the operational notification (delivery) table')

    // 6) Boundary proofs from the read-back.
    const measured = stored.observations.filter((o) => o.status === 'measured')
    const pending = stored.observations.filter(
      (o) => o.status === 'source_investigation_pending',
    )
    for (const o of pending) {
      if (o.value !== null || o.numerator !== null || o.denominator !== null)
        fail(`${o.metric_id} pending but carries a value (missing != zero)`)
    }
    for (const a of stored.alert_candidates) {
      if (a.delivered !== false || a.unsent !== true)
        fail(`${a.metric_id} alert candidate is not UNSENT`)
    }

    const evidence = {
      artifact: 'honda-watchdog-pkt-02-01-brain-persistence-proof',
      generated_note:
        'Deterministic content (no wall-clock). The dev brain.db is disposable (tmp); only this evidence is durable.',
      packet_id: stored.packet_id,
      module: stored.module,
      profile: stored.profile,
      dealer_id: stored.dealer_id,
      period: stored.period,
      binding_sha256: stored.binding_sha256,
      source_sha256: stored.source_sha256,
      engine_version: stored.engine_version,
      run_key: stored.run_key,
      content_sha256: stored.content_sha256,
      reconstructed_content_sha256: rsha,
      reconstructed_equals_pinned: rsha === stored.content_sha256,
      persistence_surface: {
        kind: 'per-profile Brain (better-sqlite3)',
        location_pattern: '~/.hermes/profiles/<profile>/brain/brain.db',
        convention: 'feature-owned watchdog tables (CREATE TABLE IF NOT EXISTS)',
        in_memory_shim: false,
        tables,
        row_counts: rowCounts,
      },
      lifecycle_partition: stored.lifecycle_partition,
      reconciliation: stored.reconciliation,
      evidence_delta: stored.report_lineage.evidence_delta,
      idempotence: {
        first_persist_changed: first.changed,
        replay_changed: second.changed,
        runs_after_replay: runs.length,
      },
      metrics: stored.observations.map((o) => {
        const e = stored.evaluations.find((x) => x.metric_id === o.metric_id)!
        return {
          metric_id: o.metric_id,
          status: o.status,
          value: o.value,
          unit: o.unit,
          numerator: o.numerator,
          denominator: o.denominator,
          missing: o.missing,
          gradable: o.gradable,
          grade_target_id: e.grade_target_id,
          threshold_id: e.threshold_id,
          comparator: e.comparator,
          threshold: e.threshold,
          detection_rule: e.detection_rule,
          detection_fired: e.detection_fired,
          rating: e.rating,
          source_investigation_missing_fields:
            o.source_investigation?.missing_fields ?? null,
        }
      }),
      alert_candidates: stored.alert_candidates.map((a) => ({
        metric_id: a.metric_id,
        would_fire: a.would_fire,
        channel: a.channel,
        delivered: a.delivered,
        unsent: a.unsent,
      })),
      boundary_proofs: {
        zero_service_parts: stored.report_lineage.evidence_delta.sales_only_proof,
        missing_preserved_as_null: pending.every((o) => o.value === null),
        measured_count: measured.length,
        pending_count: pending.length,
        no_delivery_side_effect: !notificationTablePresent,
        notification_delivery_table_present: notificationTablePresent,
      },
    }

    fs.mkdirSync(OUT, { recursive: true })
    fs.writeFileSync(
      path.join(OUT, 'PKT-02-01_persistence_evidence.json'),
      JSON.stringify(JSON.parse(canonicalJson(evidence)), null, 2) + '\n',
    )
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          run_key: stored.run_key,
          content_sha256: stored.content_sha256,
          reconstructed_equals_pinned: evidence.reconstructed_equals_pinned,
          idempotent: !second.changed,
          tables,
          row_counts: rowCounts,
        },
        null,
        2,
      ) + '\n',
    )
  } finally {
    // Disposable: remove the dev brain entirely (rollback = deletion).
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

main()
