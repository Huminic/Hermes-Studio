# M2R Gate R1 — Semantic Watchdog 295×3 Inventory (evidence)

**Bounded gate:** R1 only — machine-readable 295×3 inventory/coverage ledger + cluster graph + validator +
tests + directive appendix + engine-truth reconciliation. DEV/ISOLATED, Sales-only. One writer (this pane),
branch `codex/m1r-gate3-schedule-audit` from `b2176b8c0`. **No card renderer / alert execution changes.**
No raw XLSX/.local-fixtures/`/srv`/production/browser/email/schedule/dispatch/deploy/merge/customer output;
no Message Content read.

## Deliverables
- `docs/halo/contract/sw295-inventory.json` — **885 rows** (295 conditions × 3 Serra Sales dealers). **All 885**
  carry the **verbatim** catalog fields (immutable source condition, rule, source fields, source, cadence,
  grain, acquisition_class), a disposition, confidence, and a **primary (first-match) blocker** with a reason.
  **Exact structured** threshold, unit, expected_period, freshness_policy, and numerator/denominator operands
  exist **ONLY for the 6 runnable rows** (SW-032/SW-041 × 3); the other **879 are intentionally `null`** on
  those fields. Owner/action/inert-notification/follow-up are Sales-scoped (Service rows carry none).
- `docs/halo/contract/sw295-clusters.json` — 11 clusters (10 Sales + Service-out-of-Sales), compatibility
  controls, and 5 cross-cluster diagnostic rules (XR-01..XR-05).
- `scripts/m2r-sw295/build-sw295-inventory.mjs` (deterministic generator) + `validate-sw295-inventory.mjs`.
- `src/test/m2r-sw295-inventory.test.ts` (10 gate tests) + engine-truth reconciliation.
- Directive appendix (`M1R_M2R_CONTROL_DIRECTIVE.md`) recording the authorized goal extension.

## Taxonomy accounting (all 295, reconciled)
- **Historical 7-class** (immutable): 20 / 162 / 56 / 7 / 8 / 7 / 35 = 295 (matches `classification-summary`).
- **Sales overlay 8-class** (current disposition tally, matches `service-domain-overlay`):
  direct **20**, scheduled+calc/NLP **154**, external **54**, manual-export **7**, unavailable **8**,
  manual-CRM **7**, outside-boundary **27**, Service-domain-out-of-Sales **18** = 295.
- **Service-domain 18 IDs** out of Sales (zero in a Sales cluster). **SW-082 / SW-218** unresolved →
  `withheld_unresolved`. False-positive `service` words **SW-176 / SW-274** stay Sales-eligible.

## Accepted-runnable set — EXACTLY SW-032 and SW-041 (from the committed strict receipt)
| Condition | Dealer | numerator/denominator | value | threshold | fires |
|---|---|---|---|---|---|
| SW-032 show rate <55% | Serra Honda | 8/14 | 57.1% | <0.55 | **no** |
| SW-032 | Serra Nissan | 2/6 | 33.3% | <0.55 | **FIRES** |
| SW-032 | Tony Serra Ford | 3/7 | 42.9% | <0.55 | **FIRES** |
| SW-041 no-show rate >45% | Serra Honda | 5/14 | 35.7% | >0.45 | **no** |
| SW-041 | Serra Nissan | 3/6 | 50.0% | >0.45 | **FIRES** |
| SW-041 | Tony Serra Ford | 4/7 | 57.1% | >0.45 | **FIRES** |

6 evaluations, **4 firings**. Every value traces to the committed E2E receipt (Appointments strict; per-dealer
source SHA-256 + period `2026-08-24..30` + numerator/denominator). All other 293 conditions are useful
primitives at most — **not** restated as accepted SW conditions; ROI/CAGE/Comm stay quarantined/provisional.

## Engine-truth reconciliation (requirement 4 + shadow correction 2; reconcile to ACTUAL runtime)
- Catalog is **20** slugs; the support-manifest previously covered **19** (omitted
  `dashboard.response_time_actual_avg_min`). Added that slug → manifest now covers all 20 exactly once.
  Manifest version 1.1.0→1.2.0.
- **Correction 2 (truth vs runtime):** `resolveMetricValues` emits `gross.reconciliation_mismatches` (=0)
  and `dashboard.response_time_actual_avg_min` (210 / 238 / 317) for all three stores, and
  `halo-three-layer.currentLayer` returns a resolved value **before** consulting any withheld state (verified
  by direct runtime inspection and already ratified by `halo-m1-proof`'s `NATIVE7`). A "withheld" claim for
  either is therefore untrue. Both are marked **supported** (from accepted strict families) — **no execution
  change** (the resolver already emits them). Manifest native support = **NATIVE7**: gross.total_sum, 4 appt.*,
  gross.reconciliation_mismatches, dashboard.response_time_actual_avg_min. Supported **5→7**, withheld **10**.
- `gross.total_sum` provenance corrected to **CRM Sales Gross precedence** (Dashboard TOTAL reconciles as fallback).
- `halo-manifest-and-layers.test.ts` stale constants corrected to true membership (20 slugs; 7 supported / 3 hub
  / 10 withheld; three-layer 20) + a correction-2 characterization/negative test (recon/response-time return a
  VALUE; a genuinely-withheld slug stays withheld). This turns **2 previously-failing tests GREEN** (net −2).

## Shadow-HOLD corrections applied (R1 re-run)
1. **Service rows (54) are Sales-inert:** `owner=null`, `priorities=[]`, `inert_notification_candidate=null`,
   action routes ONLY to the combined Serra Service workspace. Validator + test enforce this (beyond cluster).
2. **Manifest↔runtime reconciled** (above): recon-mismatches + response-time are supported, not withheld;
   negative test added; evidence/directive truthful. No resolver/report execution change.
3. **Unsafe unit inference removed:** substring matching over-classified `expi(ratio)n`, `regist(ratio)n`,
   `du(ratio)n`, `gene(rate)`, `st(rate)gy` (SW-082/218/274/085/231/278/295) as `ratio_0_1`. Now unit is
   explicit ONLY where proved: runnable → `ratio_0_1`; non-runnable → `null`. Validated.
4. **Per-row exactness narrowed/substantiated:** verbatim catalog field copies (condition, rule, fields_and_keys,
   source, cadence, grain, acquisition_class) validated against the source matrix; `structured_threshold`,
   `expected_period`, `freshness_policy` are `null` for non-runnable rows; the single blocker is labelled
   **primary (first-match)**; `generated_at` removed → artifact is **byte-deterministic**; receipt + overlay
   hashes pinned and validated.

### Manifest truth cleanups (controller, R1; metadata/tests only — no runtime behavior change)
- Removed the stale header note claiming response-time was added "as withheld"; supported set is **NATIVE7** (7).
- Removed the now-unused, contradictory `WITHHELD.GROSS_RECON` and `WITHHELD.RESPONSE_TIME` constants/comments.
- Section comments corrected: supported **exactly 5 → exactly 7**; withheld **11 → 10**.
- `CATALOG_295_SOURCE` + anchor comment updated to the **actual in-worktree** catalog path
  `docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json` (sha256 `29c7ac06…`).
- Added `CRM_GROSS_GRAIN` (store × governed CRM Sales Gross period, per-deal; Dashboard TOTAL fallback) for
  `gross.total_sum` + `gross.reconciliation_mismatches`; `dashboard.response_time_actual_avg_min` stays on `DP_GRAIN`.
- Exact reader semantics pinned in the manifest: `gross.reconciliation_mismatches` = count of CRM per-deal
  rows where `abs((Front Gross + Back Gross) − Total Gross) > $0.50` (reader tolerance, `ingest-native-metrics.ts:446`);
  `dashboard.response_time_actual_avg_min` = Dashboard **"Avg Actual (Min)"** (`:261`), not a first-response metric.
  `gross.total_sum` grain is source-neutral (CRM precedence; Dashboard TOTAL fallback); recon uses a CRM-per-deal-only grain.
- Fixed the stale `metric-values.ts` doc-comment (recon-mismatches is emitted from accepted CRM, not withheld).

### Known stale statements DEFERRED to R2 (report-card layer; controller-scoped)
Per the controller, the report-card layer and historical M2B/M1 artifacts are **not** rewritten in R1. These
carry pre-R1 coverage numbers (total 19 / supported 5 / withheld 11) and a withheld string for
`gross.reconciliation_mismatches` — updated when the report-card layer is reconciled in **R2**:
`src/server/reports/halo-report-card.ts` (withheld limitation string); tests `halo-report-card.test.ts`,
`halo-report-card-ui.test.tsx`, `m2b-report-model.test.ts`, `m2b-opportunities.test.ts`; committed M2B
artifacts under `docs/halo/evidence/m2b/`; and the historical `M1_VALIDATION_MATRIX.md` M1-close snapshot
(historically accurate, not rewritten).

## Clusters + cross-cluster synthesis
10 Sales clusters (lead/source health; responsiveness/comms behavior; appointments/showroom; funnel/sold;
gross/economics; rep/manager execution; CRM hygiene/compliance; opportunity/reactivation; cross-cluster
diagnoses; external/Presence dependencies) + Service-domain (out of Sales). Compatibility controls: same
dealer; accepted-source-only; compatible population/period/grain/unit/denominator; insufficient-history blocks
trends; unstable comm IDs block ordered/causal claims; source-disagreement blocks composites; never-zero.
Cross rules XR-01..XR-05: only **XR-04** (appointment execution, SW-032/SW-041) is runnable; the rest are
gated with recorded blocking controls.

## Proof Delta A (scope/state)
Branch `codex/m1r-gate3-schedule-audit`. New files: `scripts/m2r-sw295/*`, `docs/halo/contract/sw295-*.json`,
`src/test/m2r-sw295-inventory.test.ts`, this evidence doc. Modified (additive/corrective, in allowed set):
`docs/halo/M1R_M2R_CONTROL_DIRECTIVE.md`, `src/server/watchdog/halo-support-manifest.ts`,
`src/test/halo-manifest-and-layers.test.ts`. `metric-catalog.ts` unchanged (already 20). No card renderer /
alert execution change. Raw XLSX/.local-fixtures/`/srv` untouched.

## Proof Delta B (independent numeric/catalog validation)
Validator green (885 rows / 6 runnable / 4 firings / disposition total 295) incl. the C1–C4 checks (service-row
purity; unit exactness with the 7 named false-positive IDs → null; verbatim field-copy fidelity; determinism;
receipt+overlay hash pins). Catalog SHA-256 `29c7ac06…` matches the overlay's expected; historical 7-class
matches summary; Sales overlay 8-class matches inventory disposition tally; SW-032/SW-041 values reconcile to
the committed receipt; inventory byte-deterministic (`9323a6e8…`, no `generated_at`). R1 vitest gate **10/10**;
manifest test **10/10** (incl. correction-2 characterization/negative test); prior 13-file control gate
**82/82** preserved; full suite **12 failed (was 14) — net −2, zero new failures** (the 3 remaining failing
files — `halo-report-card`, `m2b-report-model`, `m2b-render-html` — are unchanged pre-existing `/srv`-dependent
failures at 3/4/5). Touched-file typecheck clean; PII/raw scan clean.
