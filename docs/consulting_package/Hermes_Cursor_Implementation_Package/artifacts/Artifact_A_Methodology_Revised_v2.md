# Artifact A — Methodology

*The reasoning document for the consultative agent approach.*

> This document captures the conceptual moves, decisions, and rationale behind the methodology. It is the **why**. It does not prescribe — that is the role of Artifact B (the Spec). It does not demonstrate — that is the role of Artifact C (the Consultative Agent's Wiki). If A vanished, B could still be followed correctly. A exists so that anyone — including future you — can audit the reasoning and challenge it on its merits rather than re-deriving it from first principles.

---

## 1. Purpose

Most AI agents in practice are configured by stuffing intent into two text boxes — *instructions* and *description* — pointing the agent at some data, and hoping. This works for toy problems and breaks the moment the work is real. The knowledge layer is the most important part of an agentic workflow and it has been routinely under-engineered.

We are building a **consultative agent** whose job is to design the operating environment for other agents. It audits a client's situation, ingests what exists, organizes what should exist, and produces a prescription: a client wiki, an agentic design, a data-storage design, MCP access definitions, and the specs for two governing semantic agents (one for the wiki, one for the database).

The consultative agent is itself an agent. Its own operating knowledge is structured by the same methodology it applies to others. That recursion is deliberate. If the methodology can't describe itself, it isn't the methodology.

This document captures the methodology in narrative form. The Spec formalizes it. The Wiki instantiates it. The interaction contract between the Knowledge Brain and the Data Brain is prescribed in Artifact B and then demonstrated in Artifact C.

---

## 2. The Three-Artifact Architecture

We are producing three artifacts in sequence:

**Artifact A — This document.** Reasoning. Roughly 6–10 pages. Captures the decisions and the *why* behind them. Reads as narrative. Not normative.

**Artifact B — The Spec.** Normative. Roughly 20–30 pages with appendix. Defines how to build a wiki, what the primitives are, what frontmatter looks like, how governance works, what a prescription package contains. Standalone — someone who has never read A can pick it up and produce correct work. It is the durable IP.

**Artifact C — The Consultative Agent's Wiki.** A folder of markdown files. Built by following Artifact B's spec, populated with the specific knowledge this particular agent needs. Drop it next to inference and the consultative agent works. It is the first worked instance of the spec; future agents are built the same way.

A explains, B prescribes, C demonstrates.

---

## 3. The Problem We're Solving

Four problems sit on top of each other:

**The scaffolding problem.** Reinventing knowledge structure for every client and every agent is expensive and produces inconsistent results. A reusable methodology lets us start every engagement from a known shape and tailor from there.

**The intake problem.** Most organizations have uneven structure — executives may have a system, marketing runs on vibes, client delivery lives in someone's head. Extracting a "process" from a client who doesn't really have one produces polite fiction. The fix is to *arrive with a defensible default* and invite the client to object their way into a tailored version. Objections become requirements. The empty-process problem stops being a blocker and becomes an asset.

**The epistemic problem.** Agents that retrieve information often present it as fact. An agent once told an auto dealer client "this is what's wrong with this brand" in a confident voice when the correct stance was "I found this and it's worth verifying." Ego and absoluteness leaked into hunches. This is a structural harness problem, not a knowledge problem. Models will not reliably calibrate themselves; the system must encode confidence in the data structure so the agent cannot accidentally overclaim.

**The boundary problem.** Most agent deployments fail because the boundary between agent responsibility, human responsibility, and client responsibility is implicit. Agents range too far, stop short of expected work, or take actions the human assumed required approval. Every agent needs a scope contract treated as a first-class artifact, not a footnote.

The methodology has to address all four. Not as nice-to-haves — as load-bearing structure.

---

## 4. Foundational Conceptual Moves

These are the conceptual decisions on which everything else rests. They are not optional and they are not arbitrary; each one resolves a real tension that came up during design.

### 4.1 Knowledge and Data are distinct domains

Knowledge is what an agent needs to know to do its work properly. It lives in markdown files in folders. It is human-authored or agent-authored under governance. It is read frequently and written deliberately.

Data is the structured operational state and recorded outputs of the system. It lives in databases and other structured stores. It is written continuously and read on demand. It includes transaction logs, event streams, state projections, retrieval records, audit trails, task state, reconciliation records, and output records.

The methodology assumes a **two-pillar architecture**. The **Knowledge Brain** is the governed markdown/wiki layer that holds workflows, blueprints, rationale, operating context, and canonical organizational knowledge. The **Data Brain** is the structured operational layer that holds deterministic runtime state: events, projections, tasks, transactions, retrieval snapshots, reconciliation items, and source-linked operational records. The consultative agent designs both, but they serve different purposes and must not be collapsed into one another.

Each domain has its own governing semantic agent. The wiki-governing semantic agent owns CRUD, access, and care over the markdown layer. The database-governing semantic agent owns CRUD, access, and care over the data layer. Both are exposed through MCP.

Conflating the two — putting knowledge in a database, putting data in markdown — is the most common architectural mistake in this space. We don't.

### 4.2 Strategic and Tactical agents have different knowledge shapes

This is the most important distinction in the methodology and it changes what gets authored.

**Tactical agents** do work. They run procedures, follow decision rules, hit APIs, produce outputs. Their knowledge wants to be precise, canonical, versioned, and indexed for exact match. Failure mode: ambiguity. Their primary primitives are procedures, decision rules, schemas, runbooks, and integration playbooks. Their confidence posture is binary: a procedure is either current and authoritative or it is being deprecated. Approval gates are enumerable and predictable.

**Strategic agents** advise, plan, and notice patterns. Their knowledge wants to be broad, perspectival, cross-linked, and indexed for associative recall. Failure mode: narrow framing. Their primary primitives are frameworks, cases, entity profiles with rich context, and concept pages. Their confidence posture is graded — every assertion travels with provenance and a credibility rating. The auto-dealer problem belongs entirely to the strategic side.

Most real deployments are a mix, not a pure type. The methodology treats strategic/tactical as a *lens* applied throughout — at audit, at design, at authoring, at governance — rather than as a one-time classification.

### 4.3 Build-time and Run-time produce different artifacts from the same source

Build-time is when we author and govern. Build-time artifacts are designed for legibility, defensibility, and human review — they include rationale, alternatives considered, citations to methodology.

Run-time is when the deployed agent reads the wiki to do its work. Run-time artifacts are designed for retrieval, precision, and speed — properly chunked, frontmattered, predictable.

These are not two separate stores. They are the same wiki under two reading lenses. Most pages serve both. Some pages have build-time sections (rationale, sources, deferred questions) that the agent can skip at retrieval time. Build-time and run-time are properties of *how a page is consumed*, not where it lives.

At runtime, however, mature deployments do not rely on the wiki alone. Runtime agents may read from both the Knowledge Brain and the Data Brain: the wiki for meaning, workflows, rationale, and policy; the Data Brain for operational state, transactional truth, retrieval snapshots, and other deterministic execution context.

### 4.4 The strawman-with-objections stance

We do not arrive at a client engagement asking "what is your process?" because the answer is often nothing, partial, or fictional. We arrive with a populated strawman based on the client's industry, size, and a few opening signals, and we say: "here's what we would recommend — push back where this doesn't fit you." The conversation that follows produces the requirements document.

This is a strategic choice as much as a methodological one. It positions us as bringing a point of view rather than asking the client to do our thinking. It turns the absence of client structure into an opportunity rather than a blocker. And it gives the consultative agent a tractable starting point: it doesn't have to invent from zero, it has to *adapt a default*.

The downstream consequence: we maintain a library of opinionated defaults per operational domain (client delivery, sales, marketing, finance, hiring, executive cadence) and per industry. The library is part of the consultative agent's House Canon and grows over time.

### 4.5 Confidence is encoded in structure, not tone

The auto-dealer problem is solved by making confidence claims part of the data, not part of the prose. Every strategic-knowledge primitive carries a confidence and provenance annotation in its frontmatter. Outputs that draw on those primitives inherit and propagate the annotations. The agent's prose then *describes what the data says* rather than performing certainty.

We adopt an Admiralty Code–style two-axis schema (source reliability × information credibility) as the default. The choice is not sacred — IPCC and CIA's Words of Estimative Probability are alternatives — but the Admiralty Code is well-suited because it cleanly separates *who told you* from *how true it is*, which is the exact distinction the auto-dealer case violated.

Tactical knowledge has a simpler confidence model: canonical, deprecated, or under-review. It doesn't need graded credibility because tactical procedures are either authoritative or they're being replaced.

### 4.6 Folder structure stays shallow; metadata does the work

A taxonomy is a strict tree — a thing has one parent. An ontology is a graph — a thing has many relationships. Folders are intrinsically taxonomic and any attempt to organize all knowledge purely by folder eventually fails, because a single page legitimately belongs to a client, a project, a quarter, *and* a topic.

The mature pattern: keep folder structure shallow and boring, push the richness into frontmatter and links. A page's *location* tells you almost nothing; its YAML frontmatter (type, tags, domain, status, confidence, provenance, owner, governance, links) tells you everything. Wikilinks express relationships that the folder can't.

This means the frontmatter schema is load-bearing. It is not a stylistic detail. The Spec defines it once, applies it everywhere, and treats every field as deliberate.

### 4.7 Ghost containers and expected neighbors

A wiki should be discoverable even when it's incomplete. If a procedure exists, the structure should hint that a runbook *could* exist alongside it. If a framework exists, the structure should hint that worked cases *could* sit next to it. If an entity profile exists, the structure should hint that policies relating to that entity *could* live nearby.

We solve this with **expected neighbors** — each primitive type carries a list of primitive types we'd typically expect adjacent — and **ghost containers** — empty folders containing only a `README.md` that explains what would live there if it existed. Ghost containers make the *possibility space* visible without polluting the wiki with empty content. They also give the consultative agent a checklist when designing: did we consider a runbook for this procedure? An anti-pattern for this framework? A vocabulary mapping for this entity?

Ghost containers materialize the "organization of everything" idea without committing to organizing everything before it exists.

### 4.8 The recursion: the consultative agent uses an instance of what it produces

The first wiki the consultative agent ever reads is its own. Its operating knowledge — its audit method, its design method, its authoring vocabulary, its industry onboarding protocol, its scope contract — lives in a wiki built using the same Spec it applies when designing wikis for client agents.

This is not a curiosity. It's a forcing function. If the Spec can't describe the consultative agent's own work, the Spec is incomplete. Every limitation of the methodology shows up first in the consultative agent's own wiki, which means we discover those limitations early and cheaply.

It also has a practical payoff: the consultative agent's wiki is *also* the worked example we hand to clients and team members to show what a well-formed wiki looks like.

### 4.9 Knowledge primitives are the reusable unit, not folder structures

We do not maintain a library of "client wiki templates" because the shape of each client wiki is too variable. We maintain a library of **knowledge primitives** — page archetypes with fixed frontmatter, fixed sections, defined expected-neighbors, defined ghost containers, and defined behavior under retrieval. A client wiki is an *arrangement of primitives*, not a customization of a template.

The starter catalogue includes (the Spec will formalize):

- **Procedure** — ordered steps, preconditions, postconditions, owner, version
- **Decision rule** — input → branching logic → output, with edge cases
- **Schema** — data shape for a tool, integration, or handoff
- **Reference** — lookup tables, glossaries, immutable facts
- **Runbook** — failure modes and recovery procedures
- **Framework** — mental model or heuristic with worked examples
- **Case** — narrative of a real situation, what was tried, outcome
- **Entity profile** — a person, company, system, account, product
- **Policy** — a rule with rationale and scope
- **Concept** — a named idea, defined, linked to neighbors
- **Integration playbook** — operational knowledge for a specific external system
- **Vocabulary entry** — client-term-to-canonical-term mapping
- **Industry brief** — accumulated knowledge about an unfamiliar industry
- **Scope contract** — boundary specification for an agent's responsibility

Each is defined in the Spec with frontmatter, section template, expected neighbors, ghost containers, and examples. Adding a new primitive is a deliberate act with implications across the methodology — it is not casual.

---

## 5. The Consultative Agent's Mandate

Defined positively and negatively.

**The consultative agent produces:**

1. A **client wiki** — the operating knowledge for the client's agents, structured by the Spec, populated with the client's specifics.
2. An **agentic design prescription** — what agents to deploy, their strategic/tactical character, their scope contracts, their tool boundaries, their orchestration topology.
3. A **data-storage prescription** — what source systems and APIs the agents need to read, what they need to write, what gets federated, what gets pulled, what gets logged.
4. An **MCP access spec** — what scopes exist, what tokens look like, how agents reach the wiki and the data layer.
5. A **wiki semantic agent spec** — per-client, governing CRUD/access/care over the client's wiki.
6. A **database semantic agent spec** — per-client, governing CRUD/access/care over the metadata DB.

These six together are the **prescription package**. The package is the consultative agent's output. Downstream deployment may be done by us, by the client, or by partners — the package is the contract that travels.

Governance in this methodology is enforced through a combination of specification, workflow, profile scoping, and MCP boundaries. It should not be assumed that the host UI or runtime provides perfect native governance by itself; the prescription must define the intended operating boundaries explicitly.

**The consultative agent does not:**

- Deploy infrastructure
- Write production code for client agents
- Run the deployed agents at runtime
- Maintain the wiki after handoff (that's the per-client semantic agent's job)
- Make business decisions on the client's behalf

The boundary is firm. Crossing it is the failure mode.

---

## 6. The Method

The consultative agent works through six phases. Each has named inputs, named outputs, and a readiness gate before moving to the next.

**Orient.** Learn the client's industry, business model, scale, and operating style. If the industry is unfamiliar, invoke the Industry Onboarding Protocol (§7). Output: a *client orientation brief* that situates this engagement against known patterns.

**Audit.** Examine what exists. Inputs may include client documents, system access, interviews, observed behavior. Greenfield clients (nothing exists) and brownfield clients (something exists, of uneven quality) are handled differently. Output: an *audit findings document* listing existing assets, gaps, contradictions, and operational reality versus stated process.

**Design.** Decide what agents are needed, what they own, what knowledge they need, what data flows they touch. Apply the strategic/tactical lens to each proposed agent. Identify scope boundaries, human relay points, integration playbooks needed. Output: an *agentic design document* with the proposed topology.

**Author.** Produce the actual wiki content and the prescription package. Use the strawman library to seed content; tailor to client specifics. Apply confidence and provenance annotations throughout. Output: the populated wiki and the draft prescription package.

**Validate.** Run the Challenge Loop. High-confidence assertions move through quickly; lower-confidence assertions trigger explicit review. Check completeness against expected neighbors and invariant requirements. Surface unresolved decisions and confirm with the human consultative operator. Output: a *validated prescription package* with explicit confidence annotations on contested claims.

**Package.** Compile the prescription into its final form, mark readiness gates passed, and hand off. Output: the prescription package ready for downstream deployment.

The method is iterative within phases (you may audit, design a little, audit more) but the phase gates are real. You do not begin Authoring before Design is sufficient. You do not Package before Validation passes.

In the current implementation sequence, the consultative subsystem is being used to operationalize the Knowledge Brain and its Hermes-based operating environment first. The Data Brain is still part of the prescription and must be designed explicitly, but for now it is being defined at the architecture and contract level so it can be implemented later without forcing a premature database build.

---

## 7. Industry Onboarding as a Core Capability

The consultative agent will frequently face industries it doesn't know. The methodology must handle this gracefully rather than degrade to guessing.

Industry Onboarding is a defined procedure the agent runs against *itself* before engaging an unfamiliar client. The output is an **industry brief** — a primitive type — that contains:

- Canonical frameworks operating in the industry (EOS for some SMBs, ITIL for IT services, etc.)
- Best-practice sources identified and rated
- Regulatory and compliance shape
- Common operational domains and their typical structure
- Industry-specific vocabulary
- Case studies with extracted patterns
- A confidence rating on the brief itself

The brief is reusable across all clients in that industry. Subsequent engagements refine it. Over time the agent accumulates a library of industry briefs, which is part of the durable IP of the platform.

The research methods the protocol authorizes — drawing on training data, searching for established frameworks, transcribing relevant talks, ingesting case studies — are formalized in the Spec as a defined runbook with allowed sources, citation requirements, and source credibility grading.

The first industry brief should be **AI agent deployment for SMB operations** — i.e., the industry the consultative agent itself works in. Once again, the recursion is productive.

---

## 8. The Invariants

Five components every wiki contains regardless of purpose, because they are how *any* agent under this methodology behaves consistently:

**Scope Contract.** What the agent owns end-to-end, what it proposes but does not execute, what it must escalate, what it must never touch, what the human owns. Not optional, not implicit.

**Confidence Schema.** The graded provenance and credibility model (Admiralty Code by default), applied to all strategic-knowledge primitives. Plus the simpler canonical/deprecated/under-review model for tactical knowledge.

**Human Relay Specification.** Approval gates (binary, enumerated, tied to specific actions), input requests (treated as smells; logged for closure), feedback loops (RLHF-style; defined log, defined review cadence, defined promotion path to canon).

**Integration Playbook.** For every external system the agent touches, a playbook capturing the operational knowledge needed to use it correctly — endpoints, quirks, retrieval patterns, failure modes. The cryptic-CRM case lives here.

**House Canon Reference.** Pointers to the firm-level canon documents shaping the agent's worldview (the Anthropic engineering article, foundational methodology sources, our own point-of-view documents). Distinct from industry briefs (domain reference) and client wiki content (operational).

These five are mandatory inclusions in every prescription. They are not features the client opts into; they are how the methodology works.

---

## 9. Human Relays and Approval Gates

Three types, distinguished because they have different infrastructure needs:

**Approval gates** are tactical and binary. The agent has done X, needs sign-off to proceed to Y. Enumerable in advance, named in the scope contract, encoded in the relevant procedure primitive.

**Input requests** are informational. The agent needs data it can't get itself. Each one is a smell — it signals an integration gap or knowledge gap that should be closed permanently rather than left as a recurring tax. Logged for review.

**Feedback loops** are after-the-fact. The agent acted; the human is rating or correcting. The rating must close the loop: it goes into a feedback log, gets reviewed on a defined cadence, and where validated, becomes a wiki edit or a procedure update. Without a closed loop, feedback is a complaints box.

On the strategic side, human relays look different. Rather than approval gates, strategic agents propose with confidence annotations; the human decides whether to act. Strategic relays are about *consulting* the agent, not approving its actions. The methodology treats these distinctly.

---

## 10. Lifecycle and Renewal

A wiki ages. Procedures go stale. New tools replace old ones. The strategic layer accumulates cases that contradict each other. The methodology has to account for this.

The Spec defines renewal cadences appropriate to primitive type — tactical procedures re-audited quarterly, strategic accumulations reviewed monthly, integration playbooks updated whenever a system changes. Drift observability — agents routing around stated procedures, retrieval patterns that don't match stated policy — is part of what the per-client semantic agent monitors and surfaces.

We are deliberately not solving the full lifecycle question here. Most of it is appropriately the per-client semantic agent's responsibility, governed by the spec it inherits from the methodology. What this methodology commits to is: renewal is real, must be planned, must be assigned, and must produce visible signals when it isn't happening.

---

## 11. What This Document Is Not

This document is not the Spec.

This document does not formalize frontmatter schemas, define exact section templates, prescribe folder conventions, specify ID schemes, or commit to versioning approaches. Those are the Spec's job and they require their own deliberate treatment.

This document does not architect the platform. The runtime systems that consume the prescription package — the projection service, the MCP gateway, the governance enforcement layer, and the eventual Data Brain implementation — are outside this methodology's direct scope. The methodology produces well-formed prescriptions; the platform implements them. The exact operational contract between the Knowledge Brain and the Data Brain is specified normatively in Artifact B rather than here.

This document does not catalogue all knowledge primitives in full detail. It names the starter set and gestures at the structure. The Spec defines each primitive completely.

---

## 12. Decisions Deferred

Things we know we don't know yet, captured here so they don't get forgotten:

- The **contribution-back path**: when a client engagement teaches us something that should improve the methodology or the House Canon, what is the formal process for promoting that learning, and what is the policy for not leaking client specifics into the firm-level layer?
- The **multi-tenancy model** for situations where the same industry brief or strawman serves multiple clients, including competitors.
- The **brownfield ingestion protocol**: detailed method for auditing a client who has existing Notion/Confluence/Drive content of uneven quality.
- The **vocabulary primitive's** runtime behavior: how the per-client semantic agent uses vocabulary entries to translate at retrieval time.
- The **cost and latency budget** properties on agent profiles, and how they influence wiki chunking and primitive depth.
- The **inter-agent contract** primitive for deployments with multiple cooperating agents.
- The exact **Knowledge Brain ↔ Data Brain interaction contract**: which wiki pages are extractable into structured operational records, how contradictions are reconciled, and how approved runtime learnings are promoted back into canon.

These are not blockers. They are the next layer down, to be addressed in Spec v2 or after the first real engagement teaches us what we actually need.

---

## 13. Lineage and References

What we are drawing from, in rough order of influence:

- **Karpathy's LLM wiki concept** — the contemporary articulation of agent-readable structured knowledge as plain markdown. The three-layer model (raw, wiki, schema) and the lint operation.
- **Niklas Luhmann's Zettelkasten** — the intellectual ancestor: atomic notes, links between them, knowledge that compounds rather than accumulates.
- **Tiago Forte's PARA method** — top-level structure for mixed personal/professional knowledge. Useful as a default scaffold; we don't adopt it strictly but we borrow the discipline.
- **S.R. Ranganathan's faceted classification** — the library-science answer to the tyranny of the tree. PMEST (Personality, Matter, Energy, Space, Time) as a way of describing things along multiple axes without forcing single-parent hierarchy.
- **Abby Covert, *How to Make Sense of Any Mess*** — information architecture as a discipline. Worth reading in full.
- **Domain-Driven Design (Eric Evans)** — bounded contexts as the right unit for separating client/business/personal domains. Tactical patterns (entity, value object) as the right granularity for primitives.
- **NATO Admiralty Code** — the source reliability × information credibility schema. The structural fix for the auto-dealer problem.
- **Anthropic's *Building Effective Agents*** — orientation for how to think about agentic systems generally. Belongs in the House Canon.
- **Johnny Decimal** — constraint-based numbering. Not adopted, but the principle of *forced constraint* informs how we think about depth limits.

---

*End of Artifact A.*

*Next: Artifact B — The Spec. Normative document defining how to build wikis under this methodology. Written from this document plus our conversation. Then Artifact C — the consultative agent's wiki, built by applying B to this agent's specific job.*
