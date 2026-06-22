---
name: defensible-dashboard-funnel
description: Read the Workspace Dashboard's defensible, metric-split lead funnel for any store. Use when asked about a store's leads/opportunities/appointments/sold funnel, lead-source performance, or why dashboard numbers differ from the CRM. Counts come from the live CRM API (sales-scoped, deduped); report-only metrics come from an uploaded report or render "needs supplemental data".
disable-model-invocation: true
---

# Defensible Dashboard Funnel

The Workspace Dashboard funnel is **metric-split**: every number is either
defensible or honestly absent — never inflated. This skill explains the rules and
how to read it so the capability is portable across deployments and stores.

Implementation (for portability — these modules are self-contained and inject
their dependencies):
- `src/server/lead-opportunities.ts` — defensible lead COUNTS from the live API.
- `src/server/crm-guru.ts` — canonical funnel assembler + Brain persistence.
- `src/server/dashboard-metrics.ts` — `buildDashboard` wires them together.

## The rules (documented + defensible)

**Lead COUNTS come from the live CRM API** (`vin_query_leads`), not the uploaded
report's raw `total_leads` (which includes BAD + DUPLICATE rows and blends
service). The engine:
- paginates EVERY page of the window (stops on the reported total or a short
  page; caps at `MAX_PAGES` and surfaces `capped`);
- scopes to SALES lead types — `INTERNET | PHONE | WALK_IN`; drops `SERVICE | PARTS_ORDER`;
- drops `BAD` (`leadStatusType`);
- dedupes by `contact` (customer id), falling back to `leadId`.

**Report-only metrics** — Contacted, Appointments Set/Shown, Sold, time-to-X,
gross — come from the uploaded VinSolutions report in the Brain
(`report_lead_source_roi` / `report_kpi_salesperson`). When **no report covers
the selected window**, each such metric renders the literal text
**"needs supplemental data"** — never a fabricated or inflated number.

**Conversions** are computed only between two report-sourced stages. The
Leads→Contacted and Leads→Opportunities conversions are intentionally `null`:
dividing a report count by an API-deduped count is not defensible.

## How to read it

`GET /api/customer/dashboard?profile=<store>&window_days=30` → `funnel`:
- `lead_performance.stages` / `pipeline_performance.stages` — each `{ now, status, conversion, trend }`. `status: 'pending'` + `now: null` means "needs supplemental data".
- `lead_performance.timings` — `status: 'pending'` with `source: "needs supplemental data"` when absent.
- `lead_sources` — per-source rows; `total_leads` is the defensible API count; report-only columns (good_leads, appts, sold, gross) attach where the source name matches.

Provenance (persisted with each canonical snapshot in Brain `canonical_funnel`):
- `leads_source`: `'api'` (defensible) or `'unavailable'` (API unreadable → Leads pending).
- `leads_capped`: true when the API window hit the page ceiling (may undercount).
- `metrics_source`: `'report'` or `'needs_supplemental'`.
- `report_as_of`: the report period the metrics came from, or null.

## All stores

Store-agnostic: every entry point takes a `profile` and resolves the per-store
VIN org id via `resolveVinOrgId` and per-store config via `readStudioConfig`. A
store without VIN federation scope or a configured org id returns Leads as
pending (never a fabricated count) — the funnel degrades honestly rather than
showing wrong numbers. To enable defensible counts for a new store, configure its
VIN read-scope + org id in the profile (the existing federation mechanism); no
code change.

## Guardrails

- Never present a number the funnel marks `pending` / `null` as if it were real — say "needs supplemental data".
- Counts are sales-scoped + deduped; they will be LOWER than the CRM's raw lead totals by design. That difference is the dedupe/scoping rule, and it is defensible — explain it, don't "fix" it by reverting to raw totals.
- If `leads_capped` is true, flag that the count may undercount (the window exceeded the page ceiling).
- Timing / gross / appointments are report-only — if there is no report for the window, they are "needs supplemental data", not zero.
