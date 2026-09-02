# Honda Semantic Watchdog — Phase 0 evidence packet

**Phase 0 = recover and pin current truth.** No per-metric definitions, no acquisition, no ingest,
no schedule/product/schema/production/external change. Serra Honda of Sylacauga (`serra-honda`,
dealer `21043`), catalog `SW-001..SW-295`.

**Pinned on:** branch `codex/halo-295-unshrinkable-inputs` @ `9ac76c58beec657b132a1f30130a41c0a4a270b8`
(MAIN). INGEST read-only reference @ `4c41df11dc48c3bc954ffdd45cdf125b2d67c2d5`.

**Shadow-correction revision (2026-09-02, parent `321487ac0`):** amended per impartial-shadow HOLD
items 1–5 — pinned the full active objective (`../../../planning/HONDA_SEMANTIC_WATCHDOG_ACTIVE_OBJECTIVE.md`,
sha256 `7c8e622b44308090baf494efb120880950a125cd7ba9174f2514ff30f7acaf0d`) with its added
requirements reconciled below; pinned a concrete vault policy (enforcement nonconforming, no runtime
perm change); completed per-family schedule fingerprints; corrected the Communication zero-real-row
fact; split manual-only capabilities. A second narrowed re-review corrected the Communication "28"
parser-artifact explanation and the receipt vault-policy status.

**Phase 0 verdict: PASS (binding).** The impartial shadow (non-author, non-deployer) returned a
binding **PASS** at evidence commit `92babbde53ce4e1062bb36eece2b786e6cee457a` (memorialized
2026-09-02T04:19:07Z; see `10_phase0_gate_receipt.md`). Phase 0 (recover and pin current truth) is
complete. This PASS is **pinning only** — it does not authorize Phase 1 and does not relax any
downstream gate; all downstream gates and carried-forward conditions (e.g. Gate 3 Hidden Lead Intent
C-04; vault enforcement Phase 3 gate C-02; C-03/C-05/C-06/C-07/C-10/C-11) remain **enforceable**.

## Objective reconciliation (active objective added requirements)

The pinned active objective supersedes/extends the shorter execution goal. Its added requirements are
recorded as downstream obligations (Phase 0 pins them; it authors/executes none): PE-grade
multimodal + blue-collar-readable customer report; deep supporting-data index across the 200+/295
metrics; explain how data was used + disclose confidence where it varies; temporal/further-evaluation
follow-up; candidate intake for useful data beyond the fixed 295 (err toward inclusion); and
impartial-watchdog consultation before each phase/milestone. Carried in
`09_conflict_register.json` C-10 and `01_authority_source_hashes.json` (`active_objective`).

## Contents

| File | What it pins |
|---|---|
| `01_authority_source_hashes.json` | Authority/source content-sha256 + git-blob ids + byte-equivalence proof |
| `02_honda_identity_scope_timezone.md` | Honda identity, Sales-only boundary, 18-ID Service overlay, America/New_York |
| `03_catalog_module_overlay_checks.json` | **Generated** machine-check: 295 catalog / 11-module exactly-once / 18-ID overlay (overall_pass=true) |
| `04_repo_state_and_rollback.md` | Both repos' HEAD/branch/status/toolchain/lockfile, test baseline, rollback, INGEST dirty-file quarantine |
| `05_capability_ledger.json` | Per-claim state / evidence_ref / commit / path / hash / verified_at / reproduction_result |
| `06_schedule_source_fingerprints.md` | Complete per-family fingerprints (base report/saved name/subject/cadence+ET time/Guinan recipient/period rule/format/state/source hashes) + Communication zero-real-row correction + Response Times |
| `07_vault_vs_brain_topology.md` | Pre-admission vault vs admitted Honda landing/Brain; contaminated-bytes-cannot-promote proof; **pinned vault policy (enforcement nonconforming → Phase 3 gate)** |
| `08_architecture_ownership_notouch_map.md` | MAIN vs INGEST ownership; canonical branch; roles; production no-touch inventory |
| `09_conflict_register.json` | Conflicts/open conditions with owner/next-action/freshness (0 Phase-0-blocking) |
| `10_phase0_gate_receipt.md` | Mechanical gate PASS; impartial-shadow approval PENDING |

Validator (regenerates `03_…json` deterministically):
`python3 scripts/halo-phase0/validate_phase0_catalog.py`

## Key results

- Catalog **295/295** unique+contiguous; 11 modules cover every ID **exactly once**; overlay is
  **exactly 18** IDs (modules 7/10/11), each Sales-excluded. Validator `overall_pass=true`.
- MAIN Phase 0 branch is **clean**; the only dirty state is the unrelated INGEST
  `src/routeTree.gen.ts` — **quarantined, not touched**.
- Honda native families: **3 HELD** (Gross, Appointments, Dashboard) / **3 QUARANTINED**
  (ROI, CAGE, Communication — hidden Lead Intent Parts/Service). None promoted. Response Times =
  measured-unscored (manual Mon 07:45 ET browser checkpoint, not a scheduled email).
- **Communication (`Report-5649.xlsx`) has zero real data rows** (sheet `Report` A1:O3 = title +
  15 headers + one "no data" notice); the anchor's `data_row_total=28` is a parser/counting
  artifact, not 28 records. Delivery is also whole-delivery quarantined (hidden Lead Intent). Both
  facts preserved (06 §2; C-12).
- Contaminated bytes **cannot** be promoted (code guard `validation_state=='held'`; 15/15 tests
  reproduced 2026-09-02).
- **Capability splits (item 5):** raw delivery persistence = `implemented_manual_only` (writer
  invoked only by the manual dev CLI, not runtime-wired); native readers split — MAIN readers
  `implemented_wired` to MAIN workflows, INGEST six-family readers `implemented_manual_only` (no
  implied cross-repo wiring).
- Items needing prohibited access are labeled `reported_pending_phase0_verification`; vault
  access/retention **policy is now PINNED** with current **enforcement NONCONFORMING** (carried as a
  Phase 3 admission gate, C-02).

## Boundaries honored

VinSolutions/Gmail not accessed; no schedule run/resend/edit; no ingest; no change to product
code, schemas, production, recipients, alerts, customers, or external systems. INGEST
`src/routeTree.gen.ts` neither touched nor absorbed.
