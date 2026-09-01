# PROOF DELTA H — Downstream customer contract (all 295, no new evaluations)

**Gate:** 4H (downstream) · **Revision:** H1 · **Accepted week:** 2026-08-24..2026-08-30 (America/New_York)
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
sensitive raw condition. Each field is tagged with its claim layer (observed fact vs inference).

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

- **Focused tests** (`src/test/gate4h-downstream-contract.test.ts`): 20/20 — coverage 295 (17/278),
  eligibility 242/36, zero Service/Parts or compliance customer-eligible, SW-270 override, SW-079/080
  not_applicable→service, incidental-word non-ineligibility, no jargon, no Service/Parts data, never
  zero, primary-blocker fidelity, CRM fail-closed, claim-layer contract, pure-classifier unit tests.
- **Hash guard** (`src/test/gate4h-evidence-hashes.test.ts`): recomputes every SHA-256 below from the
  committed bytes.
- Deterministic (byte-identical rerun); Prettier + ESLint clean; changed-file tsc adds no new errors.

### Recorded hashes (sha256, first 16 hex)

| File                                                                         | sha256:16          |
| ---------------------------------------------------------------------------- | ------------------ |
| `src/server/reports/residual/gate4h-downstream-contract.ts`                  | `4bdc83bc1de208a3` |
| `scripts/m1r-residual/build-gate4h-downstream-contract.ts`                   | `3bb7a40997a95fbb` |
| `docs/halo/evidence/m1r/residual/gate4h-internal-accountability-ledger.json` | `7d4d5d09a49dcf15` |
| `docs/halo/evidence/m1r/residual/gate4h-downstream-customer-contract.json`   | `df23afe7e51bee54` |
| `docs/halo/evidence/m1r/residual/gate4h-crm-devils-advocate-ledger.json`     | `e39ba84038a616f6` |
| `src/test/gate4h-downstream-contract.test.ts`                                | `8f0fc06977541be7` |

Each `sha256:16` is recomputed from the current committed bytes by
`src/test/gate4h-evidence-hashes.test.ts`.
