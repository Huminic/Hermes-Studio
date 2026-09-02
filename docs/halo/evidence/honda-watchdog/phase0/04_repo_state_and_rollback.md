# Phase 0 — repository state, toolchain, test baseline, and rollback snapshot

**Captured at (UTC):** 2026-09-02T03:25:49Z (single session; git facts captured 03:1x–03:25Z)
**Scope:** pin both repositories' exact state, toolchain, lockfile, test baseline, and a rollback
point; explicitly quarantine the unrelated ingest-repo generated-route modification.

## 1. MAIN repo — the Phase 0 canonical dev integration branch

| Field | Value |
|---|---|
| Path | `/home/ubuntu/hs-m1r-isolated-20260830` |
| Role | Halo/report prototype; **Claude/Studio dev implementation owner** (SPEC §10) |
| Branch | `codex/halo-295-unshrinkable-inputs` |
| HEAD (rollback point) | `9ac76c58beec657b132a1f30130a41c0a4a270b8` |
| HEAD commit subject | `docs(halo): memorialize reviewed Honda SW-001..SW-295 planning spec + goal + evidence receipt` |
| HEAD commit time | 2026-09-02 02:35:09 +0000 |
| Upstream | `github/codex/halo-295-unshrinkable-inputs` |
| Ahead/behind upstream | `0 / 0` (in sync) |
| Working tree (pre-write) | **clean** (`git status --porcelain` empty) |
| Remotes | `github → https://github.com/Huminic/Hermes-Studio.git`; `bundle-origin → /tmp/m1r-gate1-recovery-20260830/dev-ingest-endpoint.bundle` |

**Canonical branch decision:** `codex/halo-295-unshrinkable-inputs` on the MAIN repo is the
chosen clean canonical dev integration branch for Honda Watchdog execution. Rationale: it is the
only branch here with a clean working tree, an in-sync upstream, and the pinned Honda planning
authorities at HEAD. See `08_architecture_ownership_notouch_map.md`.

> **Anchor delta (recorded, not an error):** SPEC §2 lists a planning-audit "observed HEAD
> `4356e9e6a8d6dad876e7fd835af3daa20d909ca2`" for MAIN. Current HEAD `9ac76c58b` is exactly one
> commit ahead of that anchor (the "memorialize" docs commit). This is expected forward motion;
> Phase 0 pins the **current** HEAD `9ac76c58b`.

## 2. INGEST repo — read-only reference (NOT a Phase 0 write target)

| Field | Value |
|---|---|
| Path | `/home/ubuntu/hs-ingest-dev` |
| Role | Ingest edge: classifier/landing/promotion/readers (SPEC §10 Codex-governed acquisition consumer) |
| Branch | `dev/ingest-endpoint` |
| HEAD | `4c41df11dc48c3bc954ffdd45cdf125b2d67c2d5` (== SPEC §2 anchor, exact) |
| HEAD commit subject | `docs(vin006): record non-blocking pre-existing Studio-wide React 418 hydration caveat (not VIN-006)` |
| HEAD commit time | 2026-08-26 10:03:48 +0000 |
| Upstream | none configured for `dev/ingest-endpoint` |
| Remotes | `origin → github.com/Huminic/Hermes-Studio.git`; `upstream → github.com/JPeetz/Hermes-Studio.git` |
| Working tree | **dirty** — 1 file (see quarantine below) |

## 3. QUARANTINED unrelated modification (no-touch)

| Field | Value |
|---|---|
| Repo | INGEST `/home/ubuntu/hs-ingest-dev` |
| File | `src/routeTree.gen.ts` (generated route tree) |
| Change | `M` (modified, staged=no), `+63` lines |
| Committed blob (HEAD) | `c17054c95415fcad9fe1bcd56e7861e88f5f95b0` |
| Working-tree blob (dirty) | `27579e26113555e5367dce384e85cea422538b5a` |
| Disposition | **QUARANTINED / NO-TOUCH.** Unrelated generated-route work by another writer. This Phase 0 goal does not stage, commit, revert, overwrite, or absorb it. (Assignment directive; SPEC §2 anchor: "execution must not overwrite or absorb it.") |

This modification is in a **separate repository** on a **separate branch**; it does not touch
Phase 0 scope and is not a competing writer on the Phase 0 canonical branch (MAIN, clean). It is
recorded as an external condition in `09_conflict_register.json`.

## 4. Toolchain

| Tool | Version | Source |
|---|---|---|
| Node.js | v20.19.5 | `node -v` |
| npm | 10.8.2 | `npm -v` |
| Python | 3.8.10 | `python3 --version` (validator target runtime) |
| Package manager (MAIN) | pnpm (lockfile present) | `pnpm-lock.yaml` (387105 bytes, dated Aug 30) |
| Test runner (MAIN) | `vitest run` (`package.json` scripts.test) | package.json |
| Typecheck script (MAIN) | none defined (`scripts.typecheck` absent) | package.json |

**Lockfile pin (MAIN):** `pnpm-lock.yaml` present; no `package-lock.json`/`yarn.lock`/`bun.lockb`.

## 5. Test baseline (Phase 0 — targeted, honest)

Phase 0 does not claim operational status from unit tests. The full MAIN suite (`vitest run`)
was **not** executed in Phase 0 (heavy; not required to pin truth). A **targeted** reproduction of
the two tests that back the strongest Phase 0 fail-closed claims was run in the INGEST repo:

| Test file | Result | Duration |
|---|---|---|
| `src/test/ingest-hold-idempotency.test.ts` | **3/3 PASS** | ~50 ms |
| `src/test/promote-held-to-analytics.test.ts` | **12/12 PASS** | ~527 ms |
| **Total** | **15/15 PASS** | ~1.6 s (vitest v3.2.4) |

Command (bounded, read-only w.r.t. git):
`cd /home/ubuntu/hs-ingest-dev && npx vitest run src/test/promote-held-to-analytics.test.ts src/test/ingest-hold-idempotency.test.ts`

The remaining MAIN test suite and INGEST full suite are recorded as **baseline-not-executed in
Phase 0** — a normal-local-artifact run can establish a fuller baseline in a later phase without
changing any Phase 0 conclusion.

## 6. Rollback snapshot

| Repo | Restore-to commit | Command to restore clean state |
|---|---|---|
| MAIN | `9ac76c58beec657b132a1f30130a41c0a4a270b8` | `git -C /home/ubuntu/hs-m1r-isolated-20260830 reset --hard 9ac76c58b` (only if Phase 0 commit must be undone) |
| INGEST | `4c41df11dc48c3bc954ffdd45cdf125b2d67c2d5` + preserve dirty `src/routeTree.gen.ts` | **No action taken/needed** — Phase 0 makes no INGEST writes; do not discard the quarantined dirty file |

Phase 0 additive writes are confined to new files under `docs/halo/evidence/honda-watchdog/phase0/`
and `scripts/halo-phase0/` on MAIN; rollback is `git reset --hard <rollback commit>` or removal of
the two new directories. No existing tracked file is modified by Phase 0.
