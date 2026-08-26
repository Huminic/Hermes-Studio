# Codex ⇄ Ingest Data-Prep Contract (HUM-VIN-006)

**Status:** WORKING CONTRACT — native six-family path AGREED (operator decisions 2026-08-25); implemented + tested in the consumer. Browser-acquired families are a separate extension (see `SCHEMA_CONTRACT_BROWSER_EXTENSION.md`).
**Producer:** Codex (acquires VinSolutions reports and hands bytes to Central MCP).
**Consumer:** the ingest edge in `hs-ingest-dev` (`landDelivery` → `evaluateDelivery` → hold-only landing → `promoteHeldToAnalytics` → `runVinWatchdog`).
**Derived from (source of truth, not memory):**
`src/server/ingest/vin-contracts.ts`, `src/server/ingest/hold-store.ts`, `src/server/ingest/csv-contracts.ts`, `src/server/watchdog/vin-metrics.ts` @ branch `dev/ingest-endpoint`.

This document tells Codex **exactly what a delivery must look like to be ACCEPTED (landed `held`)** rather than quarantined. The consumer is **fail-closed**: anything not provably correct is quarantined whole (never partially cleaned, never silently dropped). Codex's job is to assemble each report so it passes every gate below without the consumer having to guess.

---

## 0. Parties, boundaries, and what "correct" means

- The consumer **never mutates** what Codex sends. It preserves the original bytes immutably, writes a provenance manifest, and either marks the delivery `held` (accepted, promotable to analytics) or `quarantined` (preserved, not usable).
- **"Codex assembles" — scope (operator clarification 2026-08-25).** For the six native XLSX families in §3, Codex does **not** assemble or transform contents: it validates and delivers the **original VinSolutions bytes unchanged** (do not rename columns, re-sheet, or reformat — see ROI in §6). Codex assembles a *canonical derivative* **only** for a browser-acquired family that lacks an accepted native consumer schema (see the browser extension); even then the original capture is preserved unchanged **beside** the derivative.
- **Missing is not zero.** If a required field is absent, the consumer withholds the metric — it never fabricates a `0`. Codex must therefore deliver *complete* rows, not partially-filled ones.
- **Sales-only (first-class).** Every delivery must be provably Sales-domain. Any Service/Parts signal quarantines the whole delivery — this includes a **positive** Service/Parts selection in a Filters `Lead Type` or `Lead Intent` (a contaminated schedule definition; clean rows do **not** cure it), as well as any Service/Parts-coded data row. An **exclusion** filter (`Lead Sources Excluded: Service…`) is proof of exclusion, not contamination, and is fine.
  - **Platform model (operator + Codex, 2026-08-25):** Service/Parts lives in a **separate workspace**, and — unlike Sales — service is **combined across the three Serra stores into ONE** Serra Service workspace (confirmed). Sales profiles are **Sales-only by design**; service is never mixed in. So a Sales report carrying Service/Parts is a **scheduled-report misconfiguration**, and this quarantine is a safety net for that.
  - **Service pipeline is out of scope for this contract.** This contract establishes only that (1) Service/Parts **never enters the three Sales profiles**, and (2) any future Service collection routes through a **separately governed combined Serra Service pipeline**. Its profile slug, package format, ingestion/InfoStore route, and owner are **NOT** established here — they belong to that separate Service-domain contract. Do not route service through `/api/ingest/report`.
- **One tenant per file.** A delivery is for exactly one rooftop. Rows spanning dealers, or a Filters tab selecting more than one dealer, quarantine.
- **Fail-closed.** When in doubt, the consumer rejects. Codex removes doubt by matching these signatures byte-for-byte (header strings are compared **trimmed but case- and spacing-sensitive**).

Supported tenants (profile → governed VinSolutions Dealer ID):

| profile          | Dealer ID | dealer name (matches by token) |
|------------------|-----------|--------------------------------|
| `serra-honda`    | `21043`   | Serra Honda …                  |
| `serra-nissan`   | `21044`   | Serra Nissan …                 |
| `tony-serra-ford`| `21047`   | Tony Serra Ford …              |

(The platform is built universal; only these three are eligible **today** — see `HOLD_ELIGIBLE`. Adding a store = adding a registry row, no new schema.)

---

## 1. Delivery envelope (metadata Codex/Central MCP send alongside the bytes)

Every delivery carries `HoldMetadata`:

| field                 | required                          | notes |
|-----------------------|-----------------------------------|-------|
| `profile`             | always                            | one of the three eligible slugs above |
| `filename`            | always                            | extension drives format detection and **must match the magic bytes** (see §2) |
| `received_at`         | optional                          | ISO timestamp, provenance only |
| `period_hint`         | see per-family                    | `YYYY-MM-DD` (single day) or `YYYY-MM-DD/YYYY-MM-DD` (range) |
| `source_type`         | always (defaults `gmail_scheduler`)| provenance union — see below |
| `declared_report_kind`| browser_export only               | **untrusted attribution** — never overrides the classifier; for audit only |

**Provenance union (fail-closed):**

- `source_type: "gmail_scheduler"` (default) → **requires** `sender`, `subject`, `gmail_message_id` (all non-empty).
- `source_type: "browser_export"` → **requires** `capture_id`, `source_url`, `declared_report_kind`; and `source_url`'s host must be **exactly** `vinsolutions.app.coxautoinc.com`. Any other host → `invalid-provenance` quarantine.
- Any other `source_type`, or missing required fields → quarantine (bytes still preserved).

---

## 2. Transport / format gate

Extension (from `filename`) must match content magic bytes:

| ext   | media type                                                                 | first bytes must be | else |
|-------|----------------------------------------------------------------------------|---------------------|------|
| `xlsx`| `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`         | `50 4B` (`PK`, zip/OOXML) | `mime-extension-mismatch` |
| `csv` | `text/csv`                                                                 | text, **no NUL byte**, not zip/pdf | `mime-extension-mismatch` |
| `pdf` | `application/pdf`                                                          | `25 50 44 46` (`%PDF`) | `mime-extension-mismatch` |
| other | —                                                                         | —                   | `unsupported-format` |

**PDF is evidence-only:** an unparsed PDF cannot prove dealer/period/Sales-only, so it is **always quarantined** (`sales-only-unproved`), never held, never OCR'd. Do not send report data as PDF and expect it downstream.

---

## 3. The six native XLSX families (the ACCEPTED path)

XLSX is the only format that lands `held` today. Each family is one **data sheet** plus, where noted, a **Filters** sheet. Only truly-blank extra sheets are tolerated; any extra **non-blank** sheet → `extra-nonblank-sheet` quarantine.

### Filters sheet format (when a family uses one)

Real VinSolutions 3-column layout — Codex must preserve it:

```
Filter Name            | Number Selected | Selected Values
Base Report Name       |                 | Lead Source ROI
Dealers                | 1               | Serra Honda of ...
Lead Type              | 8               | Import; Internet; Phone; ...
Date Range Begin       |                 | Aug 17 2026 12:00AM
Date Range End         |                 | Aug 23 2026 11:59PM
```

- The consumer reads the **Selected Values** column (not the count).
- Multi-values may be separated by `;` or `,`.
- Dates accept ISO `YYYY-MM-DD` **or** `MMM DD YYYY[ h:mmAM]` (e.g. `Aug 17 2026 12:00AM`).
- Period prefers explicit `Date Range Begin` / `Date Range End`; a single `Date Range` cell holding two ISO dates is a legacy fallback.

For each family below: **Signature** = header cells that must ALL be present (exact strings). **Filters** = required Filters constraints. **Row rules** = per-row gates. **Metric columns** = columns the Watchdog consumes downstream — not required to *classify*, but if absent the corresponding metric **withholds** (still lands `held`). Include them for full value.

---

### 3.1 `lead_source_roi` — "Lead Source ROI"

- **Sheet:** a `Report…`/non-Filters data sheet + a Filters sheet.
- **Signature (spaced):** `Lead Source`, `Total Leads`, `Good Leads`, `Sold from Leads`
- **No `Dealer` column** — tenant identity comes **only** from Filters.
- **Filters:**
  - `Base Report Name` = `Lead Source ROI` (exact, case-insensitive)
  - exactly **one** `Dealers` value, matching the target rooftop
  - `Lead Type` = **exactly the governed eight**, canonicalized: `import, internet, phone, previouscustomer, referral, walk-in, websitechat, wholesale` (no more, no fewer)
  - `Lead Intent` (if present) must **not** positively select Service/Parts (§0 Sales-only). Service only in `Lead Sources Excluded` is fine.
  - `Date Range Begin` / `Date Range End`
- **Row rules:** `Lead Source` scanned for `service`/`parts` → quarantine if matched.
- **Period:** from Filters date range. If `period_hint` is sent it must equal the workbook period.
- **Metric columns (native spaced — ROI Option A, resolved 2026-08-25):** the Watchdog now reads the **native spaced** columns `Total Leads`, `Good Leads`, `Bad Leads`, `Sold from Leads`, `Duplicate Leads` (space/underscore-insensitive match). **Deliver the original spaced headers unchanged — do not rename** (see §6).

### 3.2 `cage_kpi` — "Enterprise Performance" (CAGE)

- **Sheet:** data sheet + Filters sheet.
- **Signature:** `Dealer`, `Lead Type`, `User`, `Total Leads`, `Total Comms`
- **Filters:**
  - `Base Report Name` = `Enterprise Performance`
  - `Lead Type` = **exactly** `{Internet, Phone, Walk-in}`
  - `Lead Intent` (if present) must **not** positively select Service/Parts (§0 Sales-only)
  - at most one `Dealers` value
- **Row rules:**
  - every non-total row's `Dealer` must match the target rooftop
  - `Lead Type` scanned for Service/Parts → quarantine
  - **Grand-total row exemption (narrow):** the *single final* row may be `Dealer = "TOTAL"` **only if** its `Lead Type` **and** `User` are both blank. Any other `TOTAL` (not last, or with a non-blank Lead Type/User) is treated as a dealer value → `wrong-dealer`.
- **Metric columns:** `User` (rep count), `Total Comms`, `Deals from Leads`.

### 3.3 `sales_comm_log` — Sales Communication Log (DAILY)

- **Sheet:** single data sheet (Filters optional).
- **Signature:** `Dealer`, `User`, `Activity Date`, `Comm Channel`, `Lead Type`, `Lead Status Type`, `Lead Source`, `Message Content`
- **Row rules:** `Lead Type`, `Lead Status Type`, `Lead Source` scanned for Service/Parts → quarantine.
- **Daily-period proof (strict):** this report is **one calendar day**. Every row's `Activity Date` must parse (`ISO` or `M/D/YYYY`) and be the **same single day**, and that day must equal the supplied day.
  - **`period_hint` must be a single day** (`YYYY-MM-DD`), or a single-day Filters range. A range, a multi-day spread, any unparseable date, or no supplied day → quarantine.
- **Metric columns:** `Message Content` (hashed, never stored), **`Direction`** (`in/out`), **`Customer`**. `Direction` and `Customer` are **not** in the classification signature but several comm metrics withhold without them — include both.

### 3.4 `crm_sales_gross` — CRM Sales Gross

- **Sheet:** Sheet1 only, **no Filters**.
- **Signature:** `Dealer`, `Dealer ID`, `Sold Date`, `Sale ID`, `Deal Number`, `Front Gross`, `Back Gross`, `Total Gross`
- **Row rules:** every `Dealer` must match target; rows spanning dealers → quarantine.
- **Coverage vs observed period (operator correction 2026-08-25):** a weekly Gross export's **coverage window** (e.g. Mon–Sun) is not the same as its **observed** sale dates (a week may have sales only Tue–Fri). So:
  - `period_hint` (`YYYY-MM-DD/YYYY-MM-DD`) is **required** — it is the trusted coverage window; **coverage is not derived from the observed rows**.
  - acceptance requires **every** `Sold Date` to fall **inside** the coverage window — it does **not** require the observed min/max to equal the window endpoints.
  - the stored period is the **coverage** window; the observed date range is recorded in evidence (`observed_date_range`).
- **Metric columns:** `Front Gross`, `Back Gross`, `Total Gross` (reconciliation checks Front+Back≈Total).

### 3.5 `appointments` — Appointments (Sheet1, no Filters) — **strictest hold proof**

- **Sheet:** Sheet1 only, no Filters.
- **Signature:** `Appointment ID`, `Dealer`, `Dealer ID`, `Appt Reason`, `Appointment Start Date`, `Appointment Status`
- **Row rules (evaluateDelivery):** `Appt Reason` must equal `"Sales Appointment"` on **every** row (anything else → `non-sales-appointment-reason`); `Appointment Type` scanned for Service/Parts.
- **Hold proof (verifyAppointments) — all fail-closed:**
  - `period_hint` **required**, as a range `YYYY-MM-DD/YYYY-MM-DD`
  - every `Dealer ID` populated and equal to the governed profile ID (21043/21044/21047) — blank or wrong quarantines
  - every `Appointment ID` present and **unique** within the file
  - every `Appointment Start Date` **and** `Appointment Start DateTime` parse and fall within `period_hint`
- **Metric columns:** `Is Confirmed`, `Is Show`, `Is No Show`, `Appointment Status`, `Rescheduled Date` (drive show/no-show/confirm/cancel/reschedule rates). Include `Appointment Start DateTime` (required by the hold proof above).

### 3.6 `dealership_performance` — "Dealership Performance Dashboard" (multi-section)

- **Recognition:** a non-Filters sheet whose cells contain the title `Dealership Performance Dashboard` **or** both section markers `Dealership Summary` and `Lead Type & Inventory Type Summary`.
- **Filters required:** exactly one `Dealers` value matching target; `Lead Type` exactly `{Internet, Phone, Walk-in}`; no Service/Parts.
- **Shape:** not a flat table — every non-blank row is preserved generically. No per-row header contract; validation is at the Filters level.

---

## 4. CSV path — preserved but **NOT** accepted (AGREED: deliver as XLSX)

**Operator decision 2026-08-25:** deliver ROI and CAGE/KPI as **XLSX**. Do **not** build a CSV embedded-proof extension for families already available as governed XLSX — the XLSX Filters sheet supplies the dealer, period, Lead Type, and Sales-only evidence that CSV lacks.

Codex must **not** deliver `lead_source_roi` or `kpi_salesperson` as `.csv` and expect them downstream. The two deterministic CSV layouts are recognized, dealer/tenant-checked, and Service/Parts-screened — but they carry **no embedded row-level Sales-only proof** (KPI has no Lead Type/Intent/Source column; ROI's `Lead_Source` alone can't prove Lead Type exclusions). So a clean CSV is **preserved and quarantined** as `sales-only-unproved`, never held, never promoted.

- CSV detection (for provenance only): `Salesperson` + `Total_Comms` → `kpi_salesperson`; `Lead_Source` + `Total_Leads` → `lead_source_roi`.
- **Action for Codex:** deliver these families as the governed **XLSX** forms in §3. Do not rely on caller attestation — it is not trusted. (Genuinely CSV-native browser families, e.g. Response Times, are handled by the browser extension, not here.)

---

## 5. Per-kind self-test checklist (Codex should assert before sending)

For every delivery:
- [ ] `profile` is one of the three eligible slugs
- [ ] `filename` extension matches magic bytes (§2)
- [ ] provenance complete for the declared `source_type` (§1)
- [ ] exactly the contracted sheet(s); no extra non-blank sheet
- [ ] one tenant only; dealer/Dealer ID matches the target
- [ ] no `service`/`parts` in any Filters value or scanned data column
- [ ] period provable per the family (Filters range, row dates, or `period_hint`)

Family-specific must-haves:
- [ ] **ROI:** Filters `Base Report Name = Lead Source ROI`, Lead Types = governed eight, one dealer; spaced signature present
- [ ] **CAGE:** Filters `Base Report Name = Enterprise Performance`, Lead Types = {Internet,Phone,Walk-in}; TOTAL row (if any) is last with blank Lead Type+User
- [ ] **Comm log:** single-day, all `Activity Date` = that day; `Direction` + `Customer` included
- [ ] **Gross:** `Dealer ID` present; Front/Back/Total gross columns present; **coverage `period_hint` (range) supplied** and every `Sold Date` falls inside it
- [ ] **Appointments:** every `Appt Reason = "Sales Appointment"`; every `Dealer ID` = governed ID; unique `Appointment ID`; Start Date + Start DateTime within `period_hint` range
- [ ] **Dashboard:** title/markers present; Filters one dealer + {Internet,Phone,Walk-in}

---

## 6. RESOLVED — ROI column naming = Option A (native spaced), 2026-08-25

**Decision (operator):** Codex sends the **original VinSolutions ROI XLSX with native spaced headers** (`Total Leads`, `Good Leads`, `Sold from Leads`, …). **Codex must not rename native columns.** The consumer side aligns to them.

**Implemented:** `vin-metrics.ts` column lookup is now space/underscore-insensitive, so the native spaced headers compute (`roi.total_leads`, `roi.sold_from_leads`, `roi.duplicate_rate`); proven by test *"spaced ROI headers compute the same as underscored"*. No producer transform, no drift.

Any assembled/scraped family **not** in §3 (e.g. Response Times, Unanswered Replies, User Activity, Deal Performance) is **out of this contract**; it is specified in **`SCHEMA_CONTRACT_BROWSER_EXTENSION.md`** with its own columns/types/period rule/rooftop-provenance/PII rules, and is not added here until agreed by both parties.

---

## 7. Change control

- This file is the single agreed interface. Neither side changes a signature, Filters rule, or period rule without updating this file and both parties acknowledging.
- The consumer's behavior is defined by the four modules named at the top; if they and this file ever disagree, the code is authoritative and this file is a defect to fix.
