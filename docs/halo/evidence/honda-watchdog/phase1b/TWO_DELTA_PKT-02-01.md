# Two-delta evidence — PKT-02-01 (design-time)

**Packet:** PKT-02-01, module 2, SW-011..015. **Question:** Are new Sales leads being contacted
promptly and consistently, and which response gaps need management action?
**Design-only:** no values computed; no Vin/UI action. This records the two-delta *plan* and its
pinned inputs; the deltas are executed in Phase 5/6 under the frozen contracts.

## Evidence delta (immutable raw → normalized rows)

| Control | Pinned value |
|---|---|
| Source family | `vinsolutions_custom_reporting_leads` (REUSE of existing accepted artifact) |
| Artifact | `serra-honda-21043_leads_2026-08-24_2026-08-30.xlsx` (46940 bytes) |
| Source sha256 | `39f0577400c912b8e0f0db4a37a35726c1a460c32df88f231aaa39aff9d100ae` |
| Schema | 57-col contract `7d446696…`; sheet `Export` |
| Receipt | `leads-real-golden.json` `68f845a5…` (Honda: 119 rows; service_parts_leakage_rows=0) |
| Row key | `Lead ID` (119 populated, 119 unique); row-key-set hash computed at normalized-dataset creation (Phase 5), **not fabricated here** |
| Dealer / period | `21043` / `2026-08-24..2026-08-30` |
| Sales-only | lead_type ∈ Sales list; lead_source ∉ Service list; `\b(service\|parts)\b` scan clean |
| Missing rule | blanks preserved (First Customer Contact blanks=63; Actual Response blanks=65) — **missing is never zero** |

Proven at execution: checksum, dealer/period, schema, Sales-only/PII controls, blank preservation,
row reconciliation. **Reuse, not re-acquisition** — fresh acquisition is a separate governed Phase 5
action.

## Meaning delta (normalized rows → metric/grade/narrative)

| ID | Disposition | Definition (design) | Direct fields | Pipeline |
|---|---|---|---|---|
| SW-011 | data_acquired_calculation_pending | median Actual Response Time where Originated After Hours=No; blanks excluded | Actual Response Time (Min), Originated After Hours | value/baseline/grade only after accepted_measured |
| SW-012 | data_acquired_calculation_pending | share of business-hours leads with any of 3 blanks (First Contact Attempt, First Customer Contact, Actual Response Time) | those 3 + Originated After Hours | value only after accepted_measured |
| SW-015 | data_acquired_calculation_pending | per-rep mean vs store median; **Sales Rep pseudonymized/ephemeral, never persisted as a name**; customer/VIN/body excluded | Sales Rep, Actual Response Time (Min) | value only after accepted_measured |
| SW-013 | **source_investigation_pending** | requires authoritative opening boundary + first-human timestamp — **absent**; no proxy from generic hours / Adjusted Response Time | — | open; no value/grade/customer projection |
| SW-014 | **source_investigation_pending** | requires direct system/auto-vs-human actor classification + timestamps — **absent**; no proxy from channel/direction | — | open; no value/grade/customer projection |

Lifecycle partition (design-time): `calculation_pending = {SW-011, SW-012, SW-015}`,
`source_investigation_pending = {SW-013, SW-014}`, `accepted_measured / accepted_disposition_only /
rejected = {}`. SW-013/014 stay open (owner=codex, evidence_as_of, next_action = one finite
help-contract + read-only UI + controlled probe, review_point = investigation close); they block only
module 2 and final completion, never unrelated packets. `source_investigation_pending` is nonterminal
and never accepted_disposition_only.

## Boundaries

Sales-only; no Service/Parts. No proxy/inference where direct data is absent. Rep identity
pseudonymized-ephemeral, never persisted as a name. No Vin/Gmail/runtime/DB/vault/INGEST action.
