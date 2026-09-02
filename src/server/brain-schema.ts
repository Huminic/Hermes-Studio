/**
 * Brain schema definitions and migrations.
 *
 * The per-profile Brain database lives at
 *   ~/.hermes/profiles/<profile>/brain/brain.db
 *
 * Migrations are append-only and versioned by monotonic integer. Each
 * migration carries a SHA-256 checksum of its SQL body so the runtime
 * can detect tampered or out-of-order applications and refuse to start.
 *
 * Schema follows the SRS Tranche A baseline:
 *   - metadata_audit (A.5 / sixth invariant — also B.1 audit_records)
 *   - chat_records (A.6 memorialization)
 *   - lookup_misses + assumptions (A.7 lookup miss + assumption surfacing)
 *   - hunches (B.2; foundation needed for A.8 Hermes self-improvement)
 *   - source_references (B.1; required by DSG gate)
 *   - self_improvement_events (A.8 Cron-driven Hermes watcher records)
 *
 * Tranche B populates the remaining record families (events, entities,
 * entity_projections, tasks, transactions, outputs, observations,
 * reconciliation_items, retrieval_context_snapshots,
 * suggested_knowledge_changes) on top of this baseline.
 */

import { createHash } from 'node:crypto'

export type Migration = {
  version: number
  name: string
  sql: string
}

export const MIGRATIONS: Array<Migration> = [
  {
    version: 1,
    name: 'baseline_tranche_a',
    sql: `
-- Tranche A baseline: metadata substrate + memorialization + lookup miss + hunches + source refs.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL,
  checksum TEXT NOT NULL
);

-- A.5 Always-on metadata substrate (sixth wiki invariant).
-- Append-only audit of every interaction with wiki and Brain.
-- Implements B.1 audit_records.
CREATE TABLE IF NOT EXISTS metadata_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  surface TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  version_before TEXT,
  version_after TEXT,
  reason TEXT,
  gate_event_id TEXT,
  confidence_state TEXT,
  source_refs TEXT,
  outcome TEXT,
  rule TEXT
);
CREATE INDEX IF NOT EXISTS metadata_audit_ts ON metadata_audit(ts DESC);
CREATE INDEX IF NOT EXISTS metadata_audit_target ON metadata_audit(target_type, target_id);
CREATE INDEX IF NOT EXISTS metadata_audit_actor ON metadata_audit(actor);
CREATE INDEX IF NOT EXISTS metadata_audit_surface ON metadata_audit(surface, ts DESC);

-- A.6 Memorialization of chats and back-end interactions.
CREATE TABLE IF NOT EXISTS chat_records (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  channel TEXT NOT NULL,
  thread_id TEXT,
  participants TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  source_refs TEXT,
  decision_context_id TEXT
);
CREATE INDEX IF NOT EXISTS chat_records_thread ON chat_records(thread_id, ts);
CREATE INDEX IF NOT EXISTS chat_records_decision ON chat_records(decision_context_id);
CREATE INDEX IF NOT EXISTS chat_records_channel ON chat_records(channel, ts DESC);

-- A.7 Lookup misses.
CREATE TABLE IF NOT EXISTS lookup_misses (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,
  scope TEXT,
  query TEXT NOT NULL,
  downstream_decision TEXT,
  assumption_id TEXT,
  operator_visible INTEGER NOT NULL DEFAULT 1,
  resolved_at INTEGER,
  resolution TEXT,
  resolution_notes TEXT
);
CREATE INDEX IF NOT EXISTS lookup_misses_actor ON lookup_misses(actor, ts);
CREATE INDEX IF NOT EXISTS lookup_misses_visible ON lookup_misses(operator_visible, resolved_at);

-- A.7 Assumptions surfaced for operator review.
CREATE TABLE IF NOT EXISTS assumptions (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,
  lookup_miss_id TEXT,
  statement TEXT NOT NULL,
  context TEXT,
  status TEXT NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT,
  resolution_notes TEXT,
  suggested_knowledge_change_id TEXT
);
CREATE INDEX IF NOT EXISTS assumptions_status ON assumptions(status, ts DESC);

-- B.2 Hunches (advisor outputs from KSG/DSG).
CREATE TABLE IF NOT EXISTS hunches (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  originating_guardian TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  statement TEXT NOT NULL,
  evidence_refs TEXT,
  confidence_label TEXT,
  status TEXT NOT NULL,
  proposed_action TEXT,
  resolver_actor TEXT,
  resolved_at INTEGER,
  resolution_notes TEXT
);
CREATE INDEX IF NOT EXISTS hunches_status ON hunches(status, ts DESC);
CREATE INDEX IF NOT EXISTS hunches_subject ON hunches(subject_type, subject_id);

-- B.1 Source references (required on records influencing execution / reporting).
CREATE TABLE IF NOT EXISTS source_references (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  reference_type TEXT NOT NULL,
  reference_value TEXT NOT NULL,
  reference_metadata TEXT
);
CREATE INDEX IF NOT EXISTS source_references_type ON source_references(reference_type, ts DESC);

-- A.8 Hermes self-improvement event log.
CREATE TABLE IF NOT EXISTS self_improvement_events (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  change_type TEXT NOT NULL,
  before_checksum TEXT,
  after_checksum TEXT,
  routed_to TEXT NOT NULL,
  hunch_id TEXT,
  resolution TEXT
);
CREATE INDEX IF NOT EXISTS self_improvement_events_ts ON self_improvement_events(ts DESC);
CREATE INDEX IF NOT EXISTS self_improvement_events_file ON self_improvement_events(file_path, ts DESC);
`,
  },
  {
    version: 2,
    name: 'tranche_b_record_families',
    sql: `
-- Tranche B baseline record families.

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  payload TEXT NOT NULL,
  source_refs TEXT,
  tenant TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_ts ON events(ts DESC);
CREATE INDEX IF NOT EXISTS events_type ON events(type, ts DESC);
CREATE INDEX IF NOT EXISTS events_subject ON events(subject_type, subject_id, ts DESC);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  external_id TEXT,
  display_name TEXT,
  attributes TEXT NOT NULL,
  source_refs TEXT,
  tenant TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS entities_type ON entities(type, updated_at DESC);
CREATE INDEX IF NOT EXISTS entities_external ON entities(type, external_id);

CREATE TABLE IF NOT EXISTS entity_projections (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  projection_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  computed_at INTEGER NOT NULL,
  tenant TEXT NOT NULL,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS entity_projections_entity ON entity_projections(entity_id, projection_type);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  assigned_to TEXT,
  subject_type TEXT,
  subject_id TEXT,
  description TEXT NOT NULL,
  due_at INTEGER,
  source_refs TEXT,
  tenant TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_status ON tasks(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS tasks_assignee ON tasks(assigned_to, status);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount_value REAL,
  amount_currency TEXT,
  payload TEXT NOT NULL,
  source_refs TEXT,
  tenant TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS transactions_ts ON transactions(ts DESC);

CREATE TABLE IF NOT EXISTS outputs (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  producer_actor TEXT NOT NULL,
  output_type TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  source_refs TEXT,
  tenant TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS outputs_producer ON outputs(producer_actor, ts DESC);
CREATE INDEX IF NOT EXISTS outputs_type ON outputs(output_type, ts DESC);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  observer TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  observation TEXT NOT NULL,
  confidence_label TEXT,
  source_refs TEXT,
  tenant TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS observations_ts ON observations(ts DESC);
CREATE INDEX IF NOT EXISTS observations_subject ON observations(subject_type, subject_id);

CREATE TABLE IF NOT EXISTS reconciliation_items (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  conflict_type TEXT NOT NULL,
  wiki_ref TEXT,
  brain_ref TEXT,
  lineage TEXT NOT NULL,
  status TEXT NOT NULL,
  proposed_resolution TEXT,
  resolved_at INTEGER,
  resolved_by TEXT,
  resolution_notes TEXT,
  tenant TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reconciliation_items_status ON reconciliation_items(status, ts DESC);

CREATE TABLE IF NOT EXISTS retrieval_context_snapshots (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,
  decision_id TEXT,
  query TEXT,
  retrieved_refs TEXT NOT NULL,
  reasoning TEXT,
  tenant TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS retrieval_context_snapshots_decision ON retrieval_context_snapshots(decision_id);

CREATE TABLE IF NOT EXISTS suggested_knowledge_changes (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  proposer TEXT NOT NULL,
  target_wiki_path TEXT,
  change_type TEXT NOT NULL,
  diff TEXT NOT NULL,
  rationale TEXT NOT NULL,
  source_refs TEXT,
  status TEXT NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT,
  resolution_notes TEXT,
  tenant TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS suggested_knowledge_changes_status ON suggested_knowledge_changes(status, ts DESC);

-- B.4 Adjacent data neighbor records (mirror of engagement-state list)
CREATE TABLE IF NOT EXISTS adjacent_neighbors (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  likelihood TEXT,
  classification TEXT NOT NULL,
  notes TEXT,
  tenant TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS adjacent_neighbors_classification ON adjacent_neighbors(classification);

-- B.6 Embeddings index (vectors stored as BLOB in this column or in a separate file)
CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  model TEXT NOT NULL,
  dim INTEGER NOT NULL,
  vector BLOB NOT NULL,
  chunk_text TEXT,
  tenant TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS embeddings_source ON embeddings(source_table, source_id);
CREATE INDEX IF NOT EXISTS embeddings_model ON embeddings(model);
`,
  },
  {
    version: 3,
    name: 'tranche_d_uploads',
    sql: `
-- Tranche D upload surface metadata.
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  uploader TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  storage_path TEXT NOT NULL,
  checksum TEXT NOT NULL,
  classification TEXT NOT NULL,
  source_refs TEXT,
  tenant TEXT NOT NULL,
  embedded INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS uploads_ts ON uploads(ts DESC);
CREATE INDEX IF NOT EXISTS uploads_uploader ON uploads(uploader, ts DESC);

-- Tranche D communications memorialization (mirrors messaging-hub events with extra DSG metadata).
CREATE TABLE IF NOT EXISTS comms_log (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  direction TEXT NOT NULL,
  channel TEXT NOT NULL,
  actor TEXT NOT NULL,
  recipients TEXT NOT NULL,
  subject TEXT,
  body_summary TEXT,
  external_id TEXT,
  outcome TEXT NOT NULL,
  audit_id INTEGER,
  tenant TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS comms_log_ts ON comms_log(ts DESC);
CREATE INDEX IF NOT EXISTS comms_log_channel ON comms_log(channel, ts DESC);
`,
  },
  {
    version: 4,
    name: 'tranche_b_adjacent_neighbors_source_refs',
    sql: `
-- adjacent_neighbors was created in v2 without source_refs; DSG requires it.
ALTER TABLE adjacent_neighbors ADD COLUMN source_refs TEXT;
`,
  },
  {
    version: 5,
    name: 'watchdog_canonical_infostore',
    sql: `
-- Canonical Semantic Watchdog InfoStore (execution spec §7, with §6.1/§6.3 record
-- fields). Additive, versioned, profile-scoped, append-oriented. This is the
-- reusable §7 owner for the full 11-module / 295-metric catalog across repeated
-- periods; it supersedes the packet-specific watchdog_packet_* adapter as the write
-- path for new packets, while those legacy tables remain (untouched) for rollback.
--
-- Multi-period / multi-module safety (validated before the adapter):
--   * metric definitions are TRULY versioned — PK (metric_id, metric_version) — and
--     every definition FK binds the version, so a formula change is a new immutable
--     definition row, not an overwrite;
--   * run-scoped rows key on run_key (+metric), so the same metric recurs across
--     periods without collision;
--   * a final report spans many module runs via watchdog_report_run_module_link and
--     an explicit immutable module_run_ids set — never a single run_key.
--
-- Invariants (spec §7): one profile/tenant per DB; append-only observations/
-- evaluations; idempotent run/artifact keys; immutable source hashes; versioned
-- formulas/baselines; explicit missing (NULL, never zero); reproducible report-as-of
-- reconstruction; rollback by disabling a pipeline version, never deleting history.
-- FKs are ON (brain-store opens PRAGMA foreign_keys=ON); parents precede children.

-- Reuse the EXISTING operational finding table exactly (never a competing table).
-- Byte-for-byte the schema watchdog-store.ts::ensure() creates; IF NOT EXISTS so
-- whichever path runs first wins and the other is an inert no-op.
CREATE TABLE IF NOT EXISTS watchdog_finding (
  key         TEXT PRIMARY KEY,
  profile     TEXT NOT NULL,
  rule_id     TEXT NOT NULL,
  category    TEXT NOT NULL,
  priority    TEXT NOT NULL,
  issue       TEXT NOT NULL,
  name        TEXT NOT NULL,
  details     TEXT NOT NULL,
  evidence    TEXT,
  status      TEXT NOT NULL DEFAULT 'open',
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  alerted_at  INTEGER
);
CREATE INDEX IF NOT EXISTS watchdog_finding_status ON watchdog_finding(profile, status, priority);

-- §7.1 metric definition — TRULY versioned; composite identity (metric_id,
-- metric_version). required_fields (direct source columns) is stored SEPARATELY from
-- required_sources (upstream source ids).
CREATE TABLE IF NOT EXISTS watchdog_metric_definition (
  metric_id             TEXT NOT NULL,
  metric_version        TEXT NOT NULL,
  module                INTEGER NOT NULL,
  business_question     TEXT,
  boundary_class        TEXT,
  population            TEXT,
  calculation_kind      TEXT,
  null_missing_behavior TEXT,
  unit                  TEXT NOT NULL,
  polarity              TEXT,
  window                TEXT,
  timezone              TEXT,
  cadence               TEXT,
  formula               TEXT,
  numerator_definition  TEXT,
  denominator_definition TEXT,
  required_fields       TEXT,
  required_sources      TEXT,
  impact_method         TEXT,
  gradable              INTEGER NOT NULL CHECK (gradable IN (0, 1)),
  sensitivity_class     TEXT,
  effective_start       TEXT,
  effective_end         TEXT,
  definition_status     TEXT NOT NULL,
  PRIMARY KEY (metric_id, metric_version)
);

-- §7.2 detection rule — trigger/threshold; a comparison reference never mutates it.
CREATE TABLE IF NOT EXISTS watchdog_detection_rule (
  detection_rule_id     TEXT PRIMARY KEY,
  metric_id             TEXT NOT NULL,
  metric_version        TEXT NOT NULL,
  threshold_id          TEXT,
  condition             TEXT,
  comparator            TEXT,
  threshold             REAL,
  provenance            TEXT,
  effective_start       TEXT,
  effective_end         TEXT,
  approval_state        TEXT,
  status                TEXT,
  evaluation_semantics  TEXT,
  FOREIGN KEY (metric_id, metric_version)
    REFERENCES watchdog_metric_definition(metric_id, metric_version)
);
CREATE INDEX IF NOT EXISTS watchdog_detection_rule_metric ON watchdog_detection_rule(metric_id, metric_version);

-- §7.3 source artifact — admitted Sales-only artifacts only. Idempotent per
-- (profile, source_sha256, dealer, period).
-- This table holds ADMITTED rows only, so family/source_type/dealer_period_result/
-- admission_receipt are NOT NULL (a rejected/contaminated artifact never lands here).
CREATE TABLE IF NOT EXISTS watchdog_source_artifact (
  source_artifact_id    TEXT PRIMARY KEY,
  profile               TEXT NOT NULL,
  family                TEXT NOT NULL,
  source_type           TEXT NOT NULL,
  raw_location          TEXT,
  source_sha256         TEXT NOT NULL,
  dealer_id             TEXT NOT NULL,
  period                TEXT NOT NULL,
  schema_version        TEXT,
  schema_contract_sha256 TEXT,
  receipt_sha256        TEXT,
  bytes                 INTEGER,
  row_count             INTEGER,
  dealer_period_result  TEXT NOT NULL,
  admission_receipt     TEXT NOT NULL,
  UNIQUE (profile, source_sha256, dealer_id, period)
);

-- §7.4 normalized dataset — reproducible normalization lineage. transform_config_hash
-- (config/params) is stored SEPARATELY from transformation_code_hash (the code).
CREATE TABLE IF NOT EXISTS watchdog_normalized_dataset (
  normalized_dataset_id TEXT PRIMARY KEY,
  source_artifact_id    TEXT NOT NULL,
  profile               TEXT NOT NULL,
  dealer_id             TEXT NOT NULL,
  period                TEXT NOT NULL,
  normalized_sha256     TEXT,
  filter_spec           TEXT,
  row_key_set_hash      TEXT,
  row_key_set_hash_method TEXT,
  timezone              TEXT,
  as_of                 TEXT,
  watermark             TEXT,
  late_correction_version INTEGER,
  transform_config_hash TEXT,
  transformation_code_hash TEXT,
  join_keys             TEXT,
  join_cardinality      TEXT,
  unmatched_counts      TEXT,
  io_reconciliation     TEXT,
  FOREIGN KEY (source_artifact_id) REFERENCES watchdog_source_artifact(source_artifact_id)
);
CREATE INDEX IF NOT EXISTS watchdog_normalized_dataset_source ON watchdog_normalized_dataset(source_artifact_id);

-- §6.1 capability snapshot — period-specific capacity context (optional per run).
-- Revisioned: a late correction is a NEW revision, not an overwrite; uniqueness is
-- per (profile, dealer, period, revision) so no single irreversible row is forced.
CREATE TABLE IF NOT EXISTS watchdog_capability_snapshot (
  capability_snapshot_id TEXT PRIMARY KEY,
  profile               TEXT NOT NULL,
  dealer_id             TEXT NOT NULL,
  period                TEXT NOT NULL,
  revision              INTEGER NOT NULL DEFAULT 1,
  supersedes_id         TEXT,
  throughput            TEXT,
  workforce             TEXT,
  workload_capacity     TEXT,
  inventory_context     TEXT,
  source_mix            TEXT,
  dealer_history        TEXT,
  seasonality_flags     TEXT,
  manual_potential      TEXT,
  provenance            TEXT,
  UNIQUE (profile, dealer_id, period, revision)
);

-- §6.3 comparison reference — reference-only context (never the trigger). Preserves
-- publication/validity/capability/input/minimum-sample/history fields.
-- Version-addressable: PK (reference_id, reference_version); an evaluation names the
-- EXACT (reference_id, reference_version) it used.
CREATE TABLE IF NOT EXISTS watchdog_comparison_reference (
  reference_id          TEXT NOT NULL,
  reference_version     TEXT NOT NULL,
  metric_id             TEXT NOT NULL,
  metric_version        TEXT NOT NULL,
  profile               TEXT NOT NULL,
  basis                 TEXT,
  formula               TEXT,
  value_or_range        TEXT,
  unit                  TEXT,
  comparator            TEXT,
  polarity              TEXT,
  source                TEXT,
  publication_date      TEXT,
  valid_period          TEXT,
  capability_snapshot_id TEXT,
  inputs                TEXT,
  assumptions           TEXT,
  minimum_sample        TEXT,
  history_ref           TEXT,
  confidence            TEXT,
  compatibility_result  TEXT,
  approval_state        TEXT,
  status                TEXT,
  derivation_narrative  TEXT,
  PRIMARY KEY (reference_id, reference_version),
  FOREIGN KEY (metric_id, metric_version)
    REFERENCES watchdog_metric_definition(metric_id, metric_version),
  FOREIGN KEY (capability_snapshot_id)
    REFERENCES watchdog_capability_snapshot(capability_snapshot_id)
);
CREATE INDEX IF NOT EXISTS watchdog_comparison_reference_metric ON watchdog_comparison_reference(metric_id, metric_version);

-- §6.3 grade target — the one approved grading target for a gradable metric. Same
-- durable publication/validity/capability/input/minimum-sample/history contract.
-- Version-addressable: PK (grade_target_id, target_version); an evaluation names the
-- EXACT (grade_target_id, target_version) it graded against.
CREATE TABLE IF NOT EXISTS watchdog_grade_target (
  grade_target_id       TEXT NOT NULL,
  target_version        TEXT NOT NULL,
  metric_id             TEXT NOT NULL,
  metric_version        TEXT NOT NULL,
  profile               TEXT NOT NULL,
  basis                 TEXT,
  value_or_range        TEXT,
  unit                  TEXT,
  comparator            TEXT,
  polarity              TEXT,
  source                TEXT,
  provenance            TEXT,
  publication_date      TEXT,
  effective_start       TEXT,
  effective_end         TEXT,
  valid_period          TEXT,
  capability_snapshot_id TEXT,
  inputs                TEXT,
  assumptions           TEXT,
  minimum_sample        TEXT,
  history_ref           TEXT,
  confidence            TEXT,
  compatibility_result  TEXT,
  approval_state        TEXT,
  status                TEXT,
  derivation_narrative  TEXT,
  PRIMARY KEY (grade_target_id, target_version),
  FOREIGN KEY (metric_id, metric_version)
    REFERENCES watchdog_metric_definition(metric_id, metric_version),
  FOREIGN KEY (capability_snapshot_id)
    REFERENCES watchdog_capability_snapshot(capability_snapshot_id)
);
CREATE INDEX IF NOT EXISTS watchdog_grade_target_metric ON watchdog_grade_target(metric_id, metric_version);

-- §7.10 module run — THE canonical run anchor (identity + lifecycle partitions +
-- reconciliation/QC + acceptance). Carries the run-level two-delta report_lineage
-- that is part of the content-of-record. Children reference run_key here.
CREATE TABLE IF NOT EXISTS watchdog_module_run (
  run_key               TEXT PRIMARY KEY,
  profile               TEXT NOT NULL,
  packet_id             TEXT NOT NULL,
  module                INTEGER NOT NULL,
  dealer_id             TEXT NOT NULL,
  period                TEXT NOT NULL,
  binding_sha256        TEXT NOT NULL,
  source_sha256         TEXT NOT NULL,
  engine_version        TEXT NOT NULL,
  content_sha256        TEXT NOT NULL,
  expected_subset       TEXT NOT NULL,
  accepted_measured_ids TEXT NOT NULL,
  accepted_disposition_only_ids TEXT NOT NULL,
  rejected_ids          TEXT NOT NULL,
  lifecycle_partition   TEXT NOT NULL,
  report_lineage        TEXT NOT NULL,
  input_hash            TEXT,
  output_hash           TEXT,
  reconciliation        TEXT NOT NULL,
  qc_result             TEXT,
  acceptance_state      TEXT NOT NULL,
  graph_manifest        TEXT,
  graph_sha256          TEXT,
  as_of                 TEXT NOT NULL,
  persisted_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS watchdog_module_run_profile ON watchdog_module_run(profile, period);

-- §7.8 metric observation — append-only; missing stays NULL, never zero. Binds the
-- versioned definition (metric_id, metric_version).
CREATE TABLE IF NOT EXISTS watchdog_metric_observation (
  run_key               TEXT NOT NULL,
  metric_id             TEXT NOT NULL,
  metric_version        TEXT NOT NULL,
  profile               TEXT NOT NULL,
  period                TEXT NOT NULL,
  status                TEXT NOT NULL,
  calculation_kind      TEXT NOT NULL,
  value                 REAL,
  unit                  TEXT NOT NULL,
  numerator             REAL,
  denominator           REAL,
  missing               REAL,
  formula               TEXT,
  source_fields         TEXT NOT NULL,
  source_lineage        TEXT NOT NULL,
  normalized_dataset_id TEXT,
  confidence            TEXT NOT NULL,
  gradable              INTEGER NOT NULL CHECK (gradable IN (0, 1)),
  disposition           TEXT,
  unresolved_reason     TEXT,
  detail                TEXT,
  source_investigation  TEXT,
  PRIMARY KEY (run_key, metric_id),
  UNIQUE (run_key, metric_id, metric_version),
  FOREIGN KEY (run_key) REFERENCES watchdog_module_run(run_key),
  FOREIGN KEY (metric_id, metric_version)
    REFERENCES watchdog_metric_definition(metric_id, metric_version)
);
CREATE INDEX IF NOT EXISTS watchdog_metric_observation_metric ON watchdog_metric_observation(profile, period, metric_id);

-- §7.9 metric evaluation — observation/detection/comparison/grade links + rating.
-- metric_version is NOT NULL and bound through the versioned observation key, so it
-- cannot drift from its observation. reference/grade-target links are VERSION-exact.
CREATE TABLE IF NOT EXISTS watchdog_metric_evaluation (
  run_key                 TEXT NOT NULL,
  metric_id               TEXT NOT NULL,
  metric_version          TEXT NOT NULL,
  profile                 TEXT NOT NULL,
  period                  TEXT NOT NULL,
  gradable_state          TEXT NOT NULL,
  threshold_id            TEXT,
  comparator              TEXT,
  threshold               REAL,
  reference_id            TEXT,
  reference_version       TEXT,
  grade_target_id         TEXT,
  grade_target_version    TEXT,
  detection_rule          TEXT,
  detection_fired         INTEGER CHECK (detection_fired IN (0, 1) OR detection_fired IS NULL),
  rating                  TEXT NOT NULL,
  reason                  TEXT,
  PRIMARY KEY (run_key, metric_id),
  FOREIGN KEY (run_key, metric_id, metric_version)
    REFERENCES watchdog_metric_observation(run_key, metric_id, metric_version),
  FOREIGN KEY (reference_id, reference_version)
    REFERENCES watchdog_comparison_reference(reference_id, reference_version),
  FOREIGN KEY (grade_target_id, grade_target_version)
    REFERENCES watchdog_grade_target(grade_target_id, target_version)
);

-- §7.11 finding metric-link — many-to-many finding<->metric. PK
-- (finding_key, run_key, metric_id) permits multiple findings for one metric/run AND
-- one finding contributing across multiple metrics; run_key keeps periods distinct.
CREATE TABLE IF NOT EXISTS watchdog_finding_metric_link (
  finding_key           TEXT NOT NULL,
  run_key               TEXT NOT NULL,
  metric_id             TEXT NOT NULL,
  content_ordinal       INTEGER NOT NULL,
  profile               TEXT NOT NULL,
  period                TEXT NOT NULL,
  severity              TEXT NOT NULL,
  headline              TEXT NOT NULL,
  detail                TEXT NOT NULL,
  audience              TEXT,
  evidence_class        TEXT,
  root_cause_class      TEXT,
  recommended_action    TEXT,
  PRIMARY KEY (finding_key, run_key, metric_id),
  FOREIGN KEY (finding_key) REFERENCES watchdog_finding(key),
  FOREIGN KEY (run_key, metric_id) REFERENCES watchdog_metric_observation(run_key, metric_id)
);
CREATE INDEX IF NOT EXISTS watchdog_finding_metric_link_run ON watchdog_finding_metric_link(run_key, metric_id);

-- §7.12 report run — a FINAL report that may span multiple module runs. The member
-- runs are recorded both as an explicit immutable module_run_ids set and via the
-- watchdog_report_run_module_link table (never a single run_key).
CREATE TABLE IF NOT EXISTS watchdog_report_run (
  report_run_id         TEXT PRIMARY KEY,
  profile               TEXT NOT NULL,
  period                TEXT NOT NULL,
  report_version        TEXT,
  source_cutoff         TEXT,
  freshness             TEXT,
  report_lineage        TEXT NOT NULL,
  module_run_ids        TEXT NOT NULL,
  pdf_artifact_sha256   TEXT,
  internal_artifact_sha256 TEXT,
  qa_receipt            TEXT,
  delivery_state        TEXT NOT NULL,
  activation_state      TEXT
);
CREATE INDEX IF NOT EXISTS watchdog_report_run_period ON watchdog_report_run(profile, period);

CREATE TABLE IF NOT EXISTS watchdog_report_run_module_link (
  report_run_id         TEXT NOT NULL,
  run_key               TEXT NOT NULL,
  PRIMARY KEY (report_run_id, run_key),
  FOREIGN KEY (report_run_id) REFERENCES watchdog_report_run(report_run_id),
  FOREIGN KEY (run_key) REFERENCES watchdog_module_run(run_key)
);
CREATE INDEX IF NOT EXISTS watchdog_report_run_module_link_run ON watchdog_report_run_module_link(run_key);

-- Canonical alert candidate — inert simulations. DB CHECK constraints HARD-enforce
-- delivered=0 and unsent=1: a delivery flag can never be written any other way.
CREATE TABLE IF NOT EXISTS watchdog_alert_candidate (
  run_key               TEXT NOT NULL,
  metric_id             TEXT NOT NULL,
  profile               TEXT NOT NULL,
  period                TEXT NOT NULL,
  would_fire            INTEGER NOT NULL CHECK (would_fire IN (0, 1)),
  channel               TEXT NOT NULL,
  delivered             INTEGER NOT NULL CHECK (delivered = 0),
  unsent                INTEGER NOT NULL CHECK (unsent = 1),
  message               TEXT NOT NULL,
  PRIMARY KEY (run_key, metric_id),
  FOREIGN KEY (run_key, metric_id) REFERENCES watchdog_metric_observation(run_key, metric_id)
);
`,
  },
]

export function migrationChecksum(sql: string): string {
  return createHash('sha256').update(sql.trim()).digest('hex').slice(0, 16)
}

export function migrationsWithChecksums(): Array<
  Migration & { checksum: string }
> {
  return MIGRATIONS.map((m) => ({ ...m, checksum: migrationChecksum(m.sql) }))
}
