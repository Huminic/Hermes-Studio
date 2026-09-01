# Enhanced Sales Communication Log (WEEKLY browser export) — family contract

**Family:** `enhanced_sales_communication_log_weekly` · **State:**
`proposed_extension_pending_consumer_acceptance` · **Gate:** 4C1 (admission + capability plan;
**promotes zero SW metrics**). Machine mirror: `enhanced-sales-communication-log-weekly-contract.json`
(a test asserts the two never drift).

## What this is — and is NOT

A NEW, fail-closed **browser-export** family for the authenticated, read-only VinConnect
"Communication Log" **weekly** export (24-column CSV). It is intentionally **SEPARATE** from and
does **not reuse or relax** the existing strict single-day scheduled Sales Communication family
(`sales_comm_log`, which remains quarantined). Distinct slug, distinct provenance, distinct
schema, distinct restricted-data policy.

## Provenance (browser export)

- **Source host:** `vinsolutions.app.coxautoinc.com` (VinConnect app; `/vinconnect/` path).
- **Report host (separate):** `reporting-vinsolutions.app.coxautoinc.com`
  (`/VinAnalyticsDashboards/` path) — the analytics host that renders the Communication Log.
- Both admitted hosts are exact; evil subdomains, suffix attacks (`…coxautoinc.com.evil.com`),
  non-https, wrong path, and explicit ports all fail closed. **Ports are rejected from the RAW
  URL authority before normalization**, so an explicit `:443` (which `URL.port` normalizes to
  empty) also fails.
- **Capture id:** `VIN-COMM-WEEKLY-YYYYMMDD-<dealerId>` — binds the rooftop AND the capture
  DATE: the id's `<dealerId>` must equal the manifest `dealer_id`, and its `YYYYMMDD` must equal
  the `captured_at` calendar date (a different-date / different-rooftop capture id fails closed).
- **Required per capture:** capture_id, profile, dealer_id/name, source_url, report_url,
  captured_at (with explicit tz offset), declared_report_kind, reporting_period, declared
  rows/columns/unique_lead_ids/sha256, filename, **and BOTH** `filter_evidence_sha256`
  (filter-selection screenshot) **and** `applied_result_evidence_sha256` (post-apply screenshot
  proving the applied `08/24/2026 – 08/30/2026` period + counts). Manifest SHA-256 and every
  screenshot/CSV SHA are recomputed from the manifest; any drift fails closed.
- **Exact agreement enforced (shadow HOLD repair):** the manifest `dealer` NAME must equal the
  contracted rooftop name AND every CSV row's `Dealer` must match it; the filename's embedded
  `_YYYY-MM-DD_YYYY-MM-DD` period must equal the contracted/captured window (a 1999-period
  filename binding current data fails closed).

## Schema (exact 24 columns, fail-closed)

`Dealer, User Group, User, Customer, Dealer ID, Activity Date, Direction, Comm Channel,
Comm Type, Interaction Result, Lead Type, Lead Status Type, Lead Status, Lead Source Group,
Lead Source, Lead Created Date, Make, Message Content, Text Attachment, Text Image, Text Video,
Global Customer ID, Lead ID, Communication ID`. BOM-prefixed, RFC-4180 quoted; parsed with a
proper CSV parser (Message Content contains commas/newlines/quotes).

## Sales-only, fail-closed acceptance

Every row: **Comm Type = Sales**; **Dealer ID** = the one governed rooftop; **Activity Date**
within `2026-08-24..2026-08-30` (America/New_York); **Communication ID** complete + unique.
**Zero Service/Parts** tokens across all categorical fields **including User Group** (Message
Content is deliberately excluded from the scan — it is restricted content, never read as text
for matching). Zero wrong-dealer rows. Reader-computed unique Communication/Lead ID counts and
observed activity min/max must reconcile to the manifest. Missing/malformed → fail closed.

## Privacy — restricted raw, PII-minimized derivative

The raw CSVs carry customer + employee + message content and are **RESTRICTED**: they live only
in the `/tmp` handoff, are **never** git-added/committed/copied into the repo, and no
`Customer`, `User` (employee name), `Message Content`, phone, email, or any name is ever
persisted. The report UI mandates a `Customer` column even when deselected, so the raw file
stays uncommitted by contract.

The deterministic transform (`comm-weekly-derive-v1`):

- **Strips** `Customer` entirely.
- Converts `Message Content` **in-memory to length + presence only**, then discards the text.
- Uses **non-reversible, goal-scoped pseudonyms** (truncated SHA-256 over
  `salt || rooftop || kind || rawId`) for rep / thread / person joins only where necessary. A
  blank id yields no token (absence is never fabricated as identity). Tokens are
  rooftop-separated (non-cross-linkable).
- Retains only permitted structural/categorical/timestamp features.
- **Commits only** the aggregate admission proof + lineage; per-row derived data is never
  committed. Adversarial tests prove raw names/content cannot leak and that swapping
  rooftop/period/hash/capture fails closed.

## Lineage

Every derivative binds: raw SHA-256, manifest SHA-256, capture id, rooftop, reporting period,
and the transformation version + hash — so a shadow can detect a silent transform change or a
swapped input.

## Scope of this gate

Admission + a **field-backed** machine-readable capability delta
(`sw295-comm-capability-delta.json`, one row per metric, none evaluated) + seven proposed
structured rules (`enhanced-comm-structured-candidates.json`, all flagged for controller
ratification). The delta is bounded by the ADMITTED derivative's actual fields + the single
7-day week (not condition keywords): a metric is `definition_compatible_now` only when its
current value is fully computable + fully specified from those fields (threshold-only choices
remain a ratification flag but cannot cure unavailable inputs); `semantic_definition_pending`
means the events are supported but a numerator/population/window/event-semantic is unresolved.
At admission **zero** rows are `definition_compatible_now` and **14** are
`semantic_definition_pending`; everything else needs message content, an absent field, a join,
longer history, or lies outside the Sales boundary. **No SW metric is promoted; the family is
not wired into the evaluator spine.**
