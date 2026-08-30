# M1R Data Coverage Contract (Halo — Sales-only)

**Status:** Gate 2 coverage contract — ratified by Codex (2026-08-30, America/New_York). Project-owned
authoritative copy under the Halo repository. **M1R readiness is `false` for all 18 cells in this pass;**
later gates must satisfy every requirement below. This document does not authorize Gate 3, reader
implementation, ingestion, browser/VinSolutions work, schedules, CRM, email, Service work, or production.

**Permanent boundary — SALES ONLY.** Service and Parts belong only to the separately governed combined
Serra Service workspace and never enter the three Sales profiles, their saved definitions, Filters, rows,
transformations, metrics, or narratives. Missing is not zero; quarantined/withheld/stale/readerless is not
accepted. The Serra Service workspace is out of scope for this contract.

## Machine-readable artifacts (this directory / `contract/`)
- `contract/semantic-watchdog-feasibility-matrix-295.json` — authoritative 295-condition matrix (SHA-256
  `29c7ac06130f9b4fe8d5df0a2d0d6fffed7c6ff4dc02eca96e0f44d109a04fc1`; array length 295). Original rows and
  historical classes preserved byte-for-byte.
- `contract/semantic-watchdog-classification-summary.json` — seven-class summary (SHA-256
  `e41f5a28021f19a7f9146622c7afaeefcfc546941ce4aed196ccf0e406fee3aa`).
- `contract/service-domain-overlay.json` — additive current-scope Service overlay (18 IDs).
- `contract/coverage-matrix-18cell.json` — the 18 native cells with full per-cell contract.
- `../../scripts/validate-m1r-coverage-contract.mjs` — read-only validator (writes no output).

The runtime alert-picker `src/server/watchdog/metric-catalog.ts` (19 IDs) is an executable subset linked to
the 295 by anchors; it is not the full catalog. The operator taxonomy
`uploads/semantic-watchdog-catalog.md` is **historical/reference only** (it uses `SCRAPE`/CSV/"available
now" wording that conflicts with the current schema contract) and is **not** current executable acquisition
authority.

## 1. Store identity map (exact)
| profile | Dealer ID | dealer name token |
|---|---|---|
| `serra-honda` | `21043` | Serra Honda |
| `serra-nissan` | `21044` | Serra Nissan |
| `tony-serra-ford` | `21047` | Tony Serra Ford |

## 2. Six native families (authoritative signatures in `SCHEMA_CONTRACT.md`)
1. **lead_source_roi** — Lead Source ROI (weekly). XLSX data sheet + Filters. Tenant from Filters (no Dealer
   column). Sales proof: Base Report Name = Lead Source ROI, Lead Type = governed eight, Lead Intent must not
   positively select Service/Parts. Slugs: `roi.total_leads`, `roi.sold_from_leads`, `roi.duplicate_rate`.
2. **cage_kpi** — Enterprise Performance / CAGE (weekly). XLSX data + Filters. Sales proof: Base Report Name =
   Enterprise Performance, Lead Type {Internet,Phone,Walk-in}. Slugs: `cage.total_comms`,
   `cage.deals_from_leads`, `cage.rep_count`. (Separate family from the Communication Log.)
3. **sales_comm_log** — Sales Communication Log (daily). XLSX single day. Metric columns `Message Content`
   (hashed), `Direction`, `Customer`. Slugs: `comm.*`.
4. **crm_sales_gross** — CRM Sales Gross (weekly, per-deal rows). XLSX Sheet1, no Filters. Coverage
   `period_hint` range required. Slugs: `gross.total_sum`, `gross.reconciliation_mismatches`.
5. **appointments** — Appointments (weekly). XLSX Sheet1, no Filters. Sales proof: `Appt Reason = "Sales
   Appointment"` every row. Slugs: `appt.show/no_show/confirmed/cancel_rate`.
6. **dealership_performance** — Dealership Performance Dashboard (weekly, multi-section). Filters one dealer +
   Lead Type {Internet,Phone,Walk-in}. Source of `gross.total_sum` (TOTAL summary). Not itself a slug family.

## 3. Ratified M1R freshness / acceptance policy (America/New_York; DST-safe calendar arithmetic)
Readiness recognizes only **`current`**. `aging`, `stale`, `unknown`, absent, invalid, quarantined,
withheld, or readerless **fail**.
- **Weekly native families** (ROI, CAGE, CRM Sales Gross, Appointments, Dashboard): period must equal the
  most-recently completed Monday–Sunday week at evaluation; period-end age ≤ 8 calendar days; scheduler
  receipt/capture ≤ 72h after period end. All three checks mandatory.
- **Daily Sales Communication**: period must equal the immediately preceding completed local calendar day;
  exact one-day window; scheduler receipt/capture ≤ 36h after period end; evaluation age ≤ 2 calendar days.
  No gap may be relabeled current.
- **Weekly Response Times (browser source)**: most-recently completed Mon–Sun week; period-end age ≤ 8 days;
  capture ≤ 48h after period end; source URL host exactly `vinsolutions.app.coxautoinc.com`; browser
  provenance requires capture_id, source_url, captured_at, declared_report_kind, profile/dealer, period, raw
  SHA; raw CSV preserved unchanged beside derivative; derivative lineage and excel-day×1440 conversion
  declared.
- The existing reporting-layer 8/14 policy (`report-model.ts`) remains **reporting semantics only**; M1R uses
  the stricter source rules above.

**Analytical acceptance ≠ M1R readiness.** A family in the Brain `ingest_delivery` ledger with
`status=accepted` is *analytically accepted historical/current ledger evidence*. It becomes *M1R-readiness
accepted* only when it is additionally current under the gate freshness policy above, reader-backed, tested
(§5), and contract-clean. No cell is M1R-ready in this pass.

## 4. Ratified Service policy (see `contract/service-domain-overlay.json`)
- Preserve the original 295 rows and historical classes byte-for-byte.
- Additive Service overlay = exactly 18 IDs: SW-079, SW-081, SW-083, SW-115, SW-118, SW-199, SW-222, SW-223,
  SW-224, SW-225, SW-226, SW-227, SW-228, SW-229, SW-263, SW-270, SW-279, SW-294. Historical origins: 8
  scheduled+calc, 2 external, 8 outside-boundary.
- Current eight-class overlay (sums 295): 20 native scheduled; 154 scheduled+calc/NLP; 54 external; 7 native
  manual export; 8 unavailable/retention; 7 manual CRM inspection; 27 other outside-boundary; 18
  Service-domain separate/out-of-Sales.
- SW-176 and SW-274 are false-positive exclusions. SW-082 and SW-218 stay unresolved/withheld from Sales
  until source proof establishes no Service dependency.
- No Service/Parts condition may appear in any of the three Sales profiles' supported/available metric sets.

## 5. Ratified 18-cell test contract
Current truth preserved exactly: **3 analytically accepted, 8 present-current-contract-invalid, 7 absent
(total 18)**. Analytical acceptance is not M1R readiness. For every profile × family cell, before readiness:
family validator positive; reader/calculation unit; missing-is-not-zero; Service/Parts negative; wrong-dealer
negative; wrong-period negative; schema negative; provenance negative; and one immutable real governed-file
golden for that exact store/family. Current invalid real files may serve as **negative goldens only**. Current
absent cells require explicit missing evidence now and a positive real-file golden later. No synthetic fixture
alone can satisfy the real-file golden. Native XLSX bytes/headers and provenance remain authoritative;
**ROI/CAGE CSV is quarantine-only and cannot be promoted.**

Current-state summary (full per-cell contract in `contract/coverage-matrix-18cell.json`):
| family \\ store | Honda 21043 | Nissan 21044 | Ford 21047 |
|---|---|---|---|
| lead_source_roi | present-invalid | present-invalid | present-invalid |
| cage_kpi | absent | present-invalid | present-invalid |
| sales_comm_log | present-invalid | present-invalid | present-invalid |
| crm_sales_gross | absent | absent | absent |
| appointments | **accepted** | absent | absent |
| dealership_performance | **accepted** | **accepted** | absent |

## 6. Reader / calculation status
- Wired in hs-watchdog Halo path (`ingest-native-metrics.ts` → `metric-values.ts`): **only**
  `readAppointments` + `readDealershipPerformance`. `gross.total_sum` is derived from the Dashboard TOTAL
  summary.
- **Missing hs-watchdog readers:** `lead_source_roi`, `cage_kpi`, `sales_comm_log`, and per-deal
  `crm_sales_gross` reconciliation. The isolated ingest branch `vin-metrics.ts` has six-family readers, but
  they are not wired into the Halo report path.
- **Split gross:** isolated `vin-metrics.ts` `grossMetrics` computes `gross.total_sum` +
  `gross.reconciliation_mismatches` from per-deal `crm_sales_gross`; hs-watchdog derives only
  `gross.total_sum` from the Dashboard TOTAL and withholds reconciliation. **Split gross reconciliation
  requires CRM Sales Gross, not Dashboard alone.**

## 7. External / browser register (corrected)
- **CRM activity stream** — PARTIAL via the Sales Communication Log (channel, timestamp, user, customer
  label). Current delivery is contract-invalid. Absent: stable IDs, full ordered thread, and status-change
  history.
- **Appointments (events)** — a row-level native status/timestamp export (Start, Confirmed, Rescheduled,
  Completed); it is **not** a full transition-history stream. **Status-change history is unavailable.**
- **Prior-year baseline** — a separate archive/backfill requirement, distinct from the current
  `<3 governed periods` dealer-baseline rule (`insufficient_history`).
- **Ad spend / ROI cost** — the ROI report carries ad-spend/cost schema, but governed delivered values are
  zero, so actual spend is unavailable.
- **GA / session data and non-Vapi store PBX phone logs** — external, non-VinSolutions; unavailable.
- **Conversation-history opportunity mining** — partial/withheld (Studio hub 0 threads all three; Comm Log
  quarantined).
- **Response Times** — present as labeled browser readback for all three stores (period 2026-08-17..23);
  weekly cadence; browser provenance envelope required; raw CSV preserved unchanged beside derivative
  (excel-day×1440). Response Times is **separate labeled browser evidence, not a native-family slug**.
- **Stable-ID limitation** applies to ordered-thread/causal communication metrics, **not** to every safe
  provisional single-row communication metric.

## 8. Validation
Run `node scripts/validate-m1r-coverage-contract.mjs` (read-only; writes nothing). It verifies source SHAs,
295 sequential IDs, historical/overlay class counts (295), the 18-cell 3/8/7 current state, readiness=false,
required per-cell fields and test/golden flags, Service-exclusion from Sales, ROI/CAGE CSV quarantine-only,
and Response Times browser separation. A PASS is recorded in
`evidence/m1r/GATE2_COVERAGE_CONTRACT_PASS_2026-08-30.md`.
