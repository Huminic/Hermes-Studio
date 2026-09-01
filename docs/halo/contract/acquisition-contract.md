# Gate 3 — source-acquisition contract (for the local controller)

Machine-readable companion: `acquisition-contract.json`. This tells the controller exactly
what additional **read-only** inputs would close which metric IDs, grouped into the fewest
passes. **The pipeline performs no browser/Gmail/production actions** — the controller does.
No claim is made that Cox exposes a report unless committed evidence proves it.

Scope: three Sales rooftops — serra-honda (21043), serra-nissan (21044), tony-serra-ford
(21047). Permanent Sales-only boundary: Service/Parts/compliance/cross-rooftop data **never**
enters the Sales profiles. 9 of 885 cells are evaluated today; the 876 below are unresolved.

| Route                              | Cells | Closes  | Duane? | What to acquire                                                                                                                                                                                                              |
| ---------------------------------- | ----- | ------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `existing_scheduled_report`        | 510   | 170 IDs | yes    | Re-run the SAME weekly ROI / Enterprise-Performance / Sales-Communication-Log schedules with the saved-filter Lead Intents corrected to **exclude** Service/Parts; same dealer, columns, period. Fixes the quarantine cause. |
| `external_feed`                    | 168   | 56 IDs  | yes    | Governed read-only non-VinSolutions feeds named by the conditions (Google Analytics, ad-spend, phone/call system, third-party vendors) with definition/unit/period.                                                          |
| `separate_service_workspace`       | 84    | 28 IDs  | yes    | Route via the separately-governed combined Serra **Service** workspace — never the Sales profiles. Owned by the Service-domain contract.                                                                                     |
| `readonly_browser_capture`         | 42    | 14 IDs  | yes    | Read-only browser captures: Dealer Dashboard **Response Times** per-lead CSV (median + business-hours + untouched policy) and CRM Notes/History/Desking surfaces.                                                            |
| `historical_accumulation`          | 42    | 14 IDs  | no     | **No new source** — accumulate the already-accepted Leads/Appointments/CRM/Dashboard families across the stated trailing window (WoW / 30-day / N consecutive weeks) and complete composites once components exist.          |
| `compliance_authorization`         | 21    | 7 IDs   | yes    | Explicit compliance/PII authorization + a governed source before any evaluation.                                                                                                                                             |
| `new_readonly_vinsolutions_export` | 9     | 3 IDs   | yes    | A read-only VinSolutions export carrying the currently-missing field: per-source appointment attribution (SW-008), write-up counts (SW-034), confirm-within-24h timing (SW-042).                                             |

Per-route required columns/filters/period/history, dealer identity, provenance, and
Sales-only proof are in `acquisition-contract.json` (`required_inputs`, `sales_only_proof`).
Cells total: 510 + 168 + 84 + 42 + 42 + 21 + 9 = **876** (reconciles to the closure registry).

**Fewest-pass guidance:** one corrected VinSolutions schedule pass closes the largest block
(510 cells, quarantine cause); one browser pass (Response Times + CRM surfaces) closes 42;
one new read-only export closes the 3 missing-field conditions. Historical accumulation needs
no acquisition — only time. Service/compliance/external routes require Duane authority and
remain outside the Sales-only boundary.
