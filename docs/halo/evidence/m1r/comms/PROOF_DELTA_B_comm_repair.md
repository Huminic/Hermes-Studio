# Gate 4C1 — Proof Delta B (shadow/control HOLD repair: honest capability + hardened provenance)

**Branch:** `codex/halo-295-unshrinkable-inputs`. One writer. Repair of immutable commit
`3ea5669f9` after the impartial shadow HOLD. **Bounded:** repairs only the dishonest capability
map + the provenance gaps. Preserves everything the shadow independently PASSed: real bytes,
Sales-only scope, counts (Honda 1530/386, Nissan 760/237, Ford 526/199), privacy minimization,
distinct-family admission, **portfolio 30 evaluated / 855 unresolved**, customer-final refusal.
**Zero promotions.** No production / Gmail / VinSolutions / schedule / service-parts / raw-PII.

## A. Capability map — authoritative per-ID decision table (was keyword-heuristic + fallback)

The v1 map marked **54** rows `definition_compatible_now` (keyword heuristic); the first shadow
found ≥37 incompatible; the second shadow rejected any section/acquisition_class fallback and
required an EXPLICIT per-ID decision for all 295. The map is now generated from a checked-in
decision table (`scripts/m1r-comms/comm-capability-decisions.ts`) that enumerates exactly
SW-001..SW-295; the generator only joins it to the catalog to copy/verify condition + metadata
(no regex/section/acquisition_class inference; the build fails on any missing/duplicate/extra id
or non-schema field). Every row carries `required_inputs`, an exact `admitted_fields_satisfying`
list (only real derivative fields; `[]` when none), `missing_inputs`, `minimum_history`,
`join_or_nlp_required`, `rationale`, and `decided_by: "explicit"`. Taxonomy split adds
`semantic_definition_pending` so `…_now` has a literal meaning; a threshold flag can never cure
an unavailable input.

**Before (v1 keyword heuristic) → after (v4 authoritative table):**

| category                    | before | after |
| --------------------------- | ------ | ----- |
| definition_compatible_now   | 54     | 0     |
| semantic_definition_pending | (new)  | 12    |
| nlp_content_capable_pending | 45     | 75    |
| unsupported_field           | 39     | 15    |
| insufficient_history        | 12     | 16    |
| other_source_or_join        | 95     | 132   |
| outside_sales_boundary      | 50     | 45    |
| **total**                   | 295    | 295   |

- **Genuinely `definition_compatible_now` IDs: NONE** — no catalog metric is fully specified
  from this family alone.
- **`semantic_definition_pending` (12):** SW-019, SW-022, SW-026, SW-076, SW-084, SW-086,
  SW-132, SW-133, SW-134, SW-137, SW-138, SW-288 (each with its exact admitted field list).
- Second-shadow corrections: **SW-019** one governed week (>=2 adjacent days, not multi-week);
  **SW-089** → unsupported (person_token is Global-Customer-ID-derived, NOT a phone/call-ANI);
  **SW-140** → unsupported (cross-tab: Answering Machine is OUTBOUND only — Honda 109 / Nissan 1 /
  Ford 16; ZERO inbound); **SW-132** pending only with its EXTERNAL business-hours calendar
  recorded; **SW-012** → other_source (origination+staffing; Leads-evaluated); **SW-179/239/256**
  → nlp; **SW-033/034/057/214** → other_source; **SW-290** → insufficient_history; Service-bearing
  **SW-118/199/223–227/263** + compliance **SW-188–192** → outside_sales_boundary.
- The admitted derivative emits NO `Lead Created Date`, phone/email, opens/clicks, CRM login,
  sold/vehicle/deal outcome, or content meaning. Message meaning is NEVER inferred from
  `content_length`/`presence`.

### A1. Truthful boundary routing (per-ID route, not a hard-coded string)

The shared `bound()` helper previously hard-coded `join_or_nlp_required = "separate Service /
compliance route"` for ALL boundary rows. Routes are now truthful per id via narrow helpers:
Service rows → "separate Service workspace route"; compliance rows → "compliance authorization
route"; cross-rooftop rows → "separate cross-rooftop governed route"; external-data rows →
"separate external governed source/route". Categories are unchanged (all still
`outside_sales_boundary`). Corrected + tested: **SW-264** (tax-refund), **SW-272–276** (home-
purchase, credit-tier, registration, insurance-total-loss, LinkedIn) and **SW-218** →
external governed source; **SW-267–269** (cross-rooftop / cross-brand) → cross-rooftop governed
route — none says Service/compliance. Service/compliance rows are NOT weakened (asserted).

### B1. Duplicate-fail-closed is now real (literal tuple array + shared validator)

The authoritative source is a LITERAL TUPLE ARRAY `DECISIONS_TABLE: Array<[id, Dec]>` (295 rows)
— NOT a `Record` (whose duplicate literal keys are silently overwritten before `Object.keys`).
An exported `validateAndIndex(table)` validates the RAW tuples BEFORE building the lookup: exact
length 295; duplicate detection via array length vs Set + explicit duplicate identification;
reject missing/extra/out-of-range; then construct the Map. The generator uses this same
validator, and an adversarial test proves an injected duplicate / missing / extra tuple fails
through it. No source-text-only pretense; no reliance on tsc TS1117.

## B. Provenance hardening (shadow findings)

1. **Explicit ports** (incl. `:443`, which `URL.port` normalizes to empty) are now rejected by
   inspecting the RAW URL authority before normalization (`hasExplicitPort`).
2. **Capture-ID agreement:** the id's rooftop must equal the manifest `dealer_id` AND its
   `YYYYMMDD` must equal the `captured_at` date. A different-date or different-rooftop capture id
   binding this data fails closed.
3. **Exact dealer label:** manifest `dealer` NAME == contracted rooftop name == every CSV row's
   `Dealer`.
4. **Filename period:** the filename's `_YYYY-MM-DD_YYYY-MM-DD` must equal the contracted window
   (a 1999-period filename binding current data fails closed).

## Adversarial tests proving each repaired case fails closed

`src/test/comm-capability-delta.test.ts`: the decision table enumerates exactly SW-001..SW-295
(sequential, unique); every row is `decided_by: "explicit"` (no fallback path); every
`admitted_fields_satisfying` value is a real `DERIVATIVE_SCHEMA_FIELDS` field and not-ready rows
list none. Sentinels — `definition_compatible_now == []`; `semantic_definition_pending` is
exactly the 12; SW-019 uses one governed week; SW-089 has empty fields (person_token is not a
phone identity); SW-140 rationale cites the 109/1/16 outbound-only cross-tab; SW-132 records its
external business-hours calendar; SW-012 → other_source; SW-179/239/256 → nlp; SW-033/034/057/214
→ other_source; SW-290 → insufficient_history; SW-118/199/223–227/263/188–192 →
outside_sales_boundary; plus all first-shadow sentinels; **SW-176 is NOT outside_sales_boundary**.

`src/test/comm-reader.test.ts` (provenance — each mutation throws): explicit `:443` source/report
URL rejected + `hasExplicitPort` true; capture-ID rooftop mutation → `capture_id rooftop`;
capture-ID **date** mutation (`…20250101…`) → `capture_id date`; wrong manifest dealer label →
`manifest dealer`; 1999-period filename → `filename period`; missing-period filename →
`filename lacks`; wrong per-row `Dealer` name → `row Dealer name`; plus the preserved sha /
rooftop / period / count swaps and the PII no-leak + privacy + Sales-only gates.

The real /tmp bytes still validate byte-identically under the hardened reader (unchanged
admission aggregates), and the comm evidence-hash guard tracks the refreshed artifact hashes in
Proof Delta A.
