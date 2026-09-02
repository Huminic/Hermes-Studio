# Honda Semantic Watchdog — Phase 1A evidence packet

**Phase 1A = freeze/amend planning contracts and build machine validators BEFORE authoring any
metric definitions or packets.** Design-only. No metric rows populated; no packet authored. No
values/grades, Vin/Gmail, ingest, product/runtime/DB-schema, schedules, production, recipients, or
customer changes.

**Built on:** branch `codex/halo-295-unshrinkable-inputs` @ parent `df70a8a1c` (Phase 0 PASS
binding, memorialized). Authoritative catalog `semantic-watchdog-feasibility-matrix-295.json`
(`29c7ac06…`) and reviewed SPEC (`fedd957b…`) are **unchanged**.

## Frozen contracts (`docs/halo/contract/phase1/`)

| File | Item | Freezes |
|---|---|---|
| `frozen-vocabularies.json` | 1+2 | Six closed vocabularies + transition invariants; disposition amended to 8 with nonterminal `source_investigation_pending` |
| `metric-row-schema.json` | 3 | Per-metric row schema + separate versioned detection/comparison/grade sub-contracts |
| `packet-schema.json` | 4 | Execution packet (one module; 5–12 IDs or reason; two-delta; exact partitions) |
| `source-registry-dag-schema.json` | 5 | Source registry + acquisition DAG (dedupe key; no per-metric duplicate acquisition) |
| `beyond-295-candidate-intake-schema.json` | 6 | Separate candidate registry; cannot alter the 295 |
| `fail-closed-stops.json` | 7 | 11 canonical fail-closed stops + blast-radius rule |

Amendment (`docs/halo/planning/`): `HONDA_SEMANTIC_WATCHDOG_SPEC_AMENDMENT_001.md` (item 1) — additive
amendment of SPEC §3; the reviewed SPEC bytes are unchanged so the Phase 0 authority hash stays
valid.

Validator (item 8): `scripts/halo-phase1/validate_phase1_contracts.py` — reuses the Phase 0 module
map (295/11/18 single source of truth), proves vocab closure, and runs 29 synthetic self-tests
across all rule classes (schema, partition, state transitions, formula, threshold/reference/target
separation, DAG dedupe, privacy/PII, two-delta, candidate-intake, change-scope). Reproduce:
`python3 scripts/halo-phase1/validate_phase1_contracts.py --no-write`.

## Evidence (`docs/halo/evidence/honda-watchdog/phase1a/`)

| File | What it pins |
|---|---|
| `01_phase1a_contract_manifest.json` | sha256 of every contract/validator/amendment/checks artifact + scope statement |
| `02_phase1a_gate_receipt.md` | Gate criteria P1A.1–P1A.9 (mechanical PASS), tests, independent verification, rollback, approval PENDING |
| `PHASE1A_CONTRACT_CHECKS.json` | Deterministic validator output (structure PASS, vocab PASS, 29/29 self-tests) |

## Result

- Structure **295/11/18 preserved**; six closed vocabularies frozen; disposition amended to 8 with
  the approved nonterminal `source_investigation_pending` (restricted transitions; no direct
  acquired/measured).
- Validator + **29/29 self-tests PASS**; deterministic; imports the Phase 0 map so 295/11/18 cannot
  silently drift.
- Independent non-author verification: **PASS on all checks, no inconsistencies**.
- **No metric rows or packets authored** (Phase 1 remains design-only).

**Mechanical checks PASS; overall Phase 1A is HOLD pending impartial-shadow review.** This gate does
not authorize Phase 1B/2+; downstream gates and fail-closed stops remain enforceable.

## Boundaries honored

VinSolutions/Gmail not accessed; no schedule/ingest/DB-schema/product/runtime/production/recipient/
customer change; no values or grades computed. The reviewed SPEC and the 295 matrix are unchanged.
INGEST `src/routeTree.gen.ts` neither touched nor absorbed.
