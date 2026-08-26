# Codex ⇄ Ingest Data-Prep Contract — BROWSER-ACQUIRED FAMILIES (extension)

**Status:** PROPOSED — not yet implemented in the consumer, not yet agreed. This is the reaction surface for the browser-scraped families so they can be added **without delaying** the six native XLSX families (which are agreed; see `SCHEMA_CONTRACT.md`).
**Relationship to the native contract:** the native contract governs original VinSolutions XLSX exports delivered unchanged. This extension governs **browser-acquired** families where Codex may assemble a *canonical derivative* (the original capture is always preserved unchanged **beside** the derivative, and the derivative is attributed to the raw checksum).

Until a family here is implemented + agreed, a delivery of it is **out of contract** and the consumer will quarantine it (`unsupported-report` / `sales-only-unproved`). Nothing here weakens the native path.

---

## Cross-cutting rules for browser families (apply to all four below)

1. **Rooftop provenance is not in the data — it must be asserted verifiably.** Several browser exports carry **no `Dealer` / `Dealer ID` column** (Response Times is one). The native path proves tenant from a `Dealer`/`Dealer ID` column or the Filters `Dealers` value; these can't. So a browser family needs an **agreed rooftop-provenance mechanism** that binds the rooftop to the **raw file checksum** and the **authenticated browser capture** — e.g. `browser_export` provenance (`capture_id` + `source_url` on the exact VinSolutions app host `vinsolutions.app.coxautoinc.com`) plus a signed/attested `capture_rooftop` that the consumer records against the sha256. Rooftop is **fail-closed**: no verifiable rooftop → quarantine. (Design open item; must be specified before implementation.)
2. **Timezone: dealer-local calendar, never naive UTC.** Browser exports timestamp in **UTC**. Period bucketing MUST use the dealer's **`America/New_York`** business calendar. (Observed: one Honda row at `…Aug 16 UTC` belongs to the **Aug 17** local business day — naive UTC date-slicing would misfile it.) The consumer must convert UTC → dealer-local **before** assigning a row to a coverage/as-of window.
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
