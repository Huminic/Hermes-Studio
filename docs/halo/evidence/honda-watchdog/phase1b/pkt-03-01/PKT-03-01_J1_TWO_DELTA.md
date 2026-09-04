# PKT-03-01 J1 — two-delta (evidence Δ vs meaning Δ)

Internal governance evidence. Not a customer artifact. Module 3 (Pipeline Health/Funnel + Appointment).

- Baseline commit: `c9e4c760ad72ad6620e20a094c5530a3a69e0791`
- Binding: `docs/halo/contract/phase1b/pkt-03-01-binding.json`
- Customer emission authority: **FALSE** (no customer file/output/send; future display eligibility is metadata only).

## Deltas (exactly 0/12 each)

- **Evidence delta:** 0 / 12. The four accepted metrics (SW-031/032/033/041) are **carry-forward** of already-accepted+evaluated Honda truth — NOT new evidence. The eight held metrics acquired nothing.
- **Meaning delta:** 0 / 12. No value/grade authored or changed. Accepted metrics preserved byte-semantically (value/target/rating/numerator/denominator/period/provenance/current_truth_ref); held metrics produce no value.

## Per-ID lifecycle

| ID | disposition | evaluation | carry-forward | source dep / gap |
|---|---|---|---|---|
| SW-031 | measured_validated | measured_graded | yes | dealership_performance |
| SW-032 | measured_validated | measured_graded | yes | appointments |
| SW-033 | measured_validated | measured_graded | yes | dealership_performance |
| SW-034 | source_investigation_pending | not_measured | — | crm_sales_gross |
| SW-035 | source_investigation_pending | not_measured | — | multi_source_funnel_join |
| SW-036 | source_investigation_pending | not_measured | — | multi_source_funnel_join |
| SW-037 | source_investigation_pending | not_measured | — | multi_source_funnel_join |
| SW-038 | source_investigation_pending | not_measured | — | stage_history_audit |
| SW-039 | source_investigation_pending | not_measured | — | stage_history_audit |
| SW-040 | source_investigation_pending | not_measured | — | stage_history_audit |
| SW-041 | measured_validated | measured_graded | yes | appointments |
| SW-042 | source_investigation_pending | not_measured | — | appointments |

## Accepted carry-forward (pinned, unchanged)

| ID | value | target | rating | num/den | period |
|---|---|---|---|---|---|
| SW-031 | 10.9% | < 0.25 | breach | 10/92 | 2026-08-24..2026-08-30 |
| SW-032 | 57.1% | < 0.55 | watch | 8/14 | 2026-08-24..2026-08-30 |
| SW-033 | 0% | < 0.6 | breach | 0/8 | 2026-08-24..2026-08-30 |
| SW-041 | 35.7% | > 0.45 | healthy | 5/14 | 2026-08-24..2026-08-30 |

## Invariants

- authoritative_evaluated = 17 unchanged; the 4 master-ledger rows byte-identical to baseline (incl. current_truth_ref); no recalc/regrade.
- Zero Service/Parts admitted; quarantined cage_kpi/lead_source_roi/sales_comm_log unusable; SW-033 uses HELD dealership_performance (Gate 4B substitution), not cage_kpi.
- Missing is not zero; no source substitution/inference; SW-034 Deal Performance candidate-only; SW-038/039/040 require finite positive investigation before any terminal unavailable.
- SW-042: bounded read-only hour-precision timestamp discovery (1 help + 1 UI + 1 probe), field-minimized/aggregate-only, no PII/raw/message-content capture, no promotion; Duane anchor/target only after field proof.
