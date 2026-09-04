# PKT-04-01 — J1 Internal Coverage Roadmap (freeze-candidate, design-only)

Internal (non-customer) roadmap for the 11 Module-4 conditions. Nothing here is emitted,
promoted, or newly acquired in J1. It records exact blockers, needed sources/fields/keys, definition/
threshold decisions, owners, immediate/subsequent actions, next safe source action, and review
points, so activation (J2) can proceed without inventing anything.

- **Baseline:** `f51ebb974c010e92b945d2612111eecbd154299a`
- **Scope:** Serra Honda 21043 **Sales only**; Service/Parts/service-source/cross-rooftop admitted = 0
- **Emission authority:** false (hidden, non-alert, non-customer)
- **Lifecycle:** SW-049, SW-050 = `data_acquired_calculation_pending` (proven Honda `crm_sales_gross`
  evidence, admitted_held, **not measured/graded**); the other nine = `source_investigation_pending`
  (unproved / not_acquired / not_measured / draft). No accepted, measured, graded, valued, or
  baselined metric exists in this packet.
- **Owners:** Codex = read-only source/admission, key/cardinality proof, governed acquisition (and
  preservation of the SW-049/050 proven evidence); Duane = business/design/threshold/protected-content
  decisions only; Studio = technical design + implementation (including the SW-057 join).

## Per-ID disposition / owner / next action

| ID | Canonical condition (catalog, byte-exact) | Disposition | Next-action owner | Immediate (safe) action |
|---|---|---|---|---|
| SW-047 | Time from write-up to first pencil exceeds 20 minutes. | SIP | Codex | Read-only investigation of whether governed write-up / first-pencil timestamps exist |
| SW-048 | Deal has >4 pencils/counters before close (negotiation drag). | SIP | Codex | Read-only investigation of whether governed per-deal pencil/counter events exist |
| SW-049 | Gross-per-unit falls >15% below trailing 30-day average. | **CALC** | Duane | Ratify gross-per-unit definition + >15%-below-trailing-30-day rule (definition only) |
| SW-050 | Front-end gross negative on >20% of new car deals in a week. | **CALC** | Duane | Ratify "new car deal" population + front-end-gross-negative rule + >20%-in-a-week share threshold |
| SW-051 | F&I product penetration drops below 1.2 products/deal. | SIP | Codex | Read-only check: do F&I-penetration fields exist in VinSolutions, or is a named external source needed? |
| SW-052 | F&I PVR falls below $1,200 (or store threshold). | SIP | Codex | Read-only check: do F&I-PVR fields exist in VinSolutions, or is a named external source needed? |
| SW-053 | Cash deals bypassing F&I entirely (missed product opportunity). | SIP | Codex | Read-only check: do cash-deal / F&I-attachment fields exist in VinSolutions, or is a named external source needed? |
| SW-054 | Trade valuation variance >$1,500 vs book average without manager note. | SIP | Codex | Read-only check: do trade/book/manager-note fields exist in VinSolutions, or is a named external source needed? |
| SW-055 | Deal jacket missing required stips >48 hours after delivery. | SIP | Codex | Read-only check: do deal-jacket stip/delivery fields exist in VinSolutions, or is a named external source needed? |
| SW-056 | Rebate/incentive stacking error flagged by DMS reconciliation. | SIP | Codex | Read-only check: do rebate/incentive + reconciliation fields exist in VinSolutions, or is a named external source needed? |
| SW-057 | Lead interest concentrated (>30%) on units aged >60 days (aging pull-through opportunity). | SIP | Duane | Ratify business meaning of "lead interest" + >30% / >60-day **business** thresholds (business only) |

`CALC` = data_acquired_calculation_pending (proven evidence, calculation-pending). `SIP` =
source_investigation_pending. Numbers in the conditions are catalog starter phrases, **not** ratified
thresholds.

## Source slices (5) — evidence gap, owner, next safe action, review point

### slice_desking_speed_manual — SW-047, SW-048
- **Evidence gap:** manual desking evidence is **unproved** — a Desking/Dashboard UI surface is known,
  but no governed bulk row export of write-up/first-pencil timestamps (SW-047) or per-deal
  pencil/counter events (SW-048) is presently proved.
- **Owner (investigation):** Codex (read-only). **Definition owner:** Duane (desking-speed limit /
  pencil-count limit). **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only schema/UI check for governed
  write-up/first-pencil timestamps and pencil/counter events; aggregate-only, no PII/raw rows.
- **Review point:** on PKT-04-01 activation (J2), after timestamp/event proof + limit definitions.

### slice_front_end_gross_crm_candidate — SW-049, SW-050 (proven crm_sales_gross, calculation-pending)
- **Proven evidence:** Honda `crm_sales_gross` is **proven and admitted_held** —
  `native-scheduled-evidence.json` delivery Report-1275 (family `crm_sales_gross`, held, period
  2026-08-24..2026-08-30, **6 rows**, sha256 `baf44eb4…`), corroborated by the E2E `readCrmSalesGross`
  receipt (`docs/halo/evidence/m1r/e2e/real-data-e2e-receipt.json`). Preserved byte-for-byte; **not**
  measured, graded, or recomputed.
- **Evidence gap (why still held):** SW-049 — ratified gross-per-unit definition + >15%-below-trailing-
  30-day threshold undecided and the trailing-30-day history not accumulated. SW-050 — eligible
  new-car-deal denominator **observed zero** (missing is not zero) plus population definition and >20%
  threshold undecided.
- **Owner (definition):** Duane. **Preservation + history/population accumulation:** Codex.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only confirmation that the admitted_held
  `crm_sales_gross` rows carry gross-per-unit (SW-049) / an eligible new-car-deal flag (SW-050);
  aggregate-only, no PII/raw rows.
- **Review point:** on J2, after definitions + trailing-30-day history (SW-049) / eligible denominator (SW-050).

### slice_fi_capture_external — SW-051, SW-052, SW-053
- **Evidence gap:** no supporting VinSolutions export is **presently proved or found** in governed
  evidence for F&I product penetration (SW-051), F&I PVR (SW-052), or cash-deal/F&I-bypass (SW-053).
  A finite read-only check must test whether the exact fields exist in governed VinSolutions evidence,
  **or** whether a named external (non-CRM) source would be needed — **not** predetermined. No CRM
  proxy/substitution; **unproved, not unavailable**.
- **Owner (investigation):** Codex (read-only VinSolutions-or-external field check). **Threshold/
  definition:** Duane (products-per-deal floor; PVR floor; cash-deal / F&I-bypass definitions).
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only field check (VinSolutions-or-named-external);
  aggregate-only, no PII/raw rows, no proxy.
- **Review point:** on J2, after the source check + threshold/definition decisions.

### slice_deal_compliance_incentive_external — SW-054, SW-055, SW-056
- **Evidence gap:** no supporting VinSolutions export is **presently proved or found** for trade
  valuation vs book average with manager note (SW-054), deal-jacket stip completeness vs delivery
  timing (SW-055), or rebate/incentive stacking via reconciliation (SW-056). A finite read-only check
  must test whether the exact fields exist in governed VinSolutions evidence, **or** whether a named
  external (non-CRM) source would be needed — **not** predetermined. No CRM proxy; **unproved, not
  unavailable**.
- **Owner (investigation):** Codex (read-only VinSolutions-or-external field check). **Threshold/
  definition:** Duane (trade-variance tolerance + manager-note semantics; required-stips list +
  post-delivery window; stacking-error / reconciliation rule). **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only field check (VinSolutions-or-named-external);
  aggregate-only, no PII/raw rows, no proxy.
- **Review point:** on J2, after the source check + threshold/definition decisions.

### slice_aged_inventory_pull_through_join — SW-057
- **Evidence gap:** requires a **technical join** of lead interest to inventory age across Leads,
  Communication Log, Appointments, and CRM Sales; the join source keys and cardinality are unproved.
  The >30% concentration / >60-day aging phrases are catalog starters, not ratified thresholds.
  Quarantined families (`cage_kpi`, `lead_source_roi`, `sales_comm_log`) must **not** be used/
  normalized/cured to build the join.
- **Owner (business meaning + thresholds):** Duane — the "lead interest" business meaning and the
  >30% / >60-day **business** thresholds only (**not** the technical join). **Source-key + cardinality
  read-only proof + acquisition:** Codex. **Technical join design + implementation:** Studio.
- **Next safe source action:** Codex bounded read-only confirmation of candidate join source keys and
  cardinality; aggregate-only, no PII/raw rows.
- **Review point:** on J2, after business thresholds + key/cardinality proof + acquisition.

## Held IDs — exact blockers and required future contract

### SW-047 — write-up to first pencil (desking speed)
- **Blocker:** write-up/first-pencil timestamps not proved as governed data; no bulk export; the
  "20 minutes" limit is a catalog starter, not a ratified target.
- **Then:** Codex read-only timestamp proof → Duane ratifies desking-speed limit → Studio implements.

### SW-048 — >4 pencils/counters before close
- **Blocker:** per-deal pencil/counter event count not proved as governed data; "> 4" is a catalog
  starter; "negotiation drag" is a business label, not a diagnosis.
- **Then:** Codex read-only event proof → Duane ratifies count limit + "before close" → Studio implements (no causal claim).

### SW-049 — gross-per-unit vs trailing 30-day (proven, calculation-pending)
- **Proven:** admitted_held `crm_sales_gross` (Report-1275, 6 rows). **Blocker:** gross-per-unit
  definition + >15%-below-trailing-30-day threshold undecided; trailing-30-day history not accumulated.
- **Then:** Duane ratifies definition + rule → Codex preserves evidence + accumulates trailing-30-day history → Studio implements.

### SW-050 — front-end gross negative >20% of new car deals (proven, calculation-pending)
- **Proven:** admitted_held `crm_sales_gross` (Report-1275, 6 rows). **Blocker:** eligible new-car-deal
  denominator observed zero (missing is not zero); population definition + >20% threshold undecided.
- **Then:** Duane ratifies population + rule + threshold → Codex preserves evidence + accumulates eligible population → Studio implements.

### SW-051 — F&I product penetration floor
- **Blocker:** no VinSolutions export presently proved; finite read-only check must determine
  VinSolutions-fields-or-named-external; "1.2 products/deal" is a catalog starter. No CRM proxy.
- **Then:** Codex read-only field check → Duane ratifies products-per-deal floor → Studio implements.

### SW-052 — F&I PVR floor
- **Blocker:** no VinSolutions export presently proved; VinSolutions-or-external undetermined;
  "$1,200 (or store threshold)" is a catalog starter. No CRM proxy.
- **Then:** Codex read-only field check → Duane ratifies PVR floor → Studio implements.

### SW-053 — cash deals bypassing F&I
- **Blocker:** no VinSolutions export presently proved; VinSolutions-or-external undetermined;
  "cash deal"/"F&I bypass" undefined; "missed product opportunity" is a business label, not a diagnosis.
- **Then:** Codex read-only field check → Duane ratifies cash/bypass definitions → Studio implements (no causal claim).

### SW-054 — trade valuation variance without manager note
- **Blocker:** no VinSolutions export presently proved; VinSolutions-or-external undetermined;
  "$1,500 vs book average" is a catalog starter. No CRM proxy.
- **Then:** Codex read-only field check → Duane ratifies variance tolerance + note semantics → Studio implements.

### SW-055 — deal jacket missing stips >48h after delivery
- **Blocker:** no VinSolutions export presently proved; VinSolutions-or-external undetermined;
  required-stips list and "48 hours" window undefined. No CRM proxy.
- **Then:** Codex read-only field check → Duane ratifies required-stips list + window → Studio implements.

### SW-056 — rebate/incentive stacking error
- **Blocker:** no VinSolutions export presently proved; VinSolutions-or-external undetermined;
  stacking-error / reconciliation rule undefined. No CRM proxy.
- **Then:** Codex read-only field check → Duane ratifies reconciliation rule → Studio implements.

### SW-057 — lead interest concentrated on aged units
- **Blocker:** technical join source keys + cardinality unproved; ">30%" and ">60 days" are catalog
  starters; quarantined families must not be cured to build the join; "aging pull-through opportunity"
  is a business label, not a diagnosis.
- **Then:** Duane ratifies "lead interest" business meaning + >30%/>60-day business thresholds →
  Codex read-only source-key/cardinality proof + governed acquisition → Studio designs + implements
  the technical join (no causal claim).

## Boundaries

- Missing is not zero; unproved is not unavailable; no proxy/inference/synthetic source/invented
  denominator/inferred history.
- No source substitution: CRM is not simulated/proxied/substituted for external DMS/accounting/
  inventory/protected-note truth; no absolute claim of VinSolutions-export absence or predetermined
  external requirement is made for SW-051..056.
- Quarantined families are terminal and not used/normalized/cured on clean rows.
- No customer output/alert/notification in J1 (emission authority false); no measured value/grade/
  formula/threshold/baseline/detection-rule/causal diagnosis authored (SW-049/050 included).
- No Nissan/Ford scope. Design-only J1; no activation, no ledger/index change, no J2.
- Duane is never assigned technical investigation/acquisition/admission/accumulation/normalization/
  calculation/implementation (including the SW-057 technical join design/definition).
