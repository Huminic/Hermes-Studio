> **SUPERSEDED FOR ACCEPTANCE (2026-09-01).** This R5 checkpoint directly evaluated
> only SW-032 and SW-041 across three rooftops — **6 evaluated dealer-cells of 885**,
> not 885. The ACTIVE unshrinkable goal (`docs/halo/contract/active-295-acceptance.json`)
> requires all 885 cells CALCULATED (baseline/variance/rank/confidence); cataloged /
> accounted / withheld does NOT count. This R5 PASS **cannot** satisfy the active goal.
> A regression guard (`src/test/active-acceptance-guard.test.ts`) enforces this.

# M2R Gate R5 — Final M1R/M2R end-to-end verification (checkpoint)

**Bounded gate:** R5 only — verify the complete governed R1→R4 chain after commit
`964da6fea4b964331fe40c38861cf84b02b278ee` and produce internal R5 evidence. Verification/evidence
only; **no code, cards, accepted facts, synthesis, source data, schedules, Gmail, VinSolutions,
production, alerts, automations, CRM, or `/srv`** were modified. Only new files under
`docs/halo/evidence/m1r/r5/` plus this checkpoint. Status: submitted-for-review, NOT self-certified.

**Verdict: PASS** (99/99 scope-state checks, 0 failed — 33 global/R1/Git/suite/R4-safety checks + 66
per-store R2-R4 checks; full suite green; `/srv` immutable).

## Two proof deltas
- **A (scope/state, machine-readable):** `r5/r5-scope-state.json` — independent recomputation from
  committed artifacts + live modules; explicit pass/fail for every requirement with exact
  hashes/counts. 99 checks total (33 global/R1/Git/suite/R4-safety + 66 per-store R2-R4), 0 failed.
- **B (outcome reconciliation):** `r5/r5-outcome-reconciliation.md` — full end-to-end lineage
  R1→R4 with cross-stage reconciliation and remaining-issue disclosure.

## Required checks — results
1. **State/chain/`/srv`** — PASS. HEAD `964da6fea` == `github/codex/m1r-gate3-schedule-audit`; the
   committed R4 baseline is clean (no tracked file modified) and the CURRENT worktree contains ONLY
   the three allowed R5 evidence files as untracked additions (it is intentionally not "clean");
   `git diff --check` clean; chain present (`5ffc17399` → `70b36525d` →
   `089503327` → `964da6fea`); no concurrent writer; `/srv` durable brain.db byte-identical
   (honda `1a3e3bd3…`, nissan `da8d8034…`, ford `69e01c0e…`; mtime 2026-08-30 23:46:4x).
2. **R1 inventory** — PASS. Catalog 295 unique SW-001..SW-295; ledger 885 rows (295/dealer);
   exactly 6 runnable (SW-032/SW-041 × 3); 879 structured-null; 18 Service-domain IDs (54 rows,
   owner null) + SW-082/SW-218 unresolved excluded; verbatim prose validated. R1 test 10/10.
3. **R2 accepted facts** — PASS. Three validated bundles; exact identity/period `2026-08-24..30`/
   as-of/max-age/SHA-256; 22 context facts/store; observed KPIs ⊆ NATIVE7; missing≠zero; no
   Service/Parts; no quarantined ROI/CAGE/Sales-Communication in accepted facts. accepted-facts
   40/40, accepted-findings 17/17.
4. **R3 synthesis** — PASS. 19/19/17 measures; 4/7/7 findings; visit-to-sale 15.4/23.5/21.4;
   lead-to-sale yield 5.8/10.5/16.2; response 210/238/317; gross $14,185.20/$13,224.00/$1,600.99;
   2-of-295 directly evaluated; Ford count-dependent composites blocked; guards hold; no
   causal/benchmark claim. consultant-synthesis 20/20.
5. **R4 cards** — PASS. Pages 4/5/5; 14/14 PNGs; text-layer clean (no banned/Service/Parts/PII/SW
   ids/slugs/paths/hashes/provisional/causal); honest 295/2 wording; all actions Not Active; HTML
   re-renders deterministically and sha == manifest; PDF bytes/sha == manifest. halo-card-render
   11/11.
6. **Suites/determinism** — PASS. R1-R4 controls 108/108; full suite 1680 passed / 7 skipped /
   0 failed; QA manifest all_pass; deterministic HTML confirmed; diff clean; no production write.

## Remaining non-acceptance issues
None functional. One benign advisory: trailing whitespace on line 77 of the three generated HTML
deliverables — reproducible against committed state with `git show --check HEAD` (the pre-commit
`git diff --cached --check` is now empty since nothing is staged). Inside shadow-reviewed,
hash-pinned artifacts; does not affect PDFs, values, or safety. Recorded, not a blocker.

## Boundaries
DEV/ISOLATED, Sales-only throughout. No merge/deploy/email/send/activation/CRM/`/srv` mutation.
Uncommitted; awaiting impartial shadow review.
