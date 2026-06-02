# LOW-bucket fixes (after all blockers green)

All verified live against a local build.

## GAP-API-CONNECTION-STATUS-500
`/api/connection-status` returned 500 to unauthenticated callers. Cause:
`isAuthenticated` returns a boolean, but the handler did
`return authResult as unknown as Response` — returning `false` as a Response →
500 ("HTTPError"). Fixed to `if (!isAuthenticated(request)) return
Response.json({error:'Unauthorized'},{status:401})`.
Verified: with HERMES_PASSWORD set, unauth GET → `HTTP 401 {"error":"Unauthorized"}`.

## GAP-CSP-META-001
`frame-ancestors` was only in the `<meta>` CSP, which browsers ignore for that
directive. server-entry.js now emits `Content-Security-Policy: frame-ancestors
'none'` + `X-Frame-Options: DENY` as HTTP headers on responses.
Verified: `curl -I /chat/new` shows both headers.

## GAP-CONSOLE-001 (fonts half)
styles.css `@import`s fonts.googleapis.com but CSP didn't allow it. Added
`https://fonts.googleapis.com` to `style-src` and `https://fonts.gstatic.com`
to `font-src` in APP_CSP (__root.tsx).
Verified: server-rendered CSP meta now lists both hosts.
(The React #418 hydration-warning half of GAP-CONSOLE-001 is separate and left
open — non-blocking dev-console noise.)

vitest 530 pass; Playwright workflows 16/49/0. PENDING-COOLIFY-REDEPLOY.
