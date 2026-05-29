# Federation MCP Design

**Status:** design draft. No implementation yet.
**Owner:** platform-architect
**Created:** 2026-05-29
**Relates to:** `docs/plugin-manifest-spec.md` (the `federation.read_scopes` field on per-profile `studio.yaml`), the customer-console plugin's dashboard tab, the consultative agent's audit phase.

## Problem statement

The consultative agent, customer runtime agents, dashboards, and the operator all need to query across heterogeneous sources owned by a single customer or, with explicit authorization, across customers:

- the customer's wiki (markdown + frontmatter under `~/.hermes/profiles/<customer>/`)
- the Data Brain (when Pillar 2 ships)
- the customer's MCP-backed integrations (Vapi, Tavus, VinSolutions, email, document stores)
- past Nexxus reports (markdown under `knowledge/reports/published/`)
- other customers' data when `federation.read_scopes` explicitly allows it (cross-customer reporting, "next most likely data neighbors")

Today: each source is queried in isolation. The consultative agent's audit phase manually walks each. Dashboards built with the `web-artifact` and `live-web-artifact` skills cannot answer questions that span sources. There is no single mechanism to say "tell me X about this customer" and get a unified answer with provenance.

## Goals

1. One query → results aggregated from all authorized sources.
2. Each result item carries provenance (source, timestamp, confidence).
3. Authorization respects `federation.read_scopes` declared in `studio.yaml` per profile.
4. Works at the agent (tool call) and dashboard (skill invocation) levels.
5. Caching for query response performance.

## Non-goals

- A query language as expressive as SQL. Federation answers semantic / "tell me about" questions, not joins across normalized tables.
- Write federation. All writes go through the appropriate semantic guardian on the appropriate source. Federation is read-only.
- A new persistent store. The federation layer is a query router + aggregator, not a database.

## Option A — MindsDB

MindsDB is a federated query layer that wraps heterogeneous data sources behind SQL with ML augmentation. The operator investigated this option.

**Pros:**
- Mature SQL surface.
- Built-in connectors for many databases.
- Caching and ML augmentation come "for free."

**Cons:**
- Heavy infrastructure footprint (Python service, separate runtime, schema management).
- Not natively wiki-aware. Markdown would need a separate ingestion step or a custom connector.
- MCP-source integration is not first-class; we'd have to wrap each MCP connector.
- The "tell me about X" semantic query model doesn't map cleanly to SQL.
- Adds an operational layer separate from Hermes; integration with the customer's `mcp.json` is non-trivial.

**Verdict:** good for a structured-only future. Wrong shape for the wiki + MCP + reports federation we actually have now.

## Option B — Banded MCP query response engine (recommended)

Build the federation layer as a single Hermes skill (`mcp-federation`) that:

1. Receives a query (`question` + optional `scope_hints`) plus a profile context.
2. Reads the profile's `studio.yaml` for `federation.read_scopes` and the profile's `mcp.json` for available MCP servers.
3. Fans the query out to each authorized source in parallel:
   - For wiki: text + frontmatter search across the customer's `knowledge/published/` and `canon/`.
   - For Data Brain (when online): a parametrized query path.
   - For each MCP server: a `query` or `search` tool the connector exposes (most CRM/document MCPs already have one).
   - For past Nexxus reports: text search across `knowledge/reports/published/`.
   - For cross-customer reads when authorized: same as above against the named profile under the read scope.
4. Each source returns hits with `{source, item, timestamp, confidence, snippet, provenance}`.
5. Aggregates and ranks by confidence + recency.
6. Returns a structured response with per-source breakdown plus a synthesized answer.

**Pros:**
- Reuses existing MCP wiring. No new infrastructure.
- Wiki-native — markdown frontmatter is already structured.
- Authorization model matches what we already have in `federation.read_scopes`.
- Skill is portable per the Hermes skill mechanism — install via `~/.hermes/profiles/<profile>/skills/`.

**Cons:**
- We build it. ~1-2 weeks of focused work to ship v1.
- Per-source query semantics are heterogeneous; we have to normalize.
- Ranking is heuristic until we add ML; results may surface unhelpful items early on.

**Verdict:** correct shape. Builds on the architecture we have.

## Recommended path forward

**Option B (banded MCP federation skill).** Reasons:
1. Lines up with the plugin manifest's `federation.read_scopes` field.
2. Honors "configuration over code" — install per profile via skill mechanism.
3. Doesn't introduce a separate runtime to operate.
4. The wiki + MCP federation is the actual day-one need; pure-SQL is not.

Revisit MindsDB later if/when the Data Brain matures and we have substantial structured-query workload.

## Skill contract (v0)

The `mcp-federation` skill ships under `~/.hermes/profiles/<profile>/skills/mcp-federation/` and exposes one tool to the agent:

```
federated_search(
  question: string,
  scope_hints?: string[],   # e.g. ["wiki:canon", "mcp:vin-solutions", "reports:last-90d"]
  cross_profile?: string[], # explicit cross-profile reads; rejected unless allowed by federation.read_scopes
  max_results_per_source?: number = 10
) -> {
  query: string,
  sources_queried: Array<{source, scope, status}>,
  hits: Array<{
    source: string,
    profile: string,
    item_id: string,
    snippet: string,
    timestamp: string,
    confidence: number,
    provenance: { tool_used: string, raw_response_ref: string }
  }>,
  synthesized_answer?: string  # optional; off by default to avoid hallucination
}
```

## federation.read_scopes contract

Declared in `~/.hermes/profiles/<customer>/studio.yaml` (per the plugin manifest spec):

```yaml
federation:
  read_scopes:
    - "serra-automotive:knowledge/reports/published/*"
    - "huminic:canon/strawman-defaults/*"
```

Format: `<target-profile>:<path-or-glob-or-source-key>`. The federation skill enforces this list before fanning out cross-profile queries. Unauthorized cross-profile reads are rejected with an audit entry.

## Open questions

- **Ranking/scoring:** start with simple recency + tf-idf, revisit ML augmentation later. Tracked in `engagement-state.deployment_notes` per customer.
- **Caching:** Redis-backed query cache keyed by `(profile, question, scope_hints_hash)`. TTL configurable per source (wiki = long, MCP CRM = short).
- **Synthesized answer:** off by default. When enabled, the agent that gets the response decides whether to synthesize. This avoids the federation layer making LLM calls it can't budget for.
- **Source-of-truth conflicts:** when two sources contradict, the federation layer surfaces both; the calling agent (consultative or a customer runtime agent) decides how to resolve, possibly routing to the DSG for reconciliation.

## Phase 6 implementation outline

When we get to Phase 6 (per-profile MCP integrations), the work to ship Option B v1:

1. Author `~/.hermes/profiles/consultative-agent/skills/mcp-federation/SKILL.md` per Hermes skill format.
2. Implement the `federated_search` tool with the connectors enumerated above.
3. Wire the customer-console plugin's dashboard tab to expose a "Federated search" widget.
4. Add `federation.read_scopes` validation against each `studio.yaml`.
5. Ship caching + audit logging.
6. Document the skill in the consultative-agent's wiki under `knowledge/data/federation-skill.md`.
