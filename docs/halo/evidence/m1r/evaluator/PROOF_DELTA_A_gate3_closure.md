# Gate 3 — Proof Delta A (closure registry / reconciliation / maximization / baseline)

**Branch:** `codex/halo-295-unshrinkable-inputs`. One writer. **Status:** Gate 3 — submitted
for review, NOT self-certified. Acceptance is **unchanged**: 295 conditions × 3 dealers =
**885** cells, **18 evaluated / 867 unresolved** today. No scope shrink, no synthetic values,
no missing→zero, no quarantined-source values, Sales-only preserved. No customer PDF authored.

> **Gate 4A supersession (2026-09-01).** Originally **9 evaluated / 876 unresolved** with
> **3 promoted** (SW-031/032/041). Gate 4A promoted **SW-011/012/015** from the accepted Leads
> family (added to the promotion-probe accepted-delivery allowlist from the committed golden),
> giving **18 evaluated / 867 unresolved**, **6 promoted**. Derived reconciliations move with
> it: closure registry 876→**867**, `reconciles_to_876`→`reconciles_to_867`, per-dealer
> unresolved 292→**289**, response-time definition-mismatch 21→**12**, no-new-approval cells
> 603→**594** (the 9 promoted cells were already no-approval readonly_browser_capture, so the
> approval split 273 is unchanged; readonly_browser_capture route 42→**33**). All figures and
> hashes below are truth-aligned to the current committed artifacts.

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
  mutation — each prevents promotion. Positive: exactly SW-011/012/015/031/032/041 from the
  byte build (SW-011/012/015 bind to the accepted Leads captures; SW-031/032/041 to the
  scheduled families).
- **Defect 2 (pipeline labels).** `pipeline.ts` now applies FAIL-CLOSED scope + period
  controls BEFORE calculation: portfolio (no scope) = 3 governed pairs / 885 cells; dealer
  scope requires BOTH a matching governed pair and filters to exactly 295 cells; a fake/
  mismatched/one-sided pair or a malformed/stale/mixed/wrong-tz period returns `ok=false`
  with NO preflight. Preflight scope/period are derived from validated inputs, never copied
  from raw options. Customer-final is dynamic: portfolio 885/885, dealer 295/295 — still
  refused at 18/885 and 6/295.
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
   feeds, compliance/PII, cross-rooftop, and Service work → `true`. Result: **594 cells need
   no new approval; 273 do.**
2. **Domain split.** The 105 outside-boundary cells are split by ACTUAL domain — **service 27,
   compliance 48, cross_rooftop 9, external_enrichment 21** — routed to
   `separate_service_workspace` / `compliance_authorization` / `separate_cross_rooftop_route`
   (new route) / `external_feed`. Only genuine Service-domain conditions reach the Service
   workspace. All IDs preserved; 867 reconciliation intact.
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
   `data_minimization.validation.ok=true`. The Leads readonly selection now also carries the
   two touch-timestamp columns (First Contact Attempt / First Customer Contact — timestamps
   only, allowlisted as non-identity) for SW-012 and an ephemeral pseudonymized Sales Rep
   aggregation key for SW-015 (never persisted as a name). Invariants preserved: 295/885/18/867,
   routes 594/273, domain split, all candidate_unproved.

## 1. Executable 867-cell closure registry

`closure-registry.json` — one deterministic record per unresolved cell, **867 records** with
the exact 867 `(metric_id, dealer_id)` keys from the Gate 2 ledger. Each record carries:
metric/dealer/profile/condition/cluster; exact unresolved-reason category; required raw
fields + definition/denominator/grain; required source; current source state; whether it is
calculable from accepted bytes (**always false** — Gate 2 already applied the strict
predicate) with proof; acquisition route; baseline route; owner / next-action / prerequisite
/ earliest-evidence / stop-condition; whether Duane approval is materially required; and
whether the condition conflicts with the permanent Sales-only boundary. No "N/A" or
"accounted for" is ever promoted to evaluated.

**Reconciliation (`closure-views.json`)** — reconciles exactly to 867 and to the Gate 2
ledger reason categories (`reconciles_to_867=true`, `reconciles_to_gate2_reason_categories=true`):

| category                             | cells |
| ------------------------------------ | ----- |
| quarantined                          | 510   |
| external_source                      | 168   |
| outside_boundary                     | 105   |
| unavailable_retention                | 24    |
| manual_crm                           | 21    |
| response_time_def_mismatch           | 12    |
| second_order_composite               | 9     |
| missing_field (SW-008/SW-034)        | 6     |
| trend_history_needed (SW-043/SW-049) | 6     |
| definition_mismatch (SW-042)         | 3     |
| denominator_integrity (SW-050)       | 3     |

Sum = 867. by_dealer = 289 unresolved each. **Sales-only boundary conflicts identified (not
deleted): 45 cells** (genuine Service-domain 27 + cross-rooftop 9 + Service-to-Sales §10
non-boundary conditions 9). Compliance + external-enrichment are Sales-scoped (need
authorization / a feed), not Sales-only boundary conflicts. Route split: 519
new_readonly_vinsolutions_export, 189 external_feed, 48 compliance_authorization, 33
readonly_browser_capture, 42 historical_accumulation, 27 separate_service_workspace, 9
separate_cross_rooftop_route (readonly_browser_capture dropped 42→33 as SW-011/012/015 ×3
promoted out of the unresolved set).

## 2. Maximize evaluation from accepted bytes — proven condition-by-condition

`promotion-probe.json` tests all **295** conditions against ALL FOUR accepted families
(Leads, Appointments, CRM Sales Gross, Dealer Dashboard) definition-first. Honest result:
**exactly 6 promote** (SW-011, SW-012, SW-015 from the accepted Leads family; SW-031, SW-032,
SW-041 from the scheduled families) — the Gate 2 evaluated set — and **289 do not**, each with
a definition-first reason. SW-011/012/015 promote because the Leads native fields supply a
business-hours median (Originated After Hours=No), a strict-untouched rate, and a per-rep mean
vs store-median share — the exact canonical definitions — bound to the accepted Leads capture
SHA/filename/period. The remaining Leads-plausible conditions still carry an explicit Leads
note (close-rate rules are all trend, not point-in-time; duplicate rule is DAILY vs the weekly
export; missing phone/email presence not exposed). No one-week proxy for trend rules;
composites need all components. No additional honest promotion exists.

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
The Gate 2 ledger (`spine-ledger.json` `c30cee6d…`) now carries the 18-evaluated Gate 4A
state (SW-011/012/015 promoted from the accepted Leads family); see the Gate 2 Proof Delta A.

## Changed / new files (SHA-256 first 16)

| File                                                       | sha256:16          |
| ---------------------------------------------------------- | ------------------ |
| `src/server/reports/evaluator/closure.ts`                  | `c790ea905f6a235e` |
| `src/server/reports/evaluator/promotion-probe.ts`          | `f54352f94ea11e38` |
| `src/server/reports/evaluator/data-minimization.ts`        | `4736e7d6ebab6079` |
| `src/server/reports/evaluator/pipeline.ts`                 | `86746411194b5997` |
| `scripts/m1r-evaluator/build-closure.ts`                   | `baf71d5ce898d830` |
| `scripts/m1r-evaluator/run-pipeline.ts`                    | `60bd445ec20c07b9` |
| `docs/halo/contract/acquisition-contract.json`             | `9b6fe943c23728b3` |
| `docs/halo/contract/acquisition-contract.md`               | `e801b8033beeb698` |
| `docs/halo/evidence/m1r/evaluator/closure-registry.json`   | `e1d5b527a0515097` |
| `docs/halo/evidence/m1r/evaluator/closure-views.json`      | `3f41a13e3f5e7bab` |
| `docs/halo/evidence/m1r/evaluator/promotion-probe.json`    | `1e48aaeb1d2a1a9d` |
| `docs/halo/evidence/m1r/evaluator/pipeline-preflight.json` | `051171f355ca54d4` |

Every `sha256:16` above is recomputed from the current committed bytes and compared by
`src/test/evaluator-gate3-evidence-hashes.test.ts`, so a later formatting cycle that desyncs
this proof fails the suite instead of shipping a stale hash.
