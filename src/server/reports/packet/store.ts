/**
 * PKT-02-01 dev-only packet store — filesystem-backed, deterministic, append-only.
 *
 * Persists a PacketRun as:
 *   runs/<run_key>/manifest.json     deterministic content of record + content_sha256
 *   runs/<run_key>/provenance.json   wall-clock provenance (as_of, engine_version)
 *   observations/<period>/<id>.json  per-metric observation (period history)
 *   evaluations/<period>/<id>.json   per-metric evaluation
 *   findings/<period>.json           findings
 *   report-lineage/<period>.json     two-delta proof
 *   alerts/<period>.json             UNSENT alert simulations
 *
 * Properties:
 *   - replay: reconstruct the content of record from the manifest and re-hash it;
 *   - idempotence: re-persisting identical content is a no-op (byte-identical);
 *   - period history: a new period adds directories, never mutates prior ones;
 *   - tamper detection: verify() re-hashes the manifest content AND cross-checks
 *     every derived record against it — any out-of-band mutation throws;
 *   - deterministic rebuild: same run -> byte-identical manifest in any store.
 *
 * This is a DEV store: rollback is `git checkout`/directory removal — nothing here
 * writes to production, a database, or the accepted immutable evidence.
 */
import fs from 'node:fs'
import path from 'node:path'
import { canonicalJson, sha256Hex } from './canonical'
import type {
  AlertSimulation,
  Evaluation,
  Finding,
  Observation,
  PacketRun,
  TwoDelta,
} from './engine'

export class StoreIntegrityError extends Error {}

type ManifestContent = {
  packet_id: string
  module: number
  dealer_id: string
  period: string
  binding_sha256: string
  source_sha256: string
  engine_version: string
  lifecycle_partition: Record<string, Array<string>>
  observations: Array<Observation>
  evaluations: Array<Evaluation>
  findings: Array<Finding>
  two_delta: TwoDelta
  alert_simulations: Array<AlertSimulation>
  reconciliation: PacketRun['reconciliation']
}

type StoredManifest = {
  run_key: string
  content_sha256: string
  period: string
  binding_sha256: string
  source_sha256: string
  content: ManifestContent
}

function extractContent(run: PacketRun): ManifestContent {
  return {
    packet_id: run.packet_id,
    module: run.module,
    dealer_id: run.dealer_id,
    period: run.period,
    binding_sha256: run.binding_sha256,
    source_sha256: run.source_sha256,
    engine_version: run.engine_version,
    lifecycle_partition: run.lifecycle_partition,
    observations: run.observations,
    evaluations: run.evaluations,
    findings: run.findings,
    two_delta: run.two_delta,
    alert_simulations: run.alert_simulations,
    reconciliation: run.reconciliation,
  }
}

/** Recompute the deterministic content hash of a run (matches the engine). */
export function contentSha(run: PacketRun): string {
  return sha256Hex(canonicalJson(extractContent(run)))
}

export type PersistResult = {
  changed: boolean
  runKey: string
  files: Array<string>
}

export class PacketStore {
  constructor(private readonly root: string) {
    fs.mkdirSync(root, { recursive: true })
  }

  private p(...parts: Array<string>): string {
    return path.join(this.root, ...parts)
  }

  manifestPath(runKey: string): string {
    return this.p('runs', runKey, 'manifest.json')
  }

  observationPath(period: string, metricId: string): string {
    return this.p('observations', period, `${metricId}.json`)
  }

  evaluationPath(period: string, metricId: string): string {
    return this.p('evaluations', period, `${metricId}.json`)
  }

  hasRun(runKey: string): boolean {
    return fs.existsSync(this.manifestPath(runKey))
  }

  periods(): Array<string> {
    const dir = this.p('observations')
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir)
      .filter((d) => fs.statSync(path.join(dir, d)).isDirectory())
      .sort()
  }

  private write(file: string, obj: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // Deterministic, stable bytes (canonical + pretty for human diff review).
    fs.writeFileSync(
      file,
      JSON.stringify(JSON.parse(canonicalJson(obj)), null, 2),
    )
  }

  persist(run: PacketRun): PersistResult {
    const content = extractContent(run)
    const recomputed = sha256Hex(canonicalJson(content))
    if (recomputed !== run.content_sha256) {
      throw new StoreIntegrityError(
        `refusing to persist: content_sha256 mismatch ${recomputed} != ${run.content_sha256}`,
      )
    }
    const manifest: StoredManifest = {
      run_key: run.run_key,
      content_sha256: run.content_sha256,
      period: run.period,
      binding_sha256: run.binding_sha256,
      source_sha256: run.source_sha256,
      content,
    }
    const manifestBytes = JSON.stringify(
      JSON.parse(canonicalJson(manifest)),
      null,
      2,
    )
    const mp = this.manifestPath(run.run_key)
    if (fs.existsSync(mp) && fs.readFileSync(mp, 'utf8') === manifestBytes) {
      return { changed: false, runKey: run.run_key, files: [] }
    }

    const files: Array<string> = []
    const emit = (file: string, obj: unknown): void => {
      this.write(file, obj)
      files.push(file)
    }

    emit(mp, manifest)
    emit(this.p('runs', run.run_key, 'provenance.json'), {
      run_key: run.run_key,
      as_of: run.as_of,
      engine_version: run.engine_version,
    })
    for (const o of run.observations)
      emit(this.observationPath(run.period, o.metric_id), o)
    for (const e of run.evaluations)
      emit(this.evaluationPath(run.period, e.metric_id), e)
    emit(this.p('findings', `${run.period}.json`), run.findings)
    emit(this.p('report-lineage', `${run.period}.json`), run.two_delta)
    emit(this.p('alerts', `${run.period}.json`), run.alert_simulations)

    return { changed: true, runKey: run.run_key, files }
  }

  private readManifest(runKey: string): StoredManifest {
    const mp = this.manifestPath(runKey)
    if (!fs.existsSync(mp))
      throw new StoreIntegrityError(`no manifest for run ${runKey}`)
    return JSON.parse(fs.readFileSync(mp, 'utf8')) as StoredManifest
  }

  /** Reconstruct the content of record and return its recomputed content hash. */
  reconstructedSha(runKey: string): string {
    const manifest = this.readManifest(runKey)
    return sha256Hex(canonicalJson(manifest.content))
  }

  /** Fail-closed integrity: manifest self-consistency + every derived record. */
  verify(runKey: string): void {
    const manifest = this.readManifest(runKey)
    if (this.reconstructedSha(runKey) !== manifest.content_sha256) {
      throw new StoreIntegrityError(
        `content_sha256 mismatch for ${runKey}: manifest content was tampered`,
      )
    }
    const c = manifest.content
    const compare = (file: string, expected: unknown, label: string): void => {
      if (!fs.existsSync(file))
        throw new StoreIntegrityError(`missing derived record: ${label}`)
      const got = canonicalJson(JSON.parse(fs.readFileSync(file, 'utf8')))
      if (got !== canonicalJson(expected)) {
        throw new StoreIntegrityError(`derived record tampered: ${label}`)
      }
    }
    for (const o of c.observations)
      compare(
        this.observationPath(c.period, o.metric_id),
        o,
        `observation ${o.metric_id}`,
      )
    for (const e of c.evaluations)
      compare(
        this.evaluationPath(c.period, e.metric_id),
        e,
        `evaluation ${e.metric_id}`,
      )
    compare(this.p('findings', `${c.period}.json`), c.findings, 'findings')
    compare(
      this.p('report-lineage', `${c.period}.json`),
      c.two_delta,
      'report-lineage',
    )
    compare(this.p('alerts', `${c.period}.json`), c.alert_simulations, 'alerts')
  }
}
