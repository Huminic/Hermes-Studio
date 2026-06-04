# Nexxus → Studio FIT — Build Spec (segmented, executable)

**Status:** execution. Written 2026-06-03 after grounding + operator decisions.
**Supersedes the open-questions in** `NEXXUS_FIT_PLAN.md` **§6** (decisions now locked below).
**Principle (unchanged):** don't port Nexxus code; deliver the same OUTCOME on Hermes.
Agent + skill + wiki replaces code. All six screens present + functional. Screens-first.

---

## 0. Locked decisions (operator, 2026-06-03)

| # | Decision | Detail |
|---|---|---|
| D1 | **Broker token** | Studio uses the **`claude_nexxus-2.2`** central-mcp token (the live Nexxus token). Exposes `tm_send_message` + all `vin_*` + `vapi_create_call` + `tavus_create_conversation` + `resend_send_email`. **No SignalWire.** Token value is a SECRET — set via Coolify/profile `.env` `CENTRAL_MCP_TOKEN`, never committed. |
| D2 | **VIN scope** | **Read-only.** Monitor leads for outbound action. No write-back to VinSolutions. |
| D3 | **Reply brain** | **Hermes-first, `claude-sonnet-4-6` direct fallback.** Agent SOUL + channel persona (wiki) as system prompt. |
| D4 | **New-lead detection** | **Cron poll `vin_query_leads` + dedup vs the messaging-hub** (contacts/threads). No warehouse. |
| D5 | **Dealer notification format** | **Per-profile.** Serra = **ADF-XML**; Columbia = **plain email**. Config key `notifications.lead_format: adf-xml \| email` in `studio.yaml`. Reuse the AC.6.8 ADF emitter. |

---

## 1. Hard-won ground truth (do not relearn — verified against live code)

### 1.1 VIN two-step name resolution (THE peculiarity)
`vin_query_leads` returns leads whose `contact` field is a **URL href** (`…/contacts/id/{contactId}`) — **no name**.
1. `vin_query_leads { orgId, startDate, endDate, limit }` → lead items with `contact` href, `leadId`, `vehicleOfInterest`, `createdUtc`, phone.
2. Parse contactId: `href.match(/\/contacts\/id\/(\d+)/)`.
3. `vin_get_contact { orgId, contactId }` → real name/phone/email (dig `ContactInformation.Emails[]` prefer `Primary`, `Phones[]` prefer `Cell` then `Home`).
- **`orgId` = the Nexxus org UUID**, NOT the VIN dealerId. The broker maps UUID→dealerId internally (per profile; Nexxus used `NEXXUS_ORG_MAP` + the `integrations` table). **Per-profile orgId config is required** (gap — resolve in WS-1).
- **Rate cap**: Nexxus resolves ≤ **10 contacts per cycle** to avoid throttling. Replicate.
- VIN rows must NEVER persist into Brain — keep the existing redaction (store `{redacted, rows: count}`).

### 1.2 SMS send (the proven path)
- Tool **`tm_send_message { text, phones, from? }`** via central-mcp, Bearer = the `claude_nexxus-2.2` token.
- `phones` = E.164 (comma-sep for multiple). `from` optional: live Nexxus passes `integrations[0].smsCampaignNumber` for campaign sends; **trigger/greeting sends pass no `from`** (broker default sender). Studio shared mode: read optional `SMS_FROM` from profile env; omit if absent.
- Fail-closed allowlist (`PRELAUNCH_SMS_LOCK` + test recipients) sits immediately before the send so we can fire real test texts to the operator's phone only.

### 1.3 Voice / video
- `vapi_create_call { assistantId, customerNumber, phoneNumberId?, firstMessageOverride?, ... }`.
- `tavus_create_conversation { persona_id, callback_url, conversation_name?, custom_greeting? }`.
- Both via the same broker + token. One identity per agent: Caroline = Vapi assistant + Tavus persona + SMS; Nancy = Vapi + SMS.

### 1.4 Triggers (translate to an agent — static templates, not LLM)
- **Immediate**: lead synced <30 min, created <4 h, has phone; business-hours (org tz, 8–21) else queue **7am**; dedup **24h**; speaks as **dealership name**. Default OFF (opt-in). Template:
  `"Hi {firstName}, this is {dealer}. Thanks for your interest{ regarding your <vehicle>}. Is there a day or time that works for you to swing by? Happy to help line that up."`
- **24h check-in**: delay 1440 min ±30; business-hours only; dedup **48h**. Template:
  `"Hi {firstName}, this is {dealer}. We wanted to check in — are you being taken care of? Is there anything we can help with{ regarding your <vehicle>}?"`
- **Inbound AI reply** (the only LLM path): fires only on an **existing** convo (`!isNew`); new convos get the static `autoGreeting`. Honor human takeover (`assignedTo` — re-check right before send). Replicate per D3.

### 1.5 Token→tools matrix (why D1 is the only viable choice)
`claude_nexxus-2.2` = vin + textmagic + vapi + tavus + resend (+coolify/fal). **No token combines SignalWire with vin/vapi/tavus** → SignalWire was a dead end the moment VIN/Vapi/Tavus are in play.

---

## 2. Current Studio state (audit 2026-06-03) — real vs gap

| Surface | State | Work needed |
|---|---|---|
| Comms inbox (3-col, SSE, reply) | REAL | — |
| Campaigns worker + screen | REAL (honest simulated/sent) | template-var substitution (WS-5) |
| messaging-hub persistence | REAL (per-profile SQLite) | — |
| Chat | REAL | — |
| SMS dispatch | **SignalWire** | revert → `tm_send_message` (WS-0) |
| Autonomous two-way reply | **brain unplugged** (`noProviderCall`) | wire provider (WS-3) |
| VIN name resolution | **absent** (nameless leads) | two-step + rate cap (WS-1) |
| VIN-watcher (new-lead → text) | **does not exist** | build (WS-2) |
| Inbound call → email notify | partial | Vapi webhook → per-profile ADF/email (WS-4) |
| Dashboard data availability | partial | data sources + build function (WS-6) |
| dealer.com widget | old | single-ID config + minify (WS-7) |

---

## 3. Workstreams (segmented for isolated-worktree agents)

Each WS: one coding agent in an isolated worktree → a tester → an adversarial certifier.
Nothing is "done" without a **live artifact** (real text/email/call, or a real VIN name resolved).

### WS-0 — SMS revert + token wiring + doc correction  *(foundational, do first; touches `messaging-adapters.ts` alone)*
- Revert `messaging-adapters.ts:146-163`: shared SMS branch calls **`tm_send_message { text, phones, from? }`** (optional `SMS_FROM`), `via: 'sms-textmagic-shared'`. Keep the `own` TextMagic branch. Keep the email `from` fix.
- Update any test asserting `signalwire_send_sms` for the shared path.
- Correct `docs/launch/COMMS_CERTIFICATION_AND_GAPS.md` framing (SMS = tm_send_message via the Nexxus token; SignalWire was the wrong-token artifact).
- **Operator-action gate:** set `CENTRAL_MCP_TOKEN` = `claude_nexxus-2.2` value in Studio container + relevant profile `.env`. Agent stages + documents; operator activates the secret.
- Accept: `pnpm test` + `pnpm build` green; doc reflects reality.

### WS-1 — VIN safe-access two-step (name resolution)  *(unblocks WS-2 + WS-6)*
- A reusable VIN client/skill: `resolveLeadNames(profile, leads)` → `vin_query_leads` results enriched via `vin_get_contact` (parse href, ≤10/cycle).
- Per-profile `orgId` (Nexxus org UUID) config — resolve source (gap: confirm where each profile's UUID lives; operator may supply or it's in existing integration data).
- Wire into `federation-mcp-handlers.ts` (federated VIN search returns names), `customer-reports.ts` (lead funnel), and expose for WS-2.
- Keep Brain redaction (never persist VIN rows).
- Accept: a **real VIN lead resolved to a real name** through Studio (live artifact), names visible in a federated search + a report.

### WS-2 — VIN-watcher agent (immediate + 24h follow-up)  *(replaces `triggerService.ts`)*
- Hermes `/jobs` cron per profile: poll `vin_query_leads` (recent window) → resolve names (WS-1) → dedup vs messaging-hub contacts/threads → apply gates (synced/created windows, has-phone, business-hours-or-queue-7am, dedup 24h/48h, opt-in) → dispatch static-template text as the profile's **sales agent (Caroline)** via the comms-dispatcher → `tm_send_message`.
- 24h check-in cadence (second template).
- PRELAUNCH allowlist so test fires hit only the operator's phone.
- Accept: a **real follow-up text on the operator's phone** for a seeded/real recent lead, with the resolved first name + dealership name; dedup prevents a second send.

### WS-3 — Bi-directional reply brain (plug AC.5.8)  *(after WS-0 merges)*
- In app bootstrap call `setAutonomousReplyProvider(...)` with a Hermes-first / `claude-sonnet-4-6` direct fallback provider. Load agent SOUL + channel persona (`governance/agents/<agent>/personas/{textmagic,vapi,chat}.md`) + last N msgs, max 256, honor `assignedTo`, fire only on existing convos.
- Accept: a **real inbound SMS reply** answered by the agent (Caroline/Nancy) on the operator's phone; setting `assignedTo` pauses the agent.

### WS-4 — Inbound call → Vapi webhook → per-profile notification  *(ADF vs email)*
- Vapi end-of-call webhook receiver → email via `resend_send_email`. Per-profile `notifications.lead_format`: **Serra → ADF-XML** (reuse AC.6.8 emitter), **Columbia → plain email**.
- New-lead notification (from WS-2) honors the same per-profile format.
- Accept: a real inbound test call produces the right-format notification to the operator's inbox (ADF for Serra config, plain for Columbia config).

### WS-5 — Campaign template-var substitution + service-campaign polish
- `renderTemplate` substitutes vehicle/service/recall/dealer vars (currently only first/last name); fix `tags` filter no-op if cheap.
- Accept: a real service campaign send with vehicle/service vars populated (no blanks).

### WS-6 — Dashboard data availability  *(the "build-your-own-dashboard" requirement)*
- Ensure the Data screen's data sources work: federated VIN search (with names, WS-1), comms metrics (calls in, texts out, immediate + 24h follow-up performance, leads), campaign results. Per-profile DuckDB writer + Metabase per the data-canvas design. **Job: make the data available + the build function work** (operator builds the dashboards; we provide the substrate, and help build if time).
- Accept: each metric queryable for a profile; operator can assemble a tile from real data.

### WS-7 — dealer.com widget (single-ID config + minify)  *(independent; parallel with WS-0; first demoable win)*
- Minify `nexxus-widget.js`; config off a **single-ID URL param** (per operator + Thaddeus). Self-contained, live-demoable on dealer.com.
- Accept: widget loads live from a single-ID embed and round-trips a chat.

---

## 4. Sequencing

1. **Wave 1 (parallel, disjoint files):** WS-0 (SMS revert) + WS-7 (widget).
2. **Wave 2:** WS-1 (VIN names) → then WS-2 (watcher) + WS-3 (reply brain) + WS-4 (notify) once WS-0/WS-1 merge.
3. **Wave 3:** WS-5 (campaign vars) + WS-6 (dashboard data).
- Live proof on the operator's phone/inbox (412.654.6500 / neoweaver@gmail.com) before any "done."
- Operator-action gates surfaced, not papered over: token secret (WS-0), per-profile orgId (WS-1), provider keys.

## 5. Store → orgId → notification map (RESOLVED 2026-06-03)

All 5 stores are provisioned as production profiles. `vin.org_id` (studio.yaml)
per profile + `notifications.lead_format`:

| Store | profile slug | Nexxus org UUID (`vin.org_id`) | `lead_format` |
|---|---|---|---|
| Serra Honda | `serra-honda` | 24d64f99-ba04-4b43-af35-fd06f555ac86 | adf-xml |
| Serra Nissan | `serra-nissan` | 4a23d5ad-38ff-4016-8af5-f4cfc9fd88cd | adf-xml |
| Tony Serra Ford | `tony-serra-ford` | 2cbf687f-7cd5-480c-b81c-220cb632cd91 | adf-xml |
| Hyundai of Columbia | `hyundai-of-columbia` | f18cbf4e-bcbd-46fe-bf54-33bcee4afec8 | email |
| Ford of Columbia | `ford-of-columbia` | 6ae2548b-f6ec-4b1e-8d8b-ae565123f0df | email |

Columbia = 2 stores (Hyundai + Ford), both plain email. Serra group = ADF-XML
(assumption: covers all 3 Serra sales stores — confirm). Per-store login, no RBAC,
no store-switching (operator decision). Other VIN/integration/login data lives in the
Nexxus Supabase DB — pull from there when provisioning. See memory
`reference-store-org-uuid-map` + `project-per-store-login`.

## 6. Remaining open gaps (surface, don't guess)
- **Operator-action:** write `vin.org_id` + `notifications.lead_format` into each
  store's `studio.yaml` on the production volume (values above — agent can stage).
- `tm_send_message` `from` acceptance (broker schema showed no `from`; live Nexxus
  passes it) — verify on first live send.
- Which profiles get the watcher enabled (opt-in) for the first live test.
- Confirm ADF applies to all 3 Serra stores (not just Serra Honda).
