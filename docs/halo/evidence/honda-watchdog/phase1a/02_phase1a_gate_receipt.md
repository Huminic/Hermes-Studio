# Phase 1A gate receipt — Honda Semantic Watchdog

**Issued at (UTC):** 2026-09-02T04:32:44Z
**Branch / parent HEAD:** `codex/halo-295-unshrinkable-inputs` @ `df70a8a1c` (Phase 0 PASS memorialized).
**Scope:** Phase 1A only — **freeze/amend planning contracts and build machine validators BEFORE
authoring any metric definitions or packets.** Design-only. No metric rows populated; no packet
authored. No values/grades, Vin/Gmail, ingest, product/runtime/DB-schema, schedules, production,
recipients, or customer changes. INGEST `src/routeTree.gen.ts` untouched.

## Gate criteria — mechanical evaluation

| # | Criterion (item) | Result | Evidence |
|---|---|---|---|
| P1A.1 | SPEC disposition vocabulary amended with 8th **nonterminal** `source_investigation_pending` exactly as approved (item 1) | **PASS** | `HONDA_SEMANTIC_WATCHDOG_SPEC_AMENDMENT_001.md` + `frozen-vocabularies.json` disposition (8 values; required fields owner/finite_investigation/evidence_as_of/review_point; gradable=false; no value/grade/narrative/customer projection; restricted targets; no direct acquired/measured) |
| P1A.2 | Six closed vocabularies + transition invariants frozen **separately** (item 2) | **PASS** | `frozen-vocabularies.json` — boundary_class, disposition, source_existence_state, metric_evaluation_state, acquisition_admission_state, report_acceptance_state (each `closed:true`) |
| P1A.3 | Metric-row schema frozen (definition_version…confidence/explainability/evidence-index + 3 separate versioned threshold/reference/target sub-contracts) (item 3) | **PASS** | `metric-row-schema.json` (required_fields + sub_contracts + cross_field_invariants). No rows authored |
| P1A.4 | Packet schema frozen (one module; 5–12 IDs or reason; mgmt question; prereqs; source deps; admission/transform/persist/test/report-fragment; inherited+specific stops; two-delta) (item 4) | **PASS** | `packet-schema.json`. No packet authored |
| P1A.5 | Source registry/DAG schema frozen (dedupe key (profile,family,period,schema_revision); no per-metric duplicate acquisition; source→metric fan-out) (item 5) | **PASS** | `source-registry-dag-schema.json` |
| P1A.6 | Separate beyond-295 candidate-intake schema; cannot alter the 295 (item 6) | **PASS** | `beyond-295-candidate-intake-schema.json` (CAND-#### key; hard invariants) |
| P1A.7 | Canonical fail-closed stops defined; one source failure blocks only dependent IDs (item 7) | **PASS** | `fail-closed-stops.json` (11 stops + blast_radius_rule) |
| P1A.8 | **Schema-driven** validator + exhaustive mutation self-tests for 295/11/18 + per-field/enum/pattern/conditional (metric rows, 3 sub-contracts, packets, source/DAG, candidates) + transitions/context-receipts/stops/partitions/DAG/privacy/two-delta/change-scope; **no metric rows/packets populated** (item 8) | **PASS** | `validate_phase1_contracts.py` → `PHASE1A_CONTRACT_CHECKS.json`: structure PASS, vocab PASS, **201/201 self-tests + 5/5 named malformed probes reject**, overall_pass=true |
| P1A.9 | Design-only boundary honored | **PASS** | Only additive docs/contracts/validator/evidence written; catalog `29c7ac06…` unchanged; reviewed SPEC `fedd957b…` unchanged; INGEST routeTree ` M` untouched |

## Shadow re-review correction (impartial Phase 1A HOLD → deepened)

The first Phase 1A submission (commit `60c519966`) was returned **HOLD: validator materially too
shallow**. This receipt reissues Phase 1A with a deepened, **schema-driven** validator. The ten
required fixes are all implemented:

1. Schema-driven exhaustive enforcement of every required field/type/pattern/enum/conditional for
   metric rows, packets, source nodes/DAG, and candidates (loops over the contract field sets — not
   selected fields). A sparse SIP row now rejects on all missing fields.
2. `finite_investigation_ref` added to the metric schema and required for `source_investigation_pending`.
3. `affirmative_investigation_evidence_ref` added and required for `genuinely_not_available`.
4. Packet validator rejects absence of `packet_id`, `management_question`, `prerequisites`,
   `source_dependencies`, admission/transform/persist/test/report-fragment contracts (each nested
   key), and packet-specific stops.
5. Source validator enforces source_id/type/existence+admission states/provenance_ref/
   sales_only_receipt; candidate validator enforces all required fields.
6. The three detection/comparison/grade objects are fully validated (all fields/enums/IDs/versions),
   always required, proven independent (distinct IDs); scoring requires an **approved + active +
   compatible** grade target.
7. Transition adjacency frozen and enforced for `source_existence_state` and
   `metric_evaluation_state`; SIP→outside_sales_domain requires a `boundary_correction_ref` receipt
   and SIP/…→genuinely_not_available requires an `affirmative_investigation_evidence_ref` receipt
   (machine context receipts, not prose).
8. Closed `calculation_kind` (count/rate/duration/currency/direct/semantic) with conditional required
   population/direct-fields/formula/numerator/denominator/window/unit and explicit
   `null_missing_behavior` + `zero_denominator_behavior`.
9. `fail-closed-stops.json` frozen at exactly 11 canonical names/count with a `canonical_stop_names`
   list; packets must inherit it **exactly** and mechanically inherit the Phase 0 vault-policy
   nonconformance admission gate (C-02).
10. Source DAG contradiction resolved: separate `dependent_metric_ids` (SW only) vs
    `dependent_candidate_ids` (CAND only), validated disjoint.

Mutation tests cover **every** required field/conditional/vocab/transition/context-receipt/stop/
partition/DAG/candidate rule (201 self-tests), plus five named malformed probes that must reject
(sparse SIP metric, GNA missing affirmative evidence, sparse packet, sparse source, sparse candidate)
— independently reproduced.

## Tests run (read-only / deterministic)

- `python3 scripts/halo-phase1/validate_phase1_contracts.py --no-write` → **RESULT: PASS** (exit 0); `structure_295_11_18=PASS`, `vocab_closure=PASS`, `self_tests_total=201`, `self_tests_failed=0`, `named_probes_total=5`, `named_probes_failed=0`.
- `python3 scripts/halo-phase0/validate_phase0_catalog.py --no-write` → **PASS** (295/11/18 preserved; generated `03` unchanged).
- JSON parse: all six `docs/halo/contract/phase1/*.json` + `01_phase1a_contract_manifest.json` + `PHASE1A_CONTRACT_CHECKS.json` load OK.
- Active-objective sha256 unchanged (`7c8e622b…`).
- Diff scope: only new Phase 1A files + the additive SPEC amendment; no existing tracked governance file modified.

## Independent verification (separation of duties — Core Value #5)

A fresh independent agent (read-only, non-author) re-verified the **deepened** contracts and
validator against the files and returned **PASS on all six checks**, explicitly confirming the
validator is schema-driven (mutation harness loops over the contract field sets, not hard-coded
examples), that every reject-test constructs a real mutation of a valid fixture (so passes are
**non-tautological**), that the five named probes each reject with ≥1 error (sparse SIP 44, GNA 1,
sparse packet 25, sparse source 16, sparse candidate 13), that the item-specific deepening rules
(finite_investigation_ref, affirmative_investigation_evidence_ref, calc-kind conditionals, full
sub-contract validation + distinct IDs, approved/active/compatible scoring, source_existence/
metric_evaluation transitions, SIP context receipts, exact stop inheritance + vault gate, DAG SW/CAND
separation) are each enforced, and that the 295 matrix, EXECUTION_SPEC, and INGEST routeTree are
unchanged. (An earlier independent review covered the prior shallower submission `60c519966`.)

## Rollback

All Phase 1A writes are **additive**: new files under `docs/halo/contract/phase1/`,
`scripts/halo-phase1/`, `docs/halo/evidence/honda-watchdog/phase1a/`, and one additive planning
amendment `docs/halo/planning/HONDA_SEMANTIC_WATCHDOG_SPEC_AMENDMENT_001.md`. **No existing tracked
file is modified.** Rollback = `git reset --hard df70a8a1c` (undo the Phase 1A commit) or remove the
new directories/amendment file. The reviewed SPEC and the 295 matrix are unchanged, so Phase 0
evidence remains valid.

## Separation of duties / approval

- **Implementation:** Phase 1A design writer (author).
- **Independent code-fact verification:** fresh non-author agent — result recorded above.
- **Governance approval:** the **impartial shadow** (non-author, non-deployer) must review this
  pinned Phase 1A packet and issue the binding PASS/HOLD. **Approval state: PENDING impartial-shadow
  review.** Mechanical checks PASS; the author does not self-approve.

## Prohibited-action confirmation

No VinSolutions, Gmail, network, schedule, ingest, DB-schema, product/runtime, production,
recipient, or customer action. No values or grades computed. No metric rows or packets authored.
INGEST `src/routeTree.gen.ts` not touched. Writes are additive-only on the clean MAIN branch.
