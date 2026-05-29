# Local File System Plan

## Target profile root
`~/.hermes/profiles/`

## Profiles to create
- `~/.hermes/profiles/consultative-agent/`
- `~/.hermes/profiles/huminic/`
- `~/.hermes/profiles/huminic-data-governor/`
- `~/.hermes/profiles/serra-automotive/`
- `~/.hermes/profiles/serra-automotive-data-governor/`
- `~/.hermes/profiles/strukture/`
- `~/.hermes/profiles/strukture-data-governor/`

## Org wiki roots
The wiki lives directly in the org profile root, for example:
- `~/.hermes/profiles/huminic/index.md`
- `~/.hermes/profiles/serra-automotive/index.md`
- `~/.hermes/profiles/strukture/index.md`

## Important example paths
- `~/.hermes/profiles/serra-automotive/knowledge/reports/specs/serra-automotive-weekly-crm.md`
- `~/.hermes/profiles/serra-automotive/knowledge/reports/published/`
- `~/.hermes/profiles/huminic/knowledge/inbox/`
- `~/.hermes/profiles/huminic/knowledge/drafts/`
- `~/.hermes/profiles/strukture/data/`

## Shared Hermes workflow layer
Hermes Kanban uses `~/.hermes/kanban.db` as the durable shared board across profiles. [Hermes Kanban](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban)
