# Huminic rollup operator guide

**Audience.** A human operating *Huminic the company* who needs to read aggregated data across child profiles. Today there is one parent (Huminic) and one launch-scope child (Huminic Motors); the rollup mechanism is the same for any future parent–child profile relationship.

**Scope.** Authorizing rollup scope grants, executing rollup queries via the `mcp_rollup_query` MCP tool, auditing rollup reads, and understanding what's deferred to post-launch (the rollup dashboard UI).

**Smaller manual.** This is the smallest of the five — the rollup substrate is narrow at launch (no dashboard UI yet) but the authorization model + audit trail are real.

---

## Workflow shape

```mermaid
flowchart TD
    P[Parent profile: huminic]:::ok --> A[Child declares rollup:huminic in its studio.yaml]:::ok
    A --> G[Caller holds admin/wildcard MCP token]:::ok
    G --> Q[mcp_rollup_query MCP call]:::ok
    Q --> R{Token admin/wildcard AND child granted rollup:huminic?}:::ok
    R -->|Yes| AGG[Aggregate child Brain]:::ok
    R -->|No| D[Deny: reason + rule cross-profile-write-denied]:::ok
    AGG --> AUD[metadata_audit row recorded]:::ok
    AGG --> O[Operator reads results]:::ok

    O -.->|Dashboard UI?| DASH[Deferred per SRS-E]:::gap

    classDef ok fill:#d4edda,stroke:#28a745,color:#000
    classDef gap fill:#f8d7da,stroke:#dc3545,color:#000
```

---

## 1. Parent–child profile model

**Huminic is itself a profile** — `~/.hermes/profiles/huminic/`. It is also the *parent* under which Huminic Motors (and future child dealerships) report. The parent–child relationship is declared explicitly in Huminic's `governance/rollup-scope-grants.md` (or equivalent — exact location depends on the post-launch grants doc being written; today the model is encoded directly in the `rollup:<parent>` scope semantics).

**At launch, the child registry is:**
- `huminic-motors` is the canary child for the rollup mechanism.
- Future: other dealerships, but those are operator-decisions per dealer enablement.

Other dealers under launch scope (`serra-honda`, `serra-nissan`, etc.) are NOT children of `huminic` — they are independent customer profiles. Rollup queries against them require *federation* (cross-tenant authorized read per `WF-FED-001`), not rollup.

The distinction matters:

| Relationship | Mechanism | Auth model |
|---|---|---|
| Parent reads from its declared child | `mcp_rollup_query` | Two-part: child declares `rollup:<parent>` in its `studio.yaml.federation.read_scopes` AND caller holds an admin/wildcard MCP token (or a token whose `allowed_profiles` lists the child) |
| Independent peer reads from another peer | `federated_search` with target's `federation.read_scopes` | Per-target explicit scope grant naming the caller |
| Operator reads anything | Admin scope MCP token | Operator-level authorization (top of stack) |

---

## 2. Authorizing rollup scope

**Today's procedure.** Authorization is **two-part** — note that `rollup:huminic` is a **child-side `studio.yaml` scope, NOT an MCP-token scope**:

1. **Child grants the parent (child `studio.yaml`).** The child profile must declare `rollup:<parent>` in its `studio.yaml.federation.read_scopes`. Without this grant in the child's own config, the parent's rollup against that child is denied — even with an admin token. For the launch canary: `huminic-motors/studio.yaml` must list `rollup:huminic` under `federation.read_scopes`.
2. **Caller holds the right MCP token.** `mcp_rollup_query` is admin-scoped: the calling token must be **admin/wildcard (`*`)** OR carry the child in its `allowed_profiles` set. The token does **not** carry a `rollup:huminic` scope — that string lives only in the child's `studio.yaml`.

**Click path** (operator-side, via Studio admin):

1. Edit the child profile's `studio.yaml` → under `federation.read_scopes`, add `rollup:huminic`.
2. `/mcp-tokens` (admin-only) → ensure the calling token is admin/wildcard (or has the child in `allowed_profiles`).
3. The token can now call `mcp_rollup_query` with `parent_profile: huminic` and the granted children in `child_profiles`.

> **Note.** The full granular scope model (e.g., `rollup:huminic:brain-only`, `rollup:huminic:no-pii`) is post-launch. At launch, the child's `rollup:huminic` grant exposes its Brain tables (from the rollup allow-list) to the parent.

---

## 3. Executing a rollup query

**Tool.** `mcp_rollup_query` — invoked via any MCP client whose token meets the auth bar in Section 2. The Studio admin chat UI is one entry point; direct API call is another.

**Arguments are structured** (not a free-text query). The tool takes `parent_profile`, `child_profiles[]`, `table`, and optional `where`, `aggregate` (`count | sum | avg | list`), `column`, and `limit`. `table` must be one of the rollup allow-list (13 Brain tables): `events`, `entities`, `observations`, `outputs`, `transactions`, `tasks`, `hunches`, `lookup_misses`, `assumptions`, `reconciliation_items`, `comms_log`, `uploads`, `adjacent_neighbors`.

**Invocation pattern** (Studio admin chat, profile = huminic, agent with admin MCP token):

```
User: Run mcp_rollup_query with parent_profile=huminic, child_profiles=[huminic-motors],
      table=comms_log, aggregate=count

Agent: <calls mcp_rollup_query with the structured args above>
Result:
  children_included: [huminic-motors]
  rows: [{ profile: huminic-motors, value: 142 }]
  total: 142
```

The tool aggregates across each child profile's Brain (`brain/brain.db`) per the requested `table` — including `comms_log` for messaging counts. It does not read `messaging-hub.db` directly. The argument schema is documented in the `mcp_rollup_query` MCP tool description, retrievable via `tools/list` on the central-mcp endpoint.

**Direct API form.** Useful for scripted reports:

```bash
curl -X POST https://mcp.huminicdev.com/dax/mcp \
  -H "Authorization: Bearer $ROLLUP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "mcp_rollup_query", "arguments": {"parent_profile": "huminic", "child_profiles": ["huminic-motors"], "table": "comms_log", "aggregate": "count"}}}'
```

---

## 4. Audit + denial behavior

**Every rollup query writes an audit row.** The row lands in the **parent profile's `metadata_audit`** table (not the central `/audit` event-store view) with `target_type: 'rollup_query'`, the parent actor, the `target_id` (the queried table), and the set of children included/denied. Inspect it via the parent profile's metadata-audit surface.

**Denied queries.** If a child hasn't declared `rollup:<parent>` in its `studio.yaml.federation.read_scopes` (or the token lacks scope for the requested children), the call fails with a structured verdict:

```
{"ok": false, "reason": "child huminic-motors's studio.yaml.federation.read_scopes does not include rollup:huminic", "rule": "cross-profile-write-denied", "gate_event_id": "..."}
```

(Token-level denials use the same `rule` with `reason: "token lacks scope for children: ..."`.) This matches the cross-tenant denial behavior validated in Tranche F.9 pen-tests (13/13 vectors blocked).

**Operator action on denial.** If the denial is unexpected: check the child's `studio.yaml.federation.read_scopes` for the `rollup:<parent>` grant, and check `/mcp-tokens` to confirm the calling token is admin/wildcard (or lists the child in `allowed_profiles`).

---

## 5. What is NOT in scope at launch

### Rollup dashboard UI

> **Gap.** Per `SRS-E` disposition (`DECISIONS.log` 2026-06-01T07:55:00Z): the dashboard UI for `mcp_rollup_query` is deferred. Couples with `D-3` plugin-native renderer. No customer-visible artifact; operator queries via MCP token only.

What you cannot do at launch:
- Open `/rollup` in the browser and see a pre-built rollup dashboard.
- Schedule rollup reports to auto-deliver to email.
- Save named rollup queries for reuse via UI (workaround: save the query as a shell script using the curl pattern above).

What you CAN do at launch:
- Execute rollup queries via MCP tool call in any Studio admin chat session.
- Execute rollup queries via direct API curl.
- Read the audit trail of all rollup queries in the parent profile's `metadata_audit` (rows with `target_type: 'rollup_query'`).

### Granular sub-scopes

`rollup:huminic:brain-only`, `rollup:huminic:no-pii`, `rollup:huminic:financial-only` etc. — all post-launch.

### Two-way rollup writeback

Rollup is read-only. No mechanism for parent to push canonical updates back down to children. If you need to do that today: operator does it per-child via direct file edit on the production volume.

---

## 6. Failure & recovery

### Rollup query times out

Most likely the query is too broad (e.g., "all messages, all time, all channels" across many children).

**Action.** Narrow the query — add a time range, narrow the channels, limit row count. Retry.

### Audit shows rollup queries you don't recognize

Token compromise possibility.

**Action.** Rotate the offending MCP token immediately (`/mcp-tokens` → token row → "Rotate"). Old token is revoked; new one issued. Re-issue to legitimate consumers. Investigate the unrecognized caller via the parent profile's `metadata_audit` rollup rows (actor + timestamps).

### Child profile schema_version mismatch

If a child profile's `brain/brain.db` is on a different `schema_version` than the parent expects, rollup may return partial or empty results.

**Action.** Check the child's brain schema via `GET /api/brain/readiness?profile=<child>` (which returns the schema version). If mismatch, the operator must run the relevant migration on the child profile (per Tranche A brain migration path).

### Rollup returns data from a child profile that shouldn't be there

You see rollup results aggregating a profile that isn't actually a child of huminic.

**Action.** This would be a serious authorization bug. Stop further rollup queries immediately, capture the verdict + audit row, alert the operator. Tranche F.9 pen-tests validated the deny path; an unexpected pass would indicate a regression.

---

## 7. Cross-references

- Workflow ids covered: `WF-RLP-001`, `WF-RLP-002`, `WF-RLP-003`, plus rollup-related rows from `WF-OP-005` (token rotation).
- Companion: `studio-admin-guide.md` Section 7 (MCP tokens) + Section 9 (audit).
- MCP tool reference: `mcp_rollup_query` — queryable via `tools/list` on the central-mcp endpoint.
- Federation companion (different mechanism): `docs/federation-mcp-design.md`.

---

## Gaps surfaced during huminic-rollup-operator-guide.md drafting

No new GAP-* rows surfaced. The dashboard-deferral is already captured in `DECISIONS.log` as the SRS-E disposition; this manual just makes the launch-time workaround procedure explicit (Section 5).

Existing dispositions referenced:

- `SRS-E disposition` (Section 5 — dashboard deferred, MCP-only access at launch)
- `Tranche F.9` (Sections 4, 6 — pen-test validated deny path)
