# Gate 3 — source-acquisition contract (for the local controller)

Machine-readable companion: `acquisition-contract.json`. This tells the controller exactly
what additional **read-only** inputs are CANDIDATES to close which metric IDs, grouped into
the fewest passes. **The pipeline performs no browser/Gmail/production actions** — the
controller does. No claim is made that Cox exposes a report unless committed evidence proves
it. **Dataset presence proves a candidate route only** — never field completeness, safe
filters, exportability, history, or baseline compatibility.

Scope: three Sales rooftops — serra-honda (21043), serra-nissan (21044), tony-serra-ford
(21047). Permanent Sales-only boundary: Service/Parts/cross-rooftop data **never** enters the
Sales profiles. 18 of 885 cells are evaluated today; the 867 below are unresolved. (Gate 4A
promoted SW-011/012/015 from the accepted Leads family; the readonly_browser_capture route
below dropped 42→33 cells accordingly.)

**Approval rule.** `duane_approval_required` marks where a **new material approval** is still
needed. The active goal already authorizes routine **read-only browser capture + unsaved
export retrieval + historical accumulation** (so those are `false`). Saved-schedule mutation,
external feeds, compliance/PII scope, cross-rooftop scope, and separate Service work remain
`true`. Corrected totals: **594 cells need no new approval; 273 do.**

## Controller-observed dataset evidence (authorized READ-ONLY inspection)

At `reporting-vinsolutions.app.coxautoinc.com` the Custom Reporting selector exposes **28
nonblank datasets**; nothing was saved/exported/scheduled/modified. **`Service` and `Service
Appointments` are permanently excluded.** `Daily Communication Summary By User` exposes
SEPARATE Sales vs Service call-count columns — **Service columns must never be selected or
ingested.** Full field notes + the 26 selectable Sales datasets are in the JSON
(`dataset_evidence`). Presence is a candidate route only.

## Candidate routes (grouped; nothing "closes" a cell until proved)

| Route                              | Cells | Candidate IDs | New approval? | What to acquire                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ----- | ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new_readonly_vinsolutions_export` | 519   | 173           | **no**        | Read-only UNSAVED Custom Reporting exports: Sales-only reconstruction of the quarantined families (candidate datasets Leads / Daily Communication Summary By User [Sales cols] / Daily Dealer Summary) + missing-field/definition exports. Unproved until fields/filters/rows inspected. |
| `external_feed`                    | 189   | 63            | yes           | Governed non-VinSolutions feeds (GA / ad-spend / phone / registration / insurance / credit / public-records enrichment).                                                                                                                                                                 |
| `compliance_authorization`         | 48    | 16            | yes           | Sales-domain compliance/PII conditions — authorization + governed source; stays out of the Service workspace.                                                                                                                                                                            |
| `readonly_browser_capture`         | 33    | 11            | **no**        | Read-only captures: Customer Contact / Recent Task Detail CRM surfaces (Leads per-lead response timing for SW-011/012/015 is already accepted + evaluated, no longer a pending candidate).                                                                                               |
| `historical_accumulation`          | 42    | 14            | **no**        | No new source — accumulate the already-accepted families over the stated trailing window; complete composites once components exist.                                                                                                                                                     |
| `separate_service_workspace`       | 27    | 9             | yes           | GENUINELY Service-domain conditions only — the separately-governed Serra Service workspace, never the Sales profiles.                                                                                                                                                                    |
| `separate_cross_rooftop_route`     | 9     | 3             | yes           | Cross-rooftop conditions — a separate governed cross-rooftop route; the Sales profile is one-rooftop by design.                                                                                                                                                                          |

Cells total: 519 + 189 + 48 + 33 + 42 + 27 + 9 = **867** (reconciles to the closure registry).
Every group is `route_proof_state = candidate_unproved`.

## Quarantined dependency buckets — do NOT claim "one pass closes 510"

The 510 quarantined cells decompose into **4 mutually-exclusive DEPENDENCY buckets × 3
dealers = 12 entries** (`quarantined_reconstruction` in the JSON): the **three
source-provenance report families** — `lead_source_roi` (12), `cage_kpi` (12),
`sales_comm_log` (225) — **plus one multi-family dependency bucket** `multiple_quarantined`
(261) for conditions that JOIN more than one quarantined family. `multiple_quarantined` is a
dependency bucket, **not** a report family. Two candidate routes, both **unproved** until
exact fields/filters/rows are inspected:

- **Primary (no approval):** read-only UNSAVED Sales-only Custom Reporting reconstruction/export.
- **Alternative (approval):** saved-schedule repair — needs the hidden Lead Intent control
  that **standard Edit Parameters did not expose** (unproved access).

## Fewest honest browser passes (candidate, unproved)

`browser_passes` in the JSON: **one read-only Custom Reporting session per dealer** covering
that dealer's candidate datasets (Leads, Appointments, CRM Sales, Customer Contact, Daily
Communication Summary By User [Sales cols]). Candidate coverage only — each dataset must still
prove exact fields, period, Sales-only filters, and row-level validation before it closes any
cell. No pass is claimed to "close" cells at this gate.

## Data-minimization control (addendum)

For every read-only capture / unsaved export, select and retain **only the fields strictly
required** to calculate the named SW metric(s). **Prohibited unless Duane authorizes the
specific compliance/PII condition + governed route:** customer names, emails, phones, street
addresses, VINs, stock numbers, credit/payment attributes, free-text notes/memos, message
content, co-buyer, trade-in details, SSN/DOB/DL#. **IDs** (Lead ID, Appointment ID, Deal
Number, Sale ID) are kept **only** as join/de-dup keys — pseudonymized where possible and
**never placed in customer PDFs**. This is a data-minimization control, **not a new approval
gate** for already-authorized read-only Sales-only passes.

`observed capability` (what a dataset exposes; see `dataset_evidence.observed_field_notes`)
is **distinct** from the **allowed export field selection** (`data_minimization
.allowed_export_field_selection` in the JSON) — the minimal, PII-free set that may actually be
selected. `evaluator-data-minimization.test.ts` fails if any read-only selection includes a
prohibited field without a compliance-authorization route.
