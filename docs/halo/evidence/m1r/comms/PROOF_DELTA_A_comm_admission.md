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
subdomain / suffix / non-https / wrong-path fail). **Ports are rejected from the RAW URL
authority before normalization**, so explicit `:443` (which `URL.port` normalizes away) also
fails. Capture id `VIN-COMM-WEEKLY-YYYYMMDD-<dealerId>` — the rooftop must equal the manifest
`dealer_id` AND the `YYYYMMDD` must equal the `captured_at` date (a different-date / different-
rooftop capture id fails closed). Every required provenance field is present incl. **both**
`filter_evidence_sha256` and `applied_result_evidence_sha256` (the post-apply screenshot proving
the applied `08/24/2026 – 08/30/2026` period + counts); `captured_at` carries an explicit tz.
**Exact agreement enforced (shadow HOLD repair):** manifest `dealer` NAME == contracted rooftop
name == every CSV row's `Dealer`; the filename's `_YYYY-MM-DD_YYYY-MM-DD` period == the
contracted window (a 1999-period filename binding current data fails closed).

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

## 5. Capability delta (AUTHORITATIVE per-ID decision table; one row per metric, NONE evaluated)

`sw295-comm-capability-delta.json` (`authoritative-per-id-decision-table-v4`) — 295 rows,
`evaluated_count: 0`, `all_rows_decided_by_explicit: true`, reconciles to 295. The keyword-
heuristic v1 over-optimistically marked **54** rows `definition_compatible_now`; the shadow found
≥37 clearly incompatible, then required an explicit per-ID mapping for all 295 with no fallback.
Every row is now an EXPLICIT hand-authored decision in a checked-in decision table
(`scripts/m1r-comms/comm-capability-decisions.ts`, enumerating exactly SW-001..SW-295); the
generator only joins it to the catalog to copy/verify the condition + metadata (no regex /
section / acquisition_class inference; the build fails on any missing/duplicate/extra id or
non-schema field). Each row records `required_inputs`, an exact `admitted_fields_satisfying`
list (only real derivative fields; `[]` when none), `missing_inputs`, `minimum_history`,
`join_or_nlp_required`, `rationale`, and `decided_by: "explicit"`.

**Final category counts:** `definition_compatible_now` **0**; `semantic_definition_pending`
**12**; `nlp_content_capable_pending` **75**; `unsupported_field` **15**; `insufficient_history`
**16**; `other_source_or_join` **132**; `outside_sales_boundary` **45** (sum 295).

- **`definition_compatible_now` = 0** — no catalog metric is fully specified from this family
  alone. The genuinely-ready ID list is empty.
- **`semantic_definition_pending` = 12** (SW-019/022/026/076/084/086/132/133/134/137/138/288) —
  the derivative supports the EVENTS within one governed week but each needs a ratified semantic
  choice; each lists its exact admitted fields.
- Second-repair corrections: **SW-019** minimum history is now truthful (one governed week with
  ≥2 eligible adjacent days — "2 consecutive days" is not multi-week); **SW-089** cannot prove
  "same number" (person_token is Global-Customer-ID-derived, not a phone/call-ANI) → unsupported;
  **SW-140** has NO inbound customer-voicemail event (independent cross-tab: Answering Machine is
  OUTBOUND only — Honda 109 / Nissan 1 / Ford 16; zero inbound) → unsupported; **SW-132** stays
  pending only with its EXTERNAL business-hours calendar recorded. **SW-012** (lead origination +
  staffing; Leads-evaluated) → other_source; **SW-179/239/256** → nlp; **SW-033/034/057/214** →
  other_source (appointment/deal/inventory/external-chat joins); **SW-290** → insufficient_history
  (labeled outcomes + model); Service-bearing **SW-118/199/223–227/263** and compliance
  **SW-188–192** → outside_sales_boundary. Message meaning is NEVER inferred from
  `content_length`/`presence`.

## 6. Seven structured candidates — proposed, NONE promoted

`enhanced-comm-structured-candidates.json` proposes an exact deterministic numerator,
denominator/population, time-window/business-hour rule, minimum sample, threshold/trigger,
missing/zero behavior, aggregate-safe evaluation_detail, baseline basis, and source fields for
SW-019, SW-022, SW-076, SW-132, SW-134, SW-137, SW-138. Field-backed re-audit: all seven are
retained but map to **`semantic_definition_pending`** — the derivative genuinely supports their
events within the 7-day week, but **every one carries at least one flagged semantic choice**
(zero-activity-day firing, min-sample/denominator, business-hours calendar, "active thread",
trend/"grows"/"widens" definition, "reply" adjacency, "rapid-fire" run/window). None relies on
message meaning. `promoted_this_gate: 0`.

## Boundaries honored

DEV/isolated. No `/srv`, no production, no browser/Gmail/VinSolutions mutation, no promotion, no
ledger change (still 30/855). No raw CSV/JPEG/PII/secret committed; no Customer/User/Message
Content/name/phone/email persisted.

## Committed artifacts (SHA-256 first 16)

| File                                                                       | sha256:16          |
| -------------------------------------------------------------------------- | ------------------ |
| `src/server/reports/comms/comm-family-contract.ts`                         | `5934b72189677d1c` |
| `src/server/reports/comms/comm-reader.ts`                                  | `94c42935d2b5aa90` |
| `scripts/m1r-comms/build-comm-admission.ts`                                | `7b1173ef2e10fcd3` |
| `scripts/m1r-comms/build-comm-contract.ts`                                 | `b0ccf2eeae772a45` |
| `scripts/m1r-comms/build-comm-capability-delta.ts`                         | `4e389e58fa91ec90` |
| `scripts/m1r-comms/comm-capability-decisions.ts`                           | `a49e3679089b0688` |
| `docs/halo/contract/enhanced-sales-communication-log-weekly-contract.json` | `40fe56e0eb1156a1` |
| `docs/halo/contract/enhanced-sales-communication-log-weekly-contract.md`   | `47d21eda4c9f0b2a` |
| `docs/halo/contract/sw295-comm-capability-delta.json`                      | `771bec6eed729f6c` |
| `docs/halo/contract/enhanced-comm-structured-candidates.json`              | `764ef9b10b00f812` |
| `docs/halo/evidence/m1r/comms/comm-admission-aggregates.json`              | `3c0f6855d895c522` |

Every `sha256:16` above is recomputed from the current committed bytes by
`src/test/comm-evidence-hashes.test.ts`, so a later formatting cycle that desyncs this proof
fails the suite instead of shipping a stale hash.
