# Nexxus → Huminic Studio Hard Cutover — Operator Ritual

**Status:** Pre-cutover. Phase C + CY work merged through main as of 2026-05-30.
**Owner:** Duane Wells. Coding agent prepared the system; the operator owns every irreversible action below.

---

## What's already done (no action from you needed)

- All 6 customer storefronts live on `studio.huminic.app/p/<slug>`:
  serra-honda, serra-service, serra-nissan, tony-serra-ford,
  ford-of-columbia, hyundai-of-columbia. Plus huminic + strukture.
- Each profile has its 9 agents mirrored from Nexxus
  (primary Vapi agent + Data Guru / Sales Coach / Communication Writer /
  Photo Studio / Video Producer / Copywriter / Market Intel /
  Creative Director). **All set to `enabled: false`** until you flip them.
- Wiki MCP server live at `/api/mcp/wiki` with bearer-token auth.
- Studio admin UI at `/settings/mcp-tokens` for issuing tokens.
- Consultative-agent admin token issued. Fingerprint `Nht5tFHU…`.
- Vapi inbound webhook live at `/api/webhooks/vapi/<profile>`.
- TextMagic inbound webhook live at `/api/webhooks/textmagic/<profile>`.
- ADF XML parse + emit pipeline wired (`/api/webhooks/vapi/...` →
  messaging-hub → `lead_notifications.adf_email`).
- All 6 customer pages render end-to-end (Chat, Knowledge,
  Tools+Widget, Data, Comms, Campaigns) on the live URL with
  Nexxus-styled chrome (88px icon sidebar + per-profile brand chip).
- 377/377 vitest pass. Build clean. Live UI walked via Playwright MCP.
- Cross-profile isolation enforced at every API layer.

## What you must do before cutover (in order)

### 0. Verify state

```bash
# Confirm all 6 customer profiles are present on the production volume
docker exec $(docker ps --format '{{.Names}}' | grep hermes-agent | head -1) \
  ls /root/.hermes/profiles/

# Expected: serra-honda, serra-service, serra-nissan, tony-serra-ford,
# ford-of-columbia, hyundai-of-columbia + huminic + strukture +
# consultative-agent + *-data-governor profiles.
```

Hit `https://studio.huminic.app/p/serra-honda` in a private window — should
render the Serra Honda landing without crashing.

### 1. Provision per-store customer-admin credentials

For each store, pick a strong password and provision a customer-admin
user. The script writes a scrypt-hashed `auth.yaml` inside the profile.

```bash
STUDIO=$(docker ps --format '{{.Names}}' | grep hermes-studio | head -1)
docker exec -it $STUDIO sh -c 'cd /app && pnpm tsx scripts/create-user.ts \
  --profile serra-honda --username <pick-username> --customer-admin'
# repeat for serra-service, serra-nissan, tony-serra-ford,
# ford-of-columbia, hyundai-of-columbia
```

For testing today, `serra-honda` already has `tester / SerraHondaTest2026!`
— rotate or remove via `auth.yaml` edit when you provision real users.

### 2. Set CENTRAL_MCP_TOKEN in the Studio container env

Without it, `/api/webhooks/vapi/<profile>` records the inbound call and
the thread shows up in Comms, but the ADF email never sends — the
adapter reports `unconfigured` cleanly.

Pick (or create) a central-mcp token that has the `resend` provider in
its allowlist. Existing token labels with resend access in
`~/Claude-store/central-mcp/config/local.yaml`:
- `personabox` (has coolify, resend, fal, google, signalwire)
- `nexxus_2_2` (has resend + many others)

Set it via the Coolify env var API or shell on the host:

```bash
# Coolify env API (preferred — survives container rebuilds)
COOLIFY_TOKEN="1|h9Z25ffkaZzm4jXCSSqAIZGaxG7yG6nS3jqp24AV5501106f"
APP_UUID="nh5vnz9kz226cj9ib3nodg1j"
curl -X POST \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docker.huminicdev.com/api/v1/applications/$APP_UUID/envs" \
  -d '{"key":"CENTRAL_MCP_TOKEN","value":"<the-token-secret>","is_preview":false}'

# Then redeploy:
curl -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "https://docker.huminicdev.com/api/v1/deploy?uuid=$APP_UUID&force=true"
```

Also note: the Studio container needs to reach central-mcp at host
`http://host.docker.internal:4002/mcp`. The current Coolify-managed
network doesn't route this hostname by default. Either:
- Add `extra_hosts: ["host.docker.internal:host-gateway"]` to
  docker-compose.yml's `hermes-studio` service, OR
- Move central-mcp into the same Coolify project so it's reachable on
  the project's docker network as `central-mcp:4002`, OR
- Set `CENTRAL_MCP_URL` env var to a publicly-reachable URL for the
  central-mcp instance.

### 3. Set lead_notifications.adf_email per profile

Test with `neoweaver@gmail.com` first; flip to the dealer's BDC
distribution list when ready.

```bash
AGENT=$(docker ps --format '{{.Names}}' | grep hermes-agent | head -1)
for slug in serra-honda serra-service serra-nissan tony-serra-ford ford-of-columbia hyundai-of-columbia; do
  docker exec $AGENT sed -i "s|adf_email: \"\"|adf_email: \"neoweaver@gmail.com\"|" \
    /root/.hermes/profiles/$slug/studio.yaml
done
```

For serra-honda this is already done. The other 5 are still `""` → ADF
emit is a no-op.

### 4. Run the Elliott → ADF round-trip test

**Pre-step:** create a NEW Vapi assistant in your Vapi dashboard for
testing. Do NOT touch Caroline / Nancy / Magnolia / Georgia / Savannah /
Elizabeth — those still answer Nexxus calls. Configure the test
assistant's end-of-call-report webhook to:

```
https://studio.huminic.app/api/webhooks/vapi/serra-honda
```

Then run from the studio repo:

```bash
cd ~/Claude-store/huminic-studio
pnpm tsx scripts/elliott-test-huminic.ts --target serra-honda \
  --phone <your-test-assistant-phone>
```

Verify:
1. Thread appears in `/p/serra-honda/comms` Sales segment.
2. Email lands at `neoweaver@gmail.com` with ADF XML attachment.

If step 2 fails: check the system-tagged message annotation in the
thread (it records the dispatch outcome with the actual error reason).

### 5. Enable agents one at a time

The cutover signal — each store goes live as you flip its agents.

```bash
AGENT=$(docker ps --format '{{.Names}}' | grep hermes-agent | head -1)
# Flip Caroline (Serra Honda primary)
docker exec $AGENT sed -i 's|^enabled: false|enabled: true|' \
  /root/.hermes/profiles/serra-honda/governance/agents/caroline.md

# Confirm in the storefront chat picker:
#  /p/serra-honda/chat should now show Caroline in the agent picker
```

For each agent you enable, set up its real Vapi/TextMagic webhooks to
point at the new system **only after you've verified the chat works**.
For agents that should still answer via Nexxus, leave their webhooks
on Nexxus.

### 6. SMS pilot (TextMagic)

For one test store's TextMagic-receiving number, add this inbound
webhook URL in the TextMagic dashboard:

```
https://studio.huminic.app/api/webhooks/textmagic/serra-service?domain=service
```

Optionally set `TEXTMAGIC_WEBHOOK_SECRET` in the profile's `.env`
inside the agent container and pass it as `x-textmagic-secret` header
in the TextMagic config.

Send an SMS from your phone → should appear in
`/p/serra-service/comms` Service segment within seconds.

### 7. Issue scoped MCP tokens for runtime agents

For each store you bring live, issue a per-store MCP token so its
runtime agent can call `wiki_read` / `wiki_search` against ONLY that
store's wiki:

Navigate to `https://studio.huminic.app/settings/mcp-tokens` (logged in
as Studio admin) → "New token":
- label: `caroline-runtime`
- allowed_profiles: `serra-honda`
- allowed_tools: `wiki_read, wiki_search, wiki_list`
- admin: false
- Copy the secret ONCE.

Store the secret in `~/.hermes/profiles/serra-honda/.env` as
`WIKI_MCP_TOKEN=<secret>` and point Caroline's runtime config at
`https://studio.huminic.app/api/mcp/wiki` with that bearer.

### 8. Run the consultative agent against the live huminic engagement

The consultative agent's admin MCP token is already issued
(`consultative-agent`, fingerprint `Nht5tFHU…`). Use this token to:
- Call `wiki_search` / `wiki_read` across all customer wikis for audit.
- Call `wiki_propose` to drop prescription artifacts into
  `<customer>/knowledge/inbox/` (KSG-gated).
- Call `mcp__create_profile` to spin up new customers without ever
  touching the operator console (the new profile gets a full studio.yaml
  scaffold + engagement-state seed).
- Call `mcp__issue_token` to issue scoped tokens for the new
  customer's runtime agents.

### 9. Final cutover (DNS / Nexxus stop)

When all stores' agents are flipped to `enabled: true`, all webhooks
are pointed at the new system, and the customer-facing comms are
working — only THEN flip DNS and stop Nexxus.

This is your call. The agent will NOT do this. Steps:

```bash
# DNS: update live.huminic.app to point at studio.huminic.app's host
# OR add a /p/* rewrite from live.huminic.app → studio.huminic.app/p/*
# in Caddy/Cloudflare.

# Stop Nexxus only after verifying every store's customer-facing flow
# works on the new system for 24+ hours.
pm2 stop nexxus  # or however Nexxus is supervised
```

## What's still on the operator-action list (open gates)

| Gate | Action | Phase |
|---|---|---|
| Coolify env: CENTRAL_MCP_TOKEN | Step 2 | C.6 / lead notifications |
| central-mcp network reachability from Studio container | Step 2 | infra |
| Per-store customer-admin credentials | Step 1 | C.1 |
| Per-store lead_notifications.adf_email destinations | Step 3 | C.6 |
| Vapi test assistant + Elliott round-trip | Step 4 | C.6 / cutover validation |
| TextMagic webhook URL per store | Step 6 | C.6 |
| Per-store enable flip (8 agents × 6 stores = 48 toggles) | Step 5 | cutover |
| Per-store runtime MCP tokens | Step 7 | C.5.8 / MCP |
| DNS / Nexxus stop | Step 9 | AC.12.4 |

## Rollback

If anything goes wrong after a cutover step:

- **Flip an agent back to `enabled: false`** → instant; storefront picker drops it.
- **Revert a Vapi webhook in the dashboard** → back to Nexxus.
- **Re-point DNS** → back to Nexxus (no data loss; Nexxus state is intact while it's still running).

The new system is additive. Nothing about it touches Nexxus state.

## Acceptance for "cutover complete"

- [ ] All 6 stores have `enabled: true` for at least one customer-facing agent
- [ ] All 6 stores' Vapi webhooks point at `/api/webhooks/vapi/<slug>`
- [ ] All 6 stores' SMS receivers point at `/api/webhooks/textmagic/<slug>`
- [ ] At least one ADF email delivered to a real dealer BDC inbox per store
- [ ] 24+ hours of dual-running with no Nexxus-only fallbacks
- [ ] Nexxus stopped and DNS flipped to Huminic Studio
- [ ] `docs/cedar-ridge-readiness-report.md` archived (historical record only)
- [ ] This file marked **CUTOVER COMPLETE** with date + your sign-off

When you sign that last line, the migration is done.
