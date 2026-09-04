# PKT-07-02 — J1 Internal Coverage Roadmap (freeze-candidate, design-only)

Internal (non-customer) roadmap for the 9 Module-7 conditions. Nothing here is emitted, promoted, or
acquired in J1. It records exact blockers, needed sources/keys, definition/threshold decisions, owners,
immediate/subsequent actions, next safe source action, and review points.

- **Baseline:** `f4016a838193369e91a144f6da7a0f586a7ed544`
- **Scope:** Serra Honda 21043 **Sales only**; Service/Parts/service-source/cross-rooftop admitted = 0
- **Emission authority:** false (hidden, non-alert, non-customer)
- **Lifecycle:** all nine = `source_investigation_pending` (unproved / not_acquired / not_measured / draft).
- **Owners:** Codex = read-only proof/acquisition/admission; Studio = later NLP/trends/classifiers/
  implementation/tests; Duane = semantics, thresholds, windows, protected-content authority, permitted
  alert use, outcome changes.

## Per-ID disposition / owner / next action

| ID | Canonical condition (catalog, byte-exact) | Disposition | Next-action owner | Immediate (safe) action |
|---|---|---|---|---|
| SW-170 | Negative sentiment score on customer's last 2 messages (NLP flag). | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-171 | Escalating punctuation (!!!, ???, ALL CAPS) from customer. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-172 | Profanity, slurs, or complaint keywords in either direction. | SIP | Codex | Read-only proof of stable identity/chronology (no content; **no profanity/slur text**) |
| SW-173 | Rep tone flagged as pushy/aggressive by sentiment model. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-174 | Customer uses words like "frustrated", "disappointed", "unprofessional", "misled". | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-175 | Sarcasm or passive-aggressive patterns detected in customer replies. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-176 | Rep sentiment inconsistent — polite then curt (mood-driven service). | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-177 | Customer requests to speak to a manager or "someone else". | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-178 | Apology count from rep >2 in single thread (something went wrong). | SIP | Codex | Read-only proof of stable identity/chronology (no content; **apology count not proof of failure**) |

`SIP` = source_investigation_pending. Numbers in the conditions are catalog starter phrases, **not**
ratified thresholds; example phrases remain only as immutable condition text. All interpretations are
provisional models for human review, **not** facts or disciplinary evidence.

## Source slices (6) — evidence gap, owner, next safe action, review point

### customer_sentiment_trend — SW-170
- **Evidence gap:** last-two-message ordering + sentiment-model semantics + stable identity unproved;
  **content unread**; the sentiment score is a provisional model output, not a fact.
- **Owner:** Codex (identity/chronology proof, no content). **Rule + permitted alert use + protected
  authority:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity/chronology proof + protected envelope + rule + permitted-alert-use.

### punctuation_profanity_complaint — SW-171, SW-172, SW-174
- **Evidence gap:** escalating-punctuation (SW-171), profanity/slur/complaint context (SW-172, **no
  profanity/slur text retained**), and frustration/complaint-language (SW-174) semantics + stable
  identity unproved; **content unread**; provisional models, not facts.
- **Owner:** Codex (identity proof, no content/profanity text). **Rules + protected authority:** Duane.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows/profanity-slur text.
- **Review point:** on J2, after identity proof + protected envelope + rules + permitted-alert-use.

### rep_tone_consistency — SW-173, SW-176
- **Evidence gap:** rep pushy/aggressive tone (SW-173) and rep sentiment inconsistency / mood-driven
  (SW-176) are **provisional model outputs, not facts** and **not disciplinary findings**; semantics +
  chronology + stable identity unproved; **content unread**.
- **Owner:** Codex (identity/chronology proof, no content). **Rules + protected authority + permitted
  (human-review-only) use:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity/chronology proof + protected envelope + rules.

### sarcasm_passive_aggression — SW-175
- **Evidence gap:** sarcasm/passive-aggression detection is a **provisional model output, not a fact**;
  semantics + stable identity unproved; **content unread**.
- **Owner:** Codex (identity proof, no content). **Rule + protected authority:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity proof + protected envelope + rule.

### manager_escalation — SW-177
- **Evidence gap:** manager-escalation request semantics + stable identity unproved; **content unread**;
  provisional, not a fact.
- **Owner:** Codex (identity proof, no content). **Rule + protected authority + permitted alert use:**
  Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity proof + protected envelope + rule + permitted-alert-use.

### apology_frequency — SW-178
- **Evidence gap:** apology-count ('>2 in a thread') detection + meaning unproved; **an apology count is
  NOT proof of failure or wrongdoing**; stable identity unproved; **content unread**; provisional, not
  a fact.
- **Owner:** Codex (identity proof, no content). **Rule + protected authority + permitted (human-review)
  use:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity proof + protected envelope + rule + permitted-alert-use.

## Held IDs — exact blockers and required future contract

### SW-170 — negative sentiment last 2 messages
- **Blocker:** last-two ordering + sentiment-model semantics + stable identity unproved; content unread; provisional model, not a fact.
- **Then:** Codex identity/chronology proof (no content) → Duane authorizes envelope + rule + permitted-alert-use → Studio implements trend.

### SW-171 — escalating punctuation
- **Blocker:** escalating-punctuation semantics + chronology + stable identity unproved; content unread; provisional.
- **Then:** Codex identity/chronology proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-172 — profanity / slur / complaint
- **Blocker:** profanity/slur/complaint context + stable identity unproved; content unread; no profanity/slur text retained; provisional.
- **Then:** Codex identity proof (no content/profanity text) → Duane authorizes envelope + rule → Studio implements.

### SW-173 — rep tone pushy/aggressive (model)
- **Blocker:** pushy/aggressive tone is a provisional model output, not a fact and not a disciplinary finding; semantics + chronology + stable identity unproved; content unread.
- **Then:** Codex identity/chronology proof (no content) → Duane authorizes envelope + rule + human-review-only use → Studio implements.

### SW-174 — frustration/complaint words
- **Blocker:** frustration/complaint-language semantics + stable identity unproved; content unread; provisional.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-175 — sarcasm / passive-aggression
- **Blocker:** sarcasm/passive-aggression detection is a provisional model output, not a fact; semantics + stable identity unproved; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-176 — rep sentiment inconsistent (mood-driven)
- **Blocker:** mood-driven inconsistency is a provisional model output, not a fact and not a disciplinary finding; semantics + chronology + stable identity unproved; content unread.
- **Then:** Codex identity/chronology proof (no content) → Duane authorizes envelope + rule + human-review-only use → Studio implements.

### SW-177 — manager request
- **Blocker:** manager-escalation request semantics + stable identity unproved; content unread; provisional.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule + permitted-alert-use → Studio implements.

### SW-178 — apology count >2 (sensitive framing)
- **Blocker:** apology-count detection + meaning unproved; **an apology count is not proof of failure**;
  stable identity unproved; content unread; provisional.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule + human-review-only use → Studio implements.

## Boundaries

- Missing is not zero; unproved is not unavailable; no proxy/inference/synthetic source/invented
  denominator/inferred history.
- Corpus supporting-only; never erased, never promoted; lacks stable IDs; labels/keywords not identifiers/findings/linkage.
- No source substitution; no absolute claim of source/export absence or predetermined external need;
  finite VinSolutions-or-named-external read-only check first.
- Content stays unread; NLP requires a Duane-authorized protected-content envelope + stable identities
  + minimization; no PII/raw/quotes/customer/employee IDs/profanity-slur text; no accusations.
- Interpretations are provisional models for human review only; never automatic discipline, adverse
  employment, or factual claims; an apology count is not proof of failure (SW-178).
- Quarantined families are terminal and not used/normalized/cured on clean rows.
- No customer output/alert/notification in J1; no measured value/grade/formula/threshold/baseline/detection-rule authored.
- No Nissan/Ford scope. Design-only J1; no activation, no ledger/index change, no J2.
- Duane is never assigned technical investigation/acquisition/admission/accumulation/normalization/calculation/implementation.
