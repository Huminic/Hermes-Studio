# Phase 8 live headed sweep — 2026-06-01

**Performed by:** implementing agent (personal sweep, not delegated, per `feedback_live_headed_sweep.md`).

**Tool:** Playwright MCP (`mcp__plugin_playwright_playwright__*`).

**Target:** `https://studio.huminic.app` (live production).

**State:** fresh localStorage + cleared cookies on each navigation.

**Surfaces verified per `feedback_live_headed_sweep.md` minimum set:**

| # | Surface | Screenshot | Outcome |
|---|---|---|---|
| 1 | `/p/huminic-motors/` storefront landing | `phase8-sweep-01-huminic-motors-landing.png` | ✓ PASS — brand "Huminic Motors" renders + slug chip + 6 tiles + Data tile marked DISABLED. P-FIX-003 (schema fallback) verified live. P-FIX-001 (no HermesOnboarding overlay) verified live. |
| 2 | `/p/serra-honda/` storefront landing | `phase8-sweep-02-serra-honda-landing.png` | ✓ PASS — brand "Serra Honda" renders + slug chip "SERRA-HONDA" + 6 tiles + Data tile DISABLED + red accent. |
| 3 | `/reset?token=<test>` password reset page | `phase8-sweep-03-reset-page.png` | ✓ PASS — renders as standalone card. NO Studio admin sidebar, NO HERMES OS topbar. P-FIX-002 (shell bypass) verified live. |
| 4 | `/` Studio admin landing (redirects to `/chat/new`) | `phase8-sweep-04-studio-admin-landing.png` | ✓ PASS — login form renders. P-FIX-001 (no HermesOnboarding overlay) verified live. |
| 5 | `/engagements` admin route unauthenticated (initial) | `phase8-sweep-05-engagements-unauthed.png` | ⚠️ DEFECT (transient) — transient "h Huminic Studio" splash overlay renders OVER the login form during hydration. |
| 5b | `/engagements` after 3-second wait | `phase8-sweep-05b-engagements-after-wait.png` | ✓ Resolves to clean login form after hydration completes. |

## Defects surfaced during sweep

### NEW

**GAP-AUTH-HYDRATION-SPLASH-001 — transient splash overlay during hydration on auth-gated admin routes**
- Severity: MEDIUM (initial paint UX issue, resolves within ~3s)
- Where: `/engagements`, likely also other auth-gated admin routes (`/agents`, `/tasks`, etc. — not all checked).
- Symptom: Login form renders behind a translucent "h Huminic Studio" splash overlay during initial hydration. Resolves once the auth-check completes.
- Likely cause: workspace-shell renders the brand splash for ~hydration-window, then the auth-gate decides login-vs-shell.
- Fix proposal: defer the splash render until after the auth-check resolves, OR render the splash as a backdrop INSTEAD of (not on top of) the login form. ~1 hr.

**GAP-CSP-META-001 — CSP `frame-ancestors` directive ignored**
- Severity: LOW (security-policy that's already meant to be enforced — moving it to HTTP header makes it effective; today browsers ignore meta-delivered frame-ancestors so the page is more permissively framed than intended).
- Where: every page (delivered via `<meta http-equiv="Content-Security-Policy">`).
- Symptom: Browser logs `The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.`
- Fix: move `frame-ancestors` to an HTTP header `Content-Security-Policy: frame-ancestors 'self';` set in server-entry.js. ~30 min.

**GAP-API-CONNECTION-STATUS-500 — `/api/connection-status` returns 500 to unauthenticated callers**
- Severity: LOW (the endpoint is intentionally probed by the chat UI during init; 500 is what gets logged but it's not user-blocking).
- Where: `/api/connection-status`.
- Symptom: Browser logs `Failed to load resource: the server responded with a status of 500 () @ https://studio.huminic.app/api/connection-status:0`. Other auth-protected endpoints correctly return 401.
- Fix: investigate the route handler; 401 (auth required) is the right response for unauthenticated callers, not 500. ~30 min.

### EXISTING (re-confirmed)

**GAP-CONSOLE-001 — CSP rejects Google Fonts + React #418 hydration warning**
- Re-confirmed on every page navigated. Already in PLAN.md running log. ~1 hr post-launch fix.

## Defects NOT surfaced (regression check on prior P-FIX)

- **P-FIX-001** (HermesOnboarding modal) — NOT reproduced. Sweep #1 + #4 confirm no overlay on fresh-localStorage storefront login or Studio admin login. Fix is live.
- **P-FIX-002** (/reset in admin shell) — NOT reproduced. Sweep #3 confirms standalone render. Fix is live.
- **P-FIX-003** (huminic-motors schema fallback) — NOT reproduced. Sweep #1 confirms brand "Huminic Motors" renders + Data tile marked DISABLED. Fix is live.

## Summary

3 NEW gaps surfaced (1 MEDIUM, 2 LOW). 3 prior P-FIX defects verified as still fixed. No customer-blocking new defects.

The 3 new gaps land in PLAN.md running log as `GAP-AUTH-HYDRATION-SPLASH-001`, `GAP-CSP-META-001`, `GAP-API-CONNECTION-STATUS-500`. None of them, alone or together, justify retracting Phase 8 deliverables. They are added to the LOW/MEDIUM buckets in `TRIAGE.md` and are operator's call to either fix pre-launch or accept-with-disposition.

## Recommendation update (operator)

The 3 operator decisions in `TRIAGE.md`'s "Recommended next decision" section remain unchanged. The headed sweep added 3 new rows to consider, but none escalate any HIGH-bucket items.
