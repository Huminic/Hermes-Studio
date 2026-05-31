# Verbatim user instruction (memorialized before compaction)

The next-phase SRS must address all of the following, with no loss of intent.

## Core purpose
- This system is going to be responsible for decisions agents make that affect people's lives, income, livelihood, possibly even safety.
- That gravity does not change the plan technically, but it does demand that the system actually does what it must do.
- Things must be memorialized in proper context, and agent outcomes and results must be saved.

## Knowledge layer purpose
- The knowledge layer must enable any component (agent) interacting with the system.
- If an agent cannot find what it needs and would otherwise make assumptions, the user MUST be given the opportunity to address those assumptions.
- The knowledge layer and data layer must be prepared to give agents whatever information they need to do their jobs.

## Metadata is required
- If an agent tries to find something and cannot, that MUST be recorded.
- Metadata supports operator/consultative decisions later.

## Semantic Guardian role
- The Semantic Guardian must be in the flow of all transactions.
- It must monitor all interactions.
- It must control CRUD for the area it serves, including the knowledge store and data store(s).
- The Semantic Guardian is not just a guardian — it is an advisor to every agent connecting to it to help it get its work done.
- Future role: generate "hunches" and record them; Knowledge Agent writes those hunches to the database; the data agent writes to the database.

## Database expectations
- The database is supposed to have a memory layer along with the other components outlined in the original Dragon Core documentation.
- There is going to be a single MCP connection back to Studio that serves and receives information.
- If possible, chats with the agent and chats between the agent and the back end must be memorialized.
- This information will be used by the operator to make decisions with clients about updates and changes, working with the Semantic Guardian or the Consultative Agent.
- Hermes has a built-in self-improvement function — its files should be monitored by Cron and brought into the Semantic Guardian flow.

## General system / company storage
- Each profile must store general company information, policies, logo, contact info, and "nearest data neighbor" anticipations.

## Five Wiki Invariants (required in every wiki)
1. Scope Contract
2. Confidence Schema (Admiralty Code A–F × 1–6 for strategic; canonical/under-review/deprecated for tactical)
3. Human Relay Specification (approval gates, input requests as smells, feedback loops that must close)
4. Integration Playbooks (one per external system)
5. House Canon Reference (firm-level worldview pointers)

## Sixth invariant — Always-on metadata substrate
- Every deployment MUST include an always-on metadata substrate (per-client database governed by the database semantic agent).
- Required even at minimum engagement.
- Required contract per interaction: actor, action, target page id + version before/after, timestamp, reason, gate event reference.
- Append-only audit trail.
- Unified permission model between database semantic agent and wiki semantic agent.
- Enables drift observability, renewal cadence, governance audit, feedback-loop closure.
- A configuration without an always-on metadata substrate is non-conformant.

## Data Architect Handoff Notes (already-built constraints to honor)
1. Profile isolation = hard filesystem boundary `~/.hermes/profiles/<profile>/`. Brain storage at `~/.hermes/profiles/<profile>/brain/`. Cross-profile reads require explicit admin scope.
2. MCP token model already exists at `src/server/mcp-tokens.ts` and `src/server/wiki-mcp.ts`. Brain tools must slot into the same registry with same scope shape and same audit log at `~/.hermes/mcp-audit.log`.
3. The Knowledge Semantic Guardian (`src/server/ksg-gate.ts`) is the precedent. Data SG must mirror its GateOutcome shape, gating pattern, and machine-readable rule IDs.
4. Runtime already produces structured data the Brain inherits day-one: `messaging-hub.db` tables (threads, messages, contacts, contact_identities, audiences, campaigns, campaign_deliveries, thread_agent_subscriptions, agent_reply_jobs), ADF leads, Vapi webhook output, agent SOULs + personas, `engagement-state.yaml`. The Brain should be designed around this, not an empty start state.
5. Per-profile SSE bus already exists at `/api/messaging/stream`. Brain state changes ride this, not a parallel bus. Inbound webhook `/api/messaging/inbound` with bearer auth via `HERMES_INBOUND_TOKEN`. Notification dispatch through `src/server/notifications.ts` → central-mcp Resend.
6. `engagement-state.yaml` already canonicalizes build_time_crew vs run_time_crew. Data SG goes into run_time_crew, in the same existing `<customer>-data-governor` profile alongside KSG.
7. `studio.yaml.federation.read_scopes` is the existing placeholder. Architect must make `checkScope()` honor it.
8. Cross-profile access surfaces today: wildcard MCP token, `mcp__create_profile`, Studio admin login. Brain MUST NOT introduce a fourth.
9. Per-profile env var indirection (see `lead-notifications.ts:64`) is the canonical pattern for variable secrets.
10. Configuration over code. Use Hermes built-in capabilities. Don't fork core.
11. Not yet built (architect designs fresh): storage substrate, MindsDB integration shape, dashboard renderer, upload surface, embeddings pipeline, schema migration discipline, cross-customer rollup auth (Huminic-the-company case).

## Scope of the SRS the assistant must produce
The SRS must cover, across the full stack:
- Studio (front end, back end)
- Federated search
- MCP server (single connection back to Studio)
- Communications APIs through MCP
- Database (Brain storage substrate, memory layer)
- Hermes Agent infrastructure
- Plugins
- Skills
- Remaining software setup
- Storage substrate
- MindsDB integration shape
- Dashboard renderer
- Upload surface
- Embeddings pipeline
- Schema migration discipline
- Cross-customer rollup auth (Huminic-the-company case)

## Required SRS qualities
- Written in tranches that are associated and can be implemented cleanly.
- Plain speak and technical, both.
- Includes user stories to test.
- Includes evals to run, both headed and headless.
- Includes security review with no gaping holes.
- Includes acceptance criteria the agent memorializes and uses to update its existing plan.
- Allows the agent room to modify/adapt based on field circumstances and judgment as long as criteria are met.
- Does not give the agent room to be lazy.
- If the agent must confirm something along the way, it must confirm — not with the user, but methodically and traceably.
- Ends with a /goal that lets the agent complete the data, wiki, consultative agent gaps, and the broader infrastructure.
- The system must be done after this phase, except for the Nexxus cutover (separate issue).

## Field name preference
- The user refers to the data layer as the "Brain" (formerly "Data Brain" in Artifact D).
# Huminic Studio — Next Phase SRS (Pre-Launch Completion)

## Part 1 — Purpose, framing, and rules of engagement

### 1.1 Why this document exists
This is the Software Requirements Specification for the final pre-launch phase of the Huminic Studio operating system. The previous phases produced the architecture, the artifacts (A–D), the implementation package, the Knowledge Semantic Guardian (KSG), the MCP token model, the profile isolation pattern, the runtime data the Brain will inherit, the consultative agent skeleton, the engagement state model, and the build-time vs run-time crew distinction. The remaining work makes the system actually ready for production use.

After this phase, the only outstanding work should be the Nexxus cutover, which is tracked separately.

### 1.2 The stakes, in plain speak
This system will be responsible for decisions agents make on behalf of real businesses and real people. Income, livelihood, customer outcomes, and in some cases personal safety can be affected by what these agents do. That gravity does not change the technical requirements; it raises the bar on how thoroughly each requirement must actually be met.

The implementation agent must treat governance, memorialization, and accountability as load-bearing features, not nice-to-haves. The Knowledge layer must enable any agent that interacts with the system to do its job. If an agent cannot find what it needs, the operator must be given the opportunity to address the assumption before the agent proceeds on its own. Every interaction must be memorialized in the proper context. Outcomes and results must be saved. Failures to find information must also be saved.

### 1.3 What "Brain" means in this document
The data layer that Artifact D originally called the "Data Brain" is now referred to throughout the live implementation as the **Brain**. This SRS uses "Brain" as the primary term, with "Data Brain" understood to be a synonym carried forward from Artifact D.

### 1.4 Configuration over code
The system rides on Hermes Agent and Huminic Studio. The implementation agent must prefer Hermes-native primitives (profiles, skills, cron, knowledge, MCP, Kanban, gateway features) over forks or custom code. Any extension that cannot live inside the plugin/skill/profile layer must be documented as a deliberate exception with a justification recorded in the engagement log.

The implementation agent must also actively look for Hermes capabilities that make the work easier — the goal is not to demonstrate engineering, it is to deliver behavior. If Hermes already does it, use it.

### 1.5 Rules of engagement for the implementation agent
1. The implementation agent has authority to adapt this plan in the field as long as the acceptance criteria are met and the architectural rules are preserved.
2. The agent must update its working plan to reflect this SRS the moment it is read. The acceptance criteria in Part 8 are mandatory and must be memorialized in the engagement.
3. The agent does not have permission to skip, defer, or simplify any requirement marked **MUST**. Anything marked **SHOULD** may be adapted with a recorded rationale. Anything marked **MAY** is genuinely optional.
4. If the agent encounters a decision it cannot resolve from this SRS plus existing artifacts plus the data architect handoff notes, it must record the decision, the options considered, the chosen option, and the rationale in the engagement log before continuing. It does not ask the operator mid-flight; it documents and proceeds with the most defensible interpretation, then surfaces the decision in the final report.
5. The agent must not be lazy. Vague verification statements, single-path happy-case testing, and "should work" claims are not acceptable. Every acceptance criterion must be evidenced.

### 1.6 Architectural principles that do not change
- Profile isolation is a filesystem boundary, not a logical one.
- The MCP token model already exists and is the single source of authorization for agent and federated access.
- The KSG gating shape is the precedent for the Data Semantic Guardian (DSG).
- The Brain is governed by the DSG, and the DSG lives in the same `<customer>-data-governor` profile as the KSG.
- A single MCP connection back to Studio is the canonical agent-to-system pipe.
- The system is wiki-first. The Brain serves operational truth. The wiki serves canonical meaning. Runtime cannot silently overwrite canonical knowledge.
- Cross-profile access has three surfaces today (wildcard token, `mcp__create_profile`, Studio admin). The Brain MUST NOT introduce a fourth.

### 1.7 The six wiki invariants
Every wiki built or extended under this phase MUST include:
1. Scope Contract
2. Confidence Schema (Admiralty Code A–F × 1–6 for strategic, canonical / under-review / deprecated for tactical)
3. Human Relay Specification (approval gates, input requests as smells, feedback loops that must close)
4. Integration Playbooks (one per external system the agent touches)
5. House Canon Reference (pointers to firm-level worldview docs)
6. Always-on Metadata Substrate (the per-client database recording every interaction, governed by the DSG)

A configuration without the always-on metadata substrate is non-conformant. The implementation agent must reject any company deployment that does not include it.

### 1.8 What "done" means after this phase
After this SRS is fully implemented:
- The Brain is real per profile and governed by the DSG.
- The KSG and DSG enforce CRUD discipline across knowledge and data.
- The Consultative Agent can run an end-to-end engagement and emit a working prescription, including Brain provisioning.
- The plugin extends Studio for company-facing workflows, dashboards, widgets, reports, and federated search.
- Skills cover the workflows the agents need to execute, including hunches, renewal, drift, and self-improvement loops.
- Cron monitors the right files and feeds the Semantic Guardians.
- Communications, federation, MCP, embeddings, uploads, dashboards, and schema migration are all wired.
- The system is launch-ready except for the Nexxus cutover.
# SRS — Part 2 — Tranche A: Foundation hardening

This tranche locks down the non-negotiable substrate that everything else depends on. Nothing in later tranches is allowed to ship until Tranche A is green.

## A.1 Per-profile Brain storage substrate

### Plain speak
Each customer gets their own Brain. It lives inside their profile directory, just like their messaging-hub.db does. It is never shared by default. If two profiles need to share, it goes through MCP scopes and admin tokens.

### Technical
- **MUST** place the Brain at `~/.hermes/profiles/<profile>/brain/` as a profile-scoped store.
- **MUST** select a storage substrate that supports: append-only event log, normalized projections, JSONB-equivalent payloads, full-text search, vector storage, and migration discipline. Recommended baseline: per-profile SQLite for primary OLTP + append-only event log, plus a per-profile vector store file. Postgres MAY be substituted where the operator hosts it, but the per-profile filesystem isolation MUST be preserved.
- **MUST** ship a schema migration tool that runs on profile startup and refuses to start if migrations cannot be applied cleanly.
- **MUST** treat schema migrations as configuration artifacts versioned in the plugin/skill layer, not in Hermes core.
- **MUST** support backup and restore on a per-profile basis. Default: nightly snapshot under `~/.hermes/profiles/<profile>/brain/backups/` with retention policy in `studio.yaml`.
- **MUST NOT** introduce a global warehouse or central Brain. The Huminic-the-company rollup case is handled in Tranche F, not by collapsing isolation.

### Acceptance criteria
- A fresh profile boots, runs Brain migrations, and reports ready state to Studio.
- A snapshot/restore cycle round-trips the entire Brain content of a profile with no loss and no leakage to another profile.
- A migration applied in development and shipped through the plugin is reproducible on every existing customer profile with a single command.

## A.2 Data Semantic Guardian (DSG) gate

### Plain speak
The DSG is the only legal way to write to the Brain. It mirrors how the Knowledge Semantic Guardian protects the wiki. It says yes or no with a clear reason. It is also an advisor: when an agent asks for help, it can shape the agent's next move so the agent does not guess.

### Technical
- **MUST** implement `dsgGate({profile, table, action, payload, actor, context})` in the same module conventions as `ksg-gate.ts`.
- **MUST** return the same `GateOutcome` shape used by KSG (`{ ok: true; warnings } | { ok: false; reason; rule }`).
- **MUST** expose machine-readable rule IDs such as `missing-source-reference`, `cross-profile-write-denied`, `tenant-mismatch`, `confidence-below-threshold`, `frontmatter-link-missing`, `pii-redaction-required`, `append-only-violation`, `unknown-actor`, `unscoped-tool`, `low-confidence-publication`, `reconciliation-required`, `policy-blocked`, and others determined in the field. The list is extensible; rule IDs MUST be stable once introduced.
- **MUST** be called on every Brain write attempt — there is no bypass path.
- **MUST** be called on Brain reads that cross profiles or escalate scope.
- **MUST** advise: when an agent calls a Brain read or write that the DSG cannot satisfy, the response MUST include either a recommended next action, a knowledge gap reference, or a reconciliation item creation.
- **MUST** be the entity that creates reconciliation items when contradictions appear.
- **SHOULD** apply the same gating to "memory layer" reads/writes that originate from Hermes self-improvement files.

### Acceptance criteria
- Every Brain write path in the codebase routes through `dsgGate`.
- A negative test that attempts a direct DB write bypassing the DSG fails closed.
- A documented advisory response is returned for at least three classes of failure: missing source reference, insufficient confidence, and unknown actor.

## A.3 Unified MCP token registry extension

### Plain speak
There is already one token system that controls who can do what. The Brain plugs into it. We do not invent a second auth system.

### Technical
- **MUST** add Brain tools to the existing `~/.hermes/mcp-tokens.yaml` registry. Examples: `brain_query`, `brain_write`, `brain_upload`, `brain_classify`, `brain_record_hunch`, `brain_record_chat`, `brain_record_lookup_miss`, `brain_subscribe_events`, `brain_export_snapshot`, plus admin tools such as `mcp__brain_migrate`, `mcp__brain_backup`, `mcp__brain_restore`.
- **MUST** enforce scope via the existing `checkScope(token, profile, tool)` chain.
- **MUST** append every Brain tool call to `~/.hermes/mcp-audit.log` in the existing JSONL shape with no schema divergence.
- **MUST** surface Brain tool selection in the existing `/settings/mcp-tokens` Studio UI.
- **MUST NOT** introduce a fourth cross-profile access surface. Cross-profile reads ride wildcard tokens or new explicit MCP tools with the same scope-gating discipline.

### Acceptance criteria
- All Brain tools appear in `mcp-tokens.yaml` and the Studio token UI.
- Every Brain tool call shows up in `mcp-audit.log` with consistent fields.
- A scope-mismatch attempt is denied with the existing error contract.

## A.4 Single MCP connection back to Studio

### Plain speak
There is one pipe between Studio and the agent runtime. Information goes both ways through it. We do not build parallel back channels.

### Technical
- **MUST** consolidate Brain, wiki, federation, communications, and notification surfaces under one MCP server connection per profile.
- **MUST** preserve the existing wiki MCP behavior and add Brain and federation tools alongside it.
- **MUST** record bidirectional message memorialization (see A.6).
- **SHOULD** keep tool naming consistent: `wiki_*`, `brain_*`, `federation_*`, `comms_*`.

### Acceptance criteria
- A profile exposes exactly one MCP endpoint surface to Studio.
- All categories of tool calls flow through it and are audited uniformly.

## A.5 Always-on metadata substrate (the sixth invariant)

### Plain speak
Every customer, even the smallest engagement, has a database that records every interaction with the wiki and the Brain. This is the backbone of governance. Without it the system is non-conformant.

### Technical
- **MUST** create the metadata substrate at profile provisioning time, not lazily on first interaction.
- **MUST** record every wiki interaction with: actor (role + human/agent token identity), action (read/create/update/deprecate/archive), target page id + version before/after, timestamp, reason (for governed edits), gate event reference if gated.
- **MUST** record every Brain interaction with the same shape adapted to data records: actor, action, target table/row, version before/after, timestamp, reason, gate event reference, confidence state, source reference set.
- **MUST** be append-only at the audit layer; derived projections are separate.
- **MUST** share one policy engine between KSG and DSG so the same roles, scopes, and audit apply whether a write originates from a human via the UI or an agent via MCP.
- **MUST** support drift observability queries: "what changed in this wiki/brain since X and on whose authority."
- **MUST** support renewal cadence: pages or records past their `last_verified` are surfaced.
- **MUST** support feedback-loop closure: human relay feedback can be traced into resulting wiki edits or Brain updates.

### Acceptance criteria
- A new profile is created and the metadata substrate is present and recording before any agent touches it.
- A diff query across an arbitrary date range returns every interaction with full attribution.
- A renewal cadence query returns pages and records past their verification window.

## A.6 Memorialization of chats and back-end interactions

### Plain speak
Conversations with agents matter. Conversations between agents and the back end matter too. We save them so the operator can later ask the Semantic Guardian what happened and why.

### Technical
- **MUST** memorialize chats between humans and agents, including in Studio, in Kanban-driven sessions, and through messaging-hub channels.
- **MUST** memorialize agent-to-backend tool calls and their outcomes through the MCP audit log plus a Brain-level conversation record for higher-level reasoning context where applicable.
- **MUST** preserve enough context that a Semantic Guardian or the Consultative Agent can later answer questions like: "what did this agent know when it made this decision," "what did it try to look up and fail to find," "what assumptions did it surface to the operator," "what was the outcome."
- **SHOULD** make this content queryable by the operator through Studio.

### Acceptance criteria
- A scripted conversation across at least three channels (Studio chat, MCP tool call sequence, messaging-hub) is fully reconstructable from the Brain.
- A failed lookup is recorded with the query, the scope, the actor, the timestamp, and the resulting agent behavior.

## A.7 "Lookup miss" and assumption surfacing

### Plain speak
When an agent cannot find what it needs, it does not silently guess. It records the miss, and it surfaces an assumption for the operator to address. This is a load-bearing safety feature.

### Technical
- **MUST** provide a Brain table `lookup_misses` capturing actor, scope queried, query content, timestamp, downstream decision (deferred / assumed / escalated), and operator-visible flag.
- **MUST** provide a runtime hook `recordLookupMiss({...})` that any agent can call through MCP.
- **MUST** require the agent to mark whether it proceeded with an assumption. If yes, the assumption text MUST be recorded and surfaced to the operator.
- **MUST** route an "assumption to address" notice into Studio for operator review.

### Acceptance criteria
- A deliberately incomplete wiki scenario triggers a lookup miss, an assumption record, and an operator-visible notice in Studio.
- The operator can resolve the assumption (accept / reject / clarify) and the resolution is recorded.

## A.8 Hermes self-improvement integration

### Plain speak
Hermes already knows how to get better over time using certain files. We hook the Semantic Guardians into that feedback loop so improvements are governed, not silent.

### Technical
- **MUST** identify the Hermes self-improvement files used by the gateway and put them under Cron-monitored watch.
- **MUST** route detected updates through the KSG and DSG so improvements pass through governance.
- **SHOULD** make improvements visible to the operator as proposed knowledge or Brain changes, not silent edits.

### Acceptance criteria
- A simulated Hermes self-improvement file change is detected by Cron, evaluated by the appropriate Semantic Guardian, and recorded in the metadata substrate.
- No silent overwrites of canonical knowledge occur as a result.
# SRS — Part 3 — Tranche B: Knowledge-and-Brain interaction contract

Tranche B turns the wiki and the Brain into a cooperating pair instead of two adjacent stores. It is what makes the Semantic Guardian an advisor and not just an enforcer.

## B.1 Brain record families (operationalizing Artifact D)

### Plain speak
The Brain has a known set of record types. Agents do not invent new tables on the fly.

### Technical
- **MUST** implement the record families from Artifact D, adapted to the live runtime: `events`, `entities`, `entity_projections`, `tasks`, `transactions`, `outputs`, `observations`, `reconciliation_items`, `retrieval_context_snapshots`, `suggested_knowledge_changes`, `source_references`, `audit_records`, plus the new families introduced in Tranche A: `lookup_misses`, `hunches`, `chat_records`, `assumptions`.
- **MUST** map already-live runtime sources to record families: messaging-hub threads/messages → `events` + `entities` (`contact`, `thread`), agent reply jobs → `events` + `outputs`, ADF leads → `entities` + `events`, Vapi webhook output → `events` + `transactions`, agent SOULs and personas → `source_references` from wiki.
- **MUST** keep `source_references` mandatory on any record influencing execution, reporting, or knowledge suggestions.
- **MUST** carry tenant discriminators on every record.

### Acceptance criteria
- Every existing per-profile runtime data source is documented as a record-family mapping in the engagement log.
- A query proves that any operational record has at least one source reference where the contract requires it.

## B.2 Hunches and advisor outputs

### Plain speak
The Semantic Guardian can have a hunch — a recorded suspicion, observation, or proposed improvement that is not yet canonical. Hunches are written by the appropriate guardian. They are not silent edits to the wiki or to the Brain.

### Technical
- **MUST** implement a `hunches` table in the Brain with: id, tenant_id, originating_guardian (`KSG` or `DSG`), subject_type, subject_id, statement, evidence_refs, confidence_label, status (`open`, `resolved`, `dismissed`), proposed_action (`wiki_update`, `brain_update`, `escalate`, `monitor`), created_at, resolver_actor.
- **MUST** allow Cron-driven monitoring of relevant files (Hermes self-improvement, agent SOULs, configuration) to create hunches automatically when patterns warrant.
- **MUST** require the Knowledge Agent (or KSG) to be the writer of any hunch destined to update the wiki; the Data Agent (DSG) is the writer of any hunch destined to update the Brain.
- **MUST** keep hunches subject to the same audit substrate as all other Brain writes.

### Acceptance criteria
- A Cron-triggered hunch is created, recorded, and visible in Studio.
- A hunch is resolvable into either a `suggested_knowledge_change`, a Brain update, or an explicit dismissal with rationale.

## B.3 Knowledge ↔ Brain interaction contract enforcement

### Plain speak
The wiki is canonical for meaning. The Brain is canonical for what happened and what is currently true operationally. Neither one is allowed to overwrite the other silently. When they disagree, that becomes a reconciliation item.

### Technical
- **MUST** preserve the Artifact B Knowledge Brain ↔ Data Brain Interaction Contract verbatim in canonical wiki pages of every customer profile.
- **MUST** enforce: runtime can create events, observations, outputs, tasks, suggestions, reconciliation items, drafts; runtime cannot silently rewrite canonical knowledge.
- **MUST** require contradiction handling: surface the conflict, preserve lineage to both sides, create a reconciliation item if the conflict materially affects execution or reporting.

### Acceptance criteria
- A deliberate contradiction between an operational state record and a canonical wiki claim produces a reconciliation item, not an overwrite.
- The reconciliation item carries lineage to both sides and is closable through the governed promotion path.

## B.4 Nearest data neighbor anticipation

### Plain speak
When the system has data on a customer, it should also anticipate the closest related data the agent will likely need. That anticipation is captured in the Brain so the Consultative Agent and the operator can decide what to absorb, what to federate, and what to ignore.

### Technical
- **MUST** model "adjacent data neighbors" as records in `engagement-state.yaml` and mirror them as `entity_profiles` or `observations` in the Brain with a clear flag distinguishing `federated_externally` vs `absorbed_into_brain`.
- **SHOULD** allow the Consultative Agent to query and update this list as part of an engagement.

### Acceptance criteria
- A consultative run for a fictitious company produces an adjacent-neighbor list in both `engagement-state.yaml` and the Brain.
- The DSG enforces a rule that newly absorbed data without a defined source path is rejected.

## B.5 Memory layer

### Plain speak
The Brain has a memory layer the way the original Dragon Core documentation described. It is what gives agents the ability to recall context across sessions and across companies of the right scope.

### Technical
- **MUST** implement a memory layer composed of: `retrieval_context_snapshots` for what an agent used at decision time, `chat_records` for conversational context, and embeddings storage for semantic recall.
- **MUST** keep memory layer access governed by the DSG.
- **SHOULD** integrate with Hermes-native memory wherever possible.

### Acceptance criteria
- An agent decision is reconstructable later from snapshot + chat + source references.
- A cross-session recall returns a usable, scope-correct context bundle.

## B.6 Embeddings pipeline

### Plain speak
Some retrieval is semantic, not literal. We need vectors. We do not invent a global vector cloud. Each profile owns its own embeddings, unless an explicit cross-profile scope authorizes more.

### Technical
- **MUST** define an embeddings pipeline that: chooses a model and records the model identity per embedding row, runs per-profile, stores vectors in a per-profile vector store under `~/.hermes/profiles/<profile>/brain/vectors/`, is governed by the DSG for read and write, supports re-embedding on model upgrades.
- **SHOULD** prefer locally hostable embedding options where viable; remote provider use MUST be configured per profile via the existing env-var indirection pattern.

### Acceptance criteria
- A representative set of wiki and Brain records is embedded, queryable, and audit-logged.
- A model swap produces a clean re-embed pass with no data loss.

## B.7 Schema migration discipline

### Plain speak
We will not break customer Brains on upgrade. Migrations are part of the shipped plugin and applied in a known order.

### Technical
- **MUST** ship migration scripts in the plugin or skill layer, never as ad-hoc edits in customer profiles.
- **MUST** version migrations with monotonic identifiers and a recorded checksum.
- **MUST** allow dry-run validation before apply.
- **MUST** integrate migration status with Studio's readiness probe so a profile cannot serve agents while migrations are pending.

### Acceptance criteria
- A simulated migration upgrade across all live customer profiles succeeds via a single command and is fully reversible to the previous state.
- A profile with pending migrations refuses to serve agents until the migration is applied or explicitly skipped under admin scope.
# SRS — Part 4 — Tranche C: Consultative Agent completion

The Consultative Agent is the architect-in-the-loop. It must be able to run a real engagement end-to-end, including standing up the Brain.

## C.1 End-to-end engagement capability

### Plain speak
A new customer must be able to land, be audited, get a prescription, get a wiki, get a Brain, get its agents, and get its dashboards through the Consultative Agent and the implementation flow it drives.

### Technical
- **MUST** complete the six-phase method: Orient → Audit → Design → Author → Validate → Package.
- **MUST** drive the provisioning of a new profile through the existing admin path (`mcp__create_profile`) and the Brain provisioning logic from Tranche A.
- **MUST** produce a prescription package that includes: client wiki, agentic design, data-storage design (referencing the Brain), MCP access spec, wiki semantic-agent spec, database semantic-agent spec, federation read-scope plan, dashboard plan, and adjacent-data-neighbor list.
- **MUST** populate `engagement-state.yaml` including `build_time_crew`, `run_time_crew`, `readiness_gates`, `deployment_notes`, and `adjacent_data_neighbors`.

### Acceptance criteria
- A scripted end-to-end engagement for a fictitious customer (Cedar Ridge Automotive Group is the canonical test fixture used in the simulation prompt) produces every prescription component above with passing conformance checks.

## C.2 Seeded starter content

### Plain speak
The Consultative Agent starts with the right tools, not from scratch.

### Technical
- **MUST** be seeded with: Artifact A (methodology), Artifact B v1.1 (spec), Artifact C v1.0 (consultative wiki worked example), Artifact D v1 (Brain schema draft), the Cursor implementation package, the Hermes Studio operating context, the data architect handoff notes, the cutover-ritual document, and any other canonical reference declared in `canon/house-canon-index.md`.
- **MUST** carry the five wiki invariants plus the always-on metadata substrate as required outputs in every engagement.
- **SHOULD** load these starter materials at engagement initialization and verify their availability before declaring the engagement ready to begin.

### Acceptance criteria
- A new engagement initialization fails closed if any starter artifact is missing.
- The Consultative Agent can cite the artifacts during the engagement.

## C.3 Wiki authoring and edit authority

### Plain speak
The Consultative Agent creates and edits the wiki for a new customer. It does not bypass the KSG even when it has admin scope.

### Technical
- **MUST** create wiki content through the KSG-gated paths: `wiki_propose` for agent-driven authoring and the operator UI for human-driven authoring.
- **MUST** be capable of producing markdown files for every primitive type defined in Artifact B.
- **MUST** be capable of editing existing wiki content, subject to KSG promotion rules and protected-tree restrictions.
- **MUST** record every authoring action in the metadata substrate.

### Acceptance criteria
- A consultative run authors a wiki with all six invariants present, validated by an automated linter run as part of the eval suite.
- An attempt by the Consultative Agent to write to a frozen canonical page is rejected with the existing KSG rule ID.

## C.4 Brain authoring and edit authority

### Plain speak
The Consultative Agent can also write the Brain schema and seed the Brain. It always goes through the DSG.

### Technical
- **MUST** be able to apply Brain provisioning migrations through the admin Brain tool path.
- **MUST** be able to seed initial Brain records as part of an engagement (for example: known company-policy entities, adjacent neighbors, integration playbook references, initial confidence schema entries).
- **MUST NOT** be able to bypass the DSG even with admin scope.

### Acceptance criteria
- A consultative run produces a Brain populated with at least the canonical seed entities for the test fixture.
- A deliberate attempt to bypass the DSG fails closed.

## C.5 Assumption surfacing during engagement

### Plain speak
The Consultative Agent is the most likely place an assumption will appear. It must surface those assumptions before they harden into the wiki or the Brain.

### Technical
- **MUST** detect when a needed input is missing and call `recordLookupMiss` plus the assumption-surfacing flow from Tranche A.
- **MUST** allow the operator to address the assumption (accept / reject / clarify) and proceed accordingly.

### Acceptance criteria
- A scripted engagement with deliberate gaps surfaces at least three operator-addressable assumptions, each resolvable in Studio.

## C.6 Skill and plugin extension hooks

### Plain speak
If the Consultative Agent needs new capability, that capability ships as a skill or plugin extension. We do not modify Hermes core.

### Technical
- **MUST** identify any missing capability during an engagement and emit a `capability_gap` record into the engagement log.
- **SHOULD** propose the smallest portable extension (skill, plugin, MCP tool, config) that closes the gap.

### Acceptance criteria
- At least one capability gap detected in the simulation produces a written proposal in the engagement output.
# SRS — Part 5 — Tranche D: Plugin, skills, federation, communications

Tranche D is the layer the customer touches. It is also the layer most likely to drift into core if the agent is not disciplined. Keep it portable.

## D.1 Plugin architecture hardening

### Plain speak
Everything we add to Huminic Studio that is customer-facing must live in the plugin layer. We must be able to install our extensions on a fresh Hermes + Huminic Studio install and have it work.

### Technical
- **MUST** audit the current plugin and verify that no UI extension, widget, dashboard view, or skill behavior depends on a fork of Studio core.
- **MUST** move any non-portable extension into the plugin or skill layer.
- **MUST** document the plugin install procedure end-to-end, including environment requirements, MCP registrations, and asset paths.
- **MUST** produce a "fresh-host install" smoke test that exercises plugin load on an untouched Hermes + Huminic Studio environment.

### Acceptance criteria
- A clean host installs the plugin and produces a working Huminic Studio with all custom UI, widgets, dashboards, and skills visible and functional.
- A diff against Studio core shows no required modifications beyond plugin entry points already sanctioned by the Studio extension surface.

## D.2 Skill set required for the workflow

### Plain speak
Agents do their job through skills. We package the skills they need. Each skill is small and configuration-driven.

### Technical
- **MUST** ship or verify the presence of at least the following skill categories: KSG worker, DSG worker, Consultative Agent worker, Kanban worker and orchestrator support, federated-search MCP client, hunches authoring, lookup-miss / assumption surfacing, renewal cadence monitor, drift observability, Hermes self-improvement watcher, embeddings indexer, dashboard binder, report generator, campaign executor, communications dispatcher.
- **MUST** keep each skill consistent with the existing `SKILL.md` convention used in the live tree.
- **MUST** include progressive disclosure and conditional activation where the existing Hermes skill conventions support it.

### Acceptance criteria
- Each skill loads on at least one test profile and is exercised by an automated eval.
- A skill list dump from a deployed customer profile is reproducible across customers with the same blueprint.

## D.3 Widget and dashboard surface (Nexxus-inspired, portable)

### Plain speak
We bring over what customers actually use day to day: widgets that behave like the ones they had, dashboards built through Metabase or an equivalent renderer, reports from any data source they have access to. None of it requires Nexxus.

### Technical
- **MUST** decide and document the dashboard renderer (Metabase as default candidate; Lightdash or Superset acceptable substitutes if better fit per profile). Renderer choice and embedding model live in the plugin layer.
- **MUST** embed dashboards per profile with per-profile auth.
- **MUST** model widgets as plugin-owned components that read from MCP-exposed surfaces (Brain, federation, comms) under the existing token model.
- **MUST** support report generation against any data source the profile is authorized to read.

### Acceptance criteria
- A representative dashboard is rendered for the test fixture customer with data sourced through the proper MCP tools.
- A widget edit by the customer-admin propagates through governed paths and is reflected on next load.

## D.4 Federated search

### Plain speak
We do not warehouse everyone's data. We let the customer's profile reach out to the sources it is authorized to read, ask the question, and return an answer.

### Technical
- **MUST** implement the federation MCP surface and make `studio.yaml.federation.read_scopes` enforced by `checkScope()`.
- **MUST** prefer MindsDB as the federation engine for the first cut unless the architect documents a more defensible alternative; the agent has explicit room to choose differently with a recorded rationale.
- **MUST** expose tools named `federation.query.<scope>` (for example `federation.query.vinsolutions`) that respect token scope and audit through the same JSONL log.
- **MUST** support adjacent-data-neighbor declarations from the Brain so the federation layer knows what to make discoverable.

### Acceptance criteria
- A federation read flows end-to-end through `checkScope`, the audit log, and back to a Studio surface.
- An unauthorized scope is denied with the existing error contract.

## D.5 Communications APIs through MCP

### Plain speak
Email, SMS, voice, and any other comms ride through MCP so they get the same auth, audit, and governance as everything else.

### Technical
- **MUST** keep `src/server/notifications.ts` → central-mcp Resend as the email dispatch path.
- **MUST** expose `comms_*` MCP tools for higher-level send actions (`comms_send_email`, `comms_send_sms`, `comms_initiate_call`) with token scope enforcement and full audit.
- **MUST** route incoming events through the existing inbound webhook and SSE bus.
- **MUST** memorialize sends and inbound events into the Brain.

### Acceptance criteria
- A test send via each comms channel that exists for the test profile is dispatched, audited, and memorialized.
- A scope-denied send fails closed and is logged.

## D.6 Upload surface

### Plain speak
Customers will give us files. We need a place to receive them, classify them, store them, and govern them.

### Technical
- **MUST** define an upload surface accessible from Studio (operator) and from MCP tools (agent-initiated).
- **MUST** store uploaded files under `~/.hermes/profiles/<profile>/brain/uploads/` with metadata in the Brain.
- **MUST** route uploads through DSG classification and storage decisions (`absorbed_into_brain` vs `federated_externally`).
- **SHOULD** support virus / safety scanning hooks where the host supports it.
- **MUST** make uploaded file references first-class `source_references`.

### Acceptance criteria
- An upload through Studio is stored, classified, indexed, embedded if applicable, and queryable.
- An MCP-initiated upload follows the same path with the same audit.

## D.7 SSE bus reuse

### Plain speak
The system already has an event bus. The Brain and the new plugin pieces ride that bus. We do not build a second one.

### Technical
- **MUST** subscribe Brain state changes and Semantic Guardian decisions to the existing `/api/messaging/stream` SSE bus per profile.
- **MUST** define new event types on the existing bus rather than running a parallel channel.

### Acceptance criteria
- A subscribed Studio client receives Brain and guardian events alongside existing messaging events.
# SRS — Part 6 — Tranche E: Cross-customer rollup; Tranche F: Security

## Tranche E — Huminic-the-company rollup

### Plain speak
Huminic operates the whole platform. There are cases — particularly internal — where Huminic-the-company needs to see across customer profiles to roll up data. We support that without breaking isolation.

### Technical
- **MUST** model Huminic-the-company as a parent scope that reads from authorized child profiles, never as a co-resident database.
- **MUST** authorize the rollup path through the existing wildcard MCP token or new explicit MCP tools with the same scope-gating discipline. No fourth access surface.
- **MUST** record every rollup read in the audit log with the parent actor identity and the set of child profiles touched.
- **MUST** require that any child profile included in a rollup has explicitly granted rollup read scope in its `studio.yaml.federation.read_scopes` or a parallel rollup field defined in this phase.
- **SHOULD** provide a Huminic-the-company dashboard pattern using the dashboard renderer from Tranche D, sourcing through MCP rollup tools.

### Acceptance criteria
- A rollup read across at least two test customer profiles succeeds and is fully audited.
- A rollup read against a profile that has not granted scope is denied with the existing error contract.
- The Huminic-the-company dashboard renders aggregated data using only governed MCP paths.

## Tranche F — Security infrastructure review

### Plain speak
This system handles customer livelihoods. We do a hard look at the security surfaces before we go live.

### F.1 Authentication and authorization
- **MUST** verify password auth and OAuth device code flow are intact and unchanged by this phase's work.
- **MUST** verify the MCP token registry is the single source of truth for agent-level authorization.
- **MUST** verify scope enforcement on every Brain, wiki, federation, comms, upload, and rollup tool.
- **MUST** verify admin tools are not callable without admin scope.
- **MUST** ensure default tokens carry the narrowest viable scope, not wildcard scope.

### F.2 Audit completeness
- **MUST** confirm that every tool call is recorded in `~/.hermes/mcp-audit.log` with consistent schema.
- **MUST** confirm the metadata substrate captures every wiki and Brain interaction.
- **MUST** confirm Hermes self-improvement file changes are visible through the audit trail.

### F.3 Data isolation
- **MUST** confirm no path exists for a customer-scoped token to read another customer's wiki, Brain, uploads, or comms history.
- **MUST** confirm uploaded files cannot be retrieved cross-profile through any path other than the sanctioned rollup or admin.
- **MUST** confirm vector store contents respect profile isolation.

### F.4 Secret handling
- **MUST** confirm secrets remain in per-profile `.env`, never in committed configuration.
- **MUST** confirm per-profile env var indirection is used for all variable secrets.
- **MUST** confirm logs do not leak secrets, including in stack traces or error responses.

### F.5 CSRF, content type, path traversal, rate limiting
- **MUST** confirm Studio retains CSRF protection, JSON content-type enforcement, path traversal prevention, rate limiting, and Content-Security-Policy.
- **MUST** add CSRF and content-type enforcement to any new HTTP surfaces introduced in this phase.
- **MUST** add rate limiting to any new public-facing endpoint.

### F.6 Communications safety
- **MUST** verify outbound comms paths require an explicit recipient allowlist where applicable (for example, `EMAIL_ALLOWED_USERS`).
- **MUST** verify that agent-initiated comms cannot exceed a configured per-profile rate cap.

### F.7 Embeddings and PII safety
- **MUST** define a PII redaction policy for embeddings and ensure the embedding pipeline honors it.
- **MUST** keep PII fields out of vector storage when the policy requires.

### F.8 Backup and recovery
- **MUST** verify Brain, wiki, and uploads can be backed up per profile and restored cleanly.
- **MUST** verify backups do not cross-leak.

### F.9 Penetration self-test
- **MUST** run a documented self-test sweep covering: cross-profile read, token scope escape, direct DB write bypassing DSG, wiki write to protected tree, MCP audit gaps, secret leakage in logs, CSRF, rate limit bypass, path traversal, file upload abuse.
- **MUST** record results in the engagement log.
- **SHOULD** include both headed (Studio UI walk) and headless (script-driven) attempts.

### Acceptance criteria for Tranche F
- Every item in F.1 through F.8 is evidenced by a check-in to the engagement log with explicit pass markers.
- F.9 pen-test sweep shows zero open holes; any finding produces a documented fix or a documented accepted risk before launch.
# SRS — Part 7 — Tranche G: User stories, evals, and pre-launch verification

This tranche is how we prove the system works. Every story below MUST be executed and produce evidence in the engagement log.

## G.1 User stories (functional)

### Story 1 — New customer onboarding (Cedar Ridge Automotive Group)
1. Operator opens Studio and starts a Consultative engagement.
2. Consultative Agent orients, audits, designs, authors, validates, and packages.
3. Profile is provisioned at `~/.hermes/profiles/cedar-ridge/`.
4. Wiki is authored with all six invariants.
5. Brain is provisioned and seeded.
6. Build-time crew and run-time crew are populated in `engagement-state.yaml`.
7. KSG and DSG are active in the `cedar-ridge-data-governor` profile.
8. Adjacent data neighbors are recorded and classified.
9. Customer-facing dashboards and widgets render through governed MCP paths.

### Story 2 — Operator asks for a federated answer
1. Operator triggers a federated query through Studio.
2. The federation MCP tool runs against authorized scopes only.
3. The Brain memorializes the query, the response, and the source set.
4. The audit log shows the actor, scope, and result.

### Story 3 — Agent encounters a missing input
1. A runtime agent runs a workflow and cannot find a required input.
2. `recordLookupMiss` fires.
3. An assumption is surfaced to the operator in Studio.
4. The operator accepts the assumption with a clarification.
5. The clarification is captured as a `suggested_knowledge_change` and promoted by the KSG into the wiki via the governed path.

### Story 4 — Wiki edit reaches the runtime
1. Operator edits a workflow page.
2. KSG approves the change after promotion ordering.
3. Next agent run reflects the new behavior.
4. The metadata substrate shows the version before/after.

### Story 5 — Reconciliation
1. An operational record contradicts a canonical wiki claim.
2. The DSG creates a reconciliation item.
3. The Consultative Agent reviews and proposes resolution.
4. Resolution flows through the proper governed path.

### Story 6 — Hermes self-improvement loop
1. A Hermes self-improvement file changes.
2. Cron picks it up.
3. KSG/DSG produce a hunch.
4. Hunch is reviewed and either dismissed or converted into a governed update.

### Story 7 — Rollup query (Huminic-the-company)
1. The Huminic parent profile runs a rollup query across two child profiles.
2. Each child profile has granted rollup scope.
3. The rollup result is returned, audited, and visible in a Huminic-level dashboard.

### Story 8 — Communications dispatch
1. An agent triggers an outbound email through `comms_send_email`.
2. The Resend path executes, recipient allowlist is honored, audit and Brain memorialization complete.

### Story 9 — Upload and classification
1. Customer uploads a file in Studio.
2. DSG classifies the file.
3. The file is stored, embedded if applicable, and referenced.
4. An agent later retrieves the file content through governed MCP paths.

### Story 10 — Drift observability
1. An agent routes around a canonical procedure.
2. The KSG records the drift.
3. The drift surfaces in Studio for operator review.

## G.2 Evals

### G.2.1 Headless evals
- **MUST** include automated test runs that exercise each user story without UI.
- **MUST** include MCP scope tests, DSG/KSG gate tests, audit-log completeness tests, schema migration round-trip tests, embeddings pipeline correctness tests, backup/restore tests, federation scope enforcement tests, comms dispatch tests, hunches lifecycle tests, lookup-miss / assumption surfacing tests, reconciliation lifecycle tests, rollup auth tests.
- **MUST** include regression tests that exercise existing messaging-hub, agent-reply jobs, ADF lead parse/emit, Vapi webhook ingest, and SSE bus behavior, to confirm the new work does not break them.

### G.2.2 Headed evals
- **MUST** include UI walk-throughs that exercise each user story interactively through Studio.
- **MUST** record screen captures or structured traces for the launch evidence pack.
- **SHOULD** include at least one operator-in-the-loop walk that exercises an assumption resolution and a reconciliation resolution.

### G.2.3 Security pen-test sweep
- **MUST** run the F.9 sweep both headless and headed.
- **MUST** publish results in the engagement log with explicit pass markers.

## G.3 Confirmation discipline (no laziness)

### Plain speak
If the agent is unsure about a path, it does not just pick one and move on. It records the question, the options, the chosen option, and the reason. Then it proceeds. We can audit the decision later.

### Technical
- **MUST** maintain an in-engagement `decisions.log` JSONL file with: timestamp, decision id, summary, options considered, chosen option, rationale, references.
- **MUST** confirm with itself (not the operator) by writing the entry before acting.
- **MUST** include this log in the final engagement report.
# SRS — Part 8 — Acceptance criteria, agent obligations, and the /goal

## 8.1 Acceptance criteria the agent must memorialize

The agent MUST read this section, fold it into its current implementation plan, and treat it as the launch gate.

### 8.1.1 Core architecture
- Brain exists per profile at `~/.hermes/profiles/<profile>/brain/`.
- DSG enforces all Brain writes and cross-profile reads.
- KSG enforces all wiki writes and cross-profile reads.
- DSG and KSG share one policy engine and one audit log.
- Single MCP connection per profile carries `wiki_*`, `brain_*`, `federation_*`, `comms_*`, and admin tools.
- No fourth cross-profile access surface introduced.
- Configuration over code preserved; no Hermes core forks unless documented as deliberate exceptions.

### 8.1.2 Wiki invariants
- Every customer wiki includes Scope Contract, Confidence Schema, Human Relay Specification, Integration Playbooks, House Canon Reference, and Always-on Metadata Substrate.
- A wiki missing any invariant is rejected by the Consultative Agent and the deployment flow.

### 8.1.3 Brain content
- Record families from Tranche B are present and populated for the test fixture.
- Hunches lifecycle works.
- Lookup-miss and assumption surfacing works end-to-end.
- Reconciliation items are created on contradictions and resolvable through the governed path.
- Adjacent data neighbors are recorded and classified for the test fixture.
- Memory layer reconstructs decision context for arbitrary past agent actions.
- Embeddings pipeline is functional with at least one supported model.
- Schema migration discipline is enforced and reversible.

### 8.1.4 Consultative Agent
- End-to-end engagement runs against the Cedar Ridge fixture and produces a complete prescription package.
- Wiki authoring and Brain seeding succeed under KSG and DSG enforcement.
- Assumption surfacing is exercised at least three times during the simulation.
- Capability gap proposals are emitted when relevant.

### 8.1.5 Plugin, skills, federation, comms
- Plugin installs cleanly on a fresh Hermes + Huminic Studio host.
- Required skills are present and loadable on at least one test profile.
- Dashboard renderer choice is documented and embedded per profile.
- Federation read scopes are enforced; unauthorized scopes are denied.
- Comms tools route through MCP with allowlists and rate caps.
- Upload surface is operational with DSG-governed classification.

### 8.1.6 Rollup
- Huminic-the-company rollup works through authorized children with full audit.
- Children without granted rollup scope are denied.

### 8.1.7 Security
- F.1 through F.8 pass with evidence.
- F.9 pen-test sweep shows zero open holes or each finding is documented with explicit accepted-risk disposition before launch.

### 8.1.8 Evals
- All headless tests pass.
- All headed tests pass.
- Evidence pack is published in the engagement log.

### 8.1.9 Documentation
- Documentation is updated to match the shipped behavior including: tools, plugin install, skills, dashboard renderer choice, MCP scope vocabulary, federation engine choice, embeddings model, schema migration discipline, backup/restore, rollup auth, and the six wiki invariants.

### 8.1.10 Decision log
- `decisions.log` exists in the engagement log and captures every non-trivial choice the agent made.

## 8.2 Agent obligations during implementation

1. **Plan integration:** the agent MUST merge this SRS into its current implementation plan before starting work, restate the tranches and acceptance criteria in its plan, and proceed in tranche order: A → B → C → D → E → F → G.
2. **Field adaptation authority:** the agent MAY adapt this plan as long as the acceptance criteria in 8.1 are still met and the rules of engagement in Part 1 are preserved. Adaptations MUST be recorded in `decisions.log`.
3. **No silent skips:** every MUST is non-negotiable. Skipping a MUST is a launch blocker and MUST be raised in the final report.
4. **Configuration over code:** prefer skills, profiles, MCP tools, wiki files, plugin extensions, and Hermes-native features over custom code. Any exception MUST be justified in `decisions.log`.
5. **Memorialize everything:** outcomes, decisions, lookup misses, assumptions, hunches, reconciliations, drift observations, and self-improvement events MUST all land in the proper records.
6. **Self-confirmation:** when uncertain, the agent MUST record the question, options, and chosen option in `decisions.log` before acting. It does not interrupt the operator mid-implementation.
7. **Critical thinking, not boilerplate:** every requirement gets real evidence, not a "looks fine" claim.

## 8.3 Out of scope for this phase
- The Nexxus cutover, which is tracked separately.
- New customer feature work not required by the acceptance criteria above.
- Replacing Hermes-native primitives with custom alternatives.

## 8.4 /goal for the implementation agent

```text
/goal Complete the pre-launch implementation of Huminic Studio per the Next Phase SRS in this package.

Read all eight parts of the SRS plus the verbatim user instruction file. Fold the acceptance criteria into your current implementation plan and proceed in tranche order A through G.

Build the per-profile Brain at ~/.hermes/profiles/<profile>/brain/ with the storage substrate, migrations, backup/restore, and DSG gate. Mirror the KSG gating pattern in the DSG, share one policy engine and one audit log, and add the Brain tools to the existing MCP token registry. Implement the always-on metadata substrate as the sixth wiki invariant and reject any deployment that lacks it.

Operationalize the Knowledge ↔ Brain interaction contract from Artifact B v1.1 across every profile. Implement the Brain record families adapted from Artifact D v1, including hunches, lookup_misses, chat_records, and assumptions. Build the memory layer, the embeddings pipeline, and the schema migration discipline. Capture adjacent-data-neighbor anticipation as a first-class element of engagement-state and Brain content.

Complete the Consultative Agent so it can run an end-to-end engagement against the Cedar Ridge Automotive Group fixture and any future customer, including wiki authoring under KSG, Brain seeding under DSG, assumption surfacing, capability gap proposals, and full prescription package emission.

Harden the plugin, ship the required skills, choose and document the dashboard renderer, enforce federation.read_scopes through checkScope, route communications through MCP, build the governed upload surface, and reuse the existing SSE bus. Then implement the Huminic-the-company rollup through authorized children with full audit.

Execute the F.1 through F.9 security review including headed and headless pen-test sweeps. Run every user story in Tranche G with both headless and headed evals and publish the evidence pack in the engagement log. Maintain decisions.log throughout and use it to memorialize every non-trivial choice you make.

Adapt the plan in the field as needed, but do not weaken any MUST. Do not modify Hermes core unless you can record a deliberate, justified exception. When done, return: executive summary, tranche-by-tranche status, acceptance-criteria checklist with evidence references, decisions.log summary, security review summary, and a launch readiness recommendation.

The Nexxus cutover is out of scope for this phase. After this phase the system must be launch-ready.
```
