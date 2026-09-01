# M2R Gate R5 — Proof Delta B: end-to-end outcome reconciliation (internal evidence)

Independent outcome reconciliation of the full governed R1→R4 chain at HEAD
`964da6fea4b964331fe40c38861cf84b02b278ee`. Verification/evidence only — no code, cards,
accepted facts, synthesis, source data, schedules, or `/srv` were modified. Companion machine-
readable scope/state with per-requirement pass/fail is `r5-scope-state.json` (99 checks total — 33
global/R1/Git/suite/R4-safety + 66 per-store R2-R4 — 0 failed).

**Overall: PASS.** No genuinely remaining non-acceptance issue was found (one benign advisory is
recorded below for completeness).

## End-to-end lineage (governed data flows one way, each stage constrains the next)
Governed period **2026-08-24..2026-08-30**, as-of **2026-08-31** (one day old), three Sales
rooftops. `/srv` durable analytics is READ-ONLY throughout; byte-identical before and after
(honda `1a3e3bd3…`, nissan `da8d8034…`, ford `69e01c0e…`, mtime 2026-08-30 23:46).

1. **R1 catalog + ledger** (`5ffc17399`) — authoritative 295-condition catalog (SW-001..SW-295,
   unique, exact) is the completeness spine. The 885-row (295×3) inventory preserves exact source
   prose per dealer; exactly **6 runnable rows** (SW-032/SW-041 × 3) carry structured
   thresholds/operands; the other **879 rows are structured-null** as governed. 18 Service-domain
   IDs (54 rows, owner null) and the unresolved SW-082/SW-218 are excluded from Sales.
2. **R2 accepted facts** (committed `70b36525d`; the `dashboard.visits_sold` accepted-fact contract
   extension to `accepted-facts.ts` landed in the **R3 commit `089503327`**) — three
   `validateAcceptedFactsBundle`-passing bundles resolve ONLY the accepted native families. Each:
   correct identity/period/as-of/
   max-age; SHA-256 provenance; **22 accepted context facts**; observed KPIs ⊆ NATIVE7; missing is
   never zero; **no ROI/CAGE/Sales-Communication (quarantined) or Service/Parts fact can enter**.
   The R1 runnable pair SW-032/SW-041 are computed to full lineage; nothing else fires.
3. **R3 synthesis** (committed `089503327`; the shared `PROHIBITED_CLAIM` scanner in
   `consultant-synthesis.ts` was centralized/extended in the **R4 commit `964da6fea`** solely for
   customer-claim guarding, behavior unchanged) — every measure/finding reconciles to
   R2. **19 / 19 / 17** derived measures; **4 / 7 / 7** findings; corrected visit-to-sale
   **15.4% / 23.5% / 21.4%** (governed `visitsSold` numerator, not `sold_in_period`); lead-to-sale
   yield **5.8% / 10.5% / 16.2%**; response **210 / 238 / 317** min; gross **$14,185.20 /
   $13,224.00 / $1,600.99**. Ford's CRM-vs-Dashboard sold-count disagreement blocks the two
   count-dependent per-unit composites while gross stays reconciled. Compatibility, freshness, and
   the shared `PROHIBITED_CLAIM` guard hold; only the two ratified rules are directly evaluated
   (2 of 295); no causal/trend/benchmark claim.
4. **R4 cards** (`964da6fea`) — every displayed value/action/footnote/freshness/store/period
   reconciles to R3. **4 / 5 / 5** pages; **14 / 14** QA pages visually inspected and text-layer
   clean; all actions inert **Not Active - Review Before Activation**; honest "295-condition
   framework / two ratified rules" wording (no 295-execution claim); no Service/Parts/PII/internal
   IDs/paths/hashes/provisional data/unsupported claim. Committed HTML re-renders byte-identically
   (deterministic) and its sha256 equals the QA manifest; committed PDF bytes/sha256 equal the
   manifest.

## Cross-stage reconciliation (recomputed independently in `r5-scope-state.json`)
- R2 exact conditions → R3 exact-condition findings → R4 appointment-execution + priority actions:
  Nissan & Ford fire show-rate + no-show-rate; Honda fires neither (on-track). Consistent across
  all three stages.
- R2 NATIVE7 observed values → R3 KPI measures → R4 KPI cards + metric appendix: identical
  displayed values at every stage (gross, appt rates, response, recon).
- R1 runnable set (SW-032/SW-041) → R3 `catalog_accountability` (2 directly evaluated / 293
  accounted-only) → R4 Semantic Watchdog panel (295 governed / 2 ratified). Consistent; the full
  885-row ledger remains only in internal R1 evidence.
- Ford count-safety propagates end-to-end: R2 discrepancy + gate → R3 blocked measures → R4 cards
  omit the two per-unit composites (17 measures) while showing reconciled gross.

## Controls / suites
- R1-R4 control suites **108/108**; full suite **1680 passed / 7 skipped / 0 failed** (202 files).
- Deterministic HTML generation verified (rebuilt sha == committed sha == manifest sha for all
  three cards). QA manifest `all_pass = true` (14/14). `git diff --check` clean.
- No production write: the committed R4 baseline is clean and HEAD == github; the CURRENT worktree
  is NOT clean by design — it contains ONLY the three allowed R5 evidence files (untracked):
  `r5/r5-scope-state.json`, `r5/r5-outcome-reconciliation.md`, and `SW295_R5_VERIFICATION.md`. No
  tracked file is modified; no concurrent writer; `/srv` unchanged.

## Genuinely remaining non-acceptance issues
- **None functional.** One benign advisory (already disclosed in the R4 evidence and to the
  controller): the three generated HTML deliverables carry trailing whitespace on line 77 (a
  two-space indent in the rendered action-plan block). Reproducible against the COMMITTED state with
  `git show --check HEAD` (equivalently `git log -1 --check`), which reports the advisory on all
  three `output/pdf/halo/*.html` files. (It was originally observed pre-commit while staged via
  `git diff --cached --check`; that command is now empty because nothing is staged in the current
  R5 worktree.) It is inside the shadow-reviewed, hash-pinned artifacts (HTML sha `48186f35…` /
  `3fa60e4f…` / `ef0e51af…`); correcting it would change the reviewed bytes/hashes. It does not
  affect the PDFs, any value, or any safety property. Not a blocker; recorded for transparency.
