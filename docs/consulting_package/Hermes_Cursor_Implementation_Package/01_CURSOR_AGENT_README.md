# Agent README for Cursor / Claude Code

You are implementing this package into an existing local Hermes system.

## Mission
Translate this package into a working local scaffold for the Hermes architecture already designed. Your job is to create profiles, folders, configs, placeholder MCP wiring, wiki scaffolds, Kanban readiness, and governance support so the user can immediately continue implementation locally.

## Non-negotiable rules
1. **Artifact B is normative.** Treat `artifacts/Artifact_B_Spec_Revised_v1_1.md` as the authority for wiki structure and governance.
2. **Wiki-first architecture.** Pillar 1 is being operationalized now. Pillar 2 is scaffolded now but not fully implemented.
3. **No bare prompt-box agents.** Important agents must reference wiki pages, workflow pages, and output templates.
4. **Runtime write-back is constrained.** Runtime may create reports, observations, tasks, suggestions, and reconciliation items, but must not silently rewrite canonical knowledge.
5. **Profiles live locally under `~/.hermes/profiles/<profile-name>/`.**
6. **Git must be initialized in each org profile directory.**
7. **Hermes Kanban is the primary workflow layer.** Load the worker/orchestrator capabilities accordingly.
8. **Studio/browser usability matters.** Do not bury the design in opaque backend-only files.

## Profiles to create
Create these Hermes profiles locally:
- `consultative-agent`
- `huminic`
- `huminic-data-governor`
- `serra-automotive`
- `serra-automotive-data-governor`
- `strukture`
- `strukture-data-governor`

## What each profile must contain
At minimum, each profile should include:
- `SOUL.md`
- `config.yaml`
- `.env.example`
- `skills/`
- `cron/`
- `mcp.json`

For org profiles (`huminic`, `serra-automotive`, `strukture`), also create the wiki scaffold directly in the profile root:
- `index.md`
- `log.md`
- `canon/`
- `governance/`
- `data/`
- `knowledge/inbox/`
- `knowledge/drafts/`
- `knowledge/published/`
- `knowledge/reports/specs/`
- `knowledge/reports/published/`
- `knowledge/templates/`
- `knowledge/workflows/`
- `templates/`
- `vocabulary/`
- `archive/`

## Agent responsibilities
- `consultative-agent`: produces prescriptions, audits, and future client wiki packages.
- `<org>`: primary org runtime / knowledge-brain operator.
- `<org>-data-governor`: semantic agent for the org Data Brain contract, lineage, reconciliation, and operational-state discipline.

## Pillar support components to create
For each org, create:
- wiki governance pages;
- report spec folder and at least one sample report spec;
- workflow pages;
- output template pages;
- Data Brain contract pages referencing Artifact D;
- inbox / drafts promotion paths;
- explicit placeholders for MCP-backed systems and transactional destinations.

## Implementation order
Follow this order:
1. Create profiles and base Hermes files.
2. Initialize git in each org profile.
3. Scaffold org wiki folders.
4. Seed required governance / workflow / template pages.
5. Wire Kanban-oriented config and skills.
6. Add email/env placeholders.
7. Add Data Brain support stubs and governor agent files.
8. Run validation pass for missing files, broken references, and misnamed folders.

## Deliverable standard
When done locally, produce:
- exact files created/changed;
- any assumptions made;
- any secrets still needed in `.env`;
- any MCP connectors still stubbed;
- any deviations from the package.
