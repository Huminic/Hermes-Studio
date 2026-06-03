# Nexxus → Studio Migration Plan (no-stubs, flip-ready)

**Goal:** make the Nexxus migration ready to port customers — all nav working, custom
reports capable, all agents staged with wiki + brain.db + semantic guardians, comms
(inbound + outbound, 2-way conversations, service) working **as designed on the
current Nexxus**, all running through the new Studio, then flip `live.huminic.app`
to the new Studio login. No stubs. No assumptions.

Grounded in a read of the real Nexxus source (`~/Claude-store/nexxus2.2_replit`) and
the live Studio state (containers + volume), 2026-06-03.

---

## A. How Nexxus works today (the bar to hit)

- **Agents** are DB rows (`agents` table) per store, by `department` (sales/service/
  marketing), each with `channels[]`, `assignedPhone`, **`vapiAssistantId`**,
  **`tavusPersonaId`**, `instructions`, `autoGreeting`, `triggers`. Voice/video agents:
  Caroline (Serra Honda/sales), Magnolia (Serra Nissan/service), Georgia (Tony Serra
  Ford/sales), Elizabeth (Hyundai/marketing), Savannah (Ford of Columbia/service).
  Chat agents (all stores): **Data Guru** (VinSolutions CRM expert), **Nancy Gaston**
  (service knowledge), Sales Coach, Communication Writer, + marketing creatives.
  No agent-style "semantic guardian" — safety is deterministic guard modules.
- **Comms engine** (`server/outbound.ts`, `routes/sms.ts`, `routes/webhooks.ts`):
  - Inbound: SMS (TextMagic webhook), voice (Vapi end-of-call), video (Tavus),
    web widget, ADF lead email (emitted, not ingested). All land in
    `conversations`/`messages`.
  - **2-way autonomy:** inbound SMS → fire-and-forget Claude reply using the active
    agent's `instructions` + last 10 msgs; **pauses the instant `conversation.assignedTo`
    is set** (human takeover), re-checked before send; auto-greeting on first inbound;
    after-hours auto-response + queued morning follow-up; appointment-intent
    classification; **escalation** if unanswered >30 min (5-min cron).
  - **Proactive triggers** (15-min cron): after-hours external-lead follow-up, 24h
    lead check-in, immediate new-VIN-lead follow-up; plus per-agent multi-step
    `triggers` sequences.
  - **CommGate (safety, fail-closed)** before every send: global `OUTBOUND_LIVE_ENABLED`
    kill switch, per-org + per-channel enable flags, **TCPA business-hours window**
    (SMS/phone), campaign kill switch, **blacklist** (STOP), **rate limit** (100/24h/contact).
  - **Service** is `department:"service"` threaded through agents (Nancy/Magnolia/
    Savannah), campaigns, and `appointments` (created by Claude transcript analysis).
  - **Unified inbox = TeamBox** over conversations/messages; human reply sets
    `assignedTo` → pauses AI.
- **Reports** (`routes/insights.ts`, `metrics.ts`): hardcoded queries over a local
  warehouse (`warehouse_leads`, synced from VinSolutions). Lead funnel (hot-going-cold,
  no-contact, win rate, sources graded A–F, channel perf), pipeline tiles, comms
  volume, weekly executive email, daily recap, AI "hunches". Not a BI tool, not
  customer-buildable.
- **Integrations** via a central MCP proxy (`mcp.huminicdev.com`): `tm_send_message`,
  `resend_send_email`, `vapi_create_call`, `tavus_*`, `vin_query_leads`.
  **VinSolutions is the CRM system of record** (sync in; lead writes out via
  `vin-safe-mcp` :4003 prepare→execute→verify; ADF email fallback).

## B. Studio state today (REAL vs STUB)

| Dim | REAL | STUB / GAP |
|---|---|---|
| **Nav** | All admin routes; storefront chat/knowledge/tools/comms/campaigns | **Data tab = StubFrame**; assistant-pane static; widget-public voice/video/form deferred |
| **Agents** | 7 dealer profiles fully staged (8–9 SOULs: caroline, data-guru, nancy/service, sales-coach, …) + brain.db on every profile + paired `*-data-governor` + KSG/DSG **code** gates real | **huminic / serra-automotive / strukture = 0 agent SOULs; huminic-motors = 1**; brain `vectors/` empty (no embeddings); governor SOULs marked `status: stub` (integrity scanner missing, `GAP-KSG-SCANNER-001`); wiki is per-profile, not per-agent |
| **Comms** | Inbound webhooks (SMS/Vapi/ADF/email) → `maybeAutonomousReply`; **2-way engine real** (`agent_reply_jobs`+`thread_agent_subscriptions` SQLite, SOUL+persona, audit); outbound SMS/Vapi/email real (gated on creds) | **Tavus adapter = stub**; chat outbound = `simulated`; **no CommGate** (no kill switch / business-hours / blacklist / rate-limit); **no scheduler** (campaign tick + reply jobs fire only on manual button / inbound hit); `messaging-hub.db` on only 2 of 11 profiles; no escalation/proactive-trigger crons |
| **Reports** | `brain.db` substrate (brain-store/schema/readiness) | **Data renderer stub; no Metabase; no analytics.duckdb; data-canvas plugin scaffold-only**; none of the Nexxus Insights reports exist |
| **Flip switch** | portal-host logic (`portal-host.ts`, `PORTAL_HOST` env), branded `/p/$profile` login + PortalLogin shell | **`live.huminic.app` → Caddy → :5001 = LEGACY Nexxus**; Studio only on `127.0.0.1:8009`; Studio `PORTAL_HOST` empty. Needs Caddy upstream repoint + `PORTAL_HOST=live.huminic.app` + per-profile customer creds (via sysadmin; operator go) |

## C. Gap → phases (proposed)

- **P1 — Comms parity engine (the heart).** Build the missing safety + autonomy that
  Nexxus has: **CommGate** (kill switch, per-channel flags, TCPA business hours,
  blacklist, rate limit), **human-takeover pause** (assignedTo), auto-greeting,
  after-hours, appointment-intent, **escalation cron**, **proactive-trigger cron**,
  **campaign scheduler cron**; finish the **Tavus** adapter (no stub); provision
  `messaging-hub.db` on all profiles. Unit + live tests.
- **P2 — Agent staging.** Stage the missing agent rosters (huminic-motors thin;
  decide huminic/serra-automotive/strukture roles) with real SOULs mirroring the
  Nexxus department roster + provider IDs (vapi assistant / tavus persona / phone),
  per-agent wiki if chosen, brain + guardian per profile; flip governor SOULs off
  `status: stub` by shipping the integrity scanner.
- **P3 — Custom reports.** Replace the Data stub with real reports (lead funnel,
  comms volume, service metrics, pipeline) over Studio data — native React over
  brain.db/messaging-hub.db (matches Nexxus's hardcoded-query model) OR Metabase.
- **P4 — CRM (VinSolutions).** If in scope: replicate sync-in + lead-write (vin-safe-mcp)
  + warehouse so reports + Data Guru + triggers match Nexxus.
- **P5 — Flip the switch.** Caddy repoint `live.huminic.app` → Studio `:8009` +
  `PORTAL_HOST=live.huminic.app` + seed per-profile customer creds. Operator-gated,
  via `~/Claude-store/sysadmin/`, irreversible — explicit go.

## D. Open decisions (gate the build — must be locked, no assumptions)

1. **VinSolutions/CRM (P4):** in scope for the flip (full Nexxus data parity:
   reports + Data Guru + VIN-lead triggers depend on it) — or stand up standalone on
   the Studio Brain first and add VIN after? Biggest scope driver.
2. **Reports approach (P3):** native React dashboards over Studio data (fast, no infra,
   matches Nexxus) vs Metabase/data-canvas (heavier, self-serve).
3. **Parent/company profiles:** what are `huminic`, `serra-automotive`, `strukture`
   for? (serra-automotive = Serra group rollup parent? huminic = the company?
   strukture = a non-auto customer?) — determines whether they get dealer-style
   agent rosters or only rollup/consult.
4. **Flip mechanics (P5):** confirm `live.huminic.app` cutover is Caddy-upstream +
   `PORTAL_HOST` (no DNS change) and is operator-go, via sysadmin.

## E. Non-blocked foundation to start now (no decision needed)

- Build **CommGate** + **human-takeover pause** + **scheduler crons** (P1) — pure
  Studio code, replicating Nexxus's documented logic.
- Finish the **Tavus** adapter (P1).
- Provision **`messaging-hub.db`** on all customer profiles (P1).
- Ship the **integrity scanner** so governor SOULs are real, not `status: stub` (P2).

---

## F. PROGRESS + RESUME (2026-06-03) — autonomous mode, no stops

**Mode:** full autonomous /goal. Do NOT checkpoint/pause — build → test → commit →
keep going until the operator can turn the key on `live.huminic.app` and it works.
Test COPIES of hooks/integrations (non-destructive). Only the flip itself is the
operator's key-turn. See memory `feedback-nexxus-autonomous-nostop`.

**Branch:** `feat/nexxus-comms-engine` (off main; pushed). NOT merged/deployed — nothing
is live until merge→deploy. Commits so far:
- `1045cc95d` migration plan (this doc)
- `946152fff` **CommGate** — fail-closed outbound: global kill switch + per-profile/
  per-channel flags + TCPA business hours + blacklist + **live VIN DNC check** + rate
  limit; fronts dispatchOutbound; returns status:'blocked'. (studio.yaml `comms` block;
  src/server/comms-gate.ts, comms-blacklist.ts, central-mcp.ts) — 9 tests.
- `444bc9877` **human-takeover pause** — AI stops when a human claims a thread, re-checked
  before send (src/server/thread-takeover.ts; wired into maybeAutonomousReply) — 2 tests.
- `fedc0eb7f` **comms scheduler** — runDueWork(): campaign ticks + >30min escalation across
  all profiles; scripts/comms-cron.ts (cron runner, in-container) + startCommsScheduler()
  — 3 tests.
- Tavus adapter confirmed REAL (both shared+own make the real API call; "stub" was a stale
  comment). 553 vitest pass, build clean throughout.

**DONE (P1 core):** CommGate ✅, human-takeover ✅, scheduler ✅, Tavus ✅.

### Progress update 2026-06-03 (autonomous run, post-compaction)

Branch advanced to (latest first): `3c9a059c5` inbound-hooks integration test ·
`2b4eb04e9` P2 integrity scanner + governor SOULs active · `e5bfcb8fd` P4
federation→VIN live · `6deaf1e49` P3 native reports. **578 vitest pass, build
clean.** Now 9 commits ahead of main, pushed-pending.

- **P3 reports ✅** — `customer-reports.ts` (comms/threads/campaigns aggregates +
  live VIN lead funnel, unavailable-with-reason when no scope/unconfigured/bad
  shape — no fabricated numbers), `/api/customer/reports` (auth-gated),
  `CustomerDataRenderer` real, aggregate helpers in messaging-hub-store. 10 tests.
- **P4 federation→VIN ✅** — `federation_query` routes a VIN scope to central-mcp
  live (`dispatchVinScope`, picks vin_query_leads / vin_get_lead_statuses) ahead
  of MindsDB/shim; scope-enforcement unchanged; honest error (not shim) when VIN
  unconfigured. 4 tests (shim test repointed to non-VIN scope).
- **P2 integrity scanner ✅** — `scanWikiIntegrity` (broken links / orphans /
  missing frontmatter) + `integrity-scanner.ts` (severity + best-effort Brain
  memorialization) + `integrity-cron.ts`. All 7 `*-data-governor` SOULs flipped
  `status: stub → active`; companion SG playbook shipped. 5 tests. huminic-motors
  already staged thin on the volume (brain + agent `elliott` + governor profile).
- **Inbound-hooks integration test ✅** — drives the real `/api/messaging/inbound`
  route: chat round-trip, CommGate blocks regulated send in-hook, human-takeover
  pause, ADF lead-email ingestion. Mocked provider + gated outbound, no real
  recipients. 4 tests.
- **Operator hand-off docs ✅** — `docs/launch/GO_LIVE_OPS.md` (P1 ops runbook:
  provision messaging-hub.db via `scripts/provision-messaging-hub.ts`, wire
  comms+integrity crons, go-live env, volume governor-SOUL flip) +
  `docs/launch/FLIP_PACKAGE.md` (the operator key-turn: Caddy `live.huminic.app`
  upstream `:5001`→`:8009` + `PORTAL_HOST`, grounded in the live Caddyfile, with
  rollback).

**Live facts captured 2026-06-03:** `live.huminic.app` → host Caddy
(`/etc/caddy/Caddyfile`) → `:5001` legacy Nexxus. Studio at `127.0.0.1:8009`
(health 200). Only `huminic`+`serra-honda` have messaging-hub.db (9 lack one;
parents non-dealer so 8 dealers to provision). `OUTBOUND_LIVE_ENABLED` + studio
`PORTAL_HOST` empty (fail-closed, correct). huminic-motors-data-governor volume
SOUL still `status: stub` until the scanner code deploys (flip at deploy time).

**Independent review (general-purpose subagent, 2026-06-03):** ran vitest+build
(green) and verified 9 checks. Found ONE real locked-scope violation — finding #1:
`federation_query` persisted live VIN rows into the Brain `outputs` table (P4
routed VIN through the existing memorialization). **Fixed** in `3e999167f`: VIN
scopes now memorialize only a redacted `{rows: <count>}` summary, never the rows;
also closes finding #2 (admin scope-bypass) since VIN PII is never persisted on
any path. New test asserts no VIN PII in the Brain. Findings #3–#9 all GOOD
(scope enforcement intact, reports never fabricate, auth gating correct,
per-profile isolation, scanner real, integration test drives the real route).
**579 vitest pass** after fix.

**PR:** #47 (`feat/nexxus-comms-engine` → `main`) opened for the operator's merge.

**REMAINING (operator key-turns):** merge PR #47 → Coolify redeploy → verify
(operator) · run `GO_LIVE_OPS.md` · execute `FLIP_PACKAGE.md`. Agent does NOT push
main / deploy / flip.

**Original NEXT list (for reference — items 1–3,5 now done):**
1. **P3 reports (in progress when paused):** replace the `DataRenderer` StubFrame
   (src/lib/console-renderers.tsx) with a real dashboard. Data sources mapped:
   - comms volume → messaging-hub `messages` (direction/channel/created_at) — add exported
     aggregate helpers to messaging-hub-store.ts (getDb is private at line 116).
   - sales/service split → `threads.domain`; campaign deliveries → `campaign_deliveries`.
   - lead funnel → **live federated VIN** via callCentralMcpTool('vin_query_leads' /
     'vin_get_lead_statuses') when the profile has a vin federation scope; else mark
     unavailable. Build: src/server/customer-reports.ts (buildCustomerReports) +
     /api/customer/reports.ts (auth-gated) + real DataRenderer + tests. Flip menu.data:true
     per profile once real.
2. **P4 federation→VIN live wiring:** finish federation-mcp-handlers.ts so a declared VIN
   scope actually executes vin_query_leads live (today it validates the scope only).
3. **P2 agent staging + integrity scanner:** huminic-motors thin (1 SOUL); ship the integrity
   scanner so `*-data-governor` SOULs flip off `status: stub`. Parent profiles
   (huminic/serra-automotive/strukture) stay non-dealer (no roster) per operator.
4. **P1 ops (post-merge):** provision `messaging-hub.db` on the 9 profiles lacking one;
   wire the comms cron (host crontab or Hermes cron → scripts/comms-cron.ts every min);
   set OUTBOUND_LIVE_ENABLED + shared VAPI_ASSISTANT_ID/TAVUS_PERSONA_ID for go-live.
5. **Inbound hooks test (copies):** integration test the inbound webhook → 2-way reply →
   outbound (mocked providers) round-trip + service flow. No real-recipient sends.
6. **Merge → deploy → live verify** (operator publishes main pushes; agent triggers Coolify).
7. **P5 flip PACKAGE (operator turns the key):** Caddy upstream `live.huminic.app` :5001
   (legacy Nexxus) → Studio 127.0.0.1:8009 + `PORTAL_HOST=live.huminic.app` + per-profile
   creds, via ~/Claude-store/sysadmin/. Prepare it; the operator flips.

**Locked scope (operator-confirmed):** VIN = live-federated, NO sync; outbound checks hit
live VIN DB; Brain = Studio-native (meta/uploads/marketing), never VIN. Reports = native
over live federated VIN + Brain (no Metabase warehouse). Parent profiles non-dealer.

**Other branches awaiting merge (no redeploy needed):** `docs/launch-manuals` (corrected
manuals + sales/prescription guide + LAUNCH_CAPABILITY_MANIFEST + DECISIONS/issues/
VERIFICATION). main already has: channel_credentials, GAP-LIVE/VER fixes (deployed).
