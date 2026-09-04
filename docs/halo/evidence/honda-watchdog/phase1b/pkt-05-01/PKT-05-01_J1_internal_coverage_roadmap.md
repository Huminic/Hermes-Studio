# PKT-05-01 — J1 Internal Coverage Roadmap (freeze-candidate, design-only)

Internal (non-customer) roadmap for the 9 Module-5 conditions. Nothing here is emitted, promoted, or
newly acquired in J1. It records exact blockers, needed sources/fields/keys, definition/threshold
decisions, owners, immediate/subsequent actions, next safe source action, and review points.

- **Baseline:** `11ecd2835efb1cfbe3cad00d1fef045be3db4ec9`
- **Scope:** Serra Honda 21043 **Sales only**; Service/Parts/service-source/cross-rooftop admitted = 0
- **Emission authority:** false (hidden, non-alert, non-customer)
- **Lifecycle:** SW-021, SW-022 = accepted carry-forward (Gate 5B; preserved byte-semantically, not
  recomputed); the other seven = `source_investigation_pending`.
- **Owners:** Codex = read-only source/history/key/cardinality proof + governed acquisition/admission;
  Studio = later calculations/joins/NLP/implementation/tests; Duane = business definitions,
  starter-threshold ratification, protected-content authority, outcome changes; product/named-external
  owner only after a finite investigation proves need.

## Per-ID disposition / owner / next action

| ID | Canonical condition (catalog, byte-exact) | Disposition | Next-action owner | Immediate (safe) action |
|---|---|---|---|---|
| SW-019 | Rep logs fewer than 3 outbound calls/day for 2 consecutive days. | SIP | Codex | Read-only proof of a governed outbound-call source (stable rep/day keys, daily grain) |
| SW-020 | Rep's talk-time-per-lead falls below 90 seconds average (skim behavior). | SIP | Codex | Read-only check: talk-duration fields in VinSolutions, else named external/product-support |
| SW-021 | Rep sends identical templated message to >70% of leads (no personalization). | **ACCEPTED** | Codex | Preserve Gate 5B evaluated state byte-for-byte (no recompute; no content reopened) |
| SW-022 | Rep's text-to-call ratio exceeds 5:1 (avoiding voice contact). | **ACCEPTED** | Codex | Preserve Gate 5B evaluated state byte-for-byte (no recompute; no content reopened) |
| SW-023 | Rep marks leads "bad/lost" at >2x team average (premature disqualification). | SIP | Codex | Read-only check: lead status-transition-history export in VinSolutions, else named external |
| SW-024 | Rep hasn't touched an open lead in >72 hours (aging neglect). | SIP | Codex | Read-only proof of open-state history + last-touch linkage + stable keys + period alignment |
| SW-025 | Rep's CRM login gap exceeds 24 hours during active shift. | SIP | Codex | Read-only check: governed bulk CRM login-event source in VinSolutions, else named external |
| SW-026 | Rep never uses video/personalized media while peers do (engagement gap). | SIP | Codex | Read-only proof of a personalized-media usage source + stable keys (metadata only, no content) |
| SW-027 | Manager BDC-to-floor handoff has no follow-up note within 24 hours. | SIP | Codex | Read-only proof of handoff/follow-up identity keys + note-within-window join (metadata only, no content) |

`ACCEPTED` = measured_validated carry-forward. `SIP` = source_investigation_pending. Numbers in the
conditions are catalog starter phrases, **not** ratified thresholds.

## Source slices (6) — evidence gap, owner, next safe action, review point

### slice_outbound_activity_cadence — SW-019
- **Evidence gap:** the sales-only communication corpus is **known** (supporting context only) but does
  not prove the consecutive-day logic, stable rep/day keys, daily grain, or joins; the "<3 calls/day
  for 2 consecutive days" rule is a catalog starter, not ratified.
- **Owner:** Codex (source/key proof). **Rule:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only source/key check for the outbound-call series;
  aggregate-only, no PII/raw rows.
- **Review point:** on J2, after source/key proof + cadence rule.

### slice_call_depth_external — SW-020
- **Evidence gap:** no exact talk-duration source is **presently proved**; a finite read-only
  VinSolutions field check runs first, then a named external/product-support route only if needed —
  never claimed nonexistent. "90 seconds" is a catalog starter; "skim behavior" is a business label,
  not a diagnosis. No CRM proxy.
- **Owner:** Codex (VinSolutions-or-external field check). **Threshold:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only field check (VinSolutions-or-named-external) for
  talk duration; aggregate-only, no PII/raw rows, no proxy.
- **Review point:** on J2, after the source check + talk-time threshold.

### slice_accepted_message_behavior — SW-021, SW-022 (accepted carry-forward)
- **Accepted truth (preserved, not recomputed):** SW-021 = 18.2% (2/11), breach, peer rank 2/3, low
  confidence, source CRM messaging log; SW-022 = 10% (1/10), breach, peer rank 1/3, low confidence,
  source CRM messaging log. Operational target "at or below 0%" (comparator `>`, lower_is_better).
  `accepted_evaluation` deep-equal to Gate 5B; catalog ">70%"/"5:1" wording not reinterpreted.
- **Owner:** Codex (byte-for-byte preservation; no content reopened). **Future customer display:** Duane
  (separate customer-emission decision; J1 emission authority false). **Implementer:** Studio (future only).
- **Next safe source action:** none required in J1 (preserved as-is).
- **Review point:** next accepted period (recompute on new governed delivery).

### slice_lead_disposition_and_aging — SW-023, SW-024
- **Evidence gap (SW-023):** current Lead Log / "Last Edited By" context is **known** (supporting only);
  the current status / last-edited time must **never** substitute for status-transition history. The
  status-transition history export is **not presently proved** (VinSolutions-or-external check first);
  team-average baseline and ">2x" rule unproved; "premature disqualification" is a business label.
- **Evidence gap (SW-024):** known lead/communication component classes are **supporting only**;
  open-state history, last-touch linkage, period alignment, and stable keys are unproved; ">72 hours"
  is a catalog starter; "aging neglect" is a business label.
- **Owner:** Codex (history/key proof or field/export check). **Rule/baseline/window:** Duane.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only field/export or key/cardinality check;
  aggregate-only, no PII/raw rows, no proxy.
- **Review point:** on J2, after history/key proof + rule/baseline/window.

### slice_crm_engagement_and_media — SW-025, SW-026
- **Evidence gap (SW-025):** only a dashboard/UI surface is **known**; no governed bulk CRM login-event
  source is **presently proved** (VinSolutions-or-external check first); "active shift" and ">24 hours"
  unproved. No CRM proxy.
- **Evidence gap (SW-026):** the communication corpus is **known** (supporting only) but does not prove
  personalized-media (video) semantics, stable keys, or peer baseline; **content is not read** in J1 —
  future detection requires a protected-content/NLP envelope + stable keys + minimization + Duane
  authority; "engagement gap" is a business label.
- **Owner:** Codex (source/key proof or field check; metadata only, no content). **Definition/threshold
  + protected-content authority:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only field/source/key check (metadata only);
  aggregate-only, NO content read, no PII/raw rows, no proxy.
- **Review point:** on J2, after source/key proof + (SW-026) protected envelope + rule.

### slice_bdc_floor_handoff — SW-027
- **Evidence gap:** the communication corpus is **known** (supporting only) but does not prove the
  handoff/follow-up identity, stable keys, or the note-within-window join; **note content is not read**
  in J1 — future detection requires a protected-content/NLP envelope + stable keys + minimization +
  Duane authority; the "24 hours" follow-up window is a catalog starter.
- **Owner:** Codex (identity/key proof; metadata only, no content). **Rule + protected-content
  authority:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only identity/key check (metadata only); aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after handoff-identity/key proof + protected envelope + rule.

## Held IDs — exact blockers and required future contract

### SW-019 — <3 outbound calls/day for 2 consecutive days
- **Blocker:** consecutive-day logic, stable rep/day keys, daily grain, and joins unproved; corpus known
  but supporting only. **Then:** Codex source/key proof → Duane ratifies the cadence rule → Studio implements.

### SW-020 — talk-time-per-lead below threshold (skim behavior)
- **Blocker:** no talk-duration source presently proved; VinSolutions-or-external undetermined; "90s"
  starter; "skim behavior" a business label. No CRM proxy.
- **Then:** Codex field check → Duane ratifies the threshold → Studio implements.

### SW-021 — templated messages, no personalization (ACCEPTED)
- **State:** accepted carry-forward (Gate 5B; 18.2%, breach). Preserved byte-for-byte; catalog ">70%"
  not reinterpreted; no content reopened. **Then:** Duane authorizes any future customer display separately.

### SW-022 — text-to-call ratio (ACCEPTED)
- **State:** accepted carry-forward (Gate 5B; 10%, breach). Preserved byte-for-byte; catalog "5:1" not
  reinterpreted; no content reopened. **Then:** Duane authorizes any future customer display separately.

### SW-023 — marks bad/lost >2x team average (premature disqualification)
- **Blocker:** status-transition history not presently proved; current status/last-edited must never
  substitute for it; team-average baseline and ">2x" rule unproved; "premature disqualification" a label.
- **Then:** Codex history export check → Duane ratifies rule + baseline → Studio implements.

### SW-024 — open lead untouched >72h (aging neglect)
- **Blocker:** open-state history, last-touch linkage, period alignment, and stable keys unproved;
  components known but supporting only; ">72h" starter; "aging neglect" a label.
- **Then:** Codex history/key proof → Duane ratifies the window → Studio implements.

### SW-025 — CRM login gap >24h during active shift
- **Blocker:** no governed bulk login-event source presently proved (dashboard/UI only);
  VinSolutions-or-external undetermined; "active shift"/">24h" unproved. No CRM proxy.
- **Then:** Codex field check → Duane ratifies active-shift + gap threshold → Studio implements.

### SW-026 — never uses personalized media (engagement gap)
- **Blocker:** personalized-media semantics, stable keys, peer baseline unproved; corpus supporting only;
  content unread (protected envelope + Duane authority + stable keys + minimization required); "engagement
  gap" a label.
- **Then:** Codex metadata source/key proof (no content) → Duane authorizes envelope + rule → Studio implements NLP.

### SW-027 — BDC-to-floor handoff, no follow-up note within 24h
- **Blocker:** handoff/follow-up identity, stable keys, note-within-window join unproved; corpus supporting
  only; content unread (protected envelope + Duane authority + stable keys + minimization required); "24h" starter.
- **Then:** Codex metadata identity/key proof (no content) → Duane authorizes envelope + rule → Studio implements.

## Boundaries

- Missing is not zero; unproved is not unavailable; no proxy/inference/synthetic source/invented
  denominator/inferred history.
- Accepted rows preserved byte-semantically; not recomputed/regraded/reinterpreted; no content reopened.
- Known component evidence is supporting-only; never erased, never promoted.
- No source substitution; no absolute claim of export/source absence or predetermined external
  requirement; finite VinSolutions-or-named-external read-only check first.
- Content stays unread in J1; NLP/media detection requires a Duane-authorized protected-content envelope
  + stable keys + minimization; no PII/raw rows.
- Quarantined families are terminal and not used/normalized/cured on clean rows.
- No customer output/alert/notification in J1; no measured value/grade/formula/threshold/baseline/
  detection-rule/causal diagnosis authored for the held seven.
- No Nissan/Ford scope. Design-only J1; no activation, no ledger/index change, no J2.
- Duane is never assigned technical investigation/acquisition/admission/accumulation/normalization/
  calculation/implementation.
