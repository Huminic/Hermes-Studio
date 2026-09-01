# Gate 3 — Proof Delta A (closure registry / reconciliation / maximization / baseline)

**Branch:** `codex/halo-295-unshrinkable-inputs`. One writer. **Status:** Gate 3 — submitted
for review, NOT self-certified. Acceptance is **unchanged**: 295 conditions × 3 dealers =
**885** cells, **9 evaluated / 876 unresolved** today. No scope shrink, no synthetic values,
no missing→zero, no quarantined-source values, Sales-only preserved. No customer PDF authored.

## Shadow FAIL of 7e2596400 → this repair (Defects 1–3 + provenance tightening)

- **Defect 1 (probe circular).** `promotion-probe.ts` was rewritten to be EVIDENCE-DERIVED
  from the real Gate 2 spine rows AND bound to the authoritative accepted-delivery allowlist
  (`native-scheduled-evidence.json` held deliveries: filename + SHA + period_hint + proved
  reporting_period). A cell promotes only when all THREE distinct governed dealer cells bind
  to the exact allowlisted filename+SHA+period, the metric-spec source family/fields/formula/
  unit, the exact baseline id/basis/comparator/direction + canonical threshold, the row
  condition equals the canonical condition, and row period = lineage period = accepted
  period. `status=evaluated` or a valid-looking 64-hex SHA is NOT sufficient. Adversarial
  regressions: empty/absent evidence, wrong-but-64-hex SHA, wrong source_fields/formula,
  wrong baseline id/comparator/direction/value, row↔lineage dealer/family/profile mismatch,
  row↔lineage period mismatch, CO-MUTATED row+lineage period (SHA valid), swapped filename,
  mutated period_hint, mutated row.condition, duplicate-dealer, and catalog-condition
  mutation — each prevents promotion. Positive: exactly SW-031/032/041 from the byte build.
- **Defect 2 (pipeline labels).** `pipeline.ts` now applies FAIL-CLOSED scope + period
  controls BEFORE calculation: portfolio (no scope) = 3 governed pairs / 885 cells; dealer
  scope requires BOTH a matching governed pair and filters to exactly 295 cells; a fake/
  mismatched/one-sided pair or a malformed/stale/mixed/wrong-tz period returns `ok=false`
  with NO preflight. Preflight scope/period are derived from validated inputs, never copied
  from raw options. Customer-final is dynamic: portfolio 885/885, dealer 295/295 — still
  refused at 9/885 and 3/295.
- **Defect 3 (quarantine wording).** The 510 quarantined cells decompose into 4
  mutually-exclusive DEPENDENCY buckets × 3 dealers = 12 entries: the three source-provenance
  report families (lead_source_roi 12, cage_kpi 12, sales_comm_log 225) plus one multi-family
  dependency bucket `multiple_quarantined` (261). `multiple_quarantined` is a DEPENDENCY
  bucket, not a report family; the closure record now carries `dependency_bucket` +
  `source_report_family` (null for the join deps), reconciled by test to 510.

## Bounded Gate 2 doc caveat fixed

- Proof Delta B: the stale "31 cases" now reads **60 cases** (the current semantic suite).
- Proof Delta A (Gate 2): the unresolved reason table previously summed to 870 (the
  condition-specific line was mis-grouped); corrected to sum to **876** and reconciled by the
  Gate 3 closure views. Guards remain true.

## Controller corrections applied (before shadow acceptance)

Integrating the authorized READ-ONLY Custom Reporting inspection (28 datasets; Service +
Service Appointments permanently excluded) at `reporting-vinsolutions.app.coxautoinc.com`:

1. **Approval-state truth.** `duane_approval_required` now means a NEW material approval. The
   active goal already authorizes read-only browser capture + unsaved export retrieval +
   historical accumulation → those routes are `false`. Saved-schedule mutation, external
   feeds, compliance/PII, cross-rooftop, and Service work → `true`. Result: **603 cells need
   no new approval; 273 do.**
2. **Domain split.** The 105 outside-boundary cells are split by ACTUAL domain — **service 27,
   compliance 48, cross_rooftop 9, external_enrichment 21** — routed to
   `separate_service_workspace` / `compliance_authorization` / `separate_cross_rooftop_route`
   (new route) / `external_feed`. Only genuine Service-domain conditions reach the Service
   workspace. All IDs preserved; 876 reconciliation intact.
3. **No "one pass closes 510".** The 510 quarantined cells are 3 report families × 3 dealers,
   with two candidate routes — read-only UNSAVED Sales-only reconstruction (no approval) vs
   saved-schedule repair (needs the hidden Lead Intent control standard Edit Parameters did
   not expose) — **both `candidate_unproved`**.
4. **Dataset evidence integrated, non-overclaiming.** `acquisition-contract.json` records the
   28 datasets + observed fields + the caveat that presence proves a candidate route only.
   Every route is `route_proof_state=candidate_unproved`; fewest honest browser passes are one
   read-only session per dealer, none claimed to "close" a cell.
5. **Data-minimization control (addendum).** Every read-only capture / unsaved export selects
   and retains ONLY the fields strictly required for the named metric(s); customer names,
   emails, phones, addresses, VINs, stock numbers, credit/payment, free-text notes, message
   content, co-buyer, trade, SSN/DOB/DL# are prohibited unless a compliance/PII condition is
   separately authorized. IDs are join/de-dup keys only (pseudonymized, never in customer
   PDFs). `data_minimization.allowed_export_field_selection` (what may be selected) is DISTINCT
   from `dataset_evidence.observed_field_notes` (capability). Not a new approval gate;
   `data_minimization.validation.ok=true`. Invariants preserved: 295/885/9/876, routes
   603/273, domain split, all candidate_unproved.

## 1. Executable 876-cell closure registry

`closure-registry.json` — one deterministic record per unresolved cell, **876 records** with
the exact 876 `(metric_id, dealer_id)` keys from the Gate 2 ledger. Each record carries:
metric/dealer/profile/condition/cluster; exact unresolved-reason category; required raw
fields + definition/denominator/grain; required source; current source state; whether it is
calculable from accepted bytes (**always false** — Gate 2 already applied the strict
predicate) with proof; acquisition route; baseline route; owner / next-action / prerequisite
/ earliest-evidence / stop-condition; whether Duane approval is materially required; and
whether the condition conflicts with the permanent Sales-only boundary. No "N/A" or
"accounted for" is ever promoted to evaluated.

**Reconciliation (`closure-views.json`)** — reconciles exactly to 876 and to the Gate 2
ledger reason categories (`reconciles_to_876=true`, `reconciles_to_gate2_reason_categories=true`):

| category                             | cells |
| ------------------------------------ | ----- |
| quarantined                          | 510   |
| external_source                      | 168   |
| outside_boundary                     | 105   |
| unavailable_retention                | 24    |
| response_time_def_mismatch           | 21    |
| manual_crm                           | 21    |
| second_order_composite               | 9     |
| missing_field (SW-008/SW-034)        | 6     |
| trend_history_needed (SW-043/SW-049) | 6     |
| definition_mismatch (SW-042)         | 3     |
| denominator_integrity (SW-050)       | 3     |

Sum = 876. by_dealer = 292 unresolved each. **Sales-only boundary conflicts identified (not
deleted): 45 cells** (genuine Service-domain 27 + cross-rooftop 9 + Service-to-Sales §10
non-boundary conditions 9). Compliance + external-enrichment are Sales-scoped (need
authorization / a feed), not Sales-only boundary conflicts. Route split: 519
new_readonly_vinsolutions_export, 189 external_feed, 48 compliance_authorization, 42
readonly_browser_capture, 42 historical_accumulation, 27 separate_service_workspace, 9
separate_cross_rooftop_route.

## 2. Maximize evaluation from accepted bytes — proven condition-by-condition

`promotion-probe.json` tests all **295** conditions against ALL FOUR accepted families
(Leads, Appointments, CRM Sales Gross, Dealer Dashboard) definition-first. Honest result:
**exactly 3 promote** (SW-031, SW-032, SW-041) — the Gate 2 set — and **292 do not**, each
with a definition-first reason. Leads-plausible conditions carry an explicit Leads note
(e.g. response-time needs a MEDIAN during business hours with a defined untouched-lead
treatment; Leads has only an AVERAGE-shaped read + no phone/email presence; close-rate rules
are all trend, not point-in-time; duplicate rule is DAILY vs the weekly export). No one-week
proxy for trend rules; composites need all components. No additional honest promotion exists.

## 3. Baseline registry expansion — verified, definition-compatible only

No benchmark value could be **independently verified in this repo** (no network/authority to
transcribe published figures). Per the rule, all five candidate sources (Foureyes ×3, Pied
Piper ILE, NADA Data 2025) remain `value=null`, `value_status=unverified`, and **unusable**;
none is transcribed into any SW condition. Operational targets remain the only usable
baselines and stay labeled `operational_target` (never industry averages). The definition
compatibility decisions are recorded per condition in the closure `baseline_route` field
(`operational_target` / `dealer_history` / `cohort_comparison` / `missing`).

## Boundaries honored

DEV/isolated. No `/srv`, no promotion, no deploy, no Gmail/VinSolutions/schedule/CRM/external
mutation. All Gate 3 evidence is NON-PII (aggregate/derived only; no customer names or VINs).
The Gate 2 ledger (`spine-ledger.json` `c028e227…`) is unchanged.

## Changed / new files (SHA-256 first 16)

| File                                                       | sha256:16          |
| ---------------------------------------------------------- | ------------------ |
| `src/server/reports/evaluator/closure.ts`                  | `6a65a34e6c1c32b5` |
| `src/server/reports/evaluator/promotion-probe.ts`          | `92f8dd4300f6deff` |
| `src/server/reports/evaluator/data-minimization.ts`        | `21a85b8c1f5462c0` |
| `src/server/reports/evaluator/pipeline.ts`                 | `abd58c71c1daf86e` |
| `scripts/m1r-evaluator/build-closure.ts`                   | `5a266f4d0ec9ad02` |
| `scripts/m1r-evaluator/run-pipeline.ts`                    | `981e29548e2d6e6e` |
| `docs/halo/contract/acquisition-contract.json`             | `f6a839ddc0deccbf` |
| `docs/halo/contract/acquisition-contract.md`               | `042946e0328fe61a` |
| `docs/halo/evidence/m1r/evaluator/closure-registry.json`   | `de308c5dc9fb8e6e` |
| `docs/halo/evidence/m1r/evaluator/closure-views.json`      | `c6a83c25164d7508` |
| `docs/halo/evidence/m1r/evaluator/promotion-probe.json`    | `f26ee922d40a0586` |
| `docs/halo/evidence/m1r/evaluator/pipeline-preflight.json` | `32f2c5ea78baef60` |

Every `sha256:16` above is recomputed from the current committed bytes and compared by
`src/test/evaluator-gate3-evidence-hashes.test.ts`, so a later formatting cycle that desyncs
this proof fails the suite instead of shipping a stale hash.
