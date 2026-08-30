# M1R/M2R Gate 2A — Coverage Inventory PASS

Date: 2026-08-30 EDT  
Controller: Codex  
Bounded analyst: Claude Code  
Independent auditor: Shadow (`/root/shadow_auditor`)  
Result: **Gate 2A PASS; Gate 2 overall remains HOLD pending the bounded contract write**

## Outcome

The read-only inventory is complete and independently reconciled. It does not make any current report cell M1R-ready and does not authorize schedule, browser, reader, data, or production changes.

Claude's final terminal evidence is preserved at `/private/tmp/m1r-gate2a-final-buffer-20260830.txt`, exact size `145685` bytes, SHA-256 `b400a1db912fddf0644fffc579149b91cc04a96250eb19a0f0ce6bbc03739ca4`.

## Catalog layers

- Immutable feasibility source: 295 unique conditions, `SW-001` through `SW-295`, source SHA-256 `29c7ac06130f9b4fe8d5df0a2d0d6fffed7c6ff4dc02eca96e0f44d109a04fc1`.
- Historical acquisition classes reconcile exactly: `20 + 162 + 56 + 7 + 8 + 7 + 35 = 295`.
- Runtime alert-picker: 19 curated executable IDs; it is a subset, not the catalog total.
- Operator taxonomy Markdown: historical/reference only. Its CSV/"available now" wording is not current acquisition authority.
- Current Service overlay: 18 conditions are out of all Sales profiles and route only to the separately governed combined Serra Service workspace: `SW-079`, `SW-081`, `SW-083`, `SW-115`, `SW-118`, `SW-199`, `SW-222` through `SW-229`, `SW-263`, `SW-270`, `SW-279`, and `SW-294`.
- Overlay counts reconcile exactly: native scheduled `20`; scheduled plus calculation/NLP `154`; external `54`; native manual export `7`; unavailable/retention-limited `8`; manual CRM inspection `7`; other outside-boundary `27`; Service-domain separate/out-of-Sales `18`; total `295`.
- `SW-176` and `SW-274` are explicit false-positive exclusions. `SW-082` and `SW-218` remain unavailable to Sales until a source contract proves no Service dependency.

## Current 18-cell truth

The six native families across Honda `21043`, Nissan `21044`, and Ford `21047` reconcile to:

- `3` analytically accepted ledger cells: Honda Appointments (`18` rows), Honda Dashboard (`40` preserved rows), Nissan Dashboard (`40` preserved rows).
- `8` present but current-contract-invalid cells: ROI all three; CAGE Nissan/Ford; Sales Communication all three.
- `7` absent cells: CAGE Honda; CRM Sales Gross all three; Appointments Nissan/Ford; Dashboard Ford.
- Total: `3 + 8 + 7 = 18`.

Analytical ledger acceptance is not M1R readiness. No cell is M1R-ready until it is current under the ratified gate policy, Sales-only, dealer/period/provenance/schema-valid, reader-backed, calculation-tested, and supported by the required real-file golden.

## Capability and limitations

- The isolated ingest branch contains builders for all six native XLSX families.
- The current `hs-watchdog` Halo path wires only Appointments and Dealership Performance.
- Missing Halo readers: Lead Source ROI, CAGE, Sales Communication, and CRM Sales Gross reconciliation.
- Per-deal gross/reconciliation belongs to CRM Sales Gross. Dashboard currently supplies only aggregate `gross.total_sum` in the Halo path.
- CRM activity is partial through Sales Communication; stable IDs and full ordered/status history are absent.
- Appointments provides row-level Start/Confirmed/Rescheduled/Completed fields, not a full transition-history stream.
- Response Times exists for all three stores as separately governed browser-source evidence; its M1R gate freshness rule must be explicitly ratified.
- Prior-year baseline is a separate archive/backfill requirement. ROI cost columns exist but delivered values are zero. GA and non-Vapi PBX remain external.

## Dual proof

Proof A — state/scope: isolated clone remained clean/unlocked at `dev/ingest-endpoint@4c41df11dc48c3bc954ffdd45cdf125b2d67c2d5`; original shared-repository digests remained equal to Gate 1; immutable SQLite pre/post hashes, sizes, and mtimes matched; named writer groups remained stopped or exited; no file/ref/DB/WAL/lock or external object changed.

Proof B — independent outcome: the 295 class totals were re-derived from source rows; the Brain ledger independently proved Honda `2`, Nissan `1`, Ford `0`; the `3/8/7=18` matrix and `8/2/8` Service overlay moves were independently reproduced; split-gross behavior was proven from both code paths; Shadow independently passed the inventory.

## Controller policies required for Gate 2B

Gate 2B must encode, validate, and checkpoint all of the following before Gate 2 can pass:

1. M1R freshness rules for daily Sales Communication, weekly native families, and weekly Response Times.
2. The immutable 295 source plus additive 18-condition Service overlay; historical rows/classes remain unchanged.
3. An explicit 18-cell test contract: accepted positive; contaminated negative; missing-is-not-zero; wrong dealer, wrong period, schema, and provenance negatives; validator behavior; reader/calculation behavior; and one real governed-file golden per store/family before readiness.
4. Current cells remain labeled `3 accepted / 8 invalid / 7 absent`; invalid/absent never become zero.
5. Native XLSX and provenance are preserved. No ad-hoc CSV promotion.

## Safety and next action

Sales-only safety passed. No Service/Parts data entered a Sales profile. No production, browser, VinSolutions, CRM, email, schedule, customer/dealer, reader, or data mutation occurred.

Next action: Codex ratifies the technical policies in the Gate 2B work package; Claude writes only the project-owned contract artifacts on a new isolated branch; Shadow independently verifies both proof deltas. Gate 3 remains prohibited until Gate 2 passes.
