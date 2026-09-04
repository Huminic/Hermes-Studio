# PKT-03-02 J2 — internal companion & execution coverage roadmap

Internal governance evidence. Not a customer artifact. No customer output (emission authority FALSE).

- Packet: `docs/halo/contract/phase1b/packets/PKT-03-02.json` (status active_authored; schema packet-schema-1b-v2.json)
- Authority binding (frozen J1): `pkt-03-02-binding.json` sha256 `d20c35c026c73fa7929b21022c986bf0117769b428e7f22a6837d5f1827433a0`
- Baseline commit: `82d5893123f2ecb21538a84d4cb97d373b89b3ad`
- Activation time (UTC): `2026-09-04T09:40:19Z` (labeled J2 activation time; not source freshness)
- v2 controls unmodified; no new source-registry node; 0 new ledger transitions.

Accountable owner roster (structured; ledger carries only the schema-mapped immediate owner):

- **Duane Wells** — business meaning/threshold/formula/target + future customer-display authorization (never technical execution).
- **Codex VinSolutions controller** — bounded read-only investigation + governed acquisition/evidence + carry-forward preservation.
- **Claude Studio engineering** — implementation + admission once contracts exist.

Management question (recorded):

> Are Serra Honda's Sales appointment, showroom, and be-back/test-drive dynamics healthy, and where cross-functional and statistical-anomaly signals could flag momentum loss, does the available evidence safely support DEFINING and triggering those signals for management action without inventing thresholds, sources, history, or reading protected customer content?

## Accepted measured — carry-forward, byte-identical (NOT recalculated/regraded)

Both accepted metrics carry a J2 quarantine: only Honda-native `value`, `numerator`, `denominator` and the true **Dashboard (Gate 4B ratified `dealership_performance`)** authority are usable. The byte-carried legacy `peer_rank` (three-rooftop), `industry_reference`, `value_display`, narrative `text`, `variance`, and the "CRM Sales report" source label are QUARANTINED from Honda-only J2 calculation/narrative/display/ranking/source-attribution/customer-projection.

### SW-045 — measured_validated  (ledger owner: codex)

- **Condition (canonical):** Ratio of "be-backs" to fresh ups inverted (retention symptom).
- **Accepted (byte-identical, permitted fields):** value 0.0833 (numerator 2 / denominator 24), operational target > 1.0 (lower_is_better), rating healthy, period 2026-08-24..2026-08-30.
- **True authority:** Dashboard (Gate 4B ratified `dealership_performance`; `dashboard.beback_to_freshup_ratio` = Be Backs / Initial Visits).
- **current_truth_ref:** gate5b-report-model-21043.json (evaluated); gate2-evaluator-contract.json; baseline-registry.json
- **Immediate action (Codex VinSolutions controller):** Preserve the authoritative evaluated Honda state byte-for-byte; do not recompute, regrade, or change period/numerator/denominator/target/confidence in this design-only tranche.
- **Then (Duane Wells):** Authorize future customer display of this accepted metric only as a separate business decision (metadata eligibility is not authorization; not exercised in J2).

### SW-046 — measured_validated  (ledger owner: codex)

- **Condition (canonical):** Test drive completion rate <50% of showroom visits.
- **Accepted (byte-identical, permitted fields):** value 0 (numerator 0 / denominator 26), operational target < 0.5 (higher_is_better), rating breach, period 2026-08-24..2026-08-30.
- **True authority:** Dashboard (Gate 4B ratified `dealership_performance`; `dashboard.test_drive_completion_rate` = Demo / Total Visits).
- **current_truth_ref:** gate5b-report-model-21043.json (evaluated); gate2-evaluator-contract.json; baseline-registry.json
- **Immediate action (Codex VinSolutions controller):** Preserve the authoritative evaluated Honda state byte-for-byte; do not recompute, regrade, or change period/numerator/denominator/target/confidence in this design-only tranche.
- **Then (Duane Wells):** Authorize future customer display of this accepted metric only as a separate business decision (metadata eligibility is not authorization; not exercised in J2).

## Held — appointment definition / trend and outside-hours timestamp

### SW-043 — source_investigation_pending  (ledger owner: duane)

- **Condition (canonical):** Same-day appointment set rate declining 3 weeks in a row.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **State:** Sales source EXISTENCE unproved (AMENDMENT_001 state #8); disposition source_investigation_pending / not_acquired / not_measured.
- **Immediate action (Duane Wells):** Ratify the "same-day appointment set" definition and the 3-week decline/trend rule (business definition decision only; no inference from a single week).
- **Then (Codex VinSolutions controller):** Read-only proof and governed acquisition of the three-consecutive-week same-day appointment series (Sales only; no proxy).
- **Then (Claude Studio engineering):** Implement the trend metric after definition and acquisition.

### SW-044 — source_investigation_pending  (ledger owner: codex)

- **Condition (canonical):** Appointments set outside dealership operating hours.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **State:** Sales source EXISTENCE unproved (AMENDMENT_001 state #8); disposition source_investigation_pending / not_acquired / not_measured.
- **Immediate action (Codex VinSolutions controller):** Bounded read-only investigation of whether an appointment-created timestamp with time-of-day exists in Sales-clean source; aggregate-only, no PII, no raw rows, no message content.
- **Then (Duane Wells):** Ratify dealership operating hours, timezone/calendar exceptions, and outside-hours comparison semantics (definition decision only).
- **Then (Claude Studio engineering):** Implement the outside-hours metric after proof and definition.

## Held — composite quality-of-set / desking diagnostics (thresholds only; no causal claim)

### SW-113 — source_investigation_pending  (ledger owner: duane)

- **Condition (canonical):** High appointment set rate + low show rate = quality-of-set problem.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **Boundary:** the catalog causal label ("quality-of-set problem") is not asserted as a factual diagnosis.
- **Immediate action (Duane Wells):** Ratify the "high" set-rate and "low" show-rate business thresholds (definition decision only; cause is not to be diagnosed).
- **Then (Codex VinSolutions controller):** Confirm governed set-count and show-count component sources (read-only).
- **Then (Claude Studio engineering):** Implement the composite flag after thresholds; assert no causal diagnosis.

### SW-114 — source_investigation_pending  (ledger owner: duane)

- **Condition (canonical):** High show rate + low close rate = desking or product problem.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **Boundary:** the catalog causal label ("desking or product problem") is not asserted as a factual diagnosis; the close denominator source is not proven.
- **Immediate action (Duane Wells):** Ratify the "high" show-rate and "low" close-rate thresholds and the close denominator semantics (definition decision only; cause is not to be diagnosed).
- **Then (Codex VinSolutions controller):** Read-only proof and governed acquisition of a valid close join/denominator source (Sales only; no proxy).
- **Then (Claude Studio engineering):** Implement the composite flag after thresholds + close source; assert no causal diagnosis.

## Held — statistical-anomaly alert definitions (KPI universe + trailing history required)

### SW-121 — source_investigation_pending  (ledger owner: duane)

- **Condition (canonical):** Any KPI moves >2σ from trailing 30-day mean → soft alert.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **Immediate action (Duane Wells):** Ratify the KPI universe, daily grain, missing-day handling, sample-size rule, 2-sigma method over the trailing 30-day mean, and soft-alert semantics (definition decisions only).
- **Then (Codex VinSolutions controller):** Read-only proof and governed acquisition of the ratified KPI series and trailing daily history (Sales only; no proxy).
- **Then (Claude Studio engineering):** Implement the 2-sigma-over-trailing-30-day-mean anomaly rule after definition + acquisition; no alert emitted in J2.

### SW-122 — source_investigation_pending  (ledger owner: duane)

- **Condition (canonical):** Any KPI moves >3σ or breaches hard SLA → hard alert.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **Immediate action (Duane Wells):** Ratify the KPI universe, 3-sigma method, hard-SLA inventory, precedence, and hard-alert semantics (definition decisions only).
- **Then (Codex VinSolutions controller):** Read-only proof and governed acquisition of the ratified KPI series and trailing daily history (Sales only; no proxy).
- **Then (Claude Studio engineering):** Implement the 3-sigma-or-hard-SLA anomaly rule after definition + acquisition; no alert emitted in J2.

### SW-123 — source_investigation_pending  (ledger owner: duane)

- **Condition (canonical):** 3 consecutive days of same-direction drift on a KPI → trend alert.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **Immediate action (Duane Wells):** Ratify the KPI universe, daily grain, same-direction drift definition, missing-day handling, and trend-alert semantics (definition decisions only).
- **Then (Codex VinSolutions controller):** Read-only proof and governed acquisition of the ratified KPI series and trailing daily history (Sales only; no proxy).
- **Then (Claude Studio engineering):** Implement the 3-consecutive-day-drift anomaly rule after definition + acquisition; no alert emitted in J2.

### SW-125 — source_investigation_pending  (ledger owner: duane)

- **Condition (canonical):** Correlated-metric decoupling (e.g., calls up, appointments flat) → investigate.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **Immediate action (Duane Wells):** Ratify the correlated metric pairs, correlation window/method, expected relationship, and the decoupling review threshold (definition decisions only).
- **Then (Codex VinSolutions controller):** Read-only proof and governed acquisition of the paired series history.
- **Then (Claude Studio engineering):** Implement the decoupling rule after definition + acquisition; no output in J2.

### SW-126 — source_investigation_pending  (ledger owner: duane)

- **Condition (canonical):** Segment slice anomaly (one source/rep/model driving aggregate drop) → root-cause flag.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **Boundary:** "root-cause flag" is a review trigger, not a root-cause claim.
- **Immediate action (Duane Wells):** Ratify the segment universe, minimum segment volume, anomaly method, and aggregate-drop attribution rule (definition decisions only; no root-cause claim).
- **Then (Codex VinSolutions controller):** Read-only proof and governed acquisition of the segment-level series.
- **Then (Claude Studio engineering):** Implement the segment anomaly flag after definition + acquisition; no root-cause claim; no output in J2.

## Held — protected-content high-intent (SPEC 5.5 envelope unauthorized; content UNREAD)

### SW-154 — source_investigation_pending  (ledger owner: duane)

- **Condition (canonical):** Customer says "I'm ready" / "let's do it" / "when can I come in" — no appointment set within 1h.
- **Activation:** source_existence=investigation_pending, report=withheld_no_delivery, transitions=1 (unchanged)
- **Boundary:** protected customer content remains UNREAD; the SPEC 5.5 protected-content NLP envelope is unauthorized; no message content is read, persisted, or projected.
- **Immediate action (Duane Wells):** Authorize the SPEC 5.5 protected-content NLP envelope and ratify the high-intent phrase/NLP definition and the appointment-within-1h join window (authority/definition decision only; content remains unread).
- **Then (Codex VinSolutions controller):** Under the authorized envelope, read-only proof + admission of stable message/customer/appointment keys and a valid appointment join; no content persisted.
- **Then (Claude Studio engineering):** Implement the phrase+window join after envelope + keys + join; no output in J2.

## Boundaries (this step)

- Metadata/control activation only; 0 new transitions; accepted rows byte-identical; held rows metadata-only.
- No new registry node; schema-v2/registry-v2 unmodified; frozen J1 five unchanged; exact 8-file allowlist; `.claude/` untouched.
- Missing is not zero; no substitution/inference; Honda 21043 Sales only; zero Service/Parts/service-source/cross-rooftop; no PII/raw/content.
- Quarantined families (`cage_kpi`, `lead_source_roi`, `sales_comm_log`) are terminal and unusable; accepted legacy three-rooftop fields byte-carried but quarantined.
- Customer emission authority FALSE; no customer file/output/send; emission requires a separate Duane business decision (not exercised here).
