# Blocker Fix Brief — Phase 8 Launch Closeout

**Purpose:** Full execution context for the overnight `/goal` run that fixes the verifier-confirmed launch blockers. The `/goal` string points here so it can stay short. This file is the source of truth for the run; if the goal string and this brief disagree, **this brief wins** unless the operator says otherwise.

**Mode:** Autonomous overnight. Work the list top to bottom. Do not stop for confirmation except at the explicit STOP conditions below.

---

## Branch discipline

- Cut a new branch `feature/phase-8-blocker-fixes` **off `feature/phase-8-closeout`** (not main, not local working branch).
- **One commit per fix, in order**, so the operator can `git revert <sha>` any single fix without cascade.
- Commit message: `Fix GAP-VER-NNN: <one-line what + why>` + a `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` line + a body explaining the root cause and the test/PROC that now passes.
- Push the branch at the end. **Merge nowhere.** The operator reviews the branch and decides what merges up and when.

## Hard rules — NEVER

- Do **not** push to `origin/main`.
- Do **not** trigger a Coolify redeploy (operator-only, per `docs/launch/DECISIONS.log` → `DEC phase-8-branch-not-main`).
- Do **not** use `--no-verify`, `--force`, or `--amend` on already-pushed commits.
- Do **not** refactor surrounding code or introduce new abstractions beyond the fix. Fix the blocker, nothing more.
- Do **not** activate any provider credential in production (Resend / TextMagic / Vapi / Tavus / OPENROUTER) — those are operator-action gates.
- Do **not** run the SOUL deploy script or any production-volume mutation (item 6 ships the script only).

---

## The fixes, in execution order (smallest blast radius first)

### 1. GAP-VER-005 — engagement detail won't render
- **Symptom:** Clicking an engagement card changes the URL but the detail component never mounts.
- **Where:** `routes/engagements.$customer.tsx` (or the equivalent TanStack file), `routeTree.gen.ts` wiring, and the detail component export.
- **Done = ** detail renders the stage strip, the 5 readiness gates, deployment notes, and the build-time + run-time crew rosters.
- **Verify:** PROC-012.

### 2. GAP-VER-003 — password-reset rate-limit not firing
- **Symptom:** 5 rapid POSTs to the reset endpoint all return 200; the 3/min/IP limit never trips.
- **Where:** rate-limit config (likely `src/server/password-reset.ts` or middleware). Wire it into the production reset route and make sure the middleware is registered in server-entry.
- **Verify:** PROC-005 + PROC-104.

### 3. GAP-VER-004 — /agents shows only 8 stock built-ins
- **Symptom:** the new SOULs are invisible in the UI.
- **Where:** the `/agents` endpoint. Enumerate three sources and aggregate them with a column distinguishing source:
  1. profile-distributed SOULs: `<profile>/SOUL.md`
  2. profile agent SOULs: `<profile>/governance/agents/*.md`
  3. custom agents: `~/.runtime/agent-definitions.json`
- **Done = ** page shows more than 8 entries; profile SOULs are visible.
- **Verify:** PROC-011.

### 4. GAP-VER-002 — direct URL nav shows login for authed sessions
- **Symptom:** SPA navigation works, but direct nav / refresh / bookmark to `/profiles`, `/agents`, `/engagements`, `/tasks`, `/audit` shows the login form even when authenticated. Likely the SSR shell does not await the auth-session before deciding what to render.
- **Done = ** direct nav behaves identically to SPA nav.
- **CRITICAL:** this touches the auth-gating shell that contains the **P-FIX-001 and P-FIX-002** fixes. Before committing, re-verify:
  - PROC-120 — HermesOnboarding overlay still absent.
  - PROC-006 — `/reset` still standalone.
- **Verify:** PROC-010 + PROC-130.

### 5. GAP-VER-007 — scripts/ not in the deployed image
- **Symptom:** the CLI workarounds in the manuals fail because `/app/scripts/` doesn't exist in the container.
- **Where:** the Dockerfile (likely `Dockerfile`, `docker/agent/Dockerfile`, or the studio Dockerfile in the Coolify compose). Add `COPY scripts/ /app/scripts/`.
- **Verify the local build only** (`pnpm build` + `docker build` if accessible). **DO NOT trigger a Coolify redeploy.** Commit only.
- Mark PROC-020 / PROC-022 / PROC-103 as **PENDING-COOLIFY-REDEPLOY** in the report.

---

## Second-tier fixes (after all five blockers commit + verify)

### 6. GAP-SG-001 — deploy the 7 governor SOULs (script only)
- Write `scripts/deploy-phase8-souls.sh` that uses `docker cp` to copy each `docs/launch/agent-souls/governors/<slug>-data-governor.md` into `/root/.hermes/profiles/<slug>-data-governor/SOUL.md` on the production volume, creating the profile dir first if missing.
- **COMMIT THE SCRIPT, DO NOT RUN IT** (running it mutates production). Mark the deploy **PENDING-OPERATOR-CONFIRMATION** in the report.

### 7. GAP-VER-001 — UI for /plugins and /mcp-tokens
- Likely couples with the GAP-VER-002 fix. Once direct-nav works, check whether these routes already exist and were just unreachable, or whether they need to be added.
- If adding: wire the sidebar + minimal screens backed by the existing `/api/plugins` endpoint and the MCP token registry.
- If it's substantial work: **stop and document a scope decision** instead of forcing it through.

---

## Per-fix loop (run for every fix)

1. Make the change.
2. Commit (message format above).
3. `pnpm test --run` **AND** `pnpm exec playwright test tests/e2e/workflows/ --reporter=line`. Both must match the VERIFICATION_REPORT.md baseline: **512 vitest pass, 16 Playwright pass, 49 fixme, 0 fail** — plus any new tests you added.
4. Run the mapped PROC-NNN procedure against the live system with your own Playwright MCP session and fresh-state browser. Capture screenshot/curl evidence at `docs/launch/evidence/blocker-fixes/<NNN>/`.
5. If a fix breaks something else and a revert can't recover it: `git revert` the offending commit, document what happened in `DECISIONS.log`, move on.

---

## STOP and write a status report when

- A fix requires a schema migration on a deployed database (not safe without the operator).
- A fix exposes a deeper structural problem (e.g. fixing GAP-VER-004 reveals the SOUL enumeration needs a new MCP scope).
- A PROC-NNN still FAILs after two fix attempts.
- The vitest or Playwright workflow suite regresses and reverting the offending commit can't recover it.
- You discover a NEW launch-blocker not in the verifier report.

In every stop case: surface it, don't chase it.

---

## Keep the manuals honest (drink our own kool-aid)

- Keep the 5 manuals in `docs/launch/manuals/` current with whatever the fixes change.
- Port the manuals into each profile's wiki so the Huminic agents are aware of their own processes and capabilities. The system should be able to read its own operating instructions.

---

## End of run

- Append a **"BLOCKER FIX PASS — <date>"** section to `docs/launch/VERIFICATION_REPORT.md` with a per-blocker outcome: **FIXED / PENDING-COOLIFY-REDEPLOY / PENDING-OPERATOR-CONFIRMATION / STOPPED-WITH-REASON**.
- Append a `DEC` entry to `docs/launch/DECISIONS.log` naming each fix commit (GAP-id → sha).
- Push the branch. Merge nowhere.
- Do **not** re-dispatch the independent verifier — that is the operator's billing + integrity boundary to trigger against `feature/phase-8-blocker-fixes`.

---

## Out of scope (do not build)

Devil's Advocate teammate, integrity-scanner cron, formal continuous-audit framework, KSG integrity scanner, the Provisioner agent itself, Nexxus migration tooling. The LOW-bucket items `GAP-CONSOLE-001` / `GAP-CSP-META-001` / `GAP-API-CONNECTION-STATUS-500` only after all blockers are green.

---

## Context handoff

- **Read first:** `docs/launch/VERIFICATION_REPORT.md` (gap context), `docs/launch/PROCEDURAL_TEST_SCRIPT.md` (verification procedures), `docs/launch/PLAN.md` running log, `docs/launch/DECISIONS.log` (prior decisions + the branch-not-main rule), `docs/launch/manuals/` (what each blocker's workflow should look like).
- **Check first:** memory (`/home/ubuntu/.claude/projects/-home-ubuntu-Claude-store-huminic-studio/memory/`) and git worktrees for plan/state conflicts before starting.
- **Production:** https://studio.huminic.app — admin `duane` / `HuminicValidation2026!`.
- **Containers:** `hermes-studio-…` and `hermes-agent-…` (`docker ps | grep hermes` to find current ids).
- **Evidence discipline:** do NOT trust prior screenshots, REPORT.md entries, or commit messages. Re-verify every claim with your own Playwright MCP session and fresh localStorage, per the `feedback_live_headed_sweep` memory.

## Definition of done (no false "done")

Do not declare the run complete until **every** blocker is closed, the suite is green, the manuals are ported to the wiki, and you can state with no exemptions that Nexxus can be ported to this machine and staff / agents / customers can be onboarded with no hidden gaps. If any of that is not true, say so plainly and stop — a false "done" is worse than an honest "blocked."
