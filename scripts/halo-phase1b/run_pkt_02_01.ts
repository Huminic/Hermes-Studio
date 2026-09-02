/**
 * PKT-02-01 dev execution runner.
 *
 * Executes SW-011..015 for Serra Honda 21043 Sales end-to-end, persists the run to
 * the dev packet store, writes the customer-safe mini-report + internal companion +
 * a deterministic machine-readable run manifest, and verifies store integrity.
 *
 * Read-only inputs (frozen binding + reused accepted Leads bytes). No network, no
 * delivery, no production. `as_of` is the REAL execution time (honest chronology);
 * it lives only in provenance, never in the deterministic content of record.
 *
 * Usage: npx tsx scripts/halo-phase1b/run_pkt_02_01.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { executePacket } from '../../src/server/reports/packet/engine'
import {
  buildCustomerReport,
  buildInternalCompanion,
} from '../../src/server/reports/packet/report'
import { PacketStore } from '../../src/server/reports/packet/store'
import { canonicalJson } from '../../src/server/reports/packet/canonical'

const repoRoot = process.cwd()
const OUT = path.join(
  repoRoot,
  'docs/halo/evidence/honda-watchdog/phase1b/pkt-02-01',
)

function main(): void {
  const asOf = new Date().toISOString()
  const run = executePacket({
    repoRoot,
    asOf,
    engineVersion: 'pkt-exec-1',
  })

  fs.mkdirSync(OUT, { recursive: true })
  const store = new PacketStore(path.join(OUT, 'store'))
  const res = store.persist(run)
  store.verify(run.run_key)

  // Deterministic machine-readable run manifest (no wall-clock -> no churn).
  const manifest = JSON.parse(
    fs.readFileSync(store.manifestPath(run.run_key), 'utf8'),
  )
  fs.writeFileSync(
    path.join(OUT, 'PKT-02-01_run_manifest.json'),
    JSON.stringify(JSON.parse(canonicalJson(manifest)), null, 2) + '\n',
  )
  fs.writeFileSync(
    path.join(OUT, 'PKT-02-01_customer_mini_report.md'),
    buildCustomerReport(run) + '\n',
  )
  fs.writeFileSync(
    path.join(OUT, 'PKT-02-01_internal_companion.md'),
    buildInternalCompanion(run) + '\n',
  )

  const summary = {
    packet_id: run.packet_id,
    period: run.period,
    binding_sha256: run.binding_sha256,
    source_sha256: run.source_sha256,
    run_key: run.run_key,
    content_sha256: run.content_sha256,
    store_changed: res.changed,
    reconciliation_ok: run.reconciliation.ok,
    measured: run.observations
      .filter((o) => o.status === 'measured')
      .map((o) => ({
        id: o.metric_id,
        value: o.value,
        unit: o.unit,
        numerator: o.numerator,
        denominator: o.denominator,
        rating: run.evaluations.find((e) => e.metric_id === o.metric_id)
          ?.rating,
      })),
    pending: run.observations
      .filter((o) => o.status === 'source_investigation_pending')
      .map((o) => ({
        id: o.metric_id,
        missing_fields: o.source_investigation?.missing_fields,
      })),
    alert_simulations: run.alert_simulations.map((a) => ({
      id: a.metric_id,
      would_fire: a.would_fire,
      delivered: a.delivered,
    })),
  }
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
}

main()
