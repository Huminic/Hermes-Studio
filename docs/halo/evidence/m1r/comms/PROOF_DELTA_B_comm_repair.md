# Gate 4C1 — Proof Delta B (shadow/control HOLD repair: honest capability + hardened provenance)

**Branch:** `codex/halo-295-unshrinkable-inputs`. One writer. Repair of immutable commit
`3ea5669f9` after the impartial shadow HOLD. **Bounded:** repairs only the dishonest capability
map + the provenance gaps. Preserves everything the shadow independently PASSed: real bytes,
Sales-only scope, counts (Honda 1530/386, Nissan 760/237, Ford 526/199), privacy minimization,
distinct-family admission, **portfolio 30 evaluated / 855 unresolved**, customer-final refusal.
**Zero promotions.** No production / Gmail / VinSolutions / schedule / service-parts / raw-PII.

## A. Capability map — field-backed (was keyword-heuristic, over-optimistic)

The v1 map marked **54** rows `definition_compatible_now` (each merely flagged
`requires_ratified_threshold`). The shadow found ≥37 clearly incompatible. The v2 classifier
decides against the ADMITTED derivative's ACTUAL emitted fields + the single 7-day week, with a
per-row record (required_inputs / admitted_fields_satisfying / missing_inputs / minimum_history /
join-or-NLP requirement / rationale). Taxonomy split: added **`semantic_definition_pending`**
(events supported but numerator/population/window/event-semantics unresolved) so `…_now` has a
literal meaning. A threshold/baseline may remain a ratification flag but **cannot cure an
unavailable input**.

**Before → after category counts:**

| category                    | before | after |
| --------------------------- | ------ | ----- |
| definition_compatible_now   | 54     | 0     |
| semantic_definition_pending | (new)  | 14    |
| nlp_content_capable_pending | 45     | 76    |
| unsupported_field           | 39     | 57    |
| insufficient_history        | 12     | 9     |
| other_source_or_join        | 95     | 112   |
| outside_sales_boundary      | 50     | 27    |
| **total**                   | 295    | 295   |

- **Genuinely `definition_compatible_now` IDs: NONE** — no catalog metric is fully specified
  from this family alone (every one leaves a numerator/population/window/event-semantic open).
- **`semantic_definition_pending` (14):** SW-019, SW-022, SW-026, SW-076, SW-084, SW-086,
  SW-089, SW-132, SW-133, SW-134, SW-137, SW-138, SW-140, SW-288.
- The admitted derivative emits NO `Lead Created Date`, phone/email, opens/clicks, CRM login,
  sold/vehicle/deal outcome, or content meaning — so lead-origination first-response, contact
  validity, engagement-open, login, and outcome-join metrics are all not-ready. Message meaning
  is NEVER inferred from `content_length`/`presence`.

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

`src/test/comm-capability-delta.test.ts` (sentinels — every named false-ready class):
`definition_compatible_now == []`; `semantic_definition_pending` is exactly the 14; SW-003/007/
091 → unsupported; SW-025/233/234/235 → unsupported; SW-021/075/153/157/185/206/287 → nlp;
SW-056/094/180/182/198 → other_source; SW-261/262/295 → insufficient_history; SW-015 →
other_source (not superseding Leads); **SW-176 is NOT outside_sales_boundary** (→ nlp).

`src/test/comm-reader.test.ts` (provenance — each mutation throws): explicit `:443` source/report
URL rejected + `hasExplicitPort` true; capture-ID rooftop mutation → `capture_id rooftop`;
capture-ID **date** mutation (`…20250101…`) → `capture_id date`; wrong manifest dealer label →
`manifest dealer`; 1999-period filename → `filename period`; missing-period filename →
`filename lacks`; wrong per-row `Dealer` name → `row Dealer name`; plus the preserved sha /
rooftop / period / count swaps and the PII no-leak + privacy + Sales-only gates.

The real /tmp bytes still validate byte-identically under the hardened reader (unchanged
admission aggregates), and the comm evidence-hash guard tracks the refreshed artifact hashes in
Proof Delta A.
