# M1R Gate 3 — Hidden Lead-Intent Blocker (SN21044 ROI + CAGE) — Checkpoint (2026-08-30)

**STATUS: Documentation-only checkpoint. Global Gate 3 and Gate 4 remain HOLD/PENDING. All 18 M1R
delivery-readiness cells remain `false`. No code, contract, matrix, readiness, DB, schedule, Gmail,
VinSolutions, production, deploy, merge, or LifePath was mutated. No delivery was landed and no manifest
was written. Whole-delivery quarantine is code-authoritative; zero metrics accepted.**

Date: 2026-08-30 (America/New_York)
Controller / outcome owner: Codex (reports to Duane)
Bounded writer (sole Andromeda repo writer): Claude Code in isolated clone
`/home/ubuntu/hs-m1r-isolated-20260830`, branch `codex/m1r-gate3-schedule-audit` @
`451cdba4d8f744ed264857500d3205c1ca6d841d`
Related: [[GATE3_CUSTOM_GATE4_CURRENT_2026-08-30]], [[GATE3_RECONCILIATION_2026-08-30]]

## 1. Provenance discipline
- **OBSERVED EVIDENCE** — files hash-gated by this writer + code-authoritative `evaluateDelivery`
  executed in a temp read-only harness (no `landDelivery`, no manifest, no DB write).
- **CONTROLLER READ-ONLY COMPUTER USE** — controller VinSolutions exploration (authoritative for UI
  facts the writer cannot see).
- **INFERENCE** — reasoned derivation, carried as risk, never as acceptance.

## 2. Artifacts (OBSERVED — hash-gated; cited by path, not copied/landed)
| File (in `~/filestore/serra-reports/gate4-inbox/`) | SHA256 | Controller facts |
|---|---|---|
| `m1r-browser-current-sn21044-cage-2026-08-24_to_2026-08-30.xlsx` | `2884e56ea364c7473a41f1c2c06372709d45e4c78f9496090807b00b436959c9` | period Aug24–30; dealer Serra Nissan 21044; clean Lead Types; six Lead Sources Excluded |
| `m1r-browser-current-sn21044-roi-2026-08-24_to_2026-08-30.xlsx` | `b7977c076aeb7acf68e76e5feb1a4236b56bf22083eeac4c7e990aed9e5774cc` | period Aug24–30; dealer Serra Nissan 21044; clean Lead Types; six Lead Sources Excluded |

Both digests matched exactly on receipt.

## 3. Code-authoritative classification (OBSERVED — `hs-ingest-dev` `evaluateDelivery`, temp read-only harness)
Engine: `hs-ingest-dev/src/server/ingest/vin-contracts.ts` `evaluateDelivery` (`PARSER_VERSION vin-xlsx-1`).
Filters check: `[...filters.leadTypes, ...filters.leadIntents].filter(isServiceParts)` where
`SERVICE_PARTS_RE = /\b(service|parts)\b/i`.

| File | status | kind | reason | evidence |
|---|---|---|---|---|
| CAGE `2884e56e…` | **quarantined** | `cage_kpi` | `non-sales-lead-type` | `positive_service_parts_filter: ["Parts","Service"]` |
| ROI `b7977c07…` | **quarantined** | `lead_source_roi` | `non-sales-lead-type` | `positive_service_parts_filter: ["Parts","Service"]` |

Detail (verbatim): *"Filters positively select Service/Parts ([Parts, Service]); a Sales-only scheduled
report must select only Sales Lead Types and Lead Intents."*

- **Zero metrics accepted.** This is a **whole-delivery** quarantine that returns before any row-level
  evaluation; `roi.*` and `cage.*` remain WITHHELD. The engine has **no accept-and-flag / override / env
  bypass** — that path was explicitly removed (operator correction 2026-08-25: "quarantine — never
  accept-and-flag").
- **Contaminant = hidden Lead Intent.** The Filters tab carries **Lead Intents = Parts, Sales, Service,
  Unknown**; `Parts` + `Service` trip the fail-closed rule. The **visible Lead Types** and the **six Lead
  Sources Excluded** are clean and correctly NOT flagged (code: "EXCLUSION IS NOT CONTAMINATION").
- **Hidden, non-UI field (CONTROLLER):** the browser **Edit Parameters exposes no Lead Intent control**
  for either report, so the operator cannot remove Service/Parts Lead Intent through the standard UI.
- **No alternative code proof path (OBSERVED):** the parser captures only *positive* Lead Type/Lead
  Intent selections and recognizes a *Lead-Sources-Excluded* row as proof, but there is no Lead-Intent
  *exclusion* form emitted by this export and no code path treats a positive Lead Intent as cured.

## 3A. Fresh Shadow evidence-integrity PASS (limited) + provenance limits
A fresh conflict-screened Shadow reviewed this checkpoint and returned **PASS — evidence integrity
only**. **Disclosed:** prior branch exposure; same-system functional-separation limitation (not
institutional/external independence). **No approval; no readiness advancement; not a Gate 3 pass.** It
verifies that this record faithfully represents the hashes, the executed classification, and the
observation/inference split — nothing more.

**Shadow-preserved limits (recorded, not diminished):**
- **UI claims are controller-reported.** "Edit Parameters exposes no Lead Intent control", the Create
  Report exploration (§5), and the hidden nature of the field are **controller read-only Computer Use**
  facts; the repo files/code do not independently establish them.
- **Files/code do not prove causation.** The evidence proves *what* the classifier does with the
  workbook Filters; it does **not** prove *why* VinSolutions emits `Parts, Sales, Service, Unknown` in
  Lead Intent, nor that **Cox lacks an administrative fix** (§5 inference bound).
- **Hash provenance.** This writer's SHA256 verifies the files **as they are now**; "matched exactly on
  receipt" is **controller-supplied provenance**, not independently reconstructed by the writer.

## 4. Classifier behavior vs VinSolutions export limitation
- **Not a classifier defect under the ratified Sales-only contract.** `evaluateDelivery` behaves as
  specified: a Filters tab that positively selects Service/Parts contaminates the schedule definition
  itself (a later run may pull Service/Parts), so clean rows in one delivery do not cure it. (This is a
  statement about the classifier's conformance to the ratified contract, not an independent judgment that
  the contract is optimal.)
- **VinSolutions export/definition limitation.** The contaminant is a hidden Lead Intent dimension baked
  into the report definition, not editable via Edit Parameters (UI fact is controller-reported; see §3A).

## 5. Controller read-only Computer Use exploration (VinSolutions Create Report)
- **OBSERVED (controller):** Vin **Create Report** is present; **Data Retrieval was paused before dataset
  selection** (no dataset run). The **Leads dataset exposes Lead Type but NO Lead Intent**, and lacks an
  equivalent **weekly CAGE** or **41-column ROI** aggregation. The closest, **Monthly User Summary By
  Lead Type, is monthly — not weekly**. The **Custom tab was closed and My Reports restored** (no saved
  report, no schedule, no run created).
- **INFERENCE (explicitly bounded):** this proves **no standard visible control and no equivalent custom
  dataset was found** to emit a Sales-only Lead Intent at the required weekly grain. It does **NOT** prove
  Cox has no administrative/support path; that remains unexplored and unproven.

## 6. Smallest technically valid resolutions (permanent Sales-only + original-byte contract)
1. **Source fix (recommended):** correct the VinSolutions report definition's positive **Lead Intent** and
   re-deliver, via **Cox/VinSolutions admin/support** or a **rebuilt source definition**. Origin bytes
   clean; no classifier change; no contract weakening. → **material Duane business approval required**
   (external report-definition/schedule mutation); Cox support likely required. **Not assumed.**
   - **Observed values (both files):** Lead Intents = **Parts, Sales, Service, Unknown**. *Acquisition is
     NOT observed* in these two workbooks.
   - **Mandatory current-contract cure:** **remove/exclude Parts and Service** from the positive Lead
     Intent selection (those two are what `SERVICE_PARTS_RE` flags). That alone clears the
     `non-sales-lead-type` quarantine under the current classifier.
   - **`Unknown` is NOT flagged** by the current classifier and is not a required removal.
   - Selecting **only Sales** (dropping Unknown too) would be a **stricter business choice, not a proven
     current-contract requirement**; adopt only on explicit business direction.
2. **Forward-compat parser support (routine dev; does not unblock today):** recognize a Lead-Intent
   *exclusion* row as proof IF VIN ever emits one — mirrors existing Lead-Sources-Excluded handling.
   Contingent on the export changing; no acceptance today.
3. **Consumer exception (accept-and-filter despite Filters contamination):** **rejected as a default.** It
   **weakens Duane's first-class Sales-only fail-closed rule** (explicitly removed 2026-08-25) and would
   require **material Duane approval, not assumed**.

## 7. Scope and sequencing
- The **Monday 08:00 EDT `Vin Monday 18-cell receipt validation` remains authoritative** (see
  [[GATE3_CUSTOM_GATE4_CURRENT_2026-08-30]] §7). **Monday originals (period 2026-08-24..30) will establish
  the cross-store scope** of the hidden Lead-Intent contamination (is it SN21044-only or all rooftops)
  **before Duane is asked** for the Option-1 source fix.
- Do not treat these two current SN21044 workbooks as delivery acceptance; do not land or promote them.

## 8. Disposition
- **Global Gate 3 remains HOLD/PENDING** (ROI/CAGE quarantined on hidden Lead Intent; no accepted path).
- **Gate 4 remains HOLD/PENDING**; **all 18 readiness cells stay `false`** (contract/matrix untouched).
- **Owner:** Codex; external/report-definition/schedule mutation and any consumer-contract exception =
  **Duane only**. Cox/VinSolutions support engagement = Duane-approved.
- **Next action:** await Monday 18-cell validation to fix cross-store scope; then package the Option-1
  source-fix decision for Duane. Keep Service/Parts fail-closed.

## 9. Changed paths (this checkpoint; docs-only)
- **Added:** this file `docs/halo/evidence/m1r/GATE3_HIDDEN_LEAD_INTENT_BLOCKER_2026-08-30.md`.
- **Amended (minimal):** `issues.md` — one linked entry.
- **Unchanged:** all protected contract/matrix/18-cell docs, code, tests, DB, schedules, Gmail,
  VinSolutions, production, LifePath.
