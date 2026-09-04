# PKT-03-01 J2 — activation two-delta (metadata/control only)

Internal governance evidence. Not a customer artifact. Module 3 activation of the frozen J1 binding.

- Baseline commit: `844a1673d492774d9c69bb1f2555cb5a249573d3`
- Activation time (UTC): `2026-09-04T05:09:51Z` (labeled J2 activation time; not source freshness)
- v2 controls UNMODIFIED (schema-v2 `f137…`, registry-v2 `bcf1…`); no new source-registry node.

## Deltas (exactly 0/12 each)

- **Evidence delta:** 0 / 12. The 4 accepted metrics are carry-forward (not new evidence); the 8 held acquired nothing (no source dependency added).
- **Meaning delta:** 0 / 12. No value/grade authored or changed. Accepted rows byte-identical; held produce none.
- **Transitions appended:** 0. Every target row's existing transition array is preserved byte-identically (self-transitions forbidden). authoritative_evaluated stays 17.

## Accepted 4 — byte-identical carry-forward (unchanged)

| ID | value | target | rating | disposition | transitions |
|---|---|---|---|---|---|
| SW-031 | 10.9% | < 0.25 | breach | measured_validated | 1 (unchanged) |
| SW-032 | 57.1% | < 0.55 | watch | measured_validated | 1 (unchanged) |
| SW-033 | 0% | < 0.6 | breach | measured_validated | 1 (unchanged) |
| SW-041 | 35.7% | > 0.45 | healthy | measured_validated | 1 (unchanged) |

## Held 8 — activated (metadata only; disposition unchanged, no transition)

| ID | disposition | source_existence (J2) | report (J2) | owner | transitions |
|---|---|---|---|---|---|
| SW-034 | source_investigation_pending | investigation_pending | withheld_no_delivery | codex | 1 (unchanged) |
| SW-035 | source_investigation_pending | investigation_pending | withheld_no_delivery | duane | 1 (unchanged) |
| SW-036 | source_investigation_pending | investigation_pending | withheld_no_delivery | duane | 1 (unchanged) |
| SW-037 | source_investigation_pending | investigation_pending | withheld_no_delivery | duane | 1 (unchanged) |
| SW-038 | source_investigation_pending | investigation_pending | withheld_no_delivery | codex | 1 (unchanged) |
| SW-039 | source_investigation_pending | investigation_pending | withheld_no_delivery | codex | 1 (unchanged) |
| SW-040 | source_investigation_pending | investigation_pending | withheld_no_delivery | codex | 1 (unchanged) |
| SW-042 | source_investigation_pending | investigation_pending | withheld_no_delivery | codex | 1 (unchanged) |

## Legacy validator

`validate_phase1b.py` = the pinned canonical 30-error signature (`2cbf86a6361f4c67…`) UNION **0 new**. Metadata updates use valid vocab, append no transition, and add no source dependency, so nothing new is introduced. Same-count substitution is rejected.

## Boundaries

- Metadata/control only: no acquire/read/export/admit/promote/calculate/grade/alert/customer output/merge/deploy.
- Frozen J1 five + schema-v2 + registry-v2 byte-unchanged; only the 8-file allowlist touched; `.claude/` never staged.
- Zero Service/Parts; quarantined cage_kpi/lead_source_roi/sales_comm_log unusable; missing not zero; no substitution/inference; no PII/raw/content.
