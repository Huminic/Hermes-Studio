# Huminic Studio Launch Requirements Audit

Generated: 2026-06-09 20:13 ET
Updated: 2026-06-10 15:00 ET
Target: `https://studio.huminic.app`
Product runtime verified through: `29399b7b150fb93e06d07cf175c984cf4e213dc0`
Latest evidence: `work/launch-cert/evidence/workflow-dry-run/launch-workflow-dry-run-20260610115538.json`
Tester: Codex / Dexter

## Certification Verdict

**Not yet a final launch certification.**

The tested app is substantially launch-ready across public widgets, embeds, standalone pages, lead routing, Workspace admin, Global Studio boundary, security checks, public agent guardrails, and the clarified Two-Way Video handoff. **As of 2026-06-10, LC-MAJOR-013 and LC-MAJOR-014 are CLOSED.** Remaining open gates:

1. `LC-MAJOR-012` — Voice webhook shared-secret hardening: Studio server route can process synthetic webhooks; server-side secret gate exists; deployed secret is unset; live provider wiring/header behavior is UNVERIFIED without provider access. Recommend operator-owned post-launch hardening with documented steps, or explicit acceptance as monitored launch risk.
2. Platform 4 — webhook lead chain is verified across all six stores; live conversational phone behavior still needs final demo or explicit acceptance.
3. `LC-MAJOR-007` — Partner/group admin remains a product decision; Claude recommends Option A (six per-store Workspace logins) for launch.
4. Sales campaign scope wording — migration guide states service campaigns are in launch scope, sales campaigns are not; confirm this matches promise.
5. Final collaborative Chrome walkthrough with Duane must be completed before marking certification done.

No waiver has been submitted by the tester.

## Requirements Crosswalk

| Guide Area | Required Coverage | Current Result | Evidence | Launch Impact |
|---|---|---|---|---|
| Baseline / static checks | `studio.huminic.app` only, HTTPS, root/admin route, `/stores` chooser, no accidental `live.huminic.app` testing, public source vendor scan | PASS | `security/root-entrypoint-boundary-retest-2026-06-09.json`; `current-regression-d975cc130/summary.md`; `security/root-headers-post-d975cc130.txt`; `security/root-body-post-d975cc130.txt`; `security/stores-body-post-d975cc130.txt` | No open launch risk from root/chooser/static public surfaces. |
| Access model | Global Huminic Studio, Workspace, and Storefront terminology separated and route model documented | PASS | `platform6/p6-workspace-terminology-guide-d975cc130.md`; `platform6/p6-workspace-terminology-ford-retest-final-d0d1e4619.json`; `current-regression-d975cc130/summary.md` | Terminology and route model are clean after `LC-MINOR-010`. |
| Platform 1 - Website Chat Widget | Five sales store `/p/<store>` public widget hosts; launcher, four-option menu, Web Chat, Contact Form, Callback, Two-Way Video, close/back, branding, layout, vendor scan | PASS after clarified video requirement and `f15380955` direct room handoff | `platform1/p1-robust-nonvideo-results.json`; prior video evidence in `platform1/`; current retest `work/launch-cert/evidence/retest-f15380955/video-session-ford-retry.json`; `video-room-removed-retry-body.txt`; `ford-entry-retry.html`; `browser-video-smoke/result.json` | Video wrapper overbuild removed; browser click path inserts direct Video chat iframe. Final walkthrough should inspect room UX with Duane. |
| Platform 2 - Dealer Embed | `dealer-widget-verification.html` across five stores; dealer install JS snippets; launcher/chat/form/callback/video; no vendor names in self-hosted widget/dropdown/install JS | PASS after clarified video requirement and `f15380955` direct room handoff | `platform2/p2-nonvideo-results.json`; `platform2/p2-serra-honda-controls-retest.json`; prior `platform2/p2-video-retest-results.json`; current retest `work/launch-cert/evidence/retest-f15380955/dealer-ford-of-columbia-retry.js`; `dealer-verification.html` | Self-hosted Dealer.com widget/install JS is clean; video room URL may show after shopper chooses Video. |
| Platform 3 - Standalone Widget Pages | Sales and service standalone chat/contact routes; coherent replies, real forms, no placeholders, no vendor leakage | PASS WITH ACCEPTED OBSERVATION | `platform3/p3-summary.json`; per-route `platform3/p3-*.json`; `platform3/p3-serra-service-service-headers.txt` | Required routes passed. `serra-service-service` 404 accepted as non-blocking because documented service route is `serra-service-chat`. |
| Platform 4 - Phone | Six live AI voice lines, correct store/assistant, coherent call, lead email, Teambox lead, no vendor leakage | PARTIAL PASS / RECLASSIFIED: webhook→lead→email mapping verified for all six; live conversation demo pending | `platform4/p4-phone-test-plan.json`; Claude 2026-06-09 webhook sweep; finding `LC-BLOCKER-011`; hardening finding `LC-MAJOR-012` | Not a known phone defect. Final walkthrough should include live/agent-call-agent demo or operator acceptance of webhook validation. |
| Platform 5 - Lead Inbox | Gmail lead arrival, ADF/XML for Serra sales, plain readable email for Columbia + Serra Service, Huminic/dealer-safe branding | PASS | `platform5/p5-gmail-post-forwarder-verification.json`; `platform5/p5-teambox-post-forwarder-check.json`; `platform5/p5-email-brand-retest-2026-06-09.json`; `platform5/p5-post-forwarder-lead-submissions-20260609-224810-contact.json` | Lead routing and email branding are launch-clean after `LC-MAJOR-005`. |
| Platform 6 - Store Workspace | Six store Workspaces; login, Agents, Knowledge, Widgets, Data, Teambox, Campaigns, Notifications, roster/default agent, Teambox segmentation, no raw errors/vendor leakage | PASS | `platform6/p6-admin-summary.json`; per-store `platform6/p6-*-admin-full.json`; `platform6/p6-*-teambox-scan.json` | Store-scoped Workspace launch path is verified for all six stores. |
| Global Studio / root | Global Huminic Studio at root/dashboard; store users confined to Workspace; super-admin can access global APIs | PASS for current binary role model | `security/global-admin-access-probe.json`; `security/root-entrypoint-boundary-retest-2026-06-09.json`; `security/security-spot-checks.json` | Super-admin/store-admin boundary is launch-clean. Partner/group admin remains product-scope, not an active leakage defect. |
| Security checks | Bad login, unknown user, wrong-store block, direct-tab URL, raw-error leakage, global API boundary | PASS | `security/security-spot-checks.json`; `security/global-admin-access-probe.json`; `security/root-entrypoint-boundary-retest-2026-06-09.json` | Security spot checks passed after `LC-BLOCKER-006`. |
| Critical vendor-name check | No visible `vapi`, `tavus`, `textmagic`, `vinsolutions`, `vin solutions`, `signalwire`, `resend` in dealer/customer-facing text, admin UI, emails, widget copy, or public install snippets | PASS under clarified requirement | `platform6/p6-agent-eval-retest-post-364bb598c-cert-summary.json`; `platform6/p6-post-364bb598c-public-source-vendor-scan.json`; `current-regression-d975cc130/summary.md`; `work/launch-cert/evidence/retest-f15380955/*` | Grey-label Tavus room URL after choosing Video is accepted by clarified requirement; no current customer/dealer-facing text leak known. |
| Agent eval battery | Greeting, inventory/help, appointment/service intent, unsafe/off-topic, vendor-name bait across default public agents | PASS | `platform6/p6-agent-eval-retest-post-364bb598c-cert-summary.json`; `platform6/p6-agent-shared-handler-spot-check-post-364bb598c.json`; per-agent `platform6/p6-agent-eval-*.json` | Public agent guardrail is launch-clean after `LC-BLOCKER-008`; `LC-OBS-009` is addressed. |
| Manuals / handoff docs | Nexxus migration guide, customer-admin guide, tester guide reflect live product behavior | PASS (2026-06-10) | `docs/launch/manuals/nexxus-migration-customer-guide.md` commit `29399b7b1`; finding `LC-MAJOR-013` | Data tab claims updated to reflect live dashboards + builder. 7-tab IA with correct labels. No stale "Data disabled" or old "six-page" wording remains. |
| Platform 6 Workspace Widgets / Storefront config | Contact form widgets treated as live, not coming-soon | PASS (2026-06-10) | `src/components/customer-console/tools-widget-renderer.tsx` commit `29399b7b1`; live profile volume contact widget markdown updated with timestamped backups; finding `LC-MAJOR-014` | Contact form widgets marked live in component; stale "coming-soon" text replaced in five profile volume markdown files. Widget snippet paths point at current Huminic-hosted location. |
| Partner/group admin | Durran/Cage multi-store ownership or safe launch alternative | OPEN DECISION | `context/current-context-checkpoint.md`; `LAUNCH_DECISION_PACKET.md`; finding `LC-MAJOR-007` | Safe launch can use six per-store Workspace logins. One-login multi-store ownership requires scoped Partner/Admin RBAC. Do not provision Durran as `is_admin:true` under current binary auth. |

## Open Gate Actions

### `LC-MAJOR-012` — Voice Webhook Secret

**Evidence boundary clarified 2026-06-10:**
- Studio server route proven via prior synthetic webhook sweep (all six stores).
- Server-side shared-secret auth code exists and is correct.
- Deployed `VAPI_WEBHOOK_SECRET` is unset.
- Live provider configuration state is UNVERIFIED (cannot verify without `VAPI_PRIVATE_KEY`).
- No-secret/with-secret webhook proof cannot be produced without operator credentials and provider coordination.

Decision required:
- Complete hardening via operator-owned setup (documented steps in `HUMINIC_LAUNCH_STATUS_2026-06-10.md` / `LAUNCH_OPEN_DECISIONS_2026-06-10.md`); or
- Accept unauthenticated webhook acceptance as a monitored post-launch hardening item.

### Platform 4 — Live Phone Conversation Demo

Decision required:

- Run a live/agent-call-agent spot demo during final walkthrough; or
- Explicitly accept synthetic webhook validation as sufficient for tonight.

### `LC-MAJOR-007` — Partner/Admin

Decision required:

- Option A: launch with six per-store Workspace logins and track scoped RBAC post-launch. Claude recommends this for tonight.
- Option B: build scoped Partner/Admin RBAC before launch.

## Current Launch Position

If `LC-MAJOR-012` is fixed or accepted, Platform 4 live demo/acceptance is completed, `LC-MAJOR-007` is accepted as Option A or built as Option B, and the collaborative Chrome walkthrough passes, the remaining documented evidence supports launch certification with no known unresolved blocker in tested surfaces.
