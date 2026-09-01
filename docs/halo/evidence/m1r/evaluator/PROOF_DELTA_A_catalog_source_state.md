# Gate 2 — Proof Delta A (catalog / source / state)

**Branch:** `codex/halo-295-unshrinkable-inputs`. One writer. **Status:** Gate 2 evaluator
spine — submitted for review, NOT self-certified. The overall 885-cell goal is **NOT**
complete: **9 of 885** dealer-cells are `evaluated`; **876** are `unresolved` (preserved for
audit, do NOT count toward completion). The literal 885-cell acceptance is unchanged.

## Repair delta (repair #1 8ef112b0d→a1edadfff, then shadow FAIL → repair #2)

Repair #1 added the semantic validator + provenance/period binding + enforced Sales-only.
**Repair #2** makes the binding EXHAUSTIVE — the shadow found fields still unbound:

- **Baseline** — every field bound to the authoritative registry entry (id, basis, value,
  unit, comparator, direction, source, publication_date, url, confidence, definition). A
  wrong nonblank definition or an inserted benchmark number now fails.
- **Confidence** — canonical basis (`denominator sample size`) required exactly, not just
  nonblank; label recomputed.
- **Lineage** — now also binds `gmail_attachment_id` (fabricated id fails; explicit
  `unavailable` valid only when the envelope says so) and `observed_date_range` (false range
  fails).
- **Row↔catalog/dealer/placement** (the material defect: a rooftop relabel used to survive)
  — `metric_id`, `condition`, `dealer_id`, `profile`, `section`, `subsection`, `cluster`,
  `related_metric_ids`, `evidence_or_inference`, `recommended_owner/action`,
  `notification_or_automation_candidate`, `customer_pdf_location`,
  `internal_evidence_location` are recomputed from the `CatalogCondition`/`DealerInput` +
  shared deterministic derivations (`placement.ts`); `unresolved_*` must be null; `status`
  must be `evaluated`. A dealer/profile relabel now fails; a coordinated row+lineage relabel
  fails against the admitted DealerInput/envelope (value recompute diverges).
- **Proof/format truth** — the generator now emits actual Prettier-clean JSON via a shared
  serializer (`scripts/m1r-evaluator/serialize.ts`); committed ledger == fresh generation ==
  Prettier output, all byte-identical.
- **Completeness guard** — a test enumerates every `required_row_field` and proves mutating
  any one flips the verdict to false (no field escapes semantic validation).

## Catalog + scope

- Canonical catalog `docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json`:
  **295** unique, sequential `SW-001..SW-295` (asserted by `loadCatalog`, fail-closed).
- Spine = 295 conditions × 3 rooftops {21043, 21044, 21047} = **885** unique
  `(metric_id, dealer_id)` rows.
- Held/accepted families used for values: `appointments`, `crm_sales_gross`,
  `dealership_performance`. Quarantined families never used: `lead_source_roi`, `cage_kpi`,
  `sales_comm_log`.

## Evaluated set (9 cells)

| metric_id | source_family          | formula                                  | baseline (operational target)        |
| --------- | ---------------------- | ---------------------------------------- | ------------------------------------ |
| SW-031    | dealership_performance | appts_set_total / leads_total            | OT-SW-031 (< 0.25, higher_is_better) |
| SW-032    | appointments           | count(Is Show=Yes) / appointment rows    | OT-SW-032 (< 0.55, ratified)         |
| SW-041    | appointments           | count(Is No Show=Yes) / appointment rows | OT-SW-041 (> 0.45, ratified)         |

Each evaluated for all three rooftops (9 cells); each passes BOTH the structural predicate
AND the semantic validator, with a non-zero integer denominator, envelope-bound lineage,
variance, rating, rank, and confidence.

## Unresolved accounting (876 cells, by reason)

| count | reason                                                                            |
| ----- | --------------------------------------------------------------------------------- |
| 510   | source is (or joins) a quarantined family (ROI / CAGE / Sales-Communication)      |
| 168   | requires a non-VinSolutions external source                                       |
| 105   | outside the governed boundary (Service / cross-rooftop / compliance / enrichment) |
| 24    | source unavailable or retention-limited                                           |
| 21    | Dashboard gives an AVERAGE, not the definitional median; no business-hours filter |
| 21    | requires manual CRM inspection; no scheduled export                               |
| 9     | second-order composite needing a trend/threshold basis                            |
| 9     | condition-specific (SW-008 / SW-034 / SW-042 / SW-043 / SW-049)                   |
| 3     | SW-050 denominator integrity (0 new deals ×2; 2/4 blank Front Gross ×1)           |

Total unresolved = 876. Evaluated + unresolved = 885.

## Boundaries honored

DEV/isolated. No `/srv`, no promotion, no deploy, no Gmail/VinSolutions/schedule/CRM
mutation. No raw XLSX/JPEG committed; the ledger is NON-PII (aggregate integer
numerator/denominator + rates + governed envelope metadata only — no customer names, no
VINs; the only 17-char digit runs are ratio decimals, not VINs). Nine held files admitted by
exact filename+full-sha256 allowlist; the nine quarantined files are never read.

## Changed / new files (SHA-256 first 16)

| File                                                  | sha256:16          |
| ----------------------------------------------------- | ------------------ |
| `src/server/reports/evaluator/types.ts`               | `a9c3f51c66c75684` |
| `src/server/reports/evaluator/catalog.ts`             | `b14b19f61b993911` |
| `src/server/reports/evaluator/families.ts`            | `b5b40f5a192271d3` |
| `src/server/reports/evaluator/provenance.ts`          | `5b59b74ad312a46b` |
| `src/server/reports/evaluator/metric-spec.ts`         | `a027012716a0dc3d` |
| `src/server/reports/evaluator/placement.ts`           | `e06e9ab35b06a1cb` |
| `src/server/reports/evaluator/held-inputs.ts`         | `872c59b1801484bf` |
| `src/server/reports/evaluator/metrics.ts`             | `c758413b45609a56` |
| `src/server/reports/evaluator/evaluators.ts`          | `3afa78bb2e52b376` |
| `src/server/reports/evaluator/strict-predicate.ts`    | `ebc697ab597014c1` |
| `src/server/reports/evaluator/semantic-validator.ts`  | `0de678e2aa272134` |
| `src/server/reports/evaluator/baseline-registry.ts`   | `468146e3593e173b` |
| `src/server/reports/evaluator/spine.ts`               | `48434828f6507d67` |
| `src/server/reports/evaluator/build-from-fresh.ts`    | `83576baf82c0357a` |
| `scripts/m1r-evaluator/build-spine.ts`                | `39991844404e267b` |
| `scripts/m1r-evaluator/serialize.ts`                  | `9c5eff5124a2f242` |
| `docs/halo/contract/baseline-registry.json`           | `b7d63d6f9fe88dfe` |
| `docs/halo/contract/gate2-evaluator-contract.json`    | `345043ca3edbb074` |
| `docs/halo/evidence/m1r/evaluator/spine-ledger.json`  | `c028e22794dfa58e` |
| `docs/halo/evidence/m1r/evaluator/spine-summary.json` | `45b2c87b6f29491c` |

Every `sha256:16` above is recomputed from the current committed bytes and compared by
`src/test/evaluator-evidence-hashes.test.ts`, so a later formatting cycle that desyncs this
proof fails the suite instead of shipping a stale hash.
