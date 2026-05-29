# Test Cases Log

Running log of testable behaviors discovered during the Nexxus → Huminic Studio migration. Populated as we build so the eval/test suite at decommission time is not a fresh discovery exercise.

**Owner:** platform-architect
**Started:** 2026-05-29
**Format per entry:** phase, behavior, test_type, location/status, notes.

**Test types:**
- `unit` — vitest, src/test/
- `integration` — multi-component or store-backed flow, vitest
- `playwright` — UI end-to-end, src/test/ or tests/
- `manual` — operator runs through and observes
- `eval` — LLM behavior eval (graded by a rubric, scored)
- `script` — shell or python script that exercises a flow

---

## Phase 0 — Plugin manifest

| # | Behavior | Type | Location / Status | Notes |
|---|----------|------|-------------------|-------|
| 0.1 | Plugin loader returns empty result when plugins root does not exist | unit | `src/test/plugin-loader.test.ts` PASSING | Phase 0 |
| 0.2 | Plugin loader parses a valid manifest | unit | `src/test/plugin-loader.test.ts` PASSING | |
| 0.3 | Plugin loader rejects manifest missing required field | unit | `src/test/plugin-loader.test.ts` PASSING | |
| 0.4 | Plugin loader rejects manifest whose id does not match directory | unit | `src/test/plugin-loader.test.ts` PASSING | Phase 0 |
| 0.5 | Plugin loader rejects plugins whose Studio version requirement is not satisfied | unit | `src/test/plugin-loader.test.ts` PASSING | |
| 0.6 | Plugin loader flags profile_scoped routes that omit $profile | unit | `src/test/plugin-loader.test.ts` PASSING | |
| 0.7 | Renderer registry validation: unknown renderer keys are rejected | unit | `src/test/plugin-loader.test.ts` PASSING | |
| 0.8 | `satisfiesRange` handles >=, >, <, =, bare-version cases | unit | `src/test/plugin-loader.test.ts` PASSING | |
| 0.9 | `PluginManifestSchema` enforces kebab-case ids | unit | `src/test/plugin-loader.test.ts` PASSING | |
| 0.10 | `validateProfileStudioConfig` reports missing required keys | unit | `src/test/plugin-loader.test.ts` PASSING | |
| 0.11 | `registerPlugins` wraps `loadPlugins` and logs issues to stderr | unit | `src/test/plugin-loader.test.ts` PASSING | |
| 0.12 | Hosted bundle path must start with `/<plugin-id>/` | unit | `src/test/plugin-loader.test.ts` PASSING | Added in plan revision for hosted JS |
| 0.13 | Hosted bundles parsed correctly in valid manifest | unit | `src/test/plugin-loader.test.ts` PASSING | |
| 0.14 | Bootstrap script is idempotent (custom files preserved across re-run) | script | `scripts/bootstrap_local_hermes_scaffold.sh` MANUAL-VERIFIED 2026-05-28 | tmp-HOME dry-run preserved a custom huminic SOUL.md |
| 0.15 | `pnpm build` produces a clean production bundle | manual | RUN ON DEMAND | Phase 0 acceptance |
| 0.16 | Plugin loader integrates with Studio bootstrap and registers plugins at server start | integration | PLANNED — Phase 5 | Wires `registerPlugins()` into `server-entry.js` |
| 0.17 | Hosted bundle is served at the declared path with correct CORS/Cache-Control headers | integration | PLANNED — Phase 5 | Needs Vite multi-build config + asset server handler |
| 0.18 | A third-party origin can fetch the embed.js and bootstrap the widget | playwright | PLANNED — Phase 5 | Cross-origin embedding test |

## Phase 1 (revised) — Profiles + plugin install

| # | Behavior | Type | Location / Status | Notes |
|---|----------|------|-------------------|-------|
| 1.1 | Bootstrap creates all 7 named profiles | script | PASSING (verified by directory listing) | huminic, serra-automotive, strukture + 3 governors + consultative-agent |
| 1.2 | Bootstrap does NOT overwrite live customer SOUL/config/persona/AGENTS | script | PASSING (hash-verified 2026-05-28) | Compare sha256 before/after — must match |
| 1.3 | Bootstrap installs customer-console plugin into ~/.hermes/studio-plugins/ | script | PASSING | |
| 1.4 | Validate script exits 0 against a freshly bootstrapped profile set | script | PASSING | `validate_local_hermes_scaffold.sh` |
| 1.5 | Bootstrap is safe to re-run (idempotent) | script | PASSING | Test 0.14 above |
| 1.6 | Consultative-agent profile contains the unpacked wiki (governance, method, prescription, strawman-library, etc.) | manual | PASSING | 70-entry zip extracted, flattened to profile root |
| 1.7 | Wiki-template seeded into each customer's profile non-clobberingly | script | PASSING | 11 new pages per customer |
| 1.8 | Profile rename: `serra` → `serra-automotive` consistent across all package docs | manual | PASSING | grep verified |
| 1.9 | Studio's `/profiles` screen lists all 7 profiles after bootstrap | playwright | PLANNED — Phase 3 | Needs Studio container restart to re-read profile list |
| 1.10 | Switching active profile to consultative-agent in Studio works | manual | PLANNED — operator manual | Phase 2 hand-off |

## Phase 2 (revised) — Consultative agent operational

| # | Behavior | Type | Location / Status | Notes |
|---|----------|------|-------------------|-------|
| 2.1 | Consultative SOUL references scope contract, human relay, approval matrix, method, prescription, deployment notes, engagement state | unit-grep | PASSING (grep verified) | Manual grep against profile file |
| 2.2 | Each *-data-governor SOUL declares both KSG and DSG roles with explicit watch paths | unit-grep | PASSING | grep "Knowledge Semantic Guardian" "Data Semantic Guardian" "Watch paths" in each |
| 2.3 | engagement-state.yaml exists in each customer profile at stage `draft` | unit | PASSING | wc -l + head verification |
| 2.4 | engagement-state.yaml is valid YAML and conforms to the schema | unit | PLANNED — Phase 3 | Build a `validate-engagement-state.ts` utility |
| 2.5 | crews-overview.md, build-time-crew.md, run-time-crew.md exist in consultative-agent/knowledge/method/ | manual | PASSING | ls verification |
| 2.6 | federation MCP design doc exists with all required sections | manual | PASSING | docs/federation-mcp-design.md |
| 2.7 | mcp-federation skill stub references the design doc and declares the tool contract | manual | PASSING | |
| 2.8 | Operator hand-off guide exists with all steps + recommended first prompt | manual | PASSING | Phase 2 hand-off |
| 2.9 | Consultative agent, when given the recommended prompt, reads its scope contract before doing anything else | eval | PLANNED — operator manual run, then automate | Critical method bug surface |
| 2.10 | Consultative agent pauses at every approval gate per the matrix | eval | PLANNED — operator manual run | Method discipline |
| 2.11 | Consultative agent populates `adjacent_data_neighbors` during audit | eval | PLANNED — operator manual run | "Next most likely data neighbors" |
| 2.12 | Consultative agent includes "Impact of Missing Details" in every prescription artifact | eval | PLANNED — operator manual run | Deployment notes mandate |
| 2.13 | Consultative agent updates engagement-state.yaml after each phase | eval | PLANNED — operator manual run | State tracking |
| 2.14 | Consultative agent does NOT silently rewrite canonical knowledge (only inbox/drafts) | eval | PLANNED — operator manual run | Scope contract enforcement |
| 2.15 | KSG validates wiki frontmatter on writes (when activated) | integration | PLANNED — Phase 4+ | Requires KSG to be in observer-then-enforcement mode |
| 2.16 | DSG validates structured-state writes (when Data Brain online) | integration | PLANNED — Phase 5+ | Pillar 2 dependency |

## System Services — Resend (cross-phase)

| # | Behavior | Type | Location / Status | Notes |
|---|----------|------|-------------------|-------|
| S.1 | sendNotification returns error when CENTRAL_MCP_STUDIO_TOKEN is unset | unit | `src/test/notifications.test.ts` PASSING | Studio-side helper guard |
| S.2 | sendNotification parses a successful Resend response and returns email_id | unit | `src/test/notifications.test.ts` PASSING | Happy path |
| S.3 | sendNotification surfaces MCP isError flag as a failure result | unit | `src/test/notifications.test.ts` PASSING | Rate-limit / API error path |
| S.4 | senderForCustomer formats customer-branded from-address | unit | `src/test/notifications.test.ts` PASSING | |
| S.5 | Each profile's mcp.json declares central-mcp with tool_allowlist | unit | PASSING — grep verified in production volume | All 7 profiles |
| S.6 | After operator provisions per-profile tokens, sending email through each profile produces a Resend email_id | manual | PLANNED — operator activation | Per profile scope test |
| S.7 | Studio password reset email is sent via sendNotification | integration | PLANNED — Phase 3 (auth flow port) | |
| S.8 | Customer runtime agent (lead-follow-up) sends via mcp.json central-mcp resend_send_email and logs to sent-email-log.jsonl | eval | PLANNED — Phase 4 | Customer agent uses MCP, not Studio helper |
| S.9 | Cross-profile rate limit prevents one profile from burning the platform Resend budget | integration | PLANNED — Phase 6 | central-mcp side rate limit |
| S.10 | Resend from address matches `notifications@huminic.ai` for system + customer-branded sends | manual | PLANNED — operator visual check on inbox | Domain verification |

## Authentication — Profile-synced auth (cross-phase)

| # | Behavior | Type | Location / Status | Notes |
|---|----------|------|-------------------|-------|
| A.1 | hashPassword produces scrypt-format hash with random salt | unit | `src/test/password-hash.test.ts` PASSING | |
| A.2 | hashPassword rejects empty password | unit | `src/test/password-hash.test.ts` PASSING | |
| A.3 | verifyPasswordHash accepts correct + rejects wrong/tampered hashes | unit | `src/test/password-hash.test.ts` PASSING | Includes garbage hash + tampered key bytes |
| A.4 | isHashString validates format strictly | unit | `src/test/password-hash.test.ts` PASSING | |
| A.5 | listProfileAuthEntries empty when no auth.yaml exists | unit | `src/test/profile-auth.test.ts` PASSING | |
| A.6 | listProfileAuthEntries discovers auth.yaml across profiles | unit | `src/test/profile-auth.test.ts` PASSING | |
| A.7 | listProfileAuthEntries skips malformed YAML/invalid schemas | unit | `src/test/profile-auth.test.ts` PASSING | Doesn't crash on bad files |
| A.8 | hasAnyProfileAuth reports true once at least one auth.yaml exists | unit | `src/test/profile-auth.test.ts` PASSING | Used to switch login UI into username+password mode |
| A.9 | loginWithProfileCredentials reports no_users / not_found / bad_password | unit | `src/test/profile-auth.test.ts` PASSING | Negative paths |
| A.10 | loginWithProfileCredentials returns matched identity (profile, username, is_admin) | unit | `src/test/profile-auth.test.ts` PASSING | Happy path |
| A.11 | Existing 26 auth-middleware tests still pass after metadata refactor | unit | `src/test/auth-middleware.test.ts` PASSING | Backward compat |
| A.12 | /api/auth accepts username+password and returns profile identity on success | integration | PLANNED — Playwright + auth.yaml fixture | Wire test with real fork running |
| A.13 | /api/auth still accepts legacy {password} when HERMES_PASSWORD is set and no profile auth | integration | PLANNED | Backward compat in production |
| A.14 | /api/auth-session returns {authenticated, profile_auth_mode, profile?, username?, is_admin?} | integration | PLANNED | UI uses this to render login form correctly |
| A.15 | /api/profiles/activate returns 403 when non-admin profile session attempts switch | integration | PLANNED | Admin gate |
| A.16 | scripts/create-user.ts writes auth.yaml with 0600 perms, scrypt hash | manual | PLANNED — operator runs once per user | CLI tool |

## Phase 3 — Wiki edit/browse UI

(populate as we build)

| # | Behavior | Type | Location / Status | Notes |
|---|----------|------|-------------------|-------|
| 3.1 | `/files` resolves wikilinks against active profile root for nested paths | manual-audit | PASSING — audited 2026-05-29 in `src/server/knowledge-browser.ts:275` (createWikilinkResolver tries full-path map first, falls back to basename map). Works for nested paths. | Edge case: two pages with same basename in different folders — only one resolves via basename fallback. Not blocking. |
| 3.2 | "Promote" button appears for files under knowledge/inbox/** or knowledge/drafts/** | playwright | DEFERRED — Phase 3 follow-up | Requires UI changes in files-screen.tsx (1398 lines) + new POST /api/files/promote + git mv + audit hook |
| 3.3 | Promote action moves file via git mv and creates audit log entry | integration | DEFERRED — Phase 3 follow-up | Same as 3.2 |
| 3.4a | extractFrontmatter parses valid frontmatter block | unit | `src/test/frontmatter.test.ts` PASSING | Phase 3 utility |
| 3.4b | extractFrontmatter handles CRLF, empty blocks, parse errors, array rejection | unit | `src/test/frontmatter.test.ts` PASSING | Edge cases |
| 3.4c | readWikiFields picks out only spec-documented fields and filters wrong types | unit | `src/test/frontmatter.test.ts` PASSING | Wiki-spec adherence |
| 3.4d | Frontmatter renders as a structured panel above the body in /files editor | playwright | DEFERRED — Phase 3 follow-up | Parser ready; UI wiring next pass |
| 3.5 | Wiki edit through Studio is recorded in the audit log | integration | PLANNED | |
| 3.6a | parseEngagementState validates a real production file | integration | PASSING — verified against all 3 customer engagement-state.yaml files 2026-05-29 | Schema is correct |
| 3.6b | parseEngagementState rejects unknown stage, missing gate, wrong schema_version | unit | `src/test/engagement-state.test.ts` PASSING | Negative cases |
| 3.6c | gateProgress, stageIndex, nextOpenDeploymentNote helpers | unit | `src/test/engagement-state.test.ts` PASSING | UI helper coverage |

## Phase 4 — Named Nexxus agents

| # | Behavior | Type | Location / Status | Notes |
|---|----------|------|-------------------|-------|
| 4.1 | Lead-follow-up agent dispatchable from Studio against huminic profile | manual | PLANNED | |
| 4.2 | Same agent reads its workflow page before acting | eval | PLANNED | |
| 4.3 | Service agent's outputs land in service-* kanban lanes | integration | PLANNED | |
| 4.4 | CRM-data-guru agent uses VinSolutions MCP and respects rate limits | integration | PLANNED | |

## Phase 5 — Customer console plugin renderers

| # | Behavior | Type | Location / Status | Notes |
|---|----------|------|-------------------|-------|
| 5.1 | /console/$profile/chat opens a Studio session against the profile's primary agent | playwright | PLANNED | |
| 5.2 | /console/$profile/dashboard renders artifacts from web-artifact / live-web-artifact skills | playwright | PLANNED | |
| 5.3 | /console/$profile/widget CRUD writes to knowledge/widgets/*.md | playwright | PLANNED | |
| 5.4 | /console/$profile/service shows kanban filtered to service-* lanes | playwright | PLANNED | |
| 5.5 | Engagement-tracker panel reads engagement-state.yaml and renders current stage | playwright | PARTIALLY — admin overview at /engagements landed 2026-05-29; per-profile renderer Phase 5 | |
| 5.5a | listEngagements aggregates customer profiles with engagement-state.yaml | unit | `src/test/engagements.test.ts` PASSING | |
| 5.5b | listEngagements returns sorted results and skips profiles without state file | unit | `src/test/engagements.test.ts` PASSING | |
| 5.5c | listEngagements records parseErrors for malformed files | unit | `src/test/engagements.test.ts` PASSING | |
| 5.5d | listEngagements returns empty when ~/.hermes/profiles does not exist | unit | `src/test/engagements.test.ts` PASSING | Edge case |
| 5.5e | /engagements page loads and renders one card per customer with stage badge + progress bar + open notes | playwright | PLANNED — needs production rebuild + Playwright config | Visible work; high-priority test |
| 5.6 | Plugin loader is wired into Studio bootstrap (memoized getLoadedPlugins) | unit | `src/test/plugin-bootstrap.test.ts` PASSING | Phase 0 → Phase 7 integration closed 2026-05-29 |
| 5.6a | getLoadedPlugins memoizes by (pluginsRoot, studioVersion) | unit | `src/test/plugin-bootstrap.test.ts` PASSING | Cache key collision avoidance |
| 5.6b | getLoadedPlugins reloads when fresh: true | unit | `src/test/plugin-bootstrap.test.ts` PASSING | Test hook |
| 5.6c | summarize() flattens manifests for client consumption | unit | `src/test/plugin-bootstrap.test.ts` PASSING | API payload shape |
| 5.6d | summarize() surfaces issues from invalid manifests | unit | `src/test/plugin-bootstrap.test.ts` PASSING | Operator-visible errors |
| 5.7 | GET /api/plugins returns loaded plugin set with auth gating | integration | PLANNED — Playwright | Integration test |
| 5.8 | Engagements sidebar nav link is visible and active when on /engagements/* | playwright | PLANNED | Workspace shell + chat-sidebar wired 2026-05-29 |
| 5.9 | /engagements/$customer detail view renders stage history, all readiness gates with status, deployment notes (open + resolved), open decisions, adjacent neighbors, build-time and run-time crew rosters | playwright | PLANNED | Detail view landed 2026-05-29 |
| 5.5f | /engagements/$customer detail view shows stage history, all gates, deployment notes, open decisions, adjacent neighbors | playwright | PLANNED | Drill-down view |
| 5.5g | Card on /engagements links to detail view | playwright | PLANNED | Navigation |
| 5.5h | Sidebar shows "Engagements" entry; clicking activates the route | playwright | PLANNED | |
| 5.6  | getLoadedPlugins memoizes and reloads with fresh:true | unit | `src/test/plugin-bootstrap.test.ts` PASSING | |
| 5.6a | getLoadedPlugins reloads when pluginsRoot key changes | unit | `src/test/plugin-bootstrap.test.ts` PASSING | |
| 5.6b | summarize flattens manifests into PluginSummary entries | unit | `src/test/plugin-bootstrap.test.ts` PASSING | |
| 5.6c | summarize surfaces validation issues | unit | `src/test/plugin-bootstrap.test.ts` PASSING | |
| 5.6d | /api/plugins endpoint returns loaded customer-console plugin in production | integration | PLANNED — needs auth flow + production redeploy | First end-to-end of plugin manifest |
| 5.6e | Studio server boot logs `[plugin-bootstrap] loaded N plugin(s)` | integration | PLANNED — log capture after redeploy | |
| 5.6 | Per-profile branding (logo, color, persona name) varies between profiles | playwright | PLANNED | |
| 5.7 | Public /w/$slug loads without auth and renders the widget mode declared in frontmatter | playwright | PLANNED | |
| 5.8 | Public /p/$slug works as an alias | playwright | PLANNED | |
| 5.9 | /customer-console/embed.js bundle is served with `Access-Control-Allow-Origin: *` and the declared Cache-Control | integration | PLANNED | hosted bundle test |
| 5.10 | Customer website pasting `<script src="…/customer-console/embed.js">` injects working widget | playwright | PLANNED | Cross-origin embedding |

## Phase 5 — Customer console plugin renderers (continued)

| # | Behavior | Type | Location / Status | Notes |
|---|----------|------|-------------------|-------|
| 5.11 | parseStudioConfig accepts minimum valid config (just branding.persona_name) | unit | `src/test/studio-config.test.ts` PASSING | |
| 5.12 | parseStudioConfig rejects missing branding.persona_name | unit | `src/test/studio-config.test.ts` PASSING | |
| 5.13 | parseStudioConfig parses full config with dashboards/widgets/federation | unit | `src/test/studio-config.test.ts` PASSING | |
| 5.14 | parseStudioConfig rejects invalid accent_color hex | unit | `src/test/studio-config.test.ts` PASSING | |
| 5.15 | parseStudioConfig rejects unknown widget mode | unit | `src/test/studio-config.test.ts` PASSING | |
| 5.16 | defaultStudioConfig uses profile name as persona_name | unit | `src/test/studio-config.test.ts` PASSING | Fallback behavior |
| 5.17 | console-renderers registry has all 6 expected keys | unit | PLANNED — quick add | |
| 5.18 | /console/$profile parent layout renders 4 tabs and reads studio.yaml branding | playwright | PLANNED | |
| 5.19 | /console/$profile/$tab dispatches to correct renderer (chat → ChatRenderer, etc) | playwright | PLANNED | |
| 5.20 | /console/$profile/chat shows persona_name from studio.yaml in stub | playwright | PLANNED | |
| 5.21 | /api/studio-config returns parsed config from profile's studio.yaml | integration | PLANNED — needs auth flow | |
| 5.22 | /api/studio-config returns default config when profile has no studio.yaml | integration | PASSING (test via readStudioConfig source: 'default') | |

## Phase 6 — Per-profile MCP integrations

| # | Behavior | Type | Location / Status | Notes |
|---|----------|------|-------------------|-------|
| 6.1 | Each profile's mcp.json declares concrete Vapi/Tavus/VinSolutions servers | manual | PLANNED | |
| 6.2 | A Vapi voice call round-trip is captured in /audit | manual | PLANNED | |
| 6.3 | A VinSolutions lead query round-trip is captured in /audit | manual | PLANNED | |
| 6.4 | mcp-federation skill `federated_search` returns results from at least 2 sources with provenance | integration | PLANNED | |
| 6.5 | Cross-profile read without federation.read_scopes is rejected and audited | integration | PLANNED | |

## Phase 7 — (placeholder, populated when scope solidifies)

## Phase 8 — Validation + Nexxus decommission

| # | Behavior | Type | Location / Status | Notes |
|---|----------|------|-------------------|-------|
| 8.1 | Full consultative end-to-end (orient → package) produces all 6 prescription artifacts | eval | PLANNED | Acceptance |
| 8.2 | KSG rejects a contract-violating canonical write attempt | integration | PLANNED | Governance enforcement |
| 8.3 | Nexxus database rows can be imported into the Data Brain shape derived from consultative output | script | PLANNED | Migration |
| 8.4 | Customer engagement progresses Draft → Ready to Run with all gates approved | eval | PLANNED | |

## Cross-cutting / smoke

| # | Behavior | Type | Location / Status | Notes |
|---|----------|------|-------------------|-------|
| X.1 | `pnpm test` passes (all suites) | script | PASSING — 207 tests | Baseline |
| X.2 | `pnpm build` produces a clean bundle | script | PASSING | Baseline |
| X.3 | Live customer SOUL/config/persona/AGENTS hashes unchanged after each phase | script | PASSING through Phase 2 | Run before each prod-write phase |
| X.4 | Validate script exits 0 against current state | script | PASSING | Run after each prod-write phase |
| X.5 | Studio admin UI (current 18 screens) still loads after fork changes | playwright | PLANNED | Regression guard |
| X.6 | Hermes gateway health (port 8642) remains green | manual | PASSING | |
| X.7 | Nexxus host process is unaffected | manual | PASSING | Don't disrupt directive |

## Cedar Ridge Validation (V0–V10)

| # | Behavior | Type | Location / Status | Notes |
|---|----------|------|-------------------|-------|
| V0.1 | Coolify env-var write path for dockercompose apps is `PATCH /applications/{uuid}/envs/bulk` | script | PASSING 2026-05-29 | Discovered while resolving the 404 on `/environment-variables`. Coolify auto-replicates one entry per compose service (so HERMES_PASSWORD shows as 2 rows in `/envs` GET — one per service). Cleanup also requires deleting the per-service replica. Update central-mcp allowlist to add `/envs*` paths. |
| V0.2 | HERMES_PASSWORD is set durably on huminic-studio (survives rebuild) | manual | PASSING 2026-05-29 — value held out-of-repo (operator's `/tmp/studio-password.txt`, mode 0600); coolify env uuids p4zo38o6qlj55gjhs0gdvse9 + y8mmg150a0uc12xtrfmrxaud | Confirm post-rebuild by GET /envs |
| V0.3 | Playwright MCP can navigate to studio.huminic.app, log in, reach `/engagements`, `/profiles`, `/agents` | playwright | PASSING 2026-05-29 | Login via UI works after fix D-V0-001 (PR #11). Evidence: `docs/v0-evidence/v0.3-engagements-overview.png` (3 customer cards visible), `docs/v0-evidence/v0.3-agents-page.png`. /engagements/$customer route loads (title sets) but content gated by D-V0-004. |
| V0.4 | `/api/auth-session`, `/api/plugins`, `/api/engagements` respond against new live build | script | PASSING 2026-05-29 | wire-level: auth-session returns identity object; /api/plugins returns customer-console@0.1.0 with no issues; /api/engagements returns 3 customers at draft; /api/studio-config?profile=huminic returns default fallback; /api/profiles/list returns 8 (7 named + default); /api/agents returns 8 builtins; /api/sessions create succeeds. |
| V1.1 | Feature map (`docs/feature-map.md`) lists every Studio surface with source layer + portability rating | manual | PLANNED | V1 deliverable |
| V1.2 | All fork-edited UI surfaces are justified (cannot be plugin-driven) | manual | PLANNED | V1 portability assessment |
| V2.1 | `docs/customer-provisioning.md` documents end-to-end new-company setup | manual | PLANNED | V2 deliverable |
| V3.1 | Consultative eval rubrics defined (gate adherence, deployment notes, adjacent_data_neighbors, no canon edits) | eval | PLANNED | V3 deliverable |
| V1.1 | Feature map produced from V1.1A + V1.1B Explore audits | manual | PASSING 2026-05-29 | `docs/feature-map.md` written |
| V1.2 | Portability assessment classifies every fork-edited surface | manual | PASSING 2026-05-29 | `docs/portability-assessment.md` written; no fork surface in wrong location |
| V2.5 | Customer provisioning recipe documented | manual | PASSING 2026-05-29 | `docs/customer-provisioning.md` written |
| V4.1 | Consultative agent run against cedar-ridge-automotive produces all 6 prescription artifacts conforming to spec | eval | PASSING 2026-05-29 | 6 artifacts written via `scripts/v4-consultative-dispatch.mjs`. All have frontmatter, id, phase, and "Impact of Missing Details". Total ~39KB. |
| V4.2 | Every consultative artifact includes "Impact of Missing Details" + populated `adjacent_data_neighbors` | eval | PASSING 2026-05-29 | All 6 artifacts pass spec check (IMD heading present); engagement-state.adjacent_data_neighbors has 7 entries; open_decisions has 3 (all resolved with proposed resolutions); deployment_notes has 4 (3 open, 1 confirmed). |
| V5.1 | Cedar Ridge profile + data-governor profile installed; files written under cedar-ridge do NOT leak into huminic profile | script | PASSING 2026-05-29 | Both profile dirs created. /api/engagements lists 4 customers with cedar-ridge at ready_to_run, others still at draft — isolation confirmed. |
| V6.1 | Cedar Ridge core agents visible; each SOUL references scope contract + approval matrix + workflow page + Kanban lane | manual | PASSING 2026-05-29 | 8/8 SOULs in `governance/agents/` declare all 4 required references. (Note: not yet registered as Studio custom agents — profile-resident per Hermes-standard mechanism.) |
| V7.1 | KSG flags a write that conflicts with canon; canon stays unchanged until operator approval | integration | PASSING 2026-05-29 | Governor dispatched via `scripts/v7-ksg-conflict-test.mjs`; verdict=rejected; identified 3 canon rule violations (Rules 1, 2, 4); canon SHA256 verified unchanged; reconciliation proposal written to `knowledge/inbox/07-ksg-verdict-bulk-promo-blast.md`. |
| V8.1 | Wiki edit to a workflow page changes downstream agent behavior | playwright | PASSING 2026-05-29 (script) | `scripts/v8-propagation-test.mjs` confirmed: agent's response after Rule 0 added to `lead-followup.md` references Rule 0 / suppression / 24-hour. Hash changed; agent response reflects new rule. No stale prompt cache. |
| V9.1 | `/w/cedar-ridge-hero` public widget loads without authentication | playwright | LANDING in PR #13 | Route shell `src/routes/w.$slug.tsx` + `src/server/public-widgets.ts` added. Verifying post-rebuild. |
| V9.2 | Federated MCP stub returns sensible structure for a Cedar Ridge-scoped query | unit | DEFERRED — Phase 6 | Design-only per `docs/federation-mcp-design.md`. |
| V10.1 | End-to-end Cedar Ridge journey passes; defect register + readiness report produced | manual | PASSING 2026-05-29 | `docs/cedar-ridge-readiness-report.md` + `docs/cedar-ridge-defect-register.md` produced. Final recommendation: CONDITIONAL GO. |

---

## Process

- After every phase status block in the plan file, add new test-case entries here.
- Mark `PLANNED` items `WRITTEN` when the test exists, `PASSING` when it's green in CI.
- For `eval` items, link to the rubric file once written.
- When operator runs a manual test, the operator marks PASSING/FAILING with date.
