# Plugin install — fresh Hermes + Huminic Studio host

**SRS Tranche D.1.** Document for installing the customer-console /
messaging-hub / data-canvas plugins on a clean Hermes + Huminic Studio
deployment. Reproducible. No fork edits required.

## Prerequisites

- Hermes Agent running with `~/.hermes/` mounted (Coolify volume or local)
- Huminic Studio container running and reachable
- `pnpm` and `tsx` available for one-shot scripts
- `central-mcp` reachable from the Studio container (for Resend dispatch)

## Steps

### 1. Copy plugin scaffolds onto the volume

```bash
docker exec -it $AGENT sh -c '
  cp -R /app/docs/consulting_package/Hermes_Cursor_Implementation_Package/scaffold/studio-plugins/* \
        /root/.hermes/studio-plugins/
'
```

Verify three plugin dirs exist: `customer-console`, `messaging-hub`, `data-canvas`.

### 2. Copy skill scaffolds onto the volume

```bash
docker exec -it $AGENT sh -c '
  cp -R /app/docs/consulting_package/Hermes_Cursor_Implementation_Package/scaffold/skills/* \
        /root/.hermes/skills/
'
```

Verify each customer profile's `distribution.yaml` lists the skills it
needs (the consultative agent prescription writes this).

### 3. Provision Brain on every profile (sixth invariant enforcement)

```bash
docker exec -it $STUDIO sh -c 'cd /app && pnpm tsx scripts/provision-brain.ts'
```

Output shows per-profile schema version + pending migrations + metadata
substrate presence. Any FAILED row is a launch blocker.

### 4. Seed the Knowledge ↔ Brain interaction contract per profile

```bash
docker exec -it $STUDIO sh -c '
  cd /app && pnpm tsx -e "
    import {seedInteractionContract} from \"./src/server/reconciliation\";
    import fs from \"node:fs\";
    for (const p of fs.readdirSync(\"/root/.hermes/profiles\")) {
      const r = seedInteractionContract(p);
      console.log(p, r.written ? \"seeded\" : \"already present\");
    }
  "'
```

### 5. Verify the MCP server exposes wiki, brain, federation, and comms tools

```bash
curl -s -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  https://studio.huminic.app/api/mcp/wiki \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name' | sort
```

Expect to see `brain_*`, `comms_*`, `federation_*`, `wiki_*`, and `mcp__*`
admin tools.

### 6. Issue scoped runtime tokens per profile

Use the Studio admin UI at `/settings/mcp-tokens` or call `mcp__issue_token`
via the consultative-agent admin token. Recommended scopes for runtime:

```yaml
allowed_profiles: [<profile>]
allowed_tools:
  - wiki_read
  - wiki_search
  - wiki_list
  - brain_query
  - brain_record_chat
  - brain_record_lookup_miss
  - brain_record_hunch
  - federation_query
  - federation_list_scopes
  - comms_send_email
  - comms_send_sms
admin: false
```

### 7. Smoke test

- GET `/api/brain/readiness?profile=<slug>` → 200 with `ok: true`
- GET `/api/plugins` (Studio admin auth) → returns three plugins
- POST `/api/mcp/wiki` with `tools/list` → returns ≥30 tools

If all three pass, the plugin install is complete and the profile is
launch-ready.
