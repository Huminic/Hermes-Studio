# PKT-02-03 J2 — internal companion & execution coverage roadmap (J2R1)

Internal governance evidence. Not a customer artifact. No customer projection, grade, or alert. Full structured ownership preserved here (the ledger carries only the schema-mapped immediate owner).

- Packet: `docs/halo/contract/phase1b/packets/PKT-02-03.json` (status active_authored; schema packet-schema-1b-v2.json, frozen:true)
- Authority binding (frozen J1): `docs/halo/contract/phase1b/pkt-02-03-binding.json` sha256 `41531eadeca87c725c6c9b0047c30c46b6e66ac27beaf6cf94c687d8af0aa23a`
- Enhanced source node: `SRC-enhanced_sales_communication_log_weekly-0002` (acquired_local + admitted_held; capability-only; promotes no value)
- v2 controls are `frozen:true` and additive to frozen v1 (v1 profile/dealer/nodes/reuse-receipts/invariants preserved byte-semantically, incl. SW-013/SW-014 exclusion; schema packet_schema/source-dependency/lifecycle byte-equal except the packet-specific authority-binding-ref rule).

Accountable owner roster (structured; ledger maps only the immediate owner to its enum):

- **Duane Wells** — protected-content authority + business definition/threshold/formula/model-policy decisions ONLY.
- **Codex VinSolutions controller** — bounded read-only investigation + governed acquisition/evidence.
- **Claude Studio engineering** — protected provider/model/evaluator implementation + consumer admission once authorized.

Management question (recorded, not answered):

> Are Serra Honda’s Sales conversations respecting customer timing, channel, urgency, and contact preferences—and can the available evidence safely support better follow-up cadence and individualized best-time/best-channel recommendations?

## Calculation-pending (enhanced raw acquired/held; per-metric derivation unresolved)

### SW-135 — data_acquired_calculation_pending  (ledger owner: duane)

- **Condition (verbatim):** Rep's reply arrives after customer's stated deadline ("I need to decide by Friday").
- **Lifecycle:** source_existence=acquired_local, acquisition=admitted_held, evaluation=not_measured, report=withheld_no_delivery
- **History/maturity:** event_follow_forward_to_stated_deadline_boundary_required
- **Source dependency:** SRC-enhanced_sales_communication_log_weekly-0002
- **Immediate action (Duane Wells):** Authorize the protected-content envelope (SPEC §5.5) and ratify the 'stated deadline' extraction + deadline-vs-reply rule — authority/definition decision only.
- **Then (Codex VinSolutions controller):** Governed read-only acquisition and consumer-accepted admission of a Sales-only per-row derivative carrying the stable keys (Communication ID/Lead ID/Global Customer ID).
- **Then (Claude Studio engineering):** Implement the pinned semantic provider/evaluator and admit it once authorized.
- **Eligibility:** gradable=false, alert_eligible=false, customer_visibility=hidden, missing_not_zero=true

### SW-136 — data_acquired_calculation_pending  (ledger owner: duane)

- **Condition (verbatim):** Message thread goes silent >72h after a "hot" signal (payment, financing, delivery question).
- **Lifecycle:** source_existence=acquired_local, acquisition=admitted_held, evaluation=not_measured, report=withheld_no_delivery
- **History/maturity:** min_72h_follow_forward_after_hot_signal_event
- **Source dependency:** SRC-enhanced_sales_communication_log_weekly-0002
- **Immediate action (Duane Wells):** Authorize the protected-content envelope (SPEC §5.5) and ratify the 'hot signal' taxonomy + explicit 72h silence window + anchor-event definition — authority/definition decision only.
- **Then (Codex VinSolutions controller):** Governed read-only acquisition and consumer-accepted admission of a Sales-only per-row derivative carrying the stable keys (Communication ID/Lead ID/Global Customer ID).
- **Then (Claude Studio engineering):** Implement the pinned semantic provider/evaluator and admit it once authorized.
- **Eligibility:** gradable=false, alert_eligible=false, customer_visibility=hidden, missing_not_zero=true

### SW-137 — data_acquired_calculation_pending  (ledger owner: codex)

- **Condition (verbatim):** Rep replies to text with email (channel mismatch — customer disengages).
- **Lifecycle:** source_existence=acquired_local, acquisition=admitted_held, evaluation=not_measured, report=withheld_no_delivery
- **History/maturity:** single_week_sufficient_once_ordering_definition_and_admission_resolved
- **Source dependency:** SRC-enhanced_sales_communication_log_weekly-0002
- **Immediate action (Codex VinSolutions controller):** Bounded read-only investigation of whether authoritative sub-minute/message-sequence ordering is obtainable.
- **Then (Duane Wells):** Ratify the channel-adjacency/window definition (business decision).
- **Then (Codex VinSolutions controller):** Consumer-accepted admission of a per-row Sales-only derivative once ordering is proven.
- **Then (Claude Studio engineering):** Implement ordering normalization/calculation once admitted.
- **Eligibility:** gradable=false, alert_eligible=false, customer_visibility=hidden, missing_not_zero=true

### SW-138 — data_acquired_calculation_pending  (ledger owner: duane)

- **Condition (verbatim):** Multiple rapid-fire messages from rep with no customer reply in between (spammy cadence).
- **Lifecycle:** source_existence=acquired_local, acquisition=admitted_held, evaluation=not_measured, report=withheld_no_delivery
- **History/maturity:** single_week_sufficient_once_definition_and_admission_resolved
- **Source dependency:** SRC-enhanced_sales_communication_log_weekly-0002
- **Immediate action (Duane Wells):** Ratify the rapid-fire count N + window T + no-intervening-inbound rule — definition decision only.
- **Then (Codex VinSolutions controller):** Obtain consumer-accepted admission of a per-row Sales-only derivative with the stable keys.
- **Then (Claude Studio engineering):** Implement the calculation once admitted.
- **Eligibility:** gradable=false, alert_eligible=false, customer_visibility=hidden, missing_not_zero=true

### SW-139 — data_acquired_calculation_pending  (ledger owner: duane)

- **Condition (verbatim):** Rep sends follow-up before customer's stated callback time ("call me after 5" ignored).
- **Lifecycle:** source_existence=acquired_local, acquisition=admitted_held, evaluation=not_measured, report=withheld_no_delivery
- **History/maturity:** event_follow_forward_to_stated_callback_boundary_required
- **Source dependency:** SRC-enhanced_sales_communication_log_weekly-0002
- **Immediate action (Duane Wells):** Authorize the protected-content envelope (SPEC §5.5) and ratify the 'stated callback time' extraction + follow-up-before-callback rule — authority/definition decision only.
- **Then (Codex VinSolutions controller):** Governed read-only acquisition and consumer-accepted admission of a Sales-only per-row derivative carrying the stable keys (Communication ID/Lead ID/Global Customer ID).
- **Then (Claude Studio engineering):** Implement the pinned semantic provider/evaluator and admit it once authorized.
- **Eligibility:** gradable=false, alert_eligible=false, customer_visibility=hidden, missing_not_zero=true

### SW-141 — data_acquired_calculation_pending  (ledger owner: duane)

- **Condition (verbatim):** Weekend/evening message from customer with high intent, no response until 2+ days later.
- **Lifecycle:** source_existence=acquired_local, acquisition=admitted_held, evaluation=not_measured, report=withheld_no_delivery
- **History/maturity:** min_2d_follow_forward_after_high_intent_event_weekend_evening_ratified
- **Source dependency:** SRC-enhanced_sales_communication_log_weekly-0002
- **Immediate action (Duane Wells):** Authorize the protected-content envelope (SPEC §5.5) and ratify the high-intent taxonomy + explicit weekend/evening window + 2-day no-response rule — authority/definition decision only.
- **Then (Codex VinSolutions controller):** Governed read-only acquisition and consumer-accepted admission of a Sales-only per-row derivative carrying the stable keys (Communication ID/Lead ID/Global Customer ID).
- **Then (Claude Studio engineering):** Implement the pinned semantic provider/evaluator and admit it once authorized.
- **Eligibility:** gradable=false, alert_eligible=false, customer_visibility=hidden, missing_not_zero=true

## Accepted disposition-only (multi-week history required)

### SW-261 — additional_history_required  (ledger owner: duane)

- **Condition (verbatim):** Best-time-to-contact model per customer based on prior response times.
- **Lifecycle:** source_existence=proved_requires_more_history, acquisition=not_acquired, evaluation=not_measured, report=withheld_no_delivery
- **History/maturity:** multi_week_required
- **Source dependency:** none
- **Immediate action (Duane Wells):** Ratify the best-time model + minimum-history spec + accuracy/abstention thresholds — business decision only.
- **Then (Codex VinSolutions controller):** Accumulate multi-week per-customer response history and acquire an admitted stable pseudonymous key.
- **Then (Claude Studio engineering):** Implement the model/evaluator and admission once authorized.
- **Eligibility:** gradable=false, alert_eligible=false, customer_visibility=hidden, missing_not_zero=true

### SW-295 — additional_history_required  (ledger owner: duane)

- **Condition (verbatim):** Best-channel/best-time model: per-customer optimal contact strategy.
- **Lifecycle:** source_existence=proved_requires_more_history, acquisition=not_acquired, evaluation=not_measured, report=withheld_no_delivery
- **History/maturity:** multi_week_required
- **Source dependency:** none
- **Immediate action (Duane Wells):** Ratify the best-channel/best-time model + minimum-history spec + accuracy/abstention thresholds — business decision only.
- **Then (Codex VinSolutions controller):** Accumulate multi-week per-customer channel/time/response history and acquire an admitted stable pseudonymous key.
- **Then (Claude Studio engineering):** Implement the model/evaluator and admission once authorized.
- **Eligibility:** gradable=false, alert_eligible=false, customer_visibility=hidden, missing_not_zero=true

## Source-investigation-pending (no transition; disposition unchanged)

### SW-140 — source_investigation_pending  (ledger owner: codex)

- **Condition (verbatim):** No reply attempt after voicemail left by customer.
- **Lifecycle:** source_existence=investigation_pending, acquisition=not_acquired, evaluation=not_measured, report=withheld_no_delivery
- **History/maturity:** not_history_blocked_absent_inbound_voicemail_event_source
- **Source dependency:** none
- **Immediate action (Codex VinSolutions controller):** Finite, read-only UI/schema investigation for an inbound customer-voicemail event (or identify a named external telephony source).
- **Then (Duane Wells):** Define the unanswered / reply semantics (business decision).
- **Then (Claude Studio engineering):** Implement linkage/acquisition once the source is proven.
- **Eligibility:** gradable=false, alert_eligible=false, customer_visibility=hidden, missing_not_zero=true

### SW-262 — source_investigation_pending  (ledger owner: duane)

- **Condition (verbatim):** Customers historically responsive to Saturday outreach — batch there.
- **Lifecycle:** source_existence=investigation_pending, acquisition=not_acquired, evaluation=not_measured, report=withheld_no_delivery
- **History/maturity:** multi_week_required
- **Source dependency:** none
- **Immediate action (Duane Wells):** Freeze the exact multi-source join dependency + formula decision (which of Leads/Comm/Appointments/CRM Sales/CAGE/ROI) — business decision only, before any source is chosen.
- **Then (Codex VinSolutions controller):** Acquire/validate multi-source stable-key extracts across multiple weeks once the dependency is frozen.
- **Then (Claude Studio engineering):** Implement the join once contracted.
- **Eligibility:** gradable=false, alert_eligible=false, customer_visibility=hidden, missing_not_zero=true

### SW-288 — source_investigation_pending  (ledger owner: duane)

- **Condition (verbatim):** Cadence health score: response times, message balance, thread momentum.
- **Lifecycle:** source_existence=investigation_pending, acquisition=not_acquired, evaluation=not_measured, report=withheld_no_delivery
- **History/maturity:** multi_week_required
- **Source dependency:** none
- **Immediate action (Duane Wells):** Ratify the component set (response-time, message-balance, thread-momentum) + weights + composite formula, and decide the SW-134 resolution — business decision only.
- **Then (Codex VinSolutions controller):** Accumulate multi-week history and acquire component evidence once components are ratified.
- **Then (Claude Studio engineering):** Implement the composite once ratified.
- **Eligibility:** gradable=false, alert_eligible=false, customer_visibility=hidden, missing_not_zero=true

## Boundaries (this step)

- Metadata/control activation only: no acquire/read/export/analyze/admit/promote/calculate/grade/alert/customer output/merge/deploy.
- Enhanced source registered as already-held capability-only; NOT a new acquisition/admission/promotion.
- Frozen J1 five artifacts unchanged; exact 10-file allowlist; `.claude/` untouched; missing is never zero.
