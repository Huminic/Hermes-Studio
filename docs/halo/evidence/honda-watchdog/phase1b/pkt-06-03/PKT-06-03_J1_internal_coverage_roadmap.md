# PKT-06-03 — J1 Internal Coverage Roadmap (freeze-candidate, design-only)

Internal (non-customer) roadmap for the 12 Module-6 conditions. Nothing here is emitted, promoted, or
acquired in J1. It records exact blockers, needed sources/keys, definition/threshold decisions, owners,
immediate/subsequent actions, next safe source action, and review points.

- **Baseline:** `76ddfde6ffc52233b04155409f22e67c6242f5dd`
- **Scope:** Serra Honda 21043 **Sales only**; Service/Parts/service-source/cross-rooftop admitted = 0
- **Emission authority:** false (hidden, non-alert, non-customer)
- **Lifecycle:** all twelve = `source_investigation_pending` (unproved / not_acquired / not_measured / draft).
- **Owners:** Codex = read-only proof/acquisition/admission (including handoff event); Studio = later
  NLP/classifiers/thread reconstruction/scoring/implementation/tests; Duane = semantics, thresholds,
  handoff/urgency/needs definitions, protected-content authority, outcome changes.

## Per-ID disposition / owner / next action

| ID | Canonical condition (catalog, byte-exact) | Disposition | Next-action owner | Immediate (safe) action |
|---|---|---|---|---|
| SW-158 | Customer mentions credit challenge — no special finance handoff. | SIP | Codex | Read-only proof of stable identity/chronology + a governed handoff event/source (no content) |
| SW-159 | Customer expresses urgency ("this weekend", "before month-end") with no urgency mirrored back. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-185 | Rep asks customer for the same info twice (didn't read prior messages). | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-200 | Customer's stated vehicle interest changes 3+ times in a thread (unclear discovery). | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-201 | Rep never confirms customer's actual need (family size, use case, budget). | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-202 | Language mismatch — customer writes in Spanish/other, rep replies in English only. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-203 | Reading level of rep's messages far above/below customer's (mismatch). | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-205 | Emotional escalation curve — sentiment worsens across each message. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-206 | Repeated question (customer asks same thing 3+ times) — rep is dodging. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-285 | Intent classifier: buying-signal, information-seeking, objection, complaint, exit. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-287 | Question-answer alignment: did rep's reply address customer's actual question? | SIP | Codex | Read-only proof of stable identity/chronology (no content) |
| SW-289 | Personalization score: template detection vs custom content ratio. | SIP | Codex | Read-only proof of stable identity/chronology (no content) |

`SIP` = source_investigation_pending. Numbers in the conditions are catalog starter phrases, **not**
ratified thresholds. Interpretation labels are unproved labels, **not** facts.

## Source slices (6) — evidence gap, owner, next safe action, review point

### credit_urgency — SW-158, SW-159
- **Evidence gap:** corpus supporting-only (labels not identity). SW-158 — credit-challenge mention,
  a **governed special-finance handoff event/source**, and linkage unproved; a missing handoff must
  **not** be inferred without a governed event/source. SW-159 — urgency detection + mirrored-urgency
  semantics unproved. Stable identity unproved; **content unread**.
- **Owner:** Codex (identity/chronology + handoff-event proof, no content). **Definitions + protected
  authority:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology + handoff-event check;
  aggregate-only, NO content read, no PII/raw rows.
- **Review point:** on J2, after identity/chronology + event proof + protected envelope + rules.

### repeated_info_context — SW-185
- **Evidence gap:** repeated-ask ("didn't read") semantics + stable thread identity + chronology
  unproved; **content unread**. "didn't read" is an unproved motive label, not a fact; no accusation.
- **Owner:** Codex (identity/chronology proof, no content). **Rule + protected authority:** Duane.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity/chronology proof + protected envelope + rule.

### vehicle_needs_discovery — SW-200, SW-201
- **Evidence gap (SW-200):** changing-vehicle-interest ("3+ times") detection, chronology, and rule
  unproved; poor discovery must **not** be inferred from changing interest without a rule and stable
  chronology; "unclear discovery" is an unproved label. **(SW-201):** customer-need confirmation
  semantics + stable identity unproved. **Content unread**.
- **Owner:** Codex (identity/chronology proof, no content). **Rules + protected authority:** Duane.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity/chronology proof + protected envelope + rules.

### language_readability — SW-202, SW-203
- **Evidence gap:** language detection + mismatch (SW-202) and reading-level estimation + mismatch
  (SW-203) + stable identity unproved; **content unread**.
- **Owner:** Codex (identity proof, no content). **Rules + protected authority:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity proof + protected envelope + rules.

### emotional_repeated_questions — SW-205, SW-206
- **Evidence gap (SW-205):** emotional-escalation trajectory (worsening sentiment) + chronology + stable
  identity unproved; "emotional escalation" is an unproved label. **(SW-206):** repeated-question
  ("3+ times") detection + stable identity unproved; "dodging" is an unproved motive label, no
  accusation. **Content unread**.
- **Owner:** Codex (identity/chronology proof, no content). **Rules + protected authority:** Duane.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity/chronology proof + protected envelope + rules.

### intent_alignment_personalization — SW-285, SW-287, SW-289
- **Evidence gap:** intent-classification (SW-285), question-answer alignment (SW-287), and
  personalization scoring (SW-289) semantics + stable identity unproved; provisional intent/alignment/
  personalization labels are not facts; **content unread**.
- **Owner:** Codex (identity proof, no content). **Rules + protected authority:** Duane. **Implementer:**
  Studio (classifiers/scoring under envelope).
- **Next safe source action:** Codex bounded read-only stable-identity/chronology check; aggregate-only,
  NO content read, no PII/raw rows.
- **Review point:** on J2, after identity proof + protected envelope + rules.

## Held IDs — exact blockers and required future contract

### SW-158 — credit challenge, no finance handoff
- **Blocker:** credit-challenge mention, governed handoff event/source, and linkage unproved; a missing
  handoff must not be inferred without a governed event/source; content unread.
- **Then:** Codex identity + handoff-event proof (no content) → Duane authorizes envelope + handoff definition → Studio implements.

### SW-159 — urgency not mirrored
- **Blocker:** urgency detection + mirrored-urgency semantics + stable identity unproved; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + urgency definition → Studio implements.

### SW-185 — same info asked twice (didn't read)
- **Blocker:** repeated-ask semantics + stable thread identity + chronology unproved; content unread;
  "didn't read" is an unproved motive label, not a fact; no accusation.
- **Then:** Codex identity/chronology proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-200 — vehicle interest changes 3+ times (unclear discovery)
- **Blocker:** changing-interest detection + chronology + discovery rule unproved; poor discovery must
  not be inferred without a rule and stable chronology; content unread.
- **Then:** Codex identity/chronology proof (no content) → Duane authorizes envelope + discovery rule → Studio implements.

### SW-201 — need never confirmed
- **Blocker:** need-confirmation (family size/use case/budget) semantics + stable identity unproved; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + needs definition → Studio implements.

### SW-202 — language mismatch
- **Blocker:** language detection + customer/rep pairing + stable identity unproved; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + language rule → Studio implements.

### SW-203 — reading-level mismatch
- **Blocker:** reading-level estimation + mismatch + stable identity unproved; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-205 — emotional escalation
- **Blocker:** emotional-trajectory semantics + chronology + stable identity unproved; content unread;
  "emotional escalation" is an unproved label.
- **Then:** Codex identity/chronology proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-206 — repeated question (dodging)
- **Blocker:** repeated-question detection + stable identity unproved; content unread; "dodging" is an
  unproved motive label, no accusation.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-285 — intent classifier
- **Blocker:** intent-classification semantics + stable identity unproved; provisional intent labels not facts; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements classifier.

### SW-287 — question-answer alignment
- **Blocker:** alignment semantics + stable thread identity unproved; alignment labels not facts; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements.

### SW-289 — personalization score
- **Blocker:** personalization-scoring semantics + stable identity unproved; personalization labels not facts; content unread.
- **Then:** Codex identity proof (no content) → Duane authorizes envelope + rule → Studio implements scoring.

## Boundaries

- Missing is not zero; unproved is not unavailable; no proxy/inference/synthetic source/invented
  denominator/inferred history.
- Corpus supporting-only; never erased, never promoted; lacks stable IDs; labels not identifiers/findings/linkage.
- No source substitution; no absolute claim of source/export absence or predetermined external need;
  finite VinSolutions-or-named-external read-only check first.
- Content stays unread; NLP requires a Duane-authorized protected-content envelope + stable identities
  + minimization; no PII/raw/quotes/customer/employee IDs; no accusations.
- Interpretation/NLP labels are not asserted as factual diagnoses; no handoff or motive inference.
- Quarantined families are terminal and not used/normalized/cured on clean rows.
- No customer output/alert/notification in J1; no measured value/grade/formula/threshold/baseline/
  detection-rule authored.
- No Nissan/Ford scope. Design-only J1; no activation, no ledger/index change, no J2.
- Duane is never assigned technical investigation/acquisition/admission/accumulation/normalization/
  calculation/implementation.
