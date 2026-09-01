# Gate 4C1 — Proof Delta A (Enhanced Sales Communication Log weekly: admission + capability plan)

**Branch:** `codex/halo-295-unshrinkable-inputs`. One writer. **Status:** submitted for review,
NOT self-certified. **Bounded gate:** admit a new browser-export family + produce a capability
plan. **It promotes ZERO SW metrics** (portfolio stays 30 evaluated / 855 unresolved); no PDFs,
no NLP/content scoring, no production. The raw CSVs are RESTRICTED and never committed.

## Restricted handoff (verified, never committed)

`/tmp/halo-295-comm-20260901/` — manifest SHA-256
`54fac701e85fa643fd84b188f2d963c626124d766eb31fff7f37244407d7f4c5` (verified). The three raw
CSVs (Honda `25ac45…15adc`, Nissan `26adece…a0a5`, Ford `0d96f8…ea467`) and all six screenshot
hashes are manifest-bound and recomputed from the manifest by the generator. Row/lead counts
reconcile exactly: **Honda 1530/386, Nissan 760/237, Ford 526/199**. No raw CSV / JPEG / customer
/ employee / message content is copied into the repo.

## 1. New family (separate, not a relaxation)

`enhanced_sales_communication_log_weekly` (`contract_state: proposed_extension_pending_consumer_acceptance`)
is a NEW browser-export family. It does **not** reuse or relax the strict single-day scheduled
`sales_comm_log` family (which stays quarantined). Distinct slug, provenance, schema, policy.
It is admitted but **not wired into the evaluator spine** (no metric promoted).

## 2. Browser provenance (fail-closed)

VinConnect source host `vinsolutions.app.coxautoinc.com` (`/vinconnect/`) + a SEPARATE report
host `reporting-vinsolutions.app.coxautoinc.com` (`/VinAnalyticsDashboards/`); both exact (evil
subdomain / suffix / non-https / wrong-path / explicit-port all fail). Capture id
`VIN-COMM-WEEKLY-YYYYMMDD-<dealerId>`. Every required provenance field is present incl. **both**
`filter_evidence_sha256` and `applied_result_evidence_sha256` (the post-apply screenshot proving
the applied `08/24/2026 – 08/30/2026` period + counts); `captured_at` carries an explicit tz.

## 3. Schema + Sales-only reader (fail-closed)

Exact 24-column schema (BOM + RFC-4180 quoted; parsed with a real CSV parser). Every row: Comm
Type = Sales; one governed Dealer ID; Activity Date within `2026-08-24..2026-08-30`
(America/New_York); Communication ID complete + unique. Zero Service/Parts tokens across all
categorical fields **including User Group** (Message Content excluded from the scan — restricted
content). Zero wrong-dealer rows. Reader-computed unique Communication/Lead ID counts + observed
activity min/max reconcile to the manifest. Missing/malformed → fail closed.

## 4. Privacy-minimized derivative + lineage

Transform `comm-weekly-derive-v1`: strips Customer; converts Message Content to length + presence
ONLY (then discards the text); pseudonymizes rep/thread/person joins with non-reversible
goal-scoped truncated SHA-256 (`salt || rooftop || kind || rawId`, rooftop-separated, blank →
no token). Committed evidence = aggregate admission proof + lineage ONLY; per-row derived data is
never committed. Lineage binds raw SHA + manifest SHA + capture id + rooftop + period + transform
version/hash. **Adversarial tests** prove raw names/customer/message cannot appear in the
derivative, and that swapping rooftop / period / hash / capture / count fails closed.

## 5. Capability delta (one row per metric, NONE evaluated)

`sw295-comm-capability-delta.json` — 295 rows, `evaluated_count: 0`, reconciles to 295. Six
controller categories (`definition_compatible_now`, `nlp_content_capable_pending`,
`unsupported_field`, `insufficient_history`, `other_source_or_join`, `outside_sales_boundary`); a
`requires_ratified_threshold` flag marks structurally-computable metrics still needing a ratified
threshold/choice. This is a first-pass, auditable heuristic MAP (each row carries a `basis`), not
a promotion. Distribution: `other_source_or_join 95`, `definition_compatible_now 54`,
`outside_sales_boundary 50`, `nlp_content_capable_pending 45`, `unsupported_field 39`,
`insufficient_history 12`.

> **Flagged for controller ratification (taxonomy):** `definition_compatible_now` means the
> family can express the metric's definition for the governed week; it does NOT mean promotable —
> 54 of the 54 carry `requires_ratified_threshold: true`. The heuristic classifier is a starting
> map; per-metric boundaries (esp. the ~54 comm-structural rows) should be controller-reviewed
> before any promotion gate.

## 6. Seven structured candidates — proposed, NONE promoted

`enhanced-comm-structured-candidates.json` proposes an exact deterministic numerator,
denominator/population, time-window/business-hour rule, minimum sample, threshold/trigger,
missing/zero behavior, aggregate-safe evaluation_detail, baseline basis, and source fields for
SW-019, SW-022, SW-076, SW-132, SW-134, SW-137, SW-138. **Every one carries at least one flagged
semantic choice** (zero-activity-day firing, min-sample/denominator, business-hours calendar,
"active thread", trend/"grows"/"widens" definition, "reply" adjacency, "rapid-fire" run/window),
so none is verbatim/structurally forced without an invented threshold. `promoted_this_gate: 0`.

## Boundaries honored

DEV/isolated. No `/srv`, no production, no browser/Gmail/VinSolutions mutation, no promotion, no
ledger change (still 30/855). No raw CSV/JPEG/PII/secret committed; no Customer/User/Message
Content/name/phone/email persisted.

## Committed artifacts (SHA-256 first 16)

| File                                                                       | sha256:16          |
| -------------------------------------------------------------------------- | ------------------ |
| `src/server/reports/comms/comm-family-contract.ts`                         | `3c6967b3836c51f4` |
| `src/server/reports/comms/comm-reader.ts`                                  | `bc62eee140f347f9` |
| `scripts/m1r-comms/build-comm-admission.ts`                                | `7b1173ef2e10fcd3` |
| `scripts/m1r-comms/build-comm-contract.ts`                                 | `b0ccf2eeae772a45` |
| `scripts/m1r-comms/build-comm-capability-delta.ts`                         | `c6264d790d50e516` |
| `docs/halo/contract/enhanced-sales-communication-log-weekly-contract.json` | `40fe56e0eb1156a1` |
| `docs/halo/contract/enhanced-sales-communication-log-weekly-contract.md`   | `d72d06aa90191bb1` |
| `docs/halo/contract/sw295-comm-capability-delta.json`                      | `8ec33c91ec4bef2d` |
| `docs/halo/contract/enhanced-comm-structured-candidates.json`              | `b88290bdea82f5eb` |
| `docs/halo/evidence/m1r/comms/comm-admission-aggregates.json`              | `3c0f6855d895c522` |

Every `sha256:16` above is recomputed from the current committed bytes by
`src/test/comm-evidence-hashes.test.ts`, so a later formatting cycle that desyncs this proof
fails the suite instead of shipping a stale hash.
