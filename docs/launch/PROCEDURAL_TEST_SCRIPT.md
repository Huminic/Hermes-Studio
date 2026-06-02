# PROCEDURAL_TEST_SCRIPT.md — Huminic Studio launch verification

**For the verifier (separate agent, independent of the Phase 8 implementing agent).**

## Verifier handoff rules

Per operator directive 2026-06-02, recorded as `DEC verifier-handoff-rules` in `docs/launch/DECISIONS.log`:

1. **Branch source.** You read from `feature/phase-8-closeout` branch only — not local, not main. `git fetch origin && git checkout feature/phase-8-closeout` before any read. Re-checkout at the start of each session.
2. **Independent execution.** You perform every procedure yourself against the live system at `https://studio.huminic.app`. Your own Playwright MCP session. Your own fresh-state browser (clear localStorage + cookies between procedures unless the procedure explicitly requires authenticated state). You do NOT trust prior screenshots, prior `REPORT.md` entries, or prior commit messages — re-verify.
3. **Report shape.** You produce `docs/launch/VERIFICATION_REPORT.md` with one row per procedure: PASS / FAIL / BLOCKED / KNOWN-GAP. Any FAIL gets a NEW `GAP-` row added to `PLAN.md` by YOU. Any disagreement between your finding and the prior agent's claim gets surfaced explicitly under a "Disagreements" section — that is the integrity check.

You commit your `VERIFICATION_REPORT.md` + your `PLAN.md` GAP-row additions to the `feature/phase-8-closeout` branch. You push. The implementing agent then posts your raw report back to the operator UNEDITED.

## Procedure structure

Each procedure follows this shape:

```
### PROC-NNN — <title>

Role:       <actor>
Maps to:    WF-XYZ-NNN [, GAP-XYZ-NNN [, .fixme tests/e2e/workflows/...]]
Expected:   PASS | EXPECTED TO FAIL — GAP-XXX-XXX | BLOCKED — <precondition>
Preconds:   <browser state, auth state, fixture data>

Steps:
1. <action>
2. <action>
...

Expected outcome:
- <observable state>
- Audit-log id pattern: <if applicable>
- Brain row: <table + fields, if applicable>
- Wiki file path: <if applicable>

Negative test:
- <variant action> → expect <verdict text or status code>

Evidence to capture:
- Screenshot: docs/launch/evidence/verification/<NNN>-<slug>.png
- Audit-log id: <paste actual id captured during run>
- File path: <paste actual path if a file was written>
- Transcript: <how to capture for chat / call procedures>
```

## Common setup (referenced from procedures below)

- **SETUP-FRESH:** Fresh-state browser. Clear localStorage + sessionStorage + cookies for `studio.huminic.app`. Navigate to the procedure's starting URL only after clearing.
- **SETUP-ADMIN:** Logged in as Studio admin. Username `duane`, password `HuminicValidation2026!` on the `huminic` profile. Verify the sidebar shows Operations / Agents / Tasks / Engagements / Files / Skills / Plugins / MCP Tokens / Audit / Terminal / Memory.
- **SETUP-CA-HUMINIC:** Logged in as customer-admin at `/p/huminic/`. Same credentials as SETUP-ADMIN (huminic profile carries both `is_admin: true` AND `is_customer_admin: true`).
- **SETUP-CA-STRUKTURE:** Logged in as customer-admin at `/p/strukture/`. Username `kim`, password `StruktureLogin2026!`.
- **SETUP-CA-HUMINIC-MOTORS:** Logged in as customer-admin at `/p/huminic-motors/`. Username `neoweaver@gmail.com`, password `De@l$ucce$` (must reset on first login per launch convention).
- **SETUP-NEW-DEALER-CRED:** For procedures touching the 6 new dealer storefronts (serra-honda, serra-nissan, serra-service, tony-serra-ford, ford-of-columbia, hyundai-of-columbia): Username `<slug>@huminic.app`, password `De@l$ucce$`. Must reset on first login.

## Status legend

- **PASS expected** — the workflow surface exists end-to-end and the procedure should succeed today.
- **EXPECTED TO FAIL — GAP-XXX-XXX** — the procedure documents a known-open gap. The verifier walks it to confirm the gap is exactly as described (not worse) and to capture evidence of the launch-time workaround.
- **BLOCKED — <reason>** — a precondition (operator-action gate like OP-002) means the procedure cannot run today. Verifier marks BLOCKED + records the precondition.

---

# Category A — Authentication + session

### PROC-001 — Studio admin login on fresh state

Role:       Operator
Maps to:    WF-OP-001
Expected:   PASS
Preconds:   SETUP-FRESH

Steps:
1. Navigate to `https://studio.huminic.app/`.
2. Observe redirect to `/chat/new` then a "Huminic Studio / Sign in" form rendering.
3. Enter username `duane`, password `HuminicValidation2026!`.
4. Click "Continue".
5. Observe redirect to `/chat/new` with the Studio sidebar nav rendered.

Expected outcome:
- Sidebar shows: Operations / Agents / Tasks / Engagements / Files / Skills / Plugins / MCP Tokens / Audit / Terminal / Memory.
- `GET /api/auth-session` returns `{authenticated: true, profile: "huminic", username: "duane", is_admin: true, is_customer_admin: true}`.

Negative test:
- After login, navigate `/p/other-slug/chat` — should NOT auto-authenticate as customer-admin for `other-slug` (cross-profile isolation).

Evidence:
- Screenshot: docs/launch/evidence/verification/001-admin-login.png
- Network capture: response of `/api/auth-session` after login

### PROC-002 — Storefront landing renders without authentication (anonymous)

Role:       Anonymous visitor
Maps to:    WF-CA-001
Expected:   PASS
Preconds:   SETUP-FRESH

Steps:
1. Navigate to `https://studio.huminic.app/p/huminic-motors/`.
2. Observe brand-chrome landing with "Huminic Motors" heading + "HUMINIC-MOTORS" slug chip + Log in button + 6-tile preview.
3. Verify the 4th tile is "Data" with "DISABLED" badge.
4. Verify there is NO `<HermesOnboarding>` modal overlaying the page.

Expected outcome:
- Brand rendered (not the slug as fallback).
- Data tile DISABLED visible.
- No overlay blocking the Log in button.

Negative test:
- Try clicking a tile while unauthenticated → redirect to login form for that tab path.

Evidence:
- Screenshot: docs/launch/evidence/verification/002-huminic-motors-landing.png

### PROC-003 — Storefront landing for additional dealer (serra-honda)

Role:       Anonymous visitor
Maps to:    WF-CA-001
Expected:   PASS
Preconds:   SETUP-FRESH

Steps:
1. Navigate to `https://studio.huminic.app/p/serra-honda/`.
2. Observe brand-chrome landing with "Serra Honda" heading + "SERRA-HONDA" slug chip + red accent + Log in button + 6-tile preview with Data DISABLED.

Expected outcome:
- Brand "Serra Honda" rendered (NOT the slug `serra-honda` as a fallback).
- Red accent border at top.
- 6 tiles, Data DISABLED.

Evidence:
- Screenshot: docs/launch/evidence/verification/003-serra-honda-landing.png

### PROC-004 — Customer-admin login on storefront

Role:       Customer-admin
Maps to:    WF-CA-001
Expected:   PASS (huminic) / BLOCKED — first-login-required (other dealers if password not yet reset)
Preconds:   SETUP-FRESH

Steps:
1. Navigate to `https://studio.huminic.app/p/huminic/`.
2. Click any tile (e.g., Chat) — login form renders.
3. Enter username `duane`, password `HuminicValidation2026!`.
4. Click "Continue".
5. Observe redirect to `/p/huminic/chat` with the storefront 6-tab nav.

Expected outcome:
- Sidebar / Studio admin chrome NOT visible (storefront standalone shell).
- Top nav shows 6 tabs (Data dimmed).

Evidence:
- Screenshot: docs/launch/evidence/verification/004-huminic-storefront-authed.png

### PROC-005 — Password reset request (anti-enumeration)

Role:       Customer-admin
Maps to:    WF-CA-007
Expected:   PASS
Preconds:   SETUP-FRESH (no auth required)

Steps:
1. `curl -s -X POST https://studio.huminic.app/api/auth/reset-request -H "Content-Type: application/json" -d '{"email": "nonexistent-user-${RANDOM}@example.com"}' | jq .`
2. Repeat with a real address like `duane@huminic.app`.

Expected outcome:
- Both calls return HTTP 200 with `{"ok": true}` — anti-enumeration. The body must NOT differ between known and unknown emails.

Negative test:
- 4 rapid calls from same IP within 60 seconds — at least one returns HTTP 429 (rate-limited 3/min/IP).

Evidence:
- Capture both response bodies + status codes.

### PROC-006 — Password reset page renders standalone (P-FIX-002 re-verify)

Role:       Customer-admin
Maps to:    WF-CA-007, P-FIX-002 re-verification
Expected:   PASS
Preconds:   SETUP-FRESH

Steps:
1. Navigate to `https://studio.huminic.app/reset?token=verification-test-token`.
2. Observe a standalone card with "Huminic" heading + "RESET PASSWORD" chip + new password + confirm fields + Update button.

Expected outcome:
- NO Studio admin sidebar.
- NO HERMES OS topbar.
- NO storefront 6-tab nav.
- Card is centered alone on the page.

Negative test:
- With expired or invalid token: clicking Update should return a verdict like "token expired" or "token invalid" — not a silent success.

Evidence:
- Screenshot: docs/launch/evidence/verification/006-reset-standalone.png

### PROC-007 — Sign out (workaround)

Role:       Any authenticated
Maps to:    WF-OP-007, .fixme tests/e2e/workflows/01-operator.spec.ts WF-OP-007
Expected:   EXPECTED TO FAIL — GAP-LOGOUT-001

Steps:
1. After logging in, look for a "Sign out" / "Logout" button in the sidebar, header, or any menu.
2. Inspect available API endpoints: `curl -s https://studio.huminic.app/api/auth/logout` and observe the response.

Expected outcome:
- No "Sign out" button exists in any UI location.
- `/api/auth/logout` returns 404 or similar non-200 (endpoint not registered).
- Launch-time workaround: open DevTools → Application tab → clear cookies for `studio.huminic.app` → refresh.

Evidence:
- Screenshot of any UI surface where a sign-out button should reasonably appear (sidebar, header).
- Curl response for `/api/auth/logout`.

---

# Category B — Studio admin core surfaces

### PROC-010 — Profiles screen lists 15 profile dirs

Role:       Operator
Maps to:    WF-OP-001 (sub-flow)
Expected:   PASS
Preconds:   SETUP-ADMIN

Steps:
1. Navigate to `/profiles`.
2. Verify the list shows: huminic, strukture, serra-automotive, serra-honda, serra-nissan, serra-service, tony-serra-ford, ford-of-columbia, hyundai-of-columbia, huminic-motors, consultative-agent, huminic-data-governor, strukture-data-governor, serra-automotive-data-governor, cedar-ridge-automotive-data-governor.
3. Click any profile → "Set active". Switch to `strukture` (or other non-huminic).

Expected outcome:
- Active profile changes; `/agents`, `/files`, `/memory` re-render with strukture's content.

Negative test:
- Click "Set active" on a profile that doesn't exist (URL hack: `/profiles?activate=fake-slug`) → expect verdict text or no-op.

Evidence:
- Screenshot: docs/launch/evidence/verification/010-profiles-list.png

### PROC-011 — Agents screen lists profile-distributed SOULs + custom agents

Role:       Operator
Maps to:    WF-OP-001 (sub-flow), GAP-AGENT-WIKI-001
Expected:   PASS (lists), EXPECTED TO FAIL — GAP-AGENT-WIKI-001 (for first-class wiki-binding fields)
Preconds:   SETUP-ADMIN, active profile = `huminic`

Steps:
1. Navigate to `/agents`.
2. Observe list of agents: custom-defined agents from `~/.runtime/agent-definitions.json` + profile SOULs from `huminic/SOUL.md` + `huminic/governance/agents/*.md`.
3. Click "New agent" — observe form.

Expected outcome:
- List renders.
- "New agent" form has fields: name, description, model, systemPrompt.
- Form does NOT have first-class `scope_contract_path`, `workflow_path`, `kanban_lane` fields.

Evidence:
- Screenshot: docs/launch/evidence/verification/011-agents-form.png
- Note presence/absence of wiki-binding fields.

### PROC-012 — Engagements overview renders + lists engagements

Role:       Operator
Maps to:    WF-OP-003, WF-CHO-003
Expected:   PASS
Preconds:   SETUP-ADMIN

Steps:
1. Navigate to `/engagements`.
2. Observe overview cards for each customer with non-empty `engagement-state.yaml` (at minimum: huminic, strukture, serra-automotive, cedar-ridge-automotive).
3. Each card shows: stage badge, 7-step progress bar, tile counts, summary line, optional amber alert.
4. Click one card → drill into `/engagements/<customer>` detail.

Expected outcome:
- Detail page shows full breakdown: stage progress strip, stage history, 5 readiness gates with status badges, deployment notes, open decisions, adjacent neighbors, build/run crew rosters.

Negative test:
- Direct-URL `/engagements/profile-that-does-not-exist` → expect 404 or "no engagement" state.

Evidence:
- Screenshot of overview: 012a-engagements-overview.png
- Screenshot of detail: 012b-engagement-detail-huminic.png

### PROC-013 — MCP tokens admin screen lists tokens + plugin loader reports 3 plugins

Role:       Operator
Maps to:    WF-OP-005
Expected:   PASS
Preconds:   SETUP-ADMIN

Steps:
1. Navigate to `/mcp-tokens`.
2. Observe token registry with per-token: name, scope set, fingerprint, created-at, last-used-at, revoked-at.
3. Hit `GET /api/plugins` from authenticated session: `curl -s -b "<cookie>" https://studio.huminic.app/api/plugins | jq '.plugins | length'`.
4. Expect 3 plugins.

Expected outcome:
- 3 plugins: customer-console, messaging-hub, data-canvas.
- No `issues` array entries (or document any that appear).

Evidence:
- Screenshot of mcp-tokens page.
- Response body of /api/plugins.

### PROC-014 — Tasks/Kanban board renders + filter by lane

Role:       Operator
Maps to:    WF-OP-001 (sub-flow)
Expected:   PASS
Preconds:   SETUP-ADMIN

Steps:
1. Navigate to `/tasks`.
2. Observe lanes (inbox, triage, in_progress, review, done, + custom).
3. Navigate to `/tasks?lane_prefix=service-` → only service lanes visible.

Expected outcome:
- Filter applied via URL param.

Evidence:
- Screenshot: 014-tasks-board.png

### PROC-015 — Audit log filter works

Role:       Operator
Maps to:    WF-OP-005, WF-CMS-005, WF-XAC-005
Expected:   PASS
Preconds:   SETUP-ADMIN

Steps:
1. Navigate to `/audit`.
2. Filter by `action_type=COMMS_FAIL` (or similar known type).
3. Filter by profile = `huminic-motors`.

Expected outcome:
- Filter applied; rows narrow accordingly.

Evidence:
- Screenshot: 015-audit-filter.png

---

# Category C — Provisioning + onboarding

### PROC-020 — Provision a new customer via script (Provisioner agent workaround)

Role:       Operator
Maps to:    WF-OP-004, WF-PRV-001 through WF-PRV-005, GAP-PROV-001
Expected:   EXPECTED TO FAIL via UI — GAP-PROV-001 (no Provisioner agent dispatch)
            PASS via CLI workaround
Preconds:   Coolify shell access to hermes-agent-... container

Steps (UI path — EXPECTED TO FAIL):
1. Navigate to `/profiles`.
2. Look for a "New customer" or "Provision" button.
3. Result: no such button exists. Document.

Steps (CLI workaround — EXPECTED to PASS):
1. `docker exec -it hermes-studio-nh5vnz9kz226cj9ib3nodg1j-... npx tsx scripts/provision-launch-profiles.ts --slug verifier-test-dealer --brand "Verifier Test Dealer" --accent "#888888" --customer-admin-username verifier@example.com --customer-admin-password TestProvision2026!` — the scripts live in the **studio** container at `/app/scripts` (GAP-VER-007: requires the Coolify redeploy of the scripts-bearing image) and run with `npx tsx` (no global `pnpm` in the runtime image).
2. Verify directory: `docker exec hermes-studio-... ls /root/.hermes/profiles/verifier-test-dealer/`.
3. Read `studio.yaml`: must use `branding.persona_name: "Verifier Test Dealer"` (NOT `brand.display_name`). Schema-fallback check.
4. Read `auth.yaml`: must have `username: verifier@example.com`, `password_hash: <scrypt>`, `is_customer_admin: true`.

Expected outcome:
- Profile dir created with: distribution.yaml, SOUL.md, config.yaml, mcp.json, .env.example, skills/, cron/, studio.yaml, auth.yaml.
- studio.yaml uses `branding.persona_name`.

Negative test:
- Re-run the same script (idempotency) — should not corrupt existing data, should not throw errors.

Evidence:
- ls output of new profile dir.
- studio.yaml contents.
- After verification, cleanup: `docker exec hermes-agent-... rm -rf /root/.hermes/profiles/verifier-test-dealer/` to keep the environment clean.

### PROC-021 — Verify huminic-motors studio.yaml schema (P-FIX-003 re-verification)

Role:       Operator
Maps to:    WF-OP-001 (sub-flow), P-FIX-003 re-verification
Expected:   PASS
Preconds:   Coolify shell access

Steps:
1. `docker exec hermes-agent-... cat /root/.hermes/profiles/huminic-motors/studio.yaml`.
2. Verify presence of `branding:` (NOT `brand:`) as top-level key.
3. Verify presence of `branding.persona_name: "Huminic Motors"`.
4. Verify presence of `menu.data: false`.

Expected outcome:
- Keys are schema-correct; brand renders as "Huminic Motors" on storefront.

Negative test:
- Edit studio.yaml to use `brand:` instead of `branding:` (then restore) — storefront should show slug as fallback. **Do not perform this on production.** Document the test in a fixture profile only.

Evidence:
- Cat of studio.yaml.

### PROC-022 — Customer-admin invite (no self-service)

Role:       Customer-admin
Maps to:    WF-CA-008, GAP-CUSTOMER-INVITE-001
Expected:   EXPECTED TO FAIL via UI — GAP-CUSTOMER-INVITE-001

Steps:
1. Log in as customer-admin.
2. Look for an "Invite" or "Add staff" button in the storefront UI.
3. Result: no such button exists.
4. Workaround: operator runs `docker exec -it hermes-studio-... npx tsx scripts/create-user.ts --profile <slug> --username <email> --customer-admin` (studio container; `/app/scripts` ships after the GAP-VER-007 redeploy; `npx tsx`, no global `pnpm`).

Expected outcome:
- No invite UI in the customer-admin's storefront.
- Operator CLI is the only path at launch.

Evidence:
- Screenshot of storefront chrome showing no invite affordance.

### PROC-023 — Provision missing data-governor SOULs (GAP-SG-001 partial close)

Role:       Operator
Maps to:    GAP-SG-001
Expected:   EXPECTED TO BE PRESENT in repo (SOULs authored) / BLOCKED on production-volume deploy
Preconds:   Read access to feature/phase-8-closeout branch

Steps:
1. `git ls-files docs/launch/agent-souls/governors/` — verify 7 governor SOULs present.
2. For each governor, verify the SOUL has frontmatter with `id: <slug>-data-governor`, `enabled: true`, watch paths, sequence diagram.
3. Check production volume: `docker exec hermes-agent-... ls /root/.hermes/profiles/ | grep "data-governor"`.
4. Expect to see 4 existing (huminic-, strukture-, serra-automotive-, cedar-ridge-automotive-) + possibly 7 new ones if deploy script has been run.

Expected outcome:
- 7 SOUL files present in repo at `docs/launch/agent-souls/governors/`.
- Production-volume presence depends on whether `scripts/deploy-phase8-souls.sh` has been authored + run (not in Phase 8 scope — operator decision).

Evidence:
- File listing from repo + production volume.

---

# Category D — Customer storefront tabs

### PROC-030 — Chat tab — agent picker + multi-turn session

Role:       Customer-admin
Maps to:    WF-CA-002
Expected:   PASS (if agents enabled on profile) / BLOCKED (if no agents enabled)
Preconds:   SETUP-CA-HUMINIC

Steps:
1. After login, click "Chat" tab.
2. Agent picker renders on right pane — listing huminic's agents.
3. Click any agent → new session opens with the agent's greeting.
4. Type a question → Enter → observe agent's response.
5. Type a follow-up → verify multi-turn context.

Expected outcome:
- Conversation persists. `GET /api/messaging/threads?profile=huminic&domain=chat` lists the new thread.
- Audit-log id pattern: `chat-session-<uuid>` rows in `/audit`.

Negative test:
- Try to dispatch an agent NOT on the huminic profile (e.g., from another customer's roster) — should not appear in the picker.

Evidence:
- Screenshot: 030-chat-picker.png
- Audit-log capture of the chat session id.

### PROC-031 — Knowledge tab — list + read a wiki page

Role:       Customer-admin
Maps to:    WF-CA-003, WF-KSG-001 through WF-KSG-004
Expected:   PASS
Preconds:   SETUP-CA-HUMINIC

Steps:
1. Click "Knowledge" tab.
2. Tree-view renders showing editable paths (`knowledge/inbox/`, `knowledge/drafts/`, `knowledge/published/`, `knowledge/widgets/`).
3. Click any markdown file → editor opens.
4. Verify frontmatter shows as a structured panel above the body.

Expected outcome:
- Tree view excludes `canon/`, `governance/`, `archive/` (protected paths).
- Editor opens with content visible.

Evidence:
- Screenshot: 031-knowledge-tab.png

### PROC-032 — Knowledge tab — KSG blocks protected-tree write

Role:       Customer-admin
Maps to:    WF-KSG-001
Expected:   PASS (block fires)
Preconds:   SETUP-CA-HUMINIC

Steps:
1. Use direct API: `curl -X POST https://studio.huminic.app/api/customer/wiki/save -H "Content-Type: application/json" -b "<cookie>" -d '{"profile":"huminic","path":"canon/about.md","content":"---\ntype: page\nstatus: draft\ntitle: Test\n---\n\nshould fail"}'`.

Expected outcome:
- Response: 400 (or similar 4xx) with verdict text like `"protected-tree: canon/ is read-only on the customer-admin path."`.
- Audit-log row: `action_type=KSG_BLOCKED`, `rule=protected-tree`, `path=canon/about.md`.

Negative test (mirror — should PASS):
- Same call but `path=knowledge/drafts/test-verifier.md` → 200, file created.

Evidence:
- curl response body for the block.
- Audit-log id of the KSG_BLOCKED row.

### PROC-033 — Knowledge tab — promote draft → published

Role:       Customer-admin
Maps to:    WF-CA-003 (sub-flow), WF-KSG-004
Expected:   PASS (via storefront button OR direct API)
Preconds:   SETUP-CA-HUMINIC, a draft exists at `huminic/knowledge/drafts/<name>.md`

Steps:
1. In the storefront Knowledge tab, open the draft.
2. Click "Promote" button.
3. Confirm the dialog.

Expected outcome:
- File moves to `huminic/knowledge/published/<name>.md`. KSG-approved.
- Audit row: `action_type=PROMOTE`, `from_path=knowledge/drafts/<name>.md`, `to_path=knowledge/published/<name>.md`.

Negative test:
- Direct API: `POST /api/customer/wiki/promote` with `from_path=knowledge/published/<x>.md`, `to_path=knowledge/inbox/<x>.md` → expect 400 with "invalid-promote-source" or similar (reverse promotion blocked).

Evidence:
- File listing showing move.
- Audit row id.

### PROC-034 — Knowledge tab — concurrent edit silent overwrite (CONFIRMED gap)

Role:       Two customer-admins on same wiki page
Maps to:    WF-XAC-006, GAP-FLOW-concurrent-edit-001
Expected:   EXPECTED TO FAIL — GAP-FLOW-concurrent-edit-001 (silent overwrite)
Preconds:   Two browser contexts (or two SETUP-CA-HUMINIC sessions in different browsers)

Steps:
1. Browser A: open `huminic/knowledge/drafts/concurrent-test.md` in editor.
2. Browser B (incognito): open the same file in the editor.
3. Browser A: type "version A" + save.
4. Browser B: without refreshing, type "version B" + save.
5. Reload both browsers.

Expected outcome (current bad behavior):
- File contains "version B" only. No conflict prompt shown to Browser A user.
- No audit warning.

Expected outcome (post-fix):
- Browser B's save should fail with verdict "conflict — file modified by another user; reload and re-apply your changes" OR similar conflict-prompt UI.

Evidence:
- File contents after both saves.
- Screenshots of both browser tabs at save time.

### PROC-035 — Tools / Widget — list widgets + edit one

Role:       Customer-admin
Maps to:    WF-CA-004
Expected:   PASS
Preconds:   SETUP-CA-HUMINIC

Steps:
1. Click "Tools" → "Widget" sub-page.
2. List of widgets renders with: name, status (`ready` / `missing-file` / `misconfigured`), preview iframe, embed snippet, edit form.
3. Click a widget → edit greeting / accent color / agent assignment.
4. Save.

Expected outcome:
- KSG runs (same rules as Knowledge).
- File updated at `huminic/knowledge/widgets/<slug>.md`.

Negative test:
- Edit a widget to assign an agent NOT on the profile → expect KSG block or schema validation error.

Evidence:
- Screenshot: 035-widget-edit.png
- File path written.

### PROC-036 — Tools / Widget — public /w/<slug> renders unauthenticated

Role:       Anonymous visitor
Maps to:    WF-CA-004 (public path)
Expected:   PASS (if a public widget exists)
Preconds:   SETUP-FRESH

Steps:
1. From customer-admin session, note a widget slug from huminic (e.g., `huminic-hero`).
2. Clear browser session (SETUP-FRESH).
3. Navigate to `https://studio.huminic.app/w/<widget-slug>` in incognito.

Expected outcome:
- Widget renders without authentication.
- Mode (chat/voice/video/form) per the widget's frontmatter.

Negative test:
- Navigate to `/w/non-existent-widget` → expect 404 or "widget not found" page.

Evidence:
- Screenshot: 036-public-widget.png

### PROC-037 — Data tab — disabled tile, no interaction

Role:       Customer-admin
Maps to:    WF-CA-001 (sub-flow)
Expected:   PASS (tile is disabled)
Preconds:   SETUP-CA-HUMINIC

Steps:
1. Click "Data" tab.
2. Observe.

Expected outcome:
- Tile is dimmed / marked DISABLED.
- Clicking shows informational message OR is non-clickable.
- NO dashboard renders.

Evidence:
- Screenshot: 037-data-disabled.png

### PROC-038 — Comms tab — three-column inbox + thread list (when threads exist)

Role:       Customer-admin
Maps to:    WF-CA-005, WF-CMS-001, WF-CMS-005
Expected:   PASS (UI) / BLOCKED — OP-002 (outbound dispatch)
Preconds:   SETUP-CA-HUMINIC

Steps:
1. Click "Comms" tab.
2. Three-column layout renders: segment switcher (Sales | Service) — thread list — thread detail.
3. If threads exist: click a thread → detail view renders with channel chips, contact card, assigned-agent badge.
4. Try outbound: composer → pick channel → send.

Expected outcome (UI):
- Layout renders.
- Segment switching changes the thread list.

Expected outcome (outbound):
- If channel adapter is unconfigured (OP-002), composer returns verdict like "channel unconfigured" — not a crash.

Evidence:
- Screenshot: 038-comms-layout.png
- Audit row id from the send attempt.

### PROC-039 — Campaigns tab — Service template list + audience builder

Role:       Customer-admin
Maps to:    WF-CA-006, WF-CMS-006
Expected:   PASS (UI) / BLOCKED — OP-002 (real send)
Preconds:   SETUP-CA-HUMINIC

Steps:
1. Click "Campaigns" tab.
2. Service sub-page renders with template picker (Service Recall / Service Due / Follow-up Lead).
3. Click "New campaign" → builder opens.
4. Build audience (DSL filter), preview, schedule send.

Expected outcome:
- Campaign created in `campaigns` table (verify via direct DB query if accessible OR via `/audit`).
- If schedule_at is past: worker tick should dispatch — but if OP-002 credentials missing, dispatch returns unconfigured.

Evidence:
- Screenshot: 039-campaigns-builder.png

---

# Category E — Wiki edit gates (additional KSG/DSG procedures)

### PROC-040 — KSG canonical-frozen denial

Role:       Customer-admin
Maps to:    WF-KSG-002
Expected:   PASS (block fires)
Preconds:   SETUP-CA-HUMINIC, a published page exists with `status: canonical` frontmatter

Steps:
1. Direct API: try to save over an existing canonical page via `/api/customer/wiki/save`.

Expected outcome:
- 400 with verdict like "canonical-frozen: cannot rewrite published page with status=canonical".

Evidence:
- curl response body.
- Audit row id.

### PROC-041 — KSG missing-frontmatter denial

Role:       Customer-admin
Maps to:    WF-KSG-003
Expected:   PASS (block fires)
Preconds:   SETUP-CA-HUMINIC

Steps:
1. Direct API: save a file with no frontmatter or missing required fields (`type`, `status`, `title`).

Expected outcome:
- 400 with verdict like "missing-frontmatter: required fields type, status, title".

Evidence:
- curl response body.

### PROC-042 — DSG cross-tenant Brain write denial

Role:       Any agent on profile A trying to write to profile B's Brain
Maps to:    WF-DSG-001
Expected:   EXPECTED TO FAIL via UI walk (no UI to attempt this) — validate via API / vitest reference
Preconds:   Read access to vitest results

Steps:
1. Run: `pnpm test src/test/dsg-gate.test.ts --run` (or equivalent).
2. Verify all DSG tests pass.
3. Optionally: in a Studio admin chat session against profile huminic, try to dispatch an MCP tool call that writes to `strukture/brain/brain.db`.

Expected outcome:
- vitest passes.
- Live MCP call: returns "cross-tenant write denied" verdict.

Evidence:
- vitest output.
- Audit row id from live MCP attempt.

### PROC-043 — DSG lookup-miss assumption surfacing

Role:       Agent
Maps to:    WF-DSG-003
Expected:   PASS (per vitest at Tranche A); LIVE walk BLOCKED — requires consultative agent dispatch with curated miss
Preconds:   Read access to vitest results

Steps:
1. Run: `pnpm test src/test/tranche-a.test.ts --run` (or whichever covers lookup-miss).
2. Verify pass.

Expected outcome:
- vitest passes.

Evidence:
- vitest output.

### PROC-044 — KSG integrity scanner (not built)

Role:       KSG agent (cron-triggered)
Maps to:    WF-KSG-005, GAP-KSG-SCANNER-001
Expected:   EXPECTED TO FAIL — GAP-KSG-SCANNER-001

Steps:
1. Look for `src/server/ksg-scanner.ts` in the repo → expect file not present.
2. Look for `cron/ksg-scan.yaml` per profile on production volume → expect file not present.
3. Look for `POST /api/webhooks/ksg-scan/<profile>` route → expect 404.

Expected outcome:
- All three absent. GAP-KSG-SCANNER-001 confirmed open.

Evidence:
- `git ls-files src/server/ksg-scanner.ts` (empty output).
- `docker exec hermes-agent-... ls /root/.hermes/profiles/huminic-data-governor/cron/` (likely empty or missing).
- `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://studio.huminic.app/api/webhooks/ksg-scan/huminic`.

---

# Category F — Consultative engagement

### PROC-050 — Dispatch consultative agent (seed engagement-state.yaml at draft)

Role:       Consulting human operator
Maps to:    WF-CHO-001, WF-CON-001, GAP-FLOW-engagement-seed-001
Expected:   EXPECTED TO FAIL via UI button — GAP-FLOW-engagement-seed-001
            PASS via CLI/file-edit workaround
Preconds:   SETUP-ADMIN

Steps (UI path — EXPECTED TO FAIL):
1. Navigate to `/engagements`.
2. Look for a "New engagement" or "Seed" button.
3. Result: no such button.

Steps (CLI workaround):
1. `docker exec -it hermes-agent-... bash -c 'mkdir -p /root/.hermes/profiles/test-engagement-prospect/knowledge/inbox && cp /root/.hermes/profiles/huminic/engagement-state.yaml /root/.hermes/profiles/test-engagement-prospect/engagement-state.yaml'`.
2. Edit the new file's customer name + customer_profile_slug.

Expected outcome:
- File seeded at stage `draft`. Visible in `/engagements` overview after refresh.

Evidence:
- Screenshot of `/engagements` showing the new card.

### PROC-051 — Walk six-phase consultative method (orient → audit → design → author → validate → package)

Role:       Consultative agent (relayed through consulting human)
Maps to:    WF-CON-001 through WF-CON-005
Expected:   PASS (sub-procedures) / BLOCKED — requires LLM dispatch + curated customer fixture

Steps:
1. Switch active profile to `consultative-agent`.
2. Open new chat session.
3. Hand the agent a goal: "Begin orient phase for customer-profile `test-engagement-prospect`. Customer is `Test Engagement Prospect`, primary channel is email."
4. Observe each phase output in `/files` under `test-engagement-prospect/knowledge/inbox/` and `drafts/`.

Expected outcome:
- Six prescription artifacts (client wiki, agentic-design, data-storage spec, MCP-access spec, KSG spec, DSG spec).
- engagement-state.yaml advances draft → gathering_data → ... → ready_to_run.
- Readiness gates proposed.

Negative test:
- Mid-phase: tell the agent to skip a phase → it should refuse OR document the skip explicitly.

Evidence:
- File listing of the six artifacts.
- Screenshot of engagement-state advancement in `/engagements`.

### PROC-052 — Approve readiness gate

Role:       Operator
Maps to:    WF-CHO-004, WF-OP-003 (sub-flow)
Expected:   PASS
Preconds:   SETUP-ADMIN, an engagement with a pending gate

Steps:
1. Open `/engagements/<customer>` detail view.
2. Click a pending gate's status badge.
3. Click "Approve".
4. Enter approver name + notes (note: `topology_decided` gate omits notes).
5. Submit.

Expected outcome:
- Gate flips `approved: true` in engagement-state.yaml.
- Approver name + role + timestamp + notes captured.

Negative test:
- Approve a gate using the consultative-agent profile (which lacks operator role) → should be rejected.

Evidence:
- File diff of engagement-state.yaml.
- Audit row id.

### PROC-053 — SOUL ↔ engine drift check (consultative)

Role:       Operator
Maps to:    WF-CON-005, GAP-CONSULTATIVE-DRIFT-001
Expected:   EXPECTED TO INVESTIGATE — GAP-CONSULTATIVE-DRIFT-001

Steps:
1. Read SOUL: `cat ~/.hermes/profiles/consultative-agent/SOUL.md` (via docker exec).
2. Read engine: `cat src/server/consultative-engine.ts | head -150`.
3. Compare claims in SOUL (six phases, deployment-notes mandate, scope contract, K↔B contract, lookup-miss) against engine behavior (advanceEngagementStage call at line 127, phaseToStage mapping).

Expected outcome:
- Document any drift in a `DEC` entry in `DECISIONS.log`.
- Drift may be ZERO (SOUL = engine) or non-zero. Either way, document.

Evidence:
- Diff or text summary of drift findings.

### PROC-054 — Performance engagement variant (not implemented)

Role:       Performance engagement consultative agent
Maps to:    WF-PCO-001, WF-PCO-002, WF-PCO-003, GAP-PERF-CONSULTATIVE-001, GAP-ENG-STATE-PERF-001
Expected:   EXPECTED TO FAIL — GAP-PERF-CONSULTATIVE-001 + GAP-ENG-STATE-PERF-001

Steps:
1. Look for a `runPerformancePass(profile)` entry in `src/server/consultative-engine.ts`.
2. Look for `performance_review` stage in `src/lib/engagement-state.ts` schema.
3. Both should be absent.

Expected outcome:
- Confirmed both gaps as documented.

Evidence:
- grep output showing absences.

---

# Category G — Comms (inbound + outbound per channel)

### PROC-060 — Inbound email parses + persists to messaging-hub

Role:       Comms substrate
Maps to:    WF-CMS-001
Expected:   PASS (via API contract test)

Steps:
1. POST to `https://studio.huminic.app/api/messaging/inbound`:
   ```
   {"profile":"huminic-motors","channel":"email","domain":"sales","from":"test@example.com","to":"service@huminic-motors.example","subject":"Verifier test","body":"Test inbound","external_id":"verifier-${RANDOM}"}
   ```

Expected outcome:
- 200 OK with `{"ok": true, "thread_id": "..."}` OR 4xx with deterministic verdict (if schema rejection).
- New row in `messaging-hub.db` `threads` table.

Negative test:
- Same payload with missing required field → 400/422 with field-name in verdict.

Evidence:
- curl response.
- Thread id captured.

### PROC-061 — Inbound email-ADF parses + extracts lead_meta

Role:       Comms substrate
Maps to:    WF-CMS-001 (sub-flow), WF-XAC-004
Expected:   PASS (per vitest at AC.6.7)

Steps:
1. Run: `pnpm test src/test/adf-xml.test.ts --run`.
2. Verify all 5 ADF tests pass.

Expected outcome:
- vitest passes.
- isAdfXml() detects ADF; parseAdfXml() extracts prospect/customer/contact/vehicle/trade/comments.

Evidence:
- vitest output.

### PROC-062 — Inbound SMS via TextMagic (real adapter)

Role:       Comms substrate
Maps to:    WF-CMS-002, WF-RT-002
Expected:   BLOCKED — OP-002 (TextMagic credentials)

Steps:
1. Verify per-dealer .env has TEXTMAGIC_API_KEY + TEXTMAGIC_USERNAME set on production volume.
2. If set: send a test SMS to the dealer's TextMagic number from a real phone.
3. Observe inbound thread in Comms.

Expected outcome (if credentials present):
- Thread created with channel=sms, domain=sales or service.

Expected outcome (today):
- Credentials NOT present for 10 launch dealers (only huminic-motors has live channel adapter for Vapi). BLOCKED.

Evidence:
- ls of dealer .env files (without exposing secrets).

### PROC-063 — Inbound Vapi voice + ADF email outbound (Elliott live)

Role:       Comms substrate + Elliott runtime agent
Maps to:    WF-CMS-003, WF-RT-001, WF-XAC-004
Expected:   PASS at huminic-motors / BLOCKED at other dealers — OP-002 + OP-004

Steps:
1. Verify Vapi assistant config in central-mcp + huminic-motors .env.
2. Make a test call to the huminic-motors Vapi number from a real phone.
3. Observe transcript persistence + ADF email outbound to DMS.

Expected outcome:
- Transcript appears in Comms (channel=vapi, domain=service).
- ADF email dispatched (verify via Resend dashboard OR audit log).

Evidence:
- Audit row ids.
- Transcript snippet.

### PROC-064 — Inbound Tavus video (either real or hidden per HTC-NX-004)

Role:       Comms substrate
Maps to:    WF-CMS-004
Expected:   BLOCKED — OP-002 / SURFACE-HIDDEN per HTC-NX-004 disposition

Steps:
1. Look for Tavus widget mode in widget editor.
2. If hidden: verify widget mode dropdown does NOT include `video` OR Tavus is greyed out.

Evidence:
- Screenshot of widget mode dropdown.

### PROC-065 — Outbound rate-cap enforcement

Role:       Comms substrate
Maps to:    WF-CMS-005
Expected:   PASS

Steps:
1. From Studio admin chat, invoke MCP tool `comms_send_email` 5+ times in rapid succession to test rate cap.

Expected outcome:
- After rate-cap threshold: subsequent calls return verdict with `rate_cap_denied`.

Evidence:
- Audit rows showing the denial.

### PROC-066 — Outbound allowlist enforcement

Role:       Comms substrate
Maps to:    WF-CMS-005
Expected:   PASS

Steps:
1. From Studio admin chat, invoke MCP tool `comms_send_email` to a recipient NOT in the profile's allowlist.

Expected outcome:
- Returns verdict `allowlist_denied`.

Evidence:
- Audit row id.

---

# Category H — Federation + Rollup

### PROC-070 — Federation deny path (no scope)

Role:       Agent in profile A trying to read profile B's data
Maps to:    WF-FED-001
Expected:   PASS (deny fires)

Steps:
1. From profile A's MCP token, call `federated_search` against profile B's scope.

Expected outcome:
- Returns verdict `federation_scope_not_authorized` or similar.

Evidence:
- Response body + audit row id.

### PROC-071 — Federation authorized (real data path)

Role:       Operator
Maps to:    WF-FED-002
Expected:   BLOCKED — requires a target profile with `federation.read_scopes` declaring the caller

Steps:
1. In target profile's `studio.yaml`, add a `federation.read_scopes` entry naming the caller.
2. Caller invokes `federated_search` with the scope name.

Expected outcome:
- Authorized read returns data; audit row recorded.

Evidence:
- studio.yaml diff.
- Response body.

### PROC-072 — Federation MindsDB shim ("not configured")

Role:       Operator
Maps to:    WF-FED-003
Expected:   EXPECTED TO FAIL via real query — OP-003

Steps:
1. Invoke `federated_search` with a MindsDB-targeted query (e.g., `source=mindsdb`).

Expected outcome:
- Returns `{"error": "MindsDB not configured", "note": "OP-003 sidecar deployment required"}`.

Evidence:
- Response body.

### PROC-073 — Rollup deny path (no parent scope)

Role:       Token holder without rollup:huminic scope
Maps to:    WF-RLP-001, WF-RLP-002
Expected:   PASS (deny fires)

Steps:
1. Invoke `mcp_rollup_query` with `parent=huminic` from a token lacking `rollup:huminic` scope.

Expected outcome:
- Returns `{"error": "rollup scope required", "missing_scope": "rollup:huminic"}`.

Evidence:
- Response body.

### PROC-074 — Rollup authorized (real data path)

Role:       Operator with rollup:huminic scope
Maps to:    WF-RLP-001
Expected:   PASS (if child profiles have data)

Steps:
1. Use a token with `rollup:huminic` scope.
2. Invoke `mcp_rollup_query` with `parent=huminic`, `query=count messages per child per day`.

Expected outcome:
- Aggregated rows returned. Audit row with `action_type=ROLLUP_QUERY`.

Evidence:
- Response body (counts).
- Audit row id.

### PROC-075 — Rollup dashboard UI (deferred)

Role:       Operator
Maps to:    WF-RLP-003
Expected:   EXPECTED TO FAIL — SRS-E disposition (post-launch)

Steps:
1. Look for `/rollup` route or similar dashboard.

Expected outcome:
- Route does NOT exist; operator queries via MCP only.

Evidence:
- 404 response body.

---

# Category I — Runtime agents

### PROC-080 — Elliott live (huminic-motors)

Role:       Elliott runtime agent
Maps to:    WF-RT-001
Expected:   PASS (live at huminic-motors) — covered by PROC-063

Already covered above. Cross-reference PROC-063.

### PROC-081 — Caroline / other per-dealer agents (templates)

Role:       Caroline, lead-follow-up, lead-response, service, crm-data-guru, sales-coach, communication-writer, photo-studio, video-producer, copywriter, market-intel, creative-director
Maps to:    WF-RT-002 through WF-RT-005
Expected:   EXPECTED TO FAIL — templates ship enabled:false, no per-dealer instantiation

Steps:
1. Check each template at `docs/launch/agent-souls/templates/<agent>.md`.
2. Verify `enabled: false` in frontmatter.
3. Verify per-dealer Caroline, etc., do NOT appear in any dealer's agent picker.

Expected outcome:
- All 13 templates exist in repo.
- None enabled at any dealer.

Evidence:
- File listing.
- Screenshot of agent picker on a dealer storefront showing the absence.

---

# Category J — Cross-actor handoffs

### PROC-090 — Consultative → Provisioner → customer-admin login (full chain)

Role:       Consulting human → Operator → Customer-admin
Maps to:    WF-XAC-001
Expected:   EXPECTED TO FAIL via single dispatch — GAP-PROV-001 + GAP-CUSTOMER-INVITE-001
            PASS via multi-step manual workaround (PROC-020 + script-based invite)

Steps:
1. Run PROC-051 (consultative phases) against a test prospect.
2. Run PROC-052 (gate approvals).
3. Run PROC-020 (script-based provisioning).
4. Run PROC-004 (customer-admin login).

Expected outcome:
- End-to-end works if you walk all 4 sub-procedures.
- No single-dispatch UI to do this.

Evidence:
- Cross-reference each sub-procedure's evidence.

### PROC-091 — Promote with operator approval (today: no approval gate)

Role:       Customer-admin → Operator
Maps to:    WF-XAC-002, GAP-FLOW-operator-promote-approval-001
Expected:   EXPECTED TO BE OBSERVED — today customer-admin owns published wiki (operator decision pending)

Steps:
1. Customer-admin runs PROC-033 (promote).
2. Observe: does the promote land in `published/` immediately, or does it queue for operator approval?

Expected outcome (today):
- Lands immediately. No queued-approval flow.

Evidence:
- File state immediately after promote.

### PROC-092 — Runtime agent draft → DSG → Comms rate-cap → adapter → audit (full chain)

Role:       Runtime agent (e.g., Caroline)
Maps to:    WF-XAC-003
Expected:   BLOCKED — Caroline not enabled at any dealer; OP-002 credentials

Steps:
1. Enable a test Caroline instance.
2. Inject test inbound SMS.
3. Observe agent reply chain.

Expected outcome:
- BLOCKED today. Requires per-dealer enablement.

Evidence:
- Notes only.

### PROC-093 — KSG conflict → DSG reconcile → operator approval

Role:       Agent + DSG + Operator
Maps to:    WF-XAC-005
Expected:   PASS via vitest (reconciliation.test.ts) / BLOCKED for live walk — requires curated conflict fixture

Steps:
1. Run `pnpm test src/test/reconciliation.test.ts --run`.

Expected outcome:
- vitest passes.

Evidence:
- vitest output.

---

# Category K — Failure & recovery

### PROC-100 — Channel adapter unreachable retry

Role:       Comms substrate
Maps to:    WF-F&R-001, GAP-FLOW-retry-policy-001
Expected:   EXPECTED TO INVESTIGATE — GAP-FLOW-retry-policy-001

Steps:
1. Read `gateway/platforms/<channel>.py` adapters in production repo.
2. Look for explicit retry policy fields (max_attempts, backoff, deadletter).

Expected outcome:
- Policy is ad-hoc per adapter. Document where consistent + where missing.

Evidence:
- Code excerpts.

### PROC-101 — KSG blocked save recovery

Role:       Customer-admin
Maps to:    WF-F&R-002
Expected:   PASS (already covered by PROC-032)

Already covered. Cross-reference PROC-032.

### PROC-102 — Engagement abandoned (no terminal stage)

Role:       Consulting human / Operator
Maps to:    WF-F&R-003, GAP-ENG-STATE-ABANDON-001
Expected:   EXPECTED TO FAIL — GAP-ENG-STATE-ABANDON-001

Steps:
1. Read `src/lib/engagement-state.ts` zod schema.
2. Verify enumerated stages: draft, gathering_data, solution_discovery, creation, submission, feedback, ready_to_run. No `abandoned` stage.

Expected outcome:
- No `abandoned` stage. Workaround documented in consulting-human-operator-guide.md Section 8.

Evidence:
- Schema excerpt.

### PROC-103 — Provisioner partial fail recovery

Role:       Operator
Maps to:    WF-F&R-004, GAP-PROV-001
Expected:   EXPECTED TO FAIL — GAP-PROV-001 (Provisioner not built); script-idempotency partial workaround

Steps:
1. Run `scripts/provision-launch-profiles.ts` twice with the same slug.
2. Verify second run is idempotent (no errors, no corruption).

Expected outcome:
- Script handles idempotent re-run cleanly.

Evidence:
- Script output (first + second run).

### PROC-104 — Password reset token rate-limit + expiry

Role:       Customer-admin
Maps to:    WF-F&R-005
Expected:   PASS

Steps:
1. Send 4 rapid reset requests for the same email.
2. Verify at least one returns 429 (rate-limited 3/min/IP).
3. Generate a token, wait 16 minutes, attempt redemption.
4. Verify expired-token verdict.

Expected outcome:
- Rate limit enforced + expiry enforced.

Evidence:
- HTTP status codes for the 4 requests.
- Response body for expired redemption.

### PROC-105 — Coolify deploy verification endpoints

Role:       Operator
Maps to:    WF-F&R-006, WF-OP-006
Expected:   PASS (endpoints return JSON)

Steps:
1. `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://studio.huminic.app/api/auth-session`.
2. `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://studio.huminic.app/api/plugins`.

Expected outcome:
- Both return JSON content-type. Status may be 200 or 401 depending on auth state.

Evidence:
- Status codes + content-types.

### PROC-106 — DSG stale reconciliation surface (manual sweep at launch)

Role:       Operator
Maps to:    WF-F&R-007, GAP-FLOW-stale-reconciliation-001
Expected:   EXPECTED TO FAIL — GAP-FLOW-stale-reconciliation-001 (no auto-timeout)

Steps:
1. Check each `/engagements/<customer>` panel for reconciliation candidates.
2. Document any sitting unapproved beyond 7 days.

Expected outcome:
- Manual sweep is the only path. No auto-timeout UI.

Evidence:
- Screenshot of any stale candidates found.

---

# Category L — Negative tests (security boundaries)

### PROC-110 — Cross-tenant access attempt (UI)

Role:       Customer-admin on profile A
Maps to:    HTC-SR-002
Expected:   PASS (denied)

Steps:
1. Log in as customer-admin on profile A (e.g., huminic-motors).
2. Navigate to `/p/strukture/chat`.

Expected outcome:
- Redirected to strukture's login form, NOT authenticated as strukture customer-admin.

Evidence:
- Screenshot of strukture login form.

### PROC-111 — Token scope violation

Role:       MCP token holder
Maps to:    HTC-SR-003, WF-FED-001
Expected:   PASS (denied)

Already covered by PROC-070 / PROC-073.

### PROC-112 — Anonymous to admin route protection

Role:       Anonymous
Maps to:    HTC-SR-004
Expected:   PASS (auth required)

Steps:
1. Without authentication, navigate to `/engagements`, `/agents`, `/profiles`, `/mcp-tokens`, `/files`, `/tasks`, `/audit`.

Expected outcome:
- Login form OR redirect to login. No admin content rendered.

Evidence:
- Screenshots per route.

### PROC-113 — Pen-test sweep (F.9 — 13 vectors)

Role:       Security
Maps to:    HTC-SR-008
Expected:   PASS (per Tranche F.9 verification — all 13 vectors blocked)

Steps:
1. Re-run the F.9 pen-test suite.
2. Verify 13/13 blocked.

Evidence:
- Test output.

---

# Category M — P-FIX live re-verifications

### PROC-120 — P-FIX-001 (HermesOnboarding overlay) — re-verify on fresh state

Role:       Anonymous visitor
Maps to:    P-FIX-001 re-verification
Expected:   PASS (overlay should NOT appear)
Preconds:   SETUP-FRESH on every storefront tested

Steps:
1. SETUP-FRESH.
2. Navigate to `/p/huminic-motors/`. Verify NO HermesOnboarding modal.
3. SETUP-FRESH.
4. Navigate to `/p/serra-honda/`. Verify NO HermesOnboarding modal.
5. SETUP-FRESH.
6. Navigate to `/`. Verify NO HermesOnboarding modal.

Expected outcome:
- No "Welcome to Huminic Studio / Connect Backend / Skip setup" dialog overlays the page on any of the 3 surfaces.

Evidence:
- Fresh screenshots for each.

### PROC-121 — P-FIX-002 (/reset shell wrap) — re-verify

Role:       Anonymous visitor
Maps to:    P-FIX-002 re-verification
Expected:   PASS

Already covered by PROC-006.

### PROC-122 — P-FIX-003 (huminic-motors schema fallback) — re-verify

Role:       Anonymous visitor
Maps to:    P-FIX-003 re-verification
Expected:   PASS

Already covered by PROC-002 + PROC-021.

---

# Category N — Phase 8 sweep gap verifications

### PROC-130 — GAP-AUTH-HYDRATION-SPLASH-001 — transient splash overlay

Role:       Anonymous visitor
Maps to:    GAP-AUTH-HYDRATION-SPLASH-001
Expected:   EXPECTED TO FAIL — splash overlays login form for ~3s during hydration on auth-gated admin routes
Preconds:   SETUP-FRESH

Steps:
1. Navigate to `/engagements` (unauthenticated).
2. IMMEDIATELY take screenshot (within first 500ms).
3. Wait 3 seconds.
4. Take a second screenshot.

Expected outcome:
- First screenshot: "h Huminic Studio" splash overlay over a greyed login form.
- Second screenshot: clean login form, no overlay.

Evidence:
- Both screenshots saved.

### PROC-131 — GAP-CSP-META-001 — frame-ancestors via meta is ignored

Role:       Anonymous visitor
Maps to:    GAP-CSP-META-001
Expected:   EXPECTED TO FAIL — CSP delivered via meta

Steps:
1. Navigate to any storefront page.
2. Open DevTools console.
3. Observe error: `The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.`

Evidence:
- Screenshot of console error.

### PROC-132 — GAP-API-CONNECTION-STATUS-500 — endpoint returns 500 not 401

Role:       Anonymous
Maps to:    GAP-API-CONNECTION-STATUS-500
Expected:   EXPECTED TO FAIL — 500 instead of 401

Steps:
1. `curl -s -o /dev/null -w "%{http_code}\n" https://studio.huminic.app/api/connection-status`.

Expected outcome:
- 500 returned (should be 401 for unauthenticated).

Evidence:
- HTTP status code.

### PROC-133 — GAP-CONSOLE-001 — Google Fonts CSP block + React #418

Role:       Anonymous visitor
Maps to:    GAP-CONSOLE-001
Expected:   EXPECTED TO FAIL — known browser-console warnings

Steps:
1. Navigate to `/chat/new` or any page.
2. Observe console errors.

Expected outcome:
- `Loading the stylesheet 'https://fonts.googleapis.com/...' violates the following Content Security Policy directive`.
- `Minified React error #418` on chat route.

Evidence:
- Console capture.

### PROC-134 — GAP-PROBE-SIDE-EFFECT-001 — readiness probe mutates state

Role:       Anonymous (or scripted)
Maps to:    GAP-PROBE-SIDE-EFFECT-001
Expected:   EXPECTED TO FAIL — GET mutates state

Steps:
1. Pick a slug that doesn't exist as a profile yet (use a random suffix).
2. `curl -s "https://studio.huminic.app/api/brain/readiness?profile=probe-test-${RANDOM}"`.
3. Verify the brain dir + brain.db get created on the production volume (`docker exec hermes-agent-... ls /root/.hermes/profiles/probe-test-<suffix>/brain/`).
4. After verification, cleanup: `docker exec hermes-agent-... rm -rf /root/.hermes/profiles/probe-test-<suffix>/`.

Expected outcome:
- Brain dir + brain.db created from a GET request (mutation).

Evidence:
- ls output before + after.

---

# Category O — Test infrastructure

### PROC-140 — vitest suite green

Role:       Verifier
Expected:   PASS

Steps:
1. From repo root: `pnpm test --run 2>&1 | tail -10`.

Expected outcome:
- 512 / 512 passing (or whatever the current count is). No failures.

Evidence:
- Test output tail.

### PROC-141 — Playwright workflow suite green

Role:       Verifier
Expected:   PASS (16 pass, 49 fixme, 0 fail)

Steps:
1. `pnpm exec playwright install chromium` (if not already).
2. `pnpm exec playwright test tests/e2e/workflows/ --reporter=line 2>&1 | tail -5`.

Expected outcome:
- 16 passed, 49 skipped (.fixme audit markers), 0 failed.

Evidence:
- Test output.

### PROC-142 — Playwright build clean

Role:       Verifier
Expected:   PASS

Steps:
1. `pnpm build 2>&1 | tail -5`.

Expected outcome:
- No errors. dist/ generated.

Evidence:
- Build output tail.

---

# Category P — Repo verification (Phase 8 deliverables present)

### PROC-150 — Phase 8 artifacts present in branch

Role:       Verifier
Expected:   PASS

Steps:
1. `git checkout feature/phase-8-closeout`.
2. Verify presence: `ls -la docs/launch/ROLES.md docs/launch/WORKFLOWS.md docs/launch/TRIAGE.md docs/launch/PROCEDURAL_TEST_SCRIPT.md`.
3. Verify manuals: `ls docs/launch/manuals/` should list 5 files.
4. Verify SOULs: `find docs/launch/agent-souls -name "*.md" | wc -l` should be ≥ 22 (1 README + 1 Provisioner + 7 governors + 13 templates).
5. Verify Playwright suite: `ls tests/e2e/workflows/*.spec.ts | wc -l` should be 10.
6. Verify evidence: `ls docs/launch/evidence/phase8-headed-sweep/` should show 6 screenshots + REPORT.md.

Expected outcome:
- All present at the expected counts.

Evidence:
- Listing outputs.

### PROC-151 — Mermaid diagrams present in each manual + SOUL

Role:       Verifier
Expected:   PASS

Steps:
1. For each manual: `grep -l '```mermaid' docs/launch/manuals/*.md | wc -l` should be 5.
2. For each SOUL: `grep -l '```mermaid' docs/launch/agent-souls/**/*.md | wc -l` should be ≥ 21.

Evidence:
- Counts.

### PROC-152 — DECISIONS.log entries for Phase 8

Role:       Verifier
Expected:   PASS

Steps:
1. `grep '### 2026-06-01\|### 2026-06-02' docs/launch/DECISIONS.log`.
2. Verify entries: phase-8-session-start ACK, phase-8-branch-not-main, verifier-handoff-rules.

Evidence:
- grep output.

---

# Procedures NOT in scope for this verification pass

Per operator directive:
- Devil's Advocate teammate (post-launch).
- Integrity scanner cron (post-launch — GAP-KSG-SCANNER-001).
- Formal continuous-audit framework (post-launch).

These are NOT to be built or verified in this pass.

---

# .fixme cross-reference table

For audit completeness, every .fixme in `tests/e2e/workflows/` maps to one or more procedures above. Verifier walks each .fixme manually via the corresponding procedure:

| .fixme location | Maps to procedure |
|---|---|
| 01-operator.spec.ts WF-OP-002 | PROC-033 (via API workaround) + PROC-091 |
| 01-operator.spec.ts WF-OP-004 | PROC-020 |
| 01-operator.spec.ts WF-OP-007 | PROC-007 |
| 02-consulting-human.spec.ts WF-CHO-001 | PROC-050 |
| 02-consulting-human.spec.ts WF-CHO-004 | PROC-052 |
| 02-consulting-human.spec.ts WF-CHO-005 | PROC-090 |
| 03-customer-admin.spec.ts WF-CA-002 | PROC-030 |
| 03-customer-admin.spec.ts WF-CA-003 | PROC-031, PROC-032 |
| 03-customer-admin.spec.ts WF-CA-004 | PROC-035, PROC-036 |
| 03-customer-admin.spec.ts WF-CA-005 | PROC-038 |
| 03-customer-admin.spec.ts WF-CA-006 | PROC-039 |
| 03-customer-admin.spec.ts WF-CA-008 | PROC-022 |
| 04-consultative-agent.spec.ts WF-CON-001..005 | PROC-051, PROC-053 |
| 05-runtime-agents.spec.ts WF-RT-001 | PROC-063, PROC-080 |
| 05-runtime-agents.spec.ts WF-RT-002..005 | PROC-081 |
| 06-comms.spec.ts WF-CMS-002 | PROC-062 |
| 06-comms.spec.ts WF-CMS-003 | PROC-063 |
| 06-comms.spec.ts WF-CMS-004 | PROC-064 |
| 06-comms.spec.ts WF-CMS-006 | PROC-039 |
| 07-federation-rollup.spec.ts WF-FED-002 | PROC-071 |
| 07-federation-rollup.spec.ts WF-FED-003 | PROC-072 |
| 07-federation-rollup.spec.ts WF-RLP-002 | PROC-073 (negative variant) |
| 07-federation-rollup.spec.ts WF-RLP-003 | PROC-075 |
| 08-ksg-dsg.spec.ts WF-KSG-002..005 | PROC-040, PROC-041, PROC-044 |
| 08-ksg-dsg.spec.ts WF-DSG-001..005 | PROC-042, PROC-043, PROC-093 |
| 09-cross-actor.spec.ts WF-XAC-001..006 | PROC-090, PROC-091, PROC-092, PROC-093, PROC-034 |
| 10-failure-recovery.spec.ts WF-F&R-001 | PROC-100 |
| 10-failure-recovery.spec.ts WF-F&R-003 | PROC-102 |
| 10-failure-recovery.spec.ts WF-F&R-004 | PROC-103 |
| 10-failure-recovery.spec.ts WF-F&R-007 | PROC-106 |

Every .fixme is covered by at least one procedure.

---

# Verifier deliverable

You write `docs/launch/VERIFICATION_REPORT.md` with:

1. **Header** — start timestamp, branch SHA verified, Playwright MCP session id.
2. **Per-procedure row** — for every PROC-NNN above: PASS / FAIL / BLOCKED / KNOWN-GAP, plus evidence path or note.
3. **NEW GAP rows you added to PLAN.md** — each FAIL gets a new `GAP-VER-NNN` row by you (verifier).
4. **Disagreements section** — anywhere the live system contradicted a prior agent claim or commit-message claim. Cite the prior claim, your finding, and the integrity reading.
5. **Summary counts** — PASS / FAIL / BLOCKED / KNOWN-GAP totals.

Commit + push to `feature/phase-8-closeout`. Do not merge. Operator merges (or not) after reading your raw report.
