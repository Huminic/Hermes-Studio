# PKT-05-02 — J1 Internal Coverage Roadmap (freeze-candidate, design-only)

Internal (non-customer) roadmap for the 9 Module-5 conditions. Nothing here is emitted, promoted, or
acquired in J1. It records exact blockers, needed sources/fields/keys, definition/threshold decisions,
owners, immediate/subsequent actions, next safe source action, and review points.

- **Baseline:** `8506c0d95ace686ab8474ebaef724a01de684f31`
- **Scope:** Serra Honda 21043 **Sales only**; Service/Parts/service-source/cross-rooftop admitted = 0
- **Emission authority:** false (hidden, non-alert, non-customer)
- **Lifecycle:** all nine = `source_investigation_pending` (unproved / not_acquired / not_measured / draft).
- **Owners:** Codex = read-only source/field/history/key/cardinality proof + governed acquisition/
  admission; Studio = later calculations/joins/NLP/anomaly baselines/implementation/tests; Duane =
  business meanings, thresholds, cohort/premium definitions, protected-content authority, outcome
  changes; external/Vin product owner only after a finite investigation proves need.

## Per-ID disposition / owner / next action

| ID | Canonical condition (catalog, byte-exact) | Disposition | Next-action owner | Immediate (safe) action |
|---|---|---|---|---|
| SW-028 | Rep's outbound email open rate <15% (deliverability or subject-line issue). | SIP | Codex | Read-only check: email open-rate fields in VinSolutions, else named email platform |
| SW-029 | Sentiment on rep's outbound messages trends negative/pushy (NLP flag). | SIP | Codex | Read-only proof of stable message/thread IDs (no content read) |
| SW-030 | Rep is called out by name in customer complaint or negative CSI verbatim. | SIP | Codex | Read-only check: complaint/CSI reference fields in VinSolutions, else named CSI provider (no content) |
| SW-105 | One rep receives >40% of premium lead assignments (fairness/skimming). | SIP | Codex | Read-only proof of assignment history + stable rep/lead keys + denominator |
| SW-106 | Lead reassignment rate exceeds 15% (routing dysfunction). | SIP | Codex | Read-only check: reassignment-history export in VinSolutions, else named external (current state not substitute) |
| SW-107 | Manager overrides on deal desking spike >2σ above baseline. | SIP | Codex | Read-only check: desking-override/approval-history export in VinSolutions, else named external |
| SW-108 | New-hire rep's 30/60/90-day close rate trailing cohort by >30%. | SIP | Codex | Read-only check: hire-date/cohort fields in VinSolutions, else named HR/roster |
| SW-109 | Turnover-risk signal: top rep's activity drops 50%+ for 5 days (disengagement). | SIP | Codex | Read-only check: governed daily-grain activity source + stable rep identity (CAGE aggregate supporting-only, no cure) |
| SW-110 | Cross-rep lead poaching flagged by ownership changes without manager approval. | SIP | Codex | Read-only check: ownership-change/approval-history export in VinSolutions, else named external |

`SIP` = source_investigation_pending. Numbers in the conditions are catalog starter phrases, **not**
ratified thresholds.

## Source slices (6) — evidence gap, owner, next safe action, review point

### slice_email_engagement — SW-028
- **Evidence gap:** no exact email open-rate source presently proved (email-platform fact);
  VinSolutions-or-named-email-platform undetermined; "<15%" starter. No CRM proxy.
- **Owner:** Codex (field check). **Threshold:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only field check (VinSolutions-or-named-email-platform);
  aggregate-only, no PII/raw rows, no proxy.
- **Review point:** on J2, after the source check + open-rate threshold.

### slice_protected_sentiment_and_complaints — SW-029, SW-030
- **Evidence gap (SW-029):** communication corpus is **known** (supporting only); sentiment semantics,
  stable message/thread IDs, trend rules, production NLP unproved; **content unread** (protected
  envelope + Duane authority + stable identities + minimization required); "pushy" is a business label.
- **Evidence gap (SW-030):** no complaint/CSI source presently proved; stable identity linkage for
  "called out by name" unproved; **content unread**; no customer/employee identifiers; "CSI provider"
  route only if needed.
- **Owner:** Codex (stable-ID / field check, no content). **Protected-content authority + rule:** Duane.
  **Implementer:** Studio (NLP under envelope).
- **Next safe source action:** Codex bounded read-only stable-ID / field check; aggregate-only, NO
  content read, no PII/raw rows, no proxy.
- **Review point:** on J2, after stable-ID/source proof + protected envelope + rule.

### slice_premium_lead_assignment — SW-105
- **Evidence gap:** component classes (leads, assignments) **known** (supporting only); premium
  definition, assignment history, stable rep/lead keys, denominator, and fairness rule unproved; ">40%"
  starter; "fairness/skimming" a business label.
- **Owner:** Codex (history/key/denominator proof). **Premium definition + fairness threshold:** Duane.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only key/cardinality check for assignment history +
  premium flag + denominator; aggregate-only, no PII/raw rows.
- **Review point:** on J2, after assignment-history/key proof + premium definition.

### slice_ownership_and_override_governance — SW-106, SW-107, SW-110
- **Evidence gap:** current Lead Log / "Last Edited By" context is **supporting only** and must **not**
  substitute for reassignment (SW-106) / desking-override + approval (SW-107) / ownership-change +
  approval (SW-110) **transition history**. The catalog "Unavailable or retention-limited" label is not
  proof of permanent unavailability — a finite read-only check is still required. Histories, baselines,
  approval linkage, stable keys, and the ">15%" / ">2σ" / unauthorized rules are unproved. "routing
  dysfunction" and "poaching" are business labels. No CRM proxy.
- **Owner:** Codex (history/export field check). **Rules/method:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only field/export check (VinSolutions-or-named-external);
  aggregate-only, no PII/raw rows, no proxy.
- **Review point:** on J2, after transition-history proof + rules.

### slice_new_hire_cohort_performance — SW-108
- **Evidence gap:** no HR/roster hire-date source presently proved; cohort definition and 30/60/90-day
  close-rate history unproved; ">30%" starter. VinSolutions-or-named-HR/roster undetermined. No CRM proxy.
- **Owner:** Codex (roster/field check). **Cohort definition + threshold:** Duane. **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only field check (VinSolutions-or-named-HR/roster);
  aggregate-only, no PII/raw rows, no proxy.
- **Review point:** on J2, after roster/history proof + cohort definition.

### slice_rep_activity_decline — SW-109
- **Evidence gap:** the Enterprise Performance / CAGE weekly report (catalog supporting data: **41
  user/lead-type rows for 17 users**; aggregate totals) is **supporting-only**; CAGE is a **quarantined**
  family and is **not** cured or promoted. The aggregate does **not** prove a five-day **daily** activity
  decline, top-rep identity across periods, baseline history, or "disengagement"; daily-grain history and
  stable rep identity are unproved. "50%+ for 5 days" is a catalog starter. No CRM proxy.
- **Owner:** Codex (daily-grain source + stable rep identity check). **Decline rule + baseline:** Duane.
  **Implementer:** Studio.
- **Next safe source action:** Codex bounded read-only field check for a governed daily-grain activity
  source + stable rep identity (no CAGE cure); aggregate-only, no PII/raw rows, no proxy.
- **Review point:** on J2, after daily-history/identity proof + decline rule.

## Held IDs — exact blockers and required future contract

### SW-028 — email open rate <15%
- **Blocker:** email-platform open-rate source presently unproved; VinSolutions-or-external undetermined; "<15%" starter.
- **Then:** Codex field check → Duane ratifies threshold → Studio implements.

### SW-029 — sentiment negative/pushy (NLP)
- **Blocker:** sentiment semantics / stable message-thread IDs / trend rules / production NLP unproved; corpus supporting only; content unread (envelope + Duane authority + minimization).
- **Then:** Codex stable-ID proof (no content) → Duane authorizes envelope + rule → Studio implements NLP.

### SW-030 — called out by name in complaint/CSI verbatim
- **Blocker:** complaint/CSI source and stable identity linkage unproved; content unread; no customer/employee identifiers; CSI provider only if needed.
- **Then:** Codex field check (no content) → Duane authorizes envelope + reference rule → Studio implements.

### SW-105 — >40% premium lead assignments (fairness/skimming)
- **Blocker:** premium definition, assignment history, stable rep/lead keys, denominator, fairness rule unproved; components known but supporting only.
- **Then:** Codex history/key/denominator proof → Duane ratifies premium definition + fairness threshold → Studio implements.

### SW-106 — reassignment rate >15% (routing dysfunction)
- **Blocker:** reassignment history unproved; current state must not substitute; "Unavailable/retention-limited" is not permanent-unavailability proof; ">15%" starter; "routing dysfunction" a label.
- **Then:** Codex history export check → Duane ratifies rule → Studio implements.

### SW-107 — desking overrides spike >2σ
- **Blocker:** override/approval history + baseline + ">2σ" method unproved; current state must not substitute; retention label not permanent-unavailability proof.
- **Then:** Codex history export check → Duane ratifies anomaly method + baseline → Studio implements.

### SW-108 — new-hire cohort close rate trailing >30%
- **Blocker:** HR/roster hire-date source, cohort definition, 30/60/90-day close-rate history, stable keys unproved; ">30%" starter.
- **Then:** Codex roster/field check → Duane ratifies cohort definition + threshold → Studio implements.

### SW-109 — top-rep activity drop 50%+ for 5 days (disengagement)
- **Blocker:** CAGE aggregate (41 user/lead-type rows for 17 users) is supporting-only and quarantined
  (no cure); it does not prove daily decline, top-rep identity, or baseline history; daily-grain history
  and stable rep identity unproved; "50%+ for 5 days" starter; "disengagement" a label.
- **Then:** Codex daily-grain source/identity check (no CAGE cure) → Duane ratifies decline rule + baseline → Studio implements.

### SW-110 — ownership changes without approval (poaching)
- **Blocker:** ownership-change + approval transition history, approval linkage, stable keys unproved;
  current state must not substitute; retention label not permanent-unavailability proof; "poaching" a label.
- **Then:** Codex history export check → Duane ratifies unauthorized-ownership rule → Studio implements.

## Boundaries

- Missing is not zero; unproved is not unavailable; no proxy/inference/synthetic source/invented
  denominator/inferred history.
- No source substitution; no absolute claim of source/export absence or predetermined external need;
  finite VinSolutions-or-named-external read-only check first.
- Known component/corpus/current-state evidence is supporting-only; never erased, never promoted.
- CAGE aggregate is supporting-only and quarantined; not cured/promoted; not daily-history proof.
- Current status / last-edited never substitutes for transition history (SW-106/107/110).
- Content stays unread (SW-029/030); NLP requires a Duane-authorized protected-content envelope +
  stable identities + minimization; no PII/raw rows/customer/employee identifiers.
- Quarantined families are terminal and not used/normalized/cured on clean rows.
- No customer output/alert/notification in J1; no measured value/grade/formula/threshold/baseline/
  detection-rule/causal diagnosis authored.
- No Nissan/Ford scope. Design-only J1; no activation, no ledger/index change, no J2.
- Duane is never assigned technical investigation/acquisition/admission/accumulation/normalization/
  calculation/implementation.
