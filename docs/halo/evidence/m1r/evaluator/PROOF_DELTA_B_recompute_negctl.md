# Gate 2 — Proof Delta B (independent recompute / negative-control outcome)

Independent recomputation + adversarial negative controls for the repaired Gate 2 evaluator
spine. Gate 2 only; the overall 885-cell goal is **NOT** complete (9 of 885 evaluated).

## Recompute (evaluated values reproduce from held bytes)

| metric_id            | 21043 (honda)  | 21044 (nissan) | 21047 (ford)  | baseline | direction        |
| -------------------- | -------------- | -------------- | ------------- | -------- | ---------------- |
| SW-031 lead→appt set | 10/92 = 0.1087 | 9/58 = 0.1552  | 6/38 = 0.1579 | < 0.25   | higher_is_better |
| SW-032 show rate     | 8/14 = 0.5714  | 2/6 = 0.3333   | 3/7 = 0.4286  | < 0.55   | higher_is_better |
| SW-041 no-show rate  | 5/14 = 0.3571  | 3/6 = 0.5000   | 4/7 = 0.5714  | > 0.45   | lower_is_better  |

- SW-031 reconciles to the source Dashboard "Appts Set %" TOTAL (±1e-6); SW-032/041 match
  the RATIFIED R2 definitions. Confidence honest: low (appts n=6–14), medium (leads 38–92).

## Semantic validator — non-vacuous corruption detection (repair req 1)

`validateEvaluatedRow` recomputes every value + derived field and binds lineage to the
delivery envelope. Adversarial tests (`evaluator-semantic-validator.test.ts`, 31 cases)
prove an authentic row passes and each single corruption fails with the intended clause:

| corruption                                                                             | detected                                                       |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| value / numerator / denominator changed                                                | value_inconsistent / numerator_mismatch / denominator_mismatch |
| source_fields / unit / formula / source_family                                         | \*\_mismatch                                                   |
| baseline id / value / basis / comparator / direction / blank definition                | baseline\_\*\_mismatch / baseline_definition_blank             |
| baseline.value=null or basis=industry_benchmark                                        | baseline_value_unverified / baseline_basis_mismatch            |
| variance / rating / rank / confidence altered                                          | \*\_incorrect (recomputed)                                     |
| lineage sha / filename / dealer / period / sender / subject / message-id / period_hint | lineage\_\*\_mismatch                                          |
| falsified sales_only_proof                                                             | lineage_proof_falsified                                        |

A legitimate cohort difference (honda rank 1 vs nissan rank 3) changes ONLY rank; both
validate ok — proving rank is genuinely cohort-recomputed, not a rubber stamp.

## Provenance + period binding (repair req 2)

`evaluator-provenance-period.test.ts` (14 cases): `buildEnvelope` fails closed on missing
sender/subject/gmail_message_id, wrong sender/source_type, bad sha, and a non-range
period_hint; absent attachment id encodes `unavailable` (never invented). Readers reject
out-of-period Appointment Start Date, out-of-window CRM Sold Date, and bind the period from
`period_hint`.

## Sales-only enforced, not asserted (repair req 3)

`evaluator-negative-controls.test.ts` (12 cases): non-Sales appointment reason, duplicate
Appointment ID, foreign Dealer ID, Service/Parts token in any data row, dashboard without an
affirmative Service exclusion, Service in an inclusion filter, and wrong Dashboard Lead Types
all fail closed. The `sales_only_proof` string is produced from the executed checks and is
bound by the semantic validator (a falsified proof is rejected).

## Determinism + no synthetic values (req 7, 9)

- `buildSpineFromFresh` twice → identical rows; committed `spine-ledger.json` equals a fresh
  recompute byte-for-byte (asserted in `evaluator-spine.test.ts`, runIf held files).
- Generator rerun → `spine-ledger.json` sha256:16 `5fec99a542e0ea48` unchanged.
- No mock/synthetic value: every evaluated numerator/denominator recomputes from held bytes.

## Completion guard (req 2, 3)

- `evaluated (9)` < `required_cells (885)` → NOT complete. Old six + current nine both fail.
- Every `unresolved` row FAILS the strict predicate; the metric spec is bound to the
  contract (`evaluator-metric-spec.test.ts`), so spec drift is caught.

## Validation summary

- Focused Gate 2 suite **95/95** (spine 13, strict-predicate 18, semantic-validator 31,
  provenance-period 14, negative-controls 12, baseline-registry 6, metric-spec 1) +
  evidence-hash guard 2 = 97; plus Gate 1 + consumer regressions green.
- Typecheck 498 == baseline (zero new Gate 2 errors); lint + prettier clean; deterministic
  byte-identical rerun; no `/srv` write; no raw file / PII committed.
