# Halo M1 — Validation Matrix & Smallest Closure Plan

> **ACTIVE-M1R SUPERSESSION NOTICE (additive; history preserved, not rewritten):** The "M1 CLOSED
> (2026-08-28)" record below is a **HISTORICAL snapshot** and is **superseded for VALUES and COVERAGE by
> the active M1R objective** — six native families × three stores must eventually be accepted,
> reader-backed, and calculation-tested. **Current governed state: 9 accepted / 9 quarantined** —
> Dashboard, Appointments, and CRM Sales Gross accepted for all three stores (period **2026-08-24..30**);
> **Lead Source ROI, CAGE KPI, and Sales Communication remain QUARANTINED (zero accepted metrics).**
> **Gate 3 is HOLD** on the hidden Lead-Intent question — see
> `docs/halo/evidence/m1r/GATE3_HIDDEN_LEAD_INTENT_BLOCKER_2026-08-30.md`. This notice does **not** imply
> M1R is closed and does not alter the historical record that follows.

**STATUS: M1 CLOSED in isolated dev (2026-08-28) — independent Codex QC ↔ Studio sign-off ACCEPTED
(15 focused files / 98 tests passed; three profiles independently read). Follow-ons (Lead Source ROI
reader; three-layer UI in M2) remain, but are NOT M1 gates.**

**Scope:** M1 only — isolated dev, Sales-only, three Serra Sales stores (serra-honda, serra-nissan,
tony-serra-ford). **Date:** 2026-08-28 (America/New_York). **Repo/worktree:** `/home/ubuntu/hs-watchdog`
@ `feat/watchdog-dashboard` `e2a17a16e` (sole worktree on this branch; no active-agent conflict —
Codex uses its own `codex-hs-contract-verify` checkout). **No implementation performed by this doc.**

Full strategy + boundaries: `docs/halo/HALO_STRATEGY.md`. Permanent boundary: **Sales only** (Service/
Parts stay in the separate combined Serra Service workspace; never enter these three profiles).

---

## 1. Metrics catalog — supported set & the three comparison layers
Catalog (`src/server/watchdog/metric-catalog.ts`) = **19 metrics**: **3 `hub`** (engagement.*) +
**16 `vin-report`** (appt./roi./gross./cage./comm.).

Comparison-layer assets that already exist:
- **Layer 1 (industry reference):** the pre-existing `report-audit.ts` `BENCHMARKS` + cited doc
  `BEST_PRACTICES_AUDIT_REFERENCE.md` remain for the legacy audit CLI, BUT the **Halo three-layer evaluator
  supersedes them as NON-SCORING**: no Studio slug has a clean, definition-compatible scoring benchmark, so
  `appt.show_rate`/`appt.no_show_rate` are carried as **directional / non-scoring** ranges (with source date,
  our verification date, confidence and `definition_compatibility=incompatible`) and everything else is
  `no_benchmark`. **No invented or scored benchmarks.** (See §3-B evaluator.)
- **Layer 3 (current value):** `resolveMetricValues` (`src/server/watchdog/metric-values.ts`) now resolves
  the **five wired Vin slugs** — `gross.total_sum` + the four `appt.*` rates (`show/no_show/confirmed/cancel`)
  from the accepted native reader (`ingest-native-metrics.ts`, golden-tested) — **plus** the three hub
  `engagement.*`, which are **WITHHELD when the store has 0 source threads** (missing≠zero). All other
  `vin-report` families remain explicitly **withheld** with exact reasons (see the support manifest).
- **Layer 2 (dealer historical baseline):** `baselineFromHistory` exists in `alert-engine.ts` (needs ≥3
  trailing periods). **No persisted per-dealer metric history**; only **one** governed period exists
  (2026-08-17..23) → baseline layer is **not yet supportable** (must be shown as "insufficient history",
  not invented).

**Gap #1 wiring status (corrected metric contract, `resolveNativeMetricValues` in `metric-values.ts`):**

| Catalog slug | Wired? | Source (single family, denominator) | Real isolated values |
|---|---|---|---|
| `gross.total_sum` | ✅ **wired** | dealership_performance TOTAL `totalGross` (Front+Back), provenance-backed | Honda 12240.78 · Nissan 5263.60 · Ford withheld |
| `appt.show_rate` | ✅ **wired** | appointments `show / total` (0..1) | Honda 0.6667 · Nissan withheld · Ford withheld |
| `appt.no_show_rate` | ✅ **wired** | appointments `noShow / total` | Honda 0.2222 · Nissan/Ford withheld |
| `appt.confirmed_rate` | ✅ **wired** | appointments `confirmed / total` | Honda 0.3333 · Nissan/Ford withheld |
| `appt.cancel_rate` | ✅ **wired** | appointments `cancelled / total` | Honda 0.1111 · Nissan/Ford withheld |
| `roi.total_leads`, `roi.sold_from_leads` | ❌ **WITHHELD (contract)** | Dashboard vs Lead Source ROI **definitions diverge** (Honda 89/8 vs 110/5 same period) — mapping from dealership_performance would be a semantic defect | withheld all 3 until a governed **Lead Source ROI** native reader exists |
| `roi.duplicate_rate` | ❌ withheld | needs Lead Source ROI dedup data | withheld |
| `gross.reconciliation_mismatches` | ❌ withheld | needs **per-deal CRM Sales Gross** rows (front+back vs total) | withheld |
| `cage.total_comms`, `cage.deals_from_leads`, `cage.rep_count` (3) | ❌ withheld | **Enterprise Performance / CAGE** report — no governed native reader (NOT the Communication Log) | withheld |
| `comm.escalation_keyword_screen`, `comm.template_overuse`, `comm.inbound_high_intent_keywords`, `comm.multi_rep_within_24h` (4) | ❌ withheld | **Vin Sales Communication Log** — no stable IDs; not a 3-store governed daily feed | withheld |
| `engagement.reply_rate / conversations / resurrections` (`hub`) | ✅ reader wired | messaging-hub cockpit window | **withheld when 0 source threads** (missing≠zero); all 3 isolated stores currently 0 threads |
| **response_times** (avg/median/targets) | separate labeled source | RT readback (minutes = excel-day×1440) | present all 3; **never** a catalog slug |

Rules enforced: **missing≠zero** (a ratio is absent, never 0, when its denominator is null/0 or the family is
unavailable); all four `appt.*` share the **same appointments family + `ap.total` denominator** (never mixed with
Dashboard apptsSet); ratios on the **0..1** convention; `gross.total_sum` only when provenance is explicit
(`available:true`). Golden evidence: `ingest-native-metrics.test.ts` (reader) + `metric-values-native.test.ts`
(derivation/withhold rules). **Layers 1/2** unchanged: industry ref sparse+honest; dealer baseline = **insufficient
history (1 governed period)**, shown as such, not invented.

**Cross-side agreement (Codex QC ↔ Studio) — ACCEPTED (2026-08-28).** Codex independently reran **15 focused files /
98 tests — all passed** and independently read the three profiles: **serra-honda** = gross 12240.78 + four appt rates
with exact accepted checksums/period; **serra-nissan** = gross 5263.6 only; **tony-serra-ford** = empty/withheld.
Wired catalog-slug values + withheld states agree cross-side.

---

## 2. Conversation-weakness evidence matrix — TWO distinct sources

| Source | Reader/asset | 3-store state | Evidence quality | Limitation |
|---|---|---|---|---|
| **Studio messaging-hub** | `src/server/reports/ai-conversation-insights.ts` (grounded, injectable LLM; no provider → "unavailable") | **serra-honda / serra-nissan / tony-serra-ford = 0 threads** → **unavailable** (honest) | governed pipeline exists, but no data in isolated stores | no conversation history present; missing-not-zero (never a fabricated analysis) |
| **Vin Sales Communication Log** | prior Honda exploration (maps to catalog `comm.*`: high-intent, template reuse, provisional chasing, link-only, multi-rep) | **Honda = provisional patterns**; Nissan/Ford = not explored | real weakness signals | **PROVISIONAL** — lacks stable IDs; **not a 3-store daily governed Studio feed**; must be shown with these caveats, never as governed metrics |

The manifest marks all `comm.*` **withheld** with the exact reason (needs a governed Vin Sales Communication Log
reader; no stable IDs; not a 3-store daily feed). `cage.*` is a **separate** family (Enterprise Performance / CAGE),
also withheld pending its own reader.

---

## 3. M1 channel capability matrix

| Channel | Configured | Gated (how) | Tested for Halo | Evidence |
|---|---|---|---|---|
| **Email (internal alert, Central MCP Resend)** | ✅ | dispatch `send` flag (default off) + `CENTRAL_MCP_STUDIO_TOKEN` presence; OUTBOUND/tick env off | ✅ **compositional** | app dispatch-path proven live-shaped by `runLiveSelfTest` (**`sent=true, dry_run=false`, fake sender called once** — no real email only because the sender is injected); the ONE live send went **directly through governed Central MCP (out-of-harness)**, `email_id=6aba7036-…`, recorded in the durable 0600 receipt; Codex confirmed **one unread inbox** message. Separate inert proof: `sent:false`, sender never called. |
| **Inert Vin-metric threshold → internal record** | ✅ | dispatch disabled (`send:false`) | ✅ | `halo-m1-proof.test.ts`: `appt.no_show_rate` (value from the **accepted Honda resolver + provenance**) crosses a controlled threshold via the **real alert engine + dispatch** → fires, **dry-run, sender not called**, internal record persisted in a **synthetic** profile (no governed store touched). |
| **SMS (TextMagic / `tm_*`)** | ✅ integration | comms-gate fail-closed; OUTBOUND off | ❌ untested for Halo | not in M1 scope unless separately allowlisted |
| **Voice (Vapi)** | ✅ integration | comms-gate fail-closed | ❌ untested | out of M1 scope |
| **Video (Tavus)** | ✅ integration | comms-gate fail-closed | ❌ untested | out of M1 scope |

External-send recipient allowlist for the tested email channel = `duanekwells@gmail.com` only; durable, idempotent
(re-run refuses). **No customer outbound. No autonomous action.**

---

## 4. Smallest isolated-dev work to close M1 (no M2–M4, no customer outbound, no autonomous action)
1. **GAP #1 — native→catalog wiring — DONE (isolated dev, uncommitted).** `resolveNativeMetricValues` merged into
   `resolveMetricValues`. **Supported now:** `gross.total_sum` (dealership_performance TOTAL, provenance-backed) and the
   four `appt.*` rates (`show/no_show/confirmed/cancel`) from the **single appointments family** on `ap.total>0`, 0..1,
   missing≠zero. **Withheld by contract:** `roi.total_leads`/`roi.sold_from_leads` (Dashboard vs Lead Source ROI
   divergence — needs a governed Lead Source ROI reader), `roi.duplicate_rate`, `gross.reconciliation_mismatches`
   (needs per-deal CRM Sales Gross), `cage.*`, `comm.*`. Tenant isolation, governed period, units, spaced/XLSX headers all
   preserved (inherited from the accepted reader). Tests: `src/test/metric-values-native.test.ts` (6). Real evidence:
   Honda 5 slugs, Nissan gross only, Ford empty.
   - **Follow-on:** build a **governed Lead Source ROI native reader** to unlock the ROI slugs; add catalog-slug goldens
     for cross-side agreement (Gap #4).
2. **Support manifest — DONE (Part A).** `src/server/watchdog/halo-support-manifest.ts` (v1.1.0): all 19 slugs with
   definition/formula, unit, grain, source family/fields, period rule, governance-supplied **295 anchors** (SW-###, with
   honest closest/primitive/none labels), support state, and exact withheld reason. `cage.*` corrected to
   **Enterprise Performance / CAGE**; each `appt.*` names its single numerator flag. Tests: `halo-manifest-and-layers.test.ts`.
3. **GAP #2 — three-layer evaluator — DONE (Part B).** `src/server/reports/halo-three-layer.ts` emits separate
   **current / industry / baseline** states. Industry is **NON-SCORING** everywhere (no clean, definition-compatible
   benchmark): `appt.show_rate`/`appt.no_show_rate` carry a **directional, non-scoring** range with
   source_url/type/confidence/**source_published_or_updated + verified_on (2026-08-28)**/**definition_compatibility=incompatible** (Foureyes defines show = shows÷SET;
   Studio = shows÷ROWS; the 2025-05-06 Foureyes page is a SET-rate study); all else `no_benchmark`. Baseline: `<3`
   periods → `insufficient_history`; **≥3 identical periods → `zero_variance` (distinct, non-scoring)**; never a score/zero.
4. **GAP #3 — conversation weakness — DONE (Part D matrix).** Studio hub = unavailable (0 threads, all 3);
   Vin Communication Log = provisional Honda patterns (no stable IDs; not a 3-store governed feed) — see §2.
5. **Provenance-backed goldens — DONE (Part C).** `halo-m1-proof.test.ts`: Honda 5 slugs + governed period,
   Nissan gross only, Ford empty; inert Vin-metric alert via the real app path (dispatch disabled).

### M1 acceptance definition (scope-corrected) — CLOSED
**M1 acceptance = the supported subset (`gross.total_sum` + four `appt.*`, plus the 3 hub `engagement.*`) processed
correctly at Codex QC and Studio, WITH explicit withheld/unavailable states for everything else.** Built and green in
isolated dev.

**M1 closure step — COMPLETED (2026-08-28): independent Codex QC ↔ Studio sign-off ACCEPTED.** Codex reran
15 focused files / 98 tests (all passed) and independently read the three profiles; wired catalog-slug values +
withheld states agree cross-side (Honda gross 12240.78 + four appt rates w/ exact accepted checksums/period; Nissan
gross 5263.6 only; Ford empty/withheld). **M1 is CLOSED in isolated dev.**

**Reclassified as FOLLOW-ONS (NOT M1 blockers):**
- A **governed Lead Source ROI native reader** — future **metric expansion** (unlocks the withheld ROI slugs), not an
  M1 completion gate; ROI stays explicitly withheld in M1.
- **Surfacing the three-layer evaluator in the report UI** — belongs to **M2** report-card presentation (the evaluator
  is a pure API/module now, already test-covered; a UI render is not required for M1 unless a current API test needs it).

**Not in M1:** M2 report-card + AI narrative; M3 Halo Presence; M4 monthly production circuit — all deferred/
not authorized. No deploy/merge/schedule/service change/production/dealer-data mutation.
