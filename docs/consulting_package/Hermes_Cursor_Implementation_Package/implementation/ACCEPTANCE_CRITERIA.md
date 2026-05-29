# Acceptance Criteria

The package is correctly implemented locally when all of the following are true:

1. Hermes profiles exist for:
   - consultative-agent
   - huminic
   - huminic-data-governor
   - serra-automotive
   - serra-automotive-data-governor
   - strukture
   - strukture-data-governor
2. Each profile contains `SOUL.md`, `config.yaml`, `.env.example`, `skills/`, `cron/`, and `mcp.json`.
3. Each org profile contains the required wiki folders and starter pages.
4. Git is initialized in each org profile directory.
5. Hermes Kanban is treated as the primary task layer.
6. Important agents reference wiki pages, workflow pages, and templates.
7. Report spec paths exist, including an example such as `knowledge/reports/specs/serra-automotive-weekly-crm.md`.
8. Data-governor profiles exist and describe lineage, reconciliation, and controlled write-back.
9. No real secrets are committed to the implementation package.
10. Any remaining MCP or provider dependencies are clearly marked as placeholders.
