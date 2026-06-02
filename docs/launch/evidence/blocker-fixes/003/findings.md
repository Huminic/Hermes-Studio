# GAP-VER-003 — password-reset rate-limit not firing — root cause + fix

## Verifier finding (production)
5 rapid `POST /api/auth/reset-request` from one client all returned HTTP 200;
no 429. Rate cap (3/min/IP) never fired.

## Diagnosis (this pass)

The rate-limit *logic* is correct. Proven by hitting the production node
process **directly, bypassing the proxy** (no `X-Forwarded-For`, so the key is
the constant `'local'`):

```
# docker exec hermes-studio-...085548456876 node fetch x5 -> 127.0.0.1:3000
request 1 -> HTTP 200
request 2 -> HTTP 200
request 3 -> HTTP 200
request 4 -> HTTP 429   <-- limit fires correctly
request 5 -> HTTP 429
```

Through the public URL (via the Caddy reverse proxy) it never fired —
5x HTTP 200 — even with a fixed `X-Forwarded-For` header.

### Ground truth (tcpdump on the container's :3000 while curling the public URL)
```
X-Forwarded-For: 150.136.6.207:35036    <- request 1
X-Forwarded-For: 150.136.6.207:35044    <- request 2  (port CHANGED)
X-Real-Ip:       150.136.6.207:35044
```

Caddy sets `X-Forwarded-For` / `X-Real-IP` to `{remote}` = **`IP:port`**, and
the ephemeral source port changes on every TCP connection. `getClientIp` used
`forwarded.split(',')[0].trim()` and returned the raw `IP:port` token, so every
request produced a **unique** rate-limit key (`auth-reset:150.136.6.207:35036`,
`auth-reset:150.136.6.207:35044`, ...). The per-IP bucket never accumulated.

This affected **all six** rate-limited endpoints that key on `getClientIp`
(login, reset-request, reset-confirm, terminal-input, terminal-stream, files),
not just reset-request.

## Fix
`src/server/rate-limit.ts`: add `stripPort()` and apply it in `getClientIp()`
(plus an `x-real-ip` fallback). The key is now a stable bare IP regardless of
the ephemeral port. IPv4 and IPv6 (bracketed + bare) handled.

## Verification (rebuilt build, replaying the production failure mode)
Rotating-port `X-Forwarded-For` against the rebuilt local server:
```
XFF 150.136.6.207:35036 -> HTTP 200
XFF 150.136.6.207:35044 -> HTTP 200
XFF 150.136.6.207:35051 -> HTTP 200
XFF 150.136.6.207:35060 -> HTTP 429   <-- now fires on the 4th
XFF 150.136.6.207:35072 -> HTTP 429
```

Plus `src/test/rate-limit.test.ts` (10 tests): stripPort cases + getClientIp
stability across rotating ports + accumulation to a 4th-request block.

## Production status
The fix is a code change on `feature/phase-8-blocker-fixes`. **Production will
not reflect it until the operator triggers a Coolify redeploy** (the deployed
image was built before this fix). Mark PROC-005 / PROC-104 PENDING-COOLIFY-REDEPLOY.
