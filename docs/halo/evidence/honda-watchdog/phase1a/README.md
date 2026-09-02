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

Machine-enforceable schema (item 3/4/5/6): `docs/halo/contract/phase1/record-schemas.json` —
JSON-Schema-like definitions for `metric_row`, the 3 sub-contracts, `packet` + nested contracts,
`source_node`, `candidate` (type/enum/const/pattern/format/items/minItems/required/
additionalProperties=false/$vocab/$ref).

Validator (item 8): `scripts/halo-phase1/validate_phase1_contracts.py` — a **generic recursive
JSON-Schema engine** that validates instances against `record-schemas.json`, plus explicit
cross-record invariants (module ownership, overlay strictness, disposition↔evaluation +
disposition↔source_existence consistency, SIP/GNA rules, registered source/candidate-ID resolution +
frozen-catalog membership, source_existence↔acquisition pair matrix, exact stop inheritance,
machine-semantic blast-radius + vault gate). Mutations are generated **recursively** from the schemas
(drop each required field at any depth; inject a violation at each leaf): **956 self-tests** plus
**52 named probes** (reviewer-reproduced false positives + real-ISO-datetime, protected-content
abstention, crash-resistance, anti-tautology, shadow adversarial, and fresh cases) plus a **recursive
crash-fuzz over a finite stated universe of 2118** (every reachable nested path × 12 hostile JSON
values + hostile-item appends into every list) with **0 exceptions** (counted separately from expected
semantic rejections).

**Relational Phase 0 anchor (complete):** canonical stops / blast-radius / vault-gate are **derived**
from `phase0-derived-authority.json`. All **11** vault/blast fields are bound to an **independent
validator-side `EXPECTED_BINDINGS`** (value + role-specific phrase); the authority binding metadata
must equal that constant **before** dereference, so a swapped value + co-mutated `equals`/`phrase`
cannot self-validate. Each bound value must equal the expected and its role phrase must appear
literally in the immutable Phase 0 07/09 + SPEC (`` `0700` on directories ``/`` `0600` on files `` +
"fail closed" in 07; `NONCONFORMING` + "Phase 3 admission gate" in 09; blast phrases in SPEC).
Canonical stops are the **exact 11 key→phrase pairs** (unique; renamed-key-with-retained-phrase and
duplicate-key reject). Machine key identifiers are integrity-pinned by `AUTH_SHA`; their values are
relationally bound. Shadow probes 41–47 all reject with unchanged Phase 0/SPEC.
Real calendar-valid tz-aware ISO parsing. Reproduce:
`python3 scripts/halo-phase1/validate_phase1_contracts.py --no-write`.

## Evidence (`docs/halo/evidence/honda-watchdog/phase1a/`)

| File | What it pins |
|---|---|
| `01_phase1a_contract_manifest.json` | sha256 of every contract/validator/amendment/checks artifact + scope statement |
| `02_phase1a_gate_receipt.md` | Gate criteria P1A.1–P1A.9 (mechanical PASS), tests, independent verification, rollback, approval PENDING |
| `PHASE1A_CONTRACT_CHECKS.json` | Deterministic validator output (structure PASS, vocab PASS, phase0_authority_derived=true, 956/956 self-tests, 52/52 named probes, crash-fuzz universe 2118 / 0 exceptions, 11 relational bindings) |
| `../../../contract/phase1/phase0-derived-authority.json` | Machine-readable Phase 0/SPEC authority payload; canon/blast/vault derived from it after relational verification against immutable Phase 0 |

## Result

- Structure **295/11/18 preserved**; six closed vocabularies frozen; disposition amended to 8 with
  the approved nonterminal `source_investigation_pending` (restricted transitions; no direct
  acquired/measured).
- Generic recursive validator + **956/956 self-tests + 52/52 named probes PASS + recursive crash-fuzz
  (universe 2118, 0 exceptions)**; deterministic; imports the Phase 0 map so 295/11/18 cannot drift.
- Canon/blast/vault semantics are **relationally derived** from immutable Phase 0 authority; the
  adversarial co-mutation test confirms code+contract weakening fails while Phase 0 is unchanged.
- Independent non-author re-verification: **PASS on all checks** across prior rounds, including fresh
  malformed instances built by the reviewer — all rejected (enforcement generalizes).
- **No metric rows or packets authored** (Phase 1 remains design-only).

**Re-review history:** `60c519966` HOLD (too shallow) → `59e97d289` HOLD (accepted 17 malformed,
example-based) → `a57c5aa13` HOLD (4 issues + canonical anti-tautology) → `e9d315428` HOLD (incomplete
crash-resistance + non-relational anchor) → this packet completes crash-resistance (recursive fuzz,
type-guarded roots/collections) and makes the Phase 0 anchor relational (see
`02_phase1a_gate_receipt.md` §Fourth shadow re-review correction).

**Mechanical checks PASS; overall Phase 1A is HOLD pending impartial-shadow re-review.** This gate
does not authorize Phase 1B/2+; downstream gates and fail-closed stops remain enforceable.

## Boundaries honored

VinSolutions/Gmail not accessed; no schedule/ingest/DB-schema/product/runtime/production/recipient/
customer change; no values or grades computed. The reviewed SPEC and the 295 matrix are unchanged.
INGEST `src/routeTree.gen.ts` neither touched nor absorbed.
