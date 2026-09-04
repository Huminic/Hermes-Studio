# PKT-07-03 — J1 Internal Coverage Roadmap (freeze-candidate, design-only)

Internal (non-customer) roadmap for the 8 Module-7 conditions. Nothing here is emitted, promoted, or
acquired in J1. It records exact blockers, needed sources/keys, definition/threshold decisions, owners,
immediate/subsequent actions, next safe source action, and review points.

- **Baseline:** `b5684577c0e0b768c0176e99c0b94d3ded978aa2`
- **Scope:** Serra Honda 21043 **Sales only**; Service/Parts/service-source/cross-rooftop admitted = 0
- **Emission authority:** false (hidden, non-alert, non-customer); no projection
- **Lifecycle:** seven = `source_investigation_pending` (unproved / not_acquired / not_measured / draft);
  SW-199 = `accepted_disposition_only` / `outside_sales_domain` (`proved_outside_sales_domain` /
  not_acquired / not_measured), preserved, no Sales source action.
- **Owners:** Codex = read-only proof/acquisition/admission; Studio = later joins/classifiers/NLP/model/
  implementation/tests; Duane = semantics, thresholds, windows, protected-content authority, permitted
  alert use, compliance semantics, and outcome/boundary decisions; Service domain owner = SW-199 only,
  after separate Duane authorization.

## Per-ID disposition / owner / next action

| ID | Canonical condition (catalog, byte-exact) | Disposition | Next-action owner | Immediate (safe) action |
|---|---|---|---|---|
| SW-181 | Promise made ("I'll call you at 3") with no follow-through logged. | SIP | Codex | Read-only proof of stable thread identity + chronology + linkable follow-through log (no content) |
| SW-182 | Vehicle availability claimed after unit already sold/pending. | SIP | Codex | Read-only proof of exportable sold/pending unit state + stable communication join (no content); UI queue only until export |
| SW-183 | Rep says "manager approved" with no manager note in CRM to back it. | SIP | Codex | Read-only proof of stable thread + exportable manager-note/approval history source + join (no content) |
| SW-193 | Rep makes promise CRM can't substantiate ("guaranteed approval", "lowest price in the state"). | SIP | Codex | Read-only proof of stable identity/chronology + CRM substantiation source (no content) |
| SW-198 | Sold customer receives new prospecting message from another rep (data hygiene). | SIP | Codex | Read-only proof of stable customer/lead identity + sold outcome/state + same-dealer/period join (no content, no label identity) |
| SW-199 | Service advisor and sales rep contact same customer in same week with no coordination. | outside_sales_domain (accepted disposition-only) | Service domain owner | **No Sales source action**; separately authorized Service workspace only, after separate Duane authorization |
| SW-286 | Sentiment tracker: per-message and thread-trend deltas. | SIP | Codex | Read-only proof of stable thread identity + chronology (no content) |
| SW-290 | Escalation predictor: probability this thread ends in complaint/lost/manager escalation. | SIP | Codex | Read-only proof of stable identity/chronology + multiweek labeled outcome availability (no content) |

`SIP` = source_investigation_pending. Numbers/phrases in the conditions are catalog starter phrases,
**not** ratified thresholds; example phrases remain only as immutable condition text. Trust/substantiation
flags are provisional and not proof of a breach; sentiment/escalation interpretations are provisional
models for human review, **not** facts or disciplinary evidence.

## Source slices (6) — evidence gap, owner, next safe action, review point

### promise_followthrough — SW-181
- **Evidence gap:** promise + missing follow-through unproved; requires a stable thread identity +
  message chronology + a linkable follow-through/task log; **content unread**; a missing follow-through
  log is not proof a commitment was broken; provisional, not a fact.
- **Owner:** Codex (identity/chronology proof, no content). **Rule + protected authority:** Duane.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only stable-identity/chronology/state check;
  aggregate/schema/cardinality only, NO content read, no PII/raw rows/quotes, no proxy.
- **Review point:** on J2, after identity/chronology proof + follow-through log join + rule.

### vehicle_claim_validation — SW-182
- **Evidence gap:** availability-claim vs already sold/pending unit unproved; requires an exportable
  sold/pending unit STATE plus a stable same-dealer/period communication join; UI queue only until an
  export source is proved; **content unread**; not proof of misrepresentation; provisional, not a fact.
- **Owner:** Codex (state/join proof, no content). **Rule + protected authority:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only state/join check; aggregate/schema/cardinality
  only, NO content read, no PII/raw rows/quotes, no proxy.
- **Review point:** on J2, after exportable sold/pending state + communication join + rule.

### manager_claim_substantiation — SW-183
- **Evidence gap:** manager-approval claim + absence of a backing manager note unproved; requires a stable
  thread and an exportable manager-note/approval history source + join; **content unread**; a missing note
  is not proof of fabrication; provisional, not a fact.
- **Owner:** Codex (thread + manager-note source + join proof, no content). **Rule + protected authority:**
  Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only thread/source/join check; aggregate/schema/
  cardinality only, NO content read, no PII/raw rows/quotes, no proxy.
- **Review point:** on J2, after stable thread + manager-note/approval history source + join + rule.

### unsubstantiated_compliance_promises — SW-193
- **Evidence gap:** compliance-sensitive promise + CRM inability to substantiate unproved; requires stable
  identity + chronology + a CRM substantiation source; **protected compliance semantics** require Duane
  authority and management human review and are **never a legal conclusion**; **content unread**; not
  proof of a violation; provisional, not a fact.
- **Owner:** Codex (identity/chronology + substantiation source proof, no content). **Protected compliance
  semantics + rule:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only identity/chronology/substantiation-source check;
  aggregate/schema/cardinality only, NO content read, no PII/raw rows/quotes, no proxy.
- **Review point:** on J2, after identity/chronology + CRM substantiation source + protected compliance semantics + rule.

### lifecycle_and_domain_coordination — SW-198, SW-199
- **Evidence gap (SW-198):** post-sale prospecting contact unproved; requires a stable customer/lead
  identity + a sold outcome/state and a same-dealer/period join; customer/provisional labels are **not**
  identity and must not be used as label identity; **content unread** (detection targets sold-state +
  identity + message-event metadata; any 'prospecting' content classification needs a protected envelope);
  provisional, not an accusation.
- **Boundary (SW-199):** **outside the Sales governed boundary**. Preserved per the SPEC §3 separate-
  Service overlay (`service_domain`, 18 IDs). **No Sales source action** (`sales_source_action="none"`,
  `direct_source_fields=[]`); not gradable/displayed/projected; `preserved=true`,
  `reopen_in_sales_allowed=false`, `counted_in_evaluated=false`. Any Service↔Sales coordination work is a
  Service-domain matter only, under a separate Duane authorization and a separate Service owner.
- **Owner:** SW-198 — Codex (identity + sold-state + join proof, no content, no label identity);
  Duane rule; Studio implementer. SW-199 — Duane (Service boundary decision only) + Service domain owner;
  **no Codex/Sales action**.
- **Next safe source action:** SW-198 — Codex bounded read-only identity/state/join check; aggregate/
  schema/cardinality only, NO content read, no PII/raw rows/quotes, no proxy. SW-199 — **none in Sales.**
- **Review point:** SW-198 — on J2, after stable customer/lead identity + sold outcome/state + same-
  dealer/period join + rule. SW-199 — only if a separate Service-domain authorization is opened by Duane;
  never reopened inside the Sales boundary.

### sentiment_and_escalation_models — SW-286, SW-290
- **Evidence gap (SW-286):** per-message/thread-trend sentiment deltas unproved; requires a stable thread
  + chronology; the sentiment tracker is a **provisional protected model output, not a fact**; **content
  unread**.
- **Evidence gap (SW-290):** escalation probability unproved; requires stable identity + chronology plus
  **multiweek** labeled complaint/lost/manager-escalation outcomes; **one week is insufficient**; the
  predictor is a **provisional human-review model, not a fact**; **content unread**.
- **Owner:** Codex (identity/chronology + multiweek outcome availability proof, no content). **Protected-
  content/model envelope + semantics + windows:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only identity/chronology (+ multiweek outcome
  availability) check; aggregate/schema/cardinality only, NO content read, no PII/raw rows/quotes, no proxy.
- **Review point:** on J2, after identity/chronology proof (+ multiweek outcomes for SW-290) + protected-
  content/NLP envelope + model semantics.

## Held IDs — exact blockers and required future contract

### SW-181 — promise / follow-through
- **Blocker:** promise + missing follow-through unproved; content unread; a missing log is not proof a commitment was broken; provisional.
- **Then:** Codex identity/chronology + follow-through log proof (no content) → Duane authorizes rule/windows → Studio implements.

### SW-182 — vehicle availability vs sold/pending
- **Blocker:** availability claim vs already sold/pending unit unproved; needs exportable sold/pending state + join; UI queue only until export; content unread; provisional.
- **Then:** Codex state export + join proof (no content) → Duane authorizes rule/windows → Studio implements.

### SW-183 — manager-approval substantiation
- **Blocker:** manager-approval claim + backing note unproved; needs stable thread + exportable manager-note/approval history + join; a missing note is not proof of fabrication; content unread; provisional.
- **Then:** Codex thread + manager-note source + join proof (no content) → Duane authorizes rule/windows → Studio implements.

### SW-193 — unsubstantiated compliance promise
- **Blocker:** compliance-sensitive promise + CRM substantiation unproved; needs stable identity + chronology + CRM substantiation source; protected compliance semantics require Duane authority and human review and are never a legal conclusion; content unread; provisional.
- **Then:** Codex identity/chronology + substantiation source proof (no content) → Duane authorizes protected compliance semantics + rule → Studio implements.

### SW-198 — post-sale prospecting (data hygiene)
- **Blocker:** post-sale prospecting contact unproved; needs stable customer/lead identity + sold outcome/state + same-dealer/period join; no label identity; content unread; provisional, not an accusation.
- **Then:** Codex identity + sold-state + join proof (no content, no label identity) → Duane authorizes rule/windows → Studio implements.

### SW-199 — Service↔Sales coordination (outside Sales)
- **Boundary:** outside the Sales governed boundary; preserved per the SPEC §3 separate-Service overlay (service_domain, 18 IDs); **no Sales source action**; not reopened/acquired/calculated/counted-evaluated in Sales.
- **Then:** Duane separately decides whether to authorize a Service-domain workspace, governance, and owner (a Service boundary decision only, never a Sales measurement) → Service domain owner performs any Service↔Sales coordination work in that separate workspace. **No Codex/Sales action.**

### SW-286 — sentiment tracker (model)
- **Blocker:** per-message/thread-trend sentiment deltas unproved; the tracker is a provisional protected model output, not a fact; needs stable thread + chronology; content unread.
- **Then:** Codex identity/chronology proof (no content) → Duane authorizes protected-content/NLP envelope + model semantics + windows → Studio implements (provisional outputs).

### SW-290 — escalation predictor (model)
- **Blocker:** escalation probability unproved; needs stable identity + chronology + multiweek labeled complaint/lost/manager-escalation outcomes; one week is insufficient; provisional human-review model, not a fact; content unread.
- **Then:** Codex identity/chronology + multiweek outcome proof (no content) → Duane authorizes protected-content/model envelope + semantics + multiweek windows → Studio implements (provisional outputs).

## Boundaries

- Missing is not zero; unproved is not unavailable; no proxy/inference/synthetic source/invented
  denominator/inferred history.
- Corpus supporting-only; never erased, never promoted; lacks stable IDs; labels/keywords not identifiers/findings/linkage.
- No source substitution; no absolute claim of source/export absence or predetermined external need;
  finite VinSolutions-or-named-external read-only check first.
- Content stays unread; NLP requires a Duane-authorized protected-content envelope + stable identities
  + minimization; no PII/raw/quotes/customer/employee IDs; no accusations.
- Trust/substantiation flags are provisional and not proof of a breach; SW-193 compliance semantics are never a legal conclusion.
- Sentiment/escalation interpretations are provisional models for human review only; never automatic
  discipline, adverse employment, accusation, or a factual claim; SW-290 requires multiweek outcomes (one week insufficient).
- SW-199 is outside the Sales boundary (outside_sales_domain), preserved per the SPEC §3 separate-Service
  overlay (service_domain, 18 IDs); no Sales/Codex source action; any work only in a separately authorized
  Service workspace under separate Duane authority.
- Quarantined families are terminal and not used/normalized/cured on clean rows.
- No customer output/alert/notification/projection in J1; no measured value/grade/formula/threshold/baseline/detection-rule authored.
- No Nissan/Ford scope. Design-only J1; no activation, no ledger/index change, no J2.
- Duane is never assigned technical investigation/acquisition/admission/accumulation/normalization/calculation/implementation.
