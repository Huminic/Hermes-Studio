# Gate 2 — Proof Delta B (independent recompute / negative-control outcome)

Independent recomputation + adversarial negative controls for the Gate 2 evaluator spine.
Gate 2 only; the overall 885-cell goal is **NOT** complete (9 of 885 evaluated).

## Recompute (evaluated values reproduce from held bytes)

| metric_id            | 21043 (honda)  | 21044 (nissan) | 21047 (ford)  | baseline | direction        |
| -------------------- | -------------- | -------------- | ------------- | -------- | ---------------- |
| SW-031 lead→appt set | 10/92 = 0.1087 | 9/58 = 0.1552  | 6/38 = 0.1579 | < 0.25   | higher_is_better |
| SW-032 show rate     | 8/14 = 0.5714  | 2/6 = 0.3333   | 3/7 = 0.4286  | < 0.55   | higher_is_better |
| SW-041 no-show rate  | 5/14 = 0.3571  | 3/6 = 0.5000   | 4/7 = 0.5714  | > 0.45   | lower_is_better  |

- SW-031 computed rate reconciles to the source Dashboard "Appts Set %" TOTAL cell (±1e-6).
- SW-032 / SW-041 match the RATIFIED R2 `appt.show_rate` / `appt.no_show_rate` definitions
  (numerator = Is Show / Is No Show count; denominator = appointment rows).
- Confidence is honestly **low** for the appointment metrics (n = 6–14) and **medium** for
  SW-031 (leads 38–92) — small held weekly samples, not certainties.

## Determinism + no synthetic values (req 7, 9)

- `buildSpineFromFresh` run twice → identical rows; committed `spine-ledger.json` equals a
  fresh recompute byte-for-byte (asserted in `evaluator-spine.test.ts`, runIf held files).
- Generator rerun → `spine-ledger.json` sha256:16 `6a1efd36e534b86a` unchanged.
- No mock/synthetic value: every evaluated numerator/denominator is recomputed from the
  held XLSX bytes; nothing is hand-entered.

## Negative controls (all enforced by test)

| control                                                      | outcome                                        |
| ------------------------------------------------------------ | ---------------------------------------------- |
| Service token in appointments / crm / dashboard **data** row | reader throws (fail closed)                    |
| Dashboard Filters without an affirmative Service exclusion   | throws (cannot prove Sales-only)               |
| Service in an **inclusion** filter (Lead Types)              | throws (fail closed)                           |
| Foreign Dealer ID (not the one rooftop)                      | throws                                         |
| Non-XLSX bytes                                               | throws (bad magic)                             |
| Appointments total 0 / Dashboard leads 0 or blank            | NotEvaluable (missing ≠ zero)                  |
| Quarantined family as source                                 | no evaluated row ever sourced from it          |
| Remove any one required proof field from an evaluated row    | strict predicate flips to false (17 mutations) |

## Completion guard (req 2, 3)

- `evaluated (9)` < `required_cells (885)` → NOT complete. The old six R5 cells (SW-032/041)
  and the current nine both fail completion.
- Every `unresolved` row FAILS the strict predicate, so unresolved/withheld/cataloged/
  accounted can never be silently counted as evaluated.

## Validation summary

- Focused Gate 2 suite: **49/49** (spine 13, strict-predicate 18, negative-controls 12,
  baseline-registry 6) + evidence-hash guard.
- Lint clean; prettier clean; deterministic generator byte-identical on rerun.
- No `/srv` write; no raw file / PII committed.
