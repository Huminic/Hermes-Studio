# WORKFLOWS.md — Huminic Studio workflow catalog (Phase 8 launch closeout)

**Purpose.** For each actor in `docs/launch/ROLES.md`, enumerate 3–5 concrete end-to-end workflows. Each row is one sentence. Each row carries: the workflow id (`WF-<actor-code>-NNN`), the actor(s) it spans, the manual that contains the long-form playbook, the gap-pass status (green / gap-flagged / has-question), and the GAP-* row in `PLAN.md` if applicable.

**This file is a table of contents.** The prose lives in `docs/launch/manuals/*.md` (human workflows) and `<profile>/governance/agents/*.md` SOULs (agent workflows). Mermaid diagrams live at the top of each manual + SOUL.

**Gap-pass question** applied to every workflow: *what has to be true for this to work end-to-end in the running system today?* If nothing is missing → green. If anything is missing → gap-flagged with a `GAP-*` row in `PLAN.md` running log.

**Actor codes** (match ROLES.md numbering):

| Code | Actor |
|---|---|
| OP | Operator (1) |
| CHO | Consulting human operator (2) |
| CA | Customer-admin (3) |
| CON | Consultative agent (4) |
| PCO | Performance engagement consultative agent (5) |
| PRV | Provisioner (6) |
| KSG | Knowledge Semantic Guardian (7) |
| DSG | Data Semantic Guardian (8) |
| RT | Runtime agents (9) |
| CMS | Comms substrate (10) |
| FED | Federation substrate (11) |
| RLP | Rollup substrate (12) |
| XAC | Cross-actor patterns (13) |
| F&R | Failure & recovery (14) |

---

## 1. Operator (OP) — workflows

Lives in: `docs/launch/manuals/studio-admin-guide.md`.

| id | one-sentence workflow | gap status |
|---|---|---|
| WF-OP-001 | Operator logs in at `studio.huminic.app` with admin credentials and lands on the operations dashboard with sidebar access to Profiles, Agents, Engagements, Tasks, Skills, Plugins, MCP tokens, Audit, Files. | green |
| WF-OP-002 | Operator promotes a wiki draft from `<profile>/knowledge/drafts/<page>.md` to `published/` via the Files screen Promote button, routing through KSG and writing a metadata audit row. | gap-flagged (`GAP-MANUAL-promote-001` to be logged if button-vs-CLI is not yet wired in Files screen — confirm during manual write) |
| WF-OP-003 | Operator approves a readiness gate on a customer engagement (e.g., huminic `topology_decided`) via `/engagements/<customer>` detail view, writing approver + notes back to `engagement-state.yaml`. | green |
| WF-OP-004 | Operator provisions a new customer profile by running `scripts/provision-launch-profiles.ts` (today) — applying scaffold, writing `auth.yaml`, seeding `studio.yaml`, and creating a customer-admin credential. | gap-flagged (`GAP-PROV-001` — should be a Provisioner agent dispatch, not a script invocation) |
| WF-OP-005 | Operator rotates an MCP token in the central-mcp token registry, redeploys the consuming profile, and verifies via `/audit` that the new token is in use. | green |
| WF-OP-006 | Operator triggers a Coolify redeploy of `hermes-studio` after merging to main, verifies the new build is live via `/api/auth-session` headers + a fresh-localStorage headed Playwright sweep per `feedback_live_headed_sweep.md`. | green |
| WF-OP-007 | Operator signs out by clearing browser cookies (today — no logout endpoint), then re-logs in fresh to verify session boundaries. | gap-flagged (`GAP-LOGOUT-001`) |

## 2. Consulting human operator (CHO) — workflows

Lives in: `docs/launch/manuals/consulting-human-operator-guide.md`.

| id | one-sentence workflow | gap status |
|---|---|---|
| WF-CHO-001 | Consulting human operator dispatches the consultative agent against a prospective customer by creating a new profile directory, seeding `engagement-state.yaml` at stage `draft`, and opening a chat session against the agent profile. | gap-flagged (`GAP-FLOW-engagement-seed-001` — is there a Studio UI button to seed engagement-state.yaml at `draft`, or only CLI? Confirm during manual write.) |
| WF-CHO-002 | Consulting human operator relays customer evidence (uploaded documents, email transcripts, prior Nexxus exports) into the consultative engagement via the `/files` screen + paste into chat. | green |
| WF-CHO-003 | Consulting human operator resolves an open decision surfaced by the consultative agent (e.g., "should this customer get Vapi or Tavus first?") by writing back through the agent or appending to `engagement-state.yaml.open_decisions[]`. | green |
| WF-CHO-004 | Consulting human operator reviews the six prescription artifacts in `<customer>/knowledge/drafts/` after `package` phase, approving readiness gates 1–5 in `engagement-state.yaml`, advancing the engagement to `ready_to_run`. | green |
| WF-CHO-005 | Consulting human operator hands the approved prescription off to provisioning — today by alerting the operator + running the provisioning script; tomorrow by dispatching the Provisioner agent. | gap-flagged (`GAP-PROV-001`) |

## 3. Customer-admin (CA) — workflows

Lives in: `docs/launch/manuals/customer-admin-guide.md`.

| id | one-sentence workflow | gap status |
|---|---|---|
| WF-CA-001 | Customer-admin logs in at `/p/<slug>/` with their per-profile credentials, lands on the storefront landing, and clicks through to one of the 6 tabs (Chat, Knowledge, Tools, Data, Comms, Campaigns — Data tile disabled at launch per SRS-D3). | green |
| WF-CA-002 | Customer-admin opens the Chat tab, picks one of their profile's agents from the per-profile roster, and holds a multi-turn conversation that persists into messaging-hub as `channel: chat`. | green |
| WF-CA-003 | Customer-admin opens the Knowledge tab, edits a page under `knowledge/drafts/`, and clicks Save — KSG enforces protected-tree + frontmatter rules + collision detection; failures return a verdict text. | green |
| WF-CA-004 | Customer-admin opens the Tools / Widget sub-page, edits a widget's greeting/accent color/agent assignment, copies the embed snippet, and verifies the public `/w/<slug>` route renders the updated widget. | green |
| WF-CA-005 | Customer-admin opens the Comms tab, reads inbound threads in the Sales segment, replies on the appropriate channel (email/SMS), and sees the SSE-updated thread reflect the agent's autonomous reply (where subscribed). | gap-flagged (`OP-002` — per-customer real channel credentials are operator-action gates; until provisioned, send returns `unconfigured`) |
| WF-CA-006 | Customer-admin opens the Campaigns tab, picks a Service template (Service Recall / Service Due / Follow-up Lead), builds an audience from contacts, schedules the send, and watches deliveries land in Comms. | gap-flagged (`OP-002` for adapter credentials) |
| WF-CA-007 | Customer-admin requests a password reset by POSTing to `/api/auth/reset-request` with their email, redeems the single-use token at `/reset?token=<x>`, and re-logs in with the new credential. | green (live-verified P-FIX-002) |
| WF-CA-008 | Customer-admin invites an additional staff user to their storefront with `is_customer_admin: true` scope. | gap-flagged (`GAP-CUSTOMER-INVITE-001` — no self-service invite; operator runs `scripts/create-user.ts` today) |

## 4. Consultative agent (CON) — workflows

Lives in: `<consultative-agent>/SOUL.md` + six method pages under `consultative-agent/knowledge/method/`.

| id | one-sentence workflow | gap status |
|---|---|---|
| WF-CON-001 | Consultative agent runs the `orient` phase by ingesting customer evidence + Hermes context, producing an industry-brief + strawman, and advancing engagement-state to `gathering_data`. | green |
| WF-CON-002 | Consultative agent runs the `audit → design → author` cycle, producing the six prescription artifacts (client wiki, agentic-design, data-storage spec, MCP-access spec, KSG spec, DSG spec) into `<customer>/knowledge/drafts/`. | green |
| WF-CON-003 | Consultative agent surfaces an assumption via lookup-miss (when it asks Brain for a fact it doesn't have) and writes it as a `deployment_notes[]` open entry rather than confabulating. | green (HTC-CA-003) |
| WF-CON-004 | Consultative agent runs the `validate` phase challenge-loop, scoring each artifact, and either advances to `package` or returns to `design` with surfaced gaps. | green |
| WF-CON-005 | Consultative agent runs the `package` phase, finalizing readiness gates with operator-required signatures, manifest with deployment notes, and advances engagement to `ready_to_run`. | gap-flagged (`GAP-CONSULTATIVE-DRIFT-001` — SOUL ↔ engine drift unverified) |

## 5. Performance engagement consultative agent (PCO) — workflows

Lives in: `consultative-agent/SOUL.md` (specialization noted) + future `<consultative-agent>/knowledge/method/performance-pass.md`.

| id | one-sentence workflow | gap status |
|---|---|---|
| WF-PCO-001 | Performance engagement agent runs against a live customer profile, sweeping `engagement-state.yaml` history + agent audit logs + KSG/DSG findings + Brain reconciliations + comms thread analytics. | gap-flagged (`GAP-PERF-CONSULTATIVE-001` — no separate dispatch surface) |
| WF-PCO-002 | Performance engagement agent produces a `-performance-<YYYY-MM-DD>.md` delta prescription under `<customer>/knowledge/drafts/` flagging what regressed, what's working, what to renew. | gap-flagged (`GAP-PERF-CONSULTATIVE-001`) |
| WF-PCO-003 | Performance engagement agent advances engagement-state.yaml into a `performance_review` stage (which doesn't exist in the current 7-stage schema). | gap-flagged (`GAP-ENG-STATE-PERF-001` — schema bump needed) |

## 6. Provisioner (PRV) — workflows

Lives in: `huminic/governance/agents/provisioner.md` (SOUL stub being authored in Phase 8) + `huminic/knowledge/provisioning/` playbook (future).

| id | one-sentence workflow | gap status |
|---|---|---|
| WF-PRV-001 | Provisioner reads an approved prescription manifest + executes the customer-profile scaffold (mkdir, distribution.yaml, SOUL.md, config.yaml, mcp.json, .env.example, skills/, cron/). | gap-flagged (`GAP-PROV-001` — agent not built; today done by `scripts/provision-launch-profiles.ts`) |
| WF-PRV-002 | Provisioner copies the consultative-authored six wiki artifacts from drafts into the new customer profile's `knowledge/inbox/` and `drafts/`. | gap-flagged (`GAP-PROV-001`) |
| WF-PRV-003 | Provisioner wires per-profile MCP scopes by writing the customer's `mcp.json` with central-mcp + comms adapters + federation scopes per the prescription's MCP-access spec. | gap-flagged (`GAP-PROV-001`) |
| WF-PRV-004 | Provisioner provisions the customer-admin credential (`auth.yaml` with `is_customer_admin: true`) and dispatches the invite email via the Resend MCP. | gap-flagged (`GAP-PROV-001` + `GAP-CUSTOMER-INVITE-001`) |
| WF-PRV-005 | Provisioner advances engagement-state to `ready_to_run`, records a provisioning-complete audit row, and notifies the operator. | gap-flagged (`GAP-PROV-001`) |

## 7. Knowledge Semantic Guardian (KSG) — workflows

Lives in: `<slug>-data-governor/SOUL.md` (unified KSG + DSG). 7 missing SOULs being authored in Phase 8.

| id | one-sentence workflow | gap status |
|---|---|---|
| WF-KSG-001 | KSG enforces protected-tree denial: any write attempt to `canon/`, `governance/`, `archive/`, `.git`, `db` is rejected with a verdict text and a `KSG_BLOCKED` audit row. | green (HTC-SG-001) |
| WF-KSG-002 | KSG enforces canonical-frozen denial: any overwrite of an existing canonical page without operator approval is rejected. | green |
| WF-KSG-003 | KSG enforces missing-frontmatter denial: any write without conforming wiki-spec frontmatter is rejected. | green |
| WF-KSG-004 | KSG enforces promote-order: only `inbox/` → `drafts/` → `published/` transitions are allowed; other moves are rejected. | green |
| WF-KSG-005 | KSG (integrity-scanner role) sweeps the customer's wiki on cadence, surfacing broken wikilinks, drift, stale pages, dead-ends, and conflict detections to `<slug>-data-governor/knowledge/findings/`. | gap-flagged (`GAP-KSG-SCANNER-001` — scanner not built) |

## 8. Data Semantic Guardian (DSG) — workflows

Lives in: `<slug>-data-governor/SOUL.md` (unified with KSG).

| id | one-sentence workflow | gap status |
|---|---|---|
| WF-DSG-001 | DSG enforces cross-tenant write denial: a runtime agent in profile A attempting to write to profile B's Brain is rejected. | green (HTC-SG-002) |
| WF-DSG-002 | DSG enforces record-family schema-conformance: writes to Brain that don't match a known record family are rejected or surfaced as hunches. | green |
| WF-DSG-003 | DSG surfaces lookup-miss as an assumption: when an agent asks Brain for a fact it doesn't have, the absence is surfaced rather than confabulated. | green (HTC-SG-003) |
| WF-DSG-004 | DSG reconciles a canon conflict by creating a reconciliation candidate; operator approves the resolution; canon is updated or the inbound record is rejected. | green (HTC-SG-004) |
| WF-DSG-005 | DSG writes a `metadata_audit` row for every gated action — sixth invariant. | green (HTC-SG-005) |

## 9. Runtime agents (RT) — workflows

Lives in: per-dealer SOUL fragments at `<dealer>/governance/agents/<id>.md`. Templates live in `huminic/governance/agents/`. 9-13 per dealer; templates being authored in Phase 8.

| id | one-sentence workflow | gap status |
|---|---|---|
| WF-RT-001 | Elliott (Vapi voice + service) handles an inbound call, gathers prospect/customer/vehicle data, emits an ADF-formatted email to the dealer DMS, persists transcript to messaging-hub as a Sales thread. | green at huminic-motors (CZ-003 live-verified); per-dealer enablement is OP-002 |
| WF-RT-002 | Caroline (SMS responder) receives an inbound SMS, looks up the contact in messaging-hub, replies per dealer's persona fragment within service hours, and escalates to human-rep after N turns. | gap-flagged (per-dealer enablement OP-002; multi-turn escalation rules per dealer) |
| WF-RT-003 | Lead-follow-up agent picks up a stalled lead from messaging-hub (no reply in M hours), composes a follow-up via the agent's `communication-writer` template, dispatches via the right channel adapter. | gap-flagged (templates being authored; OP-002) |
| WF-RT-004 | Service agent watches the service Kanban lane, picks up new service-request threads, drafts a response, and either auto-replies (if subscribed) or hands to customer-admin. | gap-flagged (OP-002) |
| WF-RT-005 | CRM data guru pulls the dealer's nightly CRM export (via mcp-federation or VinSolutions MCP), reconciles into Brain, writes the daily-summary report to `<dealer>/knowledge/reports/specs/`. | gap-flagged (`OP-002`; VinSolutions MCP not in launch scope per AC.12.3) |

## 10. Comms substrate (CMS) — workflows

Lives in: `gateway/platforms/<channel>.py` adapters + `messaging-hub` plugin manifest + per-profile messaging-hub.db.

| id | one-sentence workflow | gap status |
|---|---|---|
| WF-CMS-001 | Comms substrate handles an inbound email at the Resend webhook, normalizes to MessageEvent, persists with channel + domain tags, broadcasts SSE to UI subscribers, and dedupes contact across channels. | green (HTC-CM-001) |
| WF-CMS-002 | Comms substrate handles an inbound SMS via TextMagic webhook with the same normalization path, into a Sales or Service thread per the originating widget/campaign domain tag. | gap-flagged (OP-002 — TextMagic credentials) |
| WF-CMS-003 | Comms substrate handles an inbound Vapi voice transcript + end-of-call webhook, persisting transcript + status, optionally emitting ADF email outbound for sales leads. | green for huminic-motors (CZ-003); gap-flagged for other dealers (OP-002 + OP-004) |
| WF-CMS-004 | Comms substrate handles an inbound Tavus video session event, persisting transcript + recording URL into a Sales thread. | gap-flagged (OP-002 — Tavus credentials; Tavus surface either real or hidden per HTC-NX-004) |
| WF-CMS-005 | Comms substrate enforces rate-cap + allowlist on every outbound dispatch — denied attempts return a verdict and don't reach the adapter. | green (HTC-CM-004, HTC-CM-005) |
| WF-CMS-006 | Comms substrate runs the campaign worker tick: picks scheduled campaigns whose `send_at` is past, dispatches one Message per Contact, advances campaign status, idempotent re-tick. | green |

## 11. Federation substrate (FED) — workflows

Lives in: `mcp-federation` skill + `docs/federation-mcp-design.md`.

| id | one-sentence workflow | gap status |
|---|---|---|
| WF-FED-001 | A runtime agent in profile A calls `federated_search` for data in profile B; the federation skill checks B's `federation.read_scopes` for an entry naming A, allows or denies. | green (Tranche F.9 pen-test) |
| WF-FED-002 | An operator dashboard query joins data from two child profiles via federation — both profiles must declare a scope authorizing the operator's caller identity. | green (Tranche F.9) |
| WF-FED-003 | A federated query against MindsDB returns "MindsDB not configured" until OP-003 (sidecar deployment + MINDSDB_URL env) is closed. | gap-flagged (OP-003) |

## 12. Rollup substrate (RLP) — workflows

Lives in: `mcp_rollup_query` MCP tool + `huminic/governance/rollup-scope-grants.md` (future).

| id | one-sentence workflow | gap status |
|---|---|---|
| WF-RLP-001 | Huminic-the-company operator queries `mcp_rollup_query` with parent scope claim against child profiles; tool returns aggregated rows + audit. | green (HTC-SR-007) |
| WF-RLP-002 | A rollup query is denied because the caller's token lacks the `rollup:<parent>` scope; verdict returned with the missing scope name; operator authorizes via MCP token registry. | green (HTC-SR-007 negative case) |
| WF-RLP-003 | Operator views aggregated child-profile metrics in a rollup dashboard. | gap-flagged (SRS-E disposition: dashboard UI deferred; operator queries via MCP token only) |

## 13. Cross-actor patterns (XAC) — workflows

Lives in: each of the 5 manuals (cross-references) + a dedicated section at the end of `studio-admin-guide.md` titled "Cross-actor patterns".

| id | one-sentence workflow | gap status |
|---|---|---|
| WF-XAC-001 | Consultative authors a prescription → consulting human operator approves → operator dispatches Provisioner (today: runs script) → Provisioner stands up customer profile → customer-admin invite emails out → customer-admin logs in. | gap-flagged (`GAP-PROV-001` + `GAP-CUSTOMER-INVITE-001`) |
| WF-XAC-002 | Customer-admin edits a draft → KSG enforces gates → customer-admin requests promotion → operator approves promotion via Files screen Promote button → KSG records audit + canon updates. | gap-flagged (confirm Files screen Promote button is wired; if not, `GAP-MANUAL-promote-001`) |
| WF-XAC-003 | Runtime agent (Caroline) drafts an outbound SMS reply → DSG records intent in Brain → Comms substrate enforces rate-cap + allowlist → adapter dispatches → status callback → audit row. | green (HTC-CM-002) |
| WF-XAC-004 | Inbound ADF email → Comms substrate parses with ADF parser → normalizes contact + lead_meta → persists Sales thread → assigned runtime agent (lead-response) picks up + drafts reply → outbound dispatched. | green (AC.6.7/6.8) |
| WF-XAC-005 | KSG identifies a canon conflict during a runtime write → DSG records reconciliation candidate → operator notified → operator approves resolution → canon updated → all watchers re-read. | green at code level; UI surfacing in `/engagements/<customer>` panel |
| WF-XAC-006 | Customer-admin logs in concurrently with operator on the same wiki page → KSG enforces write-ordering by last-write-wins with audit; one writer's change is reflected, the other gets a conflict prompt. | gap-flagged (`GAP-FLOW-concurrent-edit-001` — confirm conflict-prompt UI exists during customer-admin-guide.md write) |

## 14. Failure & recovery (F&R) — workflows

Lives in: a section in each of the 5 manuals + SOUL "recovery branches" in each agent SOUL.

| id | one-sentence workflow | gap status |
|---|---|---|
| WF-F&R-001 | Channel adapter unreachable (Vapi 5xx) → comms substrate retries per policy → fails after N attempts → marks message `failed` → operator alerted via audit watch → customer-admin sees status in thread. | gap-flagged (`GAP-FLOW-retry-policy-001` — confirm retry policy is configured per-adapter during manual write) |
| WF-F&R-002 | KSG blocks a customer-admin write → verdict text shown in storefront Knowledge tab → customer-admin reads the verdict + adjusts the page + retries → or escalates to operator. | green |
| WF-F&R-003 | Consultative engagement abandoned mid-`design` → engagement-state.yaml frozen → operator can re-dispatch or operator can mark `abandoned` (stage not in the current 7-stage schema — `GAP-ENG-STATE-ABANDON-001`). | gap-flagged (no `abandoned` stage in schema; engagement-state.yaml currently has no terminal-fail state) |
| WF-F&R-004 | Provisioner partial provision (profile dir created, mcp.json written, but credential not provisioned) → audit shows last successful step → operator runs idempotent re-run of remaining steps. | gap-flagged (Provisioner not built; today partial-recovery is the script's idempotency in `scripts/provision-launch-profiles.ts`) |
| WF-F&R-005 | Password reset token expires → redeem at `/reset` shows expired-token verdict → customer-admin re-requests via `/api/auth/reset-request` (rate-limited 3/min/IP). | green (CZ-004/005 live-verified) |
| WF-F&R-006 | Coolify redeploy of `hermes-studio` fails mid-deploy → previous build remains live → operator inspects Coolify logs + redeploys or rolls back. | green (Coolify standard behavior) |
| WF-F&R-007 | DSG reconciliation candidate sits unapproved beyond N days → DSG flags as stale → operator notified via `/engagements/<customer>` panel. | gap-flagged (`GAP-FLOW-stale-reconciliation-001` — confirm timeout policy + UI surface during manual write) |

---

## Coverage check (workflow count)

Total workflow rows: 65 across 14 actors. Each row is one sentence; long-form prose lives in the manuals + SOULs being authored next.

| Actor | Workflow count |
|---|---|
| Operator | 7 |
| Consulting human operator | 5 |
| Customer-admin | 8 |
| Consultative agent | 5 |
| Performance engagement consultative | 3 |
| Provisioner | 5 |
| KSG | 5 |
| DSG | 5 |
| Runtime agents (category) | 5 |
| Comms substrate | 6 |
| Federation substrate | 3 |
| Rollup substrate | 3 |
| Cross-actor patterns | 6 |
| Failure & recovery | 7 |

Per-actor counts hit the 3–5 target for narrow actors and exceed it for the operator + customer-admin (which span more surfaces). The /goal is "three to five end-to-end workflows per actor"; the 7-row operator and 8-row customer-admin lists are kept as one sentence each per row, not expanded into prose — they could be folded but each one points to a distinct user surface the operator enumerated.

## Gaps surfaced during WORKFLOWS.md drafting

Newly flagged (to be added to PLAN.md running log):

- `GAP-MANUAL-promote-001` — confirm Files screen has a Promote button (vs CLI-only) during studio-admin-guide.md write. WF-OP-002.
- `GAP-FLOW-engagement-seed-001` — confirm Studio UI button to seed engagement-state.yaml at `draft`. WF-CHO-001.
- `GAP-FLOW-concurrent-edit-001` — confirm conflict-prompt UI for concurrent wiki edits. WF-XAC-006.
- `GAP-FLOW-retry-policy-001` — confirm per-adapter retry policy configured. WF-F&R-001.
- `GAP-FLOW-stale-reconciliation-001` — confirm DSG timeout policy + UI surface for stale reconciliation. WF-F&R-007.
- `GAP-ENG-STATE-ABANDON-001` — engagement-state.yaml has no terminal-fail / `abandoned` stage. WF-F&R-003.

The "(confirm during manual write)" rows resolve during the next-step manual authoring. If confirmed live → flip to green. If confirmed missing → row stays gap-flagged and the manual writes around the gap per the gap-during-writing protocol in PLAN.md.

Logging these 6 new GAP rows to PLAN.md next.
