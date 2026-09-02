# PKT-02-01 — Internal Evidence Companion

- Packet: PKT-02-01 (module 2)
- Dealer: 21043 (Serra Honda of Sylacauga, Sales-only)
- Period: 2026-08-24..2026-08-30
- Binding sha256: `1c1c98a2e7b3be8d10eea9495861b7a33e65a00020ab7c9e756da363b69f2082`
- Source sha256: `39f0577400c912b8e0f0db4a37a35726c1a460c32df88f231aaa39aff9d100ae`
- Engine: pkt-exec-1; as_of 2026-09-02T21:11:55.715Z
- run_key: `119f77056b73c2c9a2a2a6d9ac9aa91afc63205ec674df9d01effe660e774aa7`
- content_sha256: `ae30c07ab4a6e9ae85461dc183c32b94e1ae50c11c5004ab2b51e4d9b965eba1`

## Evidence delta (raw → normalized)
- Artifact bytes: 46940; row reconciliation: 119 of 119
- Schema contract sha256: `7d446696d9be66b917308cad68e27fb8dfaf40ca6e08064afde16031c172eeb1`
- Receipt sha256: `68f845a528623c3799e52c2bb45ba25551450314c5b69ac5fbde2b6e2b6521f2`
- Sales-only proof: 119 rows: one rooftop Dealer ID=21043; zero Service/Parts tokens in categorical columns; business-hours population (Originated After Hours=No)=76; Sales Rep aggregated in-memory, no names retained
- Missing rule: blanks preserved as missing (never zero); coverage_numeric + missing == business-hours population

## Per-metric observations & evaluations

| Metric | Status | Value | Unit | Num | Den | Grade target | Detection | Rating |
|---|---|---|---|---|---|---|---|---|
| SW-011 | measured | 6 | minutes | 27 | 76 | GT-OT-SW-011 | median_business_hours_response_min > 10 | healthy |
| SW-012 | measured | 0.19736842105263158 | ratio_0_1 | 15 | 76 | GT-OT-SW-012 | strict_untouched_rate > 0 | breach |
| SW-015 | measured | 0.5 | ratio_0_1 | 2 | 4 | GT-OT-SW-015 | rep_2x_store_median_share > 0 | breach |
| SW-013 | source_investigation_pending | — | ratio_0_1 | — | — | GT-013 | — | withheld |
| SW-014 | source_investigation_pending | — | leads | — | — | GT-014 | — | withheld |

## Independent reconciliation (recompute == evaluator == persisted accepted)
- reconciliation.ok: true
- SW-011: independent=6, evaluator=6, persisted=6, match=true
- SW-012: independent=0.19736842105263158, evaluator=0.19736842105263158, persisted=0.19736842105263158, match=true
- SW-015: independent=0.5, evaluator=0.5, persisted=0.5, match=true

## Source-investigation-pending (no proxy / no derivation)
- SW-013: source_investigation_pending
  - missing fields: authoritative_opening_schedule, first_human_response_timestamp
  - evidence: Searched the 57 accepted Leads headers for the exact authoritative fields of SW-013. Absent: authoritative_opening_schedule, first_human_response_timestamp. No proxy/inference used (forbidden proxies present but rejected: Originated After Hours, Actionable Response Datetime, Actual Response Time (Min), Adjusted Response Time (Min), First Contact Attempt). Held open as source_investigation_pending; no value derived.
- SW-014: source_investigation_pending
  - missing fields: first_response_actor_classification, human_touch_event_timestamps
  - evidence: Searched the 57 accepted Leads headers for the exact authoritative fields of SW-014. Absent: first_response_actor_classification, human_touch_event_timestamps. No proxy/inference used (forbidden proxies present but rejected: Lead Source, Contacted Indicator, ADF/XML Indicator, Actual Response Time (Min), Actionable Response Datetime). Held open as source_investigation_pending; no value derived.

## Alert simulations (UNSENT — no delivery, no email, no schedule)
- SW-011: would_fire=false, delivered=false, channel=simulated_none — [SIMULATED — NOT SENT] SW-011 within target; no trigger (value 6 minutes).
- SW-012: would_fire=true, delivered=false, channel=simulated_none — [SIMULATED — NOT SENT] SW-012 would trigger: strict_untouched_rate > 0 (value 0.19736842105263158 ratio_0_1).
- SW-015: would_fire=true, delivered=false, channel=simulated_none — [SIMULATED — NOT SENT] SW-015 would trigger: rep_2x_store_median_share > 0 (value 0.5 ratio_0_1).

