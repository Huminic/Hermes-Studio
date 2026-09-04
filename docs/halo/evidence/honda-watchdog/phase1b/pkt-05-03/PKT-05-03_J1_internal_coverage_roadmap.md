# PKT-05-03 — J1 Internal Coverage Roadmap (freeze-candidate, design-only)

Internal (non-customer) roadmap for the 8 Module-5 conditions. Nothing here is emitted, promoted, or
acquired in J1. It records exact blockers, needed sources/fields/keys, definition/threshold decisions,
owners, immediate/subsequent actions, next safe source action, and review points.

- **Baseline:** `c3f5803d2c4bf55be715f7d9432710ffa4424092`
- **Scope:** Serra Honda 21043 **Sales only**; Service/Parts/service-source/cross-rooftop admitted = 0
- **Emission authority:** false (hidden, non-alert, non-customer)
- **Lifecycle:** all eight = `source_investigation_pending` (unproved / not_acquired / not_measured / draft).
- **Owners:** Codex = read-only proof/acquisition/admission; Studio = later joins/trends/NLP/
  implementation/tests; Duane = business/cohort/role meanings, thresholds, protected-content authority,
  outcome changes; a named external/Vin owner only after a finite investigation proves need.

## Per-ID disposition / owner / next action

| ID | Canonical condition (catalog, byte-exact) | Disposition | Next-action owner | Immediate (safe) action |
|---|---|---|---|---|
| SW-111 | Rising lead volume + falling close rate = capacity or quality problem. | SIP | Codex | Read-only proof of lead-volume + close-rate trend series with dates |
| SW-117 | BDC set rate up + floor close rate down = handoff friction. | SIP | Codex | Read-only proof of aligned individual BDC/floor populations + stable numeric user identity (no CAGE cure) |
| SW-124 | Cohort divergence: new cohort underperforms prior by >20% at same tenure. | SIP | Codex | Read-only proof of cohort membership + tenure alignment + multi-period history + keys |
| SW-194 | Two reps message same customer within 24h with conflicting info. | SIP | Codex | Read-only proof of stable customer/thread identity + chronology + rep role (no content) |
| SW-195 | BDC sets appointment, floor rep never introduces themselves before visit. | SIP | Codex | Read-only proof of stable customer/thread identity + chronology + role transitions (no content) |
| SW-196 | Manager takes over thread with no context recap to customer. | SIP | Codex | Read-only proof of stable thread identity + chronology + role transitions (no content) |
| SW-197 | Lead reassigned, new rep doesn't acknowledge prior conversation. | SIP | Codex | Read-only proof of reassignment transition history + stable linkage (current state not substitute; no content) |
| SW-204 | Customer asks about a feature/model the rep clearly doesn't know (competence gap). | SIP | Codex | Read-only proof of stable thread identity + whether a named product-reference ground truth is needed (no content) |

`SIP` = source_investigation_pending. Numbers in the conditions are catalog starter phrases, **not**
ratified thresholds. Capacity problem / handoff friction / competence gap are **hypotheses, not facts**.

## Source slices (6) — evidence gap, owner, next safe action, review point

### lead_volume_close_trend — SW-111
- **Evidence gap:** governed CRM Sales Gross (8 sale rows; front $5,947.51, back $10,690.46, total
  $16,637.97; 2 missing/zero total-gross rows) is **supporting-only**; it does not prove rising volume,
  a falling close-rate history, trend windows, or a capacity/quality cause. "capacity or quality
  problem" is a hypothesis, not a fact. No CRM proxy.
- **Owner:** Codex (trend-series proof). **Windows/thresholds:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only key/date check for lead-volume + close-rate
  series; aggregate-only, no PII/raw rows.
- **Review point:** on J2, after trend-series proof + windows.

### bdc_floor_funnel_divergence — SW-117
- **Evidence gap:** rep/lead-type CAGE activity, appointment outcomes, and sold outcomes are known
  component classes (**supporting-only**); **CAGE is quarantined** and must not be cured/promoted; the
  aggregate/user labels do not prove individual handoff friction, aligned BDC/floor populations, stable
  numeric user identity, or causation. "handoff friction" is a hypothesis, not a fact. No CRM proxy.
- **Owner:** Codex (aligned-population + identity proof, no CAGE cure). **Rule:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only identity/population check for individual-level
  BDC/floor (no CAGE cure); aggregate-only, no PII/raw rows.
- **Review point:** on J2, after aligned-population/identity proof + rule.

### cohort_divergence — SW-124
- **Evidence gap:** CRM classes known (**supporting-only**); cohort membership, tenure alignment,
  multi-period history, keys, comparator, and the ">20%" threshold unproved. No CRM proxy.
- **Owner:** Codex (history/key proof). **Definition/threshold:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only key/cardinality check for cohort membership +
  tenure + multi-period history; aggregate-only, no PII/raw rows.
- **Review point:** on J2, after cohort-history/key proof + definition.

### conflicting_multi_rep_communication — SW-194
- **Evidence gap:** communication corpus supports **investigation only**; customer/thread identity,
  chronology, role transitions, and conflicting semantics unproved; **content unread** (protected
  envelope + Duane authority + stable identities + minimization). "24h" is a catalog starter.
- **Owner:** Codex (identity/chronology proof, no content). **Protected authority + rule:** Duane.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only confirmation of stable customer/thread identity
  + chronology + rep role; aggregate-only, NO content read, no PII/raw rows.
- **Review point:** on J2, after identity/chronology proof + protected envelope + rule.

### handoff_context_continuity — SW-195, SW-196, SW-197
- **Evidence gap (SW-195):** introduction-event semantics + stable identities unproved (**content
  unread**). **(SW-196):** recap-quality semantics + identities unproved (**content unread**).
  **(SW-197):** reassignment transition history + stable linkage unproved — current owner/status/
  last-edited **must not** substitute; acknowledgement semantics unproved (**content unread**).
- **Owner:** Codex (identity/history/linkage proof, no content). **Protected authority + rules:** Duane.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only identity/history/linkage checks; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity/history proof + protected envelope + rules.

### product_knowledge_semantic_signal — SW-204
- **Evidence gap:** communication evidence supports **investigation only**; no product-knowledge ground
  truth or competence rule; **content unread** (protected envelope + Duane authority + minimization).
  "competence gap" is a hypothesis, not a fact.
- **Owner:** Codex (identity proof; named product-reference source only if needed, no content).
  **Protected authority + rule:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only confirmation of stable thread identity/chronology
  + product-reference availability; aggregate-only, NO content read, no PII/raw rows.
- **Review point:** on J2, after ground-truth/identity proof + protected envelope + rule.

## Held IDs — exact blockers and required future contract

### SW-111 — rising volume + falling close (capacity/quality)
- **Blocker:** CRM Sales Gross supporting only; rising volume, falling close history, trend windows,
  capacity/quality cause unproved; hypothesis not fact.
- **Then:** Codex trend-series proof → Duane ratifies windows + thresholds → Studio implements (no causal claim).

### SW-117 — BDC up + floor down (handoff friction)
- **Blocker:** CAGE quarantined and aggregate-only (no cure); individual friction, aligned populations,
  stable numeric identity, causation unproved; hypothesis not fact.
- **Then:** Codex aligned-population/identity proof (no CAGE cure) → Duane ratifies rule → Studio implements (no causal claim).

### SW-124 — cohort underperforms prior >20% at tenure
- **Blocker:** cohort membership, tenure alignment, multi-period history, keys, comparator, ">20%" unproved.
- **Then:** Codex history/key proof → Duane ratifies cohort definition + comparator + threshold → Studio implements.

### SW-194 — two reps conflicting within 24h
- **Blocker:** customer/thread identity, chronology, role transitions, conflicting semantics unproved; content unread; "24h" starter.
- **Then:** Codex identity/chronology proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-195 — floor rep never introduces before visit
- **Blocker:** introduction-event semantics + stable identities unproved; content unread.
- **Then:** Codex identity/role proof (no content) → Duane authorizes envelope + introduction rule → Studio implements.

### SW-196 — manager takeover with no context recap
- **Blocker:** recap-quality semantics + thread identity unproved; content unread.
- **Then:** Codex identity/role proof (no content) → Duane authorizes envelope + recap rule → Studio implements.

### SW-197 — reassigned rep doesn't acknowledge prior conversation
- **Blocker:** reassignment transition history + stable linkage unproved; current owner/status/last-edited
  must not substitute; acknowledgement semantics unproved; content unread.
- **Then:** Codex reassignment-history/linkage proof (no content) → Duane authorizes envelope + acknowledgement rule → Studio implements.

### SW-204 — customer asks about feature rep doesn't know (competence gap)
- **Blocker:** product-knowledge ground truth + competence rule unproved; content unread; "competence gap" a hypothesis, not a fact.
- **Then:** Codex identity + product-reference-need proof (no content) → Duane authorizes envelope + competence rule → Studio implements (no causal claim).

## Boundaries

- Missing is not zero; unproved is not unavailable; no proxy/inference/synthetic source/invented
  denominator/inferred history.
- No source substitution; no absolute claim of source/export absence or predetermined external need;
  finite VinSolutions-or-named-external read-only check first.
- Known components/corpus are supporting-only; never erased, never promoted.
- CAGE aggregate is supporting-only and quarantined; not cured/promoted; not individual/daily/causal.
- Current owner/status/last-edited never substitutes for reassignment transition history (SW-197).
- Content stays unread (SW-194/195/196/197/204); NLP requires a Duane-authorized protected-content
  envelope + stable identities + minimization + explicit rules; no PII/raw rows/customer/employee IDs;
  no quotes; no employee accusations.
- Quarantined families are terminal and not used/normalized/cured on clean rows.
- Aggregate correlations / communication labels are not asserted as factual diagnoses.
- No customer output/alert/notification in J1; no measured value/grade/formula/threshold/baseline/
  detection-rule authored.
- No Nissan/Ford scope. Design-only J1; no activation, no ledger/index change, no J2.
- Duane is never assigned technical investigation/acquisition/admission/accumulation/normalization/
  calculation/implementation.
