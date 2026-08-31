# INTERNAL EVIDENCE — Serra Nissan (serra-nissan) — NOT customer-facing

- data_through: 2026-08-30
- freshness_state: **current** · age_days: 1
- gross source precedence: gross.total_sum sourced from CRM Sales Gross (per-deal, AUTHORITATIVE); Dashboard TOTAL is a cross-check only and is never summed; gross.reconciliation_mismatches only from CRM.

## Accepted families (provenance)
| family | period | rows | checksum |
|---|---|---|---|
| dealership_performance | 2026-08-24..2026-08-30 | 41 | `969ff03d6555` |
| appointments | 2026-08-24..2026-08-30 | 6 | `a73f4e379945` |
| crm_sales_gross | 2026-08-24..2026-08-30 | 6 | `7a31cee49f22` |

## Held families (quarantined, zero metrics)
- **cage_kpi** — Filters positively select Service/Parts Lead-Intent (Parts, Service); whole-delivery quarantine under the Sales-only contract — zero metrics accepted.
- **lead_source_roi** — Filters positively select Service/Parts Lead-Intent (Parts, Service); whole-delivery quarantine under the Sales-only contract — zero metrics accepted.
- **sales_comm_log** — Filters positively select Service/Parts Lead-Intent (Parts, Service); whole-delivery quarantine under the Sales-only contract — zero metrics accepted.

## Metric values
- sold_in_period: 6
- total_gross: 13224
- gross_reconciliation_mismatches: 0
- appt_total: 6
- appt_show: 2
- appt_no_show: 3
- appt_confirmed: 3
- dashboard_appts_set: 9

## Notes
- Appointment rates use the appointments family denominator only (never Dashboard apptsSet).
- CAGE / Lead Source ROI / Sales Communication remain quarantined; comm-derived metrics are not surfaced.
