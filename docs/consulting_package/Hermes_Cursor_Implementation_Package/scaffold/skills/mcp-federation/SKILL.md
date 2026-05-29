---
id: mcp-federation
type: skill
title: MCP Federation Skill
status: stub
version: 0.1.0-stub
created: 2026-05-29
updated: 2026-05-29
owner: role:platform-architect
links: [federation-mcp-design]
---
# mcp-federation (stub)

This is a contract stub. The skill is not yet implemented. See `docs/federation-mcp-design.md` in the Huminic Studio repo for the design (Option B — banded MCP query response engine).

## What this skill does (when implemented)

Fans a query out across all authorized sources for the active profile (wiki + Data Brain + MCP servers + past reports + cross-profile reads where `federation.read_scopes` allows), aggregates with provenance, returns ranked hits.

## Tool exposed

```
federated_search(
  question: string,
  scope_hints?: string[],
  cross_profile?: string[],
  max_results_per_source?: number = 10
) -> FederatedSearchResult
```

See the design doc for the full type signature and the `federation.read_scopes` enforcement contract.

## Why this skill exists as a stub now

The consultative agent's audit phase, the customer-console plugin's dashboard tab, and the customer runtime agents all expect federated search to be available. Stubbing the contract now means:
- Downstream code can program against the expected interface.
- The plugin manifest's `skill_dependencies: [mcp-federation]` declaration on customer-console plugin resolves correctly (loader will warn, not fail).
- The implementation path is captured.

## Implementation tracker

When Phase 6 begins, this stub is replaced with the working skill. Steps in `docs/federation-mcp-design.md` § "Phase 6 implementation outline."
