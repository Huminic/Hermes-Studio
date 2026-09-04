# PKT-06-01 — J1 Internal Coverage Roadmap (freeze-candidate, design-only)

Internal (non-customer) roadmap for the 12 Module-6 conditions. Nothing here is emitted, promoted, or
acquired in J1. It records exact blockers, needed sources/keys, definition/threshold decisions,
owners, immediate/subsequent actions, next safe source action, and review points.

- **Baseline:** `6a22f0067a372a78f8aa9d76a044aeb4f27d6327`
- **Scope:** Serra Honda 21043 **Sales only**; Service/Parts/service-source/cross-rooftop admitted = 0
- **Emission authority:** false (hidden, non-alert, non-customer)
- **Lifecycle:** SW-142 = accepted carry-forward (Gate 5B; preserved byte-semantically incl.
  `{{FirstName}}`, not recomputed); the other eleven = `source_investigation_pending`.
- **Owners:** Codex = read-only proof/acquisition/admission; Studio = later NLP/calcs/thread
  reconstruction/implementation/tests; Duane = semantic definitions, thresholds/windows, language/
  escalation rules, protected-content authority, outcome changes.

## Per-ID disposition / owner / next action

| ID | Canonical condition (catalog, byte-exact) | Disposition | Next-action owner | Immediate (safe) action |
|---|---|---|---|---|
| SW-070 | Negative sentiment spike in inbound customer messages (NLP >2σ). | SIP | Codex | Read-only proof of stable message/thread identity + chronology (no content) |
| SW-071 | Customer uses churn/competitor language ("just looking elsewhere", "cancel"). | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-072 | Price/payment objection appears in first 2 messages (early friction). | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-073 | Customer requests manager escalation and no manager note logged. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-074 | Profanity or complaint keywords in customer thread without escalation flag. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-075 | Repeated question from customer (same ask 3+ times) — indicates rep not answering. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-076 | Response latency between customer and rep grows across a thread (fade-out). | SIP | Codex | Metadata-only proof (timestamp/direction/thread-key); no measurement without stable chronology |
| SW-077 | Customer thread goes silent >5 days after high-intent message. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-078 | Language mismatch (customer writes Spanish, rep replies English only). | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-142 | Rep uses generic template with unfilled merge tags ("Hi {{FirstName}}"). | **ACCEPTED** | Codex | Preserve Gate 5B state byte-for-byte incl. `{{FirstName}}` (no recompute; no content reopened) |
| SW-143 | Reply doesn't answer the specific question asked (semantic mismatch). | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-144 | Rep's message ignores information the customer already provided. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |

`ACCEPTED` = measured_validated carry-forward. `SIP` = source_investigation_pending. Numbers in the
conditions are catalog starter phrases, **not** ratified thresholds.

## Source slices (6) — evidence gap, owner, next safe action, review point

### sentiment_and_churn_language — SW-070, SW-071
- **Evidence gap:** communication corpus supporting-only (15-field source lacks stable IDs; labels not
  identity); sentiment semantics / >2σ method / baseline (SW-070) and churn/competitor semantics
  (SW-071) unproved; **content unread**. "negative sentiment" / "churn" are hypothesis/rule
  vocabulary, not facts.
- **Owner:** Codex (identity/chronology proof, no content). **Semantics/rule + protected authority:**
  Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity/chronology proof + protected envelope + rule.

### price_friction_and_escalation — SW-072, SW-073
- **Evidence gap:** first-two-message ordering + early-friction semantics (SW-072) and manager-
  escalation-request + note linkage (SW-073) unproved; stable chronology/identity unproved; **content unread**.
- **Owner:** Codex (identity/chronology proof, no content). **Rules + protected authority:** Duane.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity/chronology proof + protected envelope + rules.

### complaint_and_repeated_questions — SW-074, SW-075
- **Evidence gap:** complaint/profanity keyword + escalation-flag linkage (SW-074) and repeated-question
  semantics / "3+ times" detection (SW-075) unproved; **content unread**. "rep not answering" is
  hypothesis/rule vocabulary, not a fact.
- **Owner:** Codex (identity/chronology proof, no content). **Rules + protected authority:** Duane.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity/chronology proof + protected envelope + rules.

### thread_timing_and_silence — SW-076, SW-077
- **Evidence gap (SW-076):** growing-latency requires a stable chronology; **metadata-only** proof
  (timestamp/direction/thread-key) may begin, but **no measurement** without stable chronology; no
  content. **(SW-077):** high-intent-then-silence pattern, ">5 days" window, and stable thread identity
  unproved; "high-intent" labels are provisional; **content unread**.
- **Owner:** Codex (metadata/identity proof, no content). **Rules/windows + protected authority
  (SW-077):** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only metadata (SW-076) / stable-identity (SW-077)
  check; aggregate-only, NO content read, no PII/raw rows.
- **Review point:** on J2, after metadata/identity proof + (SW-077) protected envelope + rule.

### language_and_personalization — SW-078, SW-142
- **Evidence gap (SW-078):** language detection + customer/rep language-mismatch pairing + stable
  identity unproved; **content unread**. **(SW-142) accepted:** Gate 5B truth (0/800 = 0%, healthy,
  peer rank 1/3 tied, high confidence, source CRM messaging log); `{{FirstName}}` literal preserved;
  no content reopened; any recompute requires a protected-content envelope.
- **Owner:** Codex (SW-078 identity proof, no content; SW-142 preservation). **Language rule +
  protected authority / future display + recompute authorization:** Duane. **Implementer:** Studio.
- **Next safe source action:** SW-078 — Codex bounded read-only stable-identity/language check (no
  content); SW-142 — none required in J1 (preserved as-is).
- **Review point:** SW-078 on J2 after identity proof + protected envelope + rule; SW-142 next accepted
  period (recompute under a protected-content envelope).

### answer_and_context_quality — SW-143, SW-144
- **Evidence gap:** question-answer relevance / semantic-mismatch (SW-143) and context-ignored /
  already-provided information (SW-144) semantics + stable thread identity unproved; **content unread**.
- **Owner:** Codex (identity/chronology proof, no content). **Rules + protected authority:** Duane.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity/chronology proof + protected envelope + rules.

## Held IDs — exact blockers and required future contract

### SW-070 — negative sentiment spike (NLP >2σ)
- **Blocker:** sentiment semantics / >2σ method / baseline / stable identity unproved; content unread;
  "negative sentiment" is hypothesis/rule vocabulary, not a fact.
- **Then:** Codex identity/chronology proof (no content) → Duane authorizes envelope + sentiment rule → Studio implements NLP.

### SW-071 — churn/competitor language
- **Blocker:** churn/competitor semantics + stable identity unproved; content unread; "churn" is hypothesis/rule vocabulary.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements NLP.

### SW-072 — price objection in first 2 messages
- **Blocker:** first-two ordering + early-friction semantics + stable chronology unproved; content unread.
- **Then:** Codex chronology/identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-073 — manager escalation, no manager note
- **Blocker:** escalation-request semantics + manager-note linkage + stable identity unproved; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-074 — profanity/complaint without escalation flag
- **Blocker:** complaint/profanity keyword semantics + escalation-flag linkage unproved; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-075 — repeated question 3+ times (rep not answering)
- **Blocker:** repeated-question semantics + "3+ times" detection unproved; content unread; "rep not answering" is hypothesis/rule vocabulary.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-076 — response latency grows across thread (fade-out)
- **Blocker:** growing latency requires a stable chronology; metadata-only proof may begin but no
  measurement without stable chronology; no content.
- **Then:** Codex metadata proof (timestamp/direction/thread-key) → Duane ratifies fade-out rule + windows → Studio implements after stable chronology.

### SW-077 — thread silent >5 days after high-intent
- **Blocker:** high-intent-then-silence pattern + ">5 days" window + stable thread identity unproved;
  "high-intent" labels provisional; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule/window → Studio implements.

### SW-078 — language mismatch
- **Blocker:** language detection + customer/rep pairing + stable identity unproved; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + language rule → Studio implements.

### SW-142 — unfilled merge tags (ACCEPTED)
- **State:** accepted carry-forward (Gate 5B; 0/800 = 0%, healthy, peer rank 1/3 tied, high confidence).
  Preserved byte-for-byte incl. `{{FirstName}}` literal; no content reopened.
- **Then:** Duane authorizes any future customer display / recompute separately (recompute under a protected-content envelope).

### SW-143 — reply doesn't answer the question (semantic mismatch)
- **Blocker:** question-answer relevance semantics + stable thread identity unproved; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-144 — message ignores information already provided
- **Blocker:** context-ignored semantics + stable thread identity unproved; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

## Boundaries

- Missing is not zero; unproved is not unavailable; no proxy/inference/synthetic source/invented
  denominator/inferred history.
- Accepted row preserved byte-semantically (incl. `{{FirstName}}`); not recomputed/regraded/reinterpreted; no content reopened.
- Corpus supporting-only; never erased, never promoted; 15-field source lacks stable IDs; labels not identity.
- No source substitution; no absolute claim of source/export absence or predetermined external need;
  finite VinSolutions-or-named-external read-only check first.
- Content stays unread; NLP requires a Duane-authorized protected-content envelope + stable identities
  + minimization; SW-076 metadata-only; no PII/raw/quotes/customer/employee IDs; no accusations.
- Quarantined families are terminal and not used/normalized/cured on clean rows.
- Provisional NLP / communication labels are not asserted as factual diagnoses.
- No customer output/alert/notification in J1; no measured value/grade/formula/threshold/baseline/
  detection-rule authored for the held eleven.
- No Nissan/Ford scope. Design-only J1; no activation, no ledger/index change, no J2.
- Duane is never assigned technical investigation/acquisition/admission/accumulation/normalization/
  calculation/implementation.
