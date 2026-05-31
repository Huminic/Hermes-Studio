# Data Architect Handoff Notes — What's Built So Far

**Date:** 2026-05-31
**Audience:** Data store architect designing the Brain (formerly "Data Brain" per Artifact D)
**Purpose:** Concrete integration constraints from the live Huminic Studio implementation. Read before drafting the Brain integration spec so the design plugs cleanly into what already exists instead of duplicating it or fighting it.

---

## 1. Profile isolation is a hard filesystem boundary, not a logical one

Everything per-customer lives under `~/.hermes/profiles/<profile>/`. Examples:

```
~/.hermes/profiles/<profile>/
  messaging-hub.db          # per-profile SQLite (better-sqlite3)
  studio.yaml               # branding + menu flags + lead_notifications + federation.read_scopes
  auth.yaml                 # customer-admin credentials (scrypt-hashed)
  .env                      # per-profile secrets (VAPI_*, TEXTMAGIC_*, CENTRAL_MCP_TOKEN, ...)
  engagement-state.yaml     # consultative engagement state
  SOUL.md                   # fallback agent
  governance/agents/*.md    # per-agent SOULs
  governance/agents/<id>/personas/<channel>.md
  knowledge/{inbox,drafts,published,widgets,archive}/
  canon/                    # operator-only, KSG-frozen
```

**Implication for the Brain:** match this pattern. Per-profile Brain storage lives at `~/.hermes/profiles/<profile>/brain/` (or similar) so it shares the same isolation guarantee as messaging-hub. Cross-profile reads must require explicit admin scope; there is precedent for this (see §4 token model).

The only writable surface that crosses profiles today is `~/.hermes/mcp-tokens.yaml` (global registry) and the consultative agent's admin path via `mcp__create_profile`. Everything else is filesystem-scoped.

---

## 2. The MCP token model already exists — don't invent a second one

Implemented at `src/server/mcp-tokens.ts` and `src/server/wiki-mcp.ts`. The Brain's MCP tools should slot into this existing registry.

**Token shape (already shipping):**
```typescript
McpToken = {
  label: string                                // human label, e.g. "serra-honda-runtime"
  hash: string                                 // scrypt$N$r$p$salt$key
  fingerprint: string                          // first 8 chars of raw secret (for display)
  allowed_profiles: Array<string | '*'>        // scope: which profiles this token may touch
  allowed_tools: Array<string | '*'>           // scope: which tool names this token may call
  admin: boolean                               // gates `mcp__*` admin-only tools
  expires_at: string | null
  created_at, created_by, last_used_at
}
```

**Enforcement:** `checkScope(token, profile, tool)` runs before every tool dispatch. Audit log at `~/.hermes/mcp-audit.log` (JSONL) records every auth event and every tool call.

**Tools exposed today:** `wiki_list`, `wiki_read`, `wiki_search`, `wiki_propose` + admin tools `mcp__create_profile`, `mcp__issue_token`, `mcp__revoke_token`, `mcp__list_tokens`.

**Architect's job:** add Brain tools (`brain_query`, `brain_write`, `brain_upload`, etc.) under the **same** registry, **same** scope shape, **same** audit log. The unified-token-spanning-wiki+federation+brain story the operator described works out of the box if the architect just names new tools and ships them through this dispatcher.

There is already a Studio admin UI at `/settings/mcp-tokens` for token issue/revoke/list — Brain tools become selectable in the `allowed_tools` field for new tokens.

---

## 3. The Knowledge Semantic Guardian (KSG) is the precedent for the Data Semantic Guardian

Implemented at `src/server/ksg-gate.ts` (120 lines — read it). It enforces:

- **Protected tree:** writes under `/canon/*` or `/governance/*` are rejected
- **Canonical freeze:** files with frontmatter `status: canonical` cannot be rewritten
- **Frontmatter required:** every saved page must have `title`, `type`, `status`
- **Promotion ordering:** `inbox/ → drafts/ → published/` (one step at a time; reversals rejected)

**Verdict shape:**
```typescript
GateOutcome =
  | { ok: true; warnings: Array<string> }
  | { ok: false; reason: string; rule: string }
```

**Called from:**
- `wiki_propose` MCP tool (agent path)
- Customer wiki save endpoints (operator/customer-admin path)

**Architect's job:** model the Data SG with the same verdict shape and same gating pattern. Every Brain write goes through `dsgGate({profile, table, payload, actor})` returning the same `GateOutcome`. The verdict reasons should be machine-readable rule IDs (the KSG uses `protected-tree`, `canonical-frozen`, `missing-frontmatter`, etc.) so downstream telemetry can group violations.

---

## 4. The runtime already produces structured data — the Brain has source material from day one

This is the **most important** integration fact. The architect should NOT design the Brain around an empty-database start state.

### Already-live data sources (per-profile)

**`messaging-hub.db` tables** (`src/server/messaging-hub-store.ts:137-242`):

| Table | What it holds |
|---|---|
| `threads` | every conversation across channels (sales/service domain split) |
| `messages` | every inbound + outbound + system message with `direction`, `role`, `channel`, `author`, `metadata` JSON |
| `contacts` | per-profile identity store with `identifiers` JSON (email/phone/visitor-id) + `channels` JSON |
| `contact_identities` | reverse-lookup index `(channel, handle) → contact_id` |
| `audiences` | named contact queries (JSON DSL) |
| `campaigns` | scheduled outbound + delivery status |
| `campaign_deliveries` | per-contact send outcomes |
| `thread_agent_subscriptions` | which agent is monitoring/replying on which thread + rules |
| `agent_reply_jobs` | autonomous-reply job audit (queued/sent/rejected/failed + reason) |

**ADF leads** (`src/server/adf-xml.ts`): full `<prospect>` parse to a typed `AdfLead` shape (customer, vehicles[], trade, vendor, comments). Inbound auto-detected. Outbound emit also implemented (round-trip-validated).

**Per-call/session metadata:** the Vapi webhook at `/api/webhooks/vapi/$profile` already extracts call summaries, transcripts, and lead intent into threads + messages.

**Agent SOULs + personas:** `governance/agents/<id>.md` + `personas/<channel>.md` are the structured representation of agent identity. Already authored for every Nexxus customer's roster (see roster table in `cutover-ritual.md`).

**Engagement state** (`engagement-state.yaml`): the consultative agent's per-customer state machine. Contains `build_time_crew[]`, `run_time_crew[]`, `readiness_gates`, `deployment_notes[]`, `adjacent_data_neighbors[]`. **This is where the architect should declare which neighbors are "federated externally" vs "absorbed into Brain."**

### Already-defined integration hooks

- **SSE event bus** per profile at `/api/messaging/stream?profile=X` (`src/server/messaging-hub-bus.ts`). Event types: `thread_created`, `message_appended`, `thread_status_changed`, `agent_replying`, `agent_reply_sent`, `campaign_progress`. **The Brain can subscribe and emit additional event types on the same bus — don't build a parallel one.**
- **Inbound webhook** `/api/messaging/inbound` with bearer auth via `HERMES_INBOUND_TOKEN` (per-profile `.env`). New channels land here in a normalized shape. The Brain's external-source ingestion can use the same endpoint shape.
- **Notification dispatch** through `src/server/notifications.ts` → central-mcp `resend_send_email`. Env: `CENTRAL_MCP_STUDIO_TOKEN` + `CENTRAL_MCP_URL`. The Brain's email-out paths should use this — don't add a second mail provider.

### Architect's checklist

For each Brain entity the spec proposes, mark:
- **Source:** where does it land in today's tree? (e.g., "lead intent" = ADF leads + Vapi summaries already in `messaging-hub.db`)
- **Capture path:** is there a webhook/SSE/cron that already produces it, or does the Brain need a new ingest?
- **SG rules:** which Data SG rules apply on write?
- **Federation vs storage:** does this stay in the source system (federate via MindsDB/etc.) or does the Brain own the durable copy?

---

## 5. Build-time vs run-time crew distinction is already canonical

The consultative engine separates the two in `engagement-state.yaml`:

```yaml
build_time_crew:
  - role: consultative-architect
    profile: consultative-agent
  - role: audit-supporter
    profile: <customer>-data-governor
  # ...

run_time_crew:
  - role: consultative-architect
    profile: consultative-agent
  - role: knowledge-semantic-guardian
    profile: <customer>-data-governor
  - role: data-semantic-guardian      # ← architect's new role belongs here
    profile: <customer>-data-governor
  # ... customer runtime workers
```

**The Data SG goes into `run_time_crew` for every customer.** The architect should write a SOUL fragment for the DSG that lives alongside the KSG fragment in the existing data-governor profile, not in a new profile. Same governor profile, two roles. Per-customer DSG instances reuse one shared profile pattern.

---

## 6. `federation.read_scopes` is the existing placeholder for federation authorization

Already in the studio.yaml schema (`src/lib/studio-config.ts:112-121`):

```yaml
federation:
  read_scopes:
    - <scope-name>            # e.g. "vinsolutions.read", "ga.read", "huminic.cross-store.read"
```

Today this is unenforced — no engine reads it. The architect's federation MCP design should:

1. Treat each scope string as a tool-callable surface (e.g., `federation.read_scopes: ["vinsolutions"]` lets that profile's tokens call the `federation.query.vinsolutions` MCP tool)
2. Enforce in the same `checkScope()` chain as wiki tools (see §2)
3. Document the scope vocabulary somewhere stable (could be inside Artifact D or a new `docs/federation-scopes.md`)

---

## 7. Existing config surfaces the architect can extend, not replace

- **`~/.hermes/profiles/<profile>/studio.yaml`** — per-profile config the storefront reads. Add `brain:` and `federation:` keys here, not in a new file.
- **`~/.hermes/profiles/<profile>/.env`** — per-profile secrets. The Brain's connection strings, MindsDB tokens, VinSolutions OAuth, etc. live here. There's already a precedent for `tokenVar` indirection (lead-notifications.ts:64 lets each profile name its own env var for the Resend token), so the Brain can do the same.
- **`~/.hermes/mcp-tokens.yaml`** — single registry. Add Brain tools to the existing `allowed_tools` enum.
- **`~/.hermes/mcp-audit.log`** — single audit log. Append Brain tool calls in the same JSONL format.

---

## 8. Cross-profile access surfaces the architect must explicitly account for

Today there are exactly three:

1. **Wildcard MCP token** (`allowed_profiles: ['*']`) — used by the consultative agent's admin token.
2. **`mcp__create_profile`** — admin-only tool that scaffolds a new profile dir.
3. **Studio admin login** (`is_admin: true` in auth.yaml) — operator can switch active profile in the Studio admin UI.

The Brain must NOT introduce a fourth. Any cross-profile Brain read (e.g., "Huminic the company aggregating rollups across the 6 dealers it owns") goes through the wildcard-token path or a new explicit MCP tool with the same scope-gating discipline.

---

## 9. What's NOT yet built that the architect should expect to design with

- **Per-profile DuckDB analytics file** — was in the Phase C.9 plan but explicitly dropped per operator's correction (CRM is source of truth; federation > warehousing for customer-owned data).
- **MindsDB integration** — design space; nothing wired today. The federation MCP skill stub exists at `scaffold/skills/mcp-federation/SKILL.md` and the `docs/federation-mcp-design.md` doc is a stub.
- **Metabase or any dashboard renderer** — Data tab is a stub at `src/lib/console-renderers.tsx:135-149`.
- **Data SG SOUL** — KSG SOUL exists per-customer; DSG does not. Pattern is mirrored on the KSG so straightforward to add.
- **Brain ↔ uploaded-data pipeline** — no upload surface exists yet for the Brain. Plugin file-upload UI not designed.
- **Run-time write contract from agents to Brain** — `wiki_propose` is the precedent. Brain equivalents (`brain_record`, `brain_classify`, `brain_upload`) need parallel design.

---

## 10. Critical guard rails the architect must respect

- **No Hermes core fork.** Channel adapters are distributed via per-profile `distribution.yaml`. Brain integration must respect this — anything that needs to ride inside Hermes runtime is a distributed skill/adapter, never an upstream patch.
- **No backwards-compatibility shims for now.** Pre-1.0; the architect can pick the right shape and we change call sites.
- **Per-profile env var indirection is the pattern** when a setting needs to vary across profiles but live in a secret store. Lead notifications already do this — Brain config should follow the same pattern instead of hardcoding env var names.
- **The SSE bus is the broadcast channel.** No second event system.
- **Audit everything.** Token audit log + Brain operations log are the same shape (JSONL with `ts`, `event`, contextual fields). One log file or two consistent ones.

---

## 11. Files the architect should read in order

1. `docs/consulting_package/Hermes_Cursor_Implementation_Package/artifacts/Artifact_D_Data_Brain_Schema_v1.md` — current Brain spec (634 lines, 2026-05-28 draft)
2. `docs/consulting_package/Hermes_Cursor_Implementation_Package/artifacts/Artifact_B_Spec_Revised_v1_1.md` — the normative spec; Knowledge Brain ↔ Data Brain interaction contract
3. `src/server/ksg-gate.ts` — the gating pattern the DSG mirrors (120 lines)
4. `src/server/mcp-tokens.ts` + `src/server/wiki-mcp.ts` — the MCP plumbing to extend
5. `src/server/messaging-hub-store.ts` — what data already exists per profile (1,159 lines; skim the schema)
6. `src/server/lead-notifications.ts` — the central-mcp dispatch pattern (153 lines)
7. `src/lib/studio-config.ts` + `src/lib/engagement-state.ts` — config schemas to extend with Brain keys

---

## 12. Open questions the architect should answer in their spec

1. Storage substrate for the Brain — Postgres? per-profile DuckDB? embedded SQLite? Vector store for embeddings?
2. Federation engine — MindsDB confirmed? Alternative? Who hosts it?
3. Dashboard renderer choice — Metabase, Lightdash, Apache Superset, custom? Embedding model + per-profile auth?
4. Upload surface — does the Brain own a file-upload API + storage? Where do uploaded files land?
5. Embeddings — does the Brain produce/store them? Whose model? Which vector store?
6. Schema migration discipline — how do Brain schema changes flow into 8+ live customer profiles?
7. Backup/restore — per-profile Brain backups; cadence; restore path.
8. Cross-customer aggregation — Huminic-the-company case (parent reads summary across child stores). Authorization model.
