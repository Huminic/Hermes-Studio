# M1R/M2R Gate 3 — Reconciliation Record (2026-08-30)

**STATUS: An earlier clean-room reviewer returned **FAIL** (§3B), which was controlling at the time it
was rendered on the pre-repair evidence and is preserved as historical. This additive **evidence repair**
corrected the overclaims that FAIL identified (minute-precision times; removed per-shot/fully-primary
overclaims; `83756dfd` marked ambiguous/not-relied-on) and added two live read-only ROI captures (§4B)
resolving the UI label occlusion. A fresh, conflict-screened Shadow — the **genuinely fresh auditor**
this record called for — then reviewed the repaired record and returned a limited **evidence-integrity
PASS** (§3C). That PASS **supersedes the §3B FAIL only for the narrow evidence-integrity question the
FAIL raised**; the repaired record is not "still awaiting" a fresh auditor. The evidence-integrity PASS
grants **no approval** and promotes **nothing** — not either SN21044 Version definition, any Custom
family, Gate 4, readiness, or global Gate 3. This record asserts **no Gate 3 PASS**. **GLOBAL Gate 3
remains HOLD/PENDING** on its own merits (Custom-family source-control/output proof and Gate 4
obligations unresolved). Twelve immutable, hash-verified captures are on record (§4, §4A, §4B). No
self-approval is asserted. All 18 M1R delivery-readiness cells remain `false`. Delivery remains a Gate 4
obligation. No VinSolutions Save/Done, schedule, filter, delivery, matrix, contract, validator,
readiness, production, PR, merge, or deploy change was made.**

Date: 2026-08-30 (America/New_York)
Controller / outcome owner: Codex (reports to Duane)
Bounded writer (sole Andromeda repo writer): Claude Code in isolated clone
`/home/ubuntu/hs-m1r-isolated-20260830`
Branch: `codex/m1r-gate3-schedule-audit`
Independent review status: **FAIL — controlling** (final clean-room reviewer; see §3B). A genuinely
fresh auditor review is required after this repair. This writer performed **no** browser, VinSolutions,
email, MCP, Brain-DB, schedule, or production access; it hash-verified controller-supplied immutable
captures and ran read-only repository validations only.

This record is **additive**. It does not edit, rebase, or reword the committed HOLD or PASS bytes; it
supersedes only the PASS record's *conclusion* (its independent-PASS claim) and annotates corrections.

---

## 1. Artifacts preserved (unchanged) and this record's relation to them

| Artifact | Commit | Relation |
|---|---|---|
| `GATE3_SCHEDULE_AUDIT_HOLD_2026-08-30.md` | `a2b4f5c1f` | Preserved byte-intact. Its §8 defect finding stands. |
| `GATE3_NISSAN_SOURCE_CORRECTION_PASS_2026-08-30.md` | `f8d1bffa1` | Preserved byte-intact. Its **conclusion** (independent PASS via "Shadow neutral PASS") is **withdrawn** by §3 below; its factual before/after scope is retained and now corroborated by §4. |
| Gate-2 ratified contract/matrix/overlay/18-cell | `7246715fe` | Untouched. Verified in §6. |

Superseding is by this additive record only. The prior commits are not rewritten.

## 2. Corrected chronology — the captures are POST-SAVE read-only reopen proof

A prior draft of this reconciliation (by this writer) mischaracterized the four reopen captures as
*pre-save edit state*. That was **wrong** and is corrected here. **Time-precision correction (per §3B
FAIL finding 1):** the macOS screenshot filenames carry **minute precision only**; earlier second-level
times were an overclaim and are removed. Save (modified) times are shown directly in the scheduled-list
capture (`be0946e2…`); reopen times below are minute-precision filename times, treated as
approximate/ordering only:

| Event | Definition | Time (ET, 2026-08-30, minute precision) | Source |
|---|---|---|---|
| Correction saved (scheduled-list *modified* time) | SN21044 Lead Source ROI | 10:40 AM | **PRIMARY** — scheduled-list capture (SHA256 `be0946e2…`) shows row "SN21044 \| Lead Source ROI \| Weekly" modified 08/30/2026 10:40 AM |
| Correction saved (scheduled-list *modified* time) | SN21044 Dealer Dashboard | 10:43 AM | **PRIMARY** — same capture (SHA256 `be0946e2…`) shows row "SN21044 \| Dealer Dashboard \| Weekly" modified 08/30/2026 10:43 AM |
| Read-only reopen capture (expanded exclusions) | ROI | ~11:45 AM | JPEG (SHA256 `10be660e…`); macOS filename time, minute precision only |
| Read-only reopen capture (summary) | ROI | ~11:46 AM | JPEG (SHA256 `62af60f9…`); minute precision only |
| Read-only reopen capture (summary) | Dashboard | ~1:17 PM | JPEG (SHA256 `d011c4bc…`); minute precision only |
| Read-only reopen capture (expanded exclusions) | Dashboard | ~1:25 PM | JPEG (SHA256 `0d22a8ff…`); minute precision only |

Each reopen filename time is **later** (to minute precision) than its definition's save time. **"No
Done/Save was clicked" during the capture session is a safety property** — the capture session made no
new mutation — **not** evidence of a pre-save state. The captures are read-only reopen views of the
saved definitions. This chronology is **not** presented as a completed proof; the controlling
disposition is the §3B FAIL, and only a genuinely fresh auditor may accept the limited claim.

## 3. Disclosures — original Shadow recusal and clean-room INDETERMINATE

- **Shadow recused.** The committed PASS (`f8d1bffa1`, §5.2/§8) states "Shadow neutral PASS, no
  mismatch." In fact **Shadow recused** and did not return a PASS. The PASS record's independent
  verification leg is therefore **not substantiated**; its independent-PASS conclusion is **withdrawn**.
- **Clean-room INDETERMINATE.** An independent clean-room reviewer rejected the prior PASS as
  **INDETERMINATE**. That verdict was rendered on the record as it stood **before** the immutable
  primary captures in §4 existed; it addressed the absence of independent, immutable persistence proof.
- **No self-approval.** Per the Environmental Core Values (no self-approval; implementation ≠
  verification ≠ approval), this writer does **not** convert the new primary evidence into a PASS on its
  own authority. Final Gate 3 disposition requires a fresh independent review of this record.

## 3A. Fresh auditor verdict — INDETERMINATE (controlling)

A fresh independent auditor reviewed this reconciliation record and its evidence and returned
**INDETERMINATE**. **This verdict controls.** It is not overridden by this writer, by the controller, or
by the addition of new evidence; only a subsequent independent auditor pass can change the disposition.

**Independently verified by the auditor (resolved):**
- SHA256 hashes of the captures, pixel content, Git state, validator results, and the all-`false`
  readiness matrix — all independently checked and consistent with this record.

**Auditor findings requiring resolution (as raised):**
1. **No visible timestamp** in the original five JPEGs (§4) — capture instant not provable from pixels.
2. **Dashboard selected dealer not directly exposed** in the original Dashboard captures.
3. **Scope-creep risk in §10.2** — wording could imply this two-Version-definition evidence supports
   *global* Gate 3 despite unresolved Custom-family proof.

**Disposition of those findings in this update:**
- Findings 1 and 2 are **addressed** by the five auditor-response captures in §4A: each shows a visible
  in-window DevTools UTC timestamp (`new Date().toISOString()`), and one directly exposes the Dashboard
  dealer dropdown with **Serra Nissan of Sylacauga (21044) checked**. These strengthen the **limited
  two-definition** persistence proof only.
- Finding 3 is **corrected**: §10 no longer contains any sentence implying global Gate 3 closure; §10.2
  is rewritten and an explicit global-scope limit is stated (§8A / §10).
- **Unresolved and NOT resolvable by this evidence:** the Custom-family (Appointments, CRM Sales Gross)
  source-control and output/delivery proof. Custom definitions expose no source-exclusion control (HOLD
  §9); these captures speak only to two **Version** definitions. Therefore **global Gate 3 remains
  HOLD/PENDING** regardless of any auditor pass on the limited claim. An independent verification leg is
  still owed (Shadow recused; prior clean-room INDETERMINATE).

## 3B. Prior clean-room reviewer verdict — FAIL (historical; controlling at time rendered; superseded for the narrow evidence-integrity issue by §3C)

A clean-room reviewer reviewed the pre-repair record and returned **FAIL**. This FAIL was **controlling
at the time it was rendered** on the evidence then on record, and is **preserved as historical**. Its
findings were correct on that evidence; the reviewer's impartiality is accepted. This repair addressed
each finding (below), and the fresh conflict-screened Shadow (§3C) then verified the repair — so the FAIL
is **superseded, for the narrow evidence-integrity question it raised**, by §3C. The FAIL never decided
Gate 3 itself; global Gate 3 remains HOLD/PENDING on its own merits regardless.

**Reviewer FAIL findings (as rendered) and their disposition in this repair:**

1. **Minute-level filenames vs second-level claims.** The original JPEG filenames support only
   minute-level times; the second-level times previously cited were an overclaim. **Corrected** —§2 and
   §4A now state minute precision only; second-level and "per-shot filename" claims are removed.
2. **ROI Include/Exclude contradiction.** Timestamped ROI expanded `83756dfd` visibly shows an
   **Include** radio while companion summary `682cd88c` shows **Exclude**. **Explained and superseded** —
   in `83756dfd` the open source dropdown occluded the *Lead Sources* Include/Exclude label; the visible
   "Include" radio is the **separate "Include or Exclude Users?"** control. Two new live captures (§4B),
   with both radio groups labeled and unobscured, show **Lead Sources = Exclude** and **Users = Include**.
   **This record no longer relies on `83756dfd` for the ROI Exclude assertion.**
3. **Repeated per-session UTC value described as later per-shot filenames.** The single per-session
   `new Date().toISOString()` value is not a per-shot clock. **Corrected** — the §4A timestamp note is
   rewritten to claim only that the report session was active at that UTC instant.

Recording this correction does not attack the reviewer: the occlusion made the earlier ROI-expanded
shot genuinely ambiguous, and the FAIL was the correct call on the evidence available at that time.

## 3C. Fresh conflict-screened Shadow verdict — PASS (limited to evidence integrity only)

A fresh, conflict-screened Shadow — **the genuinely fresh auditor this repaired record called for** —
independently reviewed the repair and returned **PASS — limited evidence integrity only**. This PASS
**supersedes the §3B FAIL only for the narrow evidence-integrity question the FAIL raised** (screenshot
time precision, the removed overclaims, and the ROI Include/Exclude label). It is **NOT** a Gate 3 pass,
carries **no** approval or mutation authority, and promotes **nothing** — not either SN21044 Version
definition, any Custom family, Gate 4, readiness, or global Gate 3. The repaired record is therefore
**not** "still awaiting" a fresh auditor on the evidence-integrity issue; Gate 3 disposition is a
separate question and remains HOLD/PENDING on its own merits.

**Shadow conflict screen (disclosed):** no prior exposure, authorship, execution role, personal stake,
or conflict. Shadow explicitly notes that **same-system functional separation is not
institutional/external independence**, and that it holds **no approval or mutation authority**.

**What Shadow independently verified (evidence integrity):**
- Branch / HEAD / remote at `f8d1bffa10a9802bc0f09ac59ae9e03348daea60`; exact uncommitted scope =
  `issues.md` + this reconciliation + 12 JPEGs; all hashes and pixels.
- New ROI **summary** labels **Lead Sources = Exclude** and **Users = Include**, dealer 21044, 6
  selected, Previous Week, Lead Type 8; new ROI **expanded** binds **Exclude to Lead Sources** and shows
  six checks, with the separate **Users Include** visible; visible UTC `2026-08-30T20:02:33.404Z`.
- Old screenshot times are minute-only; affirmative per-shot / fully-primary overclaims removed;
  `83756dfd` marked ambiguous and not relied upon; the prior FAIL is preserved.
- Both validators PASS; `git diff --check` clean; all 18 readiness cells `false`; protected files
  unchanged.

**Shadow-stated limitations (recorded, not diminished):**
- Pixels do **not** independently prove browser non-mutation, the read-only workflow, or provenance
  beyond pixels + hashes.
- The repeated UTC value proves session-active only (not a per-shot clock).
- The expanded frame partly covers the lower *Users* label.
- **No** Custom-family, delivery, Gate 4, readiness, or global Gate 3 conclusion is drawn.

**Net effect:** the evidence-integrity of this repair is independently corroborated at a limited scope by
the genuinely fresh auditor (superseding the §3B FAIL on that narrow question only). This resolves the
evidence-integrity issue **without** promoting anything: **global Gate 3 remains HOLD/PENDING** on its
own merits (Custom-family controls/output proof and Gate 4 unresolved), and all 18 readiness cells stay
`false`. No approval; no Gate 3 PASS.

## 4. Original persistence evidence — five immutable hash-verified captures

These five captures are preserved as the **corroborative persistence set**. Received via the authorized
external staging inbox `~/filestore/serra-reports/gate3-inbox/` (outside the repo). Each file's SHA256
was computed on receipt and matched **exactly** to the controller-declared digest before entering the
repo; repo copies were re-hashed after copy and match. Role is assigned by hash, not filename.

| Repo path (`docs/halo/evidence/m1r/gate3-captures/`) | SHA256 | Role | Observed (read-only, writer-verified against pixels) |
|---|---|---|---|
| `SN21044-lead-source-roi-expanded-exclusions-2026-08-30-1145ET.jpeg` | `10be660e5be83a547a2becd96287cb79fc6a4a87f4ea17edb7234c563c1a64af` | ROI, expanded exclusions | Dealer Serra Nissan (21044); "6 selected"; expanded list shows **Oil Change Service - Sealer.Com Website checked** with Service, Service Appraisal, Service Dept, Service Referral, SERVICE TO SALES APPT CONFIRMATION |
| `SN21044-lead-source-roi-summary-2026-08-30-1146ET.jpeg` | `62af60f9d6bdb9388f8841d135ebf0471b98b78c52f6c5f775f491fee1429d93` | ROI, summary | Serra Nissan (21044); Lead Source Group "6 selected"; **Exclude** active; Date Range **Previous Week (Mon–Sun)**; Lead Type **8 selected** |
| `SN21044-dealer-dashboard-summary-2026-08-30-1317ET.jpeg` | `d011c4bc6ae4950718c1a85b13feb76a625f8ce804d8d59aa25feee774dea8cb` | Dashboard, summary | SN21044 Dealer Dashboard Weekly; "6 selected"; **Exclude** active; **Previous Week (Mon–Sun)**; Lead Type **Internet, Walk-in, Phone** |
| `SN21044-dealer-dashboard-expanded-exclusions-2026-08-30-1325ET.jpeg` | `0d22a8ff14910e3ce4dc0223b108d24c71589c4012135fcc537b70ab49316b3c` | Dashboard, expanded exclusions | "6 selected"; expanded list shows **Oil Change Service - Sealer.Com Website checked** with the five common service sources |
| `SN21044-scheduled-list-modified-times-2026-08-30-1305ET.jpeg` | `be0946e26a5d137aba61894ebd570fba88da48306152f906ccd78b3512948f22` | Scheduled list, save (modified) times | Rooftop **Serra Nissan of Sylacauga #21044** (owner Duane Wells); Scheduled reports list Dealer Modified Date column shows **"SN21044 \| Dealer Dashboard \| Weekly" (Version) modified 08/30/2026 10:43 AM** and **"SN21044 \| Lead Source ROI \| Weekly" (Version) modified 08/30/2026 10:40 AM**; these are the **only** two rows dated 08/30 (all other rows 08/18–08/24), corroborating that no other definition was modified that day |

**Strictly limited claim.** This evidence supports one conclusion only: for the **two** SN21044 Version
definitions (Lead Source ROI and Dealer Dashboard), the saved definition now excludes all six Nissan
service sources under source mode Exclude, with dealer, period, and lead-type controls unchanged, and
that state persisted across an independent read-only reopen. It does **not** extend to any other
definition, store, family, or cell, and it is **not** delivery proof.

## 4A. Auditor-response evidence — five timestamped captures (address §3A findings 1–2)

Captured read-only in the same authenticated Chrome window with the DevTools console visible; each shows
`new Date().toISOString()` evaluated in-window as a visible UTC timestamp. Received via the same inbox;
each SHA256 matched exactly on receipt and re-hashed after copy. These resolve the "no visible
timestamp" and "Dashboard dealer not directly exposed" findings for the **two Version definitions only**.

| Repo path (`docs/halo/evidence/m1r/gate3-captures/`) | SHA256 | Visible DevTools UTC | Role | Observed (writer-verified against pixels) |
|---|---|---|---|---|
| `SN21044-dealer-dashboard-dealer-dropdown-ts20260830T184308Z.jpeg` | `a19f642d17ca0629861870b4cb032abaf613a4f431050483419d5b59e51217d6` | `2026-08-30T18:43:08.425Z` | Dashboard, dealer dropdown | Dealer dropdown open: **Serra Nissan of Sylacauga (21044) checked**; Serra Honda (21043) and Tony Serra Ford (21047) unchecked |
| `SN21044-dealer-dashboard-expanded-exclusions-ts20260830T184308Z.jpeg` | `3d224a08dde0031291a20faf15a8c07d0fbf5eb98b1681fc15a9065e392dc7b3` | `2026-08-30T18:43:08.425Z` | Dashboard, expanded exclusions | "6 selected"; **Oil Change Service - Sealer.Com Website checked** with the five common service sources; Social Media/Bing unchecked |
| `SN21044-dealer-dashboard-summary-ts20260830T184308Z.jpeg` | `3dd397851508d6594f38d0a75a5175e5860e10365fd354438f6964692a152393` | `2026-08-30T18:43:08.425Z` | Dashboard, summary | "6 selected"; **Exclude** active; **Previous Week (Mon–Sun)**; Lead Type **Internet, Walk-in, Phone** |
| `SN21044-lead-source-roi-summary-ts20260830T192542Z.jpeg` | `682cd88c49f22c8a416a75192e0f4b51ec98837c2831dd0ada20998f19bffafe` | `2026-08-30T19:25:42.206Z` | ROI, summary | Dealer **Serra Nissan of Sylacauga (21044)**; "6 selected"; **Exclude** active; **Previous Week (Mon–Sun)**; Lead Type **8 selected** |
| `SN21044-lead-source-roi-expanded-exclusions-ts20260830T192542Z.jpeg` | `83756dfd6360aa17b19cf90f3a8dad221d3f74b732317c61a937bf75b709bb2c` | `2026-08-30T19:25:42.206Z` | ROI, expanded exclusions — **AMBIGUOUS; NOT relied upon** | "6 selected"; **Oil Change Service - Sealer.Com Website checked** with the five common service sources. **The open dropdown occluded the *Lead Sources* Include/Exclude label; the visible "Include" radio is the separate "Include or Exclude Users?" control (§3B finding 2). This record does NOT use this shot for the ROI Exclude assertion — superseded by the live pair in §4B.** |

**Timestamp nuance (corrected per §3B finding 3):** within each report the shots share one visible
DevTools UTC value (three Dashboard shots `18:43:08.425Z`; two ROI shots `19:25:42.206Z`) because
`new Date().toISOString()` was evaluated once per report session and its output remained visible in the
console. The visible value proves **only** that the report session was active at that UTC instant; it is
**not** a per-shot clock, and the macOS screenshot filenames (minute precision) are **not** used to
assert per-shot second-level timing.

**Still strictly limited.** Like §4, this set proves only the two SN21044 **Version** definitions. It
does not touch any Custom family, other store, or cell, and is not delivery proof.

## 4B. Live read-only ROI captures — resolve the §3B finding-2 label occlusion (two captures)

Controller follow-up: a fresh authenticated **read-only** VinSolutions inspection of the **saved** state
of SN21044 Lead Source ROI. **No Vin Save/Done was clicked; the settings dialog was closed with X; the
temporary report/DevTools tab was cleaned up.** Live accessibility tree (AX) and pixels both proved the
saved state; the two captures below show both radio groups labeled and unobscured, directly resolving
the occlusion behind reviewer finding 2. Each SHA256 matched exactly on receipt and re-hashed after copy.

| Repo path (`docs/halo/evidence/m1r/gate3-captures/`) | SHA256 | Visible DevTools UTC | Role | Observed (writer-verified against pixels) |
|---|---|---|---|---|
| `SN21044-roi-live-summary-exclude-ts20260830T200233Z.jpeg` | `7b077fa886b59f92eff375527130cb51e3fd612a1581399ca46fcc428cf89c08` | `2026-08-30T20:02:33.404Z` | ROI, summary (both radio groups labeled) | Dealer **Serra Nissan of Sylacauga (21044)**; **"Include or Exclude Lead Sources? Include=○ Exclude=●"** (Exclude); **"Include or Exclude Users? Include=● Exclude=○"** (separate control); "6 selected"; Date Range **Previous Week (Mon–Sun)**; Lead Type **8 selected** |
| `SN21044-roi-live-expanded-exclude-six-ts20260830T200233Z.jpeg` | `69a1d88e058fbc044711e86974f007b162307571545d2adf5ead07b9c4da40e6` | `2026-08-30T20:02:33.404Z` | ROI, expanded exclusions (Lead-Sources Exclude labeled) | Dealer **21044**; **Lead Sources Exclude** labeled at top; expanded list shows exactly six checked — **Oil Change Service - Sealer.Com Website; Service; Service Appraisal; Service Dept; Service Referral; SERVICE TO SALES APPT CONFIRMATION**; the lower **Users Include** control is separately visible |

**Occlusion explanation (no attack on reviewer impartiality).** In the earlier `83756dfd`, the open
source dropdown covered the *Lead Sources* Include/Exclude label, leaving only the *Users* Include radio
readable — a genuinely ambiguous frame on which FAIL finding 2 was the correct call. This §4B pair keeps
both radio groups visible at once: **Lead Sources = Exclude; Users = Include**, with the six service
sources checked. The ROI Exclude assertion now rests on §4B, not on the ambiguous `83756dfd`.

**Still strictly limited; no PASS.** §4B evidences only the **two SN21044 Version definitions** and does
not accept the claim: the controlling disposition remains the §3B FAIL pending a genuinely fresh auditor.
It does not touch any Custom family, other store, cell, or delivery.

## 5. Evidence-completeness notes and carried-forward known items

- **Save-time provenance.** The 10:40 / 10:43 save (modified) times (§2) are shown directly in the
  scheduled-list capture (`be0946e2…`) at minute precision, rather than controller-attested. This is
  primary evidence of the save times for the two Version definitions; it is **not** a claim of a
  complete or accepted chronology. No "fully primary-evidenced end to end" claim is made. Evidence
  integrity of this repair is verified by the §3C fresh Shadow (limited); Gate 3 acceptance is a
  separate, still-open question and global Gate 3 remains HOLD/PENDING.
- **Header/cache display discrepancy (carried from HOLD §11).** The Dashboard summary capture
  (`d011c4bc…`) header displays the period `08/24/2026 – 08/30/2026` while the saved Date Range
  parameter reads **Previous Week (Mon–Sun)**. This is the known Version header/cache display artifact
  recorded in HOLD §11 (deferred to Gate 4 delivery-level verification), **not** a new defect and not a
  regression of the source-exclusion correction.
- **Independent-verification leg still open.** Proof Delta B for Gate 3 (independent outcome
  verification) is **not** satisfied by this record: Shadow recused and the clean-room verdict was
  INDETERMINATE on the earlier record. A fresh independent review of this new evidence is the pending
  next step.

## 6. Stale Git-state claims corrected by annotation

The committed HOLD (`a2b4f5c1f`) states, in its §17 and §19, that the branch adds "one additive,
**uncommitted, unpushed** evidence file" and "**Not committed, not pushed**. Stops here for Shadow
re-review." Those statements were true at the moment the HOLD body was written but are now **stale**:

- Both the HOLD (`a2b4f5c1f`) and the PASS (`f8d1bffa1`) are **committed and pushed** to
  `github/codex/m1r-gate3-schedule-audit`.
- Local `HEAD` equals `github/codex/m1r-gate3-schedule-audit` (`f8d1bffa1`); nothing is unpushed.

This correction is by annotation only. The committed HOLD bytes are not edited (preserving history per
the honest-recovery principle).

## 7. Readiness unchanged — all 18 cells remain false

Definition-level persistence of a source-exclusion correction is not a fresh accepted delivered
workbook. Per `docs/halo/contract/coverage-matrix-18cell.json` (ratified `7246715fe`), every cell keeps
`readiness: false` (counts unchanged: accepted 3 / present-invalid 8 / absent 7). This record changes no
cell. The two definitions corrected map to the `serra-nissan / lead_source_roi` and `serra-nissan /
dealership_performance` cells only; both remain `false` pending Gate 4 delivery validation.

## 8. Non-mutating repository validations run (read-only) — see companion report

- Gate-2 coverage-contract validator (file mode) and `--self-test` were run; results reported alongside
  this record (validator output + `git diff --check`). The committed contract/matrix/overlay/18-cell map
  are byte-intact and unchanged on this branch.

## 8A. Global Gate 3 scope limit — this evidence cannot close Custom families or complete Gate 3

The evidence in §4, §4A, and §4B is confined to the **two SN21044 Version definitions** (Lead Source ROI
and Dealer Dashboard), which expose an explicit source-exclusion control. It says nothing about the
**Custom** families:

- Per HOLD §9, the six Custom weekly jobs (Appointments, CRM Sales Gross) **expose no source-exclusion
  control**; their Sales-only assurance rests on output/delivery evidence plus the sliding-date filter,
  which are **not** established here and remain open (HOLD §9, §12).
- Gate 3's control-directive scope is all six families across three stores. Two corrected Version
  definitions on one store cannot satisfy that scope.

**Therefore, even if a fresh auditor accepts the limited two-Version-definition persistence proof,
GLOBAL Gate 3 remains HOLD/PENDING.** This record does not, and cannot, declare Gate 3 complete or close
any Custom family. Global Gate 3 closure additionally requires: independent verification of the Custom
families' controls/output proof, resolution of the open items in HOLD §9–§12, and the Gate 4 delivery
obligations — none of which this evidence addresses.

## 9. Changed paths (this record; committed + pushed as Git backup)

- **Added:** this file `docs/halo/evidence/m1r/GATE3_RECONCILIATION_2026-08-30.md`.
- **Added:** twelve captures under `docs/halo/evidence/m1r/gate3-captures/` — five persistence captures
  (SHA256 in §4: four reopen + the scheduled-list save-time capture `be0946e2…`), five auditor-response
  timestamped captures (SHA256 in §4A), and two live read-only ROI captures resolving the label
  occlusion (SHA256 in §4B: `7b077fa8…`, `69a1d88e…`).
- **Amended (bounded, process-debt only):** `issues.md` — the Gate 3 process-debt entry, updated to
  record the final clean-room FAIL as controlling, this evidence repair, and the §3C Shadow verdict.
- **Committed and pushed** to `github/codex/m1r-gate3-schedule-audit` as the Git backup of this exact
  evidence-only scope (documentation + evidence only; authorized this turn). **No** PR, merge, or deploy.
- **Unchanged:** committed HOLD `a2b4f5c1f` and PASS `f8d1bffa1` bytes; all code, contract, matrix,
  validators, 18-cell readiness, production, schedule, Vin, and external systems.

## 10. Disposition — evidence-integrity PASS (limited); global Gate 3 HOLD/PENDING

1. **Evidence-integrity resolved (narrow).** The prior clean-room **FAIL** (§3B) was controlling at the
   time it was rendered and is preserved as historical; this repair addressed its findings, and the fresh
   conflict-screened Shadow (§3C) — the genuinely fresh auditor this record called for — returned a
   limited **evidence-integrity PASS** that **supersedes the FAIL on that narrow question only**. The
   evidence-integrity issue is therefore **not** open. This grants **no approval**, promotes **nothing**,
   and is **not** a Gate 3 PASS. The writer does not self-declare any Gate 3 outcome (no self-approval).
2. **Gate 3 acceptance is a separate, still-open question** that the §3C evidence-integrity PASS does
   **not** decide. Any future Gate 3 acceptance is bounded to the **two SN21044 Version definitions**: at
   most, a subsequent record (not this one) could state that the source-exclusion correction on those two
   definitions is persisted. **That would NOT satisfy global Gate 3, would NOT close any Custom family,
   and would NOT declare Gate 3 complete** — the Custom-family controls/output proof are unresolved (§8A;
   HOLD §9–§12), so **global Gate 3 remains HOLD/PENDING**. Delivery (Gate 4) remains a separate
   obligation.
3. **Gate 4 (delivery readiness)** — fresh delivered Guinan workbooks must confirm the calculated
   Mon–Sun resolution (HOLD §10) and pass dealer, period, provenance, schema, Filters, and row-level
   Sales-only validation before any of the 18 readiness cells flips from `false`.

- **Owner:** Codex (outcome controller). Bounded read-only recording + repo validation: Claude Code.
  Approval authority for any external/production mutation or changed business requirement: **Duane
  only**. Evidence-integrity of this repair: verified by the §3C fresh conflict-screened Shadow (limited
  scope). Global Gate 3 acceptance additionally requires resolving the Custom families (§8A; HOLD §9–§12)
  and the Gate 4 delivery obligations — none of which the §3C PASS addresses.
- **Exact next action:** this exact evidence-only scope is committed and pushed to
  `codex/m1r-gate3-schedule-audit` as the Git backup. Global Gate 3 stays HOLD/PENDING; subsequent work
  on the Custom families and Gate 4 proceeds under their own bounded gates. Do **not** open a PR, merge,
  deploy, advance readiness cells, run, deliver, or mutate any schedule/filter/Vin/external system.
