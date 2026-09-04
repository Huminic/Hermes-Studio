# PKT-02-03 J2 — activation two-delta (metadata/control only; J2R1 contract-control fixes)

Internal governance evidence. Not a customer artifact. J2 is metadata/control activation of the frozen J1 binding.

- Baseline commit: `9837bb9f2c5e7ea753deeb2db8005e64a8852294`
- Activation time (UTC): `2026-09-04T03:57:17Z` (distinct from source-data freshness)
- Enhanced source registered (already held, capability-only): `SRC-enhanced_sales_communication_log_weekly-0002`
- v2 controls (`packet-schema-1b-v2.json`, `source-registry-1b-v2.json`) are `frozen:true` and additive to their frozen v1 (v1 profile/dealer/nodes/reuse-receipts/invariants preserved byte-semantically, incl. the SW-013/SW-014 Leads-exclusion invariant).

## Deltas

- **Evidence delta (acquisition):** 0 / 11. J2 acquired/admitted/normalized/promoted NOTHING; the enhanced raw was already held; registry addition is bookkeeping, not acquisition.
- **Meaning delta (measurement):** 0 / 11. No value/formula/threshold/grade/alert; nothing measured/graded/scored; no customer output.
- **Customer delta:** 0 / 11 visible. accepted_measured empty; customer_report_emitted=false.
- **Authoritative-truth delta:** 0. authoritative_evaluated stays 17; evaluated_17, Service overlay (18), and all non-target rows byte-identical.

## Ledger activation (11 rows; 14 chained transitions across 8 changed rows)

| ID | disposition (J2) | transitions appended | ledger owner (immediate) | source dep |
|---|---|---|---|---|
| SW-135 | data_acquired_calculation_pending | 2 | duane | SRC-enhanced_sales_communication_log_weekly-0002 |
| SW-136 | data_acquired_calculation_pending | 2 | duane | SRC-enhanced_sales_communication_log_weekly-0002 |
| SW-137 | data_acquired_calculation_pending | 2 | codex | SRC-enhanced_sales_communication_log_weekly-0002 |
| SW-138 | data_acquired_calculation_pending | 2 | duane | SRC-enhanced_sales_communication_log_weekly-0002 |
| SW-139 | data_acquired_calculation_pending | 2 | duane | SRC-enhanced_sales_communication_log_weekly-0002 |
| SW-140 | source_investigation_pending | 0 | codex | — |
| SW-141 | data_acquired_calculation_pending | 2 | duane | SRC-enhanced_sales_communication_log_weekly-0002 |
| SW-261 | additional_history_required | 1 | duane | — |
| SW-262 | source_investigation_pending | 0 | duane | — |
| SW-288 | source_investigation_pending | 0 | duane | — |
| SW-295 | additional_history_required | 1 | duane | — |

## Transition paths (frozen-adjacency valid)

- Six enhanced: `source_investigation_pending → crm_available_acquisition_pending → data_acquired_calculation_pending` (two same-activation records, distinct reasons, nondecreasing).
- SW-261 / SW-295: `source_investigation_pending → additional_history_required` (one record).
- SW-140 / SW-262 / SW-288: NO transition; disposition stays `source_investigation_pending`; arrays byte-identical.

## Legacy validator (exactly pinned)

`validate_phase1b.py` (frozen v1) cannot read the additive v2 registry. J2 adds EXACTLY six `source ... not registered` errors for the six enhanced rows — the expected v1-cannot-read-v2 consequence, NOT a pass. The remaining 24 baseline errors are pinned by canonical signature `f8b9496337c6ad9a…`; a same-count swap is rejected. v2 dependencies are validated by `validate_pkt_02_03.py`.

## Boundaries

- No acquire/read/export/analyze content; no browse Vin; no admit/promote/calculate/grade/alert/customer output/merge/deploy/production/Gmail/schedule.
- Frozen J1 five artifacts byte-unchanged; only the exact 10-file allowlist touched; `.claude/` never staged.
