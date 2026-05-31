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
