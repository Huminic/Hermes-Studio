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
| P1A.8 | **Generic recursive JSON-Schema engine** (`record-schemas.json`) + cross-record invariants; recursively-generated mutations for every field at every depth (metric rows, 3 sub-contracts, packets + nested contracts, source/DAG, candidates) + transitions/context-receipts/stops/partitions/DAG/privacy/two-delta/change-scope; **no metric rows/packets populated** (item 8) | **PASS** | `validate_phase1_contracts.py` → `PHASE1A_CONTRACT_CHECKS.json`: structure PASS, vocab PASS, **956/956 self-tests + 58/58 named probes reject + recursive crash-fuzz (universe 2118, 0 exceptions) + 11 relational bindings enforced (strict type+value)**, overall_pass=true |
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

## Second shadow re-review correction (still-HOLD → generic recursive engine)

The second submission (`59e97d289`) remained **HOLD**: the validator still accepted 17 malformed
contracts because enforcement was example-based rather than generic. This receipt reissues Phase 1A
with the example-checks **replaced by a generic recursive JSON-Schema-like engine**:

- **`record-schemas.json`** — machine-enforceable definitions for `metric_row`, the three
  sub-contracts, `packet` + all nested contracts, `source_node`, and `candidate`, with
  `type / enum / const / pattern / format(semver|iso_datetime) / items / minItems / nonempty /
  properties / required / additionalProperties=false / $vocab / $ref`.
- **Generic engine** `validate_instance()` interprets those definitions recursively; **unknown
  properties are rejected** (`additionalProperties=false`), so a SIP row carrying value/grade/
  narrative rejects, and no value/grade/narrative field exists for any pending metric.
- **Cross-record invariants**: module ownership; Service-overlay strictness (SW-079… must be
  `separate_serra_service` / `outside_sales_domain` / `proved_outside_sales_domain` / `gradable=false`
  / `not_measured` / appendix-only); full `disposition↔evaluation_state` and
  `disposition↔source_existence` consistency; SIP `evaluation_state=not_measured`, no customer
  projection; registered source-ID and candidate-ID resolution + frozen-catalog membership for
  `dependent_metric_ids`/`related_sw_id`; the `source_existence↔acquisition_admission` allowed-pair
  matrix; exact stop inheritance; and **machine-semantic** blast-radius + vault-gate booleans/consts
  (weakened/empty rejects).
- **Mutations generated recursively** from the schemas (drop each required field at any depth; inject
  a type/enum/pattern/format/const violation at each leaf): **784 self-tests**. All **17**
  reviewer-reproduced false positives now reject, plus an independent non-author agent constructed
  fresh malformed instances (unknown property, `module=99`, short `inherited_canonical`, bad enum,
  string boolean) — all rejected, confirming enforcement generalizes beyond the fixtures.

## Third shadow re-review correction (still-HOLD → 4 narrow fixes + canonical anti-tautology)

The third submission (`a57c5aa13`) remained **HOLD** on four narrow issues plus a fifth
anti-tautology finding. All fixed:

1. **Real ISO datetime.** `evidence_as_of` is validated by actual calendar-valid, **timezone-aware**
   `datetime` parsing (rejects `2026-13-40T25:61:61Z` and naive timestamps), not regex shape.
2. **Protected-content abstention.** `measured_abstained` is enforced **iff** `protected_content=true`
   + `sensitivity_class=protected_content` + `protected_content_envelope_ref` present +
   `envelope_authorization=approved` (new schema fields); `data_acquired_calculation_pending +
   measured_abstained` rejects when any is false/none/unapproved.
3. **Crash-resistance.** `$vocab`/enum resolution type-checks before membership, so `[]`/`{}`/non-string
   values fail closed with a validation error, **never a TypeError**. Cross-record checks and the DAG
   dedupe key are hardened. Five crash-resistance probes confirm **0 crashes**.
4. **Anti-tautology (blast-radius + vault-gate).** Both are compared against **immutable validator
   constants** (`BLAST_CONST`/`VAULT_CONST`) — not read from `fail-closed-stops.json` — and the
   contract's embedded `*_expected` blocks are additionally checked against those constants, so
   weakening the actual **and** its embedded expected together still rejects.
5. **Anti-tautology (canonical stops).** The 11 canonical stop identifiers are anchored to
   `CANON_CONST` (immutable), so a wholesale rename in the contract (even internally consistent)
   rejects. Additionally, the validator hard-anchors to **immutable Phase 0 authority hashes**
   (`07_vault_vs_brain_topology.md` `9d3bb628…`, `09_conflict_register.json` `0357992b…`) and the
   reviewed SPEC (`fedd957b…`); a change to any breaks the anchor.

Coverage grew to **952 recursive self-tests + 36 named probes** (17 originals + ISO×2, abstention×3,
crash-resistance×5, anti-tautology×4, fresh×5), all rejecting, **0 crashes**.

## Fourth shadow re-review correction (still-HOLD → complete crash-resistance + relational anchor)

The fourth submission (`e9d315428`) remained **HOLD** on two material gaps. Both fixed:

1. **Complete crash-resistance.** Every public record ROOT (`validate_metric_row`, `validate_packet`,
   `validate_candidate`, `validate_source_dag`) and every nested collection / set / membership path is
   type-guarded, so arbitrary JSON values return a **validation error, never an exception**. The exact
   reviewer probes now reject cleanly: `validate_metric_row([])`, `validate_packet(None)`,
   `validate_candidate([])`, `validate_source_dag([[]])`, packet `source_dependencies=[{}]`, partitions
   `accepted_measured_ids=[{}]`. A **recursive crash-fuzz** mutates **every reachable nested
   dict-key/list-index path** of each valid fixture to 12 hostile JSON values, appends hostile
   (unhashable) items into every list incl. empty identifier arrays, and fuzzes the source-dag
   container — a **finite tested universe of 2118** with **0 exceptions**. Exceptions are counted
   **separately** from semantic rejections (which are expected).
2. **Relational Phase 0 anchor.** The canonical stops / blast-radius / vault-gate semantics are no
   longer hard-coded literals. They are **DERIVED** from a machine-readable authority representation
   (`phase0-derived-authority.json`) whose every value is **relationally verified** to appear literally
   in the immutable, hash-pinned Phase 0 evidence — vault modes `` `0700` ``/`` `0600` `` and
   "fail closed" in `07`, `NONCONFORMING` in `09`, and the blast phrases ("blocks only its dependent
   IDs", "cannot block unrelated modules", "prevents final completion") + all 11 stop phrases in the
   reviewed SPEC (§8/§9). **Adversarial test:** co-mutating the authority payload (weakened
   vault→`0777`, blast `blocks_unrelated_modules→true`, or a canonical `spec_phrase` absent from SPEC)
   **fails against the UNCHANGED Phase 0 text** — proving code+contract co-mutation cannot pass while
   Phase 0 authority is unchanged (self-tests `anchor.relational_*`, probes 38–40).

Coverage: **956 recursive self-tests + 45 named probes + a 2118-case recursive crash-fuzz (0
exceptions)**.

## Tests run (read-only / deterministic)

- `python3 scripts/halo-phase1/validate_phase1_contracts.py --no-write` → **RESULT: PASS** (exit 0); `structure_295_11_18=PASS`, `vocab_closure=PASS`, `phase0_authority_derived=true`, `self_tests_total=956`, `self_tests_failed=0`, `named_probes_total=58`, `named_probes_failed=0`, `crash_fuzz.tested_universe=2118`, `crash_fuzz.exceptions=0`, `relational_bindings_enforced=11`.

### Finite relational bindings enforced (named)

Each is bound to an **independent** validator-side `EXPECTED_BINDINGS` entry (value + role-specific
exact phrase), verified against the immutable, hash-pinned Phase 0 07/09 + SPEC; the authority binding
metadata must equal `EXPECTED_BINDINGS` **before** dereference (so a swapped value + co-mutated
`equals`/`phrase` cannot self-validate):

| Binding id | Value | Role phrase (immutable source) |
|---|---|---|
| `vault.required_dir_mode` | `0700` | `` `0700` on directories `` (07) |
| `vault.required_file_mode` | `0600` | `` `0600` on files `` (07) |
| `vault.fail_closed` | `true` | "fail closed" (07) |
| `vault.current_conformance` | `nonconforming` | `NONCONFORMING` (09) |
| `vault.gate_phase` | `phase3_admission_gate` | "Phase 3 admission gate" (09) |
| `vault.status_must_contain` | `NONCONFORMING` | `NONCONFORMING` (09) |
| `blast.one_source_failure_scope` | `dependent_ids_only` | "blocks only its dependent IDs" (SPEC) |
| `blast.blocks_unrelated_modules` | `false` | "cannot block unrelated modules" (SPEC) |
| `blast.blocks_independent_metrics` | `false` | "blocks only its dependent IDs" (SPEC) |
| `blast.rejected_id_blocks_final_completion_only` | `true` | "prevents final completion" (SPEC) |
| `canonical_stops` | exact 11 key→phrase pairs (unique) | each phrase in SPEC §9 |

**Note (precise):** machine key identifiers (snake_case field names, value tokens like
`phase3_admission_gate`/`dependent_ids_only`) are **integrity-pinned** by the authority file sha256
(`AUTH_SHA`); their **values/meanings** are relationally bound to the phrases above. We do not claim
every key literally appears in Phase 0 — only the bound phrases do.

Shadow adversarial probes 41–47 all reject with **unchanged Phase 0/SPEC**: renamed key + retained
phrase; duplicate canonical key; `blocks_independent_metrics=true`;
`rejected_id_blocks_final_completion_only=false`; `current_conformance=conforming`+`gate_phase=none`;
swapped dir/file modes; and **swapped value + co-mutated binding metadata** (rejects via
`authority bindings != independent EXPECTED_BINDINGS`). Probes 48–53 add Python int/bool exactness:
`_relational_derive` uses **strict recursive type+value equality** (`_strict_eq`), so `blocks_unrelated_modules=0`,
`blocks_independent_metrics=0`, `rejected_id_blocks_final_completion_only=1`, `vault.fail_closed=1`, and
integer value+metadata co-mutations all reject (`0` is not `false`, `1` is not `true`).
- `python3 scripts/halo-phase0/validate_phase0_catalog.py --no-write` → **PASS** (295/11/18 preserved; generated `03` unchanged).
- JSON parse: all six `docs/halo/contract/phase1/*.json` + `01_phase1a_contract_manifest.json` + `PHASE1A_CONTRACT_CHECKS.json` load OK.
- Active-objective sha256 unchanged (`7c8e622b…`).
- Diff scope: only new Phase 1A files + the additive SPEC amendment; no existing tracked governance file modified.

## Independent verification (separation of duties — Core Value #5)

A fresh independent agent (read-only, non-author) re-verified this submission and returned **PASS on
all five checks**. Decisively: (a) for crash-resistance, it imported the module from a throwaway copy
outside the repo and ran its **own** hostile inputs — `validate_metric_row({"module":[{}],
"boundary_class":{}})`, `validate_packet({"target_ids":[{}],…})`, `validate_source_dag([{"dependent_
metric_ids":[{}]}])`, `validate_candidate({"boundary_class":[]})` — each returned a **non-empty error
list with NO traceback**, and confirmed `run_fuzz`/`_paths`/`_setpath` recurse into every nested path
(universe 2118, 0 exceptions); (b) for the relational anchor, it confirmed `CANON_STOPS`/`VAULT_SEM`/
`BLAST_SEM` are **derived** at import from `phase0-derived-authority.json` (not literals) and then
**weakened the authority payload in memory three ways** (vault→`0777`, blast `blocks_unrelated_
modules→true`, a canonical `spec_phrase` absent from SPEC) — each returned `derived=None` with the
correct rejection **while the real Phase 0 files were unchanged**, proving code+contract co-mutation
cannot pass. The 295 matrix, EXECUTION_SPEC, and Phase 0 07/09 are unchanged (hashes match the pins);
INGEST routeTree is ` M` untouched. (Earlier independent reviews covered `60c519966`, `59e97d289`,
`a57c5aa13`, and `e9d315428`.)

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
