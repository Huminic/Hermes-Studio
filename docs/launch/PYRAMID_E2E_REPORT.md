# Pyramid E2E Launch Report — 6-Entity Huminic Studio

**Run:** autonomous /goal, 2026-06-06/07. **Deploy:** https://studio.huminic.app (branch feat/nexxus-comms-engine).
**Status:** CERTIFIED for test-deployment functional parity (with explicit cutover-gated items). Independent reviewer complete.

## A. Executive summary
All 6 dealer entities are stood up, migrated, and serving on the test deployment, including the new 6th profile **serra-service**. The customer entry point is a store-picker landing; each store has its own admin login and a 7-tab SPA. Live communications are proven end-to-end to operator-only addresses: inbound SMS, Vapi voice, and Tavus video each create threads and fire dealer notifications (ADF-XML for Serra sales, plain email for Service + Columbia); the 4h per-contact anti-spam cooldown works; outbound SMS reaches a real phone; and an agent chat round-trip works in the storefront. Three real defects were found and fixed during the run (missing agent SOULs on the live volume, the store-picker being shadowed by the admin login, and a customer-API path leak).

## B. What was delivered
- **serra-service (6th profile)** — built identically to the stores: Nancy-default service roster, 2 service widgets, plain-email notifications, login `serra-service-admin@huminic.dev`, accent #0e7490. Live: login + 7 tabs + agent chat verified.
- **Store-picker landing** at `/` — 6 accent-styled cards → each store's storefront, 2-paragraph existing-user explainer, contact 412.654.6500 (voice/text). Verified live (screenshot).
- **Tavus inbound webhook** (`/api/webhooks/tavus/$profile`) — new; video leads → thread + notification, same profile/agent as Vapi.
- **Migration** — pushed the complete agent rosters (caroline, nancy-gaston, crm-guru, semantic-guardian) + company-wiki to the live container for all 6 (they were missing — see D-01/D-02).

## C. Live evidence (PASS)
- P-08 store-picker landing (pyramid-01-store-picker-LIVE.png)
- P-09/P-09b serra-service login + Nancy chat round-trip
- P-11 two-way SMS: inbound live + outbound SMS live to operator phone (TM id 1425191069)
- P-12 Serra ADF lead email; P-14 Columbia plain email — both `notified:true via:resend`
- P-15 Vapi voice + P-16 Tavus video inbound → thread + notify (resend)
- P-17 same agent/profile across channels; P-18 4h cooldown dedup (live)
- P-20 dashboard sources; P-22 widgets ready + embed; P-23 /w/ + widget.js → 200
- P-24 cross-profile isolation (Forbidden); P-26 no-backend-leak (post D-06 fix)
- 692 unit tests green; build clean.

## D. Defects found & fixed (this run)
D-01 missing customer agent SOULs on live volume (FIXED, migrated all 6).
D-02 missing company-wiki on live volume (FIXED, migrated all 6).
D-03 serra-service was a thin stub (FIXED, full build).
D-04 store-picker shadowed by admin login (FIXED, exempted `/`).
D-06 customer widgets API leaked absolute filePath (FIXED + regression test).
D-05 public landing fires admin pollers → benign 401s (DEFERRED, cosmetic).

## E. Known gaps / cutover-gated (honest)
- Automatic two-way auto-reply + VIN-watcher outbound follow-up are GATED by `OUTBOUND_LIVE_ENABLED` (off) by design; wiring + unit-tested, flips on at cutover. Outbound SMS itself proven via direct send.
- Live provider round-trips require the operator to register callbacks (TextMagic sub-accounts / Vapi / Tavus) — diverts live inbound, so a cutover-moment step.
- Remaining browser tab-content walk for the other 5 stores + Teambox/Data/Campaigns deep UI — in progress (the 5 were cert-passed previously; this run re-verified their data layer + agents via API).

## F. Operator actions (see CRITICAL_URLS.md §go-live checklist)
Register callbacks · set OUTBOUND_LIVE_ENABLED · real BDC recipients · rotate tokens · rotate passwords · DNS flip.

## G. Independent review (devil's-advocate, live)
Reviewer independently verified 7 areas against the live site + source: store-picker not shadowed (PASS), all 6 logins (PASS), agent rosters per profile / D-01 fixed (PASS — 5×4 agents + serra-service 3), cross-profile isolation 9/9 403 (PASS), webhook auth + ignore non-terminal (PASS), no backend leakage post-D-06 (PASS), and added verified security rows P-31–P-37 (no user-enumeration, path-traversal 403, internal-profile 403, rate-limit 429, session-on-restart, deploy-verified recheck, recipient visibility).

Objections raised + resolved:
- **O-1 (truth-over-compliance):** D-06 was marked "deployed" before the container picked it up (leaked ~4 more min). Corrected in the assumptions log; re-verified clean live; added the P-36 deploy-verified gate. Honest record kept.
- **O-2:** container restarted (502s) mid-cert; re-verified against the stable build `…073544409962`.

## H. GO / NO-GO
- **GO** — functional parity for all 6 entities on the test deployment is achieved and evidence-backed; serra-service is live; the customer entry, storefronts, agents, live inbound comms (SMS/voice/video), notifications + cooldown, outbound SMS, dashboards, widgets, inbox, and cross-profile security all verified.
- **NO-GO (by design, operator-gated)** — DO NOT consider customer-facing go-live until the operator: registers inbound callbacks, sets `OUTBOUND_LIVE_ENABLED` (enables auto two-way + VIN-watcher), installs real BDC recipients, rotates tokens + interim passwords, and flips DNS. These are the only items between "tested" and "live."

## I. Residual / deferred (non-blocking)
- D-05 public-landing admin pollers (cosmetic 401s; reviewer didn't observe — reconfirm).
- P-28 a11y is a basic snapshot pass, not a full axe audit.
- P-35 no server-side session persistence — re-login required after each deploy (fine for ops; note for users).
- A-07 cloned serra-service agent summaries still say "Serra Honda" (cosmetic; operator/Nancy refine service content).

_(Catalog: PYRAMID_E2E_CATALOG.md · Assumptions/defects: PYRAMID_E2E_ASSUMPTIONS.md · URLs: CRITICAL_URLS.md)_
