# RESUME STATE — post-compaction handoff (2026-06-02)

This is the authoritative "next session starts here" doc. Read this first on resume.

## Session identity
- **Branch:** `feature/phase-8-blocker-fixes` @ `2d55453a5` (in sync with origin; pushed).
- **Cut from:** `feature/phase-8-closeout`. **17 commits ahead.**
- **Production baseline:** `origin/main` = `34d07f513` — **UNTOUCHED**. Production still runs the pre-fix built image.
- **Working tree:** clean. **Branch tip is green:** `pnpm build` clean · vitest **530 pass** · Playwright workflows **16 pass / 49 fixme / 0 fail**.
- **Stale worktree:** `.claude/worktrees/agent-af966bd9676a32589` (old verifier worktree, branch `worktree-agent-af966bd9676a32589` @ 3ced98db8). Harmless; prune with `git worktree remove` if desired.

## What is DONE on the branch (all committed + pushed, each revertible)
Verifier blockers + second-tier + login/UI + onboarding, every one verified live on a LOCAL build:
- GAP-VER-005 engagement detail (7909e4a79) · GAP-VER-003 reset rate-limit / Caddy IP:port key (223b14a7c) · GAP-VER-004 /agents profile SOULs (baf89473d) · GAP-VER-002 direct-nav auth — re-verified in PASSWORD mode (936615dcf) · GAP-VER-007 scripts+src in image (3e577897a) · GAP-VER-001 /plugins + /mcp-tokens (78babf2c7).
- GAP-SG-001 `scripts/deploy-phase8-souls.sh` — **committed, NOT run** (ebf6b8b11).
- `scripts/port-manuals-to-wiki.sh` — manuals→wiki, **committed, NOT run** (3adbf4a48, hardened 1d8d89ef3).
- LOW-bucket: connection-status 401, CSP frame-ancestors header, Google Fonts CSP (c76e844ac).
- Login UI: high-contrast card + splash dismissed on login mount + mobile-prompt auth-gated (1832e2056); UI audit follow-up: MobileSetupModal restyled, OnboardingTour auth-gated, post-auth contrast (13a3a1f44).
- GAP-PROVISION-SLUG-001: `provision-launch-profiles.ts --slug` single-customer mode (f65544878) — verified: provisioned `onboard-demo`, storefront renders brand, customer-admin authenticates.
- Evidence per gap under `docs/launch/evidence/blocker-fixes/<gap>/`. Full per-blocker table in `VERIFICATION_REPORT.md` ("BLOCKER FIX PASS" + "Follow-up pass" sections). DEC in `DECISIONS.log`.

## NEW capabilities the operator granted (use on resume)
1. **Coolify via central-mcp** — `http://localhost:4002` (HTTP 401 without a token; it IS running). Coolify-scoped bearer tokens are in `~/Claude-store/central-mcp/config/local.yaml` under `auth.tokens:` (entries whose `allowed_providers` include `coolify`). Backed by `docker.huminicdev.com/api/v1`. Use to trigger the studio redeploy + set env vars.
2. **OpenAI key** — present in `~/Claude-store/nexxus2.2_replit/.env` (`OPENAI_API_KEY=`). NOT in personabox. Use to set Hermes inference (OPENAI/OPENROUTER) so agent CHAT returns a real AI reply (the one thing not verifiable locally).

## RESUME PLAN — make the LIVE version work + test it (operator's /goal)
Operator authorized: run the scripts, redeploy, then run the dispatcher + full user-story test suite against LIVE.

0. **DECISION — how Coolify deploys the branch.** Production deploys from `origin/main` (per DECISIONS.log). The branch is NOT on main. Determine via central-mcp/Coolify whether the studio app can deploy a specific branch/commit (point it at `feature/phase-8-blocker-fixes`) OR whether the operator wants the branch merged to `main` first. **Do NOT push to origin/main without explicit operator confirmation in-session** — surface this as the first step. (The earlier hard rule was to keep prod safe during verification; the operator now wants it live, but the merge-to-main action specifically still needs a yes.)
1. **Redeploy** the studio image (built from this branch) via Coolify. This is what makes ALL the fixes live (incl. the Dockerfile scripts/+src/ change for GAP-VER-007).
2. **Set env** in Coolify for hermes-studio (+ hermes-agent as needed): `HERMES_PASSWORD` (durable), and the inference provider key (`OPENAI_API_KEY` / `OPENROUTER_API_KEY`) from nexxus2.2_replit/.env, so chat inference works.
3. **Run the two scripts with `--apply`** against the live volume: `scripts/deploy-phase8-souls.sh --apply` (7 governor SOULs) and `scripts/port-manuals-to-wiki.sh --apply` (manuals→wiki). Both dry-run-validated; both back up / are additive.
4. **Provision / users** as needed: `npx tsx scripts/create-user.ts ...` and `provision-launch-profiles.ts` (now supports `--slug` for a single customer) inside the redeployed studio container (`docker exec hermes-studio-... npx tsx scripts/<f>.ts ...`).
5. **Run the dispatcher + full user-story test suite against LIVE** (`https://studio.huminic.app` post-redeploy). Re-verify the PENDING-COOLIFY-REDEPLOY procedures (PROC-001/005/010/011/012/013/020/022/103/104/120/130) flip to PASS; walk the user stories; exercise agent chat with the real key.
6. **Fix anything that fails** under the /goal charter. One commit per fix, push the branch, keep evidence.

## Hard-won facts / gotchas (don't re-learn)
- **Production = built dist image** (`hermes-studio-nh5vnz9kz226cj9ib3nodg1j-085548456876`; agent `...-085548447523`). App listens on `:3000` inside the container; no curl in container (use `node -e` fetch); no global pnpm (use `npx tsx`).
- **Caddy** (host-level, `/etc/caddy/Caddyfile`, coordinate via sysadmin) sets `X-Forwarded-For: IP:port` with a **rotating ephemeral port** → that was the GAP-VER-003 root cause (fixed in getClientIp via stripPort). Single replica, single node process.
- **Theme wash-out pattern:** `src/styles.css` maps `--color-primary-700..950` → `--theme-text` (near-white) in the dark theme. So `bg-white`/`bg-primary-950` + `text-primary-9xx`/`text-white` = light-on-light. The admin login + MobileSetupModal + a few post-auth surfaces hit this. Customer login (portal-login.tsx) + /reset are already explicit-dark (safe).
- **Local live verification recipe:** `HERMES_PASSWORD=<pw> PORT=32xx node server-entry.js`, seed a profile `auth.yaml` for profile-auth login, drive with Playwright MCP. Admin creds used locally: `duane` / `LocalPreview2026!` (LOCAL only). Production admin: `duane` / `HuminicValidation2026!`.
- **The 5 scripts that import `../src`** (create-user, provision-launch-profiles, provision-brain, run-tranche-g-evals, run-cedar-ridge-engagement) need BOTH scripts/ and src/ in the image — done in the Dockerfile (live after redeploy).

## Operator-gated / still NOT done
- The two `--apply` script runs (step 3) — mutate production.
- The Coolify redeploy + env (steps 1–2).
- Merge-to-main (step 0 decision) — needs an explicit in-session yes.
- Agent CHAT real AI reply — needs the provider key set (step 2), then test (step 5).
- Deferred backlog (operator-confirmed post-launch): Devil's Advocate teammate, integrity-scanner cron, audit framework, Provisioner agent, KSG scanner. See PLAN.md running log.
