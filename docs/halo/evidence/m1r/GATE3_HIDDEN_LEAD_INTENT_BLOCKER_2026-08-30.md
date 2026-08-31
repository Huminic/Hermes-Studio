# M1R Gate 3 — Hidden Lead-Intent Blocker (SN21044 ROI + CAGE) — Checkpoint (2026-08-30)

**STATUS: Documentation-only checkpoint. Global Gate 3 and Gate 4 remain HOLD/PENDING. All 18 M1R
delivery-readiness cells remain `false`. No code, contract, matrix, readiness, DB, schedule, Gmail,
VinSolutions, production, deploy, merge, or LifePath was mutated. No delivery was landed and no manifest
was written. Whole-delivery quarantine is code-authoritative; zero metrics accepted.**

> **HISTORICAL-STATUS LABEL (additive; no history rewritten):** Earlier status/next-action statements in
> this record dated 2026-08-30 — e.g. "await Monday", "no delivery landed", "zero accepted" — describe the
> state **at that time** and are **HISTORICAL / SUPERSEDED by §10 (2026-08-31)**: the current state is
> **9 accept / 9 quarantine** (the 9 CAGE/ROI/Sales-Communication families remain quarantined; the
> Lead-Intent HOLD question is unchanged). The prior wording and evidence are preserved as-is.

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

## 5A. Controller read-only official Help Center review (CONTROLLER — UI/doc facts, see §3A limits)
Authenticated VinSolutions Help Center, read-only. Browser discipline: Help tab closed; Vinconnect
restored; **no report opened/saved/scheduled/run; no CRM/settings/customer mutation.**

- **OBSERVED — Knowledge searches returned zero results:**
  - `"Lead Intent"` → 0 Knowledge results
    (`https://casfx.my.site.com/vinsolutions/s/global-search/Lead%20Intent`).
  - `"report filter Lead Intent"` → 0 Knowledge results
    (`https://casfx.my.site.com/vinsolutions/s/global-search/report%20filter%20Lead%20Intent`).
  - **Bound:** zero search results is **not** proof that no Cox administrative/support remedy exists.
- **OBSERVED — Article 000001221 "VS Insights - Create a New Report" (dated 2026-05-04,**
  `…/s/article/Insights-Creating-a-New-Report-1762074166`**):** states Custom Reporting **Allow Access**
  and **Allow Edit** are prerequisites; Create Report uses a chosen dataset, selected columns/additional
  datasets, and user-added filters via **Filter Column / Comparison / Value**. It does **not** mention
  Lead Intent or any native Version-report hidden-filter repair.
- **OBSERVED — Article 000001223 "VS Insights Filters"**
  (`…/s/article/Insights-Using-Filters-1839442491`)**:** concerns the Insights left-side
  report/dashboard **navigation** filters, **not** row/data filters; provides **no** Lead Intent control.
- **INTERPRETATION (bounded):** official guidance supports custom-report filtering **in principle when the
  dataset exposes the necessary column**, but does **not** cure the already-observed fact (§5) that the
  Leads dataset exposed **no Lead Intent** and no equivalent weekly CAGE / 41-column ROI dataset was
  found. The smallest current resolution remains **Cox/Vin admin/support or a rebuilt source definition**.
  This evidence **strengthens the precise support question** but **does not authorize contacting support
  or changing schedules**.

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

## 10. Addendum — Nissan read-only UI evidence, Help Center, and material decision (2026-08-31)

**STATUS: still HOLD on the hidden Lead-Intent question. NOT complete. Documentation-only addendum;
no contract, classifier, code, test, schedule, data, readiness, or production change. 9 accept / 9
quarantine unchanged; the 9 CAGE/ROI/Sales-Communication families remain quarantined (zero accepted
metrics). No consumer relaxation is adopted here.**

### 10.1 Read-only VinSolutions UI findings (CONTROLLER — Nissan SN21044; no save/run)
Across the ROI, CAGE, and Sales Communication native editors and **Custom Reporting → Leads**, every
**exposed** control is Sales-only:
- source mode **Exclude** with the **six service-source exclusions**;
- Lead Types: **Parts Order OFF, Service OFF**;
- CAGE: Lead Types **Internet / Walk-in / Phone**, **Sales Rep** role, **Sales Appointment**;
- Sales Communication: **Communication Type = Sales only** (Service and Unknown OFF).
- **Lead Intent is NOT exposed** in any of the three native editors, and **Custom Reporting Leads exposes
  NO Lead Intent field or filter.**
- Fresh delivered XLSX rows: **zero** Service/Parts/service-source/wrong-dealer (OBSERVED, prior sections).

### 10.2 State unchanged: 9 accept / 9 quarantine
No promotion, no classifier/contract change. The hidden Filters `Lead Intent = [Parts, Sales, Service,
Unknown]` still trips the ratified fail-closed rule (§0) → the **9 CAGE/ROI/Sales-Communication families
stay quarantined**; the 9 accepted families (Dashboard/Appointments/CRM Sales Gross ×3) are unchanged.

### 10.3 Official Help Center evidence (CONTROLLER read-only) — precise, limited interpretation
- `https://casfx.my.site.com/vinsolutions/s/article/Lead-Source-Filter-Why-do-the-counts-change`
  — supports that **UI / report-selection DISPLAY differences can exist for Lead Source**.
- `https://casfx.my.site.com/vinsolutions/s/article/35093`
  — supports that **custom filters require exposed dataset fields**.
- **INTERPRETATION (bounded):** these establish (a) Lead-Source display can differ by selection and
  (b) a custom filter needs an exposed field. **Neither article proves the hidden Lead Intent is
  non-operative** (i.e., a display-only, non-filtering artifact). The non-operative claim remains
  **UNPROVEN**.

### 10.4 Independent Shadow HOLD vs Studio analysis — recorded disagreement
- **Shadow: HOLD.** Fail-closed stands — a positive Service/Parts Lead Intent quarantines the whole
  delivery; clean rows and correct other controls do **not** cure it; no consumer relaxation without
  proof and explicit authorization.
- **Studio analysis (this consumer, in-pane review):** a narrow consumer exception is **technically
  possible IF Duane authorizes** — bounded to the Lead-Intent-in-Filters signal, gated by
  all-other-controls-correct + zero row-level hits, flagged temporary pending Cox. Studio did **not**
  recommend adopting it without Duane approval and independent verification.
- **They disagree on whether to relax; they AGREE the state stays quarantined absent explicit
  authorization.** No relaxation is adopted in this checkpoint.

### 10.5 Exact material decision required (Duane only)
- **(A) Keep quarantine** (no change; 9 families withheld; await Cox) — zero Service/Parts leakage risk; or
- **(B) Authorize a narrow Lead-Intent-metadata consumer exception** — **MATERIAL**: it weakens a ratified
  fail-closed acceptance criterion (§0) and accepts currently-quarantined data. It would require a
  contract amendment (`SCHEMA_CONTRACT` + coverage-matrix), a classifier change in `hs-ingest-dev` under
  its own gate, the per-delivery proof gates (Lead Type clean; Lead Intent ⊆ pinned fixed set; six
  source exclusions; family controls; zero row-level Service/Parts; one tenant; correct period;
  provenance; a regression negative-golden proving Lead **Type** or row Service/Parts still quarantines),
  and **independent verification**.
- Per the control directive (weakening acceptance / accepting quarantined data → **Duane approval**), this
  is a **material contract decision**, not a routine technical choice.

### 10.6 Cox support question (follow-up, non-blocking)
Ask Cox / VinSolutions authoritatively: **is Filters `Lead Intent = [Parts, Sales, Service, Unknown]` a
fixed, non-operative display/metadata artifact, or an active inclusion filter that can pull Service/Parts
leads into the dataset?** A confirmed "non-operative" answer would convert the current inference to proof
and could retire any need for a consumer exception; a "filtering" answer confirms the quarantine is
correct.

### 10.7 Owner and next action
- **Owner:** Codex (outcome controller). Decision authority for (B) or any contract/classifier change:
  **Duane only.** Independent verification: Shadow / fresh clean-room.
- **Next action:** surface the §10.5 material decision and §10.6 Cox question to Duane. Do **not** relax
  the classifier, promote, or amend the contract without explicit authorization. Gate 3 remains **HOLD**
  on the Lead-Intent question — **not complete**.

### 10.8 Changed paths (this addendum; docs-only)
- **Amended:** this file only (additive §10).
- **Unchanged:** contract, classifier, code, tests, schedules, data, readiness, production; the committed
  HOLD `a2b4f5c1f` and all protected artifacts remain byte-intact.
