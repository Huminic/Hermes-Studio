# Broker Token Rotation — `claude_nexxus-2.2` (security debt B5)

**Status:** READY TO EXECUTE — **operator-gated (coordinated cutover).** Recon by Claude 2026-06-07. Operator pre-authorized rotation ("everyone makes mistakes"); this brief exists because the **blast radius reaches LIVE production** and rotating blind would break real customer comms. Do NOT rotate without working the checklist below in order.

## What leaked
- The token **value** `8NCVZ8…` (central-mcp token **name** `claude_nexxus-2.2`) is **hardcoded as a fallback in committed Nexxus source**:
  - `nexxus2.2_replit/server/routes/integrations.ts:9` — `process.env.VIN_SAFE_MCP_TOKEN || "8NCVZ8…"`
  - `nexxus2.2_replit/server/routes/webhooks.ts:1247,1633` — same fallback
  - `nexxus2.2_replit/server/routes/conversations.ts` — same pattern
- It is also present in non-runtime files (harness settings, evidence, drafts) — leak surface but not service-affecting.
- It is **NOT** in the huminic-studio working tree (studio reads it only via the `CENTRAL_MCP_TOKEN` env var — clean indirection). The leak is the **Nexxus committed source fallback** + git history.

## What the token actually authorizes
Primarily **VIN-safe-MCP** access (VIN/CRM lead lookups + DNC checks). It is the `VIN_SAFE_MCP_TOKEN` in Nexxus and the `CENTRAL_MCP_TOKEN`/broker token in Studio. Central-mcp validates it under the `claude_nexxus-2.2` name.

## Blast radius — four live systems hold this value
| # | System | Where | Effect if rotated without updating |
|---|--------|-------|-----------------------------------|
| 1 | **central-mcp** (running, `central-mcp/dist/index.js`) | `central-mcp/config/local.yaml` (auth.tokens → `claude_nexxus-2.2`) | This is the authority. New value must be written here + central-mcp restarted. |
| 2 | **vin-safe-mcp** | `vin-safe-mcp/config/local.yaml` | VIN/CRM lookups reject until updated + restarted. |
| 3 | **LIVE Nexxus production** (running, `nexxus2.2_replit/dist/index.cjs`) | env `VIN_SAFE_MCP_TOKEN` **or** the hardcoded fallback in `dist` | **Real customer VIN/CRM lookups + DNC checks fail-closed → blocks live comms** until env updated. |
| 4 | **Huminic Studio** (Coolify) | Coolify env `CENTRAL_MCP_TOKEN` | Studio outbound SMS (shared mode) + VIN reports fail until env updated + redeploy. |

## Safe coordinated rotation (execute in this order — each step is operator/sysadmin)
1. **Generate** a new strong token value (e.g. `openssl rand -base64 32`). Call it `<NEW>`.
2. **Add** `<NEW>` to `central-mcp/config/local.yaml` as a **second** token under a new name (e.g. `claude_broker_2026-06`) — do **not** delete the old one yet. Restart central-mcp. (Both old + new now valid → zero downtime.)
3. **Roll consumers onto `<NEW>` one at a time, verifying each:**
   - vin-safe-mcp config → `<NEW>`, restart, verify a VIN lookup.
   - Live Nexxus: set `VIN_SAFE_MCP_TOKEN=<NEW>` in its env, restart the Nexxus process, verify a live VIN/DNC path.
   - Studio: set Coolify `CENTRAL_MCP_TOKEN=<NEW>`, redeploy, verify SMS-shared + VIN report.
4. **Revoke** the old `claude_nexxus-2.2` token from `central-mcp/config/local.yaml`. Restart central-mcp. (Now the leaked value is dead.)
5. **Scrub the source leak** so it can't be re-leaked: remove the hardcoded fallback from `nexxus2.2_replit/server/routes/{integrations,webhooks,conversations}.ts` (make the env var required, fail loudly if unset), rebuild Nexxus `dist`, redeploy. History scrub (BFG/filter-repo) is optional hardening since the value is dead after step 4.
6. **Update** non-runtime holders (harness `.claude` settings, drafts) to `<NEW>` or remove.

## Why this is NOT autonomous
- Steps 3–5 restart/redeploy **live customer-serving production** (Nexxus + Studio). Per global CLAUDE.md, production deploys and actions that modify real-world comms require explicit operator "go" and sysadmin coordination.
- A blind single-value swap (delete old, write new everywhere at once) guarantees a window where live VIN/DNC fails-closed → live comms blocked. The two-token overlap (steps 2→4) avoids downtime but must be driven deliberately.

## Recommendation
Schedule a short coordinated window. Claude can do the central-mcp/vin-safe-mcp/Studio config edits + the Nexxus source scrub + verification on the operator's "go"; the operator owns the Nexxus production restart/redeploy decision. Until then, the debt stays recorded here and in CRITICAL_URLS §go-live checklist item 4.
