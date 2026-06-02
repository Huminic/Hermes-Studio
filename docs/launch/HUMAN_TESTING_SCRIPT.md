# HUMAN TESTING SCRIPT — Huminic Studio launch validation

**Date:** 2026-06-01
**Intended evaluator:** Duane Wells or designated QA partner
**Format:** Per Section 7A of the closeout prompt. Sections 1–9. Each test case has 12 fields (title, objective, persona, preconditions, usability explanation, technical explanation, execution steps, expected result, negative test, evidence to collect, pass/fail, notes).
**Coverage matrix:** at the bottom — every `AC-*` in `ACCEPTANCE_CRITERIA.md` traces to ≥1 `HTC-*` case here.

**Test case id format:** `HTC-<section>-<seq>` where section is one of `PSE` (Plugins/Skills/Extensions), `CA` (Consultative Agents), `SG` (Semantic Guardians), `NX` (Nexxus Adaptation), `SC` (Studio Core), `CM` (Communications), `SR` (Security/Roles/Audit/Rollup), `PR` (Portal/Reset/Provisioning), `LC` (Launch Confidence).

**How to record results:** as you work, append the fields under "evidence to collect" + "pass/fail" + "notes" to each case. At the end commit this file with results. The autonomous suite produces machine evidence; this script is for human eyes and edge-case judgment.

---

## Section 1 — Plugins / Extensions / Skills

### HTC-PSE-001 — Plugin loader surfaces all installed plugins

- **Objective:** verify `GET /api/plugins` returns every plugin installed under `~/.hermes/studio-plugins/` with no issues.
- **Persona:** Studio admin (Duane)
- **Preconditions:** logged in as `duane / HuminicValidation2026!`; production deploy current.
- **Usability explanation:** the plugin loader is the foundation for the storefront. If it lies about which plugins are installed, every plugin-driven feature is suspect.
- **Technical explanation:** `src/lib/plugin-loader.ts` reads from `~/.hermes/studio-plugins/<plugin-id>/plugin.yaml`. `GET /api/plugins` calls `getLoadedPlugins()` and returns `{plugins: [...], issues}`. Auth-required.
- **Steps:**
  1. Navigate to `https://studio.huminic.app`.
  2. Open browser dev tools → Network tab.
  3. Hit `/api/plugins` with the active session cookie (or `curl --cookie ...`).
  4. Read the JSON.
- **Expected result:** at least `customer-console`, `messaging-hub`, `data-canvas` (if D.3 chose Metabase) listed. `issues` array empty.
- **Negative test:** create a malformed `plugin.yaml` in a sandbox plugin dir (with operator OK only), hit `/api/plugins`, verify `issues` array now contains an entry naming the bad plugin and the cause.
- **Evidence to collect:** JSON response body (paste into `EVIDENCE_INDEX.md#htc-pse-001`).
- **Pass/fail:**
- **Notes:**

### HTC-PSE-002 — Skill catalog reflects only real implementations

- **Objective:** confirm every skill listed in `/skills` (or equivalent surface) corresponds to a real TypeScript implementation. No naked scaffolds.
- **Persona:** Studio admin.
- **Preconditions:** P-SRS-D2-A and P-SRS-D2-B from the plan are complete (skill audit + real vs removed decision).
- **Usability explanation:** a customer who sees a skill listed expects it to do something. A scaffold-only listing is a false promise.
- **Technical explanation:** skills live under `docs/consulting_package/Hermes_Cursor_Implementation_Package/scaffold/skills/` and are surfaced via plugin registry + skill registry.
- **Steps:**
  1. Open `/skills` in the admin Studio.
  2. For each skill listed, click into it; record id, description, implementation path.
  3. Open the implementation path and confirm there is a TypeScript module beyond SKILL.md.
- **Expected result:** every skill has a real implementation OR is not surfaced in `/skills`.
- **Negative test:** if a skill is found that has only SKILL.md, mark FAIL.
- **Evidence to collect:** list of skill ids + their impl paths.
- **Pass/fail:**
- **Notes:**

### HTC-PSE-003 — Plugin install on a fresh host (smoke)

- **Objective:** confirm `docs/plugin-install.md` works against a fresh container snapshot.
- **Persona:** operator / SRE
- **Preconditions:** ability to spin up a sandbox Coolify app or a local Hermes + Studio (any reproducible target).
- **Usability explanation:** portability is the platform promise. If install doesn't work fresh, customer onboarding is broken.
- **Technical explanation:** install steps from `docs/plugin-install.md` (7-step procedure) should land plugins + skills under the right Hermes paths.
- **Steps:**
  1. Spin up a fresh Hermes + Studio target.
  2. Follow `docs/plugin-install.md` end-to-end.
  3. After install, hit `/api/plugins` on the new target.
- **Expected result:** plugins listed identically to production. No errors.
- **Negative test:** mid-install, omit one step and verify the doc surfaces the error clearly.
- **Evidence to collect:** install log + `/api/plugins` response.
- **Pass/fail:**
- **Notes:**

---

## Section 2 — Consultative Agents

### HTC-CA-001 — Engagement runs end-to-end against a fictitious customer

- **Objective:** verify the consultative agent runs a complete six-phase engagement (orient → audit → design → author → validate → package) against a brand-new fictitious customer profile via the production dispatch path (not a CLI-only script).
- **Persona:** Studio admin operating Studio chat against the `consultative-agent` profile.
- **Preconditions:** test-customer profile freshly provisioned with empty wiki + engagement-state at `draft`.
- **Usability explanation:** the consultative agent is the engine for new-customer onboarding. If it can't run cleanly against a clean profile, the business cannot scale.
- **Technical explanation:** dispatch via Studio's chat to the `consultative-agent` profile with goal text. The agent reads `~/.hermes/profiles/test-customer/engagement-state.yaml`, advances it at each phase, writes prescription artifacts under `knowledge/`, seeds Brain records via DSG.
- **Steps:**
  1. Provision fictitious customer profile (script TBD or per `customer-provisioning.md`).
  2. From Studio chat, select `consultative-agent` profile.
  3. Send: "Orient, audit, design, author, validate, and package <Fictitious Customer Name> per your method."
  4. Watch the chat. Each phase should produce visible output + (you can monitor) write to engagement-state.yaml.
  5. After the run, read the engagement-state.yaml; confirm stages advanced.
  6. Read the customer profile's `knowledge/published/` (or drafts/ if pending operator approval) and confirm artifacts created.
- **Expected result:** six phases visibly executed; engagement-state.yaml updated; prescription package emitted (manifest + 6 wiki invariants seeded).
- **Negative test:** delete `~/.hermes/profiles/test-customer/engagement-state.yaml` and re-dispatch; agent should refuse to advance and surface the missing file as a lookup_miss/assumption.
- **Evidence to collect:** chat transcript + before/after engagement-state.yaml + list of created artifacts.
- **Pass/fail:**
- **Notes:**

### HTC-CA-002 — Wiki output conforms to six-invariant spec

- **Objective:** verify every artifact produced by HTC-CA-001 has required frontmatter + the six wiki invariants present.
- **Persona:** Studio admin or KSG-aware reviewer.
- **Preconditions:** HTC-CA-001 PASS.
- **Usability explanation:** wiki invariants are the contract that lets agents work safely. Missing invariants = agents flying blind.
- **Technical explanation:** the six invariants are Scope Contract, Confidence Schema, Human Relay Spec, Integration Playbooks, House Canon Reference, Always-on Metadata Substrate.
- **Steps:**
  1. List artifacts under `~/.hermes/profiles/test-customer/knowledge/published/`.
  2. For each: read frontmatter; confirm it has `type:`, `confidence:`, `scope_contract:`, and `last_updated:` at minimum.
  3. Verify the six invariant pages exist (or are referenced).
- **Expected result:** every artifact has required frontmatter; six invariants present.
- **Negative test:** introduce a malformed frontmatter manually; the consultative agent should refuse to publish or KSG should reject.
- **Evidence to collect:** list of artifact paths + frontmatter dumps.
- **Pass/fail:**
- **Notes:**

### HTC-CA-003 — Assumption surfacing happens ≥3 times

- **Objective:** during HTC-CA-001, the consultative agent must record ≥3 lookup_misses or assumptions that surface to the operator.
- **Persona:** Studio admin.
- **Preconditions:** HTC-CA-001 in progress or complete.
- **Usability explanation:** when the agent doesn't know, the operator has to decide. Surfacing those moments is what makes the system trustworthy.
- **Technical explanation:** lookup_misses + assumptions land in `~/.hermes/profiles/test-customer/brain/brain.db` tables. Studio's `/engagements/$customer` page or a Brain query exposes them.
- **Steps:**
  1. Open `/engagements/test-customer` after HTC-CA-001.
  2. Confirm the page lists ≥3 open assumptions or 3 lookup_misses.
  3. As operator, resolve one assumption (provide a value); verify the agent picks it up in a subsequent run.
- **Expected result:** ≥3 assumptions visible; one is resolvable end-to-end.
- **Negative test:** try to bypass the assumption (submit empty); the UI should refuse.
- **Evidence to collect:** screenshot of `/engagements/test-customer` showing the assumption list.
- **Pass/fail:**
- **Notes:**

### HTC-CA-004 — Engagement state writeback at phase transitions

- **Objective:** verify that each phase transition in HTC-CA-001 wrote to engagement-state.yaml in real time.
- **Persona:** Studio admin or developer.
- **Preconditions:** HTC-CA-001 in progress.
- **Usability explanation:** if the UI shows stale state after a run, the operator cannot trust it.
- **Technical explanation:** `writeEngagementState(profile, state)` is added to consultative-engine in P-SRS-C1 and called at each phase transition.
- **Steps:**
  1. Before the run, `cat ~/.hermes/profiles/test-customer/engagement-state.yaml` and note current_stage.
  2. Begin HTC-CA-001 run.
  3. After each phase output appears in chat, re-cat the YAML.
  4. Verify current_stage advances at each phase.
- **Expected result:** YAML's current_stage advances orient → audit → design → author → validate → package.
- **Negative test:** kill the consultative-agent process mid-phase; verify the YAML reflects the last successfully-completed phase, not the in-flight one.
- **Evidence to collect:** sequence of cat outputs.
- **Pass/fail:**
- **Notes:**

### HTC-CA-005 — Live huminic engagement round-trip

- **Objective:** real human (Duane) advances ≥1 phase + signs ≥1 readiness gate on the huminic profile.
- **Persona:** real Duane.
- **Preconditions:** huminic profile has `consult: true` flag; consultative agent dispatchable; huminic engagement-state.yaml at a non-terminal stage.
- **Usability explanation:** Cedar Ridge is a fixture; this is the real test against a profile the operator owns.
- **Technical explanation:** Tools tab → Consult sub-page on `/p/huminic`.
- **Steps:**
  1. Log into `/p/huminic` as `duane`.
  2. Open Tools tab → Consult.
  3. Read the current stage; engage in dialogue advancing one phase.
  4. Approve one readiness gate.
- **Expected result:** stage advances; gate signed; both persisted in engagement-state.yaml; both visible in `/engagements/huminic`.
- **Negative test:** click Approve as customer-admin role from another profile; should be denied.
- **Evidence to collect:** screenshot before/after; engagement-state.yaml diff.
- **Pass/fail:**
- **Notes:**

---

## Section 3 — Semantic Guardians

### HTC-SG-001 — KSG blocks protected-tree write

- **Objective:** verify KSG denies a wiki write into `canon/` or `governance/`.
- **Persona:** Studio admin (or any role with KSG-mediated write surface).
- **Preconditions:** any launch-scope profile with KSG active.
- **Usability explanation:** canon and governance are firm-level invariants. Silent overwrite breaks the trust model.
- **Technical explanation:** `src/server/ksg-gate.ts` enforces protected-tree rule; writes outside KSG-approved paths return 4xx + audit row.
- **Steps:**
  1. From Studio admin, attempt to save a new file under `~/.hermes/profiles/huminic/governance/test.md` via the wiki editor.
  2. Watch the request.
- **Expected result:** request rejected with rule id `protected-tree`; audit row in `~/.hermes/mcp-audit.log` with `outcome=denied`.
- **Negative test:** attempt the same via direct API call bypassing the UI; should still be denied.
- **Evidence to collect:** request response + audit row.
- **Pass/fail:**
- **Notes:**

### HTC-SG-002 — DSG blocks cross-tenant Brain write

- **Objective:** verify DSG denies a Brain write whose payload references another profile's tenant id.
- **Persona:** Studio admin with admin scope.
- **Preconditions:** two launch-scope profiles available.
- **Usability explanation:** isolation is the platform's foundational promise.
- **Technical explanation:** `src/server/dsg-gate.ts` enforces `tenant-mismatch` rule on writes.
- **Steps:**
  1. From the admin Studio, attempt to insert a Brain event into profile A's brain with `tenant_id: profile-B`.
- **Expected result:** rejected with rule id `tenant-mismatch`; audit row written.
- **Negative test:** correct the tenant id and re-attempt; should succeed.
- **Evidence to collect:** request response + audit row.
- **Pass/fail:**
- **Notes:**

### HTC-SG-003 — Lookup_miss surfaces an assumption

- **Objective:** trigger a lookup_miss during an agent run and verify it surfaces as an assumption to the operator.
- **Persona:** Studio admin observing an agent run.
- **Preconditions:** consultative-agent or any agent that uses `recordLookupMiss`.
- **Usability explanation:** the operator must be able to see what the agent didn't know.
- **Technical explanation:** `src/server/lookup-miss.ts` records misses; surfaced via `/api/brain/assumptions`.
- **Steps:**
  1. Dispatch an agent run with a goal that requires unavailable data.
  2. Confirm a lookup_miss is recorded.
  3. Open `/engagements/<profile>` and confirm the assumption appears.
- **Expected result:** lookup_miss row + assumption row + operator-visible state.
- **Negative test:** none required; this is positive evidence.
- **Evidence to collect:** row ids + screenshot.
- **Pass/fail:**
- **Notes:**

### HTC-SG-004 — Reconciliation flow on canon conflict

- **Objective:** verify that a write that contradicts canonical wiki opens a reconciliation_item.
- **Persona:** Studio admin.
- **Preconditions:** any launch-scope profile.
- **Usability explanation:** contradictions can't be silently overwritten; they have to surface for review.
- **Technical explanation:** `src/server/reconciliation.ts` opens reconciliation_items; KSG escalates the conflicting write.
- **Steps:**
  1. Read a canonical page from `~/.hermes/profiles/huminic/canon/`.
  2. Attempt to write a version that contradicts it from a drafts/ path.
  3. Observe KSG behavior.
- **Expected result:** write either rejected or routed to reconciliation; reconciliation_item appears in `/engagements/huminic` (or equivalent surface).
- **Negative test:** resolve the reconciliation with `wiki_corrected`; verify canon updated only after resolution.
- **Evidence to collect:** reconciliation_item id + UI screenshot.
- **Pass/fail:**
- **Notes:**

### HTC-SG-005 — Metadata substrate audit row for every gated action

- **Objective:** verify every KSG/DSG action produces an `metadata_audit` row with actor/action/target/before-version/after-version/timestamp/reason/gate-event.
- **Persona:** developer or Studio admin with audit access.
- **Preconditions:** any KSG/DSG action performed in this session.
- **Usability explanation:** without the audit row, drift observability + governance audit don't work.
- **Technical explanation:** `src/server/metadata-substrate.ts` records audits; queryable via `/api/brain/audit` or directly from brain.db.
- **Steps:**
  1. Perform a KSG-gated write (e.g. promote a draft to published).
  2. Query the metadata_audit table for the most recent rows.
- **Expected result:** row(s) with all required fields populated.
- **Negative test:** confirm a denied write also leaves an audit row with `outcome=denied`.
- **Evidence to collect:** row dump.
- **Pass/fail:**
- **Notes:**

### HTC-SG-006 — Hermes self-improvement watcher activity

- **Objective:** verify that a SOUL change triggers a hunch.
- **Persona:** developer.
- **Preconditions:** Hermes self-improvement watcher cron active.
- **Usability explanation:** self-improvement is the future-facing capability; if the watcher is dead, we lose the loop.
- **Technical explanation:** `src/server/hermes-self-improvement-watcher.ts` polls and opens hunches.
- **Steps:**
  1. Make a non-trivial change to a test profile's SOUL.md.
  2. Wait for the watcher cycle.
  3. Query the hunches table.
- **Expected result:** new hunch row with the SOUL change referenced.
- **Negative test:** revert the change; verify no spurious hunches.
- **Evidence to collect:** hunch id + dump.
- **Pass/fail:**
- **Notes:**

---

## Section 4 — Nexxus Adaptation

### HTC-NX-001 — Canonical dealer universe resolved

- **Objective:** confirm the launch-scope dealer list is unambiguous and matches the production volume.
- **Persona:** operator.
- **Preconditions:** P-ENV-003 complete.
- **Usability explanation:** the prior 5-vs-6-vs-7 ambiguity caused the launch-readiness mismatch. This test prevents recurrence.
- **Technical explanation:** the source of truth is the dealer list in `EVIDENCE_INDEX.md#dealer-universe`.
- **Steps:**
  1. Open `EVIDENCE_INDEX.md#dealer-universe`.
  2. For each listed dealer, `ls ~/.hermes/profiles/<slug>/` in the production container; confirm profile dir exists.
  3. For each, confirm `auth.yaml` + `studio.yaml` exist.
- **Expected result:** every listed dealer has a real profile.
- **Negative test:** a slug listed but not present is a FAIL.
- **Evidence to collect:** ls outputs.
- **Pass/fail:**
- **Notes:**

### HTC-NX-002 — Storefront login works per dealer

- **Objective:** verify every launch-scope dealer's `https://studio.huminic.app/p/<slug>` login completes successfully.
- **Persona:** anyone with the launch-time credentials.
- **Preconditions:** HTC-NX-001 PASS; CZ-002 done.
- **Usability explanation:** if a dealer can't log in, they can't be onboarded.
- **Technical explanation:** per-profile auth.yaml + portal route gating.
- **Steps:**
  1. For each dealer slug, open `https://studio.huminic.app/p/<slug>` in an incognito window.
  2. Log in with the dealer's launch credentials.
  3. Verify the 6-tab nav loads with the profile's brand.
- **Expected result:** login succeeds; brand is correct; no broken tab.
- **Negative test:** wrong password → 401 with audit row; right password from another browser session → no cross-leak.
- **Evidence to collect:** screenshot per dealer (after login showing the tab nav).
- **Pass/fail:**
- **Notes:**

### HTC-NX-003 — Huminic Motors Elliott → ADF round-trip

- **Objective:** verify Elliott (Vapi) calling Huminic Motors webhook produces ADF email at `neoweaver@gmail.com`.
- **Persona:** operator + customer (Duane simulating both).
- **Preconditions:** CZ-003 + CZ-008 closed; Vapi assistant configured with end-of-call webhook URL `https://studio.huminic.app/api/webhooks/vapi/huminic-motors`.
- **Usability explanation:** this is the canary for the entire Vapi → CRM flow.
- **Technical explanation:** Vapi POSTs the call transcript to the webhook; webhook parses transcript → ADF XML → email via `comms_send_email`.
- **Steps:**
  1. Dial Elliott or trigger via the Vapi dashboard.
  2. Speak a lead-shaped transcript ("Hi I'm John Smith looking for a 2026 Camry, my number is 412-555-0100").
  3. End the call.
  4. Watch for the webhook POST in production logs.
  5. Check `neoweaver@gmail.com` inbox.
- **Expected result:** ADF email received containing the lead, vehicle, contact; webhook 200 in logs.
- **Negative test:** send a malformed Vapi payload to the webhook; should 4xx without leaking content.
- **Evidence to collect:** webhook 200 log line + email screenshot.
- **Pass/fail:**
- **Notes:**

### HTC-NX-004 — Tavus surface is either real or hidden

- **Objective:** confirm there is no half-advertised Tavus integration.
- **Persona:** customer-admin browsing the storefront.
- **Preconditions:** P-SUR-G-004 complete.
- **Usability explanation:** anything visible must work; anything not working must not be visible.
- **Technical explanation:** Tavus surfaces could be in the widget mode dropdown, the channel adapter list, or a settings panel.
- **Steps:**
  1. Browse every storefront surface looking for the word "Tavus" or "video".
  2. If found, attempt to use it.
- **Expected result:** either Tavus is fully functional (per AC-CM-002) or absent from all customer-visible surfaces.
- **Negative test:** click any Tavus control and observe; broken UX is a FAIL.
- **Evidence to collect:** screenshots either of working Tavus or of its absence per surface.
- **Pass/fail:**
- **Notes:**

### HTC-NX-005 — VinSolutions reference path

- **Objective:** confirm no VinSolutions stub exposed to customers if real integration is deferred.
- **Persona:** customer-admin.
- **Preconditions:** P-SUR-G-006 complete.
- **Steps:** identical to HTC-NX-004 but for "VinSolutions" / "CRM".
- **Expected result:** real OR absent.
- **Pass/fail:**
- **Notes:**

---

## Section 5 — Studio Core and Screen Clusters

(One case per screen cluster; minor sub-screens grouped.)

### HTC-SC-001 — Operations / Dashboard loads + interactive

- **Objective:** root operations dashboard renders for admin and responds to filters/refresh.
- **Persona:** Studio admin.
- **Preconditions:** admin login.
- **Usability explanation:** first screen the admin sees; if broken, confidence is gone.
- **Technical explanation:** `/` route; widget plugins may add tiles.
- **Steps:** load `/`; click every tile / button; refresh; verify state persists.
- **Expected result:** no 404; no console errors; tiles render data or empty-state with explanation.
- **Negative test:** disconnect from Hermes (kill HERMES_API_URL); dashboard should show error UI not white screen.
- **Evidence to collect:** screenshot.
- **Pass/fail:**
- **Notes:**

### HTC-SC-002 — Agent Library CRUD

- **Objective:** create / edit / delete a custom agent definition.
- **Persona:** Studio admin.
- **Preconditions:** admin login.
- **Steps:**
  1. `/agents` → New Agent.
  2. Fill SOUL fragment + scope contract path; save.
  3. Edit the agent; save.
  4. Delete the agent; confirm gone.
- **Expected result:** all four actions succeed with appropriate UI confirmation + audit rows.
- **Negative test:** try saving with no name / invalid SOUL → form validation error, no orphan row.
- **Evidence to collect:** screenshots of each step + audit row dump.
- **Pass/fail:**
- **Notes:**

### HTC-SC-003 — Profiles screen

- **Objective:** browse profiles + switch active profile.
- **Persona:** Studio admin.
- **Steps:** open `/profiles`; verify all 15+ profiles listed; switch active profile; verify the change persists across navigation.
- **Expected result:** every profile renders; switch works; per-profile state changes accordingly.
- **Negative test:** as customer-admin, attempt to switch; should be denied.
- **Pass/fail:**
- **Notes:**

### HTC-SC-004 — Wiki / Files editor

- **Objective:** open `/files` for a profile; edit a markdown page; verify save + wikilink resolution.
- **Persona:** Studio admin or customer-admin per role.
- **Preconditions:** profile with wiki tree.
- **Steps:**
  1. Open `/files`; navigate to a known page.
  2. Edit it; save; reload; verify content.
  3. Click a wikilink; confirm it resolves correctly (including nested paths).
  4. For customer-admin: attempt to edit a canon/ page → should be blocked.
- **Expected result:** edit + save round-trip; wikilink resolution correct.
- **Negative test:** save a page with invalid frontmatter; the editor should refuse or surface the parse error.
- **Evidence to collect:** before/after content + audit row.
- **Pass/fail:**
- **Notes:**

### HTC-SC-005 — Engagements overview + detail

- **Objective:** open `/engagements`; click into one customer's detail page; verify stage progress + readiness gates + deployment notes + open assumptions all render.
- **Persona:** Studio admin.
- **Preconditions:** at least one engagement-state.yaml present.
- **Steps:** navigate; click; observe.
- **Expected result:** every section renders; clicking a deployment note opens the resolution panel.
- **Negative test:** delete engagement-state.yaml for a profile and reload; should show empty state, not crash.
- **Pass/fail:**
- **Notes:**

### HTC-SC-006 — Skills / Plugins admin

- **Objective:** browse `/skills`; verify the listed set matches `/api/plugins`.
- **Persona:** Studio admin.
- **Steps:** open `/skills`; cross-check with the JSON from HTC-PSE-001.
- **Expected result:** sets agree.
- **Pass/fail:**
- **Notes:**

### HTC-SC-007 — MCP tokens admin

- **Objective:** create a token with a specific scope, test it, then revoke it.
- **Persona:** Studio admin.
- **Preconditions:** admin login.
- **Steps:**
  1. `/settings/mcp-tokens` → New Token.
  2. Pick scope (e.g. `wiki_read`); save; copy token.
  3. Use it via curl: `curl -H "Authorization: Bearer <token>" https://studio.huminic.app/api/mcp/$profile` listing tools.
  4. Revoke; retry the curl.
- **Expected result:** call 1 succeeds (within scope); call 2 returns 401.
- **Negative test:** create a token with no scope; tools/list should return empty.
- **Pass/fail:**
- **Notes:**

### HTC-SC-008 — Tasks / Kanban

- **Objective:** view + advance a kanban card.
- **Persona:** Studio admin or customer-admin per role.
- **Steps:** open `/tasks`; advance a card; refresh; confirm persistence.
- **Expected result:** card movement persists; audit row recorded.
- **Pass/fail:**
- **Notes:**

### HTC-SC-009 — Audit / logs / observability

- **Objective:** confirm `/audit` (or equivalent) shows recent KSG/DSG/MCP audit rows for this session.
- **Persona:** Studio admin.
- **Steps:** open `/audit`; filter by today's date; confirm rows from earlier HTC-SG-* cases appear.
- **Expected result:** rows present, filterable, exportable.
- **Pass/fail:**
- **Notes:**

### HTC-SC-010 — Files / uploads

- **Objective:** upload a small file; verify DSG classification + retrievability.
- **Persona:** Studio admin or customer-admin.
- **Steps:** upload `g-eval-test.md`; verify it's classified as `document`; verify it appears in the file list; download it back; verify integrity.
- **Expected result:** classification correct; download successful; checksum matches.
- **Negative test:** upload with a malicious filename (`../../../etc/passwd`); filename must be sanitized.
- **Pass/fail:**
- **Notes:**

### HTC-SC-011 — Storefront Chat tab

- **Objective:** customer-admin chats with the profile's primary agent end-to-end.
- **Persona:** customer-admin.
- **Steps:** log into `/p/<slug>/`; open Chat; pick an agent; send "What can you help me with?"; verify reply.
- **Expected result:** reply received within reasonable time; chat_records row created.
- **Negative test:** pick a disabled agent; should not appear in picker.
- **Pass/fail:**
- **Notes:**

### HTC-SC-012 — Storefront Knowledge tab

- **Objective:** customer-admin reads + edits a wiki page within KSG-allowed paths.
- **Persona:** customer-admin.
- **Steps:** open Knowledge; navigate; edit a page in `knowledge/drafts/`; save.
- **Expected result:** save succeeds; KSG audit row written.
- **Negative test:** attempt to edit a `canon/` page; should be blocked + audited.
- **Pass/fail:**
- **Notes:**

### HTC-SC-013 — Storefront Tools / Widget sub-page

- **Objective:** view widget list; copy embed code; live-preview a widget; edit one.
- **Persona:** customer-admin.
- **Steps:** Tools → Widget; preview; copy embed; edit (greeting); save; reload public `/w/<slug>` to verify.
- **Expected result:** changes reflected in public widget.
- **Pass/fail:**
- **Notes:**

### HTC-SC-014 — Storefront Data tab

- **Objective:** verify the Data tab shows real per-profile data (per the P-SRS-D3 decision).
- **Persona:** customer-admin.
- **Steps:** open Data tab; verify charts/tables render with non-stub data.
- **Expected result:** real data OR the tab is hidden if D.3 deferred.
- **Negative test:** isolation — login to a different profile; verify data is different.
- **Pass/fail:**
- **Notes:**

### HTC-SC-015 — Storefront Comms tab

- **Objective:** view Sales + Service threads; send a reply; verify SSE updates.
- **Persona:** customer-admin.
- **Steps:** open Comms; switch segment; pick a thread; send a reply (test channel); observe SSE update.
- **Expected result:** thread updates without page reload; reply lands.
- **Pass/fail:**
- **Notes:**

### HTC-SC-016 — Storefront Campaigns tab

- **Objective:** create + schedule a Service campaign; observe a delivery.
- **Persona:** customer-admin.
- **Steps:** Campaigns → New; pick template; build audience; schedule for now+1min; wait; verify delivery rows.
- **Expected result:** campaign transitions scheduled → in_progress → complete; deliveries land in Comms inbox.
- **Pass/fail:**
- **Notes:**

---

## Section 6 — Communications / Integrations

### HTC-CM-001 — Email send via MCP-mediated path

- **Objective:** verify `comms_send_email` called via `/api/mcp/<profile>` with a real customer token dispatches a real email + writes comms_log + DSG audit row.
- **Persona:** Studio admin or developer.
- **Preconditions:** real per-customer MCP token issued; HUMINIC profile recommended.
- **Usability explanation:** the SRS requires the MCP-mediated dispatch path. Bypasses are the path-of-least-resistance bug to catch.
- **Technical explanation:** curl POST to `/api/mcp/<profile>` with `tools/call` payload; `comms_send_email` handler routes via central-mcp + writes audit/comms_log.
- **Steps:**
  1. Curl with Bearer <profile-scoped MCP token>:
     ```
     POST /api/mcp/huminic
     {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"comms_send_email","arguments":{"to":"duanekwells@gmail.com","subject":"HTC-CM-001 evidence","html":"<p>MCP-mediated send proof</p>"}}}
     ```
  2. Confirm 200 with `email_id`.
  3. Query brain.comms_log: most recent row matches.
  4. Query brain.metadata_audit: matching DSG row.
  5. Check inbox.
- **Expected result:** all four artifacts present.
- **Negative test:** call without a token → 401; with wrong-scope token → DSG denial + audit row.
- **Evidence to collect:** email_id + comms_log row + audit row + screenshot of inbox.
- **Pass/fail:**
- **Notes:**

### HTC-CM-002 — SMS via MCP-mediated path

- **Objective:** same as HTC-CM-001 for `comms_send_sms`.
- **Steps:** as HTC-CM-001 with `comms_send_sms` + arguments `{to:"+14126546500", text:"HTC-CM-002 evidence"}`.
- **Expected result:** delivery id from SignalWire; comms_log row; audit row.
- **Pass/fail:**
- **Notes:**

### HTC-CM-003 — Voice initiate via MCP-mediated path

- **Objective:** same as HTC-CM-001 for `comms_initiate_call`.
- **Steps:** `comms_initiate_call` + `{to:"+14126546500", url:"http://demo.twilio.com/docs/voice.xml"}`.
- **Expected result:** call sid + comms_log + audit.
- **Pass/fail:**
- **Notes:**

### HTC-CM-004 — Rate-cap denial

- **Objective:** exceed per-minute cap; verify rate-limit denial + audit.
- **Steps:** loop 10x HTC-CM-001 within one minute; observe the cap fire.
- **Expected result:** ≥1 call denied with rate-limit reason; audit row.
- **Pass/fail:**
- **Notes:**

### HTC-CM-005 — Allowlist denial

- **Objective:** with `EMAIL_ALLOWED_USERS` set, send to a non-listed address; verify denial.
- **Steps:** set the env, restart, attempt send to `random@example.com`.
- **Expected result:** denied; audit row.
- **Pass/fail:**
- **Notes:**

### HTC-CM-006 — Inbound Vapi webhook → ADF email

- **Objective:** see HTC-NX-003 (live Vapi call).
- **Cross-reference:** HTC-NX-003.

---

## Section 7 — Security / Roles / Audit / Rollup

### HTC-SR-001 — Wrong-role access attempt

- **Objective:** customer-admin reaches `/profiles` or `/agents` → denied.
- **Steps:** logged in as `kim` (customer-admin on strukture), navigate to `/profiles`.
- **Expected result:** 403 or redirect to `/p/strukture`; audit row.
- **Pass/fail:**
- **Notes:**

### HTC-SR-002 — Wrong-tenant access attempt

- **Objective:** customer-admin on profile A reaches `/p/profile-B/*` → denied.
- **Steps:** `kim` on strukture, navigate to `/p/huminic/chat`.
- **Expected result:** 403 or branded login form (not the chat).
- **Pass/fail:**
- **Notes:**

### HTC-SR-003 — Token scope violation

- **Objective:** a token with `wiki_read` only cannot call `brain_write`.
- **Steps:** issue restricted token; attempt brain_write; observe denial.
- **Expected result:** 403 or DSG denial.
- **Pass/fail:**
- **Notes:**

### HTC-SR-004 — Route protection (anonymous to admin)

- **Objective:** anonymous user hits `/agents`; redirected to login.
- **Steps:** incognito browser, navigate to `/agents`.
- **Expected result:** login page.
- **Pass/fail:**
- **Notes:**

### HTC-SR-005 — Sensitive log review

- **Objective:** scan logs from the test run for accidental PII or secret leakage.
- **Steps:** `docker logs <studio-container> | grep -iE 'password|token|secret|<known-pii-fragment>'`; review hits.
- **Expected result:** no hits.
- **Pass/fail:**
- **Notes:**

### HTC-SR-006 — PII redaction for embeddings

- **Objective:** with a remote embedding model + `EMBED_PII_REDACTOR` enabled, send a payload containing SSN/CC/email; verify redacted before embedding.
- **Steps:** flip env; submit payload; inspect what the embedding worker sees.
- **Expected result:** redacted payload only.
- **Pass/fail:**
- **Notes:**

### HTC-SR-007 — Cross-customer rollup auth

- **Objective:** huminic (parent) reads authorized children via `mcp_rollup_query`; child without grant denied.
- **Steps:** call rollup tool with huminic token; verify child profiles in scope respond; verify ungranted child rejects.
- **Expected result:** grant respected.
- **Pass/fail:**
- **Notes:**

### HTC-SR-008 — Pen-test sweep (F.9)

- **Objective:** all 13 F.9 vectors blocked; no regressions from closeout work.
- **Steps:** run pen-test suite (vitest); confirm 13/13 blocked.
- **Expected result:** PASS on all vectors.
- **Pass/fail:**
- **Notes:**

---

## Section 8 — Portal / Reset / Provisioning / Cutover

### HTC-PR-001 — Storefront login per known profile

- **Objective:** every known launch-scope login succeeds.
- **Steps:** log into each of huminic, strukture, serra-honda, huminic-motors, plus each CZ-002 dealer.
- **Expected result:** each one renders the 6-tab nav with profile branding.
- **Pass/fail:**
- **Notes:**

### HTC-PR-002 — Portal hostname behavior

- **Objective:** if `portal.huminic.app` is in scope, it routes correctly; if removed, no half-advertised path remains.
- **Steps:** hit `https://portal.huminic.app/`; observe.
- **Expected result:** matches the P-CZ-006 disposition.
- **Pass/fail:**
- **Notes:**

### HTC-PR-003 — Password reset request endpoint

- **Objective:** `POST /api/auth/reset-request {email}` returns 200 for known + 200 for unknown (anti-enumeration), dispatches a Resend email to known addresses.
- **Steps:** curl twice (known + unknown); check inbox for known.
- **Expected result:** 200 both; email received only for known.
- **Pass/fail:**
- **Notes:**

### HTC-PR-004 — Password reset confirm + page

- **Objective:** clicking reset link lands on `/reset?token=<scrypt-hash>`; form submit confirms; user can log in with new password.
- **Steps:** click reset email; submit new password; log in.
- **Expected result:** new password works; old password fails; audit row.
- **Pass/fail:**
- **Notes:**

### HTC-PR-005 — Provisioning via scripts/create-user.ts

- **Objective:** new customer-admin can be provisioned in production.
- **Steps:** `docker exec -it hermes-studio-... npx tsx scripts/create-user.ts --profile <slug> --username <name> --customer-admin` (studio container; `/app/scripts` ships after the GAP-VER-007 redeploy; `npx tsx`, no global `pnpm`); verify auth.yaml written 0600; log in.
- **Expected result:** all three.
- **Pass/fail:**
- **Notes:**

### HTC-PR-006 — Cutover-ritual doc reflects current flow

- **Objective:** read `docs/cutover-ritual.md`; verify it matches actual production behavior.
- **Steps:** open doc; for each step, attempt to execute against staging or verify against state.
- **Expected result:** doc and reality agree.
- **Pass/fail:**
- **Notes:**

---

## Section 9 — Final launch confidence pass

### HTC-LC-001 — End-to-end golden path

- **Objective:** a single human walks a brand-new customer from onboarding to first comms in one sitting.
- **Persona:** operator + simulated customer.
- **Preconditions:** all P-CZ and P-SRS tasks done.
- **Steps:**
  1. Provision a new fictitious profile.
  2. Run consultative engagement.
  3. Operator approves a readiness gate.
  4. Login to `/p/<slug>` as the new customer-admin.
  5. Send a comms message (email or SMS).
  6. Receive the artifact.
  7. Verify Brain has chat_records + comms_log + audit rows.
- **Expected result:** all 7 steps complete without surprise; total time < 30 minutes.
- **Pass/fail:**
- **Notes:**

### HTC-LC-002 — Surface sweep

- **Objective:** walk every visible UI surface (admin + customer-admin per profile) and confirm no 404s, no console errors, no broken controls.
- **Persona:** human evaluator.
- **Steps:** systematic click-through.
- **Expected result:** clean.
- **Pass/fail:**
- **Notes:**

### HTC-LC-003 — Final acceptance criteria walkthrough

- **Objective:** read `ACCEPTANCE_CRITERIA.md` line by line and confirm each AC- has a GREEN cell in `EVIDENCE_INDEX.md`.
- **Persona:** evaluator.
- **Steps:** open both files side-by-side; check.
- **Expected result:** zero unresolved cells.
- **Pass/fail:**
- **Notes:**

---

## Coverage matrix (AC → HTC)

| AC id | Covered by HTC- |
|---|---|
| AC-G-001 | HTC-CA-001, HTC-CA-002, HTC-LC-003 |
| AC-G-002 | HTC-PSE-002, HTC-NX-004, HTC-NX-005, HTC-SC-014, HTC-LC-002 |
| AC-G-003 | HTC-LC-002 |
| AC-G-004 | HTC-SC-001..016 |
| AC-G-005 | HTC-LC-003 |
| AC-P-001 | HTC-NX-001 |
| AC-P-002 | HTC-NX-002 |
| AC-P-003 | HTC-PR-001 |
| AC-P-004 | HTC-SR-002 |
| AC-P-005 | HTC-NX-001 |
| AC-A-001 | HTC-PR-001 |
| AC-A-002 | HTC-PR-002 |
| AC-A-003 | HTC-PR-003 |
| AC-A-004 | HTC-PR-004 |
| AC-A-005 | HTC-PR-004 |
| AC-A-006 | HTC-PR-004 |
| AC-A-007 | HTC-PR-003 |
| AC-S-001 | HTC-SC-002, HTC-SC-007 |
| AC-S-002 | HTC-SC-011..016 |
| AC-S-003 | HTC-SC-002, HTC-SC-010 |
| AC-S-004 | HTC-SR-001 |
| AC-S-005 | HTC-SC-004 |
| AC-S-006 | HTC-SC-012, HTC-SG-001 |
| AC-S-007 | HTC-SC-010 |
| AC-S-008 | HTC-SC-007 |
| AC-S-009 | HTC-LC-002 |
| AC-CA-001 | HTC-CA-001 |
| AC-CA-002 | HTC-CA-002 |
| AC-CA-003 | HTC-CA-002 |
| AC-CA-004 | HTC-CA-004 |
| AC-CA-005 | HTC-CA-001 |
| AC-CA-006 | HTC-CA-003 |
| AC-CA-007 | HTC-CA-001 (capability_gap check) |
| AC-CA-008 | HTC-CA-005 |
| AC-SG-001 | HTC-SG-001, HTC-SG-002 |
| AC-SG-002 | HTC-SG-005 |
| AC-SG-003 | HTC-SG-003 |
| AC-SG-004 | HTC-SG-005 |
| AC-SG-005 | HTC-SG-005 |
| AC-SG-006 | HTC-SG-004 |
| AC-SG-007 | HTC-SG-001, HTC-SG-002 |
| AC-SG-008 | HTC-SC-009 |
| AC-SG-009 | HTC-SG-006 |
| AC-PS-001 | HTC-PSE-001, HTC-PSE-003 |
| AC-PS-002 | HTC-PSE-002 |
| AC-PS-003 | HTC-PSE-002 |
| AC-PS-004 | HTC-PSE-001 (issues array) |
| AC-PS-005 | HTC-LC-003 (D-decision check) |
| AC-DR-001 | HTC-SC-014 |
| AC-DR-002 | HTC-SR-007 |
| AC-DR-003 | HTC-LC-003 (D-disposition check) |
| AC-DR-004 | HTC-SC-010 |
| AC-DR-005 | HTC-LC-003 (verify local-hash-v1 working) |
| AC-DR-006 | HTC-SR-006 |
| AC-DR-007 | HTC-LC-003 (migration disposition) |
| AC-DR-008 | HTC-LC-003 (backup test) |
| AC-DR-009 | HTC-SC-011 |
| AC-CM-001 | HTC-NX-003 |
| AC-CM-002 | HTC-NX-004 |
| AC-CM-003 | HTC-NX-003, HTC-CM-002 |
| AC-CM-004 | HTC-CM-001, HTC-CM-002, HTC-CM-003 |
| AC-CM-005 | HTC-CM-001..003 |
| AC-CM-006 | HTC-CM-004 |
| AC-CM-007 | HTC-CM-004, HTC-CM-005 |
| AC-SC-001 | HTC-SR-001 |
| AC-SC-002 | HTC-SR-003 |
| AC-SC-003 | HTC-SG-001, HTC-SG-002 |
| AC-SC-004 | HTC-SC-009 |
| AC-SC-005 | HTC-SR-007 |
| AC-SC-006 | HTC-SR-002 |
| AC-SC-007 | HTC-SR-008 |
| AC-SC-008 | HTC-SR-008 |
| AC-SC-009 | HTC-SR-005 |
| AC-TE-001 | this file |
| AC-TE-002 | (covered by AUTONOMOUS_TESTING_PLAN.md) |
| AC-TE-003 | (test execution) |
| AC-TE-004 | (regression) |
| AC-TE-005 | (EVIDENCE_INDEX.md) |
| AC-TE-006 | (vitest run) |
| AC-TE-007 | (Playwright traces) |
| AC-TE-008 | HTC-SG-005 |
| AC-CP-001..006 | (verified in CHECKPOINT_PROOF.md) |
| AC-FC-001..005 | HTC-LC-003 |
