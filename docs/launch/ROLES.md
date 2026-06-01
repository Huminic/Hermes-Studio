# ROLES.md — Huminic Studio role catalog (Phase 8 launch closeout)

**Purpose.** Enumerate every actor whose work crosses the Huminic Studio operating layer at launch. One paragraph per actor describing identity, ownership boundaries, reads, writes, handoffs into/out of the role, and escalation paths. Inputs: existing governor SOULs, `HUMAN_TESTING_SCRIPT.md`, `PLAN.md` Phase 8 actor inventory, `docs/next-phase-data-to-completion/SRS_Phase_Next_Combined.md`.

**How this catalog is used.** Together with `docs/launch/WORKFLOWS.md` it forms the table of contents for the five human manuals under `docs/launch/manuals/` and the ~17 agent SOUL stubs under `<profile>/governance/agents/`. Every actor below must trace to at least one workflow row in WORKFLOWS.md; every workflow must trace back to at least one actor here. Gaps surfaced while writing land in the running log in `PLAN.md` as `GAP-ROLE-*` rows.

**Status note.** Several actors below carry an explicit `STATUS:` line flagging that their identity is named here but their implementation, SOUL, or operating-layer wiring is missing — those are the same gaps the operator surfaced when the prior conditional GO was retracted. ROLES.md does not invent new implementation; it makes the missing-actor identities legible.

---

## 1. Operator

**Identity.** Duane Wells (today; future: any human with the `is_admin: true` flag set in their profile `auth.yaml`). Single tenant of admin authority across all profiles. Holds the Coolify token, the central-mcp admin scope, the deploy keys, the DNS authority, and the readiness-gate sign-off.

**Ownership.** Everything the system cannot decide for itself: scope changes, accepted-risk decisions, gate approvals, irreversible actions (DNS flips, decommissions, force-pushes, real-credential activations). Owns `docs/launch/DECISIONS.log` as the append-only audit of operator decisions. Owns CLAUDE.md, AGENTS.md, and the governance file templates.

**Reads.** PLAN.md, EVIDENCE_INDEX.md, the running gap log, agent audit trails, Studio admin screens (`/profiles`, `/agents`, `/engagements/<customer>`, `/audit`, `/tasks`), `engagement-state.yaml` per customer, KSG/DSG findings.

**Writes.** Operator-only governance files (CLAUDE.md, AGENTS.md, file-standards.md), readiness-gate approvals in engagement-state.yaml, scope-change entries in DECISIONS.log, `auth.yaml` for new admin/customer-admin credentials (via `scripts/create-user.ts`), Coolify env vars + redeploy triggers, MCP token registry. Approves promotions out of `knowledge/drafts/` into `knowledge/published/`.

**Handoffs in.** Consultative agent prescription packages, Provisioner readiness reports (post-launch), KSG/DSG conflict reconciliation requests, customer-admin escalations, agent failure reports, Playwright/vitest evidence at the end of each phase.

**Handoffs out.** Decisions logged in DECISIONS.log, gate approvals written into engagement-state.yaml, production env-var changes, decommission authorization.

**Escalation.** Top of stack. No escalation path above the operator; the operator escalates to themselves with a STOP → document → present options → wait → resume cycle per the Blocker Protocol.

---

## 2. Consulting human operator

**Identity.** Huminic sales professional (today: also Duane; tomorrow: a sales rep with consultative-agent dispatch authority). Logs in to Studio as `is_admin: true` but operates inside the consultative engagement loop rather than the system-admin loop. The human face of a consultative engagement.

**Ownership.** Owns the dispatch of the consultative agent against a prospective customer, the reading of the agent's prescription, the operator-facing resolution of surfaced assumptions, and the handoff of the prescription to provisioning. Owns the customer relationship during the engagement (consultative agent is the assistant; this human is the principal).

**Reads.** Customer-supplied evidence (uploaded documents, screenshots, transcripts), consultative-agent SOUL, the six-phase method pages in `consultative-agent/knowledge/method/`, the in-flight prescription artifacts in `<customer>/knowledge/inbox/` and `drafts/`, engagement-state.yaml stage strip, open decisions, deployment notes.

**Writes.** Initial engagement-state.yaml seed at stage `draft` (today done by hand; should be a button per `GAP-MANUAL-engagement-seed` to be logged in PLAN.md if missing during manual writing). Operator notes inline in customer wiki under `knowledge/inbox/operator-notes/`. Resolutions of open decisions (returned through the agent or appended directly with the agent's awareness). Approves the prescription handoff to Provisioner.

**Handoffs in.** Customer evidence (email transcripts, prior Nexxus exports, dealer system credentials offered for inspection), operator instruction at engagement kickoff.

**Handoffs out.** Approved prescription package to Provisioner (today: to the operator, since Provisioner is `GAP-PROV-001`). Engagement-state.yaml advance through `gathering_data` → `solution_discovery` → `creation` → `submission` → `feedback` → `ready_to_run`.

**Escalation.** Up to operator on accepted-risk calls (e.g., customer wants a deferred capability now). Sideways to KSG/DSG when the agent's authored content collides with existing canon.

---

## 3. Customer-admin

**Identity.** A human at the customer (a dealer principal, GM, or designated power-user) with `is_customer_admin: true` on the customer's profile `auth.yaml`. Per-profile scope only; cannot cross to a different customer's profile. Logs into the storefront at `/p/<slug>/...`, not the Studio admin shell.

**Ownership.** Their profile's wiki content within KSG-permitted trees (drafts, inbox, widgets), their staff list (when invite is shipped — `GAP-CUSTOMER-INVITE-001` flagged in this catalog for follow-up), their widget configurations, their campaign authoring inside Comms/Campaigns, their data dashboard (when the Data tile is enabled per studio.yaml — disabled at launch for all 10 storefronts per SRS-D3).

**Reads.** Their own storefront pages (`/p/<slug>/{chat,knowledge,tools,comms,campaigns}`), their inbox threads, their published wiki, their widget previews, their public widget endpoints (`/w/<slug>`).

**Writes.** Drafts under `<profile>/knowledge/drafts/` through the storefront Knowledge tab. Widget config under `<profile>/knowledge/widgets/*.md`. Outbound replies on threads via the Comms tab. Campaign templates + audiences via the Campaigns tab (Service-only at launch per operator decision 2026-05-29). Cannot promote drafts to published — that goes to KSG → operator approval.

**Handoffs in.** Operator credential provisioning (today via `scripts/create-user.ts` invocation per `scripts/provision-launch-profiles.ts`; future via self-service invite — flagged as `GAP-CUSTOMER-INVITE-001`). Consultative-agent prescription that seeded their wiki.

**Handoffs out.** Wiki drafts → KSG gate → published. Outbound message → comms adapter → external channel. Reset request → operator inbox.

**Escalation.** Up to operator via password-reset flow (`/api/auth/reset-request`) and out-of-band contact. Sideways to KSG when a write is blocked.

**STATUS.** No `/api/auth/logout` endpoint or UI logout control exists at launch — see `GAP-LOGOUT-001` in PLAN.md running log.

---

## 4. Consultative agent

**Identity.** A profile-distributed agent living at `~/.hermes/profiles/consultative-agent/`. SOUL references the six-phase method (orient → audit → design → author → validate → package), the human-relay specification, the scope contract, and the approval matrix. Implemented in `src/server/consultative-engine.ts` with engagement-state writeback per phase.

**Ownership.** Producing the prescription package for a customer: client wiki, agentic-design doc, data-storage spec, MCP-access spec, two semantic-agent specs (KSG + DSG), and the manifest with readiness gates and deployment notes. Owns assumption-surfacing (lookup-miss) discipline — when it doesn't know, it logs a deployment note rather than confabulating.

**Reads.** Customer evidence supplied via the human relay, its own method pages, existing Hermes wiki context, prior engagement-states on the same customer (re-runs are additive). Reads canonical Huminic wiki canon to ground its solution shape.

**Writes.** Six prescription artifacts under `<customer>/knowledge/inbox/` and `drafts/` (never directly to `published/` — that requires KSG + operator). Engagement-state.yaml stage advances + readiness gate proposals (operator approves). Deployment notes (open vs resolved). Adjacent data neighbors. Lookup-miss assumption logs.

**Handoffs in.** Dispatch from consulting human operator with a goal. Customer evidence relayed through the operator.

**Handoffs out.** Prescription package → consulting human operator → Provisioner (when built) → KSG/DSG enforcement at runtime → live customer storefront.

**Escalation.** Up to consulting human operator at every readiness gate (cannot self-approve per Core Value #5). Sideways to KSG when proposed canon writes would conflict.

**STATUS.** Live for `huminic`, `serra-automotive`, `strukture`, `cedar-ridge-automotive` engagements. AC.13 productization for huminic-account validated in Phase C.13. Per PLAN.md GAP scan: SOUL ↔ `consultative-engine.ts` drift not yet checked — adding `GAP-CONSULTATIVE-DRIFT-001` if writing the consulting-human-operator manual surfaces a divergence.

---

## 5. Performance engagement consultative agent

**Identity.** A specialization of the consultative agent that runs against an *existing* customer profile to surface performance opportunities (where workflow has drifted, where evidence shows a process gap, where canon needs renewal) rather than against a *prospective* customer for greenfield scoping. Same SOUL substrate; different system prompt + different reading set.

**Ownership.** Periodic re-orient/re-audit cycles against a live customer — sweeping `engagement-state.yaml` history, agent audit logs, KSG/DSG findings, Brain reconciliations, and the customer's actual usage patterns. Producing a *performance prescription* (delta from the original): what's working, what regressed, what to renew.

**Reads.** Customer's full live wiki including `published/`, agent audit logs, Brain reconciliation history, KSG/DSG metadata audit rows, comms thread analytics, Tavus/Vapi transcripts (where allowed by `federation.read_scopes`).

**Writes.** A performance-prescription artifact alongside the original prescription (suffix `-performance-<YYYY-MM-DD>.md`) under `<customer>/knowledge/drafts/`. Updates engagement-state.yaml with a new stage `performance_review` (additive — not in the seven-stage launch list; would require schema bump — flag `GAP-ENG-STATE-PERF-001` for follow-up).

**Handoffs in.** Operator-scheduled cadence (monthly/quarterly), or operator on-demand dispatch when a customer flags a concern.

**Handoffs out.** Performance prescription → operator → either re-engage consultative agent for re-design, or accept-as-is, or schedule a re-implementation pass.

**Escalation.** Same as the consultative agent.

**STATUS.** Not yet implemented as a separate dispatch surface. The consultative-engine.ts six-phase method is the closest substrate; specialization is a stub identity. `GAP-PERF-CONSULTATIVE-001` flagged.

---

## 6. Provisioner

**Identity.** The agent that takes an approved consultative prescription and *executes* it against the live system — provisioning the customer profile, copying the SOUL/persona/wiki tree, wiring MCP scopes, registering credentials, enabling channel adapters, sending the customer-admin invite. Counterpart to the consultative agent: consultative writes, Provisioner runs.

**Ownership.** All operations that turn a prescription manifest into a working customer profile. Idempotent application of the six prescription artifacts. Failure-state reporting back to the operator. Writes a per-customer provisioning audit trail.

**Reads.** Prescription manifest, customer's draft wiki, scope contract, approval matrix, MCP-access spec, Hermes provisioning scripts (existing: `scripts/provision-launch-profiles.ts`, `scripts/create-user.ts`, `scripts/bootstrap_local_hermes_scaffold.sh`).

**Writes.** New profile directories on the production volume, `auth.yaml` for customer-admin, `studio.yaml` for branding + menu visibility, `mcp.json` with per-profile server entries, `engagement-state.yaml` advance to `ready_to_run`. Sends customer-admin invite email via the comms substrate. Records a provisioning-complete audit row.

**Handoffs in.** Approved prescription package from consultative agent + operator approval.

**Handoffs out.** Live customer-admin able to log in at `/p/<slug>/`. KSG/DSG enabled on the new profile. Engagement-state advanced. Operator notified of completion.

**Escalation.** Up to operator on any irreversible step (real credential activation, DNS, decommission of prior tenant). Halts on schema mismatch (per the lesson learned in P-FIX-003 — silent Zod fallback).

**STATUS.** **NOT BUILT.** This is `GAP-PROV-001` in PLAN.md running log. Today: operator does this work by hand with assistance from the agent in the loop. Provisioner SOUL stub at `huminic/governance/agents/provisioner.md` will be authored in this Phase 8 pass (closes the gap at the identity level; building the executor is post-launch).

---

## 7. Knowledge Semantic Guardian (KSG)

**Identity.** A per-customer agent identity living at `~/.hermes/profiles/<slug>-data-governor/` (unified with DSG in the same SOUL — the named identity is the customer's data governor, the *roles* are KSG and DSG). Code-level enforcement lives at `src/server/ksg-gate.ts`; the named-agent identity is what makes the role *addressable* for reconciliation requests, integrity findings, and operator queries.

**Ownership.** Write-time gate enforcement against the customer's wiki: protected-tree denial (no writes to `canon/`, `governance/`, `archive/`, `.git`, `db`), canonical-frozen denial (no overwrite of canonical pages without operator approval), missing-frontmatter denial (frontmatter must conform to wiki-spec). Promote-order enforcement (`inbox/` → `drafts/` → `published/` only). Future: integrity-scanner role per `GAP-KSG-SCANNER-001` — broken wikilinks, drift, stale pages, dead-ends, conflict detection, cadenced renewals.

**Reads.** Every write attempt to `<slug>/knowledge/` and `<slug>/governance/` paths. Existing canon for collision detection. Frontmatter schema. The customer's own engagement-state.yaml for context.

**Writes.** `metadata_audit` rows in the customer's Brain (sixth invariant) for every gated action. Findings under `<slug>-data-governor/knowledge/findings/` (when scanner role lands). Hunches in Brain (when scanner lands).

**Handoffs in.** Every write through the customer wiki — both from agents (runtime, consultative, Provisioner) and humans (customer-admin via storefront Knowledge tab, consulting human operator via consultative engagement).

**Handoffs out.** Pass/fail verdict back to the writer. On failure: a `KSG_BLOCKED` audit row + a human-readable verdict text. Reconciliation request to operator when the conflict is non-trivial.

**Escalation.** Up to operator for reconciliation. Sideways to DSG when the conflict spans wiki ↔ Brain.

**STATUS.** Code-level gate live for all profiles. Named-identity SOULs exist for huminic, strukture, serra-automotive, cedar-ridge-automotive (4 of 11 customer-shaped profiles). 7 missing per `GAP-SG-001`: serra-honda, serra-nissan, serra-service, tony-serra-ford, ford-of-columbia, hyundai-of-columbia, huminic-motors. Integrity-scanner half of the spec is `GAP-KSG-SCANNER-001` (not in Phase 8 implementation scope; SOUL stubs will name the role).

---

## 8. Data Semantic Guardian (DSG)

**Identity.** Logically distinct role; physically unified with KSG in the same `<slug>-data-governor` SOUL. Code-level enforcement at `src/server/dsg-gate.ts`. Where KSG governs the *wiki* surface, DSG governs the *Brain* surface (per-profile sqlite at `<slug>/brain/brain.db` schema_version 4 + the sixth-invariant metadata substrate).

**Ownership.** Write-time gate enforcement against Brain: cross-tenant write denial (a customer's runtime agent cannot write to another customer's Brain), schema-conformance for record families (16 families per Tranche B), reconciliation when an inbound record contradicts existing canon, lookup-miss surfacing (when an agent asks Brain for a fact it doesn't have, surface as an assumption rather than confabulate).

**Reads.** Every write attempt to `<slug>/brain/brain.db`. Existing records for collision detection. Record-family schemas. Adjacent record neighbors (per Tranche B graph).

**Writes.** `metadata_audit` rows on every gated write. Hunches when uncertain records arrive. Reconciliation candidates when contradictions surface (operator approves the resolution).

**Handoffs in.** Every Brain write from runtime agents, embedding pipeline, consultative chat memorialization, comms-adapter inbound message persistence, KSG-mediated canonical promotions.

**Handoffs out.** Pass/fail verdict back to writer. Reconciliation request to operator on contradictions. Hunches surface in `/engagements/<customer>` panel.

**Escalation.** Same as KSG.

**STATUS.** Code-level gate live. Named-identity coverage same as KSG (7 missing per `GAP-SG-001`).

---

## 9. Runtime agents (per customer / per channel)

**Identity.** A category, not a single role. The customer-side worker agents that run business workflows: Elliott (Vapi voice + service), Caroline (SMS), lead-follow-up, lead-response, service, crm-data-guru, sales-coach, communication-writer, photo-studio, video-producer, copywriter, market-intel, creative-director. Each is a SOUL fragment under `<dealer>/governance/agents/<id>.md` with channel-specific persona fragments at `<dealer>/governance/agents/<id>/personas/<channel>.md`.

**Ownership.** A single, well-bounded business outcome — Elliott returns inbound service calls as ADF-formatted leads to the dealer DMS; Caroline responds to inbound SMS within service hours; lead-follow-up nudges leads through a configurable sequence. Each owns one Kanban lane and reads one workflow page.

**Reads.** Their own SOUL fragment + the relevant channel persona fragment. The workflow page they execute against (under `<dealer>/knowledge/workflows/`). The customer's published canon. Channel-specific scratchpad (Vapi transcripts, SMS thread history, ADF lead payload). Brain records they're scoped to.

**Writes.** Outbound messages via the channel adapter (subject to comms rate-cap + allowlist). Brain records (subject to DSG). Wiki updates under `<dealer>/knowledge/drafts/` only (never direct to published). Kanban task transitions on their lane.

**Handoffs in.** Inbound channel events (Vapi end-of-call webhook, TextMagic inbound, ADF webhook, customer-admin dispatch from Comms). Scheduled cron triggers per `<dealer>/cron/`.

**Handoffs out.** Outbound messages → comms substrate → external. Brain records → DSG. Wiki drafts → KSG → operator/customer-admin promote. Task transitions → next agent in workflow.

**Escalation.** To customer-admin (via Comms thread assignment), then to operator if customer-admin can't resolve. To KSG/DSG on contradictory writes.

**STATUS.** Per-dealer templates at launch are SOUL stubs with `enabled: false`. Live runtime agents at launch: only Elliott on huminic-motors (CZ-003). The other 9 dealers run with credentials provisioned but no agent flips. Operator flips per dealer when ready.

---

## 10. Comms substrate

**Identity.** Not a single agent — the email/SMS/voice/video/webhook pipeline that runtime agents and human users dispatch through. Implemented as `gateway/platforms/<channel>.py` BasePlatformAdapter subclasses distributed via per-profile `distribution.yaml` (no Hermes core fork), plus the per-profile messaging-hub sqlite at `<profile>/messaging-hub.db`. Studio-mediated MCP comms tools live as `comms_*` MCP tools with rate-caps + allowlists.

**Ownership.** Inbound: normalization of every channel event into a `MessageEvent` with channel + domain tagging, persistence to `messages` + `inbox_routing` + `contacts` (with dedupe across channels), SSE broadcast to UI subscribers. Outbound: rate-cap enforcement, allowlist enforcement, adapter dispatch, status callback persistence. Round-trips for ADF (Auto Dealer Format) email payloads.

**Reads.** Per-profile `mcp.json` for which adapters are enabled. Per-profile `.env` for channel credentials (TEXTMAGIC_*, VAPI_*, TAVUS_*, RESEND_*). Channel rate-cap configs. Allowlist configs (which domains/numbers/personas are permitted recipients per profile).

**Writes.** `messages`, `inbox_routing`, `contacts`, `thread_agent_subscriptions`, `agent_reply_jobs`, `campaigns`, `campaign_deliveries` rows. Comms audit rows on every send. Outbound to external channel APIs (subject to operator-action gates OP-002 for per-customer real credentials).

**Handoffs in.** Runtime agent dispatch. Customer-admin Comms tab reply. Scheduled campaign worker. Inbound webhook from external channel. ADF inbound email parse.

**Handoffs out.** External channel APIs (Vapi, TextMagic, Tavus, Resend). UI subscribers via SSE. Brain records for memorialization. Audit log for compliance.

**Escalation.** Rate-cap or allowlist denial returns to caller. Adapter failure surfaces in audit + retries per policy. Operator notified on persistent failures.

**STATUS.** Engine + adapters scaffolded (PR #41 Tranche D). Real credential activation per customer is operator-action gate OP-002. ADF parser (AC.6.7) + emitter (AC.6.8) live.

---

## 11. Federation substrate

**Identity.** The cross-source query layer — `mcp-federation` skill with `federated_search(query, scopes)` tool — enforcing `federation.read_scopes` declared in each profile's `studio.yaml`. Design at `docs/federation-mcp-design.md`. Counterpart to direct cross-profile access (which is explicitly NOT a fourth surface per Core Constraint).

**Ownership.** A single query path that crosses profile boundaries only when explicitly authorized. Banded scope model: a query from profile A asking about profile B's data must match a scope in B's `federation.read_scopes` that names A. Default-deny.

**Reads.** Caller profile context, target scope name, target profile's `federation.read_scopes`, target Brain (read-only), target wiki published pages (read-only). MindsDB (when sidecar deployed per OP-003 — currently shim).

**Writes.** Audit row per federated query (caller, scope, target, query, row count). Never writes to target profile state.

**Handoffs in.** Any agent or human query that names a foreign profile's data.

**Handoffs out.** Query result rows scoped to authorized fields. Audit row.

**Escalation.** Denied query returns a verdict + suggested scope name. Operator authorizes new scopes via target profile's `studio.yaml`.

**STATUS.** Design + skill stub live. Real MindsDB shim returns "MindsDB not configured" until OP-003. Cross-profile authorization model live; full integrity tests on the deny path are part of the Phase 8 regenerated eval suite.

---

## 12. Rollup substrate

**Identity.** The Huminic-the-company aggregation case — `mcp_rollup_query` MCP tool with `rollup:<parent>` scope grant model. Huminic-the-company is itself a profile (`huminic`) AND the umbrella under which child profiles (`huminic-motors`, future child dealerships) report. Rollup is the legitimized cross-profile read that doesn't go through federation because it's pre-authorized by the parent-child relationship in the profile graph.

**Ownership.** Aggregating Brain records + wiki canon across child profiles for a parent operator. Enforcing `rollup:<parent>` scope — only a token holder with the parent scope can call `mcp_rollup_query` against the children. Read-only (rollup never writes back into children).

**Reads.** Caller scope claim, parent profile's child registry, each child's Brain (read-only). Wiki published canon across children. Optionally: comms metrics aggregated across children.

**Writes.** Audit row per rollup query. Never to child state.

**Handoffs in.** Huminic-the-company operator dashboard query, scheduled rollup report generator (when built), parent-scope MCP token holder.

**Handoffs out.** Aggregated query result. Audit row.

**Escalation.** Denied query returns a verdict citing the missing parent scope. Operator authorizes via the MCP token registry.

**STATUS.** Tool live + pen-test verified (F.9 13/13 blocked). Dashboard UI deferred (couples with D-3 plugin-native renderer per SRS-E disposition in DECISIONS.log).

---

## 13. Cross-actor patterns

**Identity.** Not an actor — a category of *interactions* between actors that the operating layer must handle. Concurrent edits (operator and customer-admin both editing the same wiki page), handoffs (consultative agent finishes phase, hands to operator, hands to Provisioner), state-transitions (engagement-state stage advance, gate approval, readiness flip), audit (every cross-actor action leaves a row), idempotency (re-dispatching the same Provisioner job should be safe).

**Ownership.** Spread across multiple actors. The operating-layer contract is: every cross-actor handoff has a written-down before-state, a written-down after-state, a single owner of the transition, and an audit row that names both actors. When the contract holds, work completes. When the contract is missing, work stalls in handoff — which is the pattern the operator surfaced when the conditional GO was retracted.

**Reads / Writes.** Per the underlying actors involved.

**Handoffs in / out.** The handoffs themselves are the subject.

**Escalation.** Stalled handoff escalates to operator after a workflow-defined wait. Each manual under `docs/launch/manuals/` will include a *recovery* section naming the actor and the wait threshold for the workflows it covers.

**STATUS.** Several known gaps in the operating layer surface as cross-actor handoff stalls: consultative → Provisioner (GAP-PROV-001), drafts → published (KSG approves, operator promotes — but no UI affordance for the promote button, surfacing while writing the manuals as `GAP-MANUAL-promote-001` if confirmed), customer-admin invite (no self-service flow — `GAP-CUSTOMER-INVITE-001`). Phase 8 manual writing will surface additional cross-actor gaps as `GAP-FLOW-*` rows.

---

## 14. Failure & recovery

**Identity.** The negative-space surface. Every workflow has at least one failure mode (write blocked, adapter unreachable, model timeout, rate-cap hit, schema mismatch, partial provisioning, abandoned consultative engagement) and at least one recovery mode (retry, escalate, fall back, mark partial, defer with disposition). Failure & recovery is the *named* requirement that every actor's manual must include explicit recovery paths.

**Ownership.** No single owner; every actor owns its own failure modes. The operating-layer contract: every workflow row in WORKFLOWS.md states what *failure* looks like and what *recovery* looks like. The five human manuals carry the playbook prose; the agent SOULs carry the sequence-diagram recovery branch.

**Reads.** Audit logs, agent failure reports, adapter status callbacks, KSG/DSG verdicts, engagement-state.yaml deployment notes.

**Writes.** Recovery audit rows. Deployment notes on partial completions. Operator notifications on persistent failures.

**Handoffs in.** Any actor whose work failed.

**Handoffs out.** Recovery action by the same actor (retry), the owner of the next workflow step (handoff), the operator (escalate), or a deferred-with-disposition entry in the running log (accept and continue).

**Escalation.** Up to operator after the actor-specific retry budget exhausts.

**STATUS.** Recovery paths are inconsistently documented across the existing code. Phase 8 manual writing is the diagnostic: every workflow that lacks a recovery branch in the manual will get a `GAP-FLOW-recovery-*` row in the running log.

---

## Coverage check (actor count)

14 actors / surfaces covered. Operator inventory in PLAN.md Phase 8 calls for 12–15. Coverage:

| # | Actor | Inventory match |
|---|---|---|
| 1 | Operator | ✓ |
| 2 | Consulting human operator | ✓ |
| 3 | Customer-admin | ✓ |
| 4 | Consultative agent | ✓ |
| 5 | Performance engagement consultative agent | ✓ |
| 6 | Provisioner | ✓ (GAP-PROV-001) |
| 7 | Knowledge Semantic Guardian | ✓ |
| 8 | Data Semantic Guardian | ✓ |
| 9 | Runtime agents | ✓ |
| 10 | Comms substrate | ✓ |
| 11 | Federation substrate | ✓ |
| 12 | Rollup substrate | ✓ |
| 13 | Cross-actor patterns | ✓ |
| 14 | Failure & recovery | ✓ |

All 14 operator-listed surfaces covered. No invented additional actors. The `STATUS.` lines surface the actor-level gaps that the manuals + SOULs will detail.

---

## Gaps surfaced during ROLES.md drafting (logged to PLAN.md running log)

- `GAP-CUSTOMER-INVITE-001` — no self-service customer-admin invite flow. Operator provisions via CLI.
- `GAP-CONSULTATIVE-DRIFT-001` — SOUL ↔ `consultative-engine.ts` behavior not yet drift-checked. Pending consulting-human-operator manual write.
- `GAP-PERF-CONSULTATIVE-001` — performance engagement consultative variant not implemented as a separate dispatch surface.
- `GAP-ENG-STATE-PERF-001` — engagement-state.yaml schema has no `performance_review` stage; adding one requires schema bump.
- (existing) `GAP-PROV-001`, `GAP-SG-001`, `GAP-KSG-SCANNER-001`, `GAP-LOGOUT-001`, `GAP-AGENT-WIKI-001`, `GAP-CONSOLE-001`, `GAP-PROBE-SIDE-EFFECT-001` — already in PLAN.md running log; ROLES.md references them where the actor is affected.

Four new gaps surfaced. Logging to PLAN.md next.
