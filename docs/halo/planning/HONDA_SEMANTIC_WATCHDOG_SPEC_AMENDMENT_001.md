# Honda Semantic Watchdog — SPEC Amendment 001

**Amends:** `docs/halo/planning/HONDA_SEMANTIC_WATCHDOG_EXECUTION_SPEC.md` §3 (Metric disposition
vocabulary).
**Status:** APPROVED (pre-Phase-1 impartial review returned binding PASS).
**Authored:** Phase 1A (freeze planning contracts before any metric authoring).
**Machine-authoritative home:** `docs/halo/contract/phase1/frozen-vocabularies.json`
(`closed_vocabularies.disposition`).

## Why an amendment document (not an in-place SPEC edit)

The reviewed SPEC was pinned **byte-for-byte** and its sha256 (`fedd957b…`) is recorded as an
authority in the **Phase 0 evidence packet**, which has since received a **binding PASS** and was
memorialized. Editing the SPEC file in place would (a) break that byte-pin and (b) invalidate a
now-PASSED Phase 0 authority hash. Per Core Values (no silent changes to governance files; do not
alter memorialized evidence), this amendment is **additive**: it formally amends §3 here and pins
the amended, closed disposition vocabulary in the machine contract above. The original reviewed SPEC
bytes are unchanged.

## Amendment — add disposition state #8: `source_investigation_pending`

SPEC §3 enumerated seven dispositions (`measured_validated`,
`data_acquired_calculation_pending`, `crm_available_acquisition_pending`,
`additional_history_required`, `external_source_required`, `genuinely_not_available`,
`outside_sales_domain`). This amendment adds an **eighth, nonterminal** disposition:

**`source_investigation_pending`** — *Sales source existence is unproved.*

Exactly as approved:

1. **Meaning:** the existence of a Sales source for the metric is **unproved**. A finite
   investigation must resolve it before any other disposition may be asserted.
2. **Required fields:** `owner`, a finite investigation reference (`finite_investigation_ref`),
   `evidence_as_of`, and a `review_point`.
3. **Grading:** `gradable = false`. It carries **no value, no grade, no narrative, and no customer
   projection**.
4. **Restricted transitions — ONLY to:**
   - `crm_available_acquisition_pending`
   - `external_source_required`
   - `additional_history_required`
   - `outside_sales_domain` (only **after a boundary correction**)
   - `genuinely_not_available` (only with **affirmative finite-investigation evidence**)
5. **No direct transition** to `measured_validated` or `data_acquired_calculation_pending`
   (a source whose existence was unproved cannot become acquired/measured without first passing
   through an availability disposition).
6. **Nonterminal:** unlike `genuinely_not_available` and `outside_sales_domain`, this state must be
   resolved; it may not be a resting disposition at completion.

## Interaction with completion (SPEC §13)

`genuinely_not_available` still requires **affirmative investigation evidence**;
`source_investigation_pending` is the explicit, finite, pre-terminal state that precedes it.
Completion is not reached while any in-envelope metric remains `source_investigation_pending`.

## Enforcement

The closed disposition set (now 8), its transition adjacency, the exact allowed-target set for
`source_investigation_pending`, and its forbidden direct targets are frozen and machine-checked in
`frozen-vocabularies.json` and the Phase 1A validator
(`scripts/halo-phase1/validate_phase1_contracts.py`). Any disposition value or transition outside
the frozen set is a fail-closed contract error.
