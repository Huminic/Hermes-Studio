# Phase 0 — Honda schedule/source fingerprints + Response Times (read-only reconstruction)

**Reconstructed at (UTC):** 2026-09-02 (from committed repo evidence only — **no Gmail/Vin access**)
**Primary anchor:** `docs/halo/evidence/m1r/scheduled/native-scheduled-evidence.json`
**Anchor sha256:** `13c0fca11241c5608d7da1e434383a4e881c886ecbd696414bebdd5a8db636c6` (verified 2026-09-02)
**Profile:** `serra-honda` (dealer `21043`). Per-family states below were extracted directly from
the anchor and independently re-verified in this session.

> Live schedule/definition currency (whether these circuits are still active/unchanged today) is
> **reported_pending_phase0_verification** — it requires Gmail/Vin access, which Phase 0 prohibits.
> The states below are the last committed evidence (deliveries observed through ~2026-08-31).

## 1. Six native scheduled circuits — Honda (21043) state

| # | Circuit / family | Cadence | Honda file | sha256 | State | Reason |
|---|---|---|---|---|---|---|
| 1 | Lead Source ROI (`lead_source_roi`) | Weekly XLSX+Filters | Report-8334.xlsx | `c032990b…faefac` | **QUARANTINED** (whole-delivery) | `non-sales-lead-type` — hidden Lead Intent selects Parts/Service |
| 2 | Enterprise Performance / CAGE (`cage_kpi`) | Weekly XLSX+Filters | Report-4189.xlsx | `a79315a3…b8c630` | **QUARANTINED** (whole-delivery) | `non-sales-lead-type` — hidden Lead Intent Parts/Service |
| 3 | Sales Communication Log (`sales_comm_log`) | Daily XLSX | Report-5649.xlsx | `1eddd6ec…f56286` | **QUARANTINED** (whole-delivery) | `non-sales-lead-type` — hidden Lead Intent contamination |
| 4 | CRM Sales Gross (`crm_sales_gross`) | Weekly per-deal XLSX | Report-1275.xlsx | `baf44eb4…d19daa` | **HELD** (accepted-eligible) | classifier-accepted; **not promoted** into analytics |
| 5 | Appointments (`appointments`) | Weekly event-row XLSX | Report-4800.xlsx | `ef2a2b1a…8fcef4d` | **HELD** (accepted-eligible) | classifier-accepted; **not promoted** |
| 6 | Dealership Performance Dashboard (`dealership_performance`) | Weekly XLSX+Filters | Report-8193.xlsx | `749affb3…7a1ed` | **HELD** (accepted-eligible) | classifier-accepted; **not promoted** |

**Honda accepted-vs-quarantine tally:** 3 HELD (Gross, Appointments, Dashboard) / 3 QUARANTINED
(ROI, CAGE, Communication). Consistent with the 3-profile aggregate (9 held / 9 quarantined).

**Fingerprint fields recorded in the anchor** (per delivery): `profile`, `family`/`report_kind`,
`validation_state`, `quarantine_reason`, `sha256`, `filename`, source `sender`
(`reportscheduler@motosnap.com`), `source_type` (`gmail_scheduler`), periods, and last-received
timestamps. Subject/recipients/period-rule/file-signature detail is preserved inside the anchor;
Phase 0 pins the anchor sha256 so those fields are reproducible without restating each.

## 2. Whole-delivery quarantine cause (Hidden Lead Intent)

- **Evidence:** `docs/halo/evidence/m1r/GATE3_HIDDEN_LEAD_INTENT_BLOCKER_2026-08-30.md`
  (sha256 `acad5861c37e67bf33425b797d053540d2f54e7ce339e5880673f4c0abae3273`, verified 2026-09-02).
- **Cause:** ROI/CAGE/Communication Filters tabs carry `Lead Intents = [Parts, Sales, Service,
  Unknown]` — a **hidden, non-UI** positive selection of Service/Parts. Visible Lead Types and the
  six "Lead Sources Excluded" are clean, but clean rows do **not** cure a contaminated definition.
- **Rule (code-authoritative):** `hs-ingest-dev/src/server/ingest/vin-contracts.ts`
  `evaluateDelivery` scans `[...leadTypes, ...leadIntents]` against `/\b(service|parts)\b/i` and
  **whole-delivery quarantines** before any row-level evaluation. No accept-and-flag / override /
  env bypass path (removed by operator correction 2026-08-25).
- **Resolution options (require Duane authority; not taken in Phase 0):** source fix via
  Cox/VinSolutions admin to remove Parts/Service from positive Lead Intent (recommended); or a
  field-minimized Sales-only Custom Reporting alternative. Gate 3 remains **HOLD/PENDING**.

## 3. Response Times (browser family)

- **Contract:** `docs/halo/contract/coverage-matrix-18cell.json` (sha256
  `1725554d34defd1d2d79ed84dd0bcc7c324f992067a8307c0f1093c18002130b`); host
  `vinsolutions.app.coxautoinc.com`; America/New_York; raw preserved beside derivative; §A of
  `SCHEMA_CONTRACT_BROWSER_EXTENSION.md` (AGREED + IMPLEMENTED, canonical v1 manifest frozen).
- **Current evidence:** `docs/halo/evidence/m1r/residual/gate4i-response-times-measured-unscored-ledger.json`
  (sha256 `3d3e0ae280dcf740c8dab7cc0bdb32d5d1633eebfa96758c00811e91444bb779`).
- **State:** **MEASURED-UNSCORED / not promoted.** Capture `HUM-VIN-006-RT-20260901-…`, Sales-only,
  period 2026-08-24..2026-08-30. SW-013/SW-016/SW-017 remain **unresolved (held)** against the
  frozen spec (definition mismatch / missing holiday calendar / phone-origin not identifiable).
  Independent SW-013 supplemental recompute (figures only, not scored): Honda 25.9% (7/27).
- **Boundary:** the `measured_unscored` layer does not relax the frozen spec or any promotion gate.

## 4. Global gate context (as committed)

- **Gate 2 coverage contract:** RATIFIED (Shadow PASS) — `GATE2_COVERAGE_CONTRACT_PASS_2026-08-30.md`.
- **Gate 3 (Hidden Lead Intent):** HOLD/PENDING; all 18 native readiness cells = `false`; no
  promotion, no classifier/contract change authorized.
- **Overall:** no Honda native family has been promoted into analytics; three families quarantined
  pending a source/authority remedy; Response Times measured-unscored.

## 5. Prohibited-access confirmation

This reconstruction used only committed repository evidence files (hashes verified locally). No
Gmail, VinSolutions, network, or schedule operation was performed. Live currency of any schedule
is labeled `reported_pending_phase0_verification`.
