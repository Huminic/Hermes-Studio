# PKT-03-01 J2 — internal companion & execution coverage roadmap

Internal governance evidence. Not a customer artifact. No customer output (emission authority FALSE).

- Packet: `docs/halo/contract/phase1b/packets/PKT-03-01.json` (status active_authored; schema packet-schema-1b-v2.json)
- Authority binding (frozen J1): `pkt-03-01-binding.json` sha256 `e92a181f2a8016085011358ff256f627b2c11f09e4f37109f4276ecbfce10f8e`
- v2 controls unmodified; no new source-registry node; 0 new ledger transitions.

Accountable owner roster (structured; ledger carries only the schema-mapped immediate owner):

- **Duane Wells** — business meaning/threshold/formula/target + future customer-display authorization (never technical execution).
- **Codex VinSolutions controller** — bounded read-only investigation + governed acquisition/evidence + carry-forward preservation.
- **Claude Studio engineering** — implementation + admission once contracts exist.

Management question (recorded):

> Where is Serra Honda’s Sales funnel losing momentum—from lead through appointment, showroom, write-up, and close—and do appointment confirmation, pipeline aging, and stage-history evidence support timely management intervention?

## Accepted measured — carry-forward, byte-identical (NOT recalculated/regraded)

### SW-031 — measured_validated  (ledger owner: codex)

- **Condition (verbatim):** Lead-to-appointment set rate falls below 25%.
- **Accepted (byte-identical):** value 10.9%, target < 0.25, rating breach, num/den 10/92, period 2026-08-24..2026-08-30
- **current_truth_ref:** gate5b-report-model-21043.json (evaluated); gate2-evaluator-contract.json; baseline-registry.json
- **Immediate action (Codex VinSolutions controller):** Carry forward the accepted+evaluated authoritative state byte-semantically (value/target/rating/numerator/denominator/period/provenance/current_truth_ref); no recalculation or regrade.
- **Then (Duane Wells):** Authorize future customer display of this accepted metric only as a separate business decision (metadata eligibility is not authorization; not exercised in J1).

### SW-032 — measured_validated  (ledger owner: codex)

- **Condition (verbatim):** Appointment show rate drops below 55%.
- **Accepted (byte-identical):** value 57.1%, target < 0.55, rating watch, num/den 8/14, period 2026-08-24..2026-08-30
- **current_truth_ref:** gate5b-report-model-21043.json (evaluated); gate2-evaluator-contract.json; baseline-registry.json
- **Immediate action (Codex VinSolutions controller):** Carry forward the accepted+evaluated authoritative state byte-semantically (value/target/rating/numerator/denominator/period/provenance/current_truth_ref); no recalculation or regrade.
- **Then (Duane Wells):** Authorize future customer display of this accepted metric only as a separate business decision (metadata eligibility is not authorization; not exercised in J1).

### SW-033 — measured_validated  (ledger owner: codex)

- **Condition (verbatim):** Show-to-write rate below 60%.
- **Accepted (byte-identical):** value 0%, target < 0.6, rating breach, num/den 0/8, period 2026-08-24..2026-08-30
- **current_truth_ref:** gate5b-report-model-21043.json (evaluated); gate2-evaluator-contract.json; baseline-registry.json
- **Immediate action (Codex VinSolutions controller):** Carry forward the accepted+evaluated authoritative state byte-semantically (value/target/rating/numerator/denominator/period/provenance/current_truth_ref); no recalculation or regrade.
- **Then (Duane Wells):** Authorize future customer display of this accepted metric only as a separate business decision (metadata eligibility is not authorization; not exercised in J1).

### SW-041 — measured_validated  (ledger owner: codex)

- **Condition (verbatim):** Appointment no-show rate exceeds 45%.
- **Accepted (byte-identical):** value 35.7%, target > 0.45, rating healthy, num/den 5/14, period 2026-08-24..2026-08-30
- **current_truth_ref:** gate5b-report-model-21043.json (evaluated); gate2-evaluator-contract.json; baseline-registry.json
- **Immediate action (Codex VinSolutions controller):** Carry forward the accepted+evaluated authoritative state byte-semantically (value/target/rating/numerator/denominator/period/provenance/current_truth_ref); no recalculation or regrade.
- **Then (Duane Wells):** Authorize future customer display of this accepted metric only as a separate business decision (metadata eligibility is not authorization; not exercised in J1).

## Held — CRM Sales Gross join bridge pending

### SW-034 — source_investigation_pending  (ledger owner: codex)

- **Condition (verbatim):** Write-to-close rate below 40%.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **Exact blocker:** CRM Sales Gross is held/accepted-eligible, but write-to-close needs a written-up DENOMINATOR joined to close outcomes; Deal/Dealership Performance is a CANDIDATE join bridge ONLY, not accepted for this join.
- **History/maturity:** dated_sales_only_pull_and_join_bridge_pending
- **Immediate action (Codex VinSolutions controller):** Bounded read-only investigation of a dated Sales-only CRM Sales Gross pull and a supported lead/customer join bridge (Deal Performance is candidate only, never treated as accepted).
- **Then (Duane Wells):** Ratify the write-to-close denominator semantics + approved target (business decision).
- **Then (Claude Studio engineering):** Implement the join + calculation once contracted.

## Held — multi-source funnel join + history pending

### SW-035 — source_investigation_pending  (ledger owner: duane)

- **Condition (verbatim):** Funnel stage conversion drops >15% vs 90-day baseline at any step.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **Exact blocker:** Requires a defined funnel-step join AND a trailing 90-DAY baseline; neither the join formula nor the 90-day history exists.
- **History/maturity:** trailing_90_day_baseline_plus_join_formula_required
- **Immediate action (Duane Wells):** Ratify the exact funnel-step join formula and the 90-day baseline window (business decision).
- **Then (Codex VinSolutions controller):** Acquire the trailing 90-day stable-key funnel history once the formula is ratified.
- **Then (Claude Studio engineering):** Implement the funnel-conversion baseline comparison once contracted.

### SW-036 — source_investigation_pending  (ledger owner: duane)

- **Condition (verbatim):** Pipeline aging: >30% of open leads are >21 days old with no activity.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **Exact blocker:** Requires an open-lead pipeline denominator + a last-activity timestamp + a 21-day no-activity rule; the pipeline join/formula is undefined.
- **History/maturity:** open_pipeline_snapshot_plus_21d_no_activity_join_formula_required
- **Immediate action (Duane Wells):** Ratify the open-pipeline denominator and the 21-day no-activity rule (business decision).
- **Then (Codex VinSolutions controller):** Acquire the open-pipeline + last-activity stable-key extract once the rule is ratified.
- **Then (Claude Studio engineering):** Implement the pipeline-aging detection once contracted.

### SW-037 — source_investigation_pending  (ledger owner: duane)

- **Condition (verbatim):** "Hot" leads (last-7-day intake) as % of pipeline drops below 40%.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **Exact blocker:** Requires a current pipeline denominator + a 7-day intake window; the pipeline join/formula is undefined.
- **History/maturity:** current_pipeline_denominator_plus_7d_intake_window_join_formula_required
- **Immediate action (Duane Wells):** Ratify the pipeline denominator and the 7-day intake window (business decision).
- **Then (Codex VinSolutions controller):** Acquire the pipeline + intake-timestamp stable-key extract once the window is ratified.
- **Then (Claude Studio engineering):** Implement the hot-lead mix calculation once contracted.

## Held — stage-history audit export (finite positive investigation required)

### SW-038 — source_investigation_pending  (ledger owner: codex)

- **Condition (verbatim):** Stage skipping: leads jumping from "new" to "lost" without intermediate touches.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **Exact blocker:** Requires a bulk status/transition-timestamp export; no such export is proven (retention-limited).
- **History/maturity:** not_history_blocked_pending_positive_stage_history_export_investigation
- **Immediate action (Codex VinSolutions controller):** Finite positive read-only investigation of whether an authoritative status/transition audit export exists (retention/stage-history); do NOT conclude unavailable without proof, do NOT infer from absence.
- **Then (Duane Wells):** Decide whether to request/commission the status-audit dataset (business decision, only after the source is proven).
- **Then (Claude Studio engineering):** Implement the stage-history detection once a source is contracted.

### SW-039 — source_investigation_pending  (ledger owner: codex)

- **Condition (verbatim):** Deals stuck in "working" stage >14 days without status change.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **Exact blocker:** Requires a bulk status/transition-timestamp export; no such export is proven (retention-limited).
- **History/maturity:** not_history_blocked_pending_positive_stage_history_export_investigation
- **Immediate action (Codex VinSolutions controller):** Finite positive read-only investigation of whether an authoritative status/transition audit export exists (retention/stage-history); do NOT conclude unavailable without proof, do NOT infer from absence.
- **Then (Duane Wells):** Decide whether to request/commission the status-audit dataset (business decision, only after the source is proven).
- **Then (Claude Studio engineering):** Implement the stage-history detection once a source is contracted.

### SW-040 — source_investigation_pending  (ledger owner: codex)

- **Condition (verbatim):** Backwards stage movement (e.g., "sold" reverted to "working") without note.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **Exact blocker:** Requires a bulk status/transition-timestamp export; no such export is proven (retention-limited).
- **History/maturity:** not_history_blocked_pending_positive_stage_history_export_investigation
- **Immediate action (Codex VinSolutions controller):** Finite positive read-only investigation of whether an authoritative status/transition audit export exists (retention/stage-history); do NOT conclude unavailable without proof, do NOT infer from absence.
- **Then (Duane Wells):** Decide whether to request/commission the status-audit dataset (business decision, only after the source is proven).
- **Then (Claude Studio engineering):** Implement the stage-history detection once a source is contracted.

## Held — appointment confirmation hour-precision timestamp (bounded read-only discovery)

### SW-042 — source_investigation_pending  (ledger owner: codex)

- **Condition (verbatim):** Confirmed appointment rate (reconfirmed within 24h) below 70%.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **Exact blocker:** Appointments source is accepted, but 'Confirmed Date' is CALENDAR-DATE ONLY (0/14 rows carry time-of-day); the required hour-precision confirmation timestamp is a proven MISSING field (SW-042 evidence-gap, frozen).
- **History/maturity:** not_history_blocked_pending_hour_precision_confirmation_timestamp_field
- **Immediate action (Codex VinSolutions controller):** Run the future finite read-only hour-precision confirmation-timestamp discovery (one help pass, one UI pass, one controlled probe); field-minimized, aggregate-only, no PII/raw/content, no promotion.
- **Then (Duane Wells):** Ratify the 24h window anchor + approved target ONLY after the hour-precision field is proved (business decision).
- **Then (Claude Studio engineering):** Implement the SW-042 confirmation-window calculation once the field + anchor are contracted.

## Boundaries (this step)

- Metadata/control activation only; 0 new transitions; accepted rows byte-identical; held rows metadata-only.
- No new registry node; schema-v2/registry-v2 unmodified; frozen J1 five unchanged; exact 8-file allowlist; `.claude/` untouched.
- Missing is not zero; no substitution/inference; Honda 21043 Sales only; zero Service/Parts; no PII/raw/content; no customer output.
