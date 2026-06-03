# Go-Live Ops Runbook (Nexxus migration — P1 ops)

Post-merge, post-deploy operational steps to make the Studio comms engine fully
live. All steps run **inside the studio container** unless noted. None of these
are the flip itself (see `FLIP_PACKAGE.md`); they prepare the engine so that
when the flip happens, comms work.

Studio container: `hermes-studio-<uuid>` (host `127.0.0.1:8009` → :3000).
Agent/volume container: `hermes-agent-<uuid>` (volume at `/root/.hermes`).
WORKDIR `/app`. No curl/pnpm in the studio container — use `node` / `npx tsx`.

Helper to resolve the studio container name:
```
STUDIO=$(docker ps --format '{{.Names}}' | grep -m1 '^hermes-studio-')
```

---

## 1. Provision messaging-hub.db on the dealer profiles

Currently only `huminic` and `serra-honda` have a `messaging-hub.db`. The store
auto-creates one on first write, but pre-create them so the first real inbound
never races table creation. Parent profiles (huminic / serra-automotive /
strukture) are **non-dealer** and skipped.

```
docker exec "$STUDIO" npx tsx scripts/provision-messaging-hub.ts
```

Expected: one `messaging-hub.db ready` line per dealer (serra-honda,
serra-nissan, serra-service, tony-serra-ford, ford-of-columbia,
hyundai-of-columbia, huminic-motors, cedar-ridge-automotive).

## 2. Wire the cron jobs

Two cadenced runners ship in `scripts/`. Wire them via host crontab (they
`docker exec` into the studio container) or Hermes cron.

**Comms scheduler — every minute** (campaign ticks + >30 min escalation):
```
* * * * * docker exec $(docker ps --format '{{.Names}}' | grep -m1 '^hermes-studio-') \
            npx tsx scripts/comms-cron.ts >> /tmp/comms-cron.log 2>&1
```

**Integrity scanner — hourly** (broken links / orphans / missing frontmatter;
the read-time half of the Semantic Guardian):
```
0 * * * * docker exec $(docker ps --format '{{.Names}}' | grep -m1 '^hermes-studio-') \
            npx tsx scripts/integrity-cron.ts >> /tmp/integrity-cron.log 2>&1
```

Each runner exits 0 even on a bad profile so cron stays healthy. Confirm the
first runs:
```
docker exec "$STUDIO" npx tsx scripts/comms-cron.ts
docker exec "$STUDIO" npx tsx scripts/integrity-cron.ts
```

## 3. Go-live env (Coolify env vars on the studio app, then redeploy)

CommGate is **fail-closed**: outbound stays disabled until `OUTBOUND_LIVE_ENABLED`
is exactly `true`. Set these on the Coolify `huminic-studio` app:

| Var | Value | Purpose |
|---|---|---|
| `OUTBOUND_LIVE_ENABLED` | `true` | Master outbound kill switch (off = all sends blocked). |
| `CENTRAL_MCP_TOKEN` | (united broker token) | Shared SMS/Vapi/Tavus/Resend + live VIN via central-mcp. |
| `VAPI_ASSISTANT_ID` | (shared assistant) | Voice outbound (shared-credential default). |
| `TAVUS_PERSONA_ID` | (shared persona) | Video outbound (shared-credential default). |

Per-profile **own**-credential overrides live in
`~/.hermes/profiles/<profile>/.env` and are only used when that profile's
`channel_credentials` selects `own` (default is `shared`). Inbound auth per
profile uses `HERMES_INBOUND_TOKEN` in the profile `.env`.

After setting env, redeploy so the studio container picks them up.

## 4. Flip the volume governor SOULs to active

The 7 `*-data-governor` SOULs in the repo (`docs/launch/agent-souls/governors/`)
are now `status: active` because the integrity scanner shipped. Deploy those
active copies onto the volume governor profiles so the live SOULs match:

```
# from the repo, push each active governor SOUL to its volume profile
for f in docs/launch/agent-souls/governors/*.md; do
  slug=$(basename "$f" .md)
  docker cp "$f" "$(docker ps --format '{{.Names}}' | grep -m1 '^hermes-agent-')":/root/.hermes/profiles/"$slug"/SOUL.md
done
```

Do this **only after** the scanner code is deployed (truth-over-compliance: the
governor is not "active" until its read-time capability is actually running).

## 5. Smoke-verify the comms engine (no real recipients)

With `OUTBOUND_LIVE_ENABLED` still **unset** (safe), confirm the inbound hook
records and the gate blocks:
```
docker exec "$STUDIO" node -e "
  fetch('http://127.0.0.1:3000/api/messaging/inbound', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({profile:'serra-honda', channel:'sms', domain:'sales',
      contact_handle:'+15555550100', body:'smoke test'})
  }).then(r=>r.json()).then(j=>console.log(j))
"
```
Then provision a thread reply subscription + post again to confirm a generated
reply is `adapter_status: blocked` (gated) until step 3 enables outbound.

---

## Verification checklist

- [ ] `provision-messaging-hub.ts` reports all 8 dealer dbs ready.
- [ ] `comms-cron.ts` + `integrity-cron.ts` run clean and are in crontab.
- [ ] Coolify env has `OUTBOUND_LIVE_ENABLED=true` + shared creds; redeployed.
- [ ] Volume governor SOULs show `status: active` (`grep status: …/SOUL.md`).
- [ ] Smoke inbound records a thread; gated reply shows `adapter_status: blocked`
      before enable, real send after.
