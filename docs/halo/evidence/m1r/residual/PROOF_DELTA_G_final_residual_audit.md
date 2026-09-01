# Gate 4G — Proof Delta G (final residual audit — the last 122 IDs)

**Branch:** `codex/halo-295-unshrinkable-inputs`. One writer. **Status:** submitted for review,
NOT self-certified. **Bounded gate:** an exhaustive audit of the FINAL **122** catalog IDs =
canonical **295** − disjoint evaluated **17** − Gate 4E content-HOLD **70** − Gate 4F
scheduled-residual-HOLD **86**. After this gate every one of the 295 IDs is dispositioned — **zero**
unaudited remain. No PDF/customer-final, no production, no browser/Gmail/VinSolutions/schedule/CRM/
external mutation, no live model provider, no other gate.

## 1. Result — 0 PROMOTE / 122 HOLD (evidence-backed)

Under the Contract-2 accepted-evidence boundary (Sales-only; dealers 21043/21044/21047; week
2026-08-24..2026-08-30; privacy-minimized communication evidence; ROI/CAGE quarantined; no external
source; no live model), **none** of the 122 is `definition_compatible_now` in the committed
capability delta, so none is definition-exact AND evidence-sufficient. Every one carries a documented
primary blocker → all 122 are **HOLD**. Because nothing is promotable, **no restricted capture was
opened** — zero PII exposure, and Contract 3's PROMOTE-evaluation clause is vacuously satisfied.

Blocker-class tally (disjoint over the 122; each class is the committed `sw295-comm-capability-delta`
category verbatim, so every HOLD is traceable):

| blocker_class                 | count |
| ----------------------------- | ----- |
| `other_source_or_join`        | 73    |
| `outside_sales_boundary`      | 37    |
| `unsupported_field`           | 6     |
| `insufficient_history`        | 5     |
| `semantic_definition_pending` | 1     |

Total = 122.

## 2. Derivation of the 122 (reproducible + hash-locked)

`295 universe − 17 evaluated − 70 Gate-4E-content-HOLD − 86 Gate-4F-HOLD = 122`. The set is derived
from the committed feasibility matrix + spine summary + comm ledger + content reconciliation + the
committed Gate 4F matrix `held_ids`, then sorted. Directive-1 invariant: the **sorted-newline
SHA-256** of the 122 IDs (each ID ascending, followed by a single `\n`, trailing newline included) is

```
a2b1971aec053b50e4dc010829c81533ffba9e8ddcb9543dd00d03d05ab321e3
```

recomputed and asserted fail-closed in both the generator and the independent test. `SW-084` (noted
in Directive 2 as previously audited & held) is a member of the 122.

Directive-2 acquisition-class counts (the committed `acquisition_class` field of the feasibility
matrix, tallied over the 122 and asserted exactly):

| acquisition_class                   | count | next-action lane                                                      |
| ----------------------------------- | ----- | --------------------------------------------------------------------- |
| `Vin-native scheduled`              | 15    | authorize a bounded read-only VinSolutions-native scheduled export    |
| `Native manual export`              | 3     | read-only Response Times CSV manual export (next authorized — §3)     |
| `Manual CRM inspection`             | 6     | authorize a bounded read-only manual CRM inspection                   |
| `Separate external source required` | 55    | admit + reconcile a named separate source (stable same-period join)   |
| `Unavailable or retention-limited`  | 8     | obtain retained/historical window (missing is never zero)             |
| `Outside governed boundary`         | 35    | route to the specific lane authority — see §3 (NOT one approval)      |

Total = 122.

## 3. Directive 3 — approval lanes, not one blanket approval

**Outside-governed-boundary (35) sub-laned by primary blocking data-domain**, derived deterministically
from each row's committed CONDITION text (keyword priority: compliance/legal → enrichment →
cross-rooftop → service; the section title is deliberately excluded so that the "PART 1 — Red Flags"
section name cannot incidentally match the OFAC/Red-Flags compliance keyword). The independent test
re-derives the same split:

| boundary_lane      | count | authority                                                         |
| ------------------ | ----- | ----------------------------------------------------------------- |
| `compliance_legal` | 16    | Compliance/legal (TCPA/DNC/OFAC/Safeguards/privacy) sign-off      |
| `service`          | 10    | Service data owner (Service-to-Sales / equity mining)             |
| `enrichment`       | 6     | Third-party enrichment / external-append data owner               |
| `cross_rooftop`    | 3     | Cross-rooftop data-sharing authority across sister stores         |

Total = 35. Note: `SW-199` ("Service advisor and sales rep contact same customer … no coordination")
routes to **service** — its blocking data-domain is Service-advisor contact logs, not a legal rule —
even though it sits in the "Red Flags" communications section. Distinguishing these four lanes routes
each ID to the correct authority instead of a single blanket outside-boundary approval.

**Next authorized read-only acquisition (recorded, NOT performed here):** the **3** `Native manual
export` IDs — `SW-013`, `SW-016`, `SW-017` — are all the `Dealer Dashboard Response Times
Opportunities CSV`. They are recorded in the acquisition-action ledger as the next authorized
read-only acquisition (compute SLA/business-calendar metrics locally, Sales-only, missing is never
zero). No external/CRM/browser/schedule action is taken in this gate.

## 4. Each HOLD is a schema-complete, traceable record

Every row records (Contract 3): `acquisition_class` (committed feasibility matrix), `blocker_class`
(committed capability category), `primary_blocker` (the committed capability `rationale` — the exact
reason), `additional_blockers`, a `classification` vector (`source` / `field` / `history` /
`threshold` / `join` / `authority`), `boundary_lane` (for outside-boundary rows), `owner`,
`next_safe_action` (committed catalog — read-only), and an `approval_boundary`. No blocker text is
invented; all fields trace to committed artifacts.

Every row also carries a `frozen_e1_spec` (Contract 1) with **exactly** the 14 governing keys —
`population, numerator, denominator, event_sequence, window, threshold, minimum_sample,
minimum_history, exclusions, ambiguity_handling, join_requirements, unit, rank_direction,
missing_data_behavior` — built by the FROZEN Gate 4E `buildFrozenE1HeldSpec`. As HOLD specs, only
governed known facts are populated (catalog `population`, the capability join/NLP requirement +
missing item as `join_requirements`, the permanent Sales-only `exclusions`, and the standing
`missing_data_behavior = "unresolved; missing is never zero"`); every unknown/condition-specific
field — including `window` and `minimum_history` — is `unresolved (held)` / `not_applicable (held)`.
Non-executable by construction.

## 5. Portfolio — preserved 51 / 834; disjoint 295-ID / 885-cell partition; ZERO unaudited

Gate 4G evaluates **0** new cells, so the portfolio stays **51 evaluated / 834 unresolved** — the
prior 51 evaluated cells are byte-preserved (the committed content/Gate-4E/Gate-4F artifacts are only
read, never rewritten). Gate 4G dispositions the last 366 of the 834 unresolved cells with explicit
blockers. After this gate the residual is **empty**:

| category                        | IDs     | cells   |
| ------------------------------- | ------- | ------- |
| evaluated (promoted, preserved) | 17      | 51      |
| Gate 4E content HOLD            | 70      | 210     |
| Gate 4F HOLD                    | 86      | 258     |
| **Gate 4G HOLD**                | **122** | **366** |
| residual (unaudited)            | 0       | 0       |
| **total**                       | **295** | **885** |

Pairwise-disjoint, total coverage, and zero-unaudited are asserted fail-closed in both the generator
and the test.

## 6. Controls

- **Independent test** (`src/test/gate4g-final-residual-audit.test.ts`, 12): re-derives the 122 from
  raw committed inputs and asserts equality with the committed matrix; the Directive-1 sorted-newline
  SHA-256; the Directive-2 acquisition counts (15/3/6/55/8/35); 0 promote / 122 hold (none
  `definition_compatible_now`, so 0 is DERIVED); the Directive-3 lane split (10/16/3/6) re-derived
  from committed condition text with the `SW-199 → service` guard; the 3 ResponseTimes next-authorized
  IDs; a **test-declared literal** 14-key frozen schema over all 122 rows with non-executable specs; a
  **negative regression** proving the evaluator-metadata schema cannot satisfy the frozen contract;
  per-row blocker/classification/owner/approval traceability; the disjoint 17/70/86/122/0 partition
  and preserved 51/834; ledger reconciliation.
- **Hash guard** (`src/test/gate4g-evidence-hashes.test.ts`): recomputes every SHA-256 recorded below
  from the current committed bytes.
- Deterministic byte-identical regeneration of all three artifacts; frozen Gate 4C1/4C2/4E/4F bytes
  unchanged; no raw CSV/PII/secret read or written (no capture opened); TypeScript at the known
  baseline (no new errors in changed files); prettier + eslint clean; scope limited to Gate 4G.

## Committed artifacts (SHA-256 first 16)

| File                                                                       | sha256:16          |
| -------------------------------------------------------------------------- | ------------------ |
| `src/server/reports/residual/gate4g-final-residual.ts`                     | `6b3c55b09f83266d` |
| `scripts/m1r-residual/build-gate4g-final-residual-audit.ts`                | `fc6808f43b992e55` |
| `docs/halo/contract/sw295-gate4g-final-residual-matrix.json`               | `879c9bc998cdbc31` |
| `docs/halo/evidence/m1r/residual/gate4g-acquisition-action-ledger.json`    | `1c3d6f3c4d86d81a` |
| `docs/halo/evidence/m1r/residual/gate4g-portfolio-reconciliation.json`     | `4781a77fd43b22af` |
| `src/test/gate4g-final-residual-audit.test.ts`                             | `1f4b5dc11393af12` |

Each `sha256:16` is recomputed from the current committed bytes by
`src/test/gate4g-evidence-hashes.test.ts`.
