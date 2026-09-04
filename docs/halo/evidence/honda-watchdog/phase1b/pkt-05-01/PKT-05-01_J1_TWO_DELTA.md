# PKT-05-01 — J1 Two-Delta Statement (freeze-candidate, design-only)

- **Packet:** PKT-05-01 (Module 5), 9 conditions, exact order:
  SW-019, SW-020, SW-021, SW-022, SW-023, SW-024, SW-025, SW-026, SW-027
- **Baseline commit:** `11ecd2835efb1cfbe3cad00d1fef045be3db4ec9`
- **State:** `freeze_candidate` — `immutable_after_independent_pass: false`
- **Global accounting (unchanged):** 295 conditions / 11 modules / 30 packets
- **Dealer scope:** Serra Honda of Sylacauga / serra-honda / 21043 / **Sales only**;
  Service/Parts/service-source/cross-rooftop admitted = 0
- **J1 customer emission authority:** `false`

## Management question (frozen)

> Which observable Sales-rep activity and communication patterns at Serra Honda—contact cadence,
> call depth, personalization, channel balance, lead disposition, aging follow-up, CRM engagement,
> personalized-media use, and BDC-to-floor handoff—can be evaluated reliably from governed evidence,
> and which still require exact source, history, stable-key, or business-rule proof?

## Lifecycle partition (9 targets)

| Bucket | IDs | Count |
|---|---|---|
| **accepted_measured (carry-forward)** | SW-021, SW-022 | 2 |
| source_investigation_pending | SW-019, SW-020, SW-023, SW-024, SW-025, SW-026, SW-027 | 7 |
| calculation_pending / rejected / accepted_disposition_only | — | 0 |

SW-021/022 are authoritative accepted carry-forward from the frozen Gate 5B evaluated model
(their **only** authority — no Gate 2 anchor, no baseline operational target). They are preserved
byte-semantically and are **not** recomputed, regraded, or reinterpreted. The other seven are held
`source_investigation_pending`.

## The two deltas

| Delta | Value | Meaning |
|---|---|---|
| **Evidence delta** | **0 / 9** | No source acquired/admitted/promoted this tranche. Accepted rows are carry-forward, not new evidence. |
| **Meaning delta** | **0 / 9** | No new value, grade, formula, threshold, baseline, detection rule, or finding. Accepted rows preserved byte-semantically. |

`authoritative_evaluated` remains exactly **17** (live Gate 5B coverage.evaluated = 17).

## Accepted carry-forward — exact preserved truth (not recomputed)

| ID | value (num/den) | operational target | rating | peer rank | confidence | source |
|---|---|---|---|---|---|---|
| SW-021 | 18.2% (2/11) | at or below 0% (comparator `>`, lower_is_better) | breach | 2 of 3 | low | CRM messaging log |
| SW-022 | 10% (1/10) | at or below 0% (comparator `>`, lower_is_better) | breach | 1 of 3 | low | CRM messaging log |

`accepted_evaluation` is embedded **deep-equal** to the live Gate 5B evaluated entry; the catalog
">70%" (SW-021) and "5:1" (SW-022) starter wording is **not** reinterpreted, and no value is altered.
Legacy three-rooftop peer_rank / label / text / variance live only inside `accepted_evaluation`;
they are not surfaced as usable top-level Honda facts. No message content is reopened.

## Authority-absence (held seven — why nothing may be valued)

None of the seven held IDs appears in any evaluation authority (Gate 2 evaluable, baseline
operational targets, Gate 5B evaluated). Therefore no value/grade/formula/threshold/baseline/
detection rule is authored for them.

## Three honest framings for the held seven — unproved ≠ unavailable

- **Supporting-only (known component/corpus) — SW-019, SW-023, SW-024, SW-026, SW-027.** The
  sales-only communication corpus / known scheduled-CRM component classes / current Lead Log context
  are **known** and preserved as **supporting context only** — never erased, never promoted. They do
  **not** prove consecutive-day logic (SW-019), status-transition history (SW-023), open-state
  history / last-touch linkage / stable keys (SW-024), personalized-media semantics (SW-026), or
  handoff/follow-up identity (SW-027).
- **Presently-unproved source — SW-020, SW-023, SW-025.** No exact governed export/source is
  **presently proved or found**. A finite read-only VinSolutions field/export check runs first, then a
  named external / product-support route only if needed. This is **not** predetermined and data/export
  is **never** claimed to not exist; no CRM proxy.
- **Content-dependent, unread — SW-026, SW-027.** No message/note content is read in J1; future
  content-dependent detection requires an explicit protected-content/NLP envelope, stable keys, data
  minimization, and Duane authority.

**SW-023 discipline:** current status / last-edited time must **never** substitute for status-transition history.

Missing is **not** zero; not-yet-proved is **not** unavailable.

## Boundaries asserted (permanent rules)

- Missing is not zero; unproved is not unavailable. No proxy, inference, synthetic source, invented
  denominator, or inferred history.
- SW-021/022 preserved byte-semantically (Gate 5B); not recomputed/regraded/reinterpreted; no content reopened.
- Known component evidence is supporting-only; never erased, never promoted to acquired/admitted.
- **No source substitution** and **no absolute claim** that an export/source is absent or that an
  external source is already required; finite VinSolutions-or-named-external read-only check first.
- Content stays unread in J1; NLP/media detection requires a Duane-authorized protected-content
  envelope + stable keys + minimization; no PII / no raw rows.
- Quarantined families (`cage_kpi`, `lead_source_roi`, `sales_comm_log`) are terminal; not used,
  normalized, or cured on clean rows.
- Business-language causal labels ("skim behavior", "premature disqualification", "aging neglect",
  "engagement gap") are **not** asserted as factual diagnoses.
- No Nissan (21044) or Ford (21047) source, delivery, or scope is admitted.
- Ownership: Codex owns read-only source/history/key/cardinality proof and governed
  acquisition/admission; Studio owns later calculations/joins/NLP/implementation/tests; Duane owns
  only business definitions, starter-threshold ratification, protected-content authority, and outcome
  changes; a product/named-external owner only after a finite investigation proves need.
- Design-only J1: no activation, no ledger/index change, no J2, no customer output.

## Verification

- Validator: `scripts/halo-phase1b/validate_pkt_05_01_binding.py`
- Receipt: `docs/halo/evidence/honda-watchdog/phase1b/pkt-05-01/PKT-05-01_BINDING_CHECKS.json`
- Determinism: a second `--no-write` run reproduces the receipt byte-for-byte.
- Legacy: `validate_phase1b.py` remains the pinned canonical 30-error signature UNION **0 new**.
