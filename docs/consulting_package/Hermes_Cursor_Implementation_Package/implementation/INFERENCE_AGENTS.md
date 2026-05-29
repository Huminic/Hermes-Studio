# Inference / Database Governor Agents

This package includes one Data Brain inference/governor profile per org:
- `huminic-data-governor`
- `serra-automotive-data-governor`
- `strukture-data-governor`

## Purpose
These agents are the database semantic / inference agents for their respective orgs. They are responsible for:
- preserving structured-state discipline;
- checking lineage and source references;
- routing low-confidence or contradictory outputs into reconciliation;
- reviewing operational updates before those updates are treated as trustworthy state;
- proposing, but not directly forcing, canonical knowledge changes.

## Why separate them from org runtime agents
Separating the governor agent from the org runtime agent preserves the two-pillar architecture:
- org runtime agent = acts using the wiki and produces outputs;
- data governor = checks the structured operational layer and prevents silent drift.

## Minimum local implementation
At minimum, each governor profile should have:
- its own `SOUL.md`
- `config.yaml`
- `mcp.json`
- `.env.example`
- `skills/` and `cron/`
- references to Artifact D and the org `data/` folder
