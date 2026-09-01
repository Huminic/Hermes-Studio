# Gate 2 — Proof Delta A (catalog / source / state)

**Branch:** `codex/halo-295-unshrinkable-inputs`. One writer. **Status:** Gate 2 evaluator
spine — submitted for review, NOT self-certified. The overall 885-cell goal is **NOT**
complete: **18 of 885** dealer-cells are `evaluated`; **867** are `unresolved` (preserved for
audit, do NOT count toward completion). The literal 885-cell acceptance is unchanged.

> **Gate 4A supersession (2026-09-01).** This proof originally recorded **9 evaluated / 876
> unresolved** (SW-031/032/041 only). Gate 4A promoted **SW-011, SW-012, SW-015** for all
> three governed dealers from the already-accepted VinSolutions Custom Reporting **Leads**
> family (browser_capture provenance), so the current committed artifacts hold **18 evaluated
> / 867 unresolved**. The narrative, evaluated-set table, unresolved-reason table, held-family
> list, and the recomputed hashes below are truth-aligned to that current state; the earlier
> 9/876 figures are the pre-Gate-4A history. No other metric statuses changed; no customer PDF
> authored.

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
  `dealership_performance`, `vinsolutions_custom_reporting_leads` (Leads, browser_capture).
  Quarantined families never used: `lead_source_roi`, `cage_kpi`, `sales_comm_log`.

## Evaluated set (18 cells)

| metric_id | source_family                       | formula                                                                     | baseline (operational target)         |
| --------- | ----------------------------------- | --------------------------------------------------------------------------- | ------------------------------------- |
| SW-011    | vinsolutions_custom_reporting_leads | median(Actual Response Time (Min) where Originated After Hours=No, numeric) | OT-SW-011 (> 10 min, lower_is_better) |
| SW-012    | vinsolutions_custom_reporting_leads | strict-untouched leads / business-hours population                          | OT-SW-012 (> 0, lower_is_better)      |
| SW-015    | vinsolutions_custom_reporting_leads | reps with mean response ≥ 2× store median / reps with numeric response      | OT-SW-015 (> 0, lower_is_better)      |
| SW-031    | dealership_performance              | appts_set_total / leads_total                                               | OT-SW-031 (< 0.25, higher_is_better)  |
| SW-032    | appointments                        | count(Is Show=Yes) / appointment rows                                       | OT-SW-032 (< 0.55, ratified)          |
| SW-041    | appointments                        | count(Is No Show=Yes) / appointment rows                                    | OT-SW-041 (> 0.45, ratified)          |

Each evaluated for all three rooftops (18 cells); each passes BOTH the structural predicate
AND the semantic validator, with a non-zero integer denominator, envelope-bound lineage,
variance, rating, rank, and confidence. SW-011 is a `statistic` (a median in minutes; its
value is bound to the recomputed candidate, not to numerator/denominator); SW-012/015 are
ratios. The three Leads metrics persist non-PII coverage/count/distribution detail in
`evaluation_detail` (recomputed + bound by the semantic validator); Sales Rep is aggregated
in-memory for SW-015 and NEVER persisted as a name.

## Unresolved accounting (867 cells, by reason)

| count | reason (closure category)                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 510   | source is (or joins) a quarantined family (ROI / CAGE / Sales-Communication)                                                         |
| 168   | requires a non-VinSolutions external source                                                                                          |
| 105   | outside the governed boundary (Service / cross-rooftop / compliance / enrichment)                                                    |
| 24    | source unavailable or retention-limited                                                                                              |
| 21    | requires manual CRM inspection; no scheduled export                                                                                  |
| 12    | response-time definition mismatch (Dashboard AVERAGE, no business-hours filter) — remaining after SW-011/012/015 promoted from Leads |
| 9     | second-order composite needing a trend/threshold basis (SW-111/113/114 ×3)                                                           |
| 6     | missing field (SW-008 lead-source attribution, SW-034 write-up count) ×3                                                             |
| 6     | trend history needed (SW-043 3-week, SW-049 30-day) ×3                                                                               |
| 3     | definition mismatch (SW-042 confirm-within-24h) ×3                                                                                   |
| 3     | denominator integrity (SW-050: 0 new deals ×2; 2/4 blank Front Gross ×1)                                                             |

Total unresolved = 867 (510+168+105+24+21+12+9+6+6+3+3). Evaluated + unresolved = 885. The
response-time definition-mismatch category dropped from 21 to 12 because SW-011/012/015 (×3
dealers = 9 cells) are now evaluated from the accepted Leads family; reconciled by the Gate 3
closure views.

## Boundaries honored

DEV/isolated. No `/srv`, no promotion, no deploy, no Gmail/VinSolutions/schedule/CRM
mutation. No raw XLSX/JPEG committed; the ledger is NON-PII (aggregate integer
numerator/denominator + rates + governed envelope metadata only — no customer names, no
VINs; the only 17-char digit runs are ratio decimals, not VINs). Nine scheduled held files
admitted by exact filename+full-sha256 allowlist, plus the three accepted Leads captures
(browser_capture; capture_id + reporting host + filename + full sha256 + period, bound from
the committed non-PII golden); the nine quarantined files are never read.

## Changed / new files (SHA-256 first 16)

| File                                                  | sha256:16          |
| ----------------------------------------------------- | ------------------ |
| `src/server/reports/evaluator/types.ts`               | `13ddf3fde4d953d0` |
| `src/server/reports/evaluator/catalog.ts`             | `b14b19f61b993911` |
| `src/server/reports/evaluator/families.ts`            | `7a301282b24b6f3e` |
| `src/server/reports/evaluator/provenance.ts`          | `0a29238f0799bac9` |
| `src/server/reports/evaluator/metric-spec.ts`         | `52ed55e806a17a00` |
| `src/server/reports/evaluator/placement.ts`           | `e06e9ab35b06a1cb` |
| `src/server/reports/evaluator/held-inputs.ts`         | `872c59b1801484bf` |
| `src/server/reports/evaluator/metrics.ts`             | `c758413b45609a56` |
| `src/server/reports/evaluator/evaluators.ts`          | `25989edc9d6d731b` |
| `src/server/reports/evaluator/leads-metrics.ts`       | `249a0c1c503d2ee9` |
| `src/server/reports/evaluator/strict-predicate.ts`    | `ebc697ab597014c1` |
| `src/server/reports/evaluator/semantic-validator.ts`  | `9ede8938717d6cff` |
| `src/server/reports/evaluator/baseline-registry.ts`   | `468146e3593e173b` |
| `src/server/reports/evaluator/spine.ts`               | `61d72d70066f63c8` |
| `src/server/reports/evaluator/build-from-fresh.ts`    | `d39a2978a56e6162` |
| `scripts/m1r-evaluator/build-spine.ts`                | `39991844404e267b` |
| `scripts/m1r-evaluator/serialize.ts`                  | `9c5eff5124a2f242` |
| `docs/halo/contract/baseline-registry.json`           | `273db41f3c10a6a4` |
| `docs/halo/contract/gate2-evaluator-contract.json`    | `53070c5d06b10dca` |
| `docs/halo/evidence/m1r/evaluator/spine-ledger.json`  | `c30cee6d7c5d4835` |
| `docs/halo/evidence/m1r/evaluator/spine-summary.json` | `0baa233b5cc69118` |

Every `sha256:16` above is recomputed from the current committed bytes and compared by
`src/test/evaluator-evidence-hashes.test.ts`, so a later formatting cycle that desyncs this
proof fails the suite instead of shipping a stale hash.
