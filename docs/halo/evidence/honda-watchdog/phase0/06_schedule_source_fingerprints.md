# Phase 0 — Honda schedule/source fingerprints + Response Times (read-only reconstruction)

**Reconstructed at (UTC):** 2026-09-02 (from committed repo evidence + read-only artifact
inspection — **no Gmail/Vin access**). Amended by the Phase 0 shadow-correction (items 3 + 4).
**Delivery-evidence anchor:** `docs/halo/evidence/m1r/scheduled/native-scheduled-evidence.json`
**Anchor sha256:** `13c0fca11241c5608d7da1e434383a4e881c886ecbd696414bebdd5a8db636c6` (verified 2026-09-02)
**Profile:** `serra-honda` (dealer `21043`). Timezone: `America/New_York` (ET). Source system:
VinSolutions (VIN). Scheduler sender: `reportscheduler@motosnap.com` (`gmail_scheduler`).
Recipient mailbox (Guinan-only): `guinan.skidek@huminic.ai`.

> Live schedule/definition currency (whether these circuits are still active/unchanged today) is
> **reported_pending_phase0_verification** — it requires Gmail/Vin access, which Phase 0 prohibits.
> States/fingerprints below are the last committed evidence (deliveries observed ~2026-08-31).

## 0. Source hashes and provenance (item 3)

Two source classes back these fingerprints; each field below is attributed to one of them:

- **Delivery evidence** (exact subject, delivery filename, byte size, artifact sha256,
  validation_state, `data_row_total`, `received_at`, mailbox/sender): committed anchor
  `native-scheduled-evidence.json` sha256 `13c0fca1…` (locally verified). Sender/mailbox are bound
  per delivery from the anchor's read-only Gmail-metadata ledger (`ledger_sha256`
  `7820cfa7f0f6d90f38adc4a814169f835a8de74f5c9a78ebefed5f019480f293`).
- **Schedule definition** (VinSolutions saved-report name, ET schedule time, period rule, Guinan
  recipient binding): Codex acceptance-controller **checkpoint** sha256
  `78f203e1fa7fd523a390b662b38af33a10b4a7bfaba399a6b4850f80e6d94888` and **report catalog** sha256
  `a31b3879fefc2ba1cad8c5d0ede851e0fb64de34b9416561a8a8ee8d0346840a`.
  - **Honest provenance note:** these two artifacts reside in the **Codex acceptance controller**;
    they were **not present** in the MAIN/INGEST working trees or the local vault at correction
    time, so their bytes were **not independently re-hashed locally** in this Phase 0 correction.
    Provenance is operator/Codex-attested; local byte verification is **pending handoff**
    (`09_conflict_register.json` C-11).

## 1. Six native scheduled circuits — Honda (21043) complete fingerprints

Common to all six: source = VinSolutions (VIN); dealer = `21043` (Serra Honda of Sylacauga);
recipient = Guinan only (`guinan.skidek@huminic.ai`); timezone = America/New_York (ET);
file format = XLSX; scheduler sender = `reportscheduler@motosnap.com`.

### 1.1 Communication Log — **QUARANTINED**
| Field | Value |
|---|---|
| Base report | Communication Log |
| Saved report name | `Huminic \| SH21043 \| Sales Comms \| Daily` |
| Exact email subject | `VIN \| Serra Honda 21043 \| Sales Communication Log \| Daily` |
| Cadence / schedule time (ET) | Daily, 06:15 |
| Period rule | Yesterday |
| Delivery file | `Report-5649.xlsx` (10586 bytes) |
| Artifact sha256 | `1eddd6ec2a5040d6b27a335b9382d94204b4315bfbcacf5d07c2809b80f56286` |
| Latest evidence | received 2026-08-31T10:17:45Z; period `2026-08-30` |
| State | **QUARANTINED** (`non-sales-lead-type`; hidden Lead Intent Parts/Service) |
| `data_row_total` (anchor) | **28 — parser/counting artifact; zero real communication rows (see §2)** |

### 1.2 Enterprise Performance / CAGE KPI — **QUARANTINED**
| Field | Value |
|---|---|
| Base report | Enterprise Performance |
| Saved report name | `Huminic \| SH21043 \| CAGE KPI \| Weekly` |
| Exact email subject | `VIN \| Serra Honda 21043 \| CAGE KPI \| Weekly` |
| Cadence / schedule time (ET) | Weekly, Mon 06:30 |
| Period rule | Previous Week (Mon–Sun) |
| Delivery file | `Report-4189.xlsx` (17179 bytes) |
| Artifact sha256 | `a79315a3238376a624e72f28b8a159efef233e3f0772931fed744f2a64b8c630` |
| Latest evidence | received 2026-08-31T10:34:45Z; period `2026-08-24..2026-08-30` |
| State | **QUARANTINED** (`non-sales-lead-type`; hidden Lead Intent Parts/Service) |
| `data_row_total` (anchor) | 73 |

### 1.3 Lead Source ROI — **QUARANTINED**
| Field | Value |
|---|---|
| Base report | Lead Source ROI |
| Saved report name | `Huminic \| SH21043 \| Lead Source ROI \| Weekly` |
| Exact email subject | `VIN \| Serra Honda 21043 \| Lead Source ROI \| Weekly` |
| Cadence / schedule time (ET) | Weekly, Mon 06:45 |
| Period rule | Previous Week |
| Delivery file | `Report-8334.xlsx` (16504 bytes) |
| Artifact sha256 | `c032990b5e4ec3f3fd181a2266ebc8ef5e54aa67daa34e46018864150bfaefac` |
| Latest evidence | received 2026-08-31T10:46:24Z; period `2026-08-24..2026-08-30` |
| State | **QUARANTINED** (`non-sales-lead-type`; hidden Lead Intent Parts/Service) |
| `data_row_total` (anchor) | 55 |

### 1.4 Dealership Performance Dashboard — **HELD**
| Field | Value |
|---|---|
| Base report | Dealership Performance Dashboard |
| Saved report name | `Huminic \| SH21043 \| Dealer Dashboard \| Weekly` |
| Exact email subject | `VIN \| Serra Honda 21043 \| Dealer Dashboard \| Weekly` |
| Cadence / schedule time (ET) | Weekly, Mon 07:00 |
| Period rule | Previous Week |
| Delivery file | `Report-8193.xlsx` (27012 bytes) |
| Artifact sha256 | `749affb3085b28361e633e940e1a0aafdc73aca7a4a76487b2f8f0e11c87a1ed` |
| Latest evidence | received 2026-08-31T11:26:26Z; period `2026-08-24..2026-08-30` |
| State | **HELD** (classifier-accepted; **not promoted**) |
| `data_row_total` (anchor) | 65 |

### 1.5 CRM Sales Gross — **HELD**
| Field | Value |
|---|---|
| Base report | CRM Sales Gross |
| Saved report name | `Huminic \| SH21043 \| CRM Sales Gross \| Weekly` |
| Exact email subject | `VIN \| Serra Honda 21043 \| CRM Sales Gross \| Weekly` |
| Cadence / schedule time (ET) | Weekly, Mon 07:15 |
| Period rule | Previous Week |
| Delivery file | `Report-1275.xlsx` (8474 bytes) |
| Artifact sha256 | `baf44eb4211a0db022f64f1fd952a7a74cdecd67fc619fad9b4a7d0d01d19daa` |
| Latest evidence | received 2026-08-31T11:19:48Z; period `2026-08-24..2026-08-30` |
| State | **HELD** (classifier-accepted; **not promoted**) |
| `data_row_total` (anchor) | 6 |

### 1.6 Appointments — **HELD**
| Field | Value |
|---|---|
| Base report | Appointments |
| Saved report name | `Huminic \| SH21043 \| Appointments \| Weekly` |
| Exact email subject | `VIN \| Serra Honda 21043 \| Appointments \| Weekly` |
| Cadence / schedule time (ET) | Weekly, Mon 07:30 |
| Period rule | Previous Week |
| Delivery file | `Report-4800.xlsx` (10217 bytes) |
| Artifact sha256 | `ef2a2b1a5fb638b620bd1997ffd73f1f54a615c36fbebf9b7bdaa79508fcef4d` |
| Latest evidence | received 2026-08-31T11:36:45Z; period `2026-08-24..2026-08-30` |
| State | **HELD** (classifier-accepted; **not promoted**) |
| `data_row_total` (anchor) | 15 |

**Honda accepted-vs-quarantine tally:** 3 HELD (Dashboard, Gross, Appointments) / 3 QUARANTINED
(Communication, CAGE, ROI). Consistent with the 3-profile aggregate (9 held / 9 quarantined).

### 1.7 Response Times — manual browser checkpoint (NOT a scheduled email)
Response Times is a **manual browser CSV checkpoint**, run **Mon 07:45 ET**, covering the
**previous complete Mon–Sun** week. It is **not** a scheduled VinSolutions email delivery (no
`reportscheduler@motosnap.com` circuit). State detail in §5.

## 2. Communication zero-real-rows correction (item 4)

Artifact-tool inspection (read-only, `openpyxl`) of `Report-5649.xlsx` — the Communication delivery
(sha256 `1eddd6ec…`; byte-identical copy at `/tmp/halo-295-fresh-20260831/Report-5649.xlsx`, sha
re-verified 2026-09-02):

- **Sheet `Report` is exactly A1:O3** (max_row=3, max_col=15):
  - **Row 1** — report title row (blank / non-breaking-space cells).
  - **Row 2** — the **15 column headers (A–O)**: Dealer, User Group, User, Customer, Activity Date,
    Direction, Comm Channel, Comm Type, Interaction Result, Lead Type, Lead Status Type, Lead Status,
    Lead Source, Lead Created Date, Message Content.
  - **Row 3** — a single notice: **"Current selections did not return any data. Review the filter
    settings."**
  - → **Zero real communication data rows.**
- **Sheet `Filters` (26 rows)** independently confirms the whole-delivery quarantine cause:
  `Lead Intents = "Acquisition, Parts, Sales, Service, Unknown"` (hidden positive Parts + Service);
  `Base Report Name = "Communication Log"`; `Date Range = Yesterday` (Aug 30 2026);
  `Dealers = "Serra Honda of Sylacauga"`.
- **Reconciliation (both facts preserved):** the anchor's `data_row_total = 28` is a
  **parser/counting artifact**. The native-scheduled generator computes it by **summing the per-tab
  row counts recorded in `classify-report.json`** (sha256
  `e9e0c897a7aceebaf0a0a8f0afc7a3eec770b4cd3b7db118f40a35a6c5beba16`, verified locally 2026-09-02):
  for `Report-5649.xlsx`, `tab_rows = {Report: 3, Filters: 25} = 28`. (openpyxl reports the `Filters`
  sheet `max_row = 26` only because **Filters row 26 is entirely blank** — the last populated Filters
  row is row 25, "Users".) The 28 is therefore a sum of **structural / filter-definition tab rows**,
  **not** a count of communication records — it does not represent 28 communication rows. The anchor
  already carries the corroborating note *"Honda daily sales_comm_log additionally has zero real data
  rows."* Neither the parser tally nor the delivery may be treated as data: the delivery is
  quarantined whole (hidden Lead Intent) **and** contains zero real rows. Recorded in
  `09_conflict_register.json` C-12.

## 3. Whole-delivery quarantine cause (Hidden Lead Intent)

- **Evidence:** `docs/halo/evidence/m1r/GATE3_HIDDEN_LEAD_INTENT_BLOCKER_2026-08-30.md`
  (sha256 `acad5861c37e67bf33425b797d053540d2f54e7ce339e5880673f4c0abae3273`, verified 2026-09-02),
  now also corroborated by direct Filters-tab inspection (§2).
- **Cause:** ROI/CAGE/Communication Filters tabs carry `Lead Intents = [Acquisition, Parts, Sales,
  Service, Unknown]` — a **hidden, non-UI** positive selection of Service/Parts. Visible Lead Types
  and the "Lead Sources Excluded" filter are clean, but clean rows do **not** cure a contaminated
  definition.
- **Rule (code-authoritative):** `hs-ingest-dev/src/server/ingest/vin-contracts.ts`
  `evaluateDelivery` scans `[...leadTypes, ...leadIntents]` against `/\b(service|parts)\b/i` and
  **whole-delivery quarantines** before any row-level evaluation. No accept-and-flag / override /
  env bypass path (removed by operator correction 2026-08-25).
- **Resolution options (require Duane authority; not taken in Phase 0):** source fix via
  Cox/VinSolutions admin to remove Parts/Service from positive Lead Intent (recommended); or a
  field-minimized Sales-only Custom Reporting alternative. Gate 3 remains **HOLD/PENDING**.

## 4. Response Times (browser family)

- **Contract:** `docs/halo/contract/coverage-matrix-18cell.json` (sha256
  `1725554d34defd1d2d79ed84dd0bcc7c324f992067a8307c0f1093c18002130b`); host
  `vinsolutions.app.coxautoinc.com`; America/New_York; raw preserved beside derivative; §A of
  `SCHEMA_CONTRACT_BROWSER_EXTENSION.md` (AGREED + IMPLEMENTED, canonical v1 manifest frozen).
- **Current evidence:** `docs/halo/evidence/m1r/residual/gate4i-response-times-measured-unscored-ledger.json`
  (sha256 `3d3e0ae280dcf740c8dab7cc0bdb32d5d1633eebfa96758c00811e91444bb779`).
- **State:** **MEASURED-UNSCORED / not promoted.** Capture `HUM-VIN-006-RT-20260901-…`, Sales-only,
  period 2026-08-24..2026-08-30, manual Mon 07:45 ET checkpoint of the previous complete Mon–Sun.
  SW-013/SW-016/SW-017 remain **unresolved (held)** against the frozen spec (definition mismatch /
  missing holiday calendar / phone-origin not identifiable). Independent SW-013 supplemental
  recompute (figures only, not scored): Honda 25.9% (7/27).
- **Boundary:** the `measured_unscored` layer does not relax the frozen spec or any promotion gate.

## 5. Global gate context (as committed)

- **Gate 2 coverage contract:** RATIFIED (Shadow PASS) — `GATE2_COVERAGE_CONTRACT_PASS_2026-08-30.md`.
- **Gate 3 (Hidden Lead Intent):** HOLD/PENDING; all 18 native readiness cells = `false`; no
  promotion, no classifier/contract change authorized.
- **Overall:** no Honda native family has been promoted into analytics; three families quarantined
  pending a source/authority remedy; Response Times measured-unscored.

## 6. Prohibited-access confirmation

This reconstruction used only committed repository evidence files and read-only artifact inspection
of a locally-present XLSX copy (hashes verified locally). No Gmail, VinSolutions, network, or
schedule operation was performed. Live currency of any schedule is labeled
`reported_pending_phase0_verification`. The two Codex-controller source artifacts (§0) were not
locally re-hashed (C-11).
