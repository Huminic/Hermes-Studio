# Phase 0 — Honda identity, scope, timezone, and boundary pin

**Pinned at (UTC):** 2026-09-02T03:25:49Z
**Branch / HEAD:** `codex/halo-295-unshrinkable-inputs` @ `9ac76c58beec657b132a1f30130a41c0a4a270b8`
**Authority:** GOAL line 1; SPEC lines 3–6, §3, §4, §5.2; `SCHEMA_CONTRACT.md` §0.
**Scope of this file:** pin the fixed identity/scope/timezone facts only. No per-metric definitions authored (Phase 0 rule).

## 1. Pilot identity (machine facts)

| Field | Value | Source |
|---|---|---|
| Dealer name | Serra Honda of Sylacauga | GOAL l.1; SPEC l.4 |
| VinSolutions Dealer ID | `21043` | SPEC l.4; SCHEMA_CONTRACT §0 tenant table |
| Studio profile slug | `serra-honda` | SPEC l.4; SCHEMA_CONTRACT §0 |
| Brand | Honda (Sales only) | GOAL l.9 |
| Catalog | exactly 295 conditions `SW-001`..`SW-295` | SPEC l.5; validator PASS (`03_...json`) |

Cross-check (read-only reference only; NOT in Honda Sales scope): the platform registry also
governs `serra-nissan` (`21044`) and `tony-serra-ford` (`21047`). Those are out of scope for
this Honda goal — **No Nissan/Ford** (GOAL l.19). They appear here only to document that the
tenant registry is one-row-per-rooftop and the Honda binding is exact.

## 2. Permanent boundary (Sales-only)

- **Sales only.** Service and Parts belong exclusively to the separately governed **combined
  Serra Service workspace** and must never enter any accepted Honda Sales definition, landing
  area, source artifact, Brain record, transformation, observation, narrative, grade, finding,
  or report. (SPEC l.6, l.9; GOAL l.9; SCHEMA_CONTRACT §0.)
- **Combined Service model.** Service is combined across the three Serra stores into ONE Serra
  Service workspace; Sales profiles are Sales-only by design. A Sales report carrying
  Service/Parts is a scheduled-report misconfiguration, and the consumer quarantines it whole.
  (SCHEMA_CONTRACT §0.)
- **Separate-Service overlay (18 IDs).** Exactly:
  `SW-079, SW-081, SW-083, SW-115, SW-118, SW-199, SW-222, SW-223, SW-224, SW-225, SW-226,
  SW-227, SW-228, SW-229, SW-263, SW-270, SW-279, SW-294`. (SPEC §3.)
  Validated machine-side in `03_catalog_module_overlay_checks.json`: 18 unique IDs, all in the
  295 catalog, each owned by exactly one module (SW-199 → module 7; SW-263 → module 11; the
  other 16 → module 10). These IDs receive internal disposition only and **no** Honda Sales
  value, narrative, grade, finding, or opportunity claim; the customer appendix projects each
  only as ID + neutral "separately governed domain" label + no value. (SPEC §3, §4 module 10.)

## 3. Timezone / calendar

| Concern | Rule | Source |
|---|---|---|
| Dealer business calendar | `America/New_York` | SCHEMA_CONTRACT_BROWSER_EXTENSION rule 2; SPEC §5.2 |
| Browser export timestamps | native UTC; convert UTC→local **before** window bucketing | BROWSER_EXTENSION rule 2 |
| Native XLSX period | from Filters `Date Range Begin`/`End` (or `period_hint`) | SCHEMA_CONTRACT §3 |
| Conversion direction caveat | near-midnight UTC can only move to the **prior** local day | BROWSER_EXTENSION rule 2 (Codex 2026-08-26 correction) |

Note: the current gate5b prototype artifact records accepted period `2026-08-24..2026-08-30`
and displays timezone-agnostic weekly periods; the `America/New_York` calendar is the governing
rule for all future period bucketing per the contracts above.

## 4. Phase 0 prohibitions honored

No VinSolutions / Gmail / network / schedule / ingest / CRM / production / recipient access was
performed to produce this file. All facts are transcribed from pinned local authority documents
and the deterministic validator output.
