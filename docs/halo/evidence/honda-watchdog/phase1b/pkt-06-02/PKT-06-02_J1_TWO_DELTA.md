# PKT-06-02 — J1 Two-Delta Statement (freeze-candidate, design-only)

- **Packet:** PKT-06-02 (Module 6), 12 conditions, exact order:
  SW-145, SW-146, SW-147, SW-148, SW-149, SW-150, SW-151, SW-152, SW-153, SW-155, SW-156, SW-157
- **Baseline commit:** `63bd4c0bd087c98ae641663f494f5e174eee742b`
- **State:** `freeze_candidate` — `immutable_after_independent_pass: false`
- **Global accounting (unchanged):** 295 conditions / 11 modules / 30 packets
- **Dealer scope:** Serra Honda of Sylacauga / serra-honda / 21043 / **Sales only**;
  Service/Parts/service-source/cross-rooftop admitted = 0
- **J1 customer emission authority:** `false`

## Management question (frozen)

> How consistently do Serra Honda Sales communications demonstrate personalization, discovery, vehicle
> relevance, useful context, clear next steps, and direct handling of pricing, financing, and trade
> questions—and which conclusions are already governed versus still awaiting protected semantic and
> stable-thread proof?

## Lifecycle partition (12 targets)

| Bucket | IDs | Count |
|---|---|---|
| **accepted_measured (carry-forward)** | SW-145, SW-149, SW-150 | 3 |
| source_investigation_pending | SW-146, SW-147, SW-148, SW-151, SW-152, SW-153, SW-155, SW-156, SW-157 | 9 |
| calculation_pending / rejected / disposition_only | — | 0 |

SW-145/149/150 are authoritative accepted carry-forward from the frozen Gate 5B evaluated model (their
**only** authority — no Gate 2 anchor, no baseline operational target), preserved byte-semantically;
**not** recomputed/regraded/reinterpreted; catalog thresholds **not** replaced; no content reopened.

## The two deltas

| Delta | Value | Meaning |
|---|---|---|
| **Evidence delta** | **0 / 12** | No source acquired/admitted/promoted this tranche. Accepted rows are carry-forward, not new evidence. |
| **Meaning delta** | **0 / 12** | No new value/grade/formula/threshold/baseline/detection/finding. Accepted rows preserved byte-semantically; held produce none. |

`authoritative_evaluated` remains exactly **17**.

## Accepted carry-forward — exact preserved truth

| ID | value (num/den) | operational target | rating | peer rank | confidence | source |
|---|---|---|---|---|---|---|
| SW-145 | 0.4% (3/731) | at or below 0% (comparator `>`, lower_is_better) | breach | 2 of 3 (not tied) | high | CRM messaging log |
| SW-149 | 18.2% (2/11) | at or below 0% (comparator `>`, lower_is_better) | breach | 3 of 3 (not tied) | low | CRM messaging log |
| SW-150 | 0% (0/11) | at or below 0% (comparator `>`, lower_is_better) | healthy | 1 of 3 (tied) | low | CRM messaging log |

`accepted_evaluation` embedded **deep-equal** to the live Gate 5B evaluated entries; no value/target/
period altered; catalog thresholds not replaced; no content reopened. Any future recompute requires an
explicit protected-content/NLP envelope, minimization, stable identities, and Duane authority.

## Authority-absence (held nine)

None of the nine held IDs appears in any evaluation authority (Gate 2 evaluable, baseline operational
targets, Gate 5B evaluated). No value/grade/formula/threshold/baseline/detection rule is authored.

## Supporting-only corpus (preserved, never promoted)

The governed communication corpus — **3,211** sales-only events across **905** customer labels;
**370** inbound / **2,841** outbound; **1,517** texts / **1,133** logged calls / **561** emails;
**36** provisional high-intent rows, **49** repeated-template groups, **34** chasing threads — supports
investigation only. **Labels are not identifiers or findings**; customer/provisional labels are not
stable linkage. The corpus does **not** prove stable identity/chronology, Q&A linkage, VOI/pricing/
financing/trade semantics, CTA, context, or evasion. Components support only the held conditions.

## Conditional source discipline (all nine held)

No condition-complete governed source/key/history/rule is **presently proved or found**; a finite
read-only VinSolutions field/key/cardinality/chronology check runs **first**, then a named external/
product-support source **only if necessary**. Nonexistence is **never** claimed; the corpus is **not**
promoted for clean rows. Missing is **not** zero.

## Protected content (all nine held content-dependent)

J1 reads **no** message content and stores **no** raw content, quotes, PII, or customer/employee
identifiers. Any future evaluation/recompute (including for SW-145/149/150) requires an explicit
protected-content/NLP envelope, minimization, stable identities, and Duane authority. **No discovery /
low effort / ignores / evasion** are hypothesis/rule labels, **not** facts. No accusations; no quotes.

## Boundaries asserted (permanent rules)

- Missing is not zero; unproved is not unavailable. No proxy, inference, synthetic source, invented
  denominator, or inferred history.
- SW-145/149/150 preserved byte-semantically (Gate 5B); not recomputed/regraded/reinterpreted; catalog
  thresholds not replaced; no content reopened.
- Corpus supporting-only; never erased, never promoted; labels not identifiers/findings/linkage.
- No source substitution; no absolute claim of source/export absence or predetermined external need.
- Content stays unread; NLP requires a Duane-authorized protected-content envelope + stable identities
  + minimization; no PII/raw/quotes/customer/employee IDs; no accusations.
- Quarantined families (`cage_kpi`, `lead_source_roi`, `sales_comm_log`) are terminal; not used,
  normalized, or cured on clean rows.
- Provisional NLP / rule labels are not asserted as factual diagnoses.
- No Nissan (21044) or Ford (21047) source, delivery, or scope is admitted.
- Ownership: Codex owns read-only proof/acquisition/admission; Studio owns later NLP/calcs/thread
  reconstruction/implementation/tests; Duane owns only semantic definitions, thresholds, protected-content
  authority, and outcome changes.
- Design-only J1: no activation, no ledger/index change, no J2, no customer output.

## Verification

- Validator: `scripts/halo-phase1b/validate_pkt_06_02_binding.py`
- Receipt: `docs/halo/evidence/honda-watchdog/phase1b/pkt-06-02/PKT-06-02_BINDING_CHECKS.json`
- Determinism: a second `--no-write` run reproduces the receipt byte-for-byte.
- Legacy: `validate_phase1b.py` remains the pinned canonical 30-error signature UNION **0 new**.
