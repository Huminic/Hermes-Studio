# INTERNAL EVIDENCE — Serra Honda (serra-honda) — NOT customer-facing

- data_through: 2026-08-30
- freshness_state: **current** · age_days: 1
- gross source precedence: gross.total_sum sourced from CRM Sales Gross (per-deal, AUTHORITATIVE); Dashboard TOTAL is a cross-check only and is never summed; gross.reconciliation_mismatches only from CRM.

## Accepted families (provenance)
| family | period | rows | checksum |
|---|---|---|---|
| dealership_performance | 2026-08-24..2026-08-30 | 40 | `9613643d5870` |
| appointments | 2026-08-24..2026-08-30 | 14 | `e64a5208a284` |
| crm_sales_gross | 2026-08-24..2026-08-30 | 5 | `8178807561f6` |

## Held families (quarantined, zero metrics)
- **cage_kpi** — Filters positively select Service/Parts Lead-Intent (Parts, Service); whole-delivery quarantine under the Sales-only contract — zero metrics accepted.
- **lead_source_roi** — Filters positively select Service/Parts Lead-Intent (Parts, Service); whole-delivery quarantine under the Sales-only contract — zero metrics accepted.
- **sales_comm_log** — Filters positively select Service/Parts Lead-Intent (Parts, Service); whole-delivery quarantine under the Sales-only contract — zero metrics accepted.

## Metric values
- sold_in_period: 5
- total_gross: 14185.2
- gross_reconciliation_mismatches: 0
- appt_total: 14
- appt_show: 8
- appt_no_show: 5
- appt_confirmed: 7
- dashboard_appts_set: 10

## Notes
- Appointment rates use the appointments family denominator only (never Dashboard apptsSet).
- CAGE / Lead Source ROI / Sales Communication remain quarantined; comm-derived metrics are not surfaced.
