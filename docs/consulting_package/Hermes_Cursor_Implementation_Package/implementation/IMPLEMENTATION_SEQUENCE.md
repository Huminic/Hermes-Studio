# Implementation Sequence

## Goal
Stand up the Hermes system as a wiki-first multi-profile environment with Data Brain support scaffolding, not full database implementation.

## Phase 1 — Profile creation
Create these profiles under `~/.hermes/profiles/`:
- consultative-agent
- huminic
- huminic-data-governor
- serra-automotive
- serra-automotive-data-governor
- strukture
- strukture-data-governor

For each profile, create the Hermes profile-distribution core files:
- `distribution.yaml`
- `SOUL.md`
- `config.yaml`
- `skills/`
- `cron/`
- `mcp.json`
- `.env.example`

Hermes documents profile distributions as a git-repo package containing exactly those distribution-owned files, installed into `~/.hermes/profiles/<name>/`. [Hermes profile distributions](https://hermes-agent.nousresearch.com/docs/user-guide/profile-distributions)

## Phase 2 — Org wiki scaffolding
Inside each org profile root (`huminic`, `serra-automotive`, `strukture`), create:
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

Keep the wiki under `~/.hermes/profiles/<org>/` as approved.

## Phase 3 — Git initialization
Initialize git in:
- `~/.hermes/profiles/huminic/`
- `~/.hermes/profiles/serra-automotive/`
- `~/.hermes/profiles/strukture/`

Add initial commit after scaffold creation.

## Phase 4 — Kanban-first workflow layer
Hermes Kanban is a durable board shared across profiles via `~/.hermes/kanban.db`. Profiles that work the board should load the `kanban-worker` skill; orchestrator behavior should load `kanban-orchestrator` or equivalent routing logic. [Hermes Kanban](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban)

Apply this rule:
- org profiles = workers / executors
- consultative-agent = architect / prescription producer
- data-governor profiles = reviewer / reconciliation / data-discipline agents

## Phase 5 — Governance and reporting support
Seed each org with:
- scope contract
- human relay page
- approval matrix
- report template page
- report spec page
- workflow page
- Data Brain interaction page

At minimum include a sample path like:
- `knowledge/reports/specs/serra-automotive-weekly-crm.md`
- `knowledge/reports/published/`

## Phase 6 — Connector and email stubs
Hermes email uses IMAP/SMTP environment variables in `.env`, including `EMAIL_ADDRESS`, `EMAIL_PASSWORD`, `EMAIL_IMAP_HOST`, `EMAIL_SMTP_HOST`, and optionally `EMAIL_ALLOWED_USERS` and `EMAIL_HOME_ADDRESS`. [Hermes email](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/email)

Create `.env.example` files with placeholders only.

## Phase 7 — Validation
Before declaring success locally, verify:
- every profile has core Hermes files;
- every org has the wiki folder set;
- every important agent references wiki pages and templates in `SOUL.md`;
- report spec paths exist;
- Data Brain governor profiles exist;
- git is initialized in each org profile.
