# Pillar Support Components

## Pillar 1 — Knowledge Brain
Implemented now.

Required support components per org:
- wiki root in `~/.hermes/profiles/<org>/`
- `index.md` and `log.md`
- `canon/`, `governance/`, `data/`, `knowledge/`, `templates/`, `vocabulary/`, `archive/`
- `knowledge/inbox/`, `knowledge/drafts/`, `knowledge/published/`
- `knowledge/reports/specs/`, `knowledge/reports/published/`
- `knowledge/templates/`, `knowledge/workflows/`

Required governance pages:
- scope contract
- human relay spec
- approval matrix
- authoring governance policy
- Knowledge Brain ↔ Data Brain interaction page

Required report support:
- report output template
- at least one report spec
- published output folder
- runtime metadata frontmatter convention

## Pillar 2 — Data Brain
Scaffold now; implement later.

Required support components now:
- Artifact D in the package
- one data-governor profile per org
- per-org `data/` folder in the wiki with contract pages
- placeholders for source references, reconciliation, snapshots, outputs, and transaction destinations
- MCP placeholder wiring in each data-governor profile

Required rule now:
- runtime can create outputs, events, suggestions, and reconciliation items;
- runtime cannot silently rewrite canonical knowledge.

## Cross-pillar support components
- report frontmatter schema for mission/job, org, date window, workflow, confidence, suggested knowledge changes
- promotion path from inbox → drafts → canon/published
- Kanban task routing between consultative, org, and data-governor profiles
- browser-visible operating files and paths
