# M2R Gate R2 — Accepted-fact resolver + report/model reconciliation (evidence)

**Bounded gate:** R2 only — a typed accepted-fact layer, deterministic internal consultant
findings, and reconciliation of the stale report/model truth to the R1 manifest truth.
DEV/ISOLATED, Sales-only. One writer (this pane), branch `codex/m1r-gate3-schedule-audit`
from `5ffc17399`. **No customer cards, no commit, no route wiring, no runtime resolver
change, no `/srv`/schedule/alert mutation, no Message Content read.** `/srv` is read-only
(governed readers only).

## Deliverables
- `src/server/reports/accepted-facts.ts` (NEW) — `resolveAcceptedFacts(profile)` sorts one
  store's governed evidence into three classes: **(a) accepted_exact_condition** (EXACTLY
  SW-032 / SW-041, full lineage), **(b) accepted_observed_kpi** (NATIVE7; `is_sw_condition`
  is structurally `false`), **(c) withheld_or_provisional** (quarantined ROI/CAGE/comm =
  `withheld`; engagement = `no_current_data`; never zero). Carries per-fact compatibility,
  bundle-level compatibility gates, and any source-count discrepancy. Fails closed for
  non-Sales profiles.
- `src/server/reports/accepted-findings.ts` (NEW) — `buildAcceptedFindings(bundle)`:
  deterministic internal action candidates derived ONLY from accepted facts, ranked by
  impact×confidence across the five consultant lenses (sales/gross lift, expense reduction,
  training, handoff/process, prospect friction). Each finding states what the data proves /
  does not prove, owner, next action, follow-up metric, and an INERT notification/automation
  preview. Only ratified SW conditions fire; observed KPIs contextualize but never fire.
- `src/test/accepted-facts.test.ts` (NEW, 6 tests) + `src/test/accepted-findings.test.ts`
  (NEW, 7 tests) — positive (three real stores) + negative/control.
- Reconciliation edits (stale-debt, R1-deferred): `halo-report-card.ts` (gross provenance =
  CRM precedence / Dashboard fallback; recon → CRM; response-time → Dashboard; withheld-list
  string), `m2b/report-model.ts` (lists CRM Sales Gross in the evidence manifest/freshness),
  `m2b/offline-narratives.ts` (real current values), and five stale tests corrected to true
  values (`halo-report-card`, `m2b-report-model`, `m2b-render-html`, `m2b-opportunities`,
  `halo-report-card-ui`).

## Ground truth (verified via governed readers; period 2026-08-24..2026-08-30)
The live governed analytics for all three stores now hold the same period as the committed
real-data-e2e receipt, and the readers reproduce the receipt's values EXACTLY:

| Store | show | no-show | confirmed | cancel | gross | recon | AvgActual (min) | CRM rows | DP sold |
|---|---|---|---|---|---|---|---|---|---|
| Serra Honda | 8/14 = 57.1% | 5/14 = 35.7% | 7/14 = 50.0% | 1/14 = 7.1% | $14,185.20 | 0 | 210 | 5 | 5 |
| Serra Nissan | 2/6 = 33.3% | 3/6 = 50.0% | 3/6 = 50.0% | 1/6 = 16.7% | $13,224.00 | 0 | 238 | 6 | 6 |
| Tony Serra Ford | 3/7 = 42.9% | 4/7 = 57.1% | 3/7 = 42.9% | 0/7 = 0.0% | $1,600.99 | 0 | 317 | **7** | **6** |

All three: **7 supported (NATIVE7) / 3 missing (engagement) / 10 withheld (ROI×3, CAGE×3,
comm×4)** across the 20-slug catalog.

## Fact classes and firings
- **Exact conditions (SW-032 show < 55%, SW-041 no-show > 45%)** — computed to full lineage
  from the accepted Appointments family: **Serra Nissan** and **Tony Serra Ford** fire BOTH;
  **Serra Honda** fires NEITHER (57.1% ≥ 55%, 35.7% ≤ 45%). 6 evaluations, 4 firings.
- **Observed KPIs (NATIVE7)** — gross.total_sum, four appt.* rates, gross.reconciliation_mismatches,
  dashboard.response_time_actual_avg_min. `is_sw_condition` is structurally `false`; a KPI may
  contextualize a finding but can NEVER fire an SW condition (asserted: response-time finding
  has `fired_conditions: []`).
- **Withheld/provisional** — ROI/CAGE/Sales-Communication stay `withheld` with reasons;
  engagement.* are `no_current_data` (reader exists, no threads). Missing is never zero.

## Ford source-count disagreement (requirement 3)
CRM Sales Gross delivered-sale rows (7) disagree with Dashboard sold-in-period (6) for the
same governed week. The bundle records a `SourceDiscrepancy`; `gates.count_dependent_composites_blocked`
= true; count-dependent composites (close rate, per-unit gross) are blocked; the ABSOLUTE
gross total remains usable because the CRM total reconciles to the Dashboard TOTAL
($1,600.99 both). A GM handoff/process finding surfaces the reconciliation task.

## Compatibility gates (requirement 4)
Recorded on every accepted fact and at bundle level: same dealer, accepted source, governed
period/grain/unit/denominator; **single period ⇒ no trend**; **no causal/ordered claim**;
**unstable comm IDs block comm claims** (comm.* are withheld regardless); **quarantined
ROI/CAGE/Sales-Communication can NEVER feed an accepted fact, finding, score, alert, or
customer narrative** (asserted: every finding's evidence_refs ⊆ NATIVE7; no observed KPI or
exact condition traces to a quarantined source).

## Service/Parts exclusion (requirement 6)
Unchanged and preserved: the accepted-fact/findings layers read ONLY the three Sales
profiles' governed native families; the 18 Service-domain conditions carry no Sales
owner/priority/notification/action, and no Service rows or sources enter any Sales finding.

## Reconciliation of stale report/model truth (requirement 1 & 7)
- Coverage corrected from the stale **19/5/11** to the R1 manifest truth **20 total / 7
  native supported / 3 hub-no-current / 10 withheld**, for all three stores.
- `gross.reconciliation_mismatches` and `dashboard.response_time_actual_avg_min` are VALUES
  (supported), not withheld.
- `gross.total_sum` provenance now reflects **CRM Sales Gross precedence** (Dashboard TOTAL
  fallback); reconciliation is CRM per-deal only (`abs((Front+Back) − Total) > $0.50`);
  response-time is labelled Dashboard **"Avg Actual (Min)"**, never first-response.
- The report-model evidence manifest now lists **crm_sales_gross** alongside appointments +
  dealership_performance, so the ledger's gross provenance is fully traceable.
- Offline AI narratives updated to the real current values so evidence-constrained narration
  validates (`ai_grounded`) instead of falling back.

## Proof Delta A (scope/state)
Branch `codex/m1r-gate3-schedule-audit` from `5ffc17399`, clean tree at start. New files:
`src/server/reports/accepted-facts.ts`, `src/server/reports/accepted-findings.ts`,
`src/test/accepted-facts.test.ts`, `src/test/accepted-findings.test.ts`, this evidence doc.
Modified (reconciliation, in the allowed set): `src/server/reports/halo-report-card.ts`,
`src/server/reports/m2b/report-model.ts`, `src/server/reports/m2b/offline-narratives.ts`,
and the five stale tests. No runtime metric-resolver change (`metric-values.ts` untouched);
no card renderer output change beyond truthful provenance; no `/srv` write; no raw
XLSX/.local-fixtures/PII.

## Proof Delta B (independent numeric/behavioral validation)
- New suites green: `accepted-facts` **6/6**, `accepted-findings` **7/7** (positive against the
  three real stores + negative controls: quarantined-never-accepted, observed-KPI-never-fires,
  full-20 accounting, deterministic ranking, ASCII-only, INERT previews).
- The 12 stale failures corrected to true values: `halo-report-card` **8/8**, `m2b-report-model`
  **7/7**, `m2b-render-html` **8/8**, `m2b-opportunities` **5/5**, `halo-report-card-ui` **5/5**.
- Exact values reconcile to the committed real-data-e2e receipt for all three stores.
- R1/prior controls preserved (`halo-manifest-and-layers`, `m2r-sw295-inventory`, the 82-set).
- Full suite before: **12 failed / 1580 passed / 7 skipped**. After: 0 failed. Touched-file
  typecheck clean; PII/raw scan clean; `git diff --check` clean.

---

# R2 correction — shadow HOLD remediation + broader accepted-fact promotion

The first impartial shadow returned HOLD on two material blockers; the controller added one
completeness correction. This section records the narrowest coherent correction (planned vs
actual, deltas, negative/adversarial results, context-fact inventory, deviations).

## Planned vs actual
| Shadow/controller item | Planned | Actual |
|---|---|---|
| (1) Cross-source compatibility described but not ENFORCED | Enforce period equality + CRM-vs-Dashboard gross reconciliation before any cross-source claim | `assembleAcceptedFacts` computes per-family coverage/freshness, checks period equality across fresh families, and compares CRM total vs Dashboard total gross at the governed **$0.50** tolerance. `period` is null unless families agree; "reconciles" requires matching periods AND totals within tolerance. Ford count disagreement blocks count composites without contaminating gross. |
| (2) `buildAcceptedFindings` trusts caller bundles | Independent fail-closed validation | New `validateAcceptedFactsBundle()` (called first in `buildAcceptedFindings`) independently rejects non-Sales/Service profiles, `sales_only!==true`, registry-mismatch, tampered gates, quarantined/Service provenance, non-fresh-promoted exact conditions, unresolved evidence refs, bad checksums, and forged "reconciles" claims. |
| (3) Promote broader strict facts as context | Separate `accepted_context_facts` collection | Added, kept OUT of the 20-slug NATIVE7/product counts and never an SW firing. Dashboard(9)+CRM(5)+Appointments(7) = **21 context facts** per fully-covered store. |
| (D) Durable evidence beyond a silent /srv skip | Committed receipt-derived non-PII fixture | `src/test/fixtures/r2-governed-facts.fixture.json` (aggregate reader outputs + lineage; no rows/PII). Acceptance is proven via the fixture WITHOUT /srv; an optional `/srv` read-only cross-check asserts the readers reproduce the fixture bundle exactly. |

## New enforcement (Proof Delta A — scope/state)
- `accepted-facts.ts` rewritten: pure `assembleAcceptedFacts(profile, sources, {now,maxAgeDays})`
  + I/O wrapper `resolveAcceptedFacts`. Added `FamilyCoverage`, `CrossSourceGross`,
  `AcceptedContextFact`, extended `CompatibilityGates` (periods_compatible,
  gross_cross_source_reconciles, stale_families, exact_conditions_promoted), injectable
  deterministic freshness gate (`DEFAULT_MAX_AGE_DAYS=14`, `GROSS_RECONCILIATION_TOLERANCE=0.5`),
  `validateAcceptedFactsBundle`, `AcceptedFactsValidationError`, `acceptedEvidenceRefs`.
- `accepted-findings.ts`: validates the bundle first; discrepancy findings only emit with a
  resolvable accepted gross fact; a final pass rejects any finding whose evidence ref does not
  resolve to an accepted fact or that fires an SW id without an accepted condition fact.
- New file: `src/test/fixtures/r2-governed-facts.fixture.json`. No runtime resolver change;
  no `/srv` durable write (brain.db mtimes 2026-08-30 23:46 unchanged); no raw XLSX/PII.

## Compatibility / freshness results (governed week 2026-08-24..2026-08-30, now=2026-08-31)
| Store | periods_compatible | cross_source_gross.reconciles | count composites blocked | exact promoted |
|---|---|---|---|---|
| Serra Honda | true | true (14,185.20 vs 14,185.20) | false | yes (neither fires) |
| Serra Nissan | true | true (13,224.00 vs 13,224.00) | false | yes (both fire) |
| Tony Serra Ford | true | true (1,600.99 vs 1,600.99) | **true** (CRM 7 vs Dashboard 6) | yes (both fire) |

## Negative controls (accepted-facts, no /srv)
- **Period mismatch:** perturbing the CRM period -> `periods_compatible=false`, `period=null`
  (never "same governed week"), `period_mismatch_across_families` discrepancy recorded,
  cross-source composites blocked, source-specific facts (e.g. appt.show_rate) survive. PASS.
- **Gross mismatch:** same period but CRM total +$100 -> `cross_source_gross.reconciles=false`,
  composites blocked, gross.total_sum still promoted with a composite-blocked caveat. PASS.
- **Stale family:** now = 2026-10-01 (~32d) -> no exact conditions, no observed KPIs, all three
  families in `stale_families`, appt slugs withheld as `sub_state:'stale'` (never zero). PASS.

## Sales-only adversarial results (findings, fail-closed) — 9/9 rejected
All rejected with `AcceptedFactsValidationError`: non-Sales/Service profile; `sales_only=false`;
quarantined source promoted as accepted; forged "gross reconciles" with mismatched periods;
exact condition promoted from a non-fresh appointments family; exact base that does not resolve
to an accepted fact; dealer identity not matching the registry; tampered gate invariant;
non-SHA-256 checksum on an accepted KPI.

## Accepted context-fact inventory (per store, fully covered)
Dashboard (9): leads, appts_set, appts_shown, total_visits, sold_in_period, front_gross,
back_gross, total_gross, avg_actual_response_min. CRM (5): row_count, front_sum, back_sum,
total_sum, reconciliation_mismatches. Appointments (7): total, show, no_show, confirmed,
cancelled, completed, rescheduled. **Total 21/store (63 across the three stores).** Separate
collection; NATIVE7/product coverage stays 7 observed / 3 missing / 10 withheld = 20.

## Proof Delta B (correction)
- `accepted-facts` **10/10**, `accepted-findings` **14/14** (durable-fixture branch tests +
  negative compatibility/freshness controls + 9 adversarial fail-closed cases + /srv read-only
  cross-check).
- Full suite: **202 files / 1616 passed / 7 skipped / 0 failed** (+11 tests vs initial R2; 0 new
  failures). R1 controls preserved: `halo-manifest-and-layers` 10/10 + `m2r-sw295-inventory` 10/10.
- Touched-file typecheck clean (pre-existing repo-wide TS errors are unrelated to R2 files);
  `git diff --check` clean; PII/raw scan clean; `/srv` durable brain.db mtimes unchanged.

## Deviations
1. **Durable fixture generation:** generated once off `/srv` via a throwaway probe (removed);
   its values equal the committed receipt. Stores only non-PII aggregates + lineage
   (checksums/deliveryIds), no customer rows.
2. **Context-fact key namespacing:** the Dashboard response-time context key is
   `dashboard.avg_actual_response_min` (distinct from the NATIVE7 product slug
   `dashboard.response_time_actual_avg_min`) so context keys never collide with product slugs.
3. Carried forward from initial R2: `report-model.ts` lists CRM Sales Gross in its evidence
   manifest (gross-precedence traceability); a genuine supported zero (recon=0) renders as a
   value, distinct from missing-as-zero.

---

# R2 second-shadow correction — mismatch-safe semantics + recomputing validator

The second impartial shadow reran the tests and returned HOLD on exactly two material
blockers. Both are corrected below (narrow, bounded). Status is submitted-for-review, NOT
self-certified PASS.

## Blocker 1 — mismatch-safe discrepancy + finding semantics
- `SourceDiscrepancy` is now a **typed union**: `count_disagreement` | `period_mismatch` |
  `gross_mismatch`. Each carries only kind-appropriate fields.
- A `count_disagreement` is created **only when CRM and Dashboard periods exactly match**;
  otherwise a `period_mismatch` is recorded and no count comparison is made.
- A same-period over-tolerance gross gap is a distinct `gross_mismatch`.
- `count_disagreement.gross_reconciles` / `still_usable` reflect the ACTUAL
  `cross_source_gross` (periods_match && within-tolerance) — never asserted unconditionally.
- `buildAcceptedFindings` dispatches per kind with truthful titles/owners/text: period and
  gross mismatches never use sold-count language; the gross-context finding uses
  source-specific period wording (`its governed source period`) when `bundle.period` is null
  and takes its composite-block reason from the actual gate (`blocked_composite_reason`).
- All SW/response/positive-control finding text uses period-appropriate wording, so a
  period-mismatch bundle produces no false "governed week" claim.
- Negative tests (findings): period-mismatch and gross-mismatch bundles assert `proves` text
  contains no "same governed week"/"governed week"/"sold-count"/"reconciles" false claims, and
  the correct typed discrepancy finding is present. PASS.

## Blocker 2 — validator truly RE-COMPUTES (fail-closed)
`validateAcceptedFactsBundle` now independently recomputes, via canonical helpers shared with
assembly (`derivePeriodsCompatible`, `deriveCrossGross`, `computeExact`, `expectedKpiValue`):
- **Exact allowlists** map every observed NATIVE7 slug and every context-fact key prefix to a
  permitted source family and coverage record (no free-form/regex-only provenance).
- Observed KPI / context / exact facts must match their family-coverage **SHA-256 checksum**,
  **period**, dealer/profile, and **fresh/aging (promotable)** state; stale/unknown rejected.
- SW-032/SW-041 are recomputed (numerator, denominator, value, comparator, ratified threshold,
  display, fires) from the accepted appointments context facts; any mismatch is rejected, and
  the base observed KPI must agree.
- `periods_compatible`, governed period, `cross_source_gross`, and the count/gross/period
  discrepancy states are recomputed from coverage + context facts and compared to the claimed
  gates/discrepancies; forged values are rejected.
- The 7 shadow corruptions now each FAIL (adversarial tests): (1) native slug with
  `source_family=lead_source_roi`; (2) exact condition `source_family=Service Dept`; (3) bad
  exact checksum; (4) forged exact numerator/value/fires/threshold; (5) context fact
  `source_family=lead_source_roi`; (6) context fact `freshness=stale`; (7) family period
  changed while `gates.periods_compatible` stays true. A CONTROL asserts the honest fixture
  bundle still validates for all three stores.

## Verification (second correction)
- `accepted-facts` **18/18**, `accepted-findings` **17/17**.
- Full suite: **202 files / 1627 passed / 7 skipped / 0 failed**. R1 controls
  `halo-manifest-and-layers` 10/10 + `m2r-sw295-inventory` 10/10.
- Touched-file typecheck clean (R2 files: no errors); `git diff --check` clean; PII/raw scan
  clean (only the evidence doc's own scope sentence matches); `/srv` durable brain.db mtimes
  unchanged (2026-08-30 23:46). Working tree: 8 modified + 6 new, uncommitted.

## Deviations (second correction)
- `SourceDiscrepancy` changed from a single shape to a typed union; tests updated to the new
  fields (`crm_rows`/`dashboard_sold` etc.). No other consumer exists outside R2.
- Validator now depends on accepted context facts to recompute observed/exact values; this is
  safe because context facts are always promoted alongside observed facts for a fresh family
  (a stripped-context forgery fails closed).

---

# R2 third-shadow correction — canonical recompute + exact context inventory

Third impartial shadow HOLD on four remaining fail-closed gaps. All derivation is now
centralized in canonical helpers shared by assembly AND validation; the validator recomputes
everything and rejects divergence. Status: submitted-for-review, NOT self-certified PASS.

## 1. Exact context inventory (no prefix acceptance)
`CTX_KEYS_BY_FAMILY` is an EXACT key allowlist (Dashboard 9, CRM 5, Appointments 7). The
validator rejects unknown keys (e.g. `dashboard.injected`), duplicate keys, wrong-family
mapping, missing required keys, and extra keys; a fresh family must expose its FULL subset and
a non-fresh/absent family must expose NONE.

## 2. All compatibility gates recomputed from canonical accepted facts
`count_dependent_composites_blocked`, `blocked_composite_reason`, `stale_families`,
`periods_compatible`, governed period, `cross_source_gross`, `gross_cross_source_reconciles`,
`exact_conditions_promoted`, and `exact_conditions_block_reason` are recomputed via
`deriveCompositeBlock` / `deriveExactPromotion` / `derivePeriodsCompatible` / `deriveCrossGross`
and compared. A forged Ford `blocked=false` or `reason=null` is rejected.

## 3. Full discrepancy array canonicalized and compared field-by-field
A single `deriveDiscrepancies(canon)` helper produces the ordered array in BOTH assembly and
validation; the validator deep-compares (`JSON.stringify`) so any forged count/gross/period
value, tolerance, description, family-period, `still_usable`, or duplicate/extra entry is
rejected. Findings can no longer inherit caller-authored discrepancy claims.

## 4. Freshness recomputed from period end + single as_of + max-age policy
The bundle now carries `as_of_iso` and `max_age_days`. `computeFreshness` derives
age/freshness/fresh from the source period end + as_of + policy; the validator recomputes and
rejects caller-provided `fresh/age_days/freshness` that disagree, inconsistent per-row as_of,
and invalid policy. A bundle whose family periods are all moved to 2020 while claiming
fresh/age 0 is rejected.

## Tests added
`accepted-facts`: unknown context key; duplicate context key; wrong-family key; missing
required key; exact-subset assertion; forged Ford `blocked=false`; forged `reason=null`; forged
count payload; forged description; fabricated extra discrepancy; all-2020-claiming-fresh;
inconsistent as_of / zero policy / per-row as_of; honest Honda/Nissan/Ford control. (Plus the
prior 7 recompute corruptions and negative compatibility controls.)

## Verification (third correction)
- `accepted-facts` **31/31**, `accepted-findings` **17/17**.
- Full suite: **202 files / 1640 passed / 7 skipped / 0 failed**. R1 controls
  `halo-manifest-and-layers` 10/10 + `m2r-sw295-inventory` 10/10.
- R2-touched-file typecheck clean; `git diff --check` clean; PII/raw scan clean (only the
  evidence doc's own scope sentence matches); `/srv` durable brain.db mtimes unchanged
  (2026-08-30 23:46). Working tree: 8 modified + 6 new, uncommitted.

## Deviations (third correction)
- `AcceptedFactsBundle` gained `as_of_iso` and `max_age_days` (needed for deterministic,
  caller-independent freshness recomputation). No consumer outside R2.
- Context-fact promotion now requires the FULL exact per-family key subset for a fresh family;
  the current governed data supplies all 21 keys per store, so this is satisfied. If a future
  reader legitimately returns a null field, that key's absence would need an explicit
  optional-key policy (noted; not needed for the current governed set).

---

# R2 final-shadow correction — two remaining caller-trusted gaps

The read-only review confirmed 3 of 4 prior gaps resolved and flagged two omissions. Both
fixed; status is submitted-for-review, NOT self-certified PASS.

## 1. `gates.single_period_no_trend` recomputed (no longer caller-trusted)
This layer carries a single governed period per family (no history), so the canonical value is
always `true` (constant `SINGLE_PERIOD_NO_TREND`). The validator now rejects any caller-supplied
value other than `true`. An honest bundle mutated to `single_period_no_trend=false` is rejected.

## 2. Exact ratified condition ID set + uniqueness (not array length)
When exact conditions are promoted, the validator now requires the `condition_id` array to equal
**exactly `[SW-032, SW-041]` in canonical order** (rejecting duplicates, missing, extras, wrong
ids, and reversed order); zero conditions when not promoted. Replacing SW-041 with a duplicate
SW-032 (same length) is now rejected.

## Tests added
`accepted-facts`: forged `single_period_no_trend=false`; duplicate SW-032 in place of SW-041;
missing SW-041; extra third condition; reversed ID order; honest three-store control asserting
`[SW-032, SW-041]` and `single_period_no_trend===true`.

## Verification (final correction)
- `accepted-facts` **37/37**, `accepted-findings` **17/17**.
- Full suite: **202 files / 1646 passed / 7 skipped / 0 failed**. R1 controls
  `halo-manifest-and-layers` 10/10 + `m2r-sw295-inventory` 10/10.
- R2-touched-file typecheck clean; `git diff --check` clean; PII/raw scan clean (only the
  evidence doc's own scope sentence matches); `/srv` durable brain.db mtimes unchanged
  (2026-08-30 23:46). Working tree: 8 modified + 6 new, uncommitted.
