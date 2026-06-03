# Flip Package — `live.huminic.app` → Studio (operator key-turn)

This is the single, reversible cutover that points `live.huminic.app` at the new
Studio instead of legacy Nexxus. **Operator-only** (irreversible, production,
reverse-proxy change). Everything else is already prepared; this is the key-turn.

Grounded in the live system on 2026-06-03:
- `live.huminic.app` is served by host **Caddy** (`/etc/caddy/Caddyfile`) →
  currently `reverse_proxy localhost:5001` = **legacy Nexxus Connect v2.2**.
- Studio runs in Coolify, exposed at host **`127.0.0.1:8009`** (→ container :3000).
  `127.0.0.1:8009/api/health` returns 200. (`studio.huminic.app` reaches Studio
  via Coolify's own proxy — not this Caddyfile.)
- The flip changes ONE upstream in the Caddy `live.huminic.app` block and sets
  `PORTAL_HOST` so Studio serves the branded portal login on that host.

> No DNS change. No Coolify routing change for `studio.huminic.app`. Legacy
> Nexxus on `:5001` keeps running (untouched) so rollback is instant.

---

## Preconditions (must all be true before flipping)

1. `feat/nexxus-comms-engine` merged to `main`, Coolify redeployed, `studio.huminic.app`
   verified on the new build.
2. `GO_LIVE_OPS.md` steps 1–4 done: messaging-hub.db provisioned, crons wired,
   `OUTBOUND_LIVE_ENABLED=true` + shared creds set, volume governor SOULs active.
3. Per-profile customer-admin credentials provisioned for every profile that will
   log in at `live.huminic.app/p/<profile>`. Already provisioned: `huminic` (duane),
   `strukture` (kim). **Provision the rest** as needed:
   ```
   docker exec "$(docker ps --format '{{.Names}}' | grep -m1 '^hermes-agent-')" \
     npx tsx scripts/create-user.ts --profile serra-honda --customer-admin
   ```

## Step 1 — Set PORTAL_HOST on the Studio app (Coolify env)

Add `live.huminic.app` to `PORTAL_HOST` (comma-separated; keep any existing
portal hosts) on the Coolify `huminic-studio` app, then redeploy:

```
PORTAL_HOST=live.huminic.app,portal.huminic.app
```

This makes `isPortalHost('live.huminic.app')` true → Studio serves the branded
PortalLogin shell on that host (per `src/lib/portal-host.ts`).

## Step 2 — Repoint the Caddy upstream

Current block in `/etc/caddy/Caddyfile`:

```caddy
# Nexxus Connect v2.2 — Live (soft launch)
live.huminic.app {
	reverse_proxy localhost:5001 {        # <-- legacy Nexxus
		header_up Host {host}
		header_up X-Real-IP {remote}
		header_up X-Forwarded-For {remote}
		header_up X-Forwarded-Proto {scheme}
		health_uri /api/health
		health_interval 30s
		health_timeout 10s
	}
	header { … }
	log { output file /var/log/caddy/live-huminic-app.log }
}
```

**Change exactly one line** — the upstream port:

```caddy
		reverse_proxy localhost:8009 {        # Studio (was 5001 = legacy Nexxus)
```

`health_uri /api/health` stays valid — Studio answers 200 on `:8009/api/health`.

## Step 3 — Validate and reload (zero-downtime)

```
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy        # reload, not restart — no dropped connections
```

## Step 4 — Smoke-verify the flip

```
curl -sI https://live.huminic.app/            # 200/307 from Studio (login redirect)
curl -s  https://live.huminic.app/api/health  # Studio health payload
```
Then in a browser: `https://live.huminic.app/` shows the branded portal login;
log in as a customer-admin and confirm the 6-page storefront loads with comms +
reports live.

---

## Rollback (instant — legacy never stopped)

Revert the one line and reload:
```caddy
		reverse_proxy localhost:5001 {        # back to legacy Nexxus
```
```
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```
Optionally remove `live.huminic.app` from `PORTAL_HOST` and redeploy. Legacy
Nexxus on `:5001` was untouched throughout, so rollback is immediate.

---

## What this package deliberately does NOT do

- Does not change DNS.
- Does not stop or modify the legacy Nexxus container (`:5001`).
- Does not touch `studio.huminic.app` (Coolify-proxied; stays as the admin URL).
- Does not enable outbound — that is `OUTBOUND_LIVE_ENABLED` in `GO_LIVE_OPS.md`.
