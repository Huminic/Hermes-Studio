# Hermes Cursor / Claude Code Implementation Package

This package is the handoff set for implementing the Hermes system locally.

It is designed so a coding agent working in Cursor or Claude Code can:
- create the required Hermes profiles under `~/.hermes/profiles/`;
- scaffold the wiki-first Knowledge Brain for each org;
- scaffold Pillar 2 support components for the deferred Data Brain;
- wire Hermes Kanban as the primary workflow layer;
- preserve the governance rules from Artifact B;
- stand up the consultative agent plus one database-governor agent per org.

## Included artifacts
- **Artifact A** — methodology / why
- **Artifact B** — normative spec / how to build the wiki system
- **Artifact C** — consultative-agent wiki worked example
- **Artifact D** — Data Brain schema draft / structured operational pillar

## Required implementation outcome
A local Hermes installation should end with these profiles ready to refine and run:
- `consultative-agent`
- `huminic`
- `huminic-data-governor`
- `serra-automotive`
- `serra-automotive-data-governor`
- `strukture`
- `strukture-data-governor`

Each org profile should contain a wiki rooted in its profile directory and a git repo initialized in that directory. Hermes Kanban should be the main task and orchestration layer, with Studio remaining browser-usable as a first-class operating surface.

## Read first
1. `01_CURSOR_AGENT_README.md`
2. `implementation/IMPLEMENTATION_SEQUENCE.md`
3. `implementation/AGENT_TOPOLOGY.md`
4. `implementation/PILLAR_SUPPORT_COMPONENTS.md`
5. `implementation/ENV_AND_CONNECTORS.md`

## Hermes references
The package assumes Hermes profile distributions include `distribution.yaml`, `SOUL.md`, `config.yaml`, `skills/`, `cron/`, and `mcp.json`, and that installed profiles live under `~/.hermes/profiles/<name>/`. Hermes Kanban is documented as a durable task board shared across profiles via `~/.hermes/kanban.db`, and Hermes email uses IMAP/SMTP variables in `.env`. [Hermes profile distributions](https://hermes-agent.nousresearch.com/docs/user-guide/profile-distributions) [Hermes profiles](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/profiles.md) [Hermes Kanban](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban) [Hermes email](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/email)
