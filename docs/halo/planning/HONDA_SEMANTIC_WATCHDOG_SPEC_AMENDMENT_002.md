# Honda Semantic Watchdog — SPEC Amendment 002 (packetized execution)

**Amends:** execution model of `HONDA_SEMANTIC_WATCHDOG_EXECUTION_SPEC.md` (§8 phases / §11 artifacts)
by adding a **packetized execution layer**. **Additive only** — it does **not** modify the pinned
active objective, `HONDA_SEMANTIC_WATCHDOG_EXECUTION_SPEC.md`, the frozen 295 catalog, or the passed
Phase 0 / Phase 1A contracts. All Phase 0/1A rules (exact 295, 11-module frozen owner, 18-ID Service
overlay, closed vocabularies + transitions, relational Phase 0 authority anchor, fail-closed stops)
are preserved and remain enforceable.
**Status:** APPROVED (pre-Phase-1B impartial preflight, with the corrections below implemented).

## 1. Vertical packets

Execution proceeds in **vertical packets**. A packet targets **exactly one frozen module** and
**5–12 metric IDs** (or a documented `size_reason`), and answers **one concrete management question**.
Packet target IDs are assigned so their union is **exactly the 295, once each, with no overlap**
(`packet-index.json`). Full packet assignment may be **planning-only**; a packet is authored in detail
only when activated. Only **PKT-02-01** is active/authored in detail this phase.

## 2. Finite investigation budget and closing rule

Each unresolved metric receives one **finite investigation budget** (one help-contract pass, one
read-only UI discovery pass, one controlled unsaved export/probe; a 4th pass requires materially new
evidence). After that budget:

- **`accepted_measured_ids`** (real value recomputed + independently tested) and **evidence-backed
  `accepted_disposition_only_ids`** (`external_source_required` / `additional_history_required` /
  `genuinely_not_available` / `outside_sales_domain`, each with affirmative evidence) may **close**.
- **`rejected_ids`** and **`source_investigation_pending_ids`** stay **open**, each carrying `owner`,
  `evidence_as_of`, `next_action`, and `review_point`. They **block only their own module and final
  completion**; they **MUST NOT block unrelated packet work**.
- **`source_investigation_pending` is nonterminal** and is **never** `accepted_disposition_only`. It
  must resolve (to an availability disposition, `outside_sales_domain` after boundary correction, or
  `genuinely_not_available` with affirmative evidence) before completion.

## 3. Partition-conditional pipeline

The downstream pipeline is conditional on partition membership:

- **`accepted_measured_ids`** → values, baselines, grades, narrative, and the customer mini-report.
- **`accepted_disposition_only_ids`** → persist exact state / evidence / owner / review metadata;
  appear **only** in the safe appendix and internal companion (ID + neutral label, **no value**).
- **`rejected_ids`** → **no customer projection**; internal companion only.
- **`source_investigation_pending_ids`** / **`calculation_pending_ids`** → open; no value/grade/
  narrative/customer projection; internal companion only.

**No proxy or inference** is permitted when a direct required field is absent (missing is not zero).

## 4. Master 295 ledger

A single **master ledger** (`master-ledger-schema.json` + `master-ledger-295.json`) carries every
`SW-001..295` **exactly once** with: frozen module owner; unique packet assignment/ID; the five closed
vocabulary states (disposition / source_existence / acquisition_admission / evaluation /
report_acceptance); dependency / evidence / `evidence_as_of` / `definition_version` / owner /
`next_action` / `review_point`; and an **append-only, versioned transition log**. Packet acceptance
records an acceptance hash and an independent receipt. The ledger and its packet assignment satisfy:
union == 295, no overlap, each packet 5–12, one module.

## 5. Shared sources fan out once

Each proved source exists **once** in the source DAG (`(profile, family, period, schema_revision)`
dedupe key) and **fans out** to every dependent metric. **No per-packet reacquisition.** A packet
declares source **dependencies** (references), and each declaration is labelled **reuse** (existing
accepted artifact) vs **fresh acquisition**.

## 6. Enforcement

`scripts/halo-phase1b/validate_phase1b.py` validates the real ledger, packet, metric, and source-DAG
instances against: exact 295 / frozen module owner / packet-union-295 / closed-vocabulary state /
append-only transition / source-DAG-single-source invariants, the partition-conditional pipeline
rules, and adversarial controls (SIP-as-disposition-only, proxy/inference, overlay customer
projection, per-packet reacquisition, cross-packet blocking). It reuses the Phase 1A generic engine
for the metric-row/packet/source records and does not modify any Phase 0/1A artifact.
