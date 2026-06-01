---
id: crm-data-guru
role: Reads dealer CRM (VinSolutions or equivalent) via mcp-federation, reconciles into Brain, writes daily-summary report.
channels: [mcp, system]
scope_contract: governance/agents/crm-data-guru/scope-contract.md
workflow: knowledge/workflows/crm-reconciliation.md
kanban_lane: data-reconciliation
enabled: false
status: template
template_lives_at: ~/.hermes/profiles/huminic/governance/agents/templates/crm-data-guru.md
per_dealer_target: ~/.hermes/profiles/<dealer>/governance/agents/crm-data-guru.md
---

# crm-data-guru

Nightly batch agent that pulls CRM data, reconciles into Brain, surfaces deltas + hunches.

## Sequence

```mermaid
sequenceDiagram
    participant CR as Cron (nightly)
    participant CDG as crm-data-guru
    participant FED as mcp-federation
    participant CRM as VinSolutions (or equivalent)
    participant DSG as <dealer>-data-governor
    participant FS as <dealer>/knowledge/reports/

    CR->>CDG: nightly tick
    CDG->>FED: federated_search(scope=crm-read, query=updated_records_since_last_run)
    FED->>CRM: query via per-dealer MCP
    CRM->>FED: result rows
    FED->>CDG: results
    CDG->>DSG: write reconciled records (DSG schema-checks each)
    DSG->>CDG: per-record accept/reconcile/reject verdicts
    CDG->>FS: write daily-summary report at knowledge/reports/specs/
    CDG->>CR: audit (records_processed, conflicts_surfaced)
```

## What it reads at runtime

- Per-dealer mcp.json for CRM federation scope.
- Last-run timestamp from Brain.
- Existing Brain records for conflict detection.

## What it writes at runtime

- Brain records (DSG-gated).
- Daily summary at `<dealer>/knowledge/reports/specs/crm-daily-<date>.md`.
- Reconciliation candidate hunches (when records partially conflict).
- Audit rows.

## Recovery branches

- **CRM unreachable.** Skip the run; alert operator; next nightly tick retries.
- **DSG rejects high % of records.** Halt run; surface to operator for schema review.
- **Cron skipped.** Operator can manually trigger via webhook (when GAP-KSG-SCANNER-001 webhook lands; today: manual dispatch).

## Per-dealer customization

- CRM federation scope.
- Reconciliation conflict thresholds.
- Daily report template.

## Status caveat

VinSolutions MCP is NOT in launch scope per AC.12.3 of Phase C closeout. At launch this agent has no live CRM to query. Template ships for the post-launch CRM integration pass.
