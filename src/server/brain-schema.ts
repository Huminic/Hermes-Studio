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
]

export function migrationChecksum(sql: string): string {
  return createHash('sha256').update(sql.trim()).digest('hex').slice(0, 16)
}

export function migrationsWithChecksums(): Array<
  Migration & { checksum: string }
> {
  return MIGRATIONS.map((m) => ({ ...m, checksum: migrationChecksum(m.sql) }))
}
