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
