# M1R Gate 5 — Reader-Integration Implementation Map (PREPARATORY ONLY — 2026-08-30)

**STATUS: PREPARATORY ONLY — NOT GATE ACCEPTANCE. This is a read-only implementation map for the later
reader-integration gate. It authorizes no implementation now. No code, classifier, contract, matrix,
readiness, DB, ingest, schedule, production, deploy, merge, or LifePath change is made or implied.
Global Gate 3 and Gate 4 remain HOLD/PENDING; all 18 readiness cells remain `false`.**

Date: 2026-08-30 (America/New_York)
Controller / outcome owner: Codex (reports to Duane)
Bounded writer (sole Andromeda repo writer): Claude Code in isolated clone
`/home/ubuntu/hs-m1r-isolated-20260830`, branch `codex/m1r-gate3-schedule-audit` @
`a6ba8ace0f09ae6ceb663a1d7ebf8636f6feca38`
Related: [[GATE3_CUSTOM_GATE4_CURRENT_2026-08-30]], [[GATE3_HIDDEN_LEAD_INTENT_BLOCKER_2026-08-30]]

## 0. Provenance and non-transplant caveat
- **OBSERVED** — repo files in this clone + the recoverable isolated ingest checkout, read-only.
- The isolated functions are **reference implementations, not drop-in transplants**. Any port requires
  adaptation to this clone's storage/reader shape and its ratified contract, plus new tests here. Do not
  assume any isolated function can be moved unchanged.

## 0A. Shadow audit result — limited PASS on corrected evidence integrity (prior FAIL historical)
**Current result:** the same conflict-screened Shadow re-audited the corrected revision
(`fec05dd03bf525b23d84d75f17b7658d6cbcac89`) and returned **PASS — corrected evidence integrity only**.
**Historical:** the prior revision (`2aae7cbb`) received a Shadow **FAIL — evidence integrity** (preserved
below as history) on four
corrections now applied: (1) §2 selection semantics conflated Halo `selectDelivery` (newest-wins) with
isolated `listActiveRows` (no newest-wins; safe only via explicit period); (2) §3 `crm_sales_gross`
mislabeled **PARTIAL** — it is **MISSING** (the existing `gross.total_sum` is a Dashboard-family value),
plus a source-precedence/reconciliation note was owed; (3) §5 catalog inventory omitted
`comm.multi_rep_within_24h`, which **is** present in this clone's catalog; (4) §4 conflated held-store
artifacts with gate4-inbox harness-classified files and over-used "golden" for unpinned files.
- **Shadow limits (preserved, unchanged by the PASS):** prior read-only branch exposure; **same-system
  functional separation, not institutional/external independence**; Shadow holds **no authorship, no
  mutation, and no approval** authority, and **no gate or readiness authority**. Both the FAIL and this
  PASS are **evidence-integrity only** — the PASS confirms the four corrections are faithfully recorded
  and implies **no Gate 3 or Gate 4 acceptance and no readiness advancement**.
- **This revision's corrections are now Shadow-verified (limited PASS), not self-PASS.** Global
  Gate 3/4 remain HOLD/PENDING; all 18 readiness stay `false`.

## 1. Two code planes + exact recoverable ref
- **Halo/Studio plane (this clone)** — the report path that must eventually consume accepted deliveries.
  Reader: `src/server/ingest-native-metrics.ts`; wiring: `src/server/watchdog/metric-values.ts` (imports
  **only** `readAppointments`, `readDealershipPerformance`); catalog `src/server/watchdog/metric-catalog.ts`.
  **No `vin-metrics.ts` exists in this clone.**
- **Isolated ingest plane (recoverable)** — checkout `/home/ubuntu/hs-ingest-dev`, branch
  **`dev/ingest-endpoint`** @ **`4c41df11dc48c3bc954ffdd45cdf125b2d67c2d5`**; also in bundle
  **`/tmp/m1r-gate1-recovery-20260830/dev-ingest-endpoint.bundle`** (`refs/heads/dev/ingest-endpoint`
  → same head). Classifier `src/server/ingest/vin-contracts.ts` (`evaluateDelivery`, `FAMILIES`);
  six-family readers `src/server/watchdog/vin-metrics.ts` (**last-touched commit `33e136d84`**), entry
  `runVinWatchdog`; row store `src/server/ingest/ingest-delivery-store.ts` (`listActiveRows`).

## 2. Accepted-delivery storage shape (both planes)
Per-profile `brain.db` under `BRAIN_PROFILES_ROOT` (live M1R store `/srv/ingest-dev/analytics/<profile>/brain/brain.db`):
- `ingest_delivery(id, profile, dealer, report_kind, period_start, period_end, source_filename,
  source_filter_metadata, final_filter_metadata, checksum, parser_version, source_row_count,
  accepted_row_count, header_json, revision, validation_evidence, status, quarantine_reason,
  superseded_by, created_at)`
- `ingest_row(delivery_id, row_index, row_json[JSON array])`
- **Selection semantics differ — do NOT conflate:**
  - **Halo `selectDelivery`** explicitly chooses the **single newest accepted, non-superseded** delivery:
    `WHERE profile=? AND report_kind=? AND status='accepted' AND superseded_by IS NULL ORDER BY
    period_end DESC, revision DESC LIMIT 1`.
  - **Isolated `listActiveRows`** does **NOT** choose newest. Without period arguments it returns rows
    from **every** accepted, non-superseded matching delivery for that `report_kind`. The current
    promotion/analytics flow is safe **only because `runVinWatchdog` is invoked with an explicit period**
    that narrows to one delivery — the store call itself has no newest-wins guard. Any later Halo port
    must supply the Halo `selectDelivery` newest-wins selection, not rely on `listActiveRows` alone.
- **Row-count integrity (both):** parsed rows must equal `accepted_row_count`.

## 3. Six-family reader status + exact current/reusable paths
| Family | Classifier (isolated `vin-contracts.ts`) | Halo reader (this clone) | Reusable reference impl (isolated `vin-metrics.ts`) |
|---|---|---|---|
| appointments | FAMILIES (`Appt Reason`="Sales Appointment", Sheet1) | **WIRED** `readAppointments` (`ingest-native-metrics.ts`) | `appointmentMetrics` — confirmed/show/no_show/cancel_rate (+ reschedule_rate, catalog gap §5) |
| dealership_performance | multi-section classifier | **WIRED** `readDealershipPerformance` → `gross.total_sum` from TOTAL | `dashboardMetrics` (+ section_markers, catalog gap §5) |
| lead_source_roi | FAMILIES (`Base Report Name`=Lead Source ROI, governed-eight) | **MISSING** (metric-values.ts note: withheld until native ROI reader exists) | `roiMetrics` — roi.total_leads, roi.sold_from_leads, roi.duplicate_rate (roi.actual_roi **withheld**, cost=0) |
| cage_kpi | FAMILIES (`Base Report Name`=Enterprise Performance, three-sales; narrow last-row TOTAL exemption) | **MISSING** (metric-values.ts note: no governed native source) | `cageMetrics` — cage.rep_count, cage.total_comms, cage.deals_from_leads |
| sales_comm_log | FAMILIES (daily; domainFields Lead Type/Status/Source; Message Content hashed) | **MISSING** | `commMetrics` — template_overuse, escalation_keyword_screen, inbound_high_intent_keywords, multi_rep_within_24h (+ outbound_link_only, catalog gap §5) — all `provisional` |
| crm_sales_gross | FAMILIES (Sheet1 per-deal) | **MISSING** — there is **no** crm_sales_gross Halo reader. The existing `gross.total_sum` is derived from the **dealership_performance** Dashboard TOTAL (a *different* family), not from CRM Sales Gross. | `grossMetrics` — gross.total_sum + gross.reconciliation_mismatches (within-row Front+Back≠Total) |

**Source-precedence / reconciliation decision (deferred — future gate, business rule NOT chosen here).**
A CRM Sales Gross per-deal reader (`grossMetrics`) would emit the **same** `gross.total_sum` slug that
`dealership_performance` already produces from the Dashboard TOTAL. Later implementation therefore **must
not mix, double-count, or silently substitute** the two sources. Recommended technical shape: for the
same period, **reconcile both sources** and expose the governed **chosen** source under an **explicit
precedence rule**, surfacing any Dashboard-vs-CRM mismatch rather than hiding it. The choice of *which*
source is authoritative is a **business rule** and is **not decided here**.

## 4. Available real-file artifacts (candidate goldens — NOT pinned goldens)
"Golden" is used only for a file **pinned in a test harness**. None are pinned yet, so the items below are
**candidate artifacts**, separated by provenance.
- **Positive candidate artifacts = 3 cells only** (live accepted store `/srv/ingest-dev/analytics`):
  Honda appointments `b189a920…` (18 rows, Sales-only), Honda dealership_performance `39560ef1…`,
  Nissan dealership_performance `6123ef87…` (all period 2026-08-17..23). Eligible to become the
  per-cell positive golden once pinned in a reader test.
- **Available negative/quarantine artifacts — HELD store** (`/srv/ingest-dev/hold/<profile>/quarantine/`):
  ROI×3 (`2ed4cb68/50ad0502/22694a14`), CAGE Nissan/Ford (`59b012f0/f344bb68`), comm-log×3, CSVs.
- **Available negative artifacts — GATE4-INBOX (separate; NOT in hold):** current SN21044 ROI
  `b7977c07…` and CAGE `2884e56e…` are controller-downloaded files in
  `~/filestore/serra-reports/gate4-inbox/`, classified `quarantined non-sales-lead-type` via a **temp
  read-only harness** ([[GATE3_HIDDEN_LEAD_INTENT_BLOCKER_2026-08-30]]). They were **not** landed to the
  hold store and must not be conflated with the held artifacts above.
- **In-repo fixtures:** none usable — `src/test/fixtures/` holds only `reconciliation/README.md`; **no
  committed real-file XLSX artifact.**
- **15 of 18 positive per-cell artifacts remain UNAVAILABLE** (require clean accepted deliveries; **no
  quarantined file may substitute or be promoted**).

## 5. Catalog-alignment gaps (VERIFIED against this clone's `metric-catalog.ts`)
The isolated readers compute slugs that are **NOT present** in this clone's catalog (grep = 0 hits each):
`comm.outbound_link_only`, `dashboard.section_markers`, `appt.reschedule_rate`, and `roi.actual_roi`
(the last is emitted **withheld** in the isolated impl). This clone's catalog contains: appt.{cancel,
confirmed,no_show,show}_rate; cage.{deals_from_leads,rep_count,total_comms}; comm.{escalation_keyword_
screen,inbound_high_intent_keywords,**multi_rep_within_24h**,template_overuse}; gross.{reconciliation_
mismatches,total_sum}; roi.{duplicate_rate,sold_from_leads,total_leads} (plus engagement.* hub slugs).
(**Correction:** `comm.multi_rep_within_24h` **is** in this clone's catalog and is listed above; the four
named gaps remain absent.) **Implication:** a port must not surface those four isolated slugs through the
Halo catalog until/unless the catalog is separately
extended under its own change; doing so now would emit an unlisted metric.

## 6. Missing tests per the ratified 18-cell contract (9 required per cell)
Already present in this clone: appointments+dashboard reader units (`ingest-native-metrics.test.ts`,
`metric-values-native.test.ts`), `metric-values-missing-not-zero.test.ts`, classify
(`report-ingest-classify.test.ts`), catalog (`watchdog-metric-catalog.test.ts`).
**Missing for every not-yet-wired cell (ROI, CAGE, comm, per-deal gross × 3 stores):**
`reader_calculation_unit`, `service_parts_negative`, `wrong_dealer_negative`, `wrong_period_negative`,
`schema_negative`, `provenance_negative`, and the **`real_file_golden_per_store_family`** positive golden
(15 of 18 cells have no positive real-file golden yet).

## 7. Smallest later code/test file set (PROPOSED filenames — do not yet exist)
- **Proposed code (new Halo modules, one per missing reader, mirroring `ingest-native-metrics.ts`,
  reusing `selectDelivery`; calc bodies adapted from isolated `vin-metrics.ts`):**
  `read-lead-source-roi.ts`, `read-cage.ts`, `read-sales-comm.ts`, `read-crm-sales-gross.ts`, plus an
  availability-safe extension of `metric-values.ts`.
- **Proposed tests (do not yet exist):** `ingest-native-roi.test.ts`, `ingest-native-cage.test.ts`,
  `ingest-native-comm.test.ts`, `ingest-native-crm-gross.test.ts` — each with reader-unit + the five
  negatives + missing-not-zero, plus a golden harness that pins each per-store real file **only once a
  clean accepted delivery exists.**
- These are **proposed**, not created; no scaffolding is added by this document.

## 8. Semantic hard boundaries (exact — preserved as constraints)
- **ROI metrics only from Lead Source ROI** (`roiMetrics`); never from Dashboard.
- **Per-deal gross reconciliation only from CRM Sales Gross** (`grossMetrics.reconciliation_mismatches`);
  Dashboard yields only split `gross.total_sum`.
- **One appointments denominator** — all `appt.*` rates share "total accepted appointment rows".
- **Sales Communication is provisional / no thread identity / no causality / NOT a status-history
  proxy** — comm metrics stay `provisional`, `NO_THREAD`, `NO_CAUSALITY`; the unavailable status-change
  history is never simulated from comm rows.
- **Missing is not zero** — readers return `{available:false, reason}`, never 0.
- **Service/Parts fail closed — whole delivery** — quarantine at the classifier; readers compute only
  over accepted, non-superseded rows (`runVinWatchdog` contamination guard).
- **Quarantined files are never promoted** — including current SN21044 ROI/CAGE.

## 9. Sequencing (one gate / one writer)
- **No Gate-5 implementation may start while Gate 3/4 receipt and source-definition evidence is
  unresolved** — one control gate and one writer at a time. This map is preparation only.
- **The Monday 08:00 EDT `Vin Monday 18-cell receipt validation` remains the next authoritative event**
  (see [[GATE3_CUSTOM_GATE4_CURRENT_2026-08-30]] §7); Monday originals (period 2026-08-24..30) establish
  cross-store scope before any downstream work.
- Gate-5 acceptance additionally requires, per cell: a wired Halo reader, the full 9-test set, and its own
  real-file positive golden. Until every cell meets that, all 18 readiness stay `false`.

## 10. Changed paths (this document; docs-only)
- **Added:** this file `docs/halo/evidence/m1r/GATE5_READER_INTEGRATION_PREP_2026-08-30.md`.
- **Amended (minimal):** `issues.md` — one linked pointer bullet.
- **Unchanged:** all protected contract/matrix/18-cell docs, code, classifier, tests, DB, ingest,
  schedules, production, LifePath.
