# PKT-02-02 semantic decision brief — SW-016 & SW-017 (ACCEPTED — frozen)

**Status:** ACCEPTED (frozen by SW-HONDA-PKT-02-02-J5-MEMORIALIZE-AND-FREEZE; independent impartial-shadow review completed, corrections applied). Design/evidence reconciliation only; no metric/source admitted; SW-016/SW-017 remain HELD. Prior reviewed draft SHA-256 3203de77d54e53bba749283801c4463579f228739703f4c6bfa09dee152f2687; semantics unchanged.
**Scope:** Serra Honda of Sylacauga (`serra-honda`, Dealer ID `21043`), Sales only. Metrics `SW-016` and `SW-017` only.
**Starting HEAD:** `43a3f47c135c570809bb43dbc78b9ce066045a45`, branch `codex/halo-295-unshrinkable-inputs`.
**Companion:** `pkt-02-02-source-dependency-amendment.json` (machine-readable, pins every governing/J1 hash).

This brief changes no product, source, schedule, CRM, production, or acceptance. It proposes; it does not ratify. No source was exported and no rows were retrieved in J1.

Canonical conditions (verbatim, unchanged):
- **SW-016** — "Weekend/holiday response SLA breach rate >20%."
- **SW-017** — "Phone leads with no outbound call attempt within 5 minutes."

Authoritative lifecycle (frozen; unchanged): **SW-016** stays `data_acquired_calculation_pending` / measured-unscored; **SW-017** stays `source_investigation_pending` / not measured.

---

## 1. What J1 newly proved

J1 was a read-only, metadata-only discovery pass in VinSolutions Custom Reporting (builder opened as "Untitled Analysis", data retrieval paused before any dataset was run; no rows, no save, no export, no schedule change).

- A live **`Leads`** dataset exists and exposes, by field name, a stable **`Lead ID`**, **`Lead Origination Date`**, **`First Contact Attempt`**, **`First Customer Contact`**, **`Actual Response Time (Min)`**, **`Adjusted Response Time (Min)`**, **`Actionable Response Datetime`**, **`Originated After Hours`**, **`Dealer ID`**, and Sales lead classifications. This is materially more than the existing Response Times family, which carries response timings but **no lead-origination timestamp**.
- A live **`Customer Contact`** dataset exists (latest actual/attempted contact datetimes per channel, keyed by **`Global Customer ID`** — **no `Lead ID`**).
- A live **`Daily Communication Summary By User`** dataset exists (dealer/user/day aggregate of Sales call/email/text counts) and **visibly default-selects Service measures** — this triggered the J1 Service stop.
- The **official Leads glossary** lists **`Global Customer ID`** and **`CRM User ID`**, but those two fields were **not** present in the live J1 `Leads` field picker. Availability and any join through them **cannot be inferred from the glossary alone**.
- Nothing about row grain, cardinality, period behavior, or filter behavior was proved, because no dataset was run.

## 2. Why SW-016 still cannot be promoted (despite the promising Leads fields)

The `Leads` dataset exposes a candidate field path toward closing one long-standing gap — a lead-origination timestamp alongside `Lead ID` and response fields — but J1 retrieved no rows and proved no cardinality, and promotion still fails on evidence that does not exist yet:

- **No authoritative business-hours / holiday calendar and no timezone/DST rule.** "Weekend/holiday" origination and an SLA "breach" both depend on a dealership calendar the CRM does not supply. Without it, the population and the clock are undefined.
- **The response-field semantics are unratified.** `Actual` vs `Adjusted` response minutes, `Actionable Response Datetime`, `First Contact Attempt` vs `First Customer Contact` were not defined in the captured Help corpus; choosing among them changes every measured value.
- **The SW-016 SLA spec is held** (numerator, denominator, event sequence, window, threshold, minimum sample, minimum history, ambiguity handling, unit) and **no approved grade target exists.**
- **No export has proved `Lead ID` cardinality**, so even the Response Times ↔ Leads join is unproven.

The existing weekend open+15 figure (denominator 16, breaches 5, **31.3%**) remains **supplemental / measured-unscored only** — real evidence, never a score.

## 3. Why SW-017 still cannot be calculated honestly

SW-017 needs, at lead grain: phone-origin identification, a lead-origination timestamp, and a **qualifying outbound call-attempt event with a timestamp**. No available source supplies all three with a deterministic key:

- **Communication Log export** has event time/direction/channel/result but **no stable `Lead ID` or `Global Customer ID`** — it cannot be deterministically joined to a lead; its scheduled daily form is quarantined.
- **Customer Contact** is a **latest-event snapshot** with **no `Lead ID`** and no lead-origination time — not an event stream.
- **Daily Communication Summary** is a **user/day aggregate** — no lead grain, no per-event timestamp — and is Service-contaminated by default.
- **`First Contact Attempt`** in `Leads` is **not proved to be an outbound logged call** (no direction/channel/type accompanies it).

Counting "no outbound attempt within 5 minutes" from aggregates or a snapshot would be inventing lead-level truth. Missing is not zero.

## 4. Why the Daily Communication Summary is unsafe now

The dataset **visibly includes and default-selects Service measures** (`Log A Call Service …`, `Service Email …`). Under the platform's fail-closed rule a *positive* Service/Parts selection is a **contaminated definition** that quarantines the whole delivery — clean visible rows do not cure it. Therefore this dataset is a **stop/control fact, not an accepted source**. It becomes usable only if a **future accepted, Sales-only extraction contract removes every Service/Parts field before retrieval** and the remaining Sales-only definition is independently accepted. Until then: no run, no save, no export, no schedule.

## 5. What can proceed now without Duane

Routine, evidence-only work inside the existing boundaries:

- **Documentation** of J1 findings and this reconciliation (this brief + the companion JSON).
- **Source-contract drafting**: a Sales-only, field-minimized Custom Reporting export contract for `Leads` (columns, types, dealer/period/Sales-only proof, PII-minimized derivative, stable-ID join keys) — as the accepted/frozen contract, not an export.
- **Test-fixture design** that is **structural and parameterized only**.

**Constraint on no-Duane test fixtures:** fixtures may define shape, keys, and parameter *slots* only. They must **not** encode or choose any unresolved semantic: not the business-hours/holiday calendar, not Actual-vs-Adjusted or the qualifying-response event, and not the 5-minute boundary or which outbound-call outcomes count as an attempt. Those remain open parameters until Duane decides.

## 6. Smallest outcome-changing choices that require Duane

Each is a genuine business decision the data cannot make. Recommended defaults are **recommendations only** — not ratified here.

**(a) Authoritative dealership hours / holiday source.**
- *Recommended default:* a Duane-provided (or named DMS/scheduling) authoritative business-hours + holiday calendar, converted `America/New_York`.
- *Concrete effect:* defines which leads are "weekend/holiday-originated" and the business-hours SLA window — it directly sets the SW-016 denominator population and which responses count as breaches.

**(b) Actual vs Adjusted response clock, and the exact qualifying response event.**
- *Status:* **Unknown pending official definitions.** J1 proved the field names `Actual Response Time (Min)` and `Adjusted Response Time (Min)` only; the exact behavior of each — including whether "Adjusted" reflects business hours in any way — is not established.
- *Recommended default (conditional, recommendation only):* recommend a clock **only after** VinSolutions' official definitions are proved. If the proven definition of `Adjusted Response Time (Min)` matches the business-appropriate SLA clock, recommend Adjusted; otherwise the clock choice stays open. The qualifying clock-stop event is a separate unresolved Duane choice among these alternatives (listed, not combined): (i) `First Customer Contact`, or (ii) `Actionable Response Datetime`.
- *Concrete effect:* choosing Actual vs Adjusted changes every lead's measured minutes; choosing which single event stops the clock changes which touch counts. Both move the SW-016 breach rate.

**(c) Five-minute boundary, and which outbound-call outcomes count as an attempt.**
- *Recommended default (inclusive rule, recommendation only):* a qualifying outbound Sales call attempt whose timestamp is **<= lead origination timestamp + 5:00** qualifies; a first qualifying attempt **> 5:00** after origination, or **no** qualifying attempt at all, **fails** the condition (i.e., counts the lead toward SW-017).
- *Unresolved Duane choice:* **which** logged outbound Sales call outcomes count as a qualifying "attempt" — for example, whether *Not Contacted* / *Answering Machine* count — remains open.
- *Concrete effect:* the chosen outcome set changes the SW-017 numerator (phone leads with **no** qualifying attempt); a stricter "connected-only" rule would raise the count.

## 7. Customer-safe limitation statement

> Speed-to-lead metrics for weekend and holiday leads, and the five-minute phone follow-up measure, are still being finalized against the dealership's authoritative business-hours calendar and an event-level call source. Where a figure is shown, it is supplemental context only and is not yet a scored result. These items will be reported once their definitions are confirmed.

(No quarantine mechanics are exposed; nothing implies zero activity.)

---

**Freeze status.** This frozen record performs no DAG amendment, source admission, export, acquisition, calculation, grade, alert, report, or implementation; SW-016/SW-017 remain HELD. **Rollback:** `git revert` the freeze commit `2807c88a0874fd29ba0f9c4cc52f372497946e77` and this follow-up correction commit (reviewed content preserved in git history; no untracked draft files exist to delete). No PKT-02-02 or full-goal completion is inferred.
