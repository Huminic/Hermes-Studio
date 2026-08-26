# Codex ⇄ Ingest Data-Prep Contract — BROWSER-ACQUIRED FAMILIES (extension)

**Status:** PROPOSED — not yet implemented in the consumer, not yet agreed. This is the reaction surface for the browser-scraped families so they can be added **without delaying** the six native XLSX families (which are agreed; see `SCHEMA_CONTRACT.md`).
**Relationship to the native contract:** the native contract governs original VinSolutions XLSX exports delivered unchanged. This extension governs **browser-acquired** families where Codex may assemble a *canonical derivative* (the original capture is always preserved unchanged **beside** the derivative, and the derivative is attributed to the raw checksum).

Until a family here is implemented + agreed, a delivery of it is **out of contract** and the consumer will quarantine it (`unsupported-report` / `sales-only-unproved`). Nothing here weakens the native path.

---

## Cross-cutting rules for browser families (apply to all four below)

1. **Rooftop provenance is not in the data — it must be asserted verifiably.** Several browser exports carry **no `Dealer` / `Dealer ID` column** (Response Times is one). The native path proves tenant from a `Dealer`/`Dealer ID` column or the Filters `Dealers` value; these can't. So a browser family needs an **agreed rooftop-provenance mechanism** that binds the rooftop to the **raw file checksum** and the **authenticated browser capture** — e.g. `browser_export` provenance (`capture_id` + `source_url` on the exact VinSolutions app host `vinsolutions.app.coxautoinc.com`) plus a signed/attested `capture_rooftop` that the consumer records against the sha256. Rooftop is **fail-closed**: no verifiable rooftop → quarantine. (Design open item; must be specified before implementation.)
2. **Timezone: dealer-local calendar, never naive UTC.** Browser exports timestamp in **UTC**. Period bucketing MUST use the dealer's **`America/New_York`** business calendar, converting UTC → local **before** assigning a row to a window. **Correction (2026-08-26, Codex-flagged):** the original example here was mathematically wrong. Conversion can only move a near-midnight UTC timestamp to the **prior** local day, never a later one — e.g. `Aug 17 02:00 UTC` = `Aug 16 22:00` America/New_York (EDT, UTC−4) → the **Aug 16 local** day. So a genuine `Aug 16 UTC` row belongs to Aug 15/16 local, **not** Aug 17. Rows that fall outside the requested local window after correct conversion are handled per the period rule in §A (row-level exclusion with manifest accounting) — never shifted.
3. **PII minimization in the derivative.** These exports contain customer names + IDs. Preserve the **protected raw** file (immutable, access-controlled) but the **analytical derivative** should minimize PII — prefer stable IDs, timestamps, statuses, and metric fields; drop names unless a metric genuinely requires them. (Consistent with the Watchdog rule that message bodies are hashed and never persisted.)
4. **Determinism-before-trust.** A family whose period/date behavior is not deterministically provable stays **quarantined/unavailable**. Transformation must not make an unreliable export *look* trustworthy.

---

## A. Response Times — real VinSolutions browser CSV (39 columns)

A genuine VinSolutions-generated browser CSV (not a row-by-row reconstruction). Exact header (39 columns), in order:

```
activityDateTimeUtc, lead.id, lead.leadType, lead.leadStatus, lead.leadStatusType,
lead.leadSourceId, lead.leadSourceName, lead.leadAgeInDays, lead.leadTypeName,
lead.leadStatusName, lead.leadStatusTypeName, customer.id, customer.firstName,
customer.lastName, customer.salesRepresentative.id, customer.salesRepresentative.firstName,
customer.salesRepresentative.lastName, customer.salesRepresentative.assignedUserType,
leadVehicle.stockNumber, leadVehicle.year, leadVehicle.make, leadVehicle.model,
tradeVehicle.year, tradeVehicle.make, tradeVehicle.model, responseTimeActual,
responseTimeAdjusted, responseTimeTarget, soldDateUtc, visitDurationInMinutes,
unansweredCommunication.taskDueDateUtc, unansweredCommunication.taskAgeInDays,
unansweredCommunication.type, unansweredCommunication.userGroupName,
unansweredCommunication.assignedUserName, customerFirstContactedUtc, appointmentUtc,
visitStartTimeUtc, appointmentStatus
```

Contracting requirements (must all be resolved before implementation):
- **Rooftop:** no `Dealer`/`Dealer ID` column → use the cross-cutting rooftop-provenance mechanism (rule 1). Fail-closed.
- **Timezone:** all `…Utc` fields are UTC → bucket by `America/New_York` (rule 2). The primary period field is `activityDateTimeUtc`; `soldDateUtc`, `appointmentUtc`, `customerFirstContactedUtc`, `visitStartTimeUtc` also UTC.
- **PII:** contains `customer.firstName/lastName` + `customer.id` + rep names → derivative keeps `lead.id`, `customer.id`, rep `id`, timestamps, statuses, and the response-time metric fields (`responseTimeActual/Adjusted/Target`, `visitDurationInMinutes`, `unansweredCommunication.taskAgeInDays`); drop names (rule 3).
- **Sales-only:** `lead.leadTypeName`/`lead.leadStatusTypeName` scanned for Service/Parts; unanswered-communication rows likewise.
- **Value:** this is the source that can safely unlock the currently fast-follow `comm.response_latency_unanswered` / unanswered-backlog metrics (it carries `responseTime*` and `unansweredCommunication.*` natively) — specify those metrics here when the family is agreed.

### A.1 Schema — required-core vs optional (resolved 2026-08-26, Codex preflight)
The 39-column header is the full shape, but strict 39-column equality is **not** required. Split:
- **Required-core** (a missing one → **quarantine** the capture): `activityDateTimeUtc`, `lead.id`, `lead.leadTypeName`, `lead.leadStatusTypeName`, `customer.id`, `responseTimeActual`, `responseTimeAdjusted`, `responseTimeTarget`, the `unansweredCommunication.*` fields, the status/timestamp fields the metrics use (`appointmentStatus`, `soldDateUtc`, `customerFirstContactedUtc`, `appointmentUtc`, `visitStartTimeUtc`, `visitDurationInMinutes`), **plus** the rooftop-provenance binding (rule 1).
- **Optional enrichment** (absent → **accept**, record `missing_optional`, **never invent**): `leadVehicle.*` (incl. `leadVehicle.stockNumber`), `tradeVehicle.*`, and `customer.firstName/lastName` (dropped in PII-min anyway).
- **Decision:** Honda's raw `1618b9c1…` (38 columns, missing `leadVehicle.stockNumber`) is **ACCEPTED** — that column is optional enrichment the derivative does not keep. Record `raw_columns: 38, missing_optional: ["leadVehicle.stockNumber"]` in Honda's manifest. Nissan/Ford (39 columns) accepted normally. Do NOT invent the field.

### A.2 Period — row-level exclusion with manifest accounting (resolved 2026-08-26, Codex preflight)
Unlike the aggregate native families (which whole-delivery-quarantine on any out-of-window row), Response Times is a **row-level event feed** — each row is independently attributable (own `lead.id`, own `activityDateTimeUtc`, own rooftop). Rule:
- Compute each row's local date from `activityDateTimeUtc` → `America/New_York`.
- Rows **inside** the requested coverage window → accepted into the derivative.
- Rows **outside** → **excluded but explicitly enumerated** in the manifest (`lead.id`, `activityDateTimeUtc`, computed local date, `reason: "out-of-coverage"`), with **reconciling counts** (`total_rows = accepted_rows + excluded_out_of_window`). The **raw capture is preserved unchanged** — nothing is lost, nothing is silent.
- **Never shift a timestamp; never invent a field.**
- **Decision:** for the Aug 17–23 (America/New_York) coverage, the 2 Honda + 1 Ford rows that convert to **Aug 16 local** are **excluded and enumerated** (they belong to an Aug-16 delivery, if any); the remaining in-window rows are accepted. This row-level exclusion is **Response-Times-specific** and does NOT apply to the aggregate native XLSX families.

### A.3 Agreed canonical derivative manifest schema — v1 (frozen 2026-08-26)

The single ground-truth manifest both sides conform to (ends the guess-correct loop). Codex
regenerates ONLY the derived manifest to this schema; the preserved raw and canonical
derivative **bytes/checksums remain unchanged**. Field names/values are exact.

```json
{
  "schema_version": "huminic.vinsolutions.response_times_derivative_manifest.v1",   // EXACT
  "derivative_version": "huminic.vinsolutions.response_times.canonical.v1",         // EXACT
  "hold_only": true,
  "no_action": true,
  "validation": { "state": "ready_for_isolated_dev", "sales_only_proved": true, "pii_minimized": true },
  "sales_only":       { "state": "passed" },        // optional detail object
  "pii_minimization": { "state": "passed" },        // optional detail object
  "rooftop": { "profile": "serra-honda|serra-nissan|tony-serra-ford", "vin_dealer_id": "21043|21044|21047" },
  "source": {
    "capture_id":   "…",
    "source_url":   "https://vinsolutions.app.coxautoinc.com/…",   // or final_url; host must be the VinSolutions app host
    "raw_filename": "raw.csv",
    "raw_sha256":   "<64-hex, == real raw sha256>",
    "raw_rows":     0,   // == coverage.total_rows
    "raw_columns":  0,   // == actual raw header width
    "raw_bytes":    0    // == actual raw byte length
  },
  "derivative": {
    "filename": "derivative.csv",
    "sha256":   "<64-hex, == real derivative sha256>",
    "headers":  [ "…exact ordered column list…" ],   // == actual derivative header, order + no extras
    "rows":     0,   // == coverage.accepted_rows
    "columns":  0,   // == headers.length
    "bytes":    0,   // == actual derivative byte length
    "local_fields": [   // EVERY additive local column + its UTC source + kind. Consumer recomputes + verifies each.
      { "local_col": "activityDateLocal",                   "utc_col": "activityDateTimeUtc",                 "kind": "date" },
      { "local_col": "activityDateTimeLocal",               "utc_col": "activityDateTimeUtc",                 "kind": "datetime" },
      { "local_col": "soldDateLocal",                       "utc_col": "soldDateUtc",                         "kind": "datetime" },
      { "local_col": "unansweredCommunication.taskDueDateLocal", "utc_col": "unansweredCommunication.taskDueDateUtc", "kind": "datetime" },
      { "local_col": "customerFirstContactedLocal",         "utc_col": "customerFirstContactedUtc",           "kind": "datetime" },
      { "local_col": "appointmentLocal",                    "utc_col": "appointmentUtc",                      "kind": "datetime" },
      { "local_col": "visitStartTimeLocal",                 "utc_col": "visitStartTimeUtc",                   "kind": "datetime" }
    ]
    // datetime kind format (exact): ISO-8601 wall time in America/New_York with numeric offset —
    //   YYYY-MM-DDTHH:mm:ss±HH:MM (e.g. 2026-08-18T10:00:00-04:00). date kind: YYYY-MM-DD.
    // The exact producer local_col names may differ — declare the real ones; every additive local
    // column MUST be declared. An unknown kind, a missing utc_col, or ANY derivative column whose
    // name ends in "Local" that is NOT declared here FAILS the readback (never a silent pass).
  },
  "coverage": {
    "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "timezone": "America/New_York",
    "total_rows": 0, "accepted_rows": 0, "excluded_out_of_window": 0,
    "excluded_rows": [
      { "lead_id": "…", "activityDateTimeUtc": "…", "computed_local_date": "YYYY-MM-DD", "reason": "out-of-coverage" }
    ]
  }
}
```

**Row-level (derivative CSV) requirements** the consumer independently enforces:
- Every derivative row carries `capture_profile`, `vin_dealer_id`, `source_capture_id`,
  `source_raw_sha256` — each equal to the governed profile / dealer id / manifest capture / real raw sha.
- For every accepted row, **every retained native field** (every derivative column that also exists
  in the raw, excluding the four provenance columns and every declared `local_fields.local_col`)
  equals the raw's value **exactly** — verified as a duplicate-safe multiset of full field tuples.
- Every declared additive `local_fields` column is **recomputed** from its `utc_col` (America/New_York);
  `kind:"date"` → `YYYY-MM-DD`. Non-date kinds must declare a `format` before they can be verified.
- The RAW is scanned for Service/Parts independently (a sanitized derivative cannot hide a raw Service row).
- Manifest `raw_rows/raw_columns/raw_bytes` and `derivative.rows/columns/bytes` reconcile to the actual files.

## B. Unanswered Replies — 15-column backlog snapshot

- A **backlog snapshot**, NOT a strict daily event feed. Contract it with **`as_of`** (the snapshot instant, dealer-local) + **`lookback`** semantics (the age window it represents) — not a single-day period proof.
- Rooftop-provenance + timezone + PII rules as above.
- Send one real 15-column header sample to specify columns/types.

## C. User Activity — 44 columns — **UNAVAILABLE (quarantine) until proven**

- Tested date behavior is **unreliable**. Remains **unavailable/quarantined** until deterministic period selection is proved (rule 4). Do not transform it into an apparently-trustworthy derivative.

## D. Deal Performance — 31 columns — **UNAVAILABLE (quarantine) until proven**

- Tested exports had **stale MTD headings and ambiguous periods**. Remains **unavailable/quarantined** until deterministic period selection is proved (rule 4).

---

## Sequencing

Per operator direction (2026-08-25): the **native six-family contract is agreed and proceeds now**; Response Times and the other browser families are added here as a **separate extension** rather than blocking the native path. Order of adoption: **Response Times** (highest value — unlocks response-latency/unanswered metrics), then **Unanswered Replies**; **User Activity** and **Deal Performance** stay quarantined until their period selection is deterministic.

## Change control

Same as the native contract: a family here is not accepted by the consumer until its full spec (columns/types, rooftop-provenance binding, dealer-local period rule, PII-minimized derivative, Sales-only proof) is added, implemented, tested, and acknowledged by both parties. Code is authoritative; this file is a design target until then.
