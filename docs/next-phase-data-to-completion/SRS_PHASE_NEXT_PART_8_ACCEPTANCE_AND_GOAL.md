# SRS — Part 8 — Acceptance criteria, agent obligations, and the /goal

## 8.1 Acceptance criteria the agent must memorialize

The agent MUST read this section, fold it into its current implementation plan, and treat it as the launch gate.

### 8.1.1 Core architecture
- Brain exists per profile at `~/.hermes/profiles/<profile>/brain/`.
- DSG enforces all Brain writes and cross-profile reads.
- KSG enforces all wiki writes and cross-profile reads.
- DSG and KSG share one policy engine and one audit log.
- Single MCP connection per profile carries `wiki_*`, `brain_*`, `federation_*`, `comms_*`, and admin tools.
- No fourth cross-profile access surface introduced.
- Configuration over code preserved; no Hermes core forks unless documented as deliberate exceptions.

### 8.1.2 Wiki invariants
- Every customer wiki includes Scope Contract, Confidence Schema, Human Relay Specification, Integration Playbooks, House Canon Reference, and Always-on Metadata Substrate.
- A wiki missing any invariant is rejected by the Consultative Agent and the deployment flow.

### 8.1.3 Brain content
- Record families from Tranche B are present and populated for the test fixture.
- Hunches lifecycle works.
- Lookup-miss and assumption surfacing works end-to-end.
- Reconciliation items are created on contradictions and resolvable through the governed path.
- Adjacent data neighbors are recorded and classified for the test fixture.
- Memory layer reconstructs decision context for arbitrary past agent actions.
- Embeddings pipeline is functional with at least one supported model.
- Schema migration discipline is enforced and reversible.

### 8.1.4 Consultative Agent
- End-to-end engagement runs against the Cedar Ridge fixture and produces a complete prescription package.
- Wiki authoring and Brain seeding succeed under KSG and DSG enforcement.
- Assumption surfacing is exercised at least three times during the simulation.
- Capability gap proposals are emitted when relevant.

### 8.1.5 Plugin, skills, federation, comms
- Plugin installs cleanly on a fresh Hermes + Huminic Studio host.
- Required skills are present and loadable on at least one test profile.
- Dashboard renderer choice is documented and embedded per profile.
- Federation read scopes are enforced; unauthorized scopes are denied.
- Comms tools route through MCP with allowlists and rate caps.
- Upload surface is operational with DSG-governed classification.

### 8.1.6 Rollup
- Huminic-the-company rollup works through authorized children with full audit.
- Children without granted rollup scope are denied.

### 8.1.7 Security
- F.1 through F.8 pass with evidence.
- F.9 pen-test sweep shows zero open holes or each finding is documented with explicit accepted-risk disposition before launch.

### 8.1.8 Evals
- All headless tests pass.
- All headed tests pass.
- Evidence pack is published in the engagement log.

### 8.1.9 Documentation
- Documentation is updated to match the shipped behavior including: tools, plugin install, skills, dashboard renderer choice, MCP scope vocabulary, federation engine choice, embeddings model, schema migration discipline, backup/restore, rollup auth, and the six wiki invariants.

### 8.1.10 Decision log
- `decisions.log` exists in the engagement log and captures every non-trivial choice the agent made.

## 8.2 Agent obligations during implementation

1. **Plan integration:** the agent MUST merge this SRS into its current implementation plan before starting work, restate the tranches and acceptance criteria in its plan, and proceed in tranche order: A → B → C → D → E → F → G.
2. **Field adaptation authority:** the agent MAY adapt this plan as long as the acceptance criteria in 8.1 are still met and the rules of engagement in Part 1 are preserved. Adaptations MUST be recorded in `decisions.log`.
3. **No silent skips:** every MUST is non-negotiable. Skipping a MUST is a launch blocker and MUST be raised in the final report.
4. **Configuration over code:** prefer skills, profiles, MCP tools, wiki files, plugin extensions, and Hermes-native features over custom code. Any exception MUST be justified in `decisions.log`.
5. **Memorialize everything:** outcomes, decisions, lookup misses, assumptions, hunches, reconciliations, drift observations, and self-improvement events MUST all land in the proper records.
6. **Self-confirmation:** when uncertain, the agent MUST record the question, options, and chosen option in `decisions.log` before acting. It does not interrupt the operator mid-implementation.
7. **Critical thinking, not boilerplate:** every requirement gets real evidence, not a "looks fine" claim.

## 8.3 Out of scope for this phase
- The Nexxus cutover, which is tracked separately.
- New customer feature work not required by the acceptance criteria above.
- Replacing Hermes-native primitives with custom alternatives.

## 8.4 /goal for the implementation agent

```text
/goal Complete the pre-launch implementation of Huminic Studio per the Next Phase SRS in this package.

Read all eight parts of the SRS plus the verbatim user instruction file. Fold the acceptance criteria into your current implementation plan and proceed in tranche order A through G.

Build the per-profile Brain at ~/.hermes/profiles/<profile>/brain/ with the storage substrate, migrations, backup/restore, and DSG gate. Mirror the KSG gating pattern in the DSG, share one policy engine and one audit log, and add the Brain tools to the existing MCP token registry. Implement the always-on metadata substrate as the sixth wiki invariant and reject any deployment that lacks it.

Operationalize the Knowledge ↔ Brain interaction contract from Artifact B v1.1 across every profile. Implement the Brain record families adapted from Artifact D v1, including hunches, lookup_misses, chat_records, and assumptions. Build the memory layer, the embeddings pipeline, and the schema migration discipline. Capture adjacent-data-neighbor anticipation as a first-class element of engagement-state and Brain content.

Complete the Consultative Agent so it can run an end-to-end engagement against the Cedar Ridge Automotive Group fixture and any future customer, including wiki authoring under KSG, Brain seeding under DSG, assumption surfacing, capability gap proposals, and full prescription package emission.

Harden the plugin, ship the required skills, choose and document the dashboard renderer, enforce federation.read_scopes through checkScope, route communications through MCP, build the governed upload surface, and reuse the existing SSE bus. Then implement the Huminic-the-company rollup through authorized children with full audit.

Execute the F.1 through F.9 security review including headed and headless pen-test sweeps. Run every user story in Tranche G with both headless and headed evals and publish the evidence pack in the engagement log. Maintain decisions.log throughout and use it to memorialize every non-trivial choice you make.

Adapt the plan in the field as needed, but do not weaken any MUST. Do not modify Hermes core unless you can record a deliberate, justified exception. When done, return: executive summary, tranche-by-tranche status, acceptance-criteria checklist with evidence references, decisions.log summary, security review summary, and a launch readiness recommendation.

The Nexxus cutover is out of scope for this phase. After this phase the system must be launch-ready.
```
