# PKT-03-02 — J1 Internal Coverage Roadmap (freeze-candidate, design-only)

Internal (non-customer) roadmap for the 12 Module-3 conditions. Nothing here is emitted,
promoted, or acquired in J1. It records exact blockers, needed sources/fields/keys, history
requirements, definition/threshold decisions, owners, immediate/subsequent actions, and review
points, so activation (J2) can proceed without inventing anything.

- **Baseline:** `f1119dba71d0fe195eab250a33c139197fe1d692`
- **Scope:** Serra Honda 21043 **Sales only**; Service/Parts admitted 0
- **Emission authority:** false (hidden, non-alert, non-customer)

## Per-ID disposition / owner / next action

| ID | Disposition | Lifecycle bucket | Next-action owner | Immediate action |
|---|---|---|---|---|
| SW-043 | source_investigation_pending | SIP | Duane | Ratify "same-day" definition + 3-week decline/trend rule (definition only) |
| SW-044 | source_investigation_pending | SIP | Codex | Read-only proof of an appointment-created time-of-day timestamp |
| SW-045 | measured_validated (carry-forward) | accepted_measured | Codex | Preserve authoritative evaluated state byte-for-byte (no recompute) |
| SW-046 | measured_validated (carry-forward) | accepted_measured | Codex | Preserve authoritative evaluated state byte-for-byte (no recompute) |
| SW-113 | source_investigation_pending | SIP | Duane | Ratify "high" set / "low" show thresholds (no causal diagnosis) |
| SW-114 | source_investigation_pending | SIP | Duane | Ratify "high" show / "low" close thresholds + close denominator (no causal diagnosis) |
| SW-121 | source_investigation_pending | SIP | Duane | Ratify KPI universe, grain, 2-sigma method, soft-alert semantics |
| SW-122 | source_investigation_pending | SIP | Duane | Ratify KPI universe, 3-sigma method, hard-SLA inventory, hard-alert semantics |
| SW-123 | source_investigation_pending | SIP | Duane | Ratify KPI universe, grain, drift definition, trend-alert semantics |
| SW-125 | source_investigation_pending | SIP | Duane | Ratify metric pairs, correlation window/method, decoupling review threshold |
| SW-126 | source_investigation_pending | SIP | Duane | Ratify segment universe, min volume, anomaly method, aggregate-drop rule (no root-cause claim) |
| SW-154 | source_investigation_pending | SIP | Duane | Authorize SPEC 5.5 protected-content envelope + phrase/appointment-window definition (content unread) |

## Accepted carry-forward (SW-045, SW-046)

| ID | Value | Operational target | Rating | Evidence (num/den) | Source of truth |
|---|---|---|---|---|---|
| SW-045 | 8.3% (ratio) | > 1.0 (lower_is_better) | healthy | 2 / 24 | gate5b-report-model-21043.json (evaluated); gate2-evaluator-contract.json; baseline-registry.json |
| SW-046 | 0% (ratio_0_1) | < 0.5 (higher_is_better) | breach | 0 / 26 | gate5b-report-model-21043.json (evaluated); gate2-evaluator-contract.json; baseline-registry.json |

- Carried forward byte-semantically; **not** recomputed/regraded. `authoritative_evaluated` stays 17.
- `future_display_eligibility: true` but **no** customer projection is authored in J1 (emission authority false).

## Held IDs — exact blockers and required future contract

### SW-043 — same-day appointment set rate declining 3 weeks
- **Blocker:** "same-day" undefined; three-consecutive-week series not acquired; no single-week inference.
- **Needed:** appointment created/target dates; weekly set counts; ratified same-day + trend rule.
- **History:** three consecutive weeks (mandatory). **Definition:** Duane.
- **Then:** Codex read-only proof + governed acquisition → Studio implements.
- **Review:** on J2 activation, after definition + 3-week acquisition.

### SW-044 — appointments set outside operating hours
- **Blocker:** appointment-created timestamp (time-of-day) unproved; operating hours/timezone/comparison undefined.
- **Needed:** created timestamp with time-of-day; operating-hours reference; timezone/calendar exceptions.
- **Immediate:** Codex read-only investigation of timestamp existence (aggregate-only, no PII).
- **Then:** Duane defines hours/comparison → Studio implements. **Review:** on J2, after proof + definition.

### SW-113 — high set + low show (quality-of-set)
- **Blocker:** "high"/"low" thresholds undefined; catalog label is not a factual diagnosis.
- **Needed:** set-count and show-count component sources; Duane thresholds.
- **Then:** Codex confirms components → Studio implements composite flag (no causal claim). **Review:** on J2.

### SW-114 — high show + low close (desking/product)
- **Blocker:** "high"/"low" thresholds undefined; close join/denominator undefined and unacquired; label not a diagnosis.
- **Needed:** show count; valid close join/denominator; Duane thresholds + close semantics.
- **Then:** Codex proof + acquisition of close source → Studio implements (no causal claim). **Review:** on J2.

### SW-121 — KPI > 2σ from trailing 30-day mean (soft alert)
- **Blocker:** KPI universe/grain/missing-day/sample-size/2-sigma method/soft-alert semantics undefined.
- **Needed:** ratified KPI series + trailing 30-day daily history.
- **Then:** Duane defines → Codex proof + acquisition → Studio implements (no alert in J1). **Review:** on J2.

### SW-122 — KPI > 3σ or hard-SLA breach (hard alert)
- **Blocker:** KPI universe/3-sigma method/hard-SLA inventory/precedence/hard-alert semantics undefined.
- **Needed:** ratified KPI series + SLA reference.
- **Then:** Duane defines → Codex proof + acquisition → Studio implements (no alert in J1). **Review:** on J2.

### SW-123 — 3 consecutive days same-direction drift (trend alert)
- **Blocker:** KPI universe/grain/drift definition/missing-day/trend-alert semantics undefined.
- **Needed:** ratified KPI series + daily history.
- **Then:** Duane defines → Codex proof + acquisition → Studio implements (no alert in J1). **Review:** on J2.

### SW-125 — correlated-metric decoupling
- **Blocker:** metric pairs/correlation window/method/expected relationship/decoupling review threshold undefined.
- **Needed:** ratified pairs + paired series history.
- **Then:** Duane defines → Codex proof + acquisition → Studio implements (no output in J1). **Review:** on J2.

### SW-126 — segment slice anomaly (root-cause flag)
- **Blocker:** segment universe/min volume/anomaly method/aggregate-drop rule undefined; no root-cause claim.
- **Needed:** ratified segment universe + segment-level series.
- **Then:** Duane defines → Codex proof + acquisition → Studio implements (no root-cause claim). **Review:** on J2.

### SW-154 — high-intent phrase + no appointment within 1h
- **Blocker:** message content unread (content_bytes_read=false); keyword results not authoritative;
  provisional thread/customer labels are not stable linkage; phrase/NLP + 1h window undefined;
  admitted stable keys and a valid appointment join unproved.
- **Needed:** SPEC 5.5 protected-content NLP envelope; admitted stable message/customer/appointment keys;
  appointment created timestamp for the within-1h window.
- **Immediate:** Duane authorizes the protected envelope + definitions (content stays unread).
- **Then:** Codex read-only proof + admission of stable keys and appointment join under the envelope
  → Studio implements the phrase+window join (no output in J1). **Review:** on J2.

## Boundaries

- Missing is not zero; no proxy/inference/synthetic source/invented denominator/inferred history.
- Quarantined families are terminal and not used/normalized/cured on clean rows.
- No customer output/alert/notification in J1 (emission authority false).
- No Nissan/Ford scope. PKT-02-03 open/held; SW-137/SW-140 exhausted, not repeated.
- Duane is never assigned technical investigation/acquisition/admission/accumulation/normalization/calculation/implementation.
