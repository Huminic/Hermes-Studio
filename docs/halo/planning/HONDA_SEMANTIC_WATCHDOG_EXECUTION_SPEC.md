# Honda Semantic Watchdog — execution planning specification

**Planning status:** draft for independent review; no acquisition or implementation authorized by this document.  
**Pilot:** Serra Honda of Sylacauga, VinSolutions dealer `21043`, Studio profile `serra-honda`.  
**Catalog:** exactly 295 unique conditions, `SW-001` through `SW-295`, from `docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json`.  
**Permanent boundary:** Sales only. Service and Parts belong to the separately governed combined Serra Service workspace and must never enter an accepted Honda Sales definition, landing area, source artifact, Brain record, transformation, observation, narrative, or report. Pre-existing contaminated saved definitions are legacy external circuits: preserve them unchanged only until a separately authorized correction, never treat them as accepted Honda Sales definitions, and route their deliveries solely to the segregated pre-admission quarantine/evidence vault. Existing report schedules are preserved unless Duane separately approves a material schedule change.

## 1. Outcome and non-outcome

The execution program designed here will create a repeatable Honda-first system that:

1. acquires each authoritative dataset once;
2. preserves its raw evidence and provenance;
3. routes it through small, independently accepted dealership-success modules;
4. stores definitions, observations, baselines, evaluations, findings, and lineage in the Honda InfoStore/Brain;
5. produces one accepted subsection report per module;
6. assembles the customer PDF only from accepted modules; and
7. leaves a repeatable daily/weekly path that can later be cloned to Nissan and Ford.

This planning phase does **not** access VinSolutions, Gmail, a customer database, or production; it does not modify schedules, ingest data, implement code, deploy, send a report, or activate an alert.

## 2. Corrected implementation truth

The present system is a strong partial prototype, not a complete 295-metric pipeline. Each status claim below is provisional planning evidence until Phase 0 records its pinned commit, exact path/test/artifact hash, and `verified_at`; a claim that cannot be reproduced is downgraded to `reported_pending_phase0_verification`.

| Capability | Current truth | Execution implication |
|---|---|---|
| Six-family native XLSX classifier and Sales-only admission | Implemented and strongly tested in the isolated ingest path | Reuse; do not weaken fail-closed Service/Parts, dealer, period, schema, or provenance checks |
| Honda source readiness | Appointments, CRM Sales Gross, and Dealer Dashboard have accepted evidence; ROI, CAGE, and Sales Communication are quarantined because hidden Lead Intent includes Parts/Service | Preserve schedules, but do not promote contaminated deliveries. Prove a clean Sales-only definition/export or stop for the appropriate Cox/admin remedy |
| Raw delivery persistence | `ingest_delivery` and `ingest_row` exist in an isolated per-profile Brain | Reuse after unifying the accepted landing/promotion path |
| Hold-to-analytics promotion | Implemented as a manual development CLI | Connect it only after idempotence, current-period, and end-to-end tests; do not assume automation exists |
| Native readers | Main Halo path reads Appointments and Dashboard; isolated `vin-metrics.ts` has wider six-family readers | Consolidate one canonical reader path and prove each family with a real Honda golden plus negative controls |
| Exact SW evaluation | 17 of 295 Honda metrics evaluated in the current one-week artifact; 278 are `not_measured` | Rebuild as module-by-module metric specifications; never treat catalog presence as calculation |
| Durable metric/trend storage | Absent | Add first-class metric, baseline, evaluation, module, finding, and report records to the Honda Brain |
| Capability-aware baselines | Absent; current baseline registry is limited to supplied thresholds/three-rooftop ranks | Add dealer-history and capacity/potential normalization with explicit assumptions and versioned narratives |
| Alerts and notifications | Alert configuration/storage exists; operational metric evaluation/dispatch is not connected | Prove in simulation after accepted metrics exist; activation remains a separate decision |
| PDF generation | Deterministic 34-page one-week prototype exists for 17 measured metrics | Reuse presentation/QA mechanics, but generate the final PDF only from accepted modules |
| Scheduled end-to-end operation | Not implemented | Design and prove source arrival → validation → promotion → evaluation → persistence → subsection → report; no schedule is called operational until a real repeat run passes |

Planning-audit evidence anchors, to be re-pinned in Phase 0:

- Halo/report prototype: repository `/home/ubuntu/hs-m1r-isolated-20260830`, observed HEAD `4356e9e6a8d6dad876e7fd835af3daa20d909ca2`; `docs/halo/M1R_DATA_COVERAGE_CONTRACT.md`, `src/server/ingest-native-metrics.ts`, `src/server/watchdog/metric-values.ts`, `src/server/reports/evaluator/*`, `src/server/reports/gate5b/customer-report.ts`, `scripts/halo-report-card/build_report_cards.py`, `docs/halo/evidence/m1r/gate5b/gate5b-report-model-21043.json`, and the Gate 6 PDF manifest/proof.
- Ingest implementation: repository `/home/ubuntu/hs-ingest-dev`, observed HEAD `4c41df11dc48c3bc954ffdd45cdf125b2d67c2d5`; `src/server/ingest/vin-contracts.ts`, `src/server/ingest/ingest-delivery-store.ts`, `src/server/analytics/promote-held-to-analytics.ts`, `src/server/watchdog/vin-metrics.ts`, `src/server/brain-schema.ts`, `docs/watchdog-platform/SCHEMA_CONTRACT.md`, and `SCHEMA_CONTRACT_BROWSER_EXTENSION.md`. The observed worktree contained an unrelated modification to `src/routeTree.gen.ts`; execution must not overwrite or absorb it.
- Schedule/source evidence: `docs/halo/evidence/m1r/scheduled/native-scheduled-evidence.json` and `docs/halo/evidence/m1r/GATE3_HIDDEN_LEAD_INTENT_BLOCKER_2026-08-30.md` (or their current successors) must be reproduced, not merely cited.
- Alerts: `src/server/watchdog/alert-engine.ts`, `notifications-store.ts`, `alert-dispatch.ts`, and `scripts/watchdog-cron.ts`; call-site/runtime inspection must prove operational wiring rather than relying on tests or comments.

Each Phase 0 ledger row records `claim`, `state`, `evidence_ref`, pinned commit/path/test/artifact hash, `verified_at`, and reproduction result. A failed reproduction becomes `reported_pending_phase0_verification` and cannot support planning assumptions.

No metric may be labeled unavailable merely because its reader, calculation, baseline, or acquisition step is unfinished.

## 3. Metric disposition vocabulary

Every one of the 295 metrics must have exactly one current disposition for Honda:

1. `measured_validated` — real source, accepted calculation, accepted baseline/evaluation where applicable;
2. `data_acquired_calculation_pending` — governed source exists locally, but transformation/evaluation is unfinished;
3. `crm_available_acquisition_pending` — the required field is proved in VinSolutions, but not yet acquired;
4. `additional_history_required` — the field and method are proved, but the required trailing/cohort window has not accumulated;
5. `external_source_required` — the data is outside VinSolutions and the source is named;
6. `genuinely_not_available` — source investigation proved that the required event/field/history is not obtainable; or
7. `outside_sales_domain` — Service, Parts, cross-rooftop, compliance/PII, or other separately governed work.

`Not measured`, `withheld`, and generic “visibility” prose are not terminal dispositions. Each unresolved metric must identify the missing source/field/history/definition, owner, next action, and evidence that supports the disposition. Missing is never zero. No inferred substitute calculation is permitted merely to increase coverage.

Disposition is separate from **boundary class**. Every metric also receives exactly one machine-validated `boundary_class`: `sales`, `separate_serra_service`, `cross_rooftop_authorization`, `compliance_pii_authorization`, or `external_noncrm`. Before any discovery, validate the exact separate-Service overlay: `SW-079, SW-081, SW-083, SW-115, SW-118, SW-199, SW-222, SW-223, SW-224, SW-225, SW-226, SW-227, SW-228, SW-229, SW-263, SW-270, SW-279, SW-294`. Canonical labels remain in the protected internal ledger. The Honda customer appendix projects each Service ID only as ID + neutral “separately governed domain” label + no value; Service IDs are excluded from Honda narrative, grades, findings, and opportunity totals.

## 4. Dealership-success module library

The 295 metrics are allocated exactly once across 11 modules. The allocation totals `28 + 28 + 24 + 22 + 26 + 36 + 26 + 27 + 20 + 32 + 26 = 295`; the execution implementation must machine-validate no gaps or duplicates.

| # | Module and exact IDs | Count | Larger success/failure question | Required subsection output |
|---|---|---:|---|---|
| 1 | **Demand, source quality, and paid-media ROI** — `SW-001–010, 063–069, 116, 119–120, 230–237` | 28 | Are lead providers and marketing spend creating contactable demand, appointments, sales, and gross—or wasting budget? | Volume/quality, duplicates, contactability, source funnel, CPL/cost-per-sold/gross-to-spend when real spend exists, source/vendor actions |
| 2 | **Speed-to-lead, contact coverage, and BDC cadence** — `SW-011–018, 084–089, 132–141, 261–262, 288, 295` | 28 | Are customers reached quickly, consistently, at staffed and after-hours moments, through the right channel? | Median/p90 first-human touch, SLA breaches, untouched leads, connect/voicemail/cadence health, best channel/time, coverage gaps |
| 3 | **Funnel, appointment, and showroom conversion** — `SW-031–046, 113–114, 121–123, 125–126, 154` | 24 | Where are customers leaking between lead, contact, appointment, show, write-up, and sale? | Stage conversion, confirmation/no-show, aging, intent-to-appointment latency, bottleneck contribution by source/rep |
| 4 | **Deal economics, desking, F&I, and inventory velocity** — `SW-047–062, 112, 160, 179–180, 184, 292` | 22 | Are deals being structured and closed profitably while inventory matches demand and turns efficiently? | Front/back/total gross, loss deals, desking timing, pencils, F&I, pricing consistency, age/turn, inventory-demand mismatch |
| 5 | **Rep productivity, coaching, routing, and workforce health** — `SW-019–030, 105–111, 117, 124, 194–197, 204` | 26 | Are leads assigned fairly and worked effectively, and where will coaching or management intervention improve output? | Productive touches, channel mix, neglected leads, routing/reassignment, activity-to-outcome, cohort/new-hire and handoff performance |
| 6 | **Conversation discovery, personalization, and objection handling** — `SW-070–078, 142–153, 155–159, 185, 200–203, 205–206, 285, 287, 289` | 36 | Do conversations discover intent, answer the customer, build value, resolve objections, and create a clear next step? | Intent/question alignment, discovery, personalization/template use, objection resolution, transparency, CTA/next-step and repeated-question analysis |
| 7 | **Customer experience, trust, sentiment, and escalation** — `SW-161–178, 181–183, 193, 198–199, 286, 290` | 26 | Which communication patterns create distrust, churn, complaints, conflicting outreach, or preventable escalation? | Sentiment trajectory, competitor/churn language, promise-kept, substantiation/conflict, sold-customer mistakes, escalation-risk and actions |
| 8 | **CRM data quality, compliance, and control integrity** — `SW-090–104, 127–131, 186–192` | 27 | Can management trust the CRM record, ownership, statuses, alerts, consent, and reconciliation? | Completeness, status/notes/lost reasons, CRM↔DMS checks, alert quality, control feedback; compliance/PII rows remain disposition-only until authorized |
| 9 | **Pipeline recovery and lifecycle reactivation** — `SW-207–214, 217, 219, 221, 250–255, 277, 282, 291` | 20 | Which dormant or lost prospects can be recovered, and what actions produce incremental appointments, sales, and gross? | Eligible pool, match/recontact/appointment/show/sale recovery, recovered gross, days to reactivate, score-lift and deduplicated opportunity range |
| 10 | **Sales-owned owner-base, loyalty, referral, and equity** — `SW-079–083, 115, 118, 215–216, 218, 220, 222–229, 238–243, 270, 278–279, 281, 283, 293–294` | 32 | How can Sales-owned owner relationships, equity, loyalty, and referrals expand sales? | Sales-owned equity/lease/loyalty/referral analysis. Exact Service-overlay IDs receive internal disposition only and no Honda Sales value, narrative, grade, finding, or opportunity claim |
| 11 | **Audience, territory, conquest, and lifecycle growth** — `SW-244–249, 256–260, 263–269, 271–276, 280, 284` | 26 | Which markets, models, audiences, and lifecycle moments contain underdeveloped growth? | ZIP/model/cohort/conquest opportunity, segment quality, timing, market-potential gap; external/cross-rooftop dependencies remain explicit |

Recommended execution order: operational core `2 → 3 → 5 → 6 → 7 → 8`, economic layer `1 → 4`, growth layer `9 → 10 → 11`. A module’s business ownership does not authorize an outside-domain source.

## 5. Source-first acquisition architecture

Analysis is question-first, but acquisition is source-first. One accepted source artifact fans out to every dependent metric. Never perform 295 browser searches.

### 5.1 Preserved scheduled native families

Preserve and inventory the existing six report circuits before any change:

1. Lead Source ROI — weekly native XLSX + Filters;
2. Enterprise Performance/CAGE — weekly native XLSX + Filters;
3. Sales Communication Log — daily native XLSX;
4. CRM Sales Gross — weekly per-deal XLSX;
5. Appointments — weekly event-row XLSX; and
6. Dealership Performance Dashboard — weekly native XLSX + Filters.

For each circuit, fingerprint the saved definition, subject, cadence, recipients, dealer, period rule, file signature, and last accepted delivery. Existing Dashboard/CAGE/Watchdog-supporting circuits remain in place. No broad rewrite, deletion, or rescheduling is allowed. A legacy ROI, CAGE, or Communication definition with hidden Service/Parts Lead Intent is not an accepted Honda Sales definition; its bytes enter only the neutral pre-admission quarantine/evidence vault outside the `serra-honda` Brain/workspace, even when visible rows look clean. Execution first investigates a field-minimized unsaved Sales-only Custom Reporting alternative; a saved-definition correction or Cox/admin action is raised to Duane only if it materially changes the operating circuit.

### 5.2 Governed browser/manual source families

**Response Times:** use the implemented 39-column browser contract, exact VinSolutions host, dealer-bound capture ID, immutable raw CSV, PII-minimized derivative, America/New_York conversion, out-of-window reconciliation, source/derivative hashes, and Sales-only raw scan. It remains a weekly manual browser checkpoint until an approved deterministic automation exists.

**Unanswered Replies:** proposed only. Before use, capture and contract one real header, define snapshot `as_of` and lookback semantics, dealer provenance, Sales-only validation, and PII minimization.

**User Activity and Deal Performance:** unavailable/quarantined until deterministic period selection is proved. Do not make an unreliable export look trustworthy.

**Manual CRM inspections/status history:** define the exact UI surface, field/event sought, period, immutable evidence, and retention limitation before entry. Full status-change history must not be inferred from current status or appointment rows.

### 5.3 Candidate unsaved Custom Reporting pass

Perform one read-only Honda dataset-discovery pass before any export. Inspect only candidate Sales datasets already observed in Custom Reporting: Leads, Appointments, CRM Sales, Customer Contact, Daily Communication Summary by User (Sales columns only), Daily Dealer Summary, Recent Task Detail, Traffic/Showroom Visits, Users, DMS Sales, Inventory, Vehicle Trade-Ins, and Website Vehicle Views. `Service` and `Service Appointments` are never opened or selected.

For every candidate dataset, record:

- exact dataset/report name and URL/surface;
- selectable fields and types;
- dealer, date, Lead Type, Lead Intent, and source filters actually available;
- deterministic period behavior and row grain;
- export format and header signature;
- minimal fields required by named SW metrics;
- stable IDs available for joins and deduplication;
- PII fields present versus fields retained;
- Sales-only proof and negative checks;
- metric IDs supported, still ambiguous, or disproved; and
- whether the dataset can be scheduled, exported unsaved, or only inspected manually.

Dataset presence is candidate evidence, not proof of calculability.

### 5.4 Minimum extraction schemas

| Source | Minimum analytical fields | Required controls |
|---|---|---|
| Lead Source ROI | source label/ID, leads, duplicates, contacts, appointments, shows/visits, sold, front/back/total gross, configured cost where populated | Native XLSX, Filters, exact dealer/period/Lead Type/Intent, no Service/Parts, preserve spaced native headers |
| CAGE | dealer, lead type, user/rep ID, leads, contact/appointment/visit/deal measures, channel communications, tasks | Native XLSX, Filters, exact dealer/period, Internet/Phone/Walk-in, no Service/Parts |
| Sales Communication | activity timestamp, channel, direction, Sales communication type, rep/user stable ID, pseudonymized customer/lead stable ID; message text only inside the separately authorized protected-content envelope | Raw immutable XLSX in protected evidence storage; no Service/Parts; deterministic local date; PII-minimized analytical derivative; no content in metric tables |
| CRM Sales Gross | dealer/ID, sale ID/deal number, sold date, front/back/total gross, salesperson ID, lead/source join key if actually present | Exact period hint and dealer; delivered Sales rows; row and total reconciliation; no Dashboard substitution for per-deal reconciliation |
| Appointments | appointment ID, lead/customer pseudonymous join key, start/status/confirmed/rescheduled/completed/show/no-show timestamps/flags, rep/user ID, reason | Sales Appointment only, exact dealer/period, unique ID and status consistency |
| Dealer Dashboard | dealership totals and lead-type sections for leads, response, appointments, visits, sold, gross, communications, tasks | Native Filters, one dealer, exact period and allowed lead types; section/total reconciliation |
| Response Times | contract-required response, lead/customer stable IDs, status/timestamps, unanswered-task data, rep stable ID; drop names and optional vehicle enrichment from derivative | Raw+derivative+manifest, source host/capture/dealer binding, local-time conversion, Sales-only scan, PII minimization |
| Leads/Customer Contact/Task candidates | lead ID pseudonym, source/type/status, origination/modified/sold/response/contact timestamps, assigned rep ID, contact attempt/actual-contact dates, task type/due/completed status | Retain only fields required by named metric definitions; no customer names/contact details, VIN, notes, or message bodies without separate authorization |

Every acquisition package contains: immutable raw bytes, manifest, schema/period/dealer/Sales-only receipt, normalized derivative if needed, row-count reconciliation, artifact SHA-256, and a metric-dependency list.

### 5.5 Protected semantic-content envelope

A hash alone cannot reproduce sentiment, intent, question-answer alignment, personalization, or objection handling. Content-derived metrics therefore remain `crm_available_acquisition_pending` or `data_acquired_calculation_pending` until Duane authorizes a separate protected-content envelope that defines: encryption at rest/in transit; least-privilege readers; tenant-scoped deterministic HMAC entity/thread IDs; retention and deletion schedule; redacted human-audit samples; prohibition on content in metric tables/customer reports; and an immutable content-evidence hash.

The semantic evaluator must pin model, prompt, taxonomy/schema, preprocessing, language rules, and configuration. It requires a human-reviewed Honda calibration set, agreed precision/recall or accuracy and abstention thresholds, per-output evidence hashes, and drift/recalibration rules. Low-confidence outputs abstain; they do not become measured facts. Removing protected content at retention expiry may limit later reprocessing and must be recorded in lineage.

## 6. Detection, comparison, grading, and capability-aware baselines

Three concepts are never conflated:

- the **detection rule threshold** decides whether a Watchdog condition/event fires;
- the **comparison reference** provides historical, capability, industry, or peer context; and
- the **grade target** is the one approved standard used to score a gradable metric.

All three are separately versioned with provenance, compatibility, effective dates, and approval state. Alerts evaluate only the detection rule. Report grades use only the approved grade target. A comparison reference never silently changes either. Event/control metrics may be `gradable=false`. No metric receives an industry comparison unless the external definition, population, period, and denominator are compatible.

### 6.1 Honda capability snapshot

For each accepted period, persist:

- Sales throughput: leads, appointments, shows/visits, sold units, and actual average front/back/total gross;
- workforce: active sales reps, BDC staff, manager coverage, staffed days/hours, and known role changes;
- workload/capacity: leads and active opportunities per productive rep, communications/tasks per staffed hour, and source/channel mix;
- inventory context where available: units, age bands, make/model demand mix, and turn;
- dealer history: comparable prior periods and seasonality flags; and
- manual potential: Duane-provided achievable unit/gross target, source/date/rationale, effective period, confidence, and whether it is aspirational or capacity-constrained.

Potential remains an explicit manual assumption until a defensible market model exists. It is never silently treated as an observed fact.

### 6.2 Comparison and grade-target precedence

1. Definition-compatible dealer historical baseline with sufficient periods;
2. capability-normalized target based on throughput, active team, staffed capacity, and source mix;
3. definition-compatible published industry benchmark;
4. compatible peer/cohort benchmark, when separately governed; and
5. operator-supplied potential/target, labeled as an assumption.

Multiple comparison references may be shown, but each gradable metric has one approved grade target. Insufficient history or incompatible definitions produce an unresolved grade target—not a zero or fabricated grade. A catalog condition’s threshold remains its detection rule unless separately versioned and approved.

Because this is a Honda-only pilot, existing three-rooftop peer ranking is omitted rather than collapsed into a meaningless rank of one or silently redefined. A future peer rank requires a separately compatible and governed comparison set; it is not a Honda execution dependency.

### 6.3 Reference and grade-target records

Each record stores: record ID/type, metric/version, profile, basis, formula, value/range, unit, comparator/polarity, source and publication date, valid period, capability-snapshot ID, inputs, assumptions, minimum sample/history, confidence, compatibility result, approval state, and a customer-readable derivation narrative.

### 6.4 Opportunity impact

Incremental-unit and dollar estimates are allowed only when an eligible population, deduplicated affected entities, a sourced or historically observed uplift range, and actual/clearly labeled assumed gross are available. Report low/base/high ranges and assumptions. Never sum overlapping module opportunities without stable-ID deduplication. If those inputs do not exist, state the operational opportunity without inventing unit or ROI impact.

## 7. Minimal additive InfoStore/Brain design

The existing generic `events`, `observations`, `outputs`, and source references are insufficient for reproducible metric history. Add per-profile, append-oriented records; no dashboard is required.

1. `watchdog_metric_definition` — metric ID/version, module, business question, formula, numerator/denominator definitions, unit, polarity, cadence, required sources/fields, boundary class, effective dates, definition status, and `gradable` flag.
2. `watchdog_detection_rule` — alert/event condition and threshold, provenance, effective dates, approval state, and evaluation semantics. A comparison reference never silently changes this trigger.
3. `watchdog_source_artifact` — **admitted Sales-only artifacts only**: family, source type, filename/raw location, SHA, profile/dealer, period, capture/receipt provenance, schema version, dealer/period result, row counts, and admission receipt. Contaminated/rejected bytes and their minimal manifest live only in the segregated pre-admission vault, never this table or Honda Brain.
4. `watchdog_normalized_dataset` — raw artifact IDs, normalized SHA, exact filter/query spec, row-key-set hash, timezone/as-of/watermark, late-correction version, transformation code/config hash, join keys, join cardinality/unmatched counts, and input/output reconciliation.
5. `watchdog_capability_snapshot` — period-specific throughput, workforce, staffed capacity, inventory context, source mix, manual potential and provenance.
6. `watchdog_comparison_reference` — historical/capability/industry/peer context with formula, compatibility, source, assumptions, confidence, and narrative; reference-only unless separately approved as the grading target.
7. `watchdog_grade_target` — the one approved target used to grade a gradable metric, with source/provenance, effective dates, compatibility, and approval. Event/control metrics may be `gradable=false`.
8. `watchdog_metric_observation` — metric/version, period, value/unit, numerator/denominator, immutable normalized-dataset lineage ID, confidence, disposition, unresolved reason/owner/action.
9. `watchdog_metric_evaluation` — observation/detection/comparison/grade-target links, variance, rating/grade, sample sufficiency, contribution details, impact range, acceptance state and reviewer evidence.
10. `watchdog_module_run` — module/version, expected subset, run/period, exact `accepted_measured_ids`, `accepted_disposition_only_ids`, and `rejected_ids` partitions, input/output hashes, reconciliation/QC results, and acceptance state.
11. `watchdog_finding` plus a metric-link table — internal/customer audiences, evidence versus hypothesis, contributing metric/evaluation IDs, root-cause class, recommended manager/rep/system action, notification/automation candidate, impact/confidence, no double counting.
12. `watchdog_report_run` — module-run IDs, report version, source cutoff/freshness, PDF/internal artifact hashes, QA receipt, delivery/activation state.

Required invariants: one profile/tenant per database; append-only observations/evaluations; idempotent run and artifact keys; immutable source hashes; versioned formulas/baselines; no PII in metric tables; explicit missing status; reproducible report-as-of reconstruction; rollback by disabling a new pipeline version, never deleting source history.

### 7.1 Target end-to-end data path

The one canonical path is:

`scheduled Gmail attachment OR governed browser package` → `neutral pre-admission inspection` → `family/provenance/dealer/period/Sales-only classifier` → either `[segregated quarantine/evidence vault outside Honda Brain]` or `[immutable admitted Honda landing → watchdog_source_artifact → idempotent promotion]` → `family-normalized rows` → `direct metric observations` → `derived observations` → `versioned evaluation` → `module run/findings` → `InfoStore trend/query` → `accepted subsection` → `Honda PDF/internal companion`.

Every arrow emits a receipt with input/output hashes, counts, version, result, and replay key. A source is acquired once per `(family, dealer, period, schema_revision)`, not once forever. Quarantine is terminal for that artifact; it cannot be sanitized downstream into acceptance or fan out to metrics. Quarantined bytes are retained only under the vault’s access/retention policy. A missing delivery opens a visible source-run exception and does not create empty observations. Manual/browser packages enter at the same classifier boundary after their family-specific manifest is proved. The report layer reads accepted InfoStore evaluations rather than reopening ad hoc workbooks.

## 8. Execution phases and gates

### Phase 0 — freeze scope and recover current truth

- Pin repository/contract/catalog hashes and Honda identity.
- Inventory/fingerprint existing saved schedules and last deliveries without modifying them.
- Reconcile main versus isolated ingest branches and choose one canonical dev integration branch.
- Produce an implemented/partial/documented/absent capability ledger.
- Inventory unrelated live Studio daemons/crons/webhooks as explicit no-touch surfaces; this goal may integrate the Honda dev path but may not refactor production messaging, sentinel, communications, Vapi, or other established circuits.

**Gate:** catalog is exactly 295; Service overlay/exclusions are explicit; schedule inventory exists; no dirty or competing writer; rollback point recorded.

### Phase 1 — metric specification and dependency graph

- Create the machine-readable 11-module map with every ID exactly once.
- For each metric, define business question, direct fields, formula, population, denominator, window, cadence, source dependencies, disposition, baseline needs, impact method, and outside-domain state.
- Re-adjudicate catalog misclassifications, including Sales-labeled rows that actually require Service, cross-rooftop, valuation, or external data.
- Add exact boundary class and the three-part threshold/reference/grade-target model for every metric.

**Gate:** 295/295 definitions have exact ownership and source disposition; no generic visibility statements; no calculated claim without a complete formula and direct fields.

### Phase 2 — baseline and capability contract

- Implement the Honda capability snapshot and baseline hierarchy design.
- Load existing compatible operational targets only; mark incompatible industry references as reference-only.
- Define the manual potential input form and narrative.

**Gate:** every gradable metric has a compatible baseline method or an explicit unresolved baseline dependency; no invented benchmark.

### Phase 3 — canonical Studio plumbing in development

- Unify native classifier, landing, promotion, readers, metric mapping, and report path.
- Add metric/history schema and migrations.
- Make Honda-only execution first class; remove the three-rooftop rank dependency from Honda acceptance.
- Preserve original raw files and source provenance.

**Gate:** migration up/down/rollback plan, idempotence, one-tenant and Sales-only negative tests, real Honda golden per implemented family, no production deployment.

### Phase 4 — prove source routes, one family at a time

- Reuse current accepted Honda native families first.
- Investigate clean Sales-only alternatives for quarantined ROI/CAGE/Communication without modifying schedules.
- Perform the one-pass Custom Reporting discovery and contract each proved dataset.
- Contract browser/manual families before capture.
- Register external/history/outside-domain rows without substituting values.

Each unresolved route receives one finite investigation packet: one documentation/help-contract pass, one read-only UI discovery pass, and one controlled unsaved export/probe. A fourth pass requires materially new evidence or route approval. Failure yields a precise pending disposition with evidence, owner, next action, and review date; it does not prove `genuinely_not_available`. That terminal disposition requires affirmative source/retention/product evidence.

**Gate per family:** raw artifact/provenance proof plus independent normalized/row-reconciliation proof. A failed family stops only its dependent metrics, not unrelated modules.

### Phase 5 — acquire and ingest Honda data

- Acquire each contracted source once, preserve raw, validate, and ingest to development.
- Run source validators on every meaningful batch.
- Persist source artifacts and dispositions before computing metrics.

**Gate:** source hash, dealer/period/schema/Sales-only proof, row counts, accepted/held state, freshness, and repeatability receipt. No contaminated family promotion.

### Phase 6 — calculate and persist metrics by module

- Run modules in the prescribed order.
- Persist direct observations first, derived calculations second, baselines/evaluations third.
- Terminate a metric cleanly when a required direct input is absent; do not infer around it.

**Gate per metric:** independent formula recomputation from normalized evidence; numerator/denominator/unit/period match; missing-is-not-zero negative test; disposition persisted.

### Phase 7 — interpret, cross-reference, and quantify

- Generate each module’s facts, root-cause hypotheses, contributing rep/source/cohort evidence, management actions, and agent/automation candidates.
- Cross-reference accepted metrics to find larger patterns in people, process, technology, vendors, training, customer experience, leakage, and sales/cost opportunity.
- Separate evidence, hypothesis, recommendation, and unresolved dependency.

**Gate:** every narrative claim links to accepted metric evaluations; causal language requires ordering/direct evidence; impact estimates are deduplicated and reproducible.

### Phase 8 — subsection reports and module acceptance

Each module emits: metric table, baseline narrative, variance/confidence, what it means, top strengths/weaknesses, management actions, automation candidates, data freshness, internal evidence, and unresolved dependencies. Customer-facing prose remains constructive and sales-oriented; technical limitations and quarantine detail stay in the internal companion unless necessary to prevent a misleading claim.

Every one of the 11 module artifacts exists even when some inputs are unresolved and carries three exact, mutually exclusive partitions: `accepted_measured_ids`, `accepted_disposition_only_ids`, and `rejected_ids`. Narrative and grades use measured IDs only. The safe appendix uses all 295 IDs. A source failure blocks only its dependent IDs; it never erases the rest of a module. A rejected ID prevents final completion until corrected or converted to an evidence-backed disposition allowed by the authorized source envelope.

**Gate:** source→normalized proof and normalized→metric/report proof; calculation QA; narrative claim audit; customer-language audit; rendered visual QA; independent shadow review.

### Phase 9 — Honda report card and executive synthesis

- Assemble all 11 accepted module artifacts; only their `accepted_measured_ids` feed grades and narrative, while disposition-only IDs feed the safe appendix.
- Grade subsets and sections from their accepted metrics using a declared weighting method.
- Build the executive opening from the best/worst, highest-impact, highest-confidence cross-module findings.
- Produce the complete metric appendix with exact dispositions and a separate internal evidence companion.

**Gate:** exact 295 coverage, no duplicate/missing IDs, accepted modules only, grades reconcile, freshness/as-of visible, all figures traceable, PDF text/render/hash checks pass.

### Phase 10 — repeatability, simulated alerts, and handoff

- Repeat a Honda run with a new period or immutable replay fixture.
- Simulate representative manager, sales-manager, and salesperson alert/automation candidates against accepted observations without delivering them.
- Document cadence for daily/weekly/manual/external sources and recovery from missing/quarantined deliveries.
- Prepare the Nissan/Ford cloning checklist; do not execute it in the Honda goal.

**Gate:** second-run idempotence/reproducibility, trend query proof, alert decision audit, no external send, and complete operator runbook.

## 9. Quality-control and two-delta proof

Every source, metric, module, and report must prove two independent deltas:

1. **Evidence delta:** immutable raw source → admitted normalized rows. Prove checksum, profile/dealer, period, schema, Sales-only/PII controls, exclusions, and row reconciliation.
2. **Meaning delta:** normalized rows → metric/baseline/evaluation/narrative. Prove formula, numerator/denominator, definition compatibility, baseline version, confidence, claim links, and rendered output.

Automated independent recomputation runs on 100% of deterministic metrics. The impartial shadow recomputes 100% of high-impact customer claims, grades, outliers, and impact estimates plus a seeded, recorded ordinary-metric sample in every module; the sample rotates on run 2. The shadow has no authorship, deployment, delivery, or approval interest; a clean review permits routine progress. Duane is asked only when an outcome, authority, data source, schedule definition, compliance scope, production behavior, customer commitment, or required acceptance evidence would materially change.

Stop conditions include: wrong dealer; any Service/Parts evidence in Sales; ambiguous period; schema drift; missing required provenance; PII outside the approved envelope; formula/denominator ambiguity; incompatible baseline; competing writer/dirty branch overlap; required source skipped/substituted; or an action that would alter production/customer behavior. A failed module cannot block unrelated modules, but it cannot enter the final report as accepted.

## 10. Roles

### Codex — Honda acquisition and acceptance controller

- Maintain the 295 dependency/disposition ledger and module gates.
- Inspect VinSolutions read-only, preserve schedules, acquire approved Sales-only raw artifacts, create manifests, and prove dealer/period/schema/Sales-only/PII boundaries.
- Package governed inputs for Studio, reconcile receipts, run source and module acceptance, coordinate the impartial shadow, and verify the final PDF.
- Do not weaken validators, modify CRM/customer records, infer missing data, activate external alerts, deploy production, or expand beyond Honda without authority.

### Claude/Studio — development implementation owner

- On a clean development branch, own schema migrations, canonical landing/promotion integration, readers, transformations, metric specifications, baseline engine, module runner, persistence/query paths, subsection/report-library generation, and tests.
- Consume only Codex-governed source packages and exact metric/source contracts.
- Return code/test/runtime evidence; do not browse VinSolutions/Gmail, alter saved schedules, manufacture source data, change the Sales boundary, deploy production, or send customer output.

### Duane — business and consequential authority

- Provide/ratify manual potential, business-hour/staffing inputs, business thresholds/weighting where data cannot decide them, and customer-facing priorities.
- Approve material schedule changes, new external/compliance/PII/cross-rooftop/Service sources, production activation/deployment, customer delivery, and any change in intended outcome.
- Routine technical implementation and clean independent-review progression do not require repeated Duane approval.

### Impartial shadow — independent evidence reviewer

- Review read-only from pinned artifacts, recompute high-impact results, challenge omissions/misclassification/double counting, and issue pass/hold with exact evidence.
- Must not author the implementation under review, deploy it, deliver it, receive benefit from a pass, or substitute its preferences for the accepted outcome.

## 11. Required execution artifacts

1. Current-state implementation ledger and pinned source hashes.
2. Machine-readable 295→11 module map and validator.
3. Per-metric definition/dependency/disposition registry.
4. Source inventory, schedule fingerprints, and acquisition contracts.
5. Browser/manual agent extraction schemas and runbooks.
6. Baseline/capability model and manual-input schema.
7. InfoStore/Brain migration design and rollback plan.
8. Family readers/transformers plus real-golden and negative tests.
9. Per-module calculation, interpretation, QC, and acceptance artifacts.
10. Honda trend/query proof and deterministic second-run receipt.
11. Eleven subsection artifacts, final customer PDF, and internal evidence companion.
12. Simulated alert/automation decision evidence and a production-activation plan that remains inactive.
13. Honda operator runbook and later-store replication checklist.

## 12. Operator acceptance checklists

### Source-family checklist

- [ ] Exact Honda profile/dealer, source kind, period, timezone, and cadence
- [ ] Immutable raw file and SHA-256; valid receipt/capture provenance; admitted artifacts in Honda landing or rejected bytes only in the segregated vault
- [ ] Contracted header/types and deterministic period behavior
- [ ] Sales-only raw/Filters/rows; zero Service/Parts; data minimization passed
- [ ] Total/accepted/excluded/quarantined rows reconcile
- [ ] Normalized lineage records filter/query, row-key hash, join keys/cardinality/unmatched counts, watermark, and code/config hash
- [ ] Real Honda positive golden plus wrong-dealer/period/schema/Service/missing negative tests
- [ ] Idempotent landing and promotion receipt; prior schedule fingerprint unchanged

### Metric checklist

- [ ] Exact SW ID/version/module and direct source fields
- [ ] Population, numerator, denominator, formula, unit, polarity, and period defined
- [ ] Observation independently recomputes from normalized rows
- [ ] Baseline definition-compatible, versioned, and narrated
- [ ] Detection threshold, comparison reference, and approved grade target remain distinct
- [ ] Confidence/sample sufficiency and explicit disposition stored
- [ ] No substitute/inferred value used to hide an absent field
- [ ] Content-derived result has authorized protected evidence, pinned evaluator, calibration, and abstention proof

### Module checklist

- [ ] Expected IDs present exactly once; status totals reconcile
- [ ] Measured/disposition-only/rejected partitions are exact and mutually exclusive
- [ ] All measured metrics passed evidence and meaning deltas
- [ ] Grade/weighting and opportunity estimates reproducible and deduplicated
- [ ] Facts, hypotheses, recommendations, and dependencies clearly separated
- [ ] Management/rep/vendor/process/agent actions trace to evidence
- [ ] Internal calculation, customer-language, visual, and impartial-shadow QA passed

### Final Honda checklist

- [ ] Exact `SW-001..SW-295` disposition coverage
- [ ] Exact boundary classes and 18-ID Service overlay; Service has no Honda value/narrative/grade
- [ ] Accepted module library is the only report input
- [ ] Executive findings reconcile to subsections and freshness/as-of is visible
- [ ] PDF and internal companion hashes/render/text/references pass
- [ ] Second run proves replay/idempotence, trend retrieval, and no silent gaps
- [ ] Alerts simulated but unsent; no Nissan/Ford, production, customer email, or Service expansion

## 13. Definition of execution completion

The future Honda execution goal is complete only when all 295 metrics have exact boundary classes and dispositions; every metric inside the explicitly authorized Honda Sales source envelope is measured or has an evidence-backed allowed disposition; every obtainable in-envelope metric has been acquired, processed, persisted, and independently tested; every module reconciles; the Honda report card and internal companion are reproducible; the second run proves repeatability/trend retrieval; and no required source, file, metric, or gate was silently skipped. External/authorization-required IDs may complete as evidence-backed dispositions, never as measured data. `Genuinely_not_available` requires affirmative investigation evidence. Service/Parts remain outside Honda Sales throughout.
