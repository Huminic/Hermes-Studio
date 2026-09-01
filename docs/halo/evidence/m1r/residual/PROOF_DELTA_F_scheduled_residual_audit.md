# Gate 4F — Proof Delta F (scheduled-source + downstream calc/NLP residual audit)

**Branch:** `codex/halo-295-unshrinkable-inputs`. One writer. **Status:** submitted for review,
NOT self-certified. **Bounded gate:** an exhaustive re-audit of exactly the **86** catalog IDs in
acquisition class `Scheduled source plus downstream calculation/NLP` that remain after subtracting
all prior evaluated IDs (spine 10 + comm overlay 2 + content 5 = **17**) and the full **75**-ID
Gate 4E content candidate set. No PDF/customer-final, no production, no browser/Gmail/VinSolutions/
schedule/CRM/external mutation, no live model provider, no other gate.

## 1. Result — 0 PROMOTE / 86 HOLD (evidence-backed)

Under the Contract-2 accepted-evidence boundary (Sales-only; dealers 21043/21044/21047; week
2026-08-24..2026-08-30; privacy-minimized communication evidence; ROI/CAGE quarantined; no external
source; no live model), **zero** of the 86 residual IDs is definition-exact AND evidence-sufficient.
Every one carries a documented primary blocker, so all 86 are **HOLD**. The prior gates already
extracted the promotable structured metrics; the residual is residual precisely because of these
blockers. Because nothing is promotable, **no restricted capture was opened** — zero PII exposure,
and Contract 3's PROMOTE-evaluation clause is vacuously satisfied.

Blocker-class tally (disjoint over the 86; each class is the committed `sw295-comm-capability-delta`
category verbatim, so every HOLD is traceable):

| blocker_class                 | count | Contract-2 basis                                                                                                                   |
| ----------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `other_source_or_join`        | 49    | requires a proved stable same-dealer/same-period join key + row reconciliation; quarantined ROI/CAGE and external sources excluded |
| `insufficient_history`        | 11    | condition references history beyond the single accepted week; missing is never zero                                                |
| `unsupported_field`           | 9     | required field absent from the admitted communication derivative / accepted Sales structured schema                                |
| `semantic_definition_pending` | 9     | requires a ratified semantic/NLP definition; no approved in-boundary provider; no live model permitted                             |
| `outside_sales_boundary`      | 8     | requires Service/Parts/complaint or other non-Sales evidence; permanent Sales-only exclusion                                       |

Total = 86.

## 2. Derivation of the 86 (reproducible)

`target class (162) − prior evaluated (17) − content-75 = 86`. The 76 removed inside the class are
the 5 content promotions plus the 71 other content-candidate members that fall in this class; the 8
spine IDs and 0 comm IDs that are prior-evaluated fall in OTHER acquisition classes, and 3
content-candidate IDs (SW-014/030/183) are classified in other classes — the arithmetic is enforced
fail-closed in the generator and re-derived independently in the test from the raw feasibility
matrix, spine summary, comm ledger, content reconciliation, and capability delta.

## 3. Each HOLD is a schema-complete, traceable record

Every row records (Contract 3): `blocker_class` (committed capability category), `primary_blocker`
(the committed capability `rationale` — the exact reason), `prerequisites` (the committed
`missing_inputs`, `join_or_nlp_required`, `minimum_history`, plus the fixed Contract-2 requirement
for that class), `owner` and `next_action` (committed catalog). No blocker text is invented; all
fields trace to committed artifacts.

Every row also carries a `frozen_e1_spec` (Contract 1) with **exactly** the 14 governing keys —
`population, numerator, denominator, event_sequence, window, threshold, minimum_sample,
minimum_history, exclusions, ambiguity_handling, join_requirements, unit, rank_direction,
missing_data_behavior` — built by the FROZEN Gate 4E `buildFrozenE1HeldSpec`. As HOLD specs, only
governed known facts are populated (catalog `population`, the capability join/NLP requirement +
missing item as `join_requirements`, the permanent Sales-only `exclusions`, and the standing
`missing_data_behavior = "unresolved; missing is never zero"`); every unknown/condition-specific
field — including `window` and `minimum_history` — is `unresolved (held)` / `not_applicable (held)`.
Non-executable by construction.

## 4. Portfolio — preserved 51 / 834; disjoint 295-ID / 885-cell partition

Gate 4F evaluates **0** new cells, so the portfolio stays **51 evaluated / 834 unresolved** — the
prior 51 evaluated cells are byte-preserved (the committed content reconciliation is only read, never
rewritten). Gate 4F dispositions 258 of the 834 unresolved cells with explicit blockers. Disjoint ID
partition:

| category                           | IDs     | cells   |
| ---------------------------------- | ------- | ------- |
| evaluated (promoted, preserved)    | 17      | 51      |
| Gate 4E content HOLD               | 70      | 210     |
| **Gate 4F HOLD**                   | **86**  | **258** |
| residual (not yet bounded-audited) | 122     | 366     |
| **total**                          | **295** | **885** |

Pairwise-disjoint and total coverage are asserted fail-closed in both the generator and the test.

## 5. Controls

- **Independent test** (`src/test/gate4f-scheduled-residual-audit.test.ts`, 10): re-derives the 86
  from raw committed inputs and asserts equality with the committed matrix; 0 promote / 86 hold;
  a **test-declared literal** 14-key frozen schema asserted over all 86 rows; HOLD specs
  non-executable + standing missing-data rule; a **negative regression** proving the evaluator-
  metadata schema (`CONTENT_SPEC_KEYS`) cannot satisfy the frozen contract; per-row blocker
  traceability (`blocker_class`/`primary_blocker`/`owner`/`next_action` == committed sources);
  disjoint 17/70/86/122 partition and preserved 51/834; ledger consistency.
- **Hash guard** (`src/test/gate4f-evidence-hashes.test.ts`): recomputes every SHA-256 recorded
  below from the current committed bytes.
- Deterministic byte-identical regeneration of all three artifacts; frozen Gate 4C1/4C2/4E bytes
  unchanged; no raw CSV/PII/secret read or written (no capture opened); TypeScript at the known
  baseline (no new errors in changed files); prettier + eslint clean; scope limited to Gate 4F.

## Committed artifacts (SHA-256 first 16)

| File                                                                   | sha256:16          |
| ---------------------------------------------------------------------- | ------------------ |
| `src/server/reports/residual/gate4f-scheduled-residual.ts`             | `114b30f24308728c` |
| `scripts/m1r-residual/build-gate4f-scheduled-residual-audit.ts`        | `199e06bda84c3cfc` |
| `docs/halo/contract/sw295-gate4f-scheduled-residual-matrix.json`       | `4a53f6ecd6dd630d` |
| `docs/halo/evidence/m1r/residual/gate4f-evaluated-cell-ledger.json`    | `dd3e68f678112251` |
| `docs/halo/evidence/m1r/residual/gate4f-portfolio-reconciliation.json` | `99a9b331d3ae49a6` |
| `src/test/gate4f-scheduled-residual-audit.test.ts`                     | `923e11ac87a35e77` |

Each `sha256:16` is recomputed from the current committed bytes by
`src/test/gate4f-evidence-hashes.test.ts`.
