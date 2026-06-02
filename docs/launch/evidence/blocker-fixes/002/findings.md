# GAP-VER-002 — direct nav to admin routes shows login for authed sessions — fix

## Verifier finding
Direct URL navigation / refresh / bookmark to `/profiles`, `/agents`,
`/engagements`, `/tasks`, `/audit` rendered a persistent Sign-in form for an
authenticated session. SPA navigation from `/chat/new` → sidebar link worked.
`/api/auth-session` simultaneously returned `authenticated: true`.

## Root cause
In `src/components/workspace-shell.tsx`, `authStatus` is resolved **only** by
`ConnectionStartupScreen` (via its `onConnected` callback). But the protected-
path guard returns `<LoginScreen/>` early when `authStatus === null`, BEFORE
`ConnectionStartupScreen` is mounted in the main render. So on **direct
navigation** to a protected route:
1. first paint: `authStatus === null` + protected path → early `<LoginScreen/>`
2. `ConnectionStartupScreen` never mounts → `onConnected` never fires
3. `authStatus` stays `null` forever → permanent login form

SPA navigation worked only because the shell had already mounted on a
non-protected route (`/chat/new`), where the startup overlay ran and resolved
`authStatus`; subsequent in-app navigation kept that resolved state.

## Fix
Add a `useEffect` in `WorkspaceShell` that resolves auth independently, using
the same `/api/auth-check` call (`fetchHermesAuthStatus`) the startup overlay
uses. Hooks run before the early returns, so the check always runs — even when
the protected-path `LoginScreen` guard fires. On success it sets `authStatus`
(only if still unset) and marks the connection verified; on failure it no-ops
and the main render's `ConnectionStartupScreen` still owns the retry/failure UI.
No new abstraction; the design already expected "a brief LoginScreen flash
before the client auth-session check resolves and replaces it" — the bug was
that the resolve never happened on direct nav.

## Verification (live headed pass, local no-auth build)
This is an SSR/hydration auth-shell bug — the class unit tests miss, so it is
verified in a real browser (per the live-headed-sweep discipline):

- Direct nav `/engagements` → renders the HERMES OS workspace + the engagements
  overview (was "Enter Password"). Screenshot: `direct-nav-engagements.png`.
- Direct nav `/profiles` → `{hasPasswordGate:false, hasHermesOS:true,
  hasProfilesContent:true, title:"Profiles — Hermes"}`.
- **P-FIX-001 re-verify (PROC-120):** `/` → `/chat/new`,
  `{hasOnboarding:false, hasPasswordGate:false, hasHermesOS:true}` — no
  HermesOnboarding overlay.
- **P-FIX-002 re-verify (PROC-006):** `/reset?token=...` → standalone reset
  card (`Huminic / RESET PASSWORD / New password / Confirm / Update password`),
  `{hasAdminSidebar:false, hasPasswordGate:false}`.
- vitest 530 pass; Playwright workflows 16 pass / 49 fixme / 0 fail (no regression).

## Production note
Reflects only after a Coolify redeploy (operator-only). PROC-010 / PROC-130 are
PENDING-COOLIFY-REDEPLOY.
