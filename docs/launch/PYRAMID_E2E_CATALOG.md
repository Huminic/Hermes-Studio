# Pyramid E2E Test Catalog — 6-Entity Launch Certification

**Goal:** stand up + migrate + certify all 6 dealer entities on studio.huminic.app.
**Rule:** no row is PASS without attached evidence. The unchecked rows are the
only signal of remaining work. Devil's-advocate review must sign off with zero
open objections before certification.

**Entities (6):** serra-honda, serra-service *(new)*, serra-nissan,
tony-serra-ford, hyundai-of-columbia, ford-of-columbia.

## Discovery inventory (Phase 1)

- **Public routes:** `/` (store-picker landing — NEW), `/p/$profile` (storefront landing), `/p/$profile/$tab` (auth-gated SPA), `/w/$slug` (public widget), `/console/*` (admin-side console).
- **SPA tabs (per profile):** chat, knowledge, tools (+widget sub), data, comms, campaigns, notifications.
- **Customer APIs:** agents, chat, dashboards, notifications, reports, lead-flow, engagement-state, widgets, wiki, audiences, campaigns.
- **Messaging APIs:** threads (list/detail/reply/assign/subscriptions), contacts, inbound, stream (SSE).
- **Webhooks:** textmagic.$profile, vapi.$profile, **tavus.$profile (NEW)**.
- **Public widget APIs:** widget-chat, widget-form, widget-config, widget.js, widgets, artifacts.
- **Auth:** profile-auth (auth.yaml per profile, scrypt), session metadata (is_admin / is_customer_admin), gateway legacy password.
- **Engine:** messaging-hub (per-profile SQLite), lead-notifications (matrix + cooldown), autonomous-reply (AC.5.8), campaign-worker, adapters (textmagic/vapi/tavus/resend), federation→VIN, dashboard builder.

## Catalog

Layers: U=unit, I=integration, E2E=browser, C=contract, V=visual, SEC=security, DB=db, A11Y=accessibility.

| ID | Layer | Requirement | Scenario | Expected | Evidence | Status |
|----|-------|-------------|----------|----------|----------|--------|
| P-01 | U | serra-service provisioned | studio.yaml parses via real zod schema | VALID, nancy default, plain-email | tsx parse log | ✅ PASS |
| P-02 | U | serra-service auth | scrypt hash verifies for HuminicLaunch2026 | verify PASS | node verify log | ✅ PASS |
| P-03 | U | Tavus webhook | transcription_ready → video thread + notify | 200, channel=video, notify.ok | tavus-webhook.test.ts | ✅ PASS |
| P-04 | U | Tavus webhook negative | bad secret → 401; lifecycle ping → ignored | 401 / ignored:true | tavus-webhook.test.ts | ✅ PASS |
| P-05 | U | Store-picker landing | renders 6 cards, links, contact # | all present | store-picker-landing.test.tsx | ✅ PASS |
| P-06 | U | Full unit suite green | pnpm test | 690/690 | suite output | ✅ PASS |
| P-07 | DB | serra-service hub fresh | messaging-hub.db created on first inbound, isolated | rows only in serra-service | query | ☐ TODO |
| P-08 | E2E | Store-picker live | visit `/` on test URL → 6 cards, click → /p/$profile | renders, navigates | pyramid-01-store-picker-LIVE.png | ✅ PASS |
| P-09 | E2E | Per-entity login | log in to each of 6 storefronts | session set, SPA loads | serra-service done live; other 5 = subagent walk | 🟡 serra-service PASS; 5 pending |
| P-09b | E2E | serra-service chat round-trip | login → pick Nancy → send msg → reply | live agent reply (persona) | snapshot 07-29-34 | ✅ PASS |
| P-10 | E2E | All 7 tabs per entity | nav each tab for each entity | renders, no backend leak | serra-service nav verified; tab content walk pending | 🟡 partial |
| P-11 | I | Two-way SMS (Serra) | inbound SMS live + outbound SMS live to operator phone | inbound thread + real outbound text (TM id 1425191069) | webhook resp + TM id | ✅ PASS (auto-reply chain gated→cutover) |
| P-12 | I | Lead trigger (Serra) | new SMS lead → ADF email (operator inbox) | notified:true via:resend | webhook resp | ✅ PASS |
| P-13 | I | Outbound follow-up (Serra) | VIN-watcher immediate + 24h (gated) | wiring present, CommGate blocks send | unit + gate | 🟡 wiring-certified (gated) |
| P-14 | I | Columbia inbound + email | inbound webhook → plain email; NO sms-sales | notified:true (ford-of-columbia) | webhook resp | ✅ PASS |
| P-15 | I | Vapi inbound | end-of-call → thread + notify | thread + notify (resend, ADF) | webhook resp | ✅ PASS |
| P-16 | I | Tavus inbound | tavus event → video thread + notify | thread + notify (resend, ADF) | webhook resp | ✅ PASS |
| P-17 | I | Same agent across channels | Vapi + Tavus land same profile (serra-nissan) | consistent profile/notify | webhook resp | ✅ PASS |
| P-18 | I | Notification matrix + cooldown | repeat contact within 4h → deduped | via:cooldown on 2nd+ | webhook resp | ✅ PASS (live cooldown) |
| P-19 | I | Campaign engine | service campaign tick → deliveries → replies in Comms | delivered + reply thread | log | ☐ TODO |
| P-20 | I | Dashboard builder | build card from federated VIN/calls/sms | card renders real value | screenshot + api | ☐ TODO |
| P-21 | E2E | Inbox management | Comms: segment filter, take-over, reply | works per entity | screenshot | ☐ TODO |
| P-22 | E2E | Widgets + embed | widget live demo + embed snippet copy | renders + snippet | screenshot | ☐ TODO |
| P-23 | C | Widget public route | `/w/$slug` unauth renders configured mode | 200, correct mode | curl + screenshot | ☐ TODO |
| P-24 | SEC | Cross-profile isolation | profile A cannot read profile B data via API | 403 / empty | request log | ☐ TODO |
| P-25 | SEC | Customer-admin scoping | customer-admin cannot hit admin-only endpoints | 403 | request log | ☐ TODO |
| P-26 | SEC | No-backend-leak sweep | no env names/tokens/internal strings in customer UI | clean | grep + screenshot | ☐ TODO |
| P-27 | V | Per-entity branding | each storefront shows its accent/name | distinct | screenshot grid | ☐ TODO |
| P-28 | A11Y | Landing + login a11y | store-picker + login keyboard/labels | no critical violations | axe report | ☐ TODO |
| P-29 | DEPLOY | Container parity | all 6 profiles + new code live on test URL | /api/plugins + profiles ok | curl | ☐ TODO |
| P-30 | REVIEW | Devil's-advocate pass | reviewer subagent finds gaps, adds rows | zero open objections | review report | ☐ TODO |

## Known gaps (live, updated as discovered)
- Live provider round-trips (SMS/Vapi/Tavus) depend on creds + the operator's test numbers; where a live leg can't run, it is marked and converted to a cutover-ready checklist item rather than silently passed.
