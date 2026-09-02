# Two-delta evidence — PKT-02-01 (corrected)

**Packet:** PKT-02-01, module 2, SW-011..015. **Question:** Are new Sales leads being contacted
promptly and consistently, and which response gaps need management action?
**Design-only:** no new calculation/acquisition/persistence. SW-011/012/015 carry forward the prior
**ACCEPTED + EVALUATED** Honda truth (Gate 4A promotion; `gate2-evaluator-contract.json`); SW-013/014
remain `source_investigation_pending`.

## Evidence delta (immutable raw → normalized rows) — already proven at Gate 4A

| Control | Pinned value |
|---|---|
| Source | `vinsolutions_custom_reporting_leads` (REUSE; ACCEPTED+EVALUATED, `admitted_promoted`) |
| Artifact / sha256 | `serra-honda-21043_leads_2026-08-24_2026-08-30.xlsx` / `39f05774…` (46940 bytes) |
| Schema | 57-col contract `7d446696…`; sheet `Export` |
| Receipt | `leads-real-golden.json` `68f845a5…` (119 rows; service_parts_leakage_rows=0) |
| Row key | `Lead ID` (119 unique); row-key-set hash computed at normalized-dataset creation, **not fabricated** |
| Dealer / period / Sales-only | `21043` / `2026-08-24..2026-08-30` / lead-type∈Sales, lead-source∉Service, `\b(service\|parts)\b` clean |
| Missing rule | blanks preserved — **missing is never zero** |

## Meaning delta (normalized rows → metric/grade) — corrected/frozen meanings

| ID | State | Definition (frozen; gate2-evaluator-contract.json) | Unit | Grade target |
|---|---|---|---|---|
| SW-011 | **accepted_measured** (measured_validated/graded) | `median(Actual Response Time (Min) where Originated After Hours == No, numeric)`; blanks excluded | minutes | **OT-SW-011 `> 10 min`** (approved, active, compatible) |
| SW-012 | **accepted_measured** | `count(First Contact Attempt blank AND First Customer Contact blank AND Actual Response Time blank where After Hours==No) / business_hours_population`; **strict AND (never OR/ANY)**; each qualifying row aged **>30 min** (ended-period proof) | ratio_0_1 | **OT-SW-012 `> 0`** (approved) |
| SW-015 | **accepted_measured** | `count(rep mean Actual Response Time >= 2 x store median) / reps_with_numeric_response`; store median = SW-011 population; **share, not a minutes difference**; Sales Rep pseudonymized/ephemeral, **never persisted as a name**; customer/VIN/body excluded | ratio_0_1 | **OT-SW-015 `> 0`** (approved) |
| SW-013 | **source_investigation_pending** | AFTER-HOURS-originated leads (Originated After Hours==Yes) with no HUMAN response by the authoritative **next opening + 15 min** — held: opening schedule + first-human timestamp absent; **no proxy** from generic hours / Adjusted Response Time | — | pending |
| SW-014 | **source_investigation_pending** | **event count** predicate: first response **auto-reply only AND no human touch within two hours** (no business-hours restriction) — held: direct auto-vs-human actor classification + timestamps absent; **no channel/direction inference** | leads | pending |

Lifecycle partition: `accepted_measured = {SW-011, SW-012, SW-015}`,
`source_investigation_pending = {SW-013, SW-014}`, `accepted_disposition_only / rejected /
calculation_pending = {}`. Only accepted_measured feed value/grade/customer output; SW-013/014 are
open (no value/grade/customer projection), block only module 2 + final completion, never unrelated
packets. `source_investigation_pending` is nonterminal and never accepted_disposition_only.

## Carry-forward truth (item 6)

The master ledger carries forward all **17** authoritative accepted+evaluated Honda metrics
(SW-011,012,015,021,022,031,032,033,041,045,046,090,133,142,145,149,150; `gate5b-report-model-21043.json`).
These are NOT reset to `not_measured`/`admitted_held`. All other non-overlay rows are explicitly
**non-authoritative provisional planning placeholders**; the 18-ID Service overlay is
`outside_sales_domain` (appendix ID+label only, no customer value).

## Boundaries

Sales-only; no Service/Parts. No proxy/inference where direct data is absent. Rep identity
pseudonymized-ephemeral, never persisted. No Vin/Gmail/runtime/DB/vault/INGEST action; no new
calculation/acquisition/persistence/report generation.
