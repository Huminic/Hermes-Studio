# Honda Semantic Watchdog — Phase 0 evidence packet

**Phase 0 = recover and pin current truth.** No per-metric definitions, no acquisition, no ingest,
no schedule/product/schema/production/external change. Serra Honda of Sylacauga (`serra-honda`,
dealer `21043`), catalog `SW-001..SW-295`.

**Pinned on:** branch `codex/halo-295-unshrinkable-inputs` @ `9ac76c58beec657b132a1f30130a41c0a4a270b8`
(MAIN). INGEST read-only reference @ `4c41df11dc48c3bc954ffdd45cdf125b2d67c2d5`.

## Contents

| File | What it pins |
|---|---|
| `01_authority_source_hashes.json` | Authority/source content-sha256 + git-blob ids + byte-equivalence proof |
| `02_honda_identity_scope_timezone.md` | Honda identity, Sales-only boundary, 18-ID Service overlay, America/New_York |
| `03_catalog_module_overlay_checks.json` | **Generated** machine-check: 295 catalog / 11-module exactly-once / 18-ID overlay (overall_pass=true) |
| `04_repo_state_and_rollback.md` | Both repos' HEAD/branch/status/toolchain/lockfile, test baseline, rollback, INGEST dirty-file quarantine |
| `05_capability_ledger.json` | Per-claim state / evidence_ref / commit / path / hash / verified_at / reproduction_result |
| `06_schedule_source_fingerprints.md` | Six native circuits + Response Times; accepted vs whole-delivery quarantine |
| `07_vault_vs_brain_topology.md` | Pre-admission vault vs admitted Honda landing/Brain; contaminated-bytes-cannot-promote proof |
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
  measured-unscored.
- Contaminated bytes **cannot** be promoted (code guard `validation_state=='held'`; 15/15 tests
  reproduced 2026-09-02).
- Items needing prohibited access are labeled `reported_pending_phase0_verification`; vault
  access/retention policy is `UNRESOLVED`.

## Boundaries honored

VinSolutions/Gmail not accessed; no schedule run/resend/edit; no ingest; no change to product
code, schemas, production, recipients, alerts, customers, or external systems. INGEST
`src/routeTree.gen.ts` neither touched nor absorbed.
