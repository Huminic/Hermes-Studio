# PKT-07-01 — J1 Internal Coverage Roadmap (freeze-candidate, design-only)

Internal (non-customer) roadmap for the 9 Module-7 conditions. Nothing here is emitted, promoted, or
acquired in J1. It records exact blockers, needed sources/keys, definition/threshold decisions, owners,
immediate/subsequent actions, next safe source action, and review points.

- **Baseline:** `5834c5e7dcc6bf6c03f3877fb2b68d0526c37840`
- **Scope:** Serra Honda 21043 **Sales only**; Service/Parts/service-source/cross-rooftop admitted = 0
- **Emission authority:** false (hidden, non-alert, non-customer)
- **Lifecycle:** all nine = `source_investigation_pending` (unproved / not_acquired / not_measured / draft).
- **Owners:** Codex = read-only proof/acquisition/admission; Studio = later NLP/thread reconstruction/
  classifiers/aggregation/implementation/tests; Duane = semantics, thresholds, windows, protected-content
  and sensitive-content authority, outcome changes.

## Per-ID disposition / owner / next action

| ID | Canonical condition (catalog, byte-exact) | Disposition | Next-action owner | Immediate (safe) action |
|---|---|---|---|---|
| SW-161 | Customer mentions competitor dealer/brand by name. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-162 | Phrases like "shopping around", "getting other quotes", "still looking". | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-163 | "Never mind", "not interested anymore", "take me off your list". | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-164 | Customer references a specific competing offer ("[other dealer] offered me X"). | SIP | Codex | Read-only proof of stable identity/chronology (no content; no offer details) |
| SW-165 | Customer asks for OTD/final number after previously being warm (comparison-shopping mode). | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-166 | Customer's tone shifts from questions to short replies ("k", "ok", "maybe"). | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-167 | Long silence (>7 days) after previously daily engagement. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-168 | Customer asks to "pause", "think about it", or "revisit next month". | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-169 | Mentions of life event that delays purchase (job change, move, medical). | SIP | Codex | Read-only proof of stable identity/chronology (no content; **no life-event detail retained**) |

`SIP` = source_investigation_pending. Numbers in the conditions are catalog starter phrases, **not**
ratified thresholds; example phrases remain only as immutable condition text. All signals are
hypotheses, **not** confirmed intent.

## Source slices (6) — evidence gap, owner, next safe action, review point

### competitor_mentions_offers — SW-161, SW-164
- **Evidence gap:** corpus supporting-only (labels not identity). SW-161 — competitor identity + mention
  semantics + stable identity unproved. SW-164 — specific competing-offer reference + **offer details**
  (must not be retained) + stable identity unproved. **Content unread**; hypotheses, not confirmed intent.
- **Owner:** Codex (identity proof, no content/offer details). **Semantics/rule + protected authority:**
  Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows/quotes/offer details.
- **Review point:** on J2, after identity/chronology proof + protected envelope + rules.

### shopping_exit — SW-162, SW-163
- **Evidence gap:** comparison-shopping (SW-162) and exit-intent (SW-163) semantics + stable identity
  unproved; **content unread**; hypotheses, not confirmed intent.
- **Owner:** Codex (identity proof, no content). **Rules + protected authority:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity proof + protected envelope + rules.

### otd_comparison — SW-165
- **Evidence gap:** prior warmth + OTD-after-warm transition + chronology + "comparison-shopping mode"
  unproved; **content unread**; hypothesis, not confirmed intent.
- **Owner:** Codex (identity/chronology proof, no content). **Rule + protected authority:** Duane.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity/chronology proof + protected envelope + rule.

### tone_engagement_decay — SW-166, SW-167
- **Evidence gap:** tone-shift semantics + chronology (SW-166) and prior daily-engagement baseline +
  silence duration + chronology (SW-167) + stable identity unproved; **content unread**; disengagement
  is a hypothesis.
- **Owner:** Codex (identity/chronology proof, no content). **Rules/windows + protected authority:**
  Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity/chronology proof + protected envelope + rules.

### pause_defer — SW-168
- **Evidence gap:** pause/defer semantics + stable identity unproved; **content unread**; purchase-delay
  is a hypothesis, not confirmed intent.
- **Owner:** Codex (identity proof, no content). **Rule + protected authority:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity proof + protected envelope + rule.

### sensitive_life_event_delay — SW-169
- **Evidence gap:** life-event delay + its causation unproved; **content unread**. **Extra sensitivity:**
  no medical/employment/moving/life-event detail retained/exposed/targeted/verified; only a separately
  approved privacy-safe aggregate rule under **Duane sensitive-content authority**. Hypothesis, not
  confirmed intent; life-event causation must not be asserted.
- **Owner:** Codex (identity proof, no content/detail). **Privacy-safe aggregate rule + sensitive
  authority:** Duane. **Implementer:** Studio (aggregate only).
- **Next safe source action:** Codex bounded read-only stable-identity check (no content, no detail);
  aggregate-only, no PII/raw rows.
- **Review point:** on J2, after identity proof + protected envelope + sensitive-content authorization + privacy-safe aggregate rule.

## Held IDs — exact blockers and required future contract

### SW-161 — competitor mention
- **Blocker:** competitor identity + mention semantics + stable identity unproved; content unread; hypothesis, not confirmed churn/intent.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-162 — shopping-around language
- **Blocker:** comparison-shopping semantics + stable identity unproved; content unread; hypothesis, not confirmed intent.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-163 — exit/disinterest language
- **Blocker:** exit-intent semantics + stable identity unproved; content unread; hypothesis, not confirmed intent.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-164 — specific competing offer
- **Blocker:** competing-offer reference + offer details (must not be retained) + stable identity unproved; content unread; hypothesis.
- **Then:** Codex identity proof (no content/offer details) → Duane authorizes envelope + rule → Studio implements.

### SW-165 — OTD after warm (comparison mode)
- **Blocker:** prior warmth + OTD-after-warm transition + chronology + comparison-mode semantics unproved; content unread; hypothesis.
- **Then:** Codex identity/chronology proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-166 — tone shift
- **Blocker:** tone-shift semantics + chronology + stable identity unproved; content unread; hypothesis, not confirmed disengagement.
- **Then:** Codex identity/chronology proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-167 — long silence after daily engagement
- **Blocker:** prior daily-engagement baseline + silence duration + chronology + stable identity unproved; content unread; disengagement is a hypothesis.
- **Then:** Codex identity/chronology proof (no content) → Duane authorizes envelope + window/rule → Studio implements.

### SW-168 — pause / defer
- **Blocker:** pause/defer semantics + stable identity unproved; content unread; purchase-delay is a hypothesis, not confirmed intent.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-169 — life-event delay (sensitive)
- **Blocker:** life-event delay + causation unproved; content unread; **no detail retained/exposed/
  targeted/verified**; privacy-safe aggregate only under Duane sensitive-content authority; hypothesis,
  no causation asserted.
- **Then:** Codex identity proof (no content/detail) → Duane authorizes envelope + sensitive-content
  handling + privacy-safe aggregate rule → Studio implements (aggregate only).

## Boundaries

- Missing is not zero; unproved is not unavailable; no proxy/inference/synthetic source/invented
  denominator/inferred history.
- Corpus supporting-only; never erased, never promoted; lacks stable IDs; labels/keywords not identifiers/findings/linkage.
- No source substitution; no absolute claim of source/export absence or predetermined external need;
  finite VinSolutions-or-named-external read-only check first.
- Content stays unread; NLP requires a Duane-authorized protected-content envelope + stable identities
  + minimization; no PII/raw/quotes/customer/employee IDs/offer details; no accusations.
- Provisional language patterns and sensitive life events are hypotheses, not confirmed intent; no causality asserted.
- SW-169: no life-event detail retained/exposed/targeted/verified; privacy-safe aggregate only under Duane sensitive authority.
- Quarantined families are terminal and not used/normalized/cured on clean rows.
- No customer output/alert/notification in J1; no measured value/grade/formula/threshold/baseline/detection-rule authored.
- No Nissan/Ford scope. Design-only J1; no activation, no ledger/index change, no J2.
- Duane is never assigned technical investigation/acquisition/admission/accumulation/normalization/calculation/implementation.
