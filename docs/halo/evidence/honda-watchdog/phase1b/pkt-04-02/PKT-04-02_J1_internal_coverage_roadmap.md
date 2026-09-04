# PKT-04-02 — J1 Internal Coverage Roadmap (freeze-candidate, design-only)

Internal (non-customer) roadmap for the 11 Module-4 conditions. Nothing here is emitted,
promoted, or acquired in J1. It records exact blockers, needed sources/fields/keys, definition/
threshold decisions, owners, immediate/subsequent actions, next safe source action, and review
points, so activation (J2) can proceed without inventing anything.

- **Baseline:** `e7c4e31cd020cbc3b5ba689be3b2d2746393a105`
- **Scope:** Serra Honda 21043 **Sales only**; Service/Parts/service-source/cross-rooftop admitted = 0
- **Emission authority:** false (hidden, non-alert, non-customer)
- **Lifecycle:** all 11 = `source_investigation_pending` (unproved / not_acquired / not_measured / draft).
  Known scheduled-CRM / communication component evidence is supporting context only (not promoted).
- **Owners:** Codex = read-only source/field/stable-key/period/cardinality proof + acquisition/admission;
  Studio = later formulas/joins/NLP/reconciliation/scoring; Duane = business meaning/threshold/
  protected-content/outcome-changing decisions only.

## Per-ID disposition / owner / next action

| ID | Canonical condition (catalog, byte-exact) | Disposition | Next-action owner | Immediate (safe) action |
|---|---|---|---|---|
| SW-058 | VOI unit sold but lead not marked lost/won (data hygiene). | SIP | Codex | Read-only proof of stable lead↔VIN↔sold-outcome join keys + cardinality |
| SW-059 | High-demand model has >10 leads and zero inventory on lot. | SIP | Codex | Read-only proof of leads-by-model + inventory-on-lot join keys + cardinality |
| SW-060 | Multiple leads on same VIN show no coordination between reps (racing). | SIP | Codex | Read-only proof of stable lead↔VIN↔rep join keys + cardinality |
| SW-061 | Price drops on VOI unit not communicated to interested leads within 24h. | SIP | Codex | Read-only check: do price-change/notification fields exist in VinSolutions, or is a named external source needed? |
| SW-062 | Inventory turn rate below 45 days average slipping toward 75+. | SIP | Codex | Read-only check: do inventory turn-rate fields exist in VinSolutions, or is a named external source needed? |
| SW-112 | Falling gross + rising volume = discount-to-move behavior. | SIP | Duane | Ratify composite "falling gross + rising volume" definition + trend windows + thresholds |
| SW-160 | Rep offers discount before customer objects on price (leaving gross on the table). | SIP | Codex | Read-only proof of stable message/customer/thread keys + cardinality (no content read) |
| SW-179 | Rep quotes different price/payment in successive messages without explanation. | SIP | Codex | Read-only proof of stable thread/message keys + cardinality (no content read) |
| SW-180 | Numbers in message don't match desking/DMS record (bait-and-switch risk). | SIP | Codex | Read-only check: do desking/DMS fields exist in VinSolutions, or is a named external source needed? + stable keys (no content read) |
| SW-184 | Financing terms stated verbally don't match F&I contract. | SIP | Codex | Read-only check: do F&I-contract fields exist in VinSolutions, or is a named external source needed? + stable keys (no content read) |
| SW-292 | Equity opportunity score: expected gross from upgrade offer to current customer. | SIP | Codex | Read-only check: do equity/payoff/upgrade fields exist in VinSolutions, or is a named external source needed? |

`SIP` = source_investigation_pending. Numbers in the conditions are catalog starter phrases, **not**
ratified thresholds.

## Source slices (6) — evidence gap, owner, next safe action, review point

### slice_voi_outcome_inventory_join — SW-058, SW-059, SW-060
- **Evidence gap:** the underlying scheduled-CRM data classes (leads, VOI/sold units, rep assignment,
  inventory-on-lot) are **known** as classes, but the stable join keys, cardinality, period alignment,
  and the exact rules ("sold-but-not-marked", ">10 leads / zero inventory", "no coordination/racing")
  are **unproved**. Known classes are **supporting context only** (not admitted). Unproved, not unavailable.
- **Owner:** Codex (read-only key/cardinality proof + acquisition). **Definition/threshold:** Duane.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only key/cardinality check for the lead↔VIN↔outcome /
  leads-by-model↔inventory / lead↔VIN↔rep joins; aggregate-only, no PII/raw rows.
- **Review point:** on PKT-04-02 activation (J2), after join-key proof + rules/thresholds.

### slice_inventory_price_turn_external — SW-061, SW-062
- **Evidence gap:** no supporting VinSolutions export is **presently proved or found** for VOI
  price-change/notification (SW-061) or inventory turn rate (SW-062). A finite read-only check must
  test whether the exact fields exist in governed VinSolutions evidence, **or** whether a named
  external (non-CRM) source would be needed — **not** predetermined, **not** nonexistent. No CRM proxy.
- **Owner:** Codex (read-only VinSolutions-or-external field check). **Threshold/window:** Duane
  (notification window; turn-rate thresholds). **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only field check (VinSolutions-or-named-external);
  aggregate-only, no PII/raw rows, no proxy.
- **Review point:** on J2, after the source check + window/threshold decisions.

### slice_gross_versus_volume — SW-112
- **Evidence gap:** the gross and volume component classes are **known** (scheduled), but the composite
  "falling gross + rising volume" definition, the trend windows, and the thresholds are **unproved**.
  Supporting context only. "discount-to-move behavior" is a business label, not a diagnosis.
- **Owner:** Duane (composite business definition + windows + thresholds). **Proof/acquisition:** Codex
  (gross + volume trend series). **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only confirmation that governed gross and volume
  series with dates exist; aggregate-only, no PII/raw rows.
- **Review point:** on J2, after composite definition + gross/volume series.

### slice_communication_content_pricing — SW-160, SW-179
- **Evidence gap:** a large sales-only communication corpus is **known** (may inform), but stable
  message/customer/thread keys, the NLP semantics (discount-before-objection SW-160; successive-message
  price consistency SW-179), and the exact rules are **unproved**. Message content is **not read**; a
  protected-content/NLP envelope + Duane authorization + stable keys are required; provisional labels
  are not stable linkage. Supporting context only.
- **Owner:** Codex (read-only stable-key/cardinality proof, no content read). **Protected-content
  authorization + rule:** Duane. **Implementer:** Studio (NLP under the envelope).
- **Next safe source action:** Codex bounded read-only confirmation of stable message/customer/thread
  keys + cardinality; aggregate-only, NO content read, no PII/raw rows.
- **Review point:** on J2, after stable-key proof + protected envelope + rule.

### slice_message_versus_dms_fi_reconciliation — SW-180, SW-184
- **Evidence gap:** no supporting VinSolutions export is **presently proved or found** for the
  desking/DMS record (SW-180) or the F&I contract terms (SW-184); the reconciliation rules and stable
  message keys are **unproved**. A finite read-only check must test VinSolutions-fields-or-named-external
  — **not** predetermined. Message content is **not read** (protected envelope + Duane authorization +
  stable keys required). No CRM proxy. "bait-and-switch risk" is a business label, not a diagnosis.
- **Owner:** Codex (read-only VinSolutions-or-external field check + stable keys, no content read).
  **Protected-content authorization + reconciliation rule:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only field check (VinSolutions-or-named-external) for
  the desking/DMS record / F&I-contract terms + stable message keys; aggregate-only, NO content read,
  no PII/raw rows, no proxy.
- **Review point:** on J2, after the source check + keys + reconciliation rule.

### slice_equity_opportunity — SW-292
- **Evidence gap:** no supporting VinSolutions export is **presently proved or found** for
  equity/payoff/valuation truth or the upgrade-offer reference. A finite read-only check must test
  VinSolutions-fields-or-named-external — **not** predetermined, **not** nonexistent. "equity
  opportunity / expected gross from upgrade" is a business scoring construct, not a factual value; its
  meaning/threshold is a Duane business decision. No CRM proxy.
- **Owner:** Codex (read-only VinSolutions-or-external field check). **Scoring business meaning +
  threshold:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only field check (VinSolutions-or-named-external) for
  equity/payoff/upgrade; aggregate-only, no PII/raw rows, no proxy.
- **Review point:** on J2, after the source check + scoring business meaning.

## Held IDs — exact blockers and required future contract

### SW-058 — VOI sold but lead not marked (data hygiene)
- **Blocker:** stable lead↔VIN↔sold-outcome join keys, cardinality, and the "sold-but-not-marked" rule
  unproved; scheduled CRM classes known but supporting only. "data hygiene" is a descriptive label.
- **Then:** Codex key/cardinality proof → Duane ratifies the rule → Studio implements the hygiene join.

### SW-059 — high-demand model, many leads, zero inventory
- **Blocker:** leads-by-model aggregation, inventory-on-lot count, their join, and the
  ">10 leads / high-demand / zero inventory" thresholds unproved; classes known but supporting only.
- **Then:** Codex join proof → Duane ratifies thresholds → Studio implements the demand-vs-inventory flag.

### SW-060 — multiple leads same VIN, no rep coordination (racing)
- **Blocker:** stable lead↔VIN↔rep join keys/cardinality and the "no coordination" rule unproved;
  classes known but supporting only. "racing" is a business label, not a diagnosis.
- **Then:** Codex key proof → Duane ratifies the rule → Studio implements the coordination flag (no causal claim).

### SW-061 — VOI price drop not communicated within window
- **Blocker:** price-change event source, the lead-notification join, and the "24h" window unproved;
  no VinSolutions export presently proved — VinSolutions-or-external undetermined. No CRM proxy.
- **Then:** Codex read-only field check → Duane ratifies the window → Studio implements the latency flag.

### SW-062 — inventory turn rate slipping
- **Blocker:** an inventory turn-rate source/history unproved; "45 days"/"75+" are catalog starters;
  VinSolutions-or-external undetermined. No CRM proxy.
- **Then:** Codex read-only field check → Duane ratifies thresholds → Studio implements the trend flag.

### SW-112 — falling gross + rising volume (discount-to-move)
- **Blocker:** the composite definition, trend windows, and thresholds unproved; gross/volume component
  classes known but supporting only. "discount-to-move behavior" is a business label, not a diagnosis.
- **Then:** Duane ratifies the composite definition + windows + thresholds → Codex proves/acquires the
  gross + volume series → Studio implements the composite flag (no causal claim).

### SW-160 — discount before objection (leaving gross on the table)
- **Blocker:** stable message/customer/thread keys, discount-before-objection NLP semantics, and the
  rule unproved; communication corpus known but supporting only; content unread (protected envelope +
  Duane authorization required). "leaving gross on the table" is a business label, not a diagnosis.
- **Then:** Codex stable-key proof (no content) → Duane authorizes the envelope + rule → Studio implements NLP.

### SW-179 — inconsistent successive price/payment quotes
- **Blocker:** stable thread/message keys and successive-message price-consistency NLP semantics/rule
  unproved; scheduled comm classes known but supporting only; content unread (protected envelope + Duane
  authorization required); "without explanation" must not be inferred as fact.
- **Then:** Codex stable-key proof (no content) → Duane authorizes the envelope + rule → Studio implements NLP.

### SW-180 — message numbers vs desking/DMS (bait-and-switch risk)
- **Blocker:** desking/DMS record source, the reconciliation rule, and stable message keys unproved;
  no VinSolutions export presently proved — VinSolutions-or-external undetermined; content unread. No CRM
  proxy. "bait-and-switch risk" is a business label, not a diagnosis.
- **Then:** Codex field check + stable keys (no content) → Duane authorizes the envelope + reconciliation
  rule → Studio implements the reconciliation flag (no causal claim).

### SW-184 — verbal financing terms vs F&I contract
- **Blocker:** F&I-contract-terms source, the stated-vs-contract reconciliation rule, and stable message
  keys unproved; no VinSolutions export presently proved — VinSolutions-or-external undetermined; content
  unread. No CRM proxy.
- **Then:** Codex field check + stable keys (no content) → Duane authorizes the envelope + reconciliation
  rule → Studio implements the reconciliation flag.

### SW-292 — equity opportunity score
- **Blocker:** equity/payoff/valuation source and upgrade-offer reference unproved; no VinSolutions
  export presently proved — VinSolutions-or-external undetermined; scoring meaning/threshold is a Duane
  business decision. No CRM proxy.
- **Then:** Codex read-only field check → Duane ratifies the scoring business meaning + threshold →
  Studio implements the scoring.

## Boundaries

- Missing is not zero; unproved is not unavailable; no proxy/inference/synthetic source/invented
  denominator/inferred history.
- No source substitution: CRM is not simulated/proxied/substituted for inventory/DMS/F&I-contract/equity
  truth; no absolute claim of VinSolutions-export absence or predetermined external requirement.
- Known component evidence is supporting-only; never erased, never promoted to acquired/admitted.
- Protected content stays unread; NLP/reconciliation requires a Duane-authorized envelope + stable keys;
  no PII/raw rows.
- Quarantined families are terminal and not used/normalized/cured on clean rows.
- No customer output/alert/notification in J1 (emission authority false); no measured value/grade/
  formula/threshold/baseline/detection-rule/causal diagnosis authored.
- No Nissan/Ford scope. Design-only J1; no activation, no ledger/index change, no J2.
- Duane is never assigned technical investigation/acquisition/admission/accumulation/normalization/
  calculation/implementation (including join/NLP/reconciliation/scoring design).
