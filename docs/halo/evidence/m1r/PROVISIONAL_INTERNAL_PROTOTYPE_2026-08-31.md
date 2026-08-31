# M1R/M2R Interim Internal Prototype — Provisional ROI/CAGE/Sales-Communication (2026-08-31)

**STATUS: Internal Prototype — Not Strict M1R Acceptance.** Built under Duane's interim-internal-prototype
authorization in the isolated worktree `/home/ubuntu/hs-m1r-isolated-20260830`
(branch `codex/m1r-gate3-schedule-audit`). **The strict classifier, strict contract, accepted/quarantined
ledgers, readiness cells, production DB, schedules, customer channels, and deployment are UNCHANGED.**
Global state remains **9 strict-accepted / 9 strict-quarantined**; the nine ROI/CAGE/Sales-Communication
families stay **strict-quarantined (zero accepted metrics)**. Gate 3 remains **HOLD** on the hidden
Lead-Intent question (see `GATE3_HIDDEN_LEAD_INTENT_BLOCKER_2026-08-30.md`).

## 1. What was built (all additive; non-promoting)
A separate, self-contained **non-promoting analysis-only adapter** that reads the three strict-quarantined
families from **local-only fixtures** and produces DEFENSIBLE, DIRECTIONAL provisional metrics for an
internal prototype — never touching the governed store, ledgers, contract, or classifier.

| Path | Role |
|---|---|
| `src/server/reports/provisional/xlsx-reader.ts` | Vendored zero-dependency XLSX reader (`node:zlib` only); parse-only |
| `src/server/reports/provisional/provisional-adapter.ts` | Pure `computeProvisional()` + file wrapper; fail-closed gates; service-row exclusion; reconciliation |
| `src/server/reports/provisional/provisional-prototype-card.ts` | Pure card builder + watermarked, print-friendly HTML renderer |
| `scripts/render-provisional-cards.ts` | One-time render (strict store read-only + local fixtures) → HTML |
| `scripts/render-provisional-pdfs.sh` | Headless-Chromium print-to-PDF from the committed HTML |
| `src/test/provisional-adapter.test.ts` | 13 unit tests (synthetic sheets; no fixtures, no PII) |
| `src/test/provisional-prototype-card.test.ts` | 6 unit tests (watermark, footnotes, inert recs, provenance, PII-absence) |
| `docs/halo/evidence/m1r/provisional-cards/*.html`, `*.pdf` | Three prototype cards (HTML + print-quality PDF) |

## 2. Privacy discipline (enforced)
- The adapter reads only structural/aggregate columns. It **never reads, stores, or emits** the `Customer`
  or `Message Content` columns. Outputs are **aggregate counts/sums + source filename + checksum +
  service-row-exclusion counts** — no names, emails, phones, addresses, message bodies, or lead IDs.
- **`.local-fixtures/` is git-ignored and is removed after render/validation** — the raw XLSX workbooks are
  never committed or pushed. HTML/PDF artifacts were PII-scanned (email/phone/`Message Content`) → clean.

## 3. Family handling
- **Sales Communication (`sales_comm_log`, row-level):** every detectable Service/Parts-coded row — via
  `Lead Type`, `Comm Type`, or `Lead Source` (named service source) — is **excluded AND counted before any
  calculation**. Metrics are computed on the Sales remainder only. Footnote: row-level Sales filters +
  service-source exclusion applied; residual hidden Lead-Intent metadata may remain → directional.
- **Aggregate ROI (`lead_source_roi`) & CAGE (`cage_kpi`):** computed from clean visible rows (ROI per
  lead-source leaf rows; CAGE per-rep LEAF rows only, ignoring the 3-level subtotals). Each metric carries
  the footnote: **VinSolutions hidden Lead Intent metadata includes Parts/Service and cannot be separated
  after aggregation, so values are directional and not strict Sales-only proof.** ROI attributed-ROI is
  **withheld** (cost/profit present but zero) — missing is not zero.
- **Fail closed** on wrong dealer / wrong period (weekly families pinned to 2026-08-24..30) / schema
  mismatch / zero data rows → `available:false` with a limitation code (never zeroed metrics).
- **Reconciliation:** a SOURCE arithmetic self-check over the **full leaf population** (service rows
  included) vs each report's own grand-TOTAL row — independent of the Sales-only exclusion applied to the
  published metrics, so excluding service rows never spuriously fails reconciliation. All nine reconcile.

## 4. Provisional provenance (aggregate; local-only sources — NOT committed)
All nine remain **strict status = quarantined, provisional = true**. Period: ROI/CAGE weekly 2026-08-24..30;
Sales-Communication daily 2026-08-29. `svc excl` = Service/Parts rows removed before calculation.

| profile | family | source filename | sha256 | rows | svc excl | reconciles |
|---|---|---|---|---:|---:|---|
| serra-honda | lead_source_roi | 11_VIN_Serra_Honda_21043_Lead_Source_ROI_Weekly_Report-2381.xlsx | `9f1ae8f154a9…` | 25 | 0 | yes |
| serra-honda | cage_kpi | 09_VIN_Serra_Honda_21043_CAGE_KPI_Weekly_Report-4371.xlsx | `c6c1f49f9528…` | 40 | 0 | yes |
| serra-honda | sales_comm_log | 10_VIN_Serra_Honda_21043_Sales_Communication_Log_Daily_Report-8860.xlsx | `188a6ba8250b…` | 69 | 0 | yes |
| serra-nissan | lead_source_roi | 17_VIN_Serra_Nissan_21044_Lead_Source_ROI_Weekly_Report-2068.xlsx | `28e2e59726ba…` | 28 | 0 | yes |
| serra-nissan | cage_kpi | 16_VIN_Serra_Nissan_21044_CAGE_KPI_Weekly_Report-7529.xlsx | `7a5baac09adf…` | 42 | 0 | yes |
| serra-nissan | sales_comm_log | 15_VIN_Serra_Nissan_21044_Sales_Communication_Log_Daily_Report-5886.xlsx | `6cde7ae9bee6…` | 246 | 0 | yes |
| tony-serra-ford | lead_source_roi | 05_VIN_Tony_Serra_Ford_21047_Lead_Source_ROI_Weekly_Report-1999.xlsx | `3ad37ebf1c10…` | 24 | 0 | yes |
| tony-serra-ford | cage_kpi | 04_VIN_Tony_Serra_Ford_21047_CAGE_KPI_Weekly_Report-5643.xlsx | `0815e544cc41…` | 32 | 0 | yes |
| tony-serra-ford | sales_comm_log | 03_VIN_Tony_Serra_Ford_21047_Sales_Communication_Log_Daily_Report-3112.xlsx | `cfcc30f85df3…` | 34 | 0 | yes |

Strict-accepted families (read read-only from `/srv/ingest-dev/analytics`) are cited in each card's
provenance table by their accepted checksums (Honda `9613643d…`/`e64a5208…`/`8178807561…`; Nissan
`969ff03d…`/`a73f4e37…`/`7a31cee4…`; Ford `2ae6dbbe…`/`1d52c108…`/`98bac420…`) — unchanged.

## 5. Committed artifact hashes
| artifact | sha256 |
|---|---|
| serra-honda-internal-prototype.html | `c461a7400bd1213f64a0f389fc05d3852e1cafeed31edf32597dd72712067cd7` |
| serra-nissan-internal-prototype.html | `79ab976ab09c6d790772ba1f6edda856967397d8f8f6f58a7b62e7f93775d58b` |
| tony-serra-ford-internal-prototype.html | `c7d6e85ba757ca654489a48e1e7faaa1dd3e3ce0c974a5e01898321e5aea4b4d` |
| serra-honda-internal-prototype.pdf | `585a338c3781599334ecdad6d9c869eee24e6b4a96248a7a76873af2edd159be` |
| serra-nissan-internal-prototype.pdf | `dd981ddfd41ddde311e97c9b231cf55de771e8f99deccc6cc194aed9ac69b609` |
| tony-serra-ford-internal-prototype.pdf | `9d59825aa87aeda8edffcad8b8edbea3ecd550231d3d6a9d16c03a24e9e29a03` |

HTML is deterministic; PDFs embed a Chromium creation timestamp/document-id and are therefore not
byte-reproducible (re-rendering yields a new hash). All 9 PDF pages were rasterized and visually inspected:
no clipping, overlaps, bad page breaks, black boxes, unreadable footnotes, or PII.

## 6. Verification
- **Control gate (exact 13 files): 82/82 passed.** `halo-m1-proof, ingest-native-metrics,
  metric-values-native, metric-values-missing-not-zero, metric-values, data-freshness, sales-growth-card,
  m1r-notification-examples, m1r-notification-paused-path, alert-display-model, AlertsPanel.render,
  metric-source-freshness, watchdog-metric-catalog`.
- **New focused tests: 19/19 passed** (`provisional-adapter` 13, `provisional-prototype-card` 6).
- **Touched-file typecheck:** clean (0 errors in the new files; repo baseline pre-existing errors unrelated).

## 7. Caveats (carried, not hidden)
1. Aggregate ROI/CAGE values are **directional**, not strict Sales-only proof — the hidden Lead Intent
   `[Parts, Sales, Service, Unknown]` is inseparable after aggregation. Observed service-coded visible rows
   were **0**, but aggregate rows carry no per-row Lead-Intent column, so the residual cannot be proven absent.
2. Single-period baseline; no trend asserted. Counts are descriptive, not attributed causation.
3. Notifications/automations are **inert recommendations only** — nothing is activated, scheduled, or sent.
4. This prototype **does not** advance readiness, promote data, or relax the classifier/contract. The
   §10.6 Cox question (is the hidden Lead Intent operative?) remains the real cure and is unanswered.

## 8. Rollback
Delete `src/server/reports/provisional/`, the two test files, the two scripts, and
`docs/halo/evidence/m1r/provisional-cards/`; revert `.gitignore`. Nothing was promoted, so there is no data
or ledger state to unwind.
