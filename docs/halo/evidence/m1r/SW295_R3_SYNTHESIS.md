# M2R Gate R3 — Cross-metric consultant synthesis (internal evidence)

**Bounded gate:** R3 only — a deterministic intelligence layer that turns validated accepted
Sales facts into definition-compatible derived measures + ranked consultant findings, while
preserving the authoritative 295-condition catalog accounting. DEV/ISOLATED, Sales-only. One
writer, branch `codex/m1r-gate3-schedule-audit` from `70b36525d` (R2 backup). **No merge,
deploy, production write, external send, alert/automation activation, CRM mutation, `/srv`
write, final PDFs, or Service/Parts data.** Status: submitted-for-review, NOT self-certified.

## Deliverables
- `src/server/reports/consultant-synthesis.ts` (NEW) — `buildConsultantSynthesis(bundle)` +
  `toExternalNarrative(bundle)` (bundle-only; rebuilds+validates internally). Consumes only a
  `validateAcceptedFactsBundle`-passing bundle (fail-closed); uses the 21 accepted context facts,
  NATIVE7 observed KPIs, and the actually-promoted exact conditions SW-032/SW-041. Emits derived
  measures, blocked measures, ranked findings (5 lenses), 295 accountability,
  rejected-source-families, assumptions, freshness — plus a separated customer-facing external
  narrative.
- `src/test/consultant-synthesis.test.ts` (NEW, 19 tests) — positive (3 stores), fail-closed,
  period-mismatch, stale, missing-source, benchmark reclassification, evidence-ref template,
  no-Service/Parts, external-copy-safety + bypass, zero-denominator, funnel-redesign,
  prohibited-claim scan, determinism, and /srv read-only equality.
- `docs/halo/evidence/m1r/r3/three-store-synthesis.json` (NEW) — deterministic machine-readable
  three-store artifact (INTERNAL proof + EXTERNAL copy separated per store), derived from the
  committed R2 durable fixture (equals /srv reader values). No raw XLSX/PII.

## Definition-compatible derived measures (req 2)
Computed only when source/period/count gates allow; within-family measures share one accepted
source+period, cross-family measures require verified period compatibility.
- **Lead funnel (Dashboard):** appointment-set rate, visit rate, lead-to-sale rate.
- **Appointments:** confirmation rate/gap, show/no-show/cancel/reschedule/completion rate,
  shown-through rate.
- **Showroom:** visit-to-sale rate.
- **Gross (CRM):** total, front/back mix; **average gross per CRM sale ONLY when count
  compatibility permits.**
- **Cross-cluster:** confirmed-not-shown gap (appointments-internal), gross-per-delivered
  (CRM gross ÷ Dashboard sold — cross-source, period + reconciliation gated), responsiveness
  context (avg actual response minutes).

## Ford count integrity (req 2)
Ford CRM 7 rows vs Dashboard 6 sold ⇒ `count_dependent_composites_blocked`. R3 moves
`gross.avg_per_sale` and `cross.gross_per_delivered` to **blocked_measures** (blocked_by
`count_disagreement`), while `gross.total` and front/back mix stay available (separately
reconciled). A GM data-integrity finding surfaces the reconciliation.

## Planned-vs-actual: accepted facts → measures/findings, per store (req 10)
Governed week 2026-08-24..2026-08-30; as_of 2026-08-31; all families fresh; periods compatible.

| Store | measures | blocked | findings | SW fired | notable findings |
|---|---|---|---|---|---|
| Serra Honda | 19 | 0 | 4 | none | funnel snapshot review, response-time, gross-mix (front positive → training), appointments-on-track |
| Serra Nissan | 19 | 0 | 7 | SW-032 + SW-041 | show-leakage, no-show handoff, no-show effort-reduction, confirm-vs-show gap, funnel snapshot review, response-time, gross-mix |
| Tony Serra Ford | 17 | 2 | 7 | SW-032 + SW-041 | show-leakage, no-show handoff/effort, funnel snapshot review, response-time, **front-gross-negative lift**, **count reconciliation** |

(Note: the `r3-funnel-review` finding is a named-snapshot review — it does NOT rank a "weakest stage" or claim a biggest lever; see the correction section below. `funnel.lead_to_sale_yield` is end-to-end yield, not a transition stage.)

- **Directly evaluated (per store): exactly SW-032 and SW-041** (2 of 295) when appointments are
  promoted; the remaining **293 are accounted-only** via the R1 inventory spine
  (`docs/halo/contract/sw295-inventory.json`). Derived measures are definition-compatible
  context, NOT ratified SW firings and NOT new SW IDs.
- Ford front gross is negative (−$2,267.16) ⇒ the gross-mix finding escalates to
  `sales_gross_lift` (front-end desking lever). Nissan/Honda front positive ⇒ `training`.

## Five lenses (req 3,5)
Across the three stores the findings cover all five lenses: **expense_reduction** (no-show
effort), **sales_gross_lift** (funnel drop-off / front-gross), **training** (confirm-vs-show
gap, gross mix), **handoff_process** (no-show recovery, count reconciliation), **prospect_friction**
(show leakage, response time). Mile-wide/inch-deep coverage across clusters + mile-deep within
the material appointment cluster when SW-032/SW-041 fire.

## Benchmarks (req 6) — superseded by the correction below
**Every** finding carries `benchmark: no_benchmark`. The appointment show/no-show material in the
three-layer evaluator is definition-INCOMPATIBLE, so it is NOT treated as a benchmark: it is kept
only as an internal `incompatible_reference` (marked `definition_compatibility: 'incompatible'`) and
never compared to in customer copy. All measures/findings are framed dealer-relative / by funnel
logic. No standard is invented. (See the correction section, item 5.)

## Internal vs external separation (req 7)
Internal synthesis retains lineage (evidence refs, formulas, proves/does-not-prove, confidence,
benchmark provenance), availability states, rejected source families, assumptions, and freshness.
`toExternalNarrative` emits persuasive customer Sales copy and is fail-closed against engineering
words (`limitation|quarantine|withheld|missing|issue`) and any Service/Parts mention (asserted).

## Boundaries (req 8)
Zero Service/Parts facts/sources/conclusions in any Sales output (asserted on data + customer
fields; a governed benchmark *guardrail note* that references "a service number, do not apply to
sales" is internal provenance, not a Service fact). Missing is never zero. Quarantined
ROI/CAGE/Sales-Communication cannot power any measure or finding.

## Proof Delta A (scope/state)
Branch `codex/m1r-gate3-schedule-audit` from `70b36525d`, clean tree at start. New files:
`consultant-synthesis.ts`, `consultant-synthesis.test.ts`,
`docs/halo/evidence/m1r/r3/three-store-synthesis.json`, this evidence doc. No change to
accepted-facts/accepted-findings/report layers; no runtime resolver change; no `/srv` write; no
raw XLSX/PII.

## Proof Delta B (outcome/validation)
- `consultant-synthesis` **13/13** (incl. /srv read-only equality: live == durable-fixture
  synthesis for all three stores).
- Deterministic: repeated builds are deep-equal; findings ranked by impact×confidence with
  stable ranks 1..n.
- Full suite, R1/R2 controls, typecheck/diff/PII, and /srv mtime checks: see the R3 checkpoint
  report. `/srv` durable brain.db unchanged.

---

# R3 impartial-shadow correction — six data-integrity gaps

The read-only shadow confirmed the 55 honest real-store measures, periods, Ford count
blocking/gross preservation, ranks, artifact equality, catalog accounting, and Sales-only/PII
boundaries, and flagged six acceptance gaps. All corrected below (narrow, bounded); artifact and
tests regenerated. Status: submitted-for-review, NOT self-certified.

## Corrections
1. **Zero denominator / no invalid numbers.** All divisions go through `ratioMeasure` (missing
   input → omit; present-but-zero denominator → EXPLICIT `blocked_measure` `zero_denominator`;
   never NaN/Infinity), including the confirmation gap. A `assertAllFinite` walk guards the whole
   emitted structure. Test: a fresh Appointments family with total=0 yields blocked ratios, no
   NaN/Infinity anywhere.
2. **Funnel redesign.** Removed the "weakest stage / biggest lever" ranking. Funnel measures are
   named snapshots; `funnel.lead_to_sale_yield` is explicitly END-TO-END YIELD (renamed from the
   misleading `lead_to_sale_rate`), not a transition stage. The new `r3-funnel-review` finding
   presents named snapshots and explicitly disclaims leakage/cause/biggest-lever.
3. **No unsupported causal/magnitude/intent/outcome claims.** Rewrote every finding's
   `proves`/`external_copy`/`business_consequence`/`next_action` to observation + testable
   recommendation. Removed the specific flagged phrases (absorbing effort, unlikely to arrive,
   turns a large share, reliably lifts, speed wins deals, paying off, etc.). A `PROHIBITED_CLAIM`
   scanner enforces this in the module and a test scans all four fields across the three stores;
   careful hypotheses remain only in `does_not_prove`/internal fields.
4. **Count-reconciliation lineage.** `r3-count-reconciliation` now cites
   `crm.row_count` + `dashboard.sold_in_period` (+ `gross.total_sum` for the separate gross
   statement) and its formula names both count sources. A per-finding EXACT evidence-ref template
   test rejects syntactically valid but irrelevant refs.
5. **Incompatible material is not a benchmark.** `benchmarkFor` is retired; every finding's
   `benchmark` is `no_benchmark`. The definition-incompatible appointment reference is kept only as
   an internal `incompatible_reference` (marked `definition_compatibility: 'incompatible'`); external
   copy never compares to it or names a standard (asserted; no `benchmark|industry|standard|foureyes|
   demandlocal` in external output).
6. **External-output bypass eliminated.** `toExternalNarrative(bundle)` now takes an
   AcceptedFactsBundle and rebuilds+validates internally; a caller-forged/tampered synthesis has no
   path to customer output. Test: honest bundles work; a forged bundle throws
   `AcceptedFactsValidationError`.

## Verification (correction)
- `consultant-synthesis` **19/19** (adds: zero-denominator, funnel-redesign, prohibited-claim scan,
  exact evidence-ref template, benchmark-reclassification, external-bypass; retains positive,
  period-mismatch, stale, missing-source, no-Service/Parts, determinism, /srv equality).
- Artifact `docs/halo/evidence/m1r/r3/three-store-synthesis.json` regenerated deterministically;
  no NaN/Infinity; finding ids reflect the redesign (`r3-funnel-review`, no `r3-funnel-dropoff`).
- Full suite / R1/R2 controls / typecheck / diff / PII / durable /srv before-after: see the R3
  correction checkpoint report.

---

# R3 re-review correction — govern the visit-to-sale numerator (visits_sold)

The re-review confirmed all six prior R3 items resolved and flagged one definition error:
`funnel.visit_to_sale_rate` was labeled sold/visits but used `dashboard.sold_in_period /
dashboard.total_visits`. The governed Dashboard reader exposes a DISTINCT `visitsSold` field; the
correct visit-to-sale values are Honda 4/26=15.4%, Nissan 4/17=23.5%, Ford 3/14=21.4%. Because the
correct governed source value already exists, the metric is CORRECTED (not omitted) via a bounded
accepted-fact contract extension (an already-governed source field, not a new source family).

## Change
1. **Accepted-fact contract:** added the exact context key `dashboard.visits_sold` (mapped only to
   `dealership_performance`) from the governed reader field `visitsSold`. Dashboard context is now
   **10 keys**; total accepted context is **22/store (66 across stores)**. The exact allowlist,
   family-subset, checksum/period/freshness, and all prior fail-closed checks are preserved.
2. **Visit-to-sale corrected:** `funnel.visit_to_sale_rate` = `dashboard.visits_sold /
   dashboard.total_visits` (label/formula/evidence refs updated). `dashboard.sold_in_period` is
   NEVER the visit-to-sale numerator. `funnel.lead_to_sale_yield` still correctly uses
   `sold_in_period / leads` (end-to-end yield). `r3-funnel-review` evidence now includes
   `dashboard.visits_sold`.
3. **Fixture:** the committed R2 durable fixture already carried `visitsSold` (Honda=4, Nissan=4,
   Ford=3) in the stored Dashboard reader summary; no fixture bytes changed. Live /srv read-only
   values equal the fixture (equality tests green).

## Correct values (this period)
| Store | visits_sold | total_visits | visit-to-sale |
|---|---|---|---|
| Serra Honda | 4 | 26 | 15.4% |
| Serra Nissan | 4 | 17 | 23.5% |
| Tony Serra Ford | 3 | 14 | 21.4% |

## Tests
`accepted-facts`: 22-context assertion; exact 10-dashboard subset incl. `dashboard.visits_sold`;
missing / wrong-family / altered-checksum `dashboard.visits_sold` all rejected.
`consultant-synthesis`: exact three-store visit-to-sale ratios; formula/inputs use
`dashboard.visits_sold`; visit-to-sale NEVER cites `sold_in_period` as numerator; funnel-review
evidence template includes `dashboard.visits_sold`.

## Verification (re-review)
- `accepted-facts` **40/40**, `accepted-findings` **17/17**, `consultant-synthesis` **20/20**.
- Artifact regenerated deterministically; visit-to-sale = 15.4% / 23.5% / 21.4%; 0 NaN/Infinity.
- Full suite / R1/R2/R3 controls / typecheck / diff / PII / durable /srv before-after: see the
  re-review checkpoint report. Authoritative 295 accounting and all prior controls preserved.
