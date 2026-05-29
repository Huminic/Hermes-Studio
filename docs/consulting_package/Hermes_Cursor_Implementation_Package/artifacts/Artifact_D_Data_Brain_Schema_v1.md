# Artifact D — Data Brain Schema v1

*Draft schema and contract for the structured operational pillar that complements the wiki-first Knowledge Brain defined by Artifact B.*

Version: 1.0-draft  
Status: draft / architecture-contract  
Date: 2026-05-28

---

## 1. Purpose

Artifact D defines the schema, record families, access rules, and governance expectations for the **Data Brain**.

The Data Brain is the structured operational pillar of the system. It is responsible for storing what happened, what currently exists, what the runtime is allowed to trust operationally, and what must be reconciled when confidence is insufficient.

Artifact D is intentionally designed to fit the two-pillar architecture already established:

- **Pillar 1 — Knowledge Brain**: markdown/wiki, human-readable, canonical for meaning, policy, workflow, blueprint, rationale, and reporting requirements.
- **Pillar 2 — Data Brain**: structured operational memory, canonical for events, task/state, transactions, snapshots, outputs, and reconciliation queues.

Artifact D does **not** replace Artifact B. It extends it. Artifact B remains authoritative for the boundary between Knowledge and Data and for the rule that runtime does not silently rewrite canonical knowledge.

---

## 2. Scope of this artifact

This draft covers:

1. the semantic role of the Data Brain;
2. the canonical record families;
3. the logical schema shape;
4. lineage and provenance requirements;
5. reconciliation and contradiction handling;
6. multi-org / tenant boundaries;
7. retrieval and write contracts for runtime agents;
8. recommended implementation sequence.

This draft does **not** yet lock:

- the exact physical database vendor or hosting pattern;
- final index strategy or performance tuning;
- final MCP method names;
- final brownfield ingestion protocol;
- full semantic/vector retrieval implementation details.

---

## 3. Data Brain design principles

### 3.1 Operational truth, not narrative truth
The Data Brain is authoritative for structured operational truth: events, state projections, task status, transactions, delivery traces, retrieval snapshots, and reconciliation items.

### 3.2 Wiki-first compatibility
The Data Brain must never be modeled in a way that collapses the Knowledge Brain into database rows. Narrative meaning stays in the wiki. Operational state lives here.

### 3.3 Append-first recording
Where practical, the system records append-only events or audit entries first, then derives current-state projections separately.

### 3.4 Lineage everywhere
Every important structured fact should be traceable to one or more sources: wiki page, external system, human input, tool call, uploaded file, or prior event.

### 3.5 Contradictions are surfaced, not erased
When the runtime encounters disagreement between data sources, knowledge assertions, or confidence levels, the result should produce a visible reconciliation path instead of a silent overwrite.

### 3.6 Tenant separation by design
The Data Brain must support clear organizational separation across at least HUMINIC, Serra Automotive, and Strukture, with explicit policies for any cross-org visibility.

### 3.7 Browser-first inspectability
Important state should be visible and understandable in browser-facing tooling. The model should not require opaque backend-only interpretation to explain what happened.

---

## 4. Core semantic boundary with Artifact B

Artifact B defines the **Knowledge Brain ↔ Data Brain Interaction Contract**. Artifact D operationalizes that contract.

### 4.1 What belongs in the Knowledge Brain
- workflows
- blueprints
- methods
- report specs
- templates
- human relay rules
- policy and governance
- rationale and canonical guidance
- strawman defaults
- house canon references

### 4.2 What belongs in the Data Brain
- event ledger entries
- current state projections
- task records
- work objects
- customers / counterparties
- transactions and delivery records
- report execution records
- retrieval context snapshots
- reconciliation items
- source references
- observations and suggested changes
- audit and access logs

### 4.3 Write-back rule
Runtime may write:
- events
- tasks
- outputs
- observations
- suggestions
- reconciliation items
- draft narrative proposals

Runtime may **not** silently rewrite canonical wiki pages by default. Canonical knowledge changes move through inbox, drafts, promotion, or explicit governance.

---

## 5. Canonical record families

The Data Brain is composed of the following record families.

### 5.1 Tenants
Represents organizational scope.

Minimum fields:
- `tenant_id`
- `tenant_slug`
- `tenant_name`
- `status`
- `created_at`
- `updated_at`

### 5.2 Actors
Represents human or agent identities that initiate or approve actions.

Minimum fields:
- `actor_id`
- `tenant_id`
- `actor_type` (`human`, `agent`, `system`)
- `display_name`
- `role_slug`
- `profile_ref`
- `status`
- `created_at`
- `updated_at`

### 5.3 Events
Immutable operational ledger of things that happened.

Minimum fields:
- `event_id`
- `tenant_id`
- `event_type`
- `event_class`
- `object_type`
- `object_id`
- `workflow_id` (nullable)
- `job_id` (nullable)
- `actor_id`
- `occurred_at`
- `recorded_at`
- `payload_json`
- `confidence_status`
- `reconciliation_status`

### 5.4 Entities
Registry of durable business objects whose current state may be projected.

Minimum fields:
- `entity_id`
- `tenant_id`
- `entity_type`
- `external_key`
- `display_name`
- `status`
- `canonical_source`
- `created_at`
- `updated_at`

### 5.5 State projections
Fast current-state views derived from events or trusted upstream systems.

Minimum fields:
- `projection_id`
- `tenant_id`
- `entity_id`
- `projection_type`
- `state_json`
- `source_version`
- `last_event_id`
- `generated_at`

### 5.6 Tasks / work objects
Operational units tracked by the runtime.

Minimum fields:
- `task_id`
- `tenant_id`
- `task_type`
- `title`
- `status`
- `priority`
- `owner_actor_id`
- `workflow_id`
- `due_at`
- `opened_at`
- `closed_at`
- `context_ref`

### 5.7 Transactions / operational records
Represents business-level structured records such as CRM updates, delivery steps, approvals, invoices, or other tracked operational changes.

Minimum fields:
- `transaction_id`
- `tenant_id`
- `transaction_type`
- `related_entity_id`
- `status`
- `effective_at`
- `amount` (nullable)
- `currency` (nullable)
- `payload_json`
- `source_system`

### 5.8 Retrieval context snapshots
Captures what context an agent used when acting.

Minimum fields:
- `snapshot_id`
- `tenant_id`
- `requesting_actor_id`
- `workflow_id`
- `job_id`
- `snapshot_type`
- `context_bundle_id`
- `source_summary_json`
- `created_at`
- `expires_at` (nullable)

### 5.9 Reports / outputs
Structured registry of generated outputs.

Minimum fields:
- `output_id`
- `tenant_id`
- `output_type`
- `title`
- `workflow_id`
- `job_id`
- `storage_path`
- `format`
- `generated_at`
- `delivery_status`
- `frontmatter_json`

### 5.10 Observations
Atomic runtime observations that may or may not yet be promoted into durable operational trust.

Minimum fields:
- `observation_id`
- `tenant_id`
- `observation_type`
- `subject_type`
- `subject_id`
- `statement`
- `confidence_status`
- `recorded_at`
- `recorded_by_actor_id`

### 5.11 Suggested knowledge changes
Runtime proposals intended for wiki review rather than direct canonical mutation.

Minimum fields:
- `suggestion_id`
- `tenant_id`
- `target_page_id`
- `suggestion_type`
- `proposed_change_summary`
- `reason`
- `evidence_snapshot_id`
- `status`
- `submitted_at`
- `submitted_by_actor_id`

### 5.12 Reconciliation items
Queue for contradictions, low-confidence outputs, or unresolved disputes.

Minimum fields:
- `reconciliation_item_id`
- `tenant_id`
- `severity`
- `status`
- `issue_type`
- `summary`
- `affected_object_type`
- `affected_object_id`
- `opened_at`
- `resolved_at`
- `resolution_note`

### 5.13 Source references
Universal lineage bridge between structured records and their sources.

Minimum fields:
- `source_reference_id`
- `tenant_id`
- `source_type` (`wiki_page`, `external_system`, `email`, `file`, `web`, `human_input`, `event`, `report`)
- `source_locator`
- `source_version`
- `citation_note`
- `retrieved_at`
- `checksum` (nullable)

### 5.14 Audit / access records
Tracks access and governed changes.

Minimum fields:
- `audit_id`
- `tenant_id`
- `actor_id`
- `action_type`
- `target_type`
- `target_id`
- `reason`
- `gate_reference`
- `occurred_at`

---

## 6. Relationship model

The recommended logical relationships are:

- one **tenant** has many actors, events, entities, tasks, outputs, snapshots, reconciliation items, and source references;
- one **event** may affect one object and may link to many source references;
- one **entity** may have many events, projections, transactions, observations, and reports;
- one **task** may produce many events and outputs;
- one **snapshot** may support many downstream events, outputs, or suggestions;
- one **reconciliation item** may reference many events, observations, or source references;
- one **suggested knowledge change** may point to one wiki page and one or more evidence sources.

A many-to-many join layer is expected for:
- `event_source_references`
- `output_source_references`
- `reconciliation_evidence_links`
- `snapshot_sources`

---

## 7. Confidence and certainty model

Artifact A and Artifact B distinguish strategic and tactical knowledge. Artifact D must preserve that distinction operationally.

### 7.1 Confidence status fields
Recommended normalized fields:
- `source_reliability` (`A`–`F`, nullable)
- `info_credibility` (`1`–`6`, nullable)
- `confidence_label` (`canonical`, `high`, `medium`, `low`, `contested`, `unknown`)
- `confidence_note`

### 7.2 Tactical records
For tactical operational state, binary authority is often enough:
- `authority_status` (`canonical`, `draft`, `deprecated`, `contested`)

### 7.3 Promotion rule
Low-confidence records may exist in the Data Brain, but records that materially affect execution should either:
1. be clearly marked as non-canonical;
2. trigger reconciliation; or
3. wait for human approval.

---

## 8. Lineage and provenance

### 8.1 Mandatory lineage rule
Any record that can influence execution, reporting, or knowledge suggestion must retain enough lineage to answer:
- where did this come from?
- who or what introduced it?
- what context was used?
- when was it recorded?
- what does it conflict with, if anything?

### 8.2 Recommended linkage pattern
- primary operational records keep lightweight source pointers;
- detailed lineage is normalized into `source_references` and join tables;
- snapshots capture the assembled context set used at decision time;
- reports and suggested changes retain source references to both wiki and operational data when applicable.

---

## 9. Retrieval contract for runtime agents

Runtime agents should not query the Data Brain as an undisciplined blob.

Recommended access patterns:
- `get_entity_state(tenant, entity_type, entity_id)`
- `list_open_tasks(tenant, workflow)`
- `append_event(...)`
- `record_observation(...)`
- `create_reconciliation_item(...)`
- `get_context_snapshot(snapshot_id)`
- `record_output(...)`
- `submit_knowledge_suggestion(...)`

### 9.1 Retrieval snapshots are first-class
Whenever a meaningful decision, report, or delivery action is made, the system should be able to reconstruct the context bundle used at the time.

### 9.2 Read permissions
Access must be filtered by:
- tenant scope;
- actor role;
- workflow boundary;
- field sensitivity;
- approval state where necessary.

---

## 10. Write contract for runtime agents

### 10.1 Allowed default writes
Runtime may create:
- events
- task updates
- observations
- outputs
- snapshots
- suggestions
- reconciliation items

### 10.2 Governed writes
Runtime should require stronger policy control for:
- cross-tenant writes;
- irreversible transaction changes;
- closure of reconciliation items;
- promotion of suggestions into approved knowledge changes;
- material changes to operational projections sourced from human-governed systems.

### 10.3 Disallowed default behavior
Runtime must not:
- rewrite canonical wiki pages directly;
- erase lineage;
- collapse conflicting sources into a single hidden answer;
- overwrite append-only event history.

---

## 11. Reconciliation model

The reconciliation layer is not an exception case; it is part of the architecture.

### 11.1 Triggers for reconciliation
Create a reconciliation item when:
- two trusted sources disagree on operational state;
- a runtime output is below the required confidence threshold;
- a report would otherwise publish contested facts;
- a proposed wiki change is unsupported or contradicted by evidence;
- a workflow depends on missing or ambiguous structured state.

### 11.2 Required fields for actionability
Each reconciliation item should capture:
- what is in dispute;
- why it matters;
- which tenants / workflows are affected;
- the evidence set;
- the recommended next resolver (human or agent class);
- the deadline or urgency if operationally material.

### 11.3 Resolution outcomes
A reconciliation item may resolve to:
- accepted data correction;
- accepted knowledge correction;
- no action / false alarm;
- deferred decision;
- scope exception.

---

## 12. Reporting and output alignment

Artifact B puts report specs, templates, schedules, recipients, and governance in the Knowledge Brain. Artifact D stores the execution reality.

Therefore the Data Brain should retain:
- report run records;
- rendered output references;
- delivery attempts and outcomes;
- source sets used;
- confidence state at generation time;
- suggested knowledge changes produced by the run.

This directly supports the frontmatter-driven report model already described for runtime outputs.

---

## 13. Multi-org / tenancy model

The initial design target is at least three organizational scopes:
- HUMINIC
- Serra Automotive
- Strukture

### 13.1 Hard boundary
Every record family must include a tenant discriminator.

### 13.2 Cross-org visibility
Cross-org reads should be explicit, audited, and policy-bound. Default posture is isolation.

### 13.3 Shared canon vs local operations
Shared method or house canon may be referenced across tenants through source references or externalized shared knowledge, but operational state remains tenant-scoped unless explicitly federated.

---

## 14. Recommended logical schema sketch

A minimal first-pass relational core could be represented as:

- `tenants`
- `actors`
- `events`
- `entities`
- `entity_projections`
- `tasks`
- `transactions`
- `outputs`
- `observations`
- `reconciliation_items`
- `retrieval_context_snapshots`
- `suggested_knowledge_changes`
- `source_references`
- `event_source_references`
- `output_source_references`
- `reconciliation_evidence_links`
- `audit_records`

This is the **minimum coherent v1 logical surface**. Additional semantic or vector layers may sit beside this, not in place of it.

---

## 15. Suggested MCP / semantic-agent responsibilities

### 15.1 Database semantic agent
Owns:
- schema conformance;
- lineage completeness;
- tenant-safe writes;
- reconciliation routing;
- projection health;
- drift and audit observability.

### 15.2 Wiki semantic agent
Owns:
- page conformance to Artifact B;
- canonical knowledge integrity;
- promotion workflow for approved changes;
- inbox / drafts / published movement;
- frontmatter correctness and link integrity.

### 15.3 Interaction rule
The database semantic agent may suggest wiki changes; it does not promote them unilaterally.

---

## 16. Implementation sequence

### Phase D0 — Contract only
- finalize Artifact D text;
- validate alignment with Artifact B;
- define required record families and write rules.

### Phase D1 — Minimal operational substrate
- tenants
- actors
- events
- tasks
- outputs
- source references
- audit records

### Phase D2 — Projection and reconciliation layer
- entities
- entity projections
- reconciliation items
- retrieval snapshots
- observations

### Phase D3 — Transactional and connector maturity
- transactions
- external system mappings
- stronger approvals
- browser-facing operational views

### Phase D4 — Semantic maturity
- richer retrieval orchestration;
- advanced provenance views;
- policy analytics;
- drift detection and renewal cadences.

---

## 17. Deferred decisions

The following remain deliberately open and should be decided after Pillar 1 is stabilized:
- exact storage engine and hosting architecture;
- vector / semantic retrieval implementation details;
- brownfield ingestion strategy for existing client systems;
- inter-agent contract serialization details;
- cost / latency budget by workflow class;
- final contribution-back path from client learnings to shared canon.

---

## 18. Acceptance criteria for Artifact D v1

Artifact D v1 is acceptable if it:
1. clearly preserves the Knowledge Brain / Data Brain boundary;
2. defines the required record families;
3. supports runtime write-back without canonical wiki overwrite;
4. includes lineage, reconciliation, and tenant separation;
5. matches Artifact B's interaction contract;
6. can guide later physical schema implementation without forcing premature choices.

---

## 19. Relationship to the artifact set

- **Artifact A** explains why this two-pillar architecture exists.
- **Artifact B** prescribes the normative rules for the wiki-first system and the interaction contract.
- **Artifact C** demonstrates those rules in a working consultative-agent wiki.
- **Artifact D** defines the structured operational pillar that will later be fully implemented.

Together:
- A explains,
- B prescribes,
- C demonstrates,
- D structures the deferred operational memory layer.
