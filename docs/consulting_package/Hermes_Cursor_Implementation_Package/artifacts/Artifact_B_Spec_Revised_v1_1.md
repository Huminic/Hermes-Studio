# Artifact B — The Spec

*The normative specification for building agent wikis, governance, prescriptions, and the boundary between the Knowledge Brain and the Data Brain.*

This document is standalone. A person or agent who has never read Artifact A can follow this document and produce correct work. It defines how — the conventions, the primitives, the governance, the prescription package, the build method, and the interaction contract between the markdown knowledge layer and the structured operational layer.

Normative language: **MUST / MUST NOT** are hard requirements. **SHOULD / SHOULD NOT** are strong defaults that may be overridden with a recorded reason. **MAY** is genuinely optional.

Version: 1.1. This is a living specification; §11 lists what v1.1 deliberately leaves open.

---

## Table of Contents

1. Scope and Intent  
2. Foundational Conventions  
3. The Primitive Catalogue  
4. The Invariants  
5. The Governance Model  
6. The Prescription Package  
7. The Build Method  
8. Strategic vs. Tactical Handling  
9. Knowledge Brain ↔ Data Brain Interaction Contract  
10. Industry Onboarding  
11. Open Conventions and Deferred Decisions  
Appendix A — Frontmatter Field Reference  
Appendix B — Primitive Templates  
Appendix C — Worked Frontmatter Examples

---

## 1. Scope and Intent

### 1.1 What this spec governs

This spec governs the construction of agent wikis — folders of markdown files that constitute the operating knowledge of an AI agent — and the prescription packages that a consultative agent produces when designing such wikis and their supporting operational/data layers for a client.

It applies to:

- any wiki built to be read by an agent at run-time;
- any wiki built to be authored and governed by humans and agents at build-time;
- the prescription package handed from a consultative agent to a deployment;
- the specification of the per-wiki and per-database semantic agents that govern those layers;
- the contract by which the Knowledge Brain and Data Brain interact.

### 1.2 What this spec does not govern

This spec does **not** govern:

- platform architecture implementation details such as projection services, MCP gateway internals, hosting, deployment mechanics, or database physical schema design;
- production code for client agents;
- business decisions belonging to the client;
- full implementation of the Data Brain at this stage.

This spec defines what artifacts must exist, what they must contain, how they must be governed, and how they must relate. It does not prescribe the final production runtime that consumes them.

### 1.3 The two pillars

Every conformant deployment separates two pillars and never conflates them:

- **Knowledge Brain** — what an agent must know to act correctly. Lives in markdown files in folders. Governed by a wiki semantic agent.
- **Data Brain** — the structured operational state and recorded outputs of the system. Lives in a database or other structured store. Governed by a database semantic agent.

The Knowledge Brain is authoritative for canonical organizational knowledge: workflows, blueprints, methodologies, reporting requirements, rationale, policies, and operating context.

The Data Brain is authoritative for deterministic operational state: events, state projections, tasks, transactions, retrieval snapshots, reconciliation items, source-linked runtime records, and other structured operational facts.

When in doubt:

- if it is read to understand meaning, policy, workflow, or rationale, it is **Knowledge**;
- if it is written to record what happened, what exists now, or what runtime must trust, it is **Data**.

### 1.4 Current implementation posture

In the current implementation sequence, the Knowledge Brain and its Hermes-based operating environment are being operationalized first. The Data Brain is still part of every prescription and MUST be designed explicitly, but may be represented initially as a contract, interface, and requirement set rather than as a fully implemented semantic database. A wiki built under this spec MUST therefore avoid assumptions that would block later Data Brain implementation.

---

## 2. Foundational Conventions

These conventions are inherited by every wiki built under this spec. They are hard to change later because every page and every downstream agent depends on them.

### 2.1 File format

- Every wiki page MUST be a single UTF-8 markdown file with a `.md` extension.
- Every page MUST begin with a YAML frontmatter block delimited by `---` on its own line above and below.
- Body content MUST be GitHub-Flavored Markdown.
- A page SHOULD be one primitive. Mixing two primitive types in one file is NOT allowed; split them.

### 2.2 The frontmatter schema

Frontmatter is load-bearing. The folder a page lives in tells you almost nothing; the frontmatter tells you everything. Every page MUST carry the following core fields.

```yaml
---
id: kebab-case-stable-identifier
type: procedure
title: Human Readable Title
status: active
domain: client-delivery
created: 2026-05-27
updated: 2026-05-27
owner: role:operations-lead
tags: [intake, onboarding]
links: []
edit_policy: governed
review_required: false
gated: false
---
```

Epistemic fields are required on all strategic-knowledge primitives and optional on tactical ones:

```yaml
confidence:
  source_reliability: B
  info_credibility: 2
provenance:
  - source: "Industry report, Q1 2026"
    retrieved: 2026-05-20
    note: "primary"
last_verified: 2026-05-20
```

For tactical primitives, the simpler model applies and confidence MAY be replaced by:

```yaml
authority: canonical
```

### 2.3 Page IDs

- IDs MUST be kebab-case, lowercase, ASCII.
- IDs MUST be unique within a wiki.
- IDs MUST NOT change when a page is renamed or moved.
- IDs SHOULD be human-readable and descriptive.
- When a page is superseded, the old id MUST NOT be reused.

### 2.4 Folder conventions

Folders are shallow and boring on purpose. They express the single most useful grouping for this wiki and nothing more.

- Folder depth SHOULD NOT exceed three levels below the wiki root.
- Every wiki MUST have a root `index.md` and a root `log.md`.
- A `templates/` folder MUST exist at the root.
- An `archive/` folder MUST exist for deprecated and superseded pages.
- The grouping dimension is chosen per wiki; all other dimensions belong in frontmatter and links.

Recommended root layout:

```text
wiki/
  index.md
  log.md
  hot.md
  templates/
  canon/
  knowledge/
  governance/
  data/
  vocabulary/
  archive/
```

### 2.5 Link conventions

- Cross-page references MUST be recorded in the `links:` frontmatter list.
- In the body, references SHOULD use wikilink syntax like `[[target-id]]`.
- Every new page MUST be linked from at least one other page.
- Links SHOULD be bidirectional where the relationship is mutual.

### 2.6 Versioning

- Substantive edits MUST bump the `updated` date.
- The wiki SHOULD live under version control.
- `log.md` MUST record significant human-readable changes.

### 2.7 Ghost containers

A ghost container is an empty folder containing only a `README.md` that describes what would live there if it existed.

A ghost container's `README.md` MUST state:

- what primitive type belongs there,
- why it is expected,
- what would trigger its creation.

### 2.8 Naming conventions

- File names MUST match the page id plus `.md`.
- Titles MUST be human-readable and MAY differ from the id.
- Domains, tags, and roles MUST be lowercase kebab-case.

---

## 3. The Primitive Catalogue

A primitive is a page archetype with a fixed purpose, a fixed frontmatter shape, a fixed section template, defined expected-neighbors, and defined ghost containers. A wiki is an arrangement of primitives.

### 3.1 The three groupings

Primitives belong to one of three groupings:

- **Knowledge** — what the agent knows and reasons from;
- **Data** — how the agent reads, writes, records, and interprets operational state;
- **Governance** — the rules and boundaries on agent behavior.

### 3.2 Knowledge primitives

**Procedure** — ordered, repeatable steps for a defined task. Tactical.  
**Decision rule** — explicit branching from input to output. Tactical.  
**Schema** — data shape for a tool, handoff, or object. Either.  
**Reference** — lookup tables, glossaries, immutable facts. Either.  
**Runbook** — failure modes and recovery procedures. Tactical.  
**Framework** — a mental model or heuristic. Strategic.  
**Case** — a real situation, what was tried, what happened, what was learned. Strategic.  
**Entity profile** — a person, company, system, product, or account. Either.  
**Concept** — a named idea defined and linked to neighbors. Either.

### 3.3 Data primitives

**Integration playbook** — the operational knowledge required to use an external system correctly. Tactical.  
**KPI / value definition** — a defined metric and how it is computed. Either.  
**Data contract** — what gets written, where, in what shape, and with what guarantees. Tactical.  
**Projection definition** — the intended current-state view derived from events or source systems. Tactical.  
**Event class reference** — definitions of event families the Data Brain records. Tactical.  
**Reconciliation rule** — what kinds of ambiguity or conflict generate reconciliation items and how they must be handled. Governance/Data bridge.

### 3.4 Governance primitives

**Scope contract** — one per agent; mandatory invariant.  
**Policy** — a broad rule with rationale and scope.  
**Approval matrix** — which actions require which approvals.  
**Human relay specification** — how approval, input requests, and feedback loops work.

### 3.5 Cross-cutting primitives

**Vocabulary entry** — client-term ↔ canonical-term mapping.  
**Industry brief** — reusable industry onboarding artifact.  
**Ghost** — placeholder primitive.

### 3.6 Primitive rule

A primitive type MAY be added only deliberately. Adding a primitive requires:

- a defined purpose;
- a fixed frontmatter shape;
- a section template;
- expected neighbors;
- ghost-container implications;
- lint implications.

---

## 4. The Invariants

Five components MUST appear in every agent wiki regardless of purpose.

### 4.1 Scope Contract

Every agent MUST have exactly one scope contract defining:

- owns end-to-end;
- proposes, does not execute;
- must escalate;
- must never touch;
- human owns.

### 4.2 Confidence Schema

Every wiki MUST adopt a confidence schema.

Default strategic schema: NATO Admiralty Code.

- Source reliability: A–F
- Information credibility: 1–6

Tactical knowledge uses:

- `authority: canonical | under-review | deprecated`

Strategic outputs MUST propagate confidence rather than convert uncertainty into certainty.

### 4.3 Human Relay Specification

Every wiki MUST specify:

- approval gates,
- input requests,
- feedback loops.

### 4.4 Integration Playbooks

For every external system an agent touches, an integration playbook MUST exist.

### 4.5 House Canon Reference

Every wiki MUST include canon references to the firm-level documents shaping the agent's worldview.

---

## 5. The Governance Model

Governance is how edits happen, who is authorized, and how drift is caught.

### 5.1 Edit policy

Every page carries `edit_policy`:

- `open`
- `governed`
- `locked`

Invariant pages MUST be governed or locked.

### 5.2 Review

Pages with `review_required: true` MUST NOT take effect until a second authorized reviewer approves.

### 5.3 The semantic agent's role

Each domain has a governing semantic agent.

The wiki semantic agent MUST:

- enforce `edit_policy` and `review_required`;
- maintain the link graph and backlinks;
- record every write to the metadata database;
- run lint on a defined cadence;
- surface drift;
- resolve wikilinks against the page registry.

The database semantic agent MUST:

- enforce write-path and read-path boundaries on the Data Brain;
- protect tenant and role boundaries on operational records;
- record event lineage and source references;
- expose structured runtime resources through MCP-mediated surfaces rather than uncontrolled direct access.

### 5.4 Drift observability

The semantic agent SHOULD surface divergence between what the wiki says and what agents actually do.

### 5.5 Lint

The semantic agent MUST periodically lint for:

- orphan pages;
- broken links;
- missing required frontmatter;
- stale verification;
- contradiction flags;
- expected-neighbor gaps worth ghost containers.

### 5.6 Renewal cadence

- Tactical procedures and integration playbooks: re-verify quarterly or when systems change.
- Strategic frameworks and cases: review monthly.
- Entity profiles: re-verify on triggering events.

---

## 6. The Prescription Package

The prescription package is the consultative agent's deliverable.

### 6.1 Contents

It MUST include:

1. client wiki;
2. agentic design prescription;
3. data-storage prescription;
4. MCP access spec;
5. wiki semantic agent spec;
6. database semantic agent spec.

### 6.2 Package manifest

The package MUST include `manifest.md` listing all six artifacts, their versions, the readiness gates passed, open decisions, and the deployment topology decision.

### 6.3 Readiness gates

- Ready to blueprint
- Ready to instantiate semantic runtime
- Ready to publish MCP projections
- Ready to hand off externally

### 6.4 Minimum and maximum engagement

Minimum: wiki layer plus governing semantic agent and MCP access.  
Maximum: the above plus deployed agent shapes and data-store requirements.

---

## 7. The Build Method

The method has six phases.

### 7.1 Orient

Learn the client and assemble the relevant strawman.

### 7.2 Audit

Examine what exists. Distinguish greenfield from brownfield.

### 7.3 Design

Decide agent topology, scope contracts, tool boundaries, relays, integration playbooks, and data reads/writes.

### 7.4 Author

Produce the wiki content and draft prescription package.

### 7.5 Validate

Run the Challenge Loop. Remove overconfident claims. Check completeness.

### 7.6 Package

Compile final form, write manifest, mark readiness gates.

---

## 8. Strategic vs. Tactical Handling

The strategic/tactical distinction is a lens applied throughout the method.

| Dimension | Tactical | Strategic |
|---|---|---|
| Retrieval model | Precision / exact-match | Associative / recall |
| Failure mode | Ambiguity | Narrow framing |
| Primary primitives | Procedure, decision-rule, schema, runbook, integration-playbook | Framework, case, entity-profile, concept |
| Confidence model | authority: canonical / under-review / deprecated | Admiralty confidence block |
| Human relay | Approval gates | Consultation with confidence annotations |
| Edit cadence | Strict versioning | Looser generative editing with contradiction review |

Design implication: strategic and tactical knowledge MAY coexist in one deployment, but they MUST remain separable in governance and retrieval behavior.

---

## 9. Knowledge Brain ↔ Data Brain Interaction Contract

This section defines how the two pillars interact.

### 9.1 The rule

The Knowledge Brain and Data Brain MUST remain distinct but connected.

- The Knowledge Brain tells the system what things mean and how work should be done.
- The Data Brain tells the system what is operationally true right now.
- Runtime agents MAY read from both.
- Runtime outputs MAY update the Data Brain directly through governed paths.
- Runtime outputs MUST NOT silently rewrite canonical wiki knowledge.

### 9.2 Extractable vs. reference-only wiki pages

Wiki pages fall into two relevant categories for Data Brain interaction:

- **Reference-only pages** — used for reasoning, policy, explanation, or human-readable context. These do not directly project into operational records.
- **Extractable pages** — contain assertions, schemas, reporting requirements, operational rules, or mappings that may be projected into structured records or runtime context.

A page that is extractable SHOULD declare that purpose explicitly in its content or related design docs.

### 9.3 Source references are mandatory bridges

Any structured record derived from wiki or source material MUST retain source lineage sufficient to trace back to the originating page or source span. At minimum, the bridge MUST preserve:

- source page or document id/URI;
- extraction time;
- actor or process responsible;
- relevant version or timestamp.

### 9.4 Runtime writeback rule

Runtime MAY create:

- events;
- task updates;
- projections;
- transaction records;
- retrieval snapshots;
- reports and other operational artifacts;
- suggested knowledge changes;
- reconciliation items;
- draft narrative updates.

Runtime MUST NOT silently modify canonical wiki pages. Any proposed knowledge-layer update MUST flow through governed drafts, inboxes, suggested updates, or explicit review paths.

### 9.5 Contradictions

When narrative knowledge and operational state appear to conflict:

- the conflict MUST be surfaced;
- a reconciliation item SHOULD be created if the conflict affects execution or reporting;
- neither layer may silently overwrite the other;
- the resolution path MUST be attributable.

### 9.6 Reporting

Report requirements, schedules, templates, recipients, thresholds, and governance belong in the Knowledge Brain.

Generated reports, published output records, delivery events, and runtime execution traces belong in the Data Brain or other operational output stores.

### 9.7 Current phase posture

At current phase, the interaction contract MUST be specified even if the Data Brain implementation is still deferred. A conformant deployment therefore MUST:

- define what operational records are expected;
- define how runtime would reach them through MCP or equivalent governed surfaces;
- define what must be logged;
- avoid relying on implicit memory or ad hoc prompt text in place of operational records.

---

## 10. Industry Onboarding

Industry Onboarding is a defined procedure the agent runs against itself before engaging an unfamiliar industry.

The output is an industry brief containing:

- canonical frameworks;
- best-practice sources;
- regulatory/compliance shape;
- common operational domains;
- industry vocabulary;
- case patterns;
- overall confidence.

The first industry brief SHOULD be the agent's own industry.

---

## 11. Open Conventions and Deferred Decisions

v1.1 deliberately leaves open:

- contribution-back path from client engagements into House Canon;
- multi-tenancy of shared briefs and strawmen;
- deeper brownfield ingestion detail;
- vocabulary runtime behavior;
- cost/latency budgets on agent profiles;
- inter-agent contract primitive;
- full physical Data Brain schema;
- final runtime implementation of projections, reconciliation queues, and event sourcing.

These are next-layer concerns and do not block conformant authoring under this spec.

---

## Appendix A — Frontmatter Field Reference

| Field | Required | Values / Type | Notes |
|---|---|---|---|
| id | always | kebab-case string | unique, permanent |
| type | always | primitive type | see §3 |
| title | always | string | human-readable |
| status | always | active / draft / under-review / deprecated / archived | |
| domain | always | kebab-case string | operational domain |
| created | always | ISO 8601 date | |
| updated | always | ISO 8601 date | bump on substantive edit |
| owner | always | role:<role-name> | accountable role |
| tags | always | list | cross-cutting retrieval |
| links | always | list of ids | queryable link graph |
| edit_policy | always | open / governed / locked | |
| review_required | always | boolean | |
| gated | always | boolean | |
| confidence | strategic | Admiralty structure | |
| authority | tactical | canonical / under-review / deprecated | |
| provenance | strategic | list | |
| last_verified | recommended | ISO 8601 date | |
| superseded_by | when deprecated | id | replacement |

---

## Appendix B — Primitive Templates

Templates follow the same conventions as v1.0, with the addition that Data Brain-facing primitives MAY include explicit sections for projection intent, runtime consumers, and source-reference expectations where appropriate.

Minimum required templates:

- procedure
- framework
- integration-playbook
- scope-contract
- industry-brief
- ghost-readme
- data-contract
- projection-definition
- reconciliation-rule

---

## Appendix C — Worked Frontmatter Examples

Worked examples from v1.0 remain valid, with the additional expectation that Data Brain-facing pages identify operational destinations, projection intent, or source-reference rules where applicable.

---

*End of Artifact B, v1.1.*

*Next: continue iterating Artifact C — the consultative agent's own wiki — so it explicitly reflects the two-pillar architecture and the interaction contract between canonical knowledge and deterministic operational state.*