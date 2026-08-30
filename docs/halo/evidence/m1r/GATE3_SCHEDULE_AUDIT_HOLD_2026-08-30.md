# M1R/M2R Gate 3 — Schedule Safety Read-Only Audit **HOLD** (2026-08-30)

**STATUS: HOLD — Gate 3 (Schedule safety) NOT passed. A definition-level fail-closed source
vulnerability was found in Nissan ROI and Nissan Dashboard (§8). Read-only audit only; no VinSolutions
schedule/filter mutation occurred and none is authorized. Gate 4 NOT authorized. All 18 M1R *delivery
readiness* cells remain `false`.**

Date: 2026-08-30 (America/New_York)
Controller / outcome owner: Codex (reports to Duane)
Bounded writer: Claude Code in isolated clone `/home/ubuntu/hs-m1r-isolated-20260830`
Branch: `codex/m1r-gate3-schedule-audit` (created from ratified Gate-2 commit
`7246715fe34fd7a772ab3a284b4d3cb6320bf21c`, clean tree at preflight)
Independent reviewer: Shadow (this record incorporates a Shadow correction and stops for Shadow
re-review)
Evidence source: controller-supplied **read-only Computer Use** session (authenticated real Chrome).
This writer performed **no** browser, VinSolutions, email, MCP, Brain-DB, schedule, or production
access; it only records controller-supplied evidence and runs read-only repository validations.

Governing control: `docs/halo/M1R_M2R_CONTROL_DIRECTIVE.md` Gate 3 — *"Schedule safety: read-only
audit first. Provide exact saved-filter evidence and proposed diffs. No VinSolutions schedule mutation
without separate Duane approval. Sales-only/zero-Service-and-Parts is fail-closed."*
Governing contract: `docs/halo/M1R_DATA_COVERAGE_CONTRACT.md` and
`docs/halo/contract/coverage-matrix-18cell.json` (Gate 2, ratified).

---

## 1. Bounded objective

Read-only audit of the VinSolutions saved report **schedules and report definitions** for the three
Sales rooftops, to (a) enumerate what is scheduled, (b) capture exact saved-filter/parameter evidence,
(c) verify the Sales-only / zero-Service-and-Parts boundary fail-closed at the definition level, and
(d) establish the period-resolution behavior of the saved filters — **without** editing, running,
saving, scheduling, sending, or mutating anything. A proposed diff for the discovered defect is
recorded (§14) but **not executed**; any correction requires separate Duane approval under a distinct
gate.

## 2. Evidence discipline — proof categories

Every item is tagged by **provenance type**, and proof is never conflated with delivery output:
- **SAVED-DEFINITION PROOF** — the saved report definition's own parameters observed in the UI (dealer,
  period, lead types, source mode + selected source-exclusions).
- **SAVED SLIDING-DATE-FILTER PROOF** — the saved Custom filter's date-endpoint configuration.
- **OUTPUT/DELIVERY EVIDENCE** — current rendered report rows or an accepted Brain `ingest_delivery`
  ledger entry. This is **not** saved-definition proof and never substitutes for it.
- **CALCULATED IMPLICATION** — a derivation from proved inputs, explicitly not a direct observation.
- **INFERENCE** — reasoned extrapolation, carried as risk, never as acceptance.

## 3. Review history of this record

This audit was drafted HOLD, amended to PASS CANDIDATE on first rolling-filter evidence, and is now
returned to **HOLD** by a Shadow correction that found a Nissan source-exclusion defect (§8). The
PASS-candidate and first-HOLD drafts were never committed. This single file is the current record.

---

## 4. Session boundary (SAVED-DEFINITION PROOF of read-only conduct)

- Authenticated real Chrome on host **`vinsolutions.app.coxautoinc.com`**; SH21043 (Serra Honda),
  SN21044 (Serra Nissan), TSF21047 (Tony Serra Ford) definitions inspected.
- Read-only throughout: **no** credential exposure, download/save, Run Now, schedule edit, filter/
  report-definition edit, CRM/customer mutation, or external send. **No schedule or filter value was
  changed.**
- Host matches the ratified Response Times browser contract host exactly.

## 5. Scheduled inventory (SAVED-DEFINITION PROOF)

Exactly **18 saved jobs** = **six families × three dealers**. Owner: **Duane Wells**.

| # | Family (as listed) | Cadence | Report type | Source-exclusion control? |
|---|---|---|---|---|
| 1 | Appointments | weekly | **Custom** | **No source control exposed** |
| 2 | CAGE KPI | weekly | Version | Yes (source mode Exclude) |
| 3 | CRM Sales Gross | weekly | **Custom** | **No source control exposed** |
| 4 | Dealer Dashboard | weekly | Version | Yes (source mode Exclude) |
| 5 | Lead Source ROI | weekly | Version | Yes (source mode Exclude) |
| 6 | Sales Communication | daily | Version | Yes (source mode Exclude) |

## 6. Service-source vocabulary (SAVED-DEFINITION PROOF)

- **Common five service sources** (all three rooftops): **Service; Service Appraisal; Service Dept;
  Service Referral; SERVICE TO SALES APPT CONFIRMATION.**
- **Nissan sixth store-specific service source:** **Oil Change Service - Sealer.Com Website.** Present
  in SN21044 source lists (six available). Honda and Ford expose only the common five.
- Correct, fail-closed exclusion therefore = **all available** service sources checked under source
  mode Exclude: **five for Honda/Ford, six for Nissan.**

## 7. Version-definition source-exclusion audit (SAVED-DEFINITION PROOF)

| Definition | Dealer | Period | Lead Types | Src mode | Service sources selected (excluded) | Verdict |
|---|---|---|---|---|---|---|
| SH21043 ROI | 21043 | Previous Week Mon–Sun | eight (Parts Order/Service/Unknown off) | Exclude | common five | **clean** |
| SH21043 CAGE | 21043 | Previous Week Mon–Sun | Internet/Walk-in/Phone | Exclude | common five | **clean** |
| SH21043 Dashboard | 21043 (Honda only) | Previous Week Mon–Sun | Internet/Walk-in/Phone | Exclude | common five | **clean** |
| SN21044 CAGE | 21044 | Previous Week Mon–Sun | Internet/Walk-in/Phone | Exclude | **six** (common five + Oil Change Service - Sealer.Com Website) | **clean** |
| SN21044 ROI | 21044 | Previous Week Mon–Sun | eight (Parts Order/Service/Unknown off) | Exclude | **five only**; Oil Change Service - Sealer.Com Website **present & UNCHECKED** | **DEFECT** |
| SN21044 Dashboard | 21044 (Nissan only) | Previous Week Mon–Sun | Internet/Walk-in/Phone | Exclude | **five only**; Oil Change Service - Sealer.Com Website **present & UNCHECKED** | **DEFECT** |
| TSF21047 ROI / CAGE / Dashboard | 21047 | Previous Week Mon–Sun | ROI eight; CAGE/Dashboard Internet/Walk-in/Phone | Exclude | common five (Ford exposes no sixth) | **clean** |

Daily Sales Communication (all three dealers, SAVED-DEFINITION PROOF): period Yesterday; single dealer;
eight Sales lead types (Parts Order/Service/Unknown off); Communication Type Sales on, Service/Unknown
off; source mode Exclude with the full service-source group excluded (**Honda/Ford five; Nissan six**);
live rows Sales only. Treated as corrected definitions effective after 2026-08-24; **not** retroactive
acceptance of contaminated prior deliveries.

## 8. CRITICAL — Nissan ROI and Dashboard fail-closed source vulnerability (SAVED-DEFINITION PROOF)

**SN21044 ROI** and **SN21044 Dashboard** use source mode **Exclude** but leave the Nissan service
source **"Oil Change Service - Sealer.Com Website" present and UNCHECKED**, excluding only the common
five. Because that source is a Service source and is **not** excluded, Service leads can enter these two
Sales definitions. This is a **definition-level fail-closed failure**. Under the control directive
(*"Sales-only/zero-Service-and-Parts is fail-closed"*) this **fails Gate 3**.

- SN21044 CAGE (six selected) and Nissan daily (six selected) demonstrate the correct exclusion for the
  same rooftop, confirming the ROI/Dashboard omission is a definitional defect, not a missing source.
- **Do not mutate.** A proposed (unexecuted) diff is recorded in §14; correction requires Duane
  approval.

## 9. Custom-family scope — provenance stated accurately

**SAVED SLIDING-DATE-FILTER PROOF (all six Custom jobs):** each Custom weekly definition uses **Sliding
Date** endpoints. Direct filter-config detail was opened on **SH21043 CRM Sales Gross**: Filter Column
Sold Date; Comparison Date Range; both endpoints Sliding Date; **End** preset **Yesterday**; **Start**
Sliding Date with a custom value (inclusive seven-day span); rendered resolved range **08/23/2026–
08/29/2026**.

**Custom definitions expose NO source-exclusion control** (unlike Version). Custom Sales-only assurance
therefore rests on **OUTPUT/DELIVERY EVIDENCE**, not a saved source filter:
- **SN21044 Appointments — OUTPUT/DELIVERY EVIDENCE:** current output showed **6 visible rows**, each
  dealer **Serra Nissan 21044**, Appt Reason **Sales Appointment**.
- **SN21044 CRM Sales Gross — OUTPUT/DELIVERY EVIDENCE:** current output showed **6 rows**, each dealer
  **Serra Nissan 21044**, **Delivered**, Sold Dates **Aug 24–Aug 28** inside the rendered **Aug 23–Aug
  29** window.
- **TSF21047 Custom — OUTPUT/DELIVERY EVIDENCE (prior controller evidence):** analogous current output
  (dealer 21047 only; Appointments reasons all Sales Appointment; no Service/Parts visible).
- **Honda Custom — OUTPUT/DELIVERY EVIDENCE:** **Honda Appointments** has accepted Brain
  `ingest_delivery` delivery evidence (delivery evidence, **not** saved-definition proof). **Honda CRM
  Sales Gross** has **no** governed output/delivery evidence and its matrix cell is **absent**. **Honda
  Dashboard** is **Version-family** evidence and is **not** used as Custom corroboration.

Output/delivery evidence does not establish the saved definition and does not by itself satisfy Gate 3;
it is recorded as corroboration of current Sales-only content only.

## 10. Period resolution — proof vs calculated implication

- **SAVED SLIDING-DATE-FILTER PROOF:** endpoints are Sliding Date (End = Yesterday; Start = Sliding
  custom, 7-day inclusive); the current rendered preview is **08/23–08/29**, which is a viewing-date
  artifact (viewed Sunday 2026-08-30: Yesterday = 08/29; inclusive 7-day start = 08/23).
- **CALCULATED IMPLICATION (NOT direct historical proof):** from the rolling endpoints plus the Monday
  schedule, a Monday run **calculates** to the immediately completed **Monday–Sunday** week — e.g., the
  2026-08-24 Monday run would calculate to **08/17–08/23** (the ratified contract week). The delivered
  08/24 workbook period was **not** directly observed; this remains a calculated implication to be
  confirmed by fresh delivered workbooks at Gate 4.

## 11. Version report header / cache discrepancy (OUTPUT display; verification deferred)

Native Version report headers displayed **08/24–08/30** even though saved parameters show **Previous
Week**. Marked as a **header/cache discrepancy requiring delivery-level verification** at Gate 4.
Version definitions are **not** labeled broken on display alone.

## 12. Open-item register

- **PROOF (defect):** Nissan ROI + Dashboard fail-closed source vulnerability (§8) — the Gate 3
  blocker.
- **CALCULATED IMPLICATION:** Custom Monday-run Mon–Sun resolution (§10) — confirm at Gate 4.
- **OUTPUT/DELIVERY vs SAVED-DEFINITION:** Custom Sales-only rests on output/delivery evidence + the
  sliding-filter config; Custom exposes no source control (§9). Not equivalent to Version saved-source
  proof.
- **INFERENCE (minor):** direct source-list state for the two non-Honda/Nissan Custom rooftops beyond
  what is recorded — light read-only follow-up; not a blocker (the blocker is the proved Nissan Version
  defect).
- **PROOF→limit:** schedule existence + last-run metadata ≠ fresh accepted workbook delivery →
  **all 18 delivery-readiness cells remain `false`**; Gate 4 governs any change.
- **PROOF:** the only proved browser-only known acquisition task under the committed contract is the
  **Response Times weekly manual checkpoint**.

## 13. Sales-only / zero-Service-and-Parts result (fail-closed evaluation)

- **PASS (definition-level):** SH21043 ROI/CAGE/Dashboard; SN21044 CAGE; TSF21047 ROI/CAGE/Dashboard;
  all daily Sales Communication — correct lead types and complete service-source exclusion for the
  rooftop.
- **FAIL (definition-level, fail-closed):** **SN21044 ROI and SN21044 Dashboard** — incomplete service-
  source exclusion (§8).
- **Custom:** no source control exposed; current output is Sales-only by OUTPUT/DELIVERY evidence (§9),
  pending Gate-4 delivery verification.
- **Overall:** because a Sales-only fail-closed control fails at the definition level, **Gate 3 is
  HOLD**, not a pass or pass-candidate.

---

## 14. Dual-proof deltas + proposed diff

**Proof Delta A — scope / state.**
1. *Schedule surface + saved selection state:* 18 jobs = 6 families × 3 dealers, owner Duane Wells,
   report types and which families expose a source control (§5); the exact per-definition source-source
   selection states, including the unchecked Nissan sixth source on ROI/Dashboard (§7–§8); schedule-
   dialog metadata (§ below).
2. *Repository scope:* on branch `codex/m1r-gate3-schedule-audit` the only change is this single
   evidence file under `docs/halo/evidence/m1r/`. No code/contract/matrix/validator/other file changed;
   no VinSolutions/email/MCP/schedule/Brain/production write. Verified by §17.

**Proof Delta B — outcome / validation.** (distinct class from A)
1. *Fail-closed evaluation (defect discovery):* SN21044 ROI and Dashboard exclude only the common five
   and leave the Nissan sixth Service source unchecked under source mode Exclude — a definition-level
   Sales-only failure, contrasted against SN21044 CAGE/daily which correctly exclude all six (§8).
2. *Sales-only corroboration + rolling-filter config:* Custom current output rows (SN21044 Appointments
   6/6 Sales Appointment; SN21044 CRM Sales Gross 6/6 Delivered, Nissan 21044) and the Sliding-Date
   filter config (§9–§10). Output/delivery, explicitly not saved-definition proof.

**Schedule-dialog proof (SAVED-DEFINITION PROOF).**

| Job | Recipient | Subject | Cadence | Time (ET) | Start | End | Last run |
|---|---|---|---|---|---|---|---|
| TSF21047 Lead Source ROI (wk) | guinan.skidek@huminic.ai | — | every Monday | 06:55 | 2026-08-24 | none | Mon 2026-08-24 07:20:10 |
| TSF21047 Sales Communication (daily) | guinan.skidek@huminic.ai | — | every day | 06:25 | 2026-08-24 | none | Sat 2026-08-29 06:25:35 |
| SH21043 Appointments (wk) | guinan.skidek@huminic.ai | VIN \| Serra Honda 21043 \| Appointments \| Weekly | Weekly Monday only | 07:30 | 2026-08-24 | none | Mon 2026-08-24 07:36:13 |
| SH21043 CRM Sales Gross (wk) | guinan.skidek@huminic.ai | VIN \| Serra Honda 21043 \| CRM Sales Gross \| Weekly | Weekly Monday only | 07:15 | 2026-08-24 | — (not stated) | Mon 2026-08-24 07:20:00 |
| SN21044 Appointments (wk) | guinan.skidek@huminic.ai | VIN \| Serra Nissan 21044 \| Appointments \| Weekly | Weekly Monday only | 07:35 | 2026-08-24 | — (not stated) | Mon 2026-08-24 07:36:53 |

- **SH21043 Appointments message body explicitly says "governed previous complete Monday–Sunday."**
- Fields marked "—" were not stated in the controller evidence and are not inferred.

**Proposed diff (NOT executed; Duane approval required).** In **SN21044 ROI** and **SN21044 Dashboard**
saved definitions, under source mode Exclude, **check "Oil Change Service - Sealer.Com Website"** so all
six Nissan service sources are excluded — matching SN21044 CAGE and Nissan daily. No other field
changes. One definition at a time, with before/after capture and independent verification.

## 15. Disposition — **HOLD pending** (in order)

1. **Duane approval** to correct the two defective Nissan definitions per the §14 proposed diff. No
   mutation is authorized by this record.
2. **Corrective mutation** (only after item 1), read-only-verified before/after, one definition at a
   time; abort/restore on any Service/Parts appearance, wrong dealer, or period regression.
3. **Independent Shadow re-review** of this record and of any correction.
4. **Gate 4 (delivery readiness):** fresh delivered Guinan workbooks must confirm the calculated Mon–Sun
   resolution and pass dealer, period, provenance, schema, Filters, and row-level Sales-only validation
   before any of the 18 readiness cells flips from `false`.

- **Owner:** Codex (outcome controller). Bounded read-only execution: Claude Code. Approval authority
  for any mutation or changed business requirement: **Duane only**.
- **Exact next action:** submit to Shadow for re-review; surface the §8 defect and §14 proposed diff to
  Duane for approval. Do **not** mutate any schedule/filter or advance readiness cells.

## 16. Stop conditions

Production target detected; Service/Parts selected or present in any definition/row; wrong dealer;
stale/ambiguous/unresolved-semantics period; unknown provenance; schema drift; unexpected dirty-file
delta; concurrent writer / Git lock / unexpected branch; failing or regressed validation; credential
request; external send; **any schedule or filter change lacking explicit Duane approval**; proposed
merge/deploy/push; or more than one control gate worked at once. Any of these invalidates this gate and
requires a fresh preflight.

## 17. Rollback concept

- **This gate:** read-only; nothing was mutated in VinSolutions/email/CRM/schedules/filters — nothing to
  roll back externally. Repository rollback is total: this branch adds one additive, uncommitted,
  unpushed evidence file; discarding the branch or file fully reverts. Ratified Gate-2 contract files
  are untouched (§17 validations).
- **For the §14 correction (if approved):** first capture each target definition's exact current state
  (source-selection list, lead types, period endpoints, recipient/subject/cadence/times/start/end) as
  immutable before-state so it can be restored; edit one definition at a time with after-state capture
  and independent verification; restore on any regression.

## 18. Non-mutating repository validations run (read-only)

- Gate-2 coverage-contract validator (`validate-m1r-coverage-contract.mjs`) → **PASS** — committed
  contract/matrix/overlay/18-cell map byte-intact and unchanged on this branch (readiness=false all;
  3/8/7).
- Validator `--self-test` → **PASS** (all bad mutations rejected; control clean).
- `git status` / `git diff --check` → only this single additive evidence file; clean.

## 19. Changed paths

- **Added:** `docs/halo/evidence/m1r/GATE3_SCHEDULE_AUDIT_HOLD_2026-08-30.md` (this file; supersedes the
  never-committed HOLD and PASS-candidate drafts).
- No other path changed. Not committed, not pushed. **Stops here for Shadow re-review.**
