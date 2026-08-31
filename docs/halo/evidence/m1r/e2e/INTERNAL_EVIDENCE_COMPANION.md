# M1R Real-Data E2E — Internal Evidence Companion

**Status:** internal engineering evidence. NOT a customer document. Pairs with the three
customer-style preview cards in `cards/` (which carry only concise footnotes) and the
machine-readable `real-data-e2e-receipt.json`.

**Bounded package:** M1R real-data E2E through the closest honest dev pipeline. Repo
`hs-m1r-isolated-20260830`, branch `codex/m1r-gate3-schedule-audit`. DEV-ONLY, NON-PROMOTING,
ISOLATED. No production, deploy, external send, schedule/CRM mutation, or Service workspace work.

**Strict contract unchanged:** 9 accepted / 9 quarantined; **M1 readiness = FALSE.** The three
quarantined families are **never promoted**; the preview metrics are directional, not strict
acceptance.

---

## 1. Seam (Control decision: Option A — exercise the real XLSX hold path, isolated)

The governed six-family path lives in the **separate `hs-ingest-dev` repo** (this repo's legacy
`/api/ingest/report` hard-rejects non-CSV and did not ingest these XLSX). The runner drives
`hs-ingest-dev`'s **own** functions **read-only** against **isolated temp roots**:

```
real bytes ─▶ landDelivery()  ─▶ held | quarantined         (governed hold gate)
   held (9 strict) ─▶ promoteHeldToAnalytics() ─▶ runVinWatchdog() ─▶ isolated brain.db
                          └─▶ this repo's strict readers (ingest-native-metrics) ◀┘
   quarantined (9) ─▶ promote ATTEMPTED ⇒ aborts (never enters strict ledger)
                   ─▶ provisional non-promoting adapter (directional preview)
   all lanes ─▶ 18-cell receipt ─▶ 3 polished Halo preview cards
```

No server, no secret, no `/srv` store, no modification of `hs-ingest-dev`. Isolated roots are a
per-run `fs.mkdtempSync(os.tmpdir()/m1r-e2e-*)`, removed after the run.

Runner: `scripts/m1r-e2e/run-real-data-e2e.ts`; pure lib + card: `src/server/reports/e2e/`.

## 2. Consumer lineage pin (reproducibility)

The runner dynamically imports mutable `hs-ingest-dev` source, so the receipt pins the exact
consumer and **fails before hold** on a missing module, HEAD mismatch, or a dirty change touching
a pinned module.

- HEAD `4c41df11dc48…` (matches expected `4c41df11d…`), branch `dev/ingest-endpoint`.
- Dirty: 1 file (`src/routeTree.gen.ts`) — a generated artifact, **not** a consumer module;
  `dirty_touches_consumer = false`.
- SHA-256 pinned for the 5 imported modules: `hold-store.ts`, `vin-contracts.ts`,
  `xlsx-reader.ts`, `promote-held-to-analytics.ts`, `vin-metrics.ts` (see `consumer_pin` in receipt).

## 3. Source identity binding (exact preserved set)

Bound to the committed aggregate-only manifest `docs/halo/contract/vin18-source-identity.json`
(derived from the operator-staged authoritative Mac validation ledger; **Shadow's independent
reproduction is kept separate for final reconciliation**). The run **fails before hold** unless:

- exactly 18 unique entries; each MANIFEST cell's `family_slug`, `dealer_id`, and `ledger_status`
  match expectations (not just filename/hash/size);
- each workbook's computed filename + SHA-256 + size equals the ledger.

Result: **all 18 bound** (9 ACCEPT / 9 QUARANTINE). A fresh hash alone is only lineage; this proves
the same approved workbooks were used.

## 4. Honest bifurcation (governed gate disposition)

| Lane | Families | Hold | Promote | Reader / adapter |
|---|---|---|---|---|
| Strict-governed (9) | appointments, crm_sales_gross, dealership_performance | **held** | **promoted** into isolated brain.db | `ingest-native-metrics` + `runVinWatchdog` reconciled |
| Provisional-preview (9) | lead_source_roi, cage_kpi, sales_comm_log | **quarantined** (`non-sales-lead-type` — hidden Lead Intent incl. Parts/Service) | **attempted ⇒ aborted** (no held delivery) | non-promoting provisional adapter (directional) |

- **Non-promotion assertion (hard):** every isolated `brain.db` holds **3 strict deliveries, 0
  provisional deliveries, 0 provisional rows** for all three rooftops.
- **Technical pass 18/18** — stronger than held-vs-quarantined agreement. Strict cells require
  hold=held + report_kind/dealer/period bound + promote=promoted + all required metrics present +
  **watchdog reconciled**. Preview cells require quarantined + report_kind/dealer bound + promote
  attempted & aborted + adapter available + reconciliation checked & reconciles.

## 5. Watchdog reconciliation (preserved AND compared)

The `runVinWatchdog` result from each strict promote is preserved and cross-checked vs the reader:

- **Appointments:** each `appt.*_rate` count == reader numerator, value ≈ numerator/total
  (e.g. Honda show 8/14 = 0.571).
- **Gross:** `gross.total_sum` == reader, `gross.reconciliation_mismatches` == reader, count == row_count.
- **Dashboard:** `dashboard.section_markers` count == accepted rows (40/41/41), 1 ≤ markers ≤ rows.

**Independent cross-source agreement (natural reconciliation):** total gross agrees across three
independent sources — e.g. Honda `crm_sales_gross.total_sum` = `dealership_performance.dp.total_gross`
= `lead_source_roi.roi.total_gross` = **$14,185.20**; delivered `gross.row_count` = dashboard
`dp.sold_in_period` = 5.

## 6. Permanent Sales-only rule

- Row-level Service/Parts: the provisional adapter detects and excludes Service/Parts-coded rows
  before any calculation; the cards say "N excluded" **only when N > 0**, otherwise "0 visible
  Service/Parts-coded rows detected" — never implying the aggregate is proven Sales-only.
- Aggregate ROI/CAGE hidden Lead Intent: inseparable after aggregation ⇒ remains **quarantined /
  directional**, footnoted on every card. No strict promotion.

## 7. Missing ≠ zero + negative coverage

- Absent/withheld metrics are recorded `null` + a reason, never a fabricated 0 (e.g. `roi.actual_roi`
  withheld: cost/profit zero). Cards render no bare $0 for withheld values.
- Governed-gate negatives (wrong dealer / wrong period / schema / provenance) are enforced by the
  hold gate itself and covered by `hs-ingest-dev` tests + the 28 provisional tests; the E2E lib adds
  cell-level negatives (failed promote, leaked promotion, unchecked reconciliation, wrong
  dealer/period/report_kind) in `src/test/m1r-real-data-e2e.test.ts`.

## 8. Report model consumes the runner output

The three cards are built by `buildHaloPreviewCard(dealer, receiptCells, dataThrough)` — every
figure flows from the receipt cells' `metrics_emitted`; there are no duplicated hard-coded totals.

## 8b. Extended provisional metric coverage + cross-family reconciliation (2026-08-31 add)

- **CAGE SALES-leaf directional sums** for the exact native headers (Good/Bad Leads, Sold in Time Frame,
  Internet Leads/Attempted/Actual Contact, Appts Scheduled/Scheduled Sold/Confirmed, Visits/Sold/Initial/
  Be Back, Total Calls/Emails/Texts/Facebook, Total Comms In/Out/Total, Active/Completed/Dismissed/Inactive/
  Missed Tasks). Published sums come from **sales leaves only** (a visible Service/Parts leaf is excluded
  first and can never leak into a published figure); missing/non-numeric → null, never 0. **Component
  identities reconcile on the published sales basis** (calls+emails+texts+facebook == Total Comms; In+Out ==
  Total Comms), and a **separate, explicit full-source check** reconciles the FULL-leaf Σ Total Comms to the
  grand TOTAL row.
- **Sales Communication channel breakdown** by exact `Comm Channel` (Email / Logged Call / Text / Facebook)
  over included sales rows; channel sum reconciles to included rows. (`Customer` / `Message Content` are
  never read.)
- **Independent numerical reconciliation (real fixtures, matches exactly):** CAGE `total_comms` — Honda 1473
  (509/232/732/0; in/out 188/1285), Nissan 726 (319/144/263/0; 57/669), Ford 510 (219/89/202/0; 57/453).
  Comm channels (Email/Logged Call/Text/Facebook) — Honda 8/33/28/0, Nissan 51/95/100/0, Ford 3/16/15/0.
- **Per-profile `cross_family_reconciliation`** (no winner; exact values preserved): strict gross total vs
  Dashboard gross (tolerance), gross row_count vs Dashboard sold_in_period, CAGE provisional gross vs strict
  gross (directional). **Honda 5==5 and Nissan 6==6 reconcile.** **Ford does NOT reconcile the delivered
  count: 7 CRM Sales Gross delivered-sale rows vs 6 Dashboard sold** (same $1,600.99 gross). Both are shown
  unreconciled with a source-discrepancy footnote; neither is treated as authoritative and no value is zeroed.
  The Ford card therefore says "7 delivered-sale rows in CRM Sales Gross · Dashboard reports 6 sold", never
  "7 vehicles delivered". The appointment-confirm opportunity is phrased retrospectively (records not marked
  confirmed during the week; the weekly pool includes completed/cancelled/no-show and is not necessarily
  presently actionable). All CAGE/Comm figures retain the directional hidden-Lead-Intent footnote.

## 9. Tests / gates (all green)

- Focused E2E lib + card + identity-manifest: **43/43** (`src/test/m1r-real-data-e2e.test.ts`). Component
  reconciliations GATE provisional technical_pass by EXACT required name per family (CAGE: comms_components/
  comms_direction/comms_grand_total; Comm: channel_sum; ROI: none). Negatives prove a cell FAILS on a
  missing/undefined/empty, duplicate, or unexpected component, and on an arithmetic mismatch (reconciles=false).
- CAGE/Comm reconciliation: **10/10** (`src/test/m1r-cage-comm-reconciliation.test.ts`) — fixture-gated numerical
  match to independent totals (skips PII-free in CI) PLUS a hand-built Service-leaf test proving published leaf
  sums exclude the Service leaf while the full-source grand-TOTAL reconciliation stays explicit.
- Prior 13-file control gate preserved: **82/82**.
- Provisional prototype suite preserved: **28/28** (adapter extension additive).

## 8c. External customer-facing samples (2026-08-31 add)

Per Duane's report-card correction, the loud internal card is preserved as **internal audit evidence**
(`cards/*-halo-preview.html/.pdf`), and a **separate external customer sample per dealer** is generated at
`cards/external/*-halo-external.{html,pdf}`. The external variant (`buildExternalCard`) **omits** the Data
Provenance table, family slugs, strict/provisional lane labels, checksums, and all quarantined/governed-dev/
M1R/limitation language. Provisional caveats become plain customer language ("Directional CRM signal — the
underlying report categories overlap and are pending refinement"); the **Ford 7-vs-6 delivered/sold gap is
retained in plain words** ("7 recorded sales this week · dashboard shows 6 … both are shown while the figures
are being reconciled"); coverage suggestions become **"Recommended pilot" / "Available next step"** (the INERT
status is recorded here, internally, not on the customer sample). The external footer carries **no internal
workflow status** — it ends at "…directional CRM signals under active refinement."; the draft/review/not-yet-sent
status lives ONLY in this companion and the file naming (`*-halo-external.*` under `cards/external/`). All
**6 external pages visually inspected**; same receipt numbers as the internal cards. Tests assert the external
HTML contains none of the internal artifacts, carries the customer language, and that the footer has no
"internal review" / "not yet sent" status.

## 8d. Governed-path (/srv) audit — honest state (2026-08-31)

The E2E runner writes ONLY isolated `mkdtemp` roots and never writes `/srv`. Aggregate audit values
(digest method: `find <root> -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum`; independently
reproduced here where noted, "before" values from the Shadow audit):

- **Hold store digest — MATCHES before:** `d6b809f159e6c381fa2b649eb1f7ccfaa9ac4e6c396b2d69773d9c888e4ac3fe`.
- **hs-ingest-dev (maxdepth-2) digest — MATCHES before:** `1731800645a4df56030d806750af09f2cadfe2d08e8221b044cfcc813db4fdd8` (independently reproduced).
- **Analytics aggregate digest — CHANGED:** before `f939fb2d29eb940c328677072d3876a121f50c3b668f6ccc0f27c7ee79b30e8e`
  → current `592b29e446ed104d6f5d26cc500e3cb1a23e2558371f5e6e23ee7c4d6f47a865` (current independently reproduced).
- **Three durable per-profile `brain.db` hashes MATCH the pre-run values:** Honda
  `1a3e3bd3a56266c9b71062e72c62a2b46bfde8715e4140f5a5d1c7d356b562be`, Nissan
  `da8d80347f29d576f390668790761bc8484dea94831435628bd0fbc74505e58d`, Ford
  `69e01c0e7b8e24fccd229416baeaa3e7c19fca9b3b2db238edc6f3f814542bea` (mtime 2026-08-30, pre-run).
- **Sidecars** (`brain.db-shm`/`brain.db-wal`) carry current mtimes. Their change is **consistent with, and
  explains,** the analytics aggregate-digest delta (the test suite — `halo-report-card`, `m2b-*`,
  `ingest-native-metrics` — opens `/srv` read-only via the default `BRAIN_PROFILES_ROOT`; the E2E runner uses
  isolated `/tmp`). The **examined per-profile `brain.db-wal` files were 0 bytes** at examination — this is
  specific to those files and is NOT generalized to all WALs (the `messaging-hub.db-wal` files were nonzero in
  the Shadow audit; WAL sizes fluctuate).
- **Honest limitation:** no prior per-file byte manifest of `/srv` was captured before this session, so the
  observed sidecar changes **explain** the aggregate delta but **no other per-file change can be ruled in or out**.
  Byte-for-byte directory-unchanged is therefore **NOT claimed**; what is evidenced is the three durable
  `brain.db` hash matches + the unchanged hold/consumer digests, with the analytics aggregate digest changed.
- Touched-file typecheck: clean (the repo-wide pre-existing tsc errors and 14 pre-existing full-suite
  failures in `m2b-*` / `halo-report-card` / `halo-manifest-and-layers` are **not** caused by this
  work — verified by re-running those files with these additions removed).
- Privacy/PII scan of committed artifacts: clean (aggregate values + filenames + checksums only).
- All 9 PDF pages (3 cards × 3) visually inspected.

## 10. Known truth deviation (recorded, not compensated)

`docs/halo/contract/coverage-matrix-18cell.json` (v1.1.0) reflects an **earlier** held snapshot
(period 2026-08-17/23; 3 accepted / 8 present-invalid / 7 absent) whose `evidence_sha256` values do
**not** match this newer Aug 24–30 real set. The current truth (task context + git history + this
run) is **9 accepted / 9 quarantined**. The ratified matrix was **not** altered; the skew is recorded
here. Identity was verified by content (the committed identity manifest), not the stale hashes.

## 11. Reproduce

```
node_modules/.bin/tsx scripts/m1r-e2e/run-real-data-e2e.ts   # requires local-only .local-fixtures/vin18-20260830
bash scripts/m1r-e2e/render-e2e-card-pdfs.sh                  # PDFs from the committed HTML
```
Raw XLSX/PII stay git-ignored under `.local-fixtures/` and are removed before commit.
