# PKT-06-02 — J1 Internal Coverage Roadmap (freeze-candidate, design-only)

Internal (non-customer) roadmap for the 12 Module-6 conditions. Nothing here is emitted, promoted, or
acquired in J1. It records exact blockers, needed sources/keys, definition/threshold decisions,
owners, immediate/subsequent actions, next safe source action, and review points.

- **Baseline:** `63bd4c0bd087c98ae641663f494f5e174eee742b`
- **Scope:** Serra Honda 21043 **Sales only**; Service/Parts/service-source/cross-rooftop admitted = 0
- **Emission authority:** false (hidden, non-alert, non-customer)
- **Lifecycle:** SW-145, SW-149, SW-150 = accepted carry-forward (Gate 5B; preserved byte-semantically,
  not recomputed, catalog thresholds not replaced); the other nine = `source_investigation_pending`.
- **Owners:** Codex = read-only proof/acquisition/admission; Studio = later NLP/calcs/thread
  reconstruction/implementation/tests; Duane = semantic definitions, thresholds, protected-content
  authority, outcome changes.

## Per-ID disposition / owner / next action

| ID | Canonical condition (catalog, byte-exact) | Disposition | Next-action owner | Immediate (safe) action |
|---|---|---|---|---|
| SW-145 | Same message body sent to >5 customers in a day (copy-paste factory). | **ACCEPTED** | Codex | Preserve Gate 5B state byte-for-byte (no recompute; no threshold replacement; no content reopened) |
| SW-146 | Zero questions asked by rep across entire thread (no discovery). | SIP | Codex | Read-only proof of stable message/thread identity + chronology (no content) |
| SW-147 | Rep never mentions customer's stated vehicle of interest by name/trim. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-148 | No pricing, payment, or next-step CTA in any rep message across 5+ exchanges. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-149 | Rep's messages average <15 words (low-effort replies). | **ACCEPTED** | Codex | Preserve Gate 5B state byte-for-byte (no recompute; no threshold replacement; no content reopened) |
| SW-150 | Rep only sends links, no conversational context. | **ACCEPTED** | Codex | Preserve Gate 5B state byte-for-byte (no recompute; no threshold replacement; no content reopened) |
| SW-151 | Missing greeting/sign-off patterns typical of the store's top performers. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-152 | Customer mentions price/payment concern and rep doesn't address it in reply. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-153 | Customer asks about financing/credit and rep pivots away without answering. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-155 | Customer provides trade info voluntarily, no trade appraisal offer follows. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-156 | Customer asks for out-the-door price 2+ times without receiving one. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-157 | Rep responds to "how much" with only "come in and let's talk" (evasion pattern). | SIP | Codex | Read-only proof of stable identity/chronology (no content) |

`ACCEPTED` = measured_validated carry-forward. `SIP` = source_investigation_pending. Numbers in the
conditions are catalog starter phrases, **not** ratified thresholds.

## Source slices (6) — evidence gap, owner, next safe action, review point

### message_reuse — SW-145 (accepted)
- **Accepted truth:** Gate 5B (0.4% = 3/731, breach, peer 2/3 not tied, high confidence, CRM messaging
  log). Preserved byte-for-byte; no threshold replacement; no content reopened.
- **Owner:** Codex (preservation). **Future display / recompute:** Duane (recompute under protected envelope).
- **Next safe source action:** none required in J1 (preserved as-is). **Review:** next accepted period.

### discovery_vehicle — SW-146, SW-147
- **Evidence gap:** corpus supporting-only (labels not identity); discovery (question-asking) semantics
  (SW-146) and VOI mention / name-trim matching (SW-147) unproved; stable identity/chronology unproved;
  **content unread**. "no discovery" is hypothesis/rule label, not a fact.
- **Owner:** Codex (identity/chronology proof, no content). **Semantics/rule + protected authority:** Duane.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity/chronology proof + protected envelope + rule.

### engagement_context — SW-148, SW-149, SW-150
- **Evidence gap (SW-148):** pricing/payment/next-step CTA semantics + "5+ exchanges" chronology + stable
  identity unproved; **content unread**. **(SW-149, SW-150) accepted:** Gate 5B truth (149 = 18.2% = 2/11,
  breach, peer 3/3 not tied, low confidence; 150 = 0% = 0/11, healthy, peer 1/3 tied, low confidence);
  preserved byte-for-byte; no threshold replacement; no content reopened.
- **Owner:** Codex (SW-148 identity proof, no content; SW-149/150 preservation). **CTA rule + protected
  authority / future display + recompute:** Duane. **Implementer:** Studio.
- **Next safe source action:** SW-148 — Codex bounded read-only stable-identity/chronology check (no
  content); SW-149/150 — none in J1 (preserved as-is).
- **Review point:** SW-148 on J2 after identity proof + protected envelope + rule; SW-149/150 next
  accepted period (recompute under a protected-content envelope).

### greeting_signoff — SW-151
- **Evidence gap:** greeting/sign-off pattern semantics + top-performer baseline + stable identity
  unproved; **content unread**.
- **Owner:** Codex (identity proof, no content). **Rule + protected authority:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity proof + protected envelope + rule.

### price_finance — SW-152, SW-153
- **Evidence gap:** price/payment-concern Q&A linkage (SW-152) and financing/credit Q&A linkage /
  "pivots away" semantics (SW-153) unproved; stable identity unproved; **content unread**. Provisional
  labels are not facts.
- **Owner:** Codex (identity proof, no content). **Rules + protected authority:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity proof + protected envelope + rules.

### trade_otd_evasion — SW-155, SW-156, SW-157
- **Evidence gap:** trade-info-then-appraisal-offer linkage (SW-155), out-the-door-price request/response
  + "2+ times" detection + chronology (SW-156), and price-evasion semantics (SW-157) unproved; stable
  identity unproved; **content unread**. "evasion pattern" is a hypothesis/rule label, not a fact.
- **Owner:** Codex (identity/chronology proof, no content). **Rules + protected authority:** Duane.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity/chronology proof + protected envelope + rules.

## Held IDs — exact blockers and required future contract

### SW-146 — zero questions asked (no discovery)
- **Blocker:** discovery (question-asking) semantics + stable identity unproved; content unread; "no
  discovery" is hypothesis/rule label, not a fact.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + discovery rule → Studio implements NLP.

### SW-147 — never mentions VOI by name/trim
- **Blocker:** VOI mention semantics + name/trim matching + stable identity unproved; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-148 — no pricing/payment/CTA in 5+ exchanges
- **Blocker:** CTA/next-step semantics + "5+ exchanges" chronology + stable identity unproved; content unread.
- **Then:** Codex chronology/identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-151 — missing greeting/sign-off vs top performers
- **Blocker:** greeting/sign-off pattern semantics + top-performer baseline + stable identity unproved; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-152 — price concern not addressed
- **Blocker:** price/payment-concern Q&A linkage + stable identity unproved; content unread; provisional labels not facts.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-153 — financing question, rep pivots away
- **Blocker:** financing/credit Q&A linkage + "pivots away" semantics + stable identity unproved; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-155 — trade info volunteered, no appraisal offer
- **Blocker:** trade-info-then-appraisal-offer linkage + stable identity unproved; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-156 — OTD price asked 2+ times without receiving
- **Blocker:** OTD-price request/response linkage + "2+ times" detection + chronology unproved; content unread.
- **Then:** Codex chronology/identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-157 — "how much" answered with "come in" (evasion)
- **Blocker:** price-evasion semantics + stable identity unproved; content unread; "evasion pattern" is a hypothesis/rule label, not a fact.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-145 / SW-149 / SW-150 — accepted
- **State:** accepted carry-forward (Gate 5B). Preserved byte-for-byte; catalog thresholds not replaced;
  no content reopened. **Then:** Duane authorizes any future customer display / recompute separately
  (recompute under a protected-content envelope).

## Boundaries

- Missing is not zero; unproved is not unavailable; no proxy/inference/synthetic source/invented
  denominator/inferred history.
- Accepted rows preserved byte-semantically; not recomputed/regraded/reinterpreted; catalog thresholds
  not replaced; no content reopened.
- Corpus supporting-only; never erased, never promoted; labels not identifiers/findings/linkage.
- No source substitution; no absolute claim of source/export absence or predetermined external need;
  finite VinSolutions-or-named-external read-only check first.
- Content stays unread; NLP requires a Duane-authorized protected-content envelope + stable identities
  + minimization; no PII/raw/quotes/customer/employee IDs; no accusations.
- Quarantined families are terminal and not used/normalized/cured on clean rows.
- Provisional NLP / rule labels are not asserted as factual diagnoses.
- No customer output/alert/notification in J1; no measured value/grade/formula/threshold/baseline/
  detection-rule authored for the held nine.
- No Nissan/Ford scope. Design-only J1; no activation, no ledger/index change, no J2.
- Duane is never assigned technical investigation/acquisition/admission/accumulation/normalization/
  calculation/implementation.
