# M1R/M2R Gate 3 — Nissan Source-Exclusion Correction **PASS** (2026-08-30)

**STATUS: PASS — Gate 3 (Schedule safety). The definition-level fail-closed source vulnerability
recorded in the companion HOLD (`GATE3_SCHEDULE_AUDIT_HOLD_2026-08-30.md` §8/§14) was corrected in the
two defective Nissan Version definitions under explicit Duane authorization, and the correction evidence
was confirmed by the independent neutral control check (Shadow) — neutral drift/evidence verification
with no mismatch. This is a definition-correction record, **not** fresh-delivery proof: Gate 3 schedule
safety is satisfied at the definition level, but no delivery has been accepted. Gate 4 (delivery
readiness) remains the next gate. All 18 M1R *delivery readiness* cells remain `false`.**

Date: 2026-08-30 (America/New_York)
Controller / outcome owner: Codex (reports to Duane)
Bounded writer: Claude Code in isolated clone `/home/ubuntu/hs-m1r-isolated-20260830`
Branch: `codex/m1r-gate3-schedule-audit` (HEAD at committed HOLD
`a2b4f5c1fa146d6f16077c00266d6ba9f6d7ff29`; clean tree at start of this update)
Independent reviewer: Shadow (independent neutral control check — **PASS**, neutral drift/evidence
verification with no mismatch; not an approval gate)

## 0. Authority and provenance discipline

- **Duane authorization (explicit):** Duane authorized the two corrections defined by the companion
  HOLD §14 proposed diff (check the Nissan sixth service source on the two defective Version
  definitions). This satisfies the control-directive external-mutation boundary
  (`M1R_M2R_CONTROL_DIRECTIVE.md`: *"Duane alone may approve … an external/production mutation"*).
- **Ongoing approval model (Duane clarification, recorded in `M1R_M2R_CONTROL_DIRECTIVE.md`):** Shadow
  is an independent neutral control check, not an approval proxy. Routine technical choices and in-scope
  corrections that restore the ratified outcome may proceed when the controller plus the independent
  check show work on track. Duane approval remains required only for choices that change intended
  outcome/functionality, expand scope/authority, accept missing/unreadable/skipped/stale/quarantined
  data, weaken acceptance criteria, create customer/legal/financial/production/external commitments, or
  make another consequential deviation. Existing safety and external-mutation boundaries remain.
- **This writer's conduct (Claude Code):** performed **no** browser, VinSolutions, email, MCP, Brain-DB,
  schedule, or production access. It records controller-supplied read-only Computer Use evidence and
  runs read-only repository validations only. The VinSolutions definition edits were performed by the
  controller (authenticated Computer Use) under the Duane authorization above; this record does not
  itself mutate any external system.
- **Provenance tags** carry the HOLD's discipline: **SAVED-DEFINITION PROOF** (definition parameters
  observed in the UI); **PERSISTED-REOPEN PROOF** (state observed after Done + reopen of Edit
  Parameters); **CALCULATED IMPLICATION**; **INFERENCE**. Delivery/output evidence is not mixed with
  definition proof.

## 1. Bounded objective

Apply exactly the companion HOLD §14 proposed diff — under source mode **Exclude**, check the Nissan
store-specific sixth service source **"Oil Change Service - Sealer.Com Website"** in the two defective
Nissan Version definitions (**SN21044 Lead Source ROI** and **SN21044 Dealer Dashboard**) so all six
Nissan service sources are excluded — with before/after capture and persisted-reopen verification, one
definition at a time, and **no other field change**. Record the correction as Gate 3 evidence for
independent Shadow neutral drift/evidence verification. No Run Now, no schedule/cadence/recipient/subject
change, no delivery/readiness change.

## 2. Correction target set

Exactly **two** VinSolutions saved report definitions, both the fail-closed defects from the HOLD:

| Definition | Report type | Dealer | HOLD verdict (before) |
|---|---|---|---|
| SN21044 Lead Source ROI | Version | Serra Nissan 21044 | DEFECT (five only; sixth unchecked) |
| SN21044 Dealer Dashboard | Version | Serra Nissan 21044 (Nissan only) | DEFECT (five only; sixth unchecked) |

No other definition (Honda, Ford, Nissan CAGE, any Custom family, any daily Sales Communication) was
opened for edit or changed. Host: **`vinsolutions.app.coxautoinc.com`** (ratified contract host).

## 3. Planned versus actual

| Aspect | Planned (HOLD §14 diff) | Actual (controller Computer Use) |
|---|---|---|
| Field changed | Check "Oil Change Service - Sealer.Com Website" under source mode Exclude | Selected **only** that source on each definition; no other checkbox toggled |
| Selected service-source count | 5 → 6 on each definition | ROI 5 → 6; Dashboard 5 → 6 |
| Order | One definition at a time, before/after capture | Each edited separately; before, Done, reopen captured per definition |
| Dealer / period | Unchanged | Unchanged on both |
| Lead types | Unchanged (ROI eight allowed; Dashboard Internet/Walk-in/Phone) | Unchanged on both |
| Run Now / cadence / recipient / subject | None | None |
| CRM / customer / DB / email / production / readiness | None | None |
| Other definition change | None | None |

**Deviation:** none. Actual matches the authorized plan on both definitions.

## 4. Proof Delta A — exact before/after definition scope (SAVED-DEFINITION PROOF)

### 4.1 SN21044 Lead Source ROI

- **Before:** dealer **Serra Nissan 21044**; period **Previous Week (Mon–Sun)**; source mode
  **Exclude**; **five common service sources selected** (Service; Service Appraisal; Service Dept;
  Service Referral; SERVICE TO SALES APPT CONFIRMATION); **"Oil Change Service - Sealer.Com Website"
  present and UNCHECKED**.
- **Action:** controller selected only **"Oil Change Service - Sealer.Com Website"**; selected-source
  **count changed 5 → 6**; clicked **Done**; reopened **Edit Parameters**.
- **After (definition scope):** six service sources selected; dealer, period, and the **eight allowed
  lead-type controls unchanged**.

### 4.2 SN21044 Dealer Dashboard

- **Before:** dealer **Serra Nissan 21044** only; period **Previous Week (Mon–Sun)**; **Lead Types
  Internet / Walk-in / Phone**; source mode **Exclude**; **five common service sources selected**;
  **"Oil Change Service - Sealer.Com Website" present and UNCHECKED**.
- **Action:** controller selected only **"Oil Change Service - Sealer.Com Website"**; **count 5 → 6**;
  clicked **Done**; reopened.
- **After (definition scope):** six service sources selected; dealer, period, and lead types
  **unchanged**.

### 4.3 Repository scope

On branch `codex/m1r-gate3-schedule-audit` the only repository changes are (a) this new evidence file
under `docs/halo/evidence/m1r/` and (b) the authorized amendment to
`docs/halo/M1R_M2R_CONTROL_DIRECTIVE.md` recording the ongoing approval model. No code, contract,
matrix, validator, 18-cell map, or other file changed. The committed HOLD file is preserved unchanged.
Verified in §7. Not committed, not pushed.

## 5. Proof Delta B — persisted reopen verification + neutral Shadow PASS (distinct class from A)

### 5.1 PERSISTED-REOPEN PROOF (the correction saved)

After clicking **Done** and reopening **Edit Parameters** on each definition, the persisted state was:

| Definition | Selected count | Oil Change checkbox | Five common sources | Dealer / period / lead types |
|---|---|---|---|---|
| SN21044 Lead Source ROI | six | checked (1) | each checked (1) | unchanged |
| SN21044 Dealer Dashboard | six | checked (1) | each checked (1) | unchanged |

The persisted six-selected state confirms the correction was written and survives a fresh open — the
fail-closed defect (§8 of the HOLD) is closed at the definition level for both Nissan Version
definitions. This now matches the correct reference definitions on the same rooftop (SN21044 CAGE and
Nissan daily Sales Communication, both six-selected per the HOLD).

### 5.2 Neutral independent check — PASS (Shadow, no mismatch)

This external VinSolutions definition mutation proceeded under **Duane's explicit authorization** (§0),
not on Shadow's authority: Shadow is the independent neutral control check that performs neutral
drift/evidence verification and is **not** an approval gate. Shadow has now completed the neutral recheck
of this correction evidence and returned **PASS with no mismatch** — Proof Delta A (before/after
definition scope) and Proof Delta B (persisted-reopen state) verified against this record with no drift.
Per the ongoing approval model, the in-scope correction restored the ratified fail-closed outcome and is
now confirmed by the independent check, so **Gate 3 schedule safety is satisfied** at the definition
level. It remains **not** fresh-delivery proof: definition correctness ≠ a fresh accepted delivered
workbook, which remains a Gate 4 obligation, and all 18 readiness cells stay `false`.

## 6. Boundaries held (SAVED-DEFINITION PROOF of conduct)

- **No** Run Now, cadence, recipient, subject, CRM, customer, DB, email, production, readiness, or other
  definition change.
- **Chrome pop-ups enabled only for `vinsolutions.app.coxautoinc.com`** to open report tabs; report tabs
  were **closed after proof**.
- Only the two named Nissan Version definitions were edited; every other definition untouched.
- No Service or Parts source became eligible for inclusion or output; the only changed checkbox added
  Oil Change to the exclusion set. No wrong dealer; no period change; no schema/provenance drift.

## 7. Non-mutating repository validations run (read-only)

- Gate-2 coverage-contract validator (`node scripts/validate-m1r-coverage-contract.mjs`) → **PASS** —
  committed contract/matrix/overlay/18-cell map byte-intact and unchanged on this branch
  (readiness=false all; current-state 3/8/7).
- Validator `--self-test` → **PASS** (all representative bad mutations rejected; control clean).
- `git diff --check` → clean (no whitespace/conflict errors).
- `git status` → only the two authorized documentation paths changed (this file added/renamed to PASS;
  directive amended). Committed HOLD file unchanged.

## 8. Disposition — PASS (Gate 3 satisfied; Gate 4 next)

1. **Independent Shadow neutral recheck** of this correction evidence (Proof Delta A + B) and of the
   directive amendment: **PASS, no mismatch**. Gate 3 schedule safety is satisfied at the definition
   level.
2. **Gate 4 (delivery readiness)** — the next gate. Fresh delivered Guinan workbooks must confirm the
   calculated Mon–Sun resolution (HOLD §10) and pass dealer, period, provenance, schema, Filters, and
   row-level Sales-only validation before any of the 18 readiness cells flips from `false`.

- **Owner:** Codex (outcome controller). Bounded read-only recording + repo validation: Claude Code.
  External mutation performed by the controller under **explicit Duane authorization**; independently
  verified by Shadow (neutral drift/evidence check, not an approval gate). Any further
  business-requirement change or external/production mutation: **Duane only**.
- **Exact next action:** proceed to Gate 4 planning under a fresh bounded package. Do **not** advance
  readiness cells, run, deliver, or mutate any schedule/filter without the Gate 4 preconditions and
  applicable Duane approval.

## 9. Stop conditions

Production target detected; Service/Parts selected or present in any definition/row; wrong dealer;
stale/ambiguous period; unknown provenance; schema drift; unexpected dirty-file delta; concurrent
writer / Git lock / unexpected branch; failing or regressed validation; credential request; external
send; any further schedule/filter change lacking explicit Duane authorization; proposed
merge/deploy/push; or more than one control gate worked at once. Any of these invalidates this Gate 3
pass and requires a fresh checkpoint.

## 10. Rollback concept

- **External:** each corrected definition's exact before-state is captured in §4 (five common sources
  selected; sixth unchecked; dealer/period/lead-types as recorded) so either Nissan Version definition
  can be restored by unchecking the sixth source if Shadow or Duane directs. One definition at a time,
  with before/after capture.
- **Repository:** additive and uncommitted — discarding this file and reverting the directive amendment
  fully restores the committed HOLD state. Ratified Gate-2 contract files are untouched (§7).

## 11. Changed paths

- **Added:** `docs/halo/evidence/m1r/GATE3_NISSAN_SOURCE_CORRECTION_PASS_2026-08-30.md` (this file;
  finalized from the never-committed PASS-candidate draft after Shadow neutral PASS).
- **Amended:** `docs/halo/M1R_M2R_CONTROL_DIRECTIVE.md` (ongoing approval-model clarification only).
- **Unchanged:** committed HOLD `GATE3_SCHEDULE_AUDIT_HOLD_2026-08-30.md` and every other path.
  Committed and pushed to `codex/m1r-gate3-schedule-audit` as the Gate 3 evidence backup. No PR, merge,
  or deploy.
