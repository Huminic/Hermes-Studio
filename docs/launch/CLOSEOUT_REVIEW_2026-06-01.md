# Closeout adversarial review — 2026-06-01

**Reviewer:** independent `general-purpose` subagent dispatched at 2026-06-01T07:53Z
**Subject:** verify the 9 claims in the closeout report against the files on disk and the live production volume
**Verdict:** **GO**

---

## Claim 1 — CZ-004/005 password reset
**PASS.** `src/server/password-reset.ts:48` `TOKEN_TTL_MS = 15 * 60 * 1000`. Token stored as `sha256` hex (line 108-110, `hashToken`), raw never persisted (`hash: hashToken(rawToken)`, line 149). Expiry check `expires_at <= now` at line 212. Single-use via `used_at !== null` check at line 211, set at line 239. Anti-enumeration in reset-request route returns `{ ok: true }` regardless (line 66). Rate-limited 3/min/IP at `auth.reset-request.ts:39`; sendNotification at line 57. reset-confirm calls `redeemResetToken`, which writes scrypt hash via `hashPassword` (line 223) and validates schema (line 229). `src/routes/reset.tsx` reads `?token=` (line 34) and posts to confirm. Test file has 17 `it()` cases covering all required scenarios including TTL=15min assertion at line 203-205.

## Claim 2 — SRS-C1 engagement-state writeback
**PASS.** `src/server/engagement-state-writer.ts` exports all four required symbols. `consultative-engine.ts:43-45` imports `advanceEngagementStage` + `phaseToStage`; calls at line 127 inside the 6-phase loop. Writeback failures caught at line 132 and pushed into `errors` array (line 135) without failing the phase. Atomic write via `${target}.tmp-${pid}-${ts}` then `renameSync` at lines 62-64. Test has 10 `it()` cases including the 6-phase sweep (line 133), idempotent (line 118), topology_decided (line 178), null for missing profile (line 127).

## Claim 3 — SRS-F7 PII redactor
**PASS.** `src/server/pii-redactor.ts:99` exports `maybeRedactForEmbedding`. `src/server/embeddings.ts:120` calls it BEFORE `model.embed(chunkTextToEmbed)` at line 131. Local models pass through (`isRedactionRequired` returns false for `local-*`, line 91). Remote model with no `EMBED_PII_REDACTOR` env returns `{ ok: false, reason: 'redactor-required' }` (lines 107-109); embeddings.ts converts that to `rule: 'pii-redactor-required'` (line 126). CC and PHONE use word boundaries `(?<!\d)…(?!\d)` (lines 27, 30). Test has 14 `it()` cases covering each pattern + fail-safe.

## Claim 4 — 6 dealers + huminic-motors on production
**PASS.** Container lists 16 profiles. All 7 new auth.yaml files exist with 0600 perms, contain `username:`, `password_hash: scrypt$…`, `is_customer_admin: true`. huminic-motors has `studio.yaml` (accent `#0d9488`, `lead_notifications.adf_email: neoweaver@gmail.com`), `SOUL.md`, and `governance/agents/elliott.md` with `enabled: true`.

## Claim 5 — Data tab hidden on all 10 launch-scope storefronts
**PASS.** All 10 (`huminic`, `strukture`, `serra-honda`, `serra-automotive`, `serra-nissan`, `serra-service`, `tony-serra-ford`, `ford-of-columbia`, `hyundai-of-columbia`, `huminic-motors`) show `data: false` under `menu:`.

## Claim 6 — No Hermes core fork
**PASS.** `docker/agent/Dockerfile` clones `https://github.com/NousResearch/hermes-agent.git` at commit `9ed751b96706ffd343ae26531cd0e2152a1c7036`. `git log --name-only 7f0e276fb -- docker/agent/` returns only ancestor commits (3476fe26 May 28, 55217e40 May 28, f1b7ce26 Apr 10) — closeout SHAs `6ad347624` and `bd47e44fc` did NOT touch `docker/agent/`.

## Claim 7 — Vitest green
**PASS.** `pnpm test --run` → **Test Files 59 passed (59) / Tests 512 passed (512)** in 26.43s.

## Claim 8 — Session-start hook
**PASS.** `AGENTS.md:9` "SESSION-START HOOK — mandatory before any other action" with the 5-step procedure including `sha256sum` of both files at step 3. `DECISIONS.log` contains first ACK line: `2026-06-01T07:37:18Z ACK acceptance-criteria sha256=30d39ddb… plan sha256=2e11d98a… by claude-opus-4-7-closeout-session-01`.

## Claim 9 — Stale documents archived
**PASS.** `docs/archive/2026-06-01/README.md` lists all 9 archived files with one-line reasons. Root `issues.md` does NOT exist (archived). `docs/next-phase-data-to-completion/LAUNCH_READINESS_REPORT.md` does NOT exist (archived).

---

## FINAL VERDICT: **GO**

Every one of the 9 claims is substantiated by code, files, and live production state. Test suite is green (512/512). No Hermes core was forked. All launch-scope storefronts have the Data tab hidden. Password reset is hashed, single-use, TTL-enforced, anti-enumeration. Engagement writeback is wired into the consultative engine with atomic temp+rename and non-fatal error surfacing. PII redactor is fail-safe (refuses remote embeds when unconfigured). The session-start hash-binding hook is in place and already used once.

Minor non-blocking observations (not failures):
- `consultative-engine.ts` calls `advanceEngagementStage` synchronously despite the writer being sync; the `errors.push` for `writeErr` is reachable but harmless.
- React `act()` warnings in the test output are pre-existing, unrelated to this closeout.

Recommend launch.
