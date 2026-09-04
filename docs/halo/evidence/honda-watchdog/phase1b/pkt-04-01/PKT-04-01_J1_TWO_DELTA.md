# PKT-04-01 — J1 Two-Delta Statement (freeze-candidate, design-only)

- **Packet:** PKT-04-01 (Module 4), 11 conditions, exact order:
  SW-047, SW-048, SW-049, SW-050, SW-051, SW-052, SW-053, SW-054, SW-055, SW-056, SW-057
- **Baseline commit:** `f51ebb974c010e92b945d2612111eecbd154299a`
- **State:** `freeze_candidate` — `immutable_after_independent_pass: false`
- **Global accounting (unchanged):** 295 conditions / 11 modules / 30 packets
- **Dealer scope:** Serra Honda of Sylacauga / serra-honda / 21043 / **Sales only**;
  Service/Parts/service-source/cross-rooftop admitted = 0
- **J1 customer emission authority:** `false` (no customer-visible output/report/finding/alert/notification)

## Management question (frozen)

> Where is Serra Honda losing gross and deal efficiency—from desking speed and negotiation drag
> through front-end gross, F&I capture, deal compliance, incentive accuracy, and aged-inventory
> pull-through—and which signals can be supported from governed Sales evidence without substituting
> CRM proxies for DMS, accounting, inventory, or protected-note data?

## Lifecycle partition (11 targets)

| Bucket | IDs | Count |
|---|---|---|
| accepted_measured | — | 0 |
| **data_acquired_calculation_pending** | SW-049, SW-050 | 2 |
| source_investigation_pending | SW-047, SW-048, SW-051, SW-052, SW-053, SW-054, SW-055, SW-056, SW-057 | 9 |

SW-049 and SW-050 preserve **proven** Honda `crm_sales_gross` evidence (admitted_held); they remain
**held for calculation** and are **not** measured, graded, valued, or recomputed. The other nine are
honest `source_investigation_pending`.

## The two deltas

| Delta | Value | Meaning |
|---|---|---|
| **Evidence delta** | **0 / 11** | No source acquired/admitted/promoted **in this tranche**. SW-049/050 reference **pre-existing** proven `crm_sales_gross` evidence (Report-1275); nothing is newly acquired here. |
| **Meaning delta** | **0 / 11** | No value, grade, formula, threshold, baseline, detection rule, or finding produced for any target. SW-049/050 remain `not_measured`. |

## Authority-absence (why nothing may be valued)

None of the eleven target IDs appears in any evaluation authority:

| Authority | Intersection with the 11 |
|---|---|
| Gate 2 evaluable conditions | **none** |
| Baseline operational targets | **none** |
| Gate 5B evaluated model | **none** |

Because no authority defines a value, formula, threshold, comparator, direction, baseline, or grade
for any of the eleven, none is authored — including SW-049/050, whose source is proven but whose
metric is calculation-pending. `authoritative_evaluated` remains exactly **17** (unchanged).

## Why both deltas are zero

1. **Design-only tranche.** J1 converts 11 provisional ledger rows into one reviewable,
   machine-validated binding. It does not acquire, admit, calculate, or emit.
2. **No accepted carry-forward.** No target is accepted/authoritative. SW-049/050 are proven-but-
   calculation-pending (admitted_held, not measured); the other nine are held/unproved.
3. **Catalog starter phrases are not authority.** The numbers embedded in the byte-exact catalog
   conditions ("20 minutes", ">4", "15%", ">20%", "1.2", "$1,200", "$1,500", "48 hours", ">30%",
   ">60 days") are catalog starter phrases, **not** ratified operational thresholds; they are quoted
   only to preserve the exact condition text and must not be treated as evaluation authority.

## Three honest source states — unproved ≠ unavailable ≠ proven-but-uncomputable

- **Proven, calculation-pending — SW-049, SW-050.** Honda `crm_sales_gross` evidence is **proven and
  admitted_held**: `native-scheduled-evidence.json` delivery Report-1275 (family `crm_sales_gross`,
  held, period 2026-08-24..2026-08-30, **6 rows**, sha256 `baf44eb4…`), corroborated by the E2E
  `readCrmSalesGross` receipt (`docs/halo/evidence/m1r/e2e/real-data-e2e-receipt.json`).
  - SW-049 stays held: the ratified gross-per-unit definition and the >15%-below-trailing-30-day
    threshold are undecided and the trailing-30-day history is not accumulated.
  - SW-050 stays held: in the acquired sample the eligible new-car-deal denominator is **observed as
    zero** — missing is not zero, so neither a breach nor a no-breach may be asserted — plus the
    population definition and >20% threshold are undecided.
- **Unproved (finite check open) — SW-047, SW-048.** A Desking/Dashboard UI surface is known, but no
  governed bulk row export of write-up/first-pencil timestamps or pencil/counter events is presently
  proved — **unproved, not** absent.
- **Presently-unproved source, VinSolutions-or-external undetermined — SW-051..SW-056.** No supporting
  VinSolutions export is **presently proved or found** in governed evidence. A finite read-only check
  must test whether the exact fields exist in governed VinSolutions evidence, **or** whether a named
  external (non-CRM) source would be needed. This is **not** predetermined, and no CRM data is used as
  a proxy/substitute.
- **Technical join unproved — SW-057.** The join source keys and cardinality (Leads, Communication
  Log, Appointments, CRM Sales) are unproved; not inferred.

Missing is **not** zero; not-yet-proved is **not** unavailable.

## Boundaries asserted (permanent rules)

- Missing is not zero; unproved is not unavailable. No proxy, inference, synthetic source, invented
  denominator, or inferred history.
- **No source substitution:** CRM data is not simulated/proxied/substituted for required external
  DMS/accounting/inventory/protected-note truth; and **no absolute claim** is made that a VinSolutions
  export is absent or that an external source is already required for SW-051..056.
- Quarantined families (`cage_kpi`, `lead_source_roi`, `sales_comm_log`) are terminal; they are not
  used, normalized, or cured on clean rows (relevant to the SW-057 join).
- Business-language causal labels ("negotiation drag", "missed product opportunity", "aging
  pull-through opportunity") are **not** asserted as factual diagnoses.
- No Nissan (21044) or Ford (21047) source, delivery, or scope is admitted.
- Ownership: Studio authors/implements engineering (including the SW-057 technical join design +
  implementation); Codex owns read-only source/admission, key/cardinality proof, and governed
  acquisition (including preserving the SW-049/050 proven evidence); Duane owns only business/design/
  protected-content/threshold decisions (including the SW-057 "lead interest" business meaning and the
  >30%/>60-day business thresholds) and is never assigned technical investigation/acquisition/
  admission/accumulation/normalization/calculation/implementation.
- Design-only J1: no activation, no ledger/index change, no J2, no customer output.

## Verification

- Validator: `scripts/halo-phase1b/validate_pkt_04_01_binding.py`
- Receipt (generated by the validator): `docs/halo/evidence/honda-watchdog/phase1b/pkt-04-01/PKT-04-01_BINDING_CHECKS.json`
- Determinism: a second `--no-write` run reproduces the receipt byte-for-byte.
- Legacy: `validate_phase1b.py` remains the pinned canonical 30-error signature UNION **0 new**
  (J1 changes no ledger/gate authority).
