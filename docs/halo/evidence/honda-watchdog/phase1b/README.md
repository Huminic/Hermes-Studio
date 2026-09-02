# Honda Semantic Watchdog — Phase 1B evidence packet

**Phase 1B = packetized execution (design-only).** Additive; preserves the pinned objective,
`EXECUTION_SPEC`, the frozen 295, and all Phase 0/1A contracts (all sha256 unchanged). No Vin/Gmail,
ingest, runtime, DB schema, vault permissions, schedules, production, recipients, or INGEST changes;
no calculation/acquisition/persistence/report generation.
**Status: DRAFT / HOLD — not approved; awaiting a fresh impartial-shadow PASS.** (Prior submission
`33f743c55` returned HOLD — Codex reproduced a semantic-validator bypass in which a coordinated
keyword-preserving mutation passed the old substring/required-token check with zero errors; this
packet closes that gap by replacing token checks with **exact equality against an authority-anchored
binding**.)

## Artifacts (`docs/halo/contract/phase1b/`)

| File | What it is |
|---|---|
| `../../../planning/HONDA_SEMANTIC_WATCHDOG_SPEC_AMENDMENT_002.md` | Additive packetized-execution amendment (DRAFT/HOLD) |
| `master-ledger-schema.json` | Ledger row contract (five closed vocabularies; `authoritative`/`current_truth_ref`; chained append-only transitions; invariants) |
| `master-ledger-295.json` | 295 rows once; frozen module owner; **carry-forward of 17 authoritative accepted+evaluated** (not reset); 18 overlay disposition-only; rest non-authoritative provisional |
| `packet-index.json` | 30 **provisional_planning** packets (mechanically balanced, not yet logically grouped); each 5–12; one module; union == exact 295; PKT-02-01 active |
| `packet-schema-1b.json` | Packet schema: lifecycle partitions + partition-conditional pipeline; requires `authority_binding{ref,sha256}` |
| `pkt-02-01-binding.json` | **Versioned exact per-metric semantic binding** for PKT-02-01. Packet must EQUAL each field; anchored to catalog condition + gate2 + baseline OT; sha pinned in packet+manifest; immutable only after independent PASS |
| `source-registry-1b.json` | Single reused+**promoted** Leads source; fans out to SW-011/012/015/090; no per-packet reacquisition |
| `packets/PKT-02-01.json` | Authored packet (SW-011..015) + 5 metric definitions, each EQUAL to its binding record; carries `authority_binding` |

Scripts: `scripts/halo-phase1b/build_ledger.py` (deterministic ledger/assignment generator + carry-forward);
`scripts/halo-phase1b/build_binding.py` (builds the exact per-metric binding from gate2/catalog/baseline
and sets the packet to equal it); `scripts/halo-phase1b/validate_phase1b.py` (reuses the Phase 1A engine;
ledger/packet/metric/source + carry-forward/no-regression + strengthened tz-aware transitions +
**exact-equality semantic immutability** (packet == binding == catalog/gate2/baseline, no substring/keyword
logic) + 22 adversarial controls (per-field coordinated-bypass P–T, all-five-mutation V, chronological-reversal U)).
Reproduce: `python3 scripts/halo-phase1b/validate_phase1b.py --no-write`.

## PKT-02-01 (SW-011..015) — corrected/frozen meanings

Question: **Are new Sales leads being contacted promptly and consistently, and which response gaps
need management action?** Source: **REUSE** of the accepted+**evaluated** Leads artifact (`39f05774…`).

- **SW-011** (accepted_measured): `median(Actual Response Time where Originated After Hours == No)`,
  minutes; graded against approved **OT-SW-011 (>10 min)**.
- **SW-012** (accepted_measured): strict **AND** of {First Contact Attempt, First Customer Contact,
  Actual Response Time} blank within business hours, aged **>30 min**; `ratio_0_1`; **OT-SW-012 (>0)**.
- **SW-015** (accepted_measured): **share of reps mean ≥ 2× store median** / reps-with-numeric;
  `ratio_0_1`; **OT-SW-015 (>0)**; Sales Rep pseudonymized/ephemeral, never persisted.
- **SW-013** (`source_investigation_pending`): AFTER-HOURS leads, no human response by authoritative
  next opening **+15 min** — held; no generic-hours / Adjusted-Response proxy.
- **SW-014** (`source_investigation_pending`): auto-reply-only **AND** no human touch within **2h**;
  **event count** (not duration); no business-hours restriction; held; no channel/direction inference.

Lifecycle: `accepted_measured = {011,012,015}`, `source_investigation_pending = {013,014}`. 013/014
block only module 2 + final completion, never unrelated packets.

## Result

- Validator **PASS** (0 errors; **22/22 adversarial probes reject**, each P–V an EXACT field mismatch
  against the binding — not a keyword miss); ledger 295 / 30 provisional packets; **17 authoritative
  accepted+evaluated carried forward (not reset)**; two-delta present.
- Phase 1A regression **PASS** (956/956, 61/61, unchanged); Phase 0 **PASS**.
- Immutable objective/SPEC/matrix/Phase 0 07/09 and all Phase 1A artifacts unchanged; INGEST untouched.

**Mechanical checks PASS; overall Phase 1B is HOLD pending impartial-shadow review (DRAFT/HOLD; a
preflight is not an approval).** Does not authorize any calculation/acquisition/persistence/report
generation; downstream/runtime gates and fail-closed stops remain enforceable.
