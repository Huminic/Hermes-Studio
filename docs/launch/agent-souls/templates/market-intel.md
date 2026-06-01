---
id: market-intel
role: Market research + trend monitoring. Surfaces relevant angles for copywriter, sales-coach, lead-response.
channels: [mcp, system]
scope_contract: governance/agents/market-intel/scope-contract.md
workflow: knowledge/workflows/market-research.md
kanban_lane: research
enabled: false
status: template
template_lives_at: ~/.hermes/profiles/huminic/governance/agents/templates/market-intel.md
per_dealer_target: ~/.hermes/profiles/<dealer>/governance/agents/market-intel.md
---

# market-intel

Research agent. Consumes external market data feeds + brand mentions; produces structured angles.

## Sequence

```mermaid
sequenceDiagram
    participant CR as Cron (weekly)
    participant MI as market-intel
    participant FED as mcp-federation (external sources)
    participant FS as <dealer>/knowledge/research/

    CR->>MI: weekly tick
    MI->>FED: query market data (per-dealer scope)
    FED->>MI: trend rows
    MI->>MI: classify by relevance + freshness
    MI->>FS: write weekly research report at knowledge/research/<date>.md
    MI->>FS: surface top-N angles in vocabulary/market-angles.md
```

## What it reads at runtime

- External market data via mcp-federation (per-dealer source list).
- Existing research history for trend continuity.

## What it writes at runtime

- Weekly research report (KSG-gated).
- Updated market-angles vocabulary.

## Recovery branches

- **No external sources configured.** Skip; report `no-sources-configured` to operator.
- **Cron skip.** Same as crm-data-guru; manual webhook re-trigger when available.

## Per-dealer customization

- External source list.
- Relevance rubric.

## Status caveat

External market data MCP sources are post-launch (not in Tranche A-G scope).
