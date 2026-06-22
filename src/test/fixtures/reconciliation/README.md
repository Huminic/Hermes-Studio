# Reconciliation fixtures (operator-provided)

The reconciliation test (`src/test/dashboard-reconciliation.test.ts`) is SKIPPED
until both fixtures below exist. It is intentionally NOT stubbed with synthetic
data — a passing reconciliation must be against real CRM data, or it would
falsely imply certification.

Drop these two files here (this directory is inside the workspace, so the
file-boundary hook does not block reading them):

1. `report.csv` — the real VinSolutions **Lead Source ROI** export for the KNOWN
   store + KNOWN 30-day window the customer's 388 / 67 / ~30 numbers came from.
   Must carry the standard columns (`Lead_Source`, `Total_Leads`, `Good_Leads`, …).

2. `api-leads.json` — a captured `vin_query_leads` response array for the SAME
   store + SAME window (all pages concatenated), so the API side is compared
   against the report side over identical data. Shape: a JSON array of lead
   records, or `{ "items": [ … ] }`.

Once both are present, `npm run test -- dashboard-reconciliation` runs the
per-lead-source comparison and the test prints the deltas for the write-up.
