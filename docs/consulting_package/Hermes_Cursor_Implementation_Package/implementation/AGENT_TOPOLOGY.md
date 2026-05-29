# Agent Topology

## Core profile set

### 1. `consultative-agent`
Purpose: architect, audit, design, author, validate, and package client or org systems using the methodology and spec artifacts.

Primary responsibilities:
- run consultative discovery and prescription work;
- reference Artifact A, B, C, and D;
- create or revise org wiki structures;
- define workflows, templates, governance pages, and connector requirements;
- feed implementation tasks to Kanban rather than doing everything inline.

### 2. `huminic`
Purpose: primary HUMINIC runtime / knowledge-brain operator.

Responsibilities:
- execute HUMINIC workflows using wiki pages and templates;
- create reports and runtime outputs;
- create suggestions into inbox/drafts instead of mutating canon directly.

### 3. `huminic-data-governor`
Purpose: database semantic / inference agent for HUMINIC.

Responsibilities:
- govern Data Brain contract compliance;
- validate lineage, reconciliation, and operational-state discipline;
- review structured outputs and proposed state transitions.

### 4. `serra-automotive`
Purpose: primary Serra Automotive runtime / knowledge-brain operator.

### 5. `serra-automotive-data-governor`
Purpose: database semantic / inference agent for Serra Automotive.

### 6. `strukture`
Purpose: primary Strukture runtime / knowledge-brain operator.

### 7. `strukture-data-governor`
Purpose: database semantic / inference agent for Strukture.

## Operating model
- `consultative-agent` = builder / prescriber / upstream architect.
- org profiles = operational workers reading the wiki and producing outputs.
- data-governor profiles = structured-state reviewers and reconciliation agents.
- Hermes Kanban = coordination layer between them.

## Mandatory context rule
Important agents must reference:
- wiki pages
- workflow pages
- report specs
- output templates
- governance pages

Do not leave important behavior only in generic system prompts.

## Minimal handoff pattern
1. consultative-agent creates or revises the prescription.
2. Kanban decomposes work.
3. org profile performs operational work.
4. data-governor validates or reconciles structured state.
5. outputs are saved under report/output paths.
6. canonical knowledge changes move through inbox/drafts/promotion.
