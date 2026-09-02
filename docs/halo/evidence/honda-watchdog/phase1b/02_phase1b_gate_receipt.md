# Phase 1B gate receipt — Honda Semantic Watchdog

**Issued at (UTC):** 2026-09-02T06:51:10Z
**Branch / parent HEAD:** `codex/halo-295-unshrinkable-inputs` @ `8dd773df8` (prior Phase 1B submission,
returned HOLD). **Status: DRAFT / HOLD — not approved; awaiting a fresh impartial-shadow PASS.**
**Scope:** Phase 1B only — packetized execution, **design-only**. Additive; the pinned objective,
`EXECUTION_SPEC`, the frozen 295, and all Phase 0/1A contracts are unchanged. No calculation,
acquisition, persistence, or report generation.

## Impartial-shadow HOLD corrections (on 8dd773df8) — implemented

| # | Correction | Where |
|---|---|---|
| 1 | SW-011: keep business-hours median (minutes); preserve prior accepted/evaluated state; bind approved **OT-SW-011 (>10 min)** — not a proposed TH-011 / unresolved dealer-history / TBD | `PKT-02-01.json` SW-011; `master-ledger-295.json` |
| 2 | SW-012: strict **AND** of the three blanks (business-hours), ended-period **>30 min** aged proof; unit **ratio_0_1**; trigger **>0 via OT-SW-012**; never ANY/OR; never "generic blank share" | `PKT-02-01.json` SW-012; semantic check I |
| 3 | SW-013: **AFTER-HOURS**-originated leads with no human response by authoritative next opening **+15 min**; stays SIP; no generic-hours / Adjusted Response Time proxy | SW-013; semantic check J |
| 4 | SW-014: first response **auto-reply only AND no human touch within 2h**; **event count/rate** predicate; no business-hours restriction; stays SIP; no channel/direction inference | SW-014; semantic check K |
| 5 | SW-015: SW-011 business-hours population; **share of reps mean ≥ 2× store median**; denominator reps-with-numeric-response; unit **ratio_0_1**; trigger **>0 via OT-SW-015**; ephemeral pseudonymization, never persist names | SW-015; semantic check L |
| 6 | Carry forward **all 17** authoritative accepted+evaluated Honda metrics (gate5b/gate2/Gate 4A): evaluated/report state preserved (not reset to not_measured). Acquisition preserved truthfully — only **SW-011/012/015/090** keep `admitted_promoted` (Leads); the other **13** remain `admitted_held` (evaluation ≠ promotion). Planning placeholders explicitly non-authoritative | `master-ledger-295.json`; carry-forward + no-regression checks |
| 7 | Remove SIP→SIP self-transitions (SW-013/014); strengthen transition validation (from/to adjacency, chaining, timestamp order, terminal consistency) | `check_transitions`; probe F |
| 8 | Amendment + receipt status DRAFT/HOLD (a preflight is not an approval) | `SPEC_AMENDMENT_002.md`; this receipt |
| 9 | Semantic-immutability checks + adversarial probes (OR-for-AND, business-hours-for-after-hours, duration-for-event, minutes-diff-for-share, SW-011 target replacement, accepted-state regression, cross-packet nonblocking) | probes I–O |
| 10 | Keep good controls: exact 295/30/no-overlap; frozen module ownership; single-source fan-out; 18-ID overlay excluded from customer output; no proxy/inference; cross-packet independence | `check_packet_index`, `check_cross_packet_independence`, `check_source`, overlay checks |
| 11 | Provisional planning packets labelled `provisional_planning` (mechanically balanced, not yet logically grouped); reassignment versioned; exact 295 union preserved | `packet-index.json` (assignment_kind=mechanically_balanced_provisional, version 2) |
| 12 | Regenerated two-delta + receipt to the corrected truth | `TWO_DELTA_PKT-02-01.md`; this receipt |

### Fresh HOLD (on b9f0ee232) — 3 proof defects, corrected

| # | Defect | Fix |
|---|---|---|
| A | False acquisition-vs-analytics wording | All 17 preserve evaluated/report state; only SW-011/012/015/090 keep `admitted_promoted`; the other 13 remain `admitted_held` (evaluation ≠ promotion). Corrected in TWO_DELTA/receipt/manifest |
| B | Loose substring semantic checks | Replaced with STRUCTURED bindings derived from the pinned catalog condition + gate2 evaluable_conditions + baseline OT records (unit/calc/numerator/denominator/formula/direct-fields/threshold comparator+value/approval/ref/disposition/source-state/lifecycle-bucket). Coordinated-bypass probes P–T reject wrong-but-keyworded fields |
| C | Lexical timestamp ordering | tz-aware chronological parsing; reject malformed/naive + reversed instants across offsets; probe U (2026-09-02T07:00:00+14:00 after 06:51:10Z) rejects |

## Gate criteria — mechanical evaluation

| # | Criterion | Result | Evidence |
|---|---|---|---|
| P1B.1 | Ledger 295 once; frozen module owner; unique packet assignment; **carry-forward of 17 accepted+evaluated (no reset)** | **PASS** | `check_ledger` (0 errors) |
| P1B.2 | Packet union == 295, no overlap; each 5–12; one module; PKT-02-01 = SW-011..015; provisional labels | **PASS** | `check_packet_index`, `check_cross_packet_independence` |
| P1B.3 | Five closed vocabularies + consistency + matrix + **strengthened chained transitions (no self-transition)** | **PASS** | `check_transitions` |
| P1B.4 | Lifecycle partition exact/disjoint/union; SIP never accepted_disposition_only; **accepted_measured require measured + approved target** | **PASS** | `check_packet` |
| P1B.5 | PKT-02-01 SW-011..015 validate against the Phase 1A metric-row schema; **semantic immutability** to frozen meanings + approved OT targets | **PASS** | `validate_metric_row` + `check_semantic_immutability` |
| P1B.6 | Single reused+promoted source fans out (011/012/015/090); no per-packet reacquisition; reuse labelled | **PASS** | `check_source` |
| P1B.7 | Two-delta evidence present (corrected) | **PASS** | `TWO_DELTA_PKT-02-01.md` |
| P1B.8 | Adversarial controls fire (incl. coordinated-bypass + chronological reversal) | **PASS** | **21/21** probes reject (A–U) |
| P1B.9 | Design-only; Phase 0/1A immutable | **PASS** | Phase 1A/0 regressions PASS; immutable hashes unchanged; INGEST untouched |

## Tests run (read-only / deterministic)

- `python3 scripts/halo-phase1b/validate_phase1b.py --no-write` → **RESULT: PASS** (0 errors; **21/21** adversarial probes reject: A sip-as-disposition-only, B proxy-attach, C overlay-projection, D union≠295, E per-packet-reacquisition, F transition self-transition/append-only, G SIP-eval, H bucket-mismatch, I OR-for-AND, J business-hours-for-after-hours, K duration-for-event, L minutes-diff-for-share, M target-replacement, N accepted-state-regression, O cross-packet-overlap, P sw012-two-of-three-blanks, Q sw013-unrelated-after-hours, R sw014-unrelated-count, S sw015-all-leads-denominator, T sw011-threshold-999, U timestamp-chronological-reversal).
- Regressions: `validate_phase1_contracts.py --no-write` → **PASS** (956/956, 61/61, unchanged); `validate_phase0_catalog.py --no-write` → **PASS**.
- Immutable: objective `7c8e622b`, SPEC `fedd957b`, matrix `29c7ac06`, Phase 0 `07/09`, all Phase 1A artifacts unchanged; INGEST `routeTree.gen.ts` untouched.

## Separation of duties / approval

- **Implementation:** Phase 1B design writer (author). **Governance approval:** the impartial shadow
  must review and issue the binding verdict. **Approval state: PENDING impartial-shadow review.**
  Mechanical checks PASS; the author does not self-approve; a preflight is not an approval.

## Prohibited-action confirmation

No VinSolutions, Gmail, network, schedule, ingest, DB-schema, product/runtime, vault-permission,
production, recipient, or customer action. No **new** values/grades computed (the 17 evaluated carry
forward prior accepted state; not recomputed). SW-013/014 opened as finite investigations with **no**
Vin/UI action. INGEST `src/routeTree.gen.ts` untouched. Rollback = remove the additive Phase 1B paths.
