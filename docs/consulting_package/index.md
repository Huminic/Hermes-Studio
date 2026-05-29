---
id: index
type: reference
title: Consultative Agent Wiki — Index
status: active
domain: meta
created: 2026-05-27
updated: 2026-05-27
owner: role:platform-architect
tags: [index, map]
links: [consultative-agent-scope-contract, human-relay-specification, approval-matrix, authoring-governance-policy, method-overview, orient, audit, design, author, validate, package, challenge-loop, industry-onboarding-protocol, industry-ai-smb-ops-brief, strawman-library-overview, prescription-package-overview, primitive-selection-rule, folder-grouping-rule, ghost-container-policy, web-research-playbook, client-system-audit-playbook, metadata-db-requirements, house-canon-index, vocabulary-overview]
edit_policy: governed
review_required: false
gated: false
authority: canonical
---
# Consultative Agent Wiki

This is the operating knowledge of the **consultative agent** — the agent that audits a client's situation, organizes what should exist, and produces a prescription package (client wiki, agentic design, data-storage design, MCP access spec, and two semantic-agent specs).

This wiki is built by applying **Artifact B (the Spec)** to this specific agent. It is therefore both the agent's brain and the first worked example of the Spec.

## Map

- **Governance** — the agent's boundary and rules.
  - [[consultative-agent-scope-contract]] — what this agent owns, escalates, and never touches.
  - [[human-relay-specification]] — where the agent must pause for a human.
  - [[approval-matrix]] — enumerated gated actions.
  - [[authoring-governance-policy]] — how the agent's own outputs are governed.
- **Method** — how the agent works. [[method-overview]]
  - Phases: [[orient]] → [[audit]] → [[design]] → [[author]] → [[validate]] → [[package]]
  - [[challenge-loop]] — the validation discipline.
- **Industry Onboarding** — getting smart about an unfamiliar industry.
  - [[industry-onboarding-protocol]] (runbook)
  - [[industry-ai-smb-ops-brief]] (the agent's own industry)
- **Strawman Library** — opinionated defaults to lead with. [[strawman-library-overview]]
- **Prescription** — what the agent produces. [[prescription-package-overview]]
- **Authoring** — how the agent decides what to write.
  - [[primitive-selection-rule]], [[folder-grouping-rule]], [[ghost-container-policy]]
- **Data** — the agent's own integrations and the data side it prescribes.
  - [[web-research-playbook]], [[client-system-audit-playbook]], [[metadata-db-requirements]]
- **Canon** — the agent's worldview. [[house-canon-index]]
- **Vocabulary** — term mappings. [[vocabulary-overview]]

## Conformance note
Every page here carries Spec-conformant frontmatter. The folder grouping dimension chosen for this wiki is **by capability** (method / industry-onboarding / strawman / authoring / prescription), because that is how the humans maintaining the agent think about it.
