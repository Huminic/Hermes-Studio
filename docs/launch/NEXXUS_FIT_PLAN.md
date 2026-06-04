# Nexxus → Studio: FIT plan (not a port) — working state

**Status:** planning / pre-execution. Written 2026-06-03 for compaction handoff.
This is the source of truth to resume from. Read it first.

## 0. Operating principle (the reframe — do not violate)

> "This is how it's done on the current Nexxus — how do we use what we built
> (Hermes agents + the new platform) to deliver the same **outcome**?"

- **Do NOT port Nexxus code 1:1.** That would be a disaster. We **dumb it down to
  the most important functions** and **fit them onto Hermes.**
- **Code that did the work in Nexxus → becomes a Hermes AGENT + SKILL/PLUGIN +
  WIKI** where it makes sense. "Translating code to a wiki." The agent does what
  the `triggerService.ts`/`sms.ts` code did.
- **Screens first, work backwards.** Always have something to show. The demo is
  the operator logging into Studio, walking the screens remotely, editing wiki
  entries in the backend.
- **Minimal scope.** We do NOT need: user chat, complex Insights, most Nexxus
  enhancements. We DO need: the screens below + their functionality.
- **One identity per agent across channels.** Caroline (sales) = Vapi assistant +
  Tavus persona + the VIN-watcher that texts new leads + the bi-di SMS responder.
  Nancy Gaston (service) = Vapi + SMS (no Tavus).

## 1. The functions we must deliver (need / don't need)

**NEED (the whole job):**
1. **Inbound call → Vapi → webhook → email.** (Vapi already does the call; we need
   the webhook receiver in Studio + the email-on-call-end.)
2. **New sales lead → text.** An agent **watches VinSolutions activity via federated
   search**; on a new lead, sends a follow-up **text** as Caroline. (Replaces
   Nexxus `triggerService.ts` immediate-trigger CODE with an AGENT + skills.)
3. **24h follow-up text.** Same watcher agent, check-in cadence.
4. **Bi-directional text (sales + service).** A skill / plugin handles a customer
   REPLYING to an outgoing text → routes to the right agent (Caroline/Nancy) →
   AI reply. (Replaces Nexxus `sms.ts` AI-reply CODE.)
5. **Service campaigns** — a screen to build + send a service campaign.
6. **Sales follow-ups** — covered by 2/3/4.
7. **Dashboard tool** — a quick dashboard pulling metrics from each provider /
   the data-brain store / the CRM via **federated search**. (Calls in, texts out,
   follow-up performance, leads.)
8. **Wiki editing in the backend** (admin edits agent instructions) — assumed done
   via the admin Files screen; CONFIRM.

**DON'T NEED:** user-facing chat, complex Insights, weekly/daily exec emails,
hunches, the full Nexxus dashboard suite, ADF inbound (Nexxus has none anyway).

## 2. Existing assets to leverage (already built — do not rebuild)

- **Vapi + Tavus agents already configured** (Caroline sales: vapiAssistantId
  `90a876c0-…`, tavusPersonaId `p9eb007721f4`; Nancy Gaston service: in Vapi only).
  These transfer over — we reuse the IDs, we don't recreate.
- **Federated search** (federation-mcp / `federation-client` skill) — set up.
- **Skill scaffolds that map to the flows** (under
  `docs/consulting_package/.../scaffold/skills/`): `federation-client` (watch VIN),
  `comms-dispatcher` (send), `campaign-executor` (service campaigns),
  `dashboard-binder` + `report-generator` (dashboard), `renewal-cadence-monitor` /
  `drift-observer` (watcher cadence), `mcp-federation`.
- **Studio screens already deployed**: storefront 6-page IA, Campaigns page,
  Comms page, Knowledge/wiki editing, admin `/files`, `/agents`, `/jobs` (cron).
- **`docs/feature-map.md`** — surface inventory (as of 2026-05-29; may be stale).

## 3. Ground truth that constrains the build (from reading nexxus2.2_replit)

**Provider wiring (THE correction — keep TextMagic/Vapi/Tavus, revert SignalWire):**
- SMS in Nexxus = MCP JSON-RPC `tools/call` → `tm_send_message {text, phones, from?}`
  at `https://mcp.huminicdev.com/dax/mcp`, **Bearer `VINSOLUTIONS_API_KEY`**. That
  token exposes tm_send_message/vapi/tavus/vin; the token Studio was given does
  NOT. **FIX = give Studio the right token, NOT a new provider. REVERT the
  SignalWire re-point (commit 448c7deec) + the SignalWire framing in
  COMMS_CERTIFICATION_AND_GAPS.md.**
- One Bearer key (`VINSOLUTIONS_API_KEY`) authenticates SMS+Vapi+Tavus+VIN. The app
  never calls TextMagic's REST API directly; the MCP is the credential boundary.
- Sender number: campaign sends use `integrations[0].smsCampaignNumber`; trigger/
  greeting sends pass NO `from` (MCP default sender). Dev default `18338096836`.

**Inbound webhooks (Nexxus):**
- `POST /api/webhooks/textmagic` (form-encoded; secret `x-textmagic-secret` optional),
  `POST /api/webhooks/vapi` (end-of-call; secret effectively open), `POST
  /api/webhooks/tavus` (calls back `tavus_get_conversation` for transcript).
- **Webhook URLs are registered in the Vapi + TextMagic DASHBOARDS, not in code** →
  moving host = manual dashboard re-point. **Tavus callback is HARDCODED to
  `https://live.huminic.app/api/webhooks/tavus`** in `server/routes/public.ts:494`
  + `server/routes/widgets.ts:61` (one spot uses `APP_BASE_URL`).
- Org resolution: SMS by receiver TextMagic number; Vapi by `agent.vapiAssistantId ==
  call.assistantId`; Tavus by `agent.tavusPersonaId == persona_id`. No cross-tenant leak.

**Follow-up logic (to translate into an agent, NOT copy):**
- New leads enter Nexxus via **VIN delta sync → warehouse** (15-min). We use
  **federated (no sync)** → the watcher agent queries federated VIN for new leads.
- Immediate trigger: lead synced <30min, created <4h, has phone; **static template**
  "Hi {firstName}, this is {dealer}. Thanks for your interest{ in <vehicle>}. Is
  there a day/time that works to swing by?"; business-hours (8–21 org tz) else
  queue 7am; dedup 24h; speaks as DEALERSHIP name (not agent). Default OFF (opt-in).
- 24h check-in: delay 1440min ±30, **static template** "…checking in, are you being
  taken care of?…"; business-hours only; dedup 48h; **no real reply-check** (OPEN).
- Inbound SMS AI reply (the ONLY LLM path): fires only on an EXISTING convo
  (`!isNew`), agent = first active `type:ai` sms/voice agent, `agent.instructions`
  as system prompt, last 10 msgs, claude-sonnet-4-6 max 256, re-checks `assignedTo`
  before send. New convos get the static `autoGreeting` instead.
- Human takeover = `conversations.assignedTo` set via `PATCH /api/conversations/:id`;
  AI checks it 3× (entry + before send). No claim endpoint.
- Appointment intent: SMS → admin email only (no row); voice/video (>15s) → creates
  `appointments` row + leadScore.

**Safety (replicate the safe-test pattern):**
- `OUTBOUND_LIVE_ENABLED` global + per-org/channel gates + TCPA business hours +
  blacklist (STOP) + 24h rate limit (100). PLUS a **pre-launch allowlist**
  (`PRELAUNCH_SMS_LOCK` + test-recipients file, fail-closed) — currently ON in live
  Nexxus. **We replicate this so we can fire real test texts to the operator's phone
  only, safely.** (Studio's CommGate already mirrors most of this; add the allowlist.)

## 4. Translation map (Nexxus code → Studio fit)

| Nexxus (code) | Studio (fit) |
|---|---|
| `triggerService.ts` immediate + 24h triggers | A **VIN-watcher agent** (federation-client skill, cron via `/jobs`) that queries federated VIN, applies the guards, and calls a **comms-dispatcher skill** to send the templated text as Caroline |
| `sms.ts` inbound AI reply + auto-greeting | A **bi-di SMS skill/plugin**: inbound webhook → resolve agent (Caroline/Nancy) → reply via agent instructions (wiki) → send |
| `webhooks.ts` Vapi end-of-call → email | Studio Vapi webhook receiver → email skill (Resend via MCP) |
| `insights.ts`/`metrics.ts` reports | **Quick dashboard** (Metabase over federated + data-brain, per operator) — calls-in (conversations.channel='voice'), texts-out (outbound log), follow-up performance, leads |
| campaign code | **Campaigns screen** + campaign-executor skill |
| agent instructions in DB | **wiki pages** the agent reads (editable in backend) |

## 5. Execution model (orchestrator + operator-as-translator)

- **Operator** = domain translator: for each Nexxus function, states the OUTCOME +
  how it should work on the new platform. Supervises. Sets priority.
- **Me (orchestrator)** = segment into workstreams, write a precise sub-spec per
  workstream, dispatch isolated coding agents (separate git worktrees so no
  collisions), run a tester + an adversarial certifier, integrate, report. Nothing
  is "done" without a **live artifact**.
- **Screens-first**: build/confirm the screens before the backends so there's always
  a demo.
- **First parallel track**: ONE agent on the **dealer.com widget** (minify
  `nexxus-widget.js` + domain-or-single-ID config per Thaddeus's email) — safe,
  self-contained, live-demoable — while the rest is being spec'd.

## 6. Open questions for the operator (resume the conversation here)

1. **Token:** OK to wire Studio's broker token to `VINSOLUTIONS_API_KEY` (or its
   value) so tm_send_message/vapi/tavus/vin work? (This is the real comms fix.)
2. **Dashboard:** stand up **Metabase** over federated + data-brain (operator's
   pick), confirmed. What are the exact tiles? (calls in, texts out, immediate+24h
   follow-up performance, leads, service-campaign results?)
3. **Screens priority** to build/confirm first (service campaigns? dashboard?
   comms/bi-di? webhook?).
4. **Widget:** put one agent on it now (yes per operator) — domain-keyed config or
   single-ID URL param? (Thaddeus offered both.)
5. **Webhook host:** new system will live at `live.huminic.app` (post-flip) — so the
   Tavus hardcoded URL stays valid; Vapi/TextMagic dashboards re-point to the new
   backend when we cut over. Confirm host plan.

## 7. Immediate next steps (post-compaction)

1. Finish grounding: reports/Insights truth + widget truth (2 read-only agents were
   about to launch — relaunch if their findings aren't captured).
2. With operator, lock the screens list + priority + the dashboard tiles.
3. Revert the SignalWire re-point; re-point comms to tm_send_message via the right token.
4. Spin the widget workstream (1 agent, worktree) for a live demo win.
5. Author the per-workstream sub-specs; then dispatch the build team.

## 8. Do NOT lose (decisions/corrections this session)
- Comms layer was mock-tested only; ZERO live sends. Email PROVEN live via resend.
  SMS reaches the broker but Studio's token lacks the comms tools → use VINSOLUTIONS_API_KEY token.
- SignalWire detour was WRONG (queried broker with wrong token). Revert it.
- /api/files now requires admin (good), email `from` added (good), VIN DNC fail-closed (good),
  campaign simulated≠sent (good) — these stay.
- All 10 stores have customer-admin logins (no single default pw). Login URL `/p/<profile>`.
- Nothing is live/deployed; live Nexxus + Serra untouched. Branch feat/nexxus-comms-engine @ 8bdc6cc7d (PR #47).
