# PKT-04-02 — J1 Two-Delta Statement (freeze-candidate, design-only)

- **Packet:** PKT-04-02 (Module 4), 11 conditions, exact order:
  SW-058, SW-059, SW-060, SW-061, SW-062, SW-112, SW-160, SW-179, SW-180, SW-184, SW-292
- **Baseline commit:** `e7c4e31cd020cbc3b5ba689be3b2d2746393a105`
- **State:** `freeze_candidate` — `immutable_after_independent_pass: false`
- **Global accounting (unchanged):** 295 conditions / 11 modules / 30 packets
- **Dealer scope:** Serra Honda of Sylacauga / serra-honda / 21043 / **Sales only**;
  Service/Parts/service-source/cross-rooftop admitted = 0
- **J1 customer emission authority:** `false` (no customer-visible output/report/finding/alert/notification)

## Management question (frozen)

> Where do inventory mismatch, pricing inconsistency, discount behavior, cross-system deal
> discrepancies, and missed equity opportunities create avoidable Sales leakage—and which signals
> can be supported from governed Honda evidence without substituting CRM proxies for inventory, DMS,
> F&I-contract, or equity data?

## Lifecycle partition (11 targets)

| Bucket | IDs | Count |
|---|---|---|
| accepted_measured | — | 0 |
| data_acquired_calculation_pending | — | 0 |
| **source_investigation_pending** | SW-058, SW-059, SW-060, SW-061, SW-062, SW-112, SW-160, SW-179, SW-180, SW-184, SW-292 | 11 |

All 11 targets are held `source_investigation_pending` / `unproved` / `not_acquired` / `not_measured`.
Known scheduled-CRM / communication component evidence is preserved **only as supporting context**
— it is **not** promoted to acquired/admitted, and stable IDs/joins/rules remain unproved.

## The two deltas

| Delta | Value | Meaning |
|---|---|---|
| **Evidence delta** | **0 / 11** | No source acquired/admitted/promoted in this tranche. |
| **Meaning delta** | **0 / 11** | No value, grade, formula, threshold, baseline, detection rule, or finding produced for any target. |

## Authority-absence (why nothing may be valued)

None of the eleven target IDs appears in any evaluation authority:

| Authority | Intersection with the 11 |
|---|---|
| Gate 2 evaluable conditions | **none** |
| Baseline operational targets | **none** |
| Gate 5B evaluated model | **none** |

Because no authority defines a value, formula, threshold, comparator, direction, baseline, or grade
for any of the eleven, none is authored. `authoritative_evaluated` remains exactly **17** (unchanged).

## Why both deltas are zero

1. **Design-only tranche.** J1 converts 11 provisional ledger rows into one reviewable,
   machine-validated binding. It does not acquire, admit, calculate, or emit.
2. **No accepted / no calculation-pending.** Every target is held `source_investigation_pending`;
   known component evidence is supporting context only, not a governed admitted source.
3. **Catalog starter phrases are not authority.** The numbers embedded in the byte-exact catalog
   conditions (">10 leads", "24h", "45 days", "75+") are catalog starter phrases, **not** ratified
   operational thresholds; they are quoted only to preserve the exact condition text.

## Unproved ≠ unavailable (three honest framings)

- **Known component, join/rule unproved — SW-058, SW-059, SW-060, SW-112, SW-160, SW-179.** The
  underlying scheduled-CRM data classes (leads / VOI / inventory / gross-volume) and the sales-only
  communication corpus are **known**, but the stable keys, join cardinality, period alignment, and
  the exact rule for each condition are **unproved**. Preserved as **supporting context only**;
  nothing is acquired or admitted. Unproved, **not** unavailable.
- **External / cross-system, presently unproved — SW-061, SW-062, SW-180, SW-184, SW-292.** No
  supporting VinSolutions export is **presently proved or found** in governed evidence. A finite
  read-only check must test whether the exact fields exist in governed VinSolutions evidence, **or**
  whether a named external (non-CRM) source would be needed. This is **not** predetermined and is
  **not** a claim of nonexistence; no CRM data is used as a proxy/substitute.
- **Protected communication content, unread — SW-160, SW-179, SW-180, SW-184.** Message content is
  **not read** in J1; a protected-content/NLP envelope + Duane authorization and stable
  message/customer/thread keys are required; provisional labels are not stable linkage.

Missing is **not** zero; not-yet-proved is **not** unavailable.

## Boundaries asserted (permanent rules)

- Missing is not zero; unproved is not unavailable. No proxy, inference, synthetic source, invented
  denominator, or inferred history.
- **No source substitution:** CRM data is not simulated/proxied/substituted for inventory / DMS /
  F&I-contract / equity truth; and **no absolute claim** is made that a VinSolutions export is absent
  or that an external source is already required.
- **Known component evidence is supporting-only** — never erased and never promoted to
  acquired/admitted; stable IDs/joins/rules remain unproved.
- **Protected content stays unread**; NLP/reconciliation requires a Duane-authorized envelope + stable
  keys; no PII / no raw rows.
- Quarantined families (`cage_kpi`, `lead_source_roi`, `sales_comm_log`) are terminal; not used,
  normalized, or cured on clean rows.
- Business-language causal labels ("racing", "discount-to-move behavior", "leaving gross on the
  table", "bait-and-switch risk", "equity opportunity") are **not** asserted as factual diagnoses.
- No Nissan (21044) or Ford (21047) source, delivery, or scope is admitted.
- Ownership: Codex owns read-only source/field/stable-key/period/cardinality proof and
  acquisition/admission; Studio owns later formulas/joins/NLP/reconciliation/scoring; Duane owns only
  business meaning/threshold/protected-content/outcome-changing decisions and is never assigned
  technical work.
- Design-only J1: no activation, no ledger/index change, no J2, no customer output.

## Verification

- Validator: `scripts/halo-phase1b/validate_pkt_04_02_binding.py`
- Receipt (generated by the validator): `docs/halo/evidence/honda-watchdog/phase1b/pkt-04-02/PKT-04-02_BINDING_CHECKS.json`
- Determinism: a second `--no-write` run reproduces the receipt byte-for-byte.
- Legacy: `validate_phase1b.py` remains the pinned canonical 30-error signature UNION **0 new**.
