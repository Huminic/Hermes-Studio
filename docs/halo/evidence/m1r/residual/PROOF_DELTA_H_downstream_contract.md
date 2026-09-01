# PROOF DELTA H — Downstream customer contract (all 295, no new evaluations)

**Gate:** 4H (downstream) · **Revision:** H1 (R2 corrective) · **Accepted week:** 2026-08-24..2026-08-30 (America/New_York)

> **R2 corrective pass (one usability delta).** The shadow's final R1 verdict flagged one item: the
> 122 `other_source_or_join` Sales rows still said "reliable shared key" in customer `how_to_unlock`
> and `next_action` — undefined implementation language, not a real customer method. R2 removes all
> "shared key" phrasing from every customer field and replaces it with plain, honest language: the
> exact field the two reports have in common must be CONFIRMED before their records can be matched
> (no invented identifier, no row-level match claim); and for source-period aggregate metrics such as
> SW-009, the customer compares the totals for the same source and reporting period. "shared key" is
> added to the customer-language guard and a regression test. Scope and accounting are unchanged
> (17/278, 242/36, identical domains, overrides, and CRM seeds; zero new evaluations); the internal
> ledger and CRM-check artifacts remain byte-identical to R0/R1 — only the customer contract, module,
> proof, and tests change.

> **R1 corrective pass (customer usability only).** R0 (commit `4e683cf`) passed accounting, safety,
> determinism, tests, and no-PII, but the impartial shadow held it on customer usability. R1 repairs
> exactly three things WITHOUT changing the accepted outcome (still 17 evaluated / 278 unresolved,
> 242 eligible / 36 withheld, identical domains, overrides, and CRM seeds; zero new evaluations):
> (1) every eligible unresolved Sales metric now names a concrete, metric-specific unlock (source /
> field / history / method) — e.g. SW-009 names "advertising spend by source, plus that source's
> gross and unit sales"; (2) all customer-facing copy is rewritten to plain dealership-management
> language via a deterministic `plainify()` layer, and the jargon guard is expanded to fail closed on
> every implementation term the shadow named (source-native, privacy-safe joins, fail-closed, SLA,
> business-calendar, stable-key extracts, downstream, supported keys/bridge, CRM family) plus
> data-pipeline jargon (NLP, KPI, semantics, dedup, composite, cohort, baseline, funnel, attribution,
> latency, classifier); (3) `what_this_watches` on an unresolved row is tagged with a new
> `metric_definition` claim layer so a renderer can never treat a catalog definition as an
> `observed_fact`. The internal ledger and CRM-check artifacts are byte-identical to R0.

**Rooftops:** 21043 (Honda) · 21044 (Nissan) · 21047 (Ford) · **Boundary:** Sales-only (Service/Parts permanently excluded; missing is never zero)

Gate 4H claims **zero new evaluations**. It does not re-open, promote, or re-audit any metric. It
consumes the already-committed Gate 4E / 4F / 4G HOLD evidence and produces three deterministic,
aggregate-only, non-PII artifacts:

1. an **internal accountability ledger** covering all **295** IDs (17 evaluated + 278 unresolved);
2. a **customer-safe downstream contract** carrying only the **242** customer-display-eligible rows a
   future Sales PDF may consume; and
3. a **material-extreme CRM devil's-advocate control** that stops a primary-export zero/blank from
   becoming a "the data does not exist" claim.

The portfolio is unchanged: **17 evaluated / 278 unresolved** (70 Gate-4E content-HOLD + 86 Gate-4F +
122 Gate-4G). No cell is promoted; 51/834 evaluated/unresolved cells are untouched.

---

## 1. Derivation (reproducible, fail-closed)

Run: `npx tsx scripts/m1r-residual/build-gate4h-downstream-contract.ts`

All inputs are committed artifacts; nothing is invented:

| Bucket               | Count | Committed source                                                                  |
| -------------------- | ----- | --------------------------------------------------------------------------------- |
| Evaluated            | 17    | spine-summary (10) + comm-evaluation-ledger (2) + content promoted (5)            |
| Gate-4E content-HOLD | 70    | `sw295-comm-capability-delta.json` `nlp_content_capable_pending` (75) − evaluated |
| Gate-4F HOLD         | 86    | `sw295-gate4f-scheduled-residual-matrix.json` rows                                |
| Gate-4G HOLD         | 122   | `sw295-gate4g-final-residual-matrix.json` rows                                    |
| **Total**            | 295   | reconciles to the disjoint SW-001..295 partition                                  |

The generator fails closed (throws) on any partition, eligibility, leakage, or PII divergence, and is
byte-identical on rerun.

---

## 2. Eligibility is a function of the evidence DOMAIN, never an incidental word

`customer_display_eligible` is decided by the DOMAIN of a metric's required evidence, derived from
committed governance fields (`blocker_class`, `primary_blocker`, `boundary_lane`) — **never** by a
word that happens to appear in the condition text.

- In-boundary rows (`blocker_class != outside_sales_boundary`) → domain `sales` → **eligible**.
- `outside_sales_boundary` rows are split by lane, NOT flattened:
  - **4G**: uses the committed `boundary_lane`. When it is `not_applicable` (SW-079, SW-080), the
    domain is derived fail-closed from the committed `primary_blocker` rationale.
  - **4F**: derives the keyword lane via the committed `classifyBoundaryLane`, then **overrides** it
    with the committed `primary_blocker` domain when they disagree.
- Domain → routing:
  | Domain | Eligible | Route |
  | ---------------------- | -------- | ------------------------------ |
  | `sales` | yes | sales_customer_pdf |
  | `cross_rooftop` | yes (sanitized) | sales_customer_pdf |
  | `enrichment_external` | yes (sanitized) | sales_customer_pdf |
  | `service_parts` | **no** | separate_service_workspace |
  | `compliance_legal` | **no** | separate_governed_review |
  | `withheld_unclassified`| **no** | separate_governed_review |

**Result:** 242 eligible / 36 withheld. Domain tally:
`sales 233 · cross_rooftop 3 · enrichment_external 6 · service_parts 20 · compliance_legal 16 · withheld_unclassified 0`.

### Domain-vs-incidental-word cases (recorded and tested)

- **SW-270** — condition _"Service customers of one rooftop never marketed by group's sales BDC"_: a
  pure keyword scan matches `rooftop` → `cross_rooftop`, but the committed `primary_blocker`
  ("service-customer cross-marketing is Service-domain") declares Service-domain. Domain evidence
  wins → `service_parts`, **ineligible**. The override is logged in the internal ledger.
- **SW-079 / SW-080** — committed 4G `boundary_lane = not_applicable`, but the committed
  `primary_blocker` is Service-to-Sales → `service_parts`, **ineligible**.
- **SW-115** ("service CSI") and **SW-176** ("mood-driven service") — committed in-boundary Sales
  metrics. The incidental word "service" does NOT make them ineligible; they render with customer-safe
  copy.

The `10. Service-to-Sales & Equity Mining` section title alone never determines eligibility.

---

## 3. Customer-safe fields, claim layers, and the never-zero rule

Every eligible unresolved row carries seven customer-safe fields — business meaning, what was not
measured this period, why the accepted evidence cannot answer it, the exact source/field/history/
method that would unlock it, a concrete next action, an owner (as a role, never an internal codename),
and the management decision it would improve. Internal blocker vocabulary stays in the internal
ledger only. `cross_rooftop` / `enrichment_external` rows use sanitized business language with no
sensitive raw condition.

**R1 — metric-specific unlocks (no generic boilerplate).** The `how_to_unlock` of every one of the
233 Sales rows now ends with `Specifically, this needs: …`, naming the committed
`classification.field` (4G — surfaced for external-source rows too, e.g. SW-009 ad-spend ROI), the
committed `missing_inputs` note (4F), or the message-content signal to read (4E). The generator fails
closed if any Sales row lacks a specific, and asserts the specifics are high-cardinality (≥150
distinct), so a shared platitude cannot pass.

**R1 — plain language + claim layers.** All customer strings pass through a deterministic `plainify()`
layer that rewrites implementation and data-pipeline jargon into dealership-management language while
preserving dealership-native terms (CRM, DMS, BDC, F&I, PVR, CPO, CSI, VIN, VOI, OEM, gross, equity,
lease, trade) and vehicle senses of "model". The committed next-action text (the sole source of the
R0 jargon) is no longer passed through; plain per-blocker next actions are generated instead. Each
field is tagged with its claim layer: `what_this_watches` is a **`metric_definition`** (the catalog
definition of what the metric WOULD watch — never an `observed_fact`), `not_measured_this_period` is
the single `observed_fact` on an unresolved row, and the unlock / next-action / decision fields are
`inference`.

Missing is never zero: `not_measured_this_period` states no value was produced; no unresolved metric
is rendered as `0`.

The **claim-layer contract** (observed fact / inference / hypothesis, plus ROI-scenario rules
requiring an explicit formula, bounded range, assumptions, confidence, and no hyperbole, and barring
the quarantined ROI/CAGE definitions) is embedded for future narratives. **Gate 4H computes no ROI.**

---

## 4. CRM devil's-advocate control (material extremes)

Seeded deterministically from IDs whose committed Gate 4G row carries `observed_evidence` — exactly
**SW-034, SW-049, SW-050, SW-111, SW-114**. States: `required_not_performed`, `verified_present`,
`verified_absent`, `not_verifiable`. Because Gate 4H opens no CRM/browser access, every seeded check
is `required_not_performed` (nothing is fabricated or performed). A primary-export zero/blank must
NOT become "data does not exist": `required_not_performed` and `not_verifiable` render as **"not
verified from available sources"**, never as zero. Aggregate-only, Sales-only, no PII.

---

## 5. Controls

- **Focused tests** (`src/test/gate4h-downstream-contract.test.ts`): 29/29 — coverage 295 (17/278),
  eligibility 242/36, zero Service/Parts or compliance customer-eligible, SW-270 override, SW-079/080
  not_applicable→service, incidental-word non-ineligibility, no jargon, no Service/Parts data, never
  zero, primary-blocker fidelity, CRM fail-closed, claim-layer contract, pure-classifier unit tests,
  **plus R1**: all 233 Sales rows carry a metric-specific `this needs:` unlock (≥150 distinct;
  SW-009 names ad spend + gross + unit sales), `what_this_watches` is `metric_definition` on every
  eligible row, the expanded guard rejects every shadow-named term, and `plainify` is deterministic
  and preserves vehicle "model" senses; **plus R2**: zero customer field contains "shared key" (or a
  bare "key"), the guard fails closed on "shared key", and all 122 `other_source_or_join` rows state
  the exact common field must be confirmed before records can be matched (source-period aggregates
  compare totals for the same source/period — no row-level key claim).
- **Hash guard** (`src/test/gate4h-evidence-hashes.test.ts`): recomputes every SHA-256 below from the
  committed bytes.
- Deterministic (byte-identical rerun); Prettier + ESLint clean; changed-file tsc adds no new errors.

### Recorded hashes (sha256, first 16 hex)

| File                                                                         | sha256:16          |
| ---------------------------------------------------------------------------- | ------------------ |
| `src/server/reports/residual/gate4h-downstream-contract.ts`                  | `5b266b01f01e4dd1` |
| `scripts/m1r-residual/build-gate4h-downstream-contract.ts`                   | `c8e9237360086251` |
| `docs/halo/evidence/m1r/residual/gate4h-internal-accountability-ledger.json` | `7d4d5d09a49dcf15` |
| `docs/halo/evidence/m1r/residual/gate4h-downstream-customer-contract.json`   | `c6e1db25ffa349ef` |
| `docs/halo/evidence/m1r/residual/gate4h-crm-devils-advocate-ledger.json`     | `e39ba84038a616f6` |
| `src/test/gate4h-downstream-contract.test.ts`                                | `015be19ccbf84395` |

Each `sha256:16` is recomputed from the current committed bytes by
`src/test/gate4h-evidence-hashes.test.ts`.
