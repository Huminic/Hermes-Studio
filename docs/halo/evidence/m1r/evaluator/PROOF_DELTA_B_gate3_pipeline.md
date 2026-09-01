# Gate 3 — Proof Delta B (pipeline / preflight / no-partial-final / tests)

Deterministic pipeline + adversarial guards for Gate 3. Acceptance unchanged (9/885
evaluated). No customer PDF authored; no partial-final rendered.

## 4. Parameterized pipeline spine

`pipeline.ts` `runPipeline({freshDir, repoRoot, mode, profile?, dealer?, period?})` executes
the 10 stages in order over **all 885 cells**:

`ingest → validate → transform → calculate → baseline → rank → cross-analyze → synthesize →
render-preflight → verify`

- **ingest** reads ONLY accepted held bytes (filename+sha allowlist); **validate** applies
  the Gate 2 strict predicate + semantic validator; **cross-analyze** builds the 876-cell
  closure registry; **synthesize** clusters the evaluated cells; **render-preflight** emits an
  INTERNAL artifact for 9 evaluated + 876 unresolved; **verify** enforces the no-partial gate.
- It generates machine-readable INTERNAL preflight only (`pipeline-preflight.json`,
  `is_customer_deliverable=false`), exposes exact counts (9 / 876, by category summing to
  876), and **never** replaces unresolved counts with placeholders.
- **Customer-final refusal:** `runPipeline({mode:'customer_final'})` returns `ok=false`,
  `preflight=null` (nothing rendered), and `refusal_reason` = "evaluated_count=9 != required
  885; 876 cells unresolved". Refuses unless `evaluated === 885`.

## Adversarial + negative tests (`evaluator-pipeline.test.ts`, closure, probe)

| guard                                                                                     | result |
| ----------------------------------------------------------------------------------------- | ------ |
| 10 stages in exact order over 885 cells                                                   | pass   |
| exposes exact 9/876 counts, category sum = 876, not placeholders                          | pass   |
| **no-partial-final**: customer_final refused, nothing rendered                            | pass   |
| deterministic: two runs → identical preflight; generators byte-identical on rerun         | pass   |
| no-quarantine: no evaluated cell sourced from ROI/CAGE/Comm                               | pass   |
| missing-not-zero: no evaluated cell has a null/zero denominator                           | pass   |
| 295/885: exactly 885 cells, 295 unique conditions                                         | pass   |
| no-synthetic: closure/probe recompute byte-identical from ledger+catalog                  | pass   |
| Sales-only: Service-to-Sales §10 conditions flagged as boundary conflicts (not deleted)   | pass   |
| no promotion: every closure cell `calculable_from_accepted_bytes=false`, no N/A→evaluated | pass   |

## Controller corrections (approval / domain / dataset) — tested

`evaluator-closure.test.ts` adds material-correction tests: **approval-state truth**
(read-only/unsaved/accumulation → `duane_approval_required=false`; mutation/scope → `true`;
quarantined primary is the read-only reconstruction, saved-schedule repair is the
approval-requiring alternative); **domain routing** (only genuine Service-domain → the Service
workspace; compliance/cross-rooftop/enrichment → their own routes; boundary split 27/48/9/21);
**non-overclaiming dataset presence** (every route `candidate_unproved`; Service datasets never
mapped; the 510 quarantined block is 3 families × 3 dealers, never "one pass closes 510").

## Data-minimization addendum

`evaluator-data-minimization.test.ts` (6 cases): every committed allowed field selection is
PII-minimal (no prohibited field; join keys pseudonymized + never in customer PDFs); a
regression test fails a read-only selection that includes a prohibited field without a
compliance route; a compliance route MAY retain PII with authorization; observed capability
is distinct from allowed selection; invariants (routes 603/273, domains 27/48/9/21, all
candidate_unproved) preserved. `data_minimization.validation.ok=true`. Not a new approval gate.

## Validation summary

- Gate 3 focused suite **29/29** (closure 9, promotion-probe 6, pipeline 8, data-minimization 6) + Gate 2 + Gate 1 + consumer regressions green.
- Typecheck **498 == baseline** (zero new Gate 3 errors); lint clean; **actual Prettier check
  clean** over every Gate 3 file incl generated JSON; deterministic byte-identical rerun.
- No `/srv` write; no raw file / PII / secret committed; Gate 2 ledger unchanged
  (`c028e227…`); evidence-hash guard recomputes all 12 Gate 3 artifact hashes.
