# M1R Gate 3 (Custom families) + Gate 4 — Current-State Checkpoint (2026-08-30)

**STATUS: Documentation-only checkpoint. Global Gate 3 and Gate 4 remain HOLD/PENDING. All 18 M1R
delivery-readiness cells remain `false`. No protected contract/matrix/18-cell doc, code, test, DB,
schedule, Gmail, VinSolutions, production, or LifePath was altered. No browser action was required or
taken. Schedule existence and green-check Run-Now retries are NOT delivery acceptance; missing ≠ zero;
Service/Parts stay fail-closed.**

Date: 2026-08-30 (America/New_York)
Controller / outcome owner: Codex (reports to Duane)
Bounded writer (sole Andromeda repo writer): Claude Code in isolated clone
`/home/ubuntu/hs-m1r-isolated-20260830`, branch `codex/m1r-gate3-schedule-audit`
Governed evidence root (read-only): `/srv/ingest-dev/analytics` (isolated dev, `BRAIN_PROFILES_ROOT`),
hold root `/srv/ingest-dev/hold`, staging `/tmp/halo-m2b-fresh`.

## 0. Pre-commit contradiction caught and corrected
A pre-commit controller sweep caught a transcription error in the writer's working summary: the three
Daily Sales Communication **Last Run** times had been stated as **PM**. The Schedule Manager evidence and
the controller AX extraction show **AM**. Corrected here to **AM** everywhere (Honda 11:07 AM, Nissan
11:05 AM, Ford 11:04 AM Eastern). The writer could **not** independently resolve the AM/PM suffix at the
provided screenshot resolution; the AM value is recorded as **controller-AX-proved**, not
writer-pixel-verified. No PM value is preserved anywhere.

## 1. Provenance discipline
- **OBSERVED EVIDENCE** — controller-supplied immutable captures (hash-gated below) + governed
  read-only store/ledger reads by this writer.
- **CONTROLLER AX / RECONCILIATION** — controller-run read-only Computer Use accessibility-tree and
  Guinan exact-subject mail reconciliation (authoritative where the writer cannot resolve pixels).
- **INFERENCE** — reasoned derivation, carried as risk, never as acceptance.
- **MISSING PROOF** — explicitly recorded; missing is not zero and never a pass.

## 2. New immutable captures (hash-gated; cited by path, not copied into repo)
| Capture (in `~/filestore/serra-reports/gate4-inbox/`) | SHA256 | Shows |
|---|---|---|
| `m1r-daily-retries-green-checks-2026-08-30-163040.jpeg` | `e70ef7337438f0d5e04049e5b24b5ff44aec1b07b6cd6896c33ac2676dcaa065` | Schedule Manager: three Daily Sales Communication rows green-checked Run-Now retries; Last Run **AM** (§4); next Monday 06:15/06:20/06:25 |
| `m1r-schedule-custom-and-duplicate-ford-dashboard-2026-08-30-163140.jpeg` | `46912fea4dc086073e0fea17a87d591b47c15a854dc10e4108408349d67f0531` | Six Custom weekly jobs + Monday cadences; TWO identical Tony Serra Ford Dealer Dashboard rows both 07:10 EDT (§6) |

Both digests matched exactly on receipt. Writer verified all other pixel content against the controller
attestation with no contradiction except the AM/PM suffix noted in §0.

## 3. Governed ledger state — exactly 3 accepted (OBSERVED EVIDENCE, read-only `ingest_delivery`)
`/srv/ingest-dev/analytics/<profile>/brain/brain.db`, whole-store accepted set = **3**, all period
**2026-08-17..23**, capture (created_at) **2026-08-26 08:58 UTC**:

| Profile | report_kind | rows | checksum | Sales-only status |
|---|---|---|---|---|
| serra-honda | appointments | 18 | `b189a920…` | **Sales-only verified**: Appt Reason=`Sales Appointment` 18/18; Appointment Type=`Meeting` (no Service/Parts); Dealer ID=`21043` 18/18 |
| serra-honda | dealership_performance | 40 | `39560ef1…` | Version family (not a Custom cell) |
| serra-nissan | dealership_performance | 40 | `6123ef87…` | Version family (not a Custom cell) |

- **No `crm_sales_gross` for any store.** **No `appointments` for Nissan or Ford.** `comms_log` table
  rows = **0 / 0 / 0** (no accepted daily comm).
- Hold/quarantine (`/srv/ingest-dev/hold/<profile>/quarantine/<sha>/`) carries only present-invalid
  items (ROI×3, CAGE Nissan/Ford self-rejected for Service/Parts Lead-Intent; comm-log×3
  `non-sales-lead-type`/`unexpected-period`; CSVs `unsupported-report`). Provenance envelope present
  (`sender=reportscheduler@motosnap.com`, subject, `gmail_message_id`, received_at, captured_at, sha256).
- Fresh staging `/tmp/halo-m2b-fresh/<profile>/` = daily comm XLSX for **08-25..28 only** (loose, not
  ingested, contaminated → withheld).

## 4. Daily Sales Communication — Sunday delivery FAILURE (OBSERVED + CONTROLLER RECONCILIATION)
- **OBSERVED (capture `e70ef733…`):** Honda/Nissan/Ford Daily Sales Communication Log Run-Now retries
  show **green checks**; Last Run **Honda 08/30/2026 11:07 AM**, **Nissan 11:05 AM**, **Ford 11:04 AM**
  (Eastern); next run Monday **06:15 / 06:20 / 06:25** EDT (recurring Daily).
- **CONTROLLER RECONCILIATION:** Guinan exact-subject read-only mail reconciliation at **16:27:47 EDT**
  found **zero originals for all three** stores.
- **INFERENCE (carried as the finding):** green-check retry status is a **scheduler-side** signal only;
  with zero delivered originals this is a **scheduler-to-mail delivery FAILURE**. A green retry is **not**
  delivery acceptance. **Missing ≠ zero.**
- **MISSING PROOF:** no delivered Sunday (coverage 08-29) daily original for any store.
- The **failed 08-29 Sunday retries remain separate and CANNOT backfill Monday cells.**

## 5. Six-Custom evidence table (Gate 3 — Sales-only must be proved through output/delivery)
Custom exposes no source-exclusion control. Minimal Gate-3 proof per cell = a governed delivered native
XLSX with **every row Sales-only** (Appointments: `Appt Reason == "Sales Appointment"` all rows + type
scan + `Dealer ID == target`; CRM Sales Gross: per-deal rows, every `Dealer ID == target`, no
Service/Parts commingling) + saved Sliding-Date period binding + gmail provenance envelope.

| Custom cell | Current proof (OBSERVED) | Missing proof | Owner | Next action | Browser? |
|---|---|---|---|---|---|
| Honda 21043 Appointments | Delivered + **Sales-only proven** (`b189a920…`, 18/18, 08-17..23) | current-week (08-24..30) refresh; wired reader; positive golden | Codex | ingest Monday workbook read-only; Guinan 18-cell validator (§7) | No |
| Nissan 21044 Appointments | **None** (absent everywhere) | entire Sales-only workbook | Codex | ingest Monday 07:35 delivery read-only; verify Sales-only | No |
| Ford 21047 Appointments | **None** (absent) | entire Sales-only workbook | Codex | ingest Monday 07:40 delivery read-only | No |
| Honda 21043 CRM Sales Gross | **None** (absent) | per-deal Sales-gross workbook | Codex | ingest Monday 07:15 delivery read-only; verify dealer 21043, no Service/Parts | No |
| Nissan 21044 CRM Sales Gross | **None** | Same | Codex | ingest Monday 07:20 delivery read-only | No |
| Ford 21047 CRM Sales Gross | **None** | Same | Codex | ingest Monday 07:25 delivery read-only | No |

**Only 1 of 6 Custom cells (Honda Appointments) currently has the required Sales-only delivery proof.**
No browser action is required to close the others — sources arrive by scheduled email and are ingested
read-only; Appointments/CRM Sales Gross carry no Lead-Type filter, so they are **not** subject to the
ROI/CAGE Service/Parts self-rejection.

## 6. Duplicate Tony Serra Ford Dealer Dashboard schedule (OBSERVED — material config issue)
- **OBSERVED (capture `46912fea…`):** **two apparently identical** `Huminic | TSF21047 | Dealer
  Dashboard | Weekly` (Version) rows, **both due Monday 07:10 EDT**, same recipient
  `guinan.skidek@huminic.ai` and same subject.
- **Treatment:** material configuration issue. **Duane approval required before any correction** (an
  external schedule mutation). Do not delete/merge either row. Both possible Ford Dashboard originals
  are to be independently preserved and validated (§7).
- **INFERENCE:** a duplicate schedule may produce two originals for the same cell/period; acceptance must
  disambiguate a single governed original, not silently pick one.

## 7. Guinan one-time Vin Monday 18-cell receipt validator (CONTROLLER — updated in place, ACTIVE)
- **Updated existing automation in place, no duplicate.** Readback verifies: **name** `Vin Monday
  18-cell receipt validation`, **ACTIVE**, **one-time Monday 08:00 EDT**.
- **Scope now full 18-cell set:** the **15 weekly cells** (period **2026-08-24..30**) plus the **3
  original recurring Daily Sales Communication cells** for coverage date **08-30** at **Honda 06:15 /
  Nissan 06:20 / Ford 06:25** EDT.
- **Daily checks require:** exact message and attachment identity; dealer + Dealer ID + date; tabs +
  schema; rows + columns; channel + direction; **zero Service or Parts or service-source or
  wrong-dealer**. **Any missing → HOLD.**
- Independently preserves/validates **both** possible Ford Dashboard originals (§6).
- **Failed 08-29 Sunday retries remain separate and cannot backfill Monday cells.**

## 8. Monday due batch (period 2026-08-24..30) — INVENTORY (not acceptance)
- **15 weekly workbooks** = 5 weekly families × 3 stores, cadences (OBSERVED capture `46912fea…`):
  Appointments 07:30/07:35/07:40; CRM Sales Gross 07:15/07:20/07:25; plus Lead Source ROI, CAGE KPI,
  Dealer Dashboard (~06:30–07:10). **INFERENCE:** ROI/CAGE will **still self-reject** on Service/Parts
  Lead-Intent contamination unless corrected under a **separate Duane-approved** schedule gate (distinct
  from the Gate-3 Nissan source-exclusion fix); Appointments/CRM Sales Gross are expected clean.
- **3 recurring Daily Sales Communication** for coverage 08-30 (Mon 06:15/06:20/06:25) — subject to the
  daily-failure risk in §4.
- **Response Times** weekly manual read-only checkpoint (the only genuinely browser-required item) — not
  in scope now.

## 9. Reader / golden gaps (OBSERVED — repo + contract)
- Wired Halo readers = **only** `readAppointments` + `readDealershipPerformance`
  (`ingest-native-metrics.ts`). **Missing** Halo-path readers: `lead_source_roi`, `cage_kpi`,
  `sales_comm_log`, per-deal `crm_sales_gross` reconciliation (present only in isolated `vin-metrics.ts`,
  unwired).
- **No positive real-file golden pinned** for any cell (contract §5 pending). Current invalid files may
  serve as negative goldens only.

## 10. Disposition
- **Global Gate 3 remains HOLD/PENDING** (5 of 6 Custom cells lack Sales-only delivery proof; Custom
  families cannot be closed on schedule existence).
- **Gate 4 remains HOLD/PENDING**; **all 18 readiness cells stay `false`** (unchanged; contract/matrix
  untouched).
- **Owner:** Codex (outcome controller); bounded read-only recording + repo validation: Claude Code;
  external/schedule mutation authority (incl. the duplicate Ford Dashboard correction): **Duane only**.
- **Next action:** await the Monday 08:00 EDT Guinan 18-cell receipt validation; ingest any delivered
  originals read-only; verify row-level Sales-only for the six Custom cells; keep Service/Parts
  fail-closed; do not treat retries or schedule existence as delivery.

## 11. Changed paths (this checkpoint)
- **Added:** this file `docs/halo/evidence/m1r/GATE3_CUSTOM_GATE4_CURRENT_2026-08-30.md`.
- **Amended (minimal):** `issues.md` — one appended entry.
- **Unchanged:** all protected contract/matrix/18-cell docs, HOLD/PASS/reconciliation bytes, code, tests,
  DB, schedules, Gmail, VinSolutions, production, LifePath.
