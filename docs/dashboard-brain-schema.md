# DataStore Brain — Dashboard Reporting Schema

**Status:** active · **Owner:** Workspace/Dashboard · **Last updated:** 2026-06-18

This document defines the per-profile DataStore Brain tables that back the
Workspace **Dashboard** tab (Funnel / Leads / Pipeline / AI Activity). It is the
authoritative schema referenced by the Dashboard goal's Data Layer requirement:
*"Derive the Brain schema from the most recent spreadsheet, create tables/fields
cleanly, and document them."*

## Source of truth

Schema is **derived from the two most-recent operator-provided spreadsheets**
(by mtime) under `../nexxus2.2_replit/uploads/Data_5:15/extracted/`:

| File | Date | Grain | Feeds |
|------|------|-------|-------|
| `SerraAuto_LeadSourceROI_Combined_2026-05-13.csv` | 2026-05-13 | one row per (dealer, lead_source) | Funnel · Leads-by-source · Pipeline-performance |
| `SerraAuto_KPI_MTD_All_Stores_2026-05-13.csv` | 2026-05-13 | one row per (dealer, lead_type, salesperson) | Pipeline (by salesperson) |

Both cover three dealers (Serra Honda of Sylacauga, Serra Nissan of Sylacauga,
Tony Serra Ford). Ingestion filters to the rows for the active profile's dealer.

These are **VinSolutions ROI / KPI exports**. They are *uploaded* analytics
snapshots — distinct from the **live** VinSolutions lead funnel (queried at read
time via `vin_query_leads`, never persisted; see `customer-reports.ts`). The
Brain tables below hold the *uploaded snapshot* data only.

## Tables (per-profile Brain, `brain.db`)

Created lazily (`CREATE TABLE IF NOT EXISTS`) by `report-ingest.ts`, mirroring
the existing `vin_watcher_trigger` lazy-table pattern in `customer-reports.ts`.
All tables carry `tenant` (= profile slug) for parity with the DSG record
families.

### `report_imports` — provenance ledger (one row per ingested file)

| column | type | notes |
|--------|------|-------|
| `id` | TEXT PK | uuid |
| `ts` | INTEGER | ingest time (epoch ms) |
| `report_kind` | TEXT | `lead_source_roi` \| `kpi_salesperson` |
| `filename` | TEXT | original upload filename |
| `source_upload_id` | TEXT | FK to `uploads.id` (nullable for direct ingest) |
| `checksum` | TEXT | sha-256 of file bytes (idempotency) |
| `dealer` | TEXT | dealer name the rows were filtered to |
| `period_start` | TEXT | ISO date if derivable from filename, else null |
| `period_end` | TEXT | ISO date if derivable from filename, else null |
| `row_count` | INTEGER | rows written |
| `tenant` | TEXT | profile slug |

A re-upload with the same `checksum` + `report_kind` replaces the prior import's
rows (delete-by-import then re-insert) so the dashboard never double-counts.

### `report_lead_source_roi` — from `SerraAuto_LeadSourceROI_Combined`

One row per lead source. Percent columns are stored as REAL fractions (0–1;
`"23.08%"` → `0.2308`). Currency stored as REAL (`"$6,070.91"` → `6070.91`).

| column | type | source CSV column |
|--------|------|-------------------|
| `id` | TEXT PK | (uuid) |
| `import_id` | TEXT | (FK report_imports.id) |
| `dealer` | TEXT | Dealer |
| `lead_source` | TEXT | Lead_Source |
| `total_leads` | INTEGER | Total_Leads |
| `good_leads` | INTEGER | Good_Leads |
| `bad_leads` | INTEGER | Bad_Leads |
| `duplicate_leads` | INTEGER | Duplicate_Leads |
| `bad_other_leads` | INTEGER | Bad_Other_Leads |
| `customers_influenced` | INTEGER | Customers_Influenced |
| `sold_in_timeframe` | INTEGER | Sold_in_Timeframe |
| `sold_in_timeframe_pct` | REAL | Sold_in_Timeframe_Pct |
| `sold_from_leads` | INTEGER | Sold_from_Leads |
| `sold_from_leads_pct` | REAL | Sold_from_Leads_Pct |
| `avg_days_to_sale` | REAL | Avg_Days_to_Sale |
| `internet_attempted_contact` | INTEGER | Internet_Attempted_Contact |
| `internet_attempted_contact_pct` | REAL | Internet_Attempted_Contact_Pct |
| `internet_actual_contact` | INTEGER | Internet_Actual_Contact |
| `internet_actual_contact_pct` | REAL | Internet_Actual_Contact_Pct |
| `internet_avg_attempts_to_contact` | REAL | Internet_Avg_Attempts_to_Contact |
| `appts_set` | INTEGER | Appts_Set |
| `appts_set_pct` | REAL | Appts_Set_Pct |
| `appts_scheduled` | INTEGER | Appts_Scheduled |
| `appts_scheduled_pct` | REAL | Appts_Scheduled_Pct |
| `appts_confirmed` | INTEGER | Appts_Confirmed |
| `appts_confirmed_pct` | REAL | Appts_Confirmed_Pct |
| `appts_shown` | INTEGER | Appts_Shown |
| `appts_shown_pct` | REAL | Appts_Shown_Pct |
| `avg_days_to_appt_set` | REAL | Avg_Days_to_Appt_Set |
| `total_visits` | INTEGER | Total_Visits |
| `initial_visits` | INTEGER | Initial_Visits |
| `be_back_visits` | INTEGER | Be_Back_Visits |
| `avg_days_to_initial_visit` | REAL | Avg_Days_to_Initial_Visit |
| `avg_days_initial_visit_to_be_back` | REAL | Avg_Days_Initial_Visit_to_Be_Back |
| `total_front_gross` | REAL | Total_Front_Gross |
| `avg_front_gross` | REAL | Avg_Front_Gross |
| `total_back_gross` | REAL | Total_Back_Gross |
| `avg_back_gross` | REAL | Avg_Back_Gross |
| `total_gross` | REAL | Total_Gross |
| `avg_gross` | REAL | Avg_Gross |
| `total_cost` | REAL | Total_Cost |
| `cost_per_good_lead` | REAL | Cost_Per_Good_Lead |
| `cost_per_sold` | REAL | Cost_Per_Sold |
| `profit` | REAL | Profit |
| `period_start` / `period_end` | TEXT | (from import) |
| `tenant` | TEXT | profile slug |

### `report_kpi_salesperson` — from `SerraAuto_KPI_MTD_All_Stores`

One row per (lead_type, salesperson).

| column | type | source CSV column |
|--------|------|-------------------|
| `id` | TEXT PK | (uuid) |
| `import_id` | TEXT | (FK report_imports.id) |
| `dealer` | TEXT | Dealer |
| `lead_type` | TEXT | Lead_Type |
| `salesperson` | TEXT | Salesperson |
| `internet_leads` | INTEGER | Internet_Leads |
| `internet_leads_sold_pct` | REAL | Internet_Leads_Sold_Pct |
| `internet_actual_contact` | INTEGER | Internet_Actual_Contact |
| `internet_actual_contact_pct` | REAL | Internet_Actual_Contact_Pct |
| `appts_set` | INTEGER | Appts_Set |
| `appts_set_pct` | REAL | Appts_Set_Pct |
| `appts_shown` | INTEGER | Appts_Shown |
| `appts_shown_pct` | REAL | Appts_Shown_Pct |
| `appts_shown_sold` | INTEGER | Appts_Shown_Sold |
| `appts_shown_sold_pct` | REAL | Appts_Shown_Sold_Pct |
| `calls_out` | INTEGER | Calls_Out |
| `emails_out` | INTEGER | Emails_Out |
| `texts_out` | INTEGER | Texts_Out |
| `total_comms` | INTEGER | Total_Comms |
| `period_start` / `period_end` | TEXT | (from import) |
| `tenant` | TEXT | profile slug |

## Spec-metric → source mapping

The Dashboard renders **only** what a source provides. Anything not present in
the most-recent spreadsheet (and not available live) is rendered as
**"data source pending"** — never fabricated (spec honesty rule G).

### Funnel · Lead Performance (green funnel, 7 metrics)

| spec metric | source | status |
|-------------|--------|--------|
| Lead Source Performance | `report_lead_source_roi` (ranked by lead_source) | ✅ sourced |
| Time to First Contact | — | ⏳ **data source pending** (not in the 05-13 export; the export carries *contact rate* `internet_actual_contact_pct`, not days-to-first-contact) |
| Time to First Discussion | — | ⏳ **data source pending** (not in the export) |
| Time to Appointment Set | `avg_days_to_appt_set` | ✅ sourced |
| Time to Appointment | — | ⏳ **data source pending** (export has `avg_days_to_initial_visit`, a *different* event than appt date; not equated) |
| Time to Sale | `avg_days_to_sale` | ✅ sourced |
| Total Sales | Σ `sold_from_leads` (and `sold_in_timeframe`) | ✅ sourced |

### Funnel · Pipeline Performance (blue funnel, Now / Comparison)

| spec metric | source |
|-------------|--------|
| Leads | Σ `total_leads` |
| Opportunities | Σ `good_leads` |
| Appointments | Σ `appts_set` |
| Sales | Σ `sold_from_leads` |

### Leads tab

| spec element | source |
|--------------|--------|
| New / Active / Abandoned (names if available, else counts) | **live VIN** `vin_query_leads` `by_status` + resolved names (`customer-reports.lead_funnel`); Abandoned = lost/inactive statuses |
| Leads by Lead Source | `report_lead_source_roi.total_leads` grouped by `lead_source` |

### Pipeline tab (rows = salesperson)

| column | source (`report_kpi_salesperson`) |
|--------|-----------------------------------|
| Leads | `internet_leads` |
| Opportunities | `internet_actual_contact` (engaged/contacted) |
| Appointments | `appts_set` |
| Sales | `appts_shown_sold` |

### AI Activity (9 metrics)

All from **live** local stores (`customer-reports` / `messaging-hub-store` /
`hunches-store` / `uploads`), not the spreadsheet:

| spec metric | source |
|-------------|--------|
| Conversations | `comms.threads.total` |
| Calls Received | `comms.calls_in` (inbound voice) |
| Video Sessions | messages channel `video`+`tavus` |
| Web Chats | messages channel `chat` |
| Emails Sent | messages channel `email`+`email-adf` outbound |
| Texts Sent | `comms.texts_out` |
| Calls Made | messages channel `voice` outbound |
| Hunches | `hunches` count (Semantic Guardian) |
| InfoStore Updates | `uploads` count |

AI Observation narrative is **derived deterministically from the above real
metrics** (rule-based, conservative tone) — no invented claims.

## Period-over-period comparison

The dashboard date selector (7 / 30 / 90 days) drives a current window and an
immediately-preceding window of equal length. Live metrics are recomputed per
window. Uploaded-snapshot metrics (`report_*`) are point-in-time exports; when
only one import exists the comparison column reads **"no prior period"** rather
than a fabricated delta. When ≥2 imports exist, the prior import is the
comparison.
