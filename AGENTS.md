# AGENTS.md — Huminic Studio (Launch Closeout)

**Mode:** CLOSEOUT + VERIFICATION + LAUNCH-READINESS
**Effective:** 2026-06-01 → until launch sign-off
**Owner:** Implementation agent (Claude Opus 4.7); operator = Duane Wells

---

## SESSION-START HOOK — mandatory before any other action

At the start of EVERY working session you MUST:

1. Read `docs/launch/ACCEPTANCE_CRITERIA.md`, `docs/launch/EXECUTION_CHECKLIST.md`, and `docs/launch/EVIDENCE_INDEX.md` in full.
2. Read `docs/launch/PLAN.md` to refresh canonical task ids and dependencies.
3. Compute `sha256sum docs/launch/ACCEPTANCE_CRITERIA.md` and `sha256sum docs/launch/PLAN.md`.
4. Append to `docs/launch/DECISIONS.log` exactly one line:
   ```
   <UTC-ISO-8601> ACK acceptance-criteria sha256=<hex>  plan sha256=<hex>  by <agent-id>
   ```
5. If either hash differs from the prior session's acknowledgment AND there is no preceding `CHANGE` entry in `DECISIONS.log` explaining the change, you are in violation. STOP and reconcile before doing anything else.

This is not optional. The session is not started until the ACK line is appended.

---

## CURRENT STATE (canonical)

- **Working tree root:** `/home/ubuntu/Claude-store/huminic-studio/`
- **Production Studio:** `https://studio.huminic.app` (Coolify, Hermes-state Docker volume)
- **Production container names:**
  - `hermes-studio-nh5vnz9kz226cj9ib3nodg1j-095907890280`
  - `hermes-agent-nh5vnz9kz226cj9ib3nodg1j-095907879926`
- **Hermes profiles root in container:** `/root/.hermes/profiles/` (Coolify volume `nh5vnz9kz226cj9ib3nodg1j_hermes-state`)
- **Plan / acceptance / evidence:** `docs/launch/`
- **Source of truth for backlog:** `docs/launch/PLAN.md` (NOT issues.md; that was archived 2026-06-01)
- **Decisions:** `docs/next-phase-data-to-completion/decisions.log` (project) + `docs/launch/DECISIONS.log` (closeout, session-start ACKs)

## Reading order before non-trivial work

1. `docs/next-phase-data-to-completion/USER_INSTRUCTION_VERBATIM.md` (operator intent)
2. `docs/next-phase-data-to-completion/SRS_Phase_Next_Combined.md` (SRS body)
3. `docs/next-phase-data-to-completion/SRS_PHASE_NEXT_PART_8_ACCEPTANCE_AND_GOAL.md` (SRS Part 8)
4. `docs/launch/PLAN.md` (canonical plan)
5. `docs/launch/ACCEPTANCE_CRITERIA.md` (launch gate)
6. `docs/launch/EVIDENCE_INDEX.md` (what is and is not proven)

## Engineering rules

- **Configuration over code.** Use Hermes built-in capabilities, plugin manifests, skills, profile YAMLs, MCP tools. Don't fork Hermes core. If a need appears to require a Hermes core touch, STOP and surface as a P-FIX with justification in `DECISIONS.log`.
- **Evidence-first.** No task is "done" without a populated cell in `EVIDENCE_INDEX.md` pointing to a real artifact (audit row id, Brain record id, Playwright trace path, screenshot, vitest run id).
- **No silent re-deferral.** If a task cannot close in this run, document the obstruction in `DECISIONS.log`, raise it in the next status, and only then proceed on unblocked siblings.
- **No fourth cross-profile access surface.** Existing three: wildcard MCP token, `mcp__create_profile`, Studio admin login.
- **No claim of completion without proof.** The phrases "all done", "ready to launch", "production-ready", "complete", "no deferrals", "nothing skipped" may only be used when every AC-* in `ACCEPTANCE_CRITERIA.md` is GREEN with EVIDENCE_INDEX.md reference.
- **No hook-skipping.** Never use `--no-verify`, `--no-gpg-sign`, or equivalent unless the operator explicitly authorizes it.
- **Build + test before claims.** After implementation changes, run `pnpm test` (vitest) and `pnpm build`. For UI changes also run the Playwright suite per `docs/launch/AUTONOMOUS_TESTING_PLAN.md`.

## Things known to be true (don't re-discover)

- `~/.hermes/profiles/<profile>/auth.yaml` uses scrypt password hashes; `is_admin` and `is_customer_admin` are independent boolean flags.
- `scripts/create-user.ts` is the CLI for adding/updating users. Hidden-input password + confirm. Writes 0600.
- Brain lives at `~/.hermes/profiles/<profile>/brain/brain.db` (per-profile sqlite, currently schema_version 4). `BRAIN_PROFILES_ROOT` env override exists for test isolation.
- Studio's plugin loader is at `src/lib/plugin-loader.ts`; `GET /api/plugins` returns the loaded set.
- KSG gate is at `src/server/ksg-gate.ts`; DSG gate is at `src/server/dsg-gate.ts`. Both share the audit log at `~/.hermes/mcp-audit.log`.
- Comms tools (`comms_send_email/sms/initiate_call`) live in `src/server/comms-mcp-handlers.ts` and route through central-mcp.
- Central-mcp URL: `https://mcp.huminicdev.com/dax/mcp`. Token env: `CENTRAL_MCP_TOKEN` (`personabox` scope).
- Per-profile MCP dispatcher at `/api/mcp/$profile`; legacy `/api/mcp/wiki` still active.

## Things known to be incomplete (work the closeout must close)

See `docs/launch/PLAN.md` Phase 2 (CZ-002..CZ-009) and Phase 3 (SRS-C1/D2/D3/D4/E/F7/G).

## Repo conventions

- `pnpm` is the package manager.
- `pnpm test` → vitest. `pnpm build` → Vite production build.
- `pnpm tsx <script>` → run TypeScript scripts.
- Routes are TanStack file-based; `routeTree.gen.ts` is generated, do not edit by hand.
- Per-profile state goes under `~/.hermes/profiles/<profile>/`. Repo source goes under `src/`.

## What this file is NOT

It is not a project plan. The plan is `docs/launch/PLAN.md`. It is not a status report. Status lives in `docs/launch/EVIDENCE_INDEX.md` and `docs/launch/EXECUTION_CHECKLIST.md`. It is not a decisions log. That is `docs/launch/DECISIONS.log` and `docs/next-phase-data-to-completion/decisions.log`.

This file is the session-start hook + minimal context to load any new agent into the closeout context within one read.
