# Gate 3 — Proof Delta A (closure registry / reconciliation / maximization / baseline)

**Branch:** `codex/halo-295-unshrinkable-inputs`. One writer. **Status:** Gate 3 — submitted
for review, NOT self-certified. Acceptance is **unchanged**: 295 conditions × 3 dealers =
**885** cells, **9 evaluated / 876 unresolved** today. No scope shrink, no synthetic values,
no missing→zero, no quarantined-source values, Sales-only preserved. No customer PDF authored.

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
| `src/server/reports/evaluator/closure.ts`                  | `c20efda9df964b49` |
| `src/server/reports/evaluator/promotion-probe.ts`          | `4628026ce75541b4` |
| `src/server/reports/evaluator/pipeline.ts`                 | `3d7a9be96753d67e` |
| `scripts/m1r-evaluator/build-closure.ts`                   | `859ae8a04215ed89` |
| `scripts/m1r-evaluator/run-pipeline.ts`                    | `981e29548e2d6e6e` |
| `docs/halo/contract/acquisition-contract.json`             | `4c3059380fdb88c2` |
| `docs/halo/contract/acquisition-contract.md`               | `63f8c2eec7c5e100` |
| `docs/halo/evidence/m1r/evaluator/closure-registry.json`   | `27060deada9e7076` |
| `docs/halo/evidence/m1r/evaluator/closure-views.json`      | `c6a83c25164d7508` |
| `docs/halo/evidence/m1r/evaluator/promotion-probe.json`    | `3a9d1b4ca677f7f8` |
| `docs/halo/evidence/m1r/evaluator/pipeline-preflight.json` | `a0c3d363109022e6` |

Every `sha256:16` above is recomputed from the current committed bytes and compared by
`src/test/evaluator-gate3-evidence-hashes.test.ts`, so a later formatting cycle that desyncs
this proof fails the suite instead of shipping a stale hash.
