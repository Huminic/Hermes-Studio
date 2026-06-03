# Huminic Studio — Launch Capability Manifest

A manifest of **user stories** as *capability* (what works now) → *possibility* (what
it unlocks), per persona, plus the **Nexxus-customer readiness** picture. Synthesised
from the six operating manuals and the live verification done at launch
(`studio.huminic.app`, 2026-06-02). This is the "what can I do now" reference.

## Status legend

- 🟢 **LIVE** — verified working on the live deploy now.
- 🟡 **READY — needs one operator action** (a credential, env var, or provisioning step). The code path is live; it returns `unconfigured`/empty until the action is taken.
- ⚪ **POST-LAUNCH** — deliberately deferred (documented in `issues.md`); the surface exists but the capability is not built yet.

---

## Part A — Studio admin / operator (you)

| # | User story (capability → possibility) | Status | Where |
|---|----------------------------------------|--------|-------|
| A1 | As operator I log in with my profile credentials → I get the full Studio with all admin screens. | 🟢 | `/` (duane) |
| A2 | I switch the active profile → the chat + gateway run as that profile's brain. | 🟢 | `/profiles` → Activate |
| A3 | I chat with any active profile's agent and get real AI replies → I can drive the consultative agent or any org agent interactively. | 🟢 | `/chat` (gpt-4.1 via gateway) |
| A4 | I browse/edit a profile's wiki and the KSG gate enforces protected trees → I can curate knowledge safely. | 🟢 | `/files` |
| A5 | I see every customer's consultative stage + readiness gates + deployment notes → I know what's blocking each engagement. | 🟢 | `/engagements` + detail |
| A6 | I see the full agent library (8 built-in + 85 profile SOULs) → I can pick/inspect any org or governor agent. | 🟢 | `/agents` |
| A7 | I see loaded plugins (customer-console, messaging-hub, data-canvas) + manifest issues → I can confirm the platform wiring. | 🟢 | `/plugins` |
| A8 | I issue/revoke MCP tokens → I can grant scoped tool access (rotation = issue new + revoke old). | 🟢 | `/mcp-tokens` |
| A9 | I provision a brand-new customer storefront from the CLI → I can onboard a dealer end-to-end. | 🟢 | `npx tsx scripts/provision-launch-profiles.ts --slug …` (in-container) |
| A10 | I create a storefront login for a customer → they can sign into `/p/<slug>/`. | 🟢 | `scripts/create-user.ts --customer-admin` |
| A11 | I approve a readiness gate with my real name → the engagement advances (no self-approval). | 🟢 | engagement panel / `POST /api/customer/engagement-state` |
| A12 | I deploy governor SOULs + port the operating manuals into every profile wiki → agents read their own processes. | 🟢 | `deploy-phase8-souls.sh`, `port-manuals-to-wiki.sh` |
| A13 | I choose, per profile, whether each channel uses shared (united) or its own credentials → tenants can graduate to their own provider accounts. | 🟢 (default shared) | `studio.yaml channel_credentials` |
| A14 | I redeploy the platform from `main` via Coolify → fixes go live. | 🟢 | Coolify deploy (you publish `main`) |

---

## Part B — Huminic salesperson (analyze a prospect)

| # | User story | Status | Notes |
|---|------------|--------|-------|
| B1 | As a salesperson I activate the consultative agent and ask it to ORIENT on a prospect → I get an industry brief, likely data sources, and discovery questions in minutes. | 🟢 | interactive chat; quality scales with input detail |
| B2 | I iterate ("what disqualifies them?", "fastest first win?") → I build a qualification picture as a persisted record. | 🟢 | chat thread persists |
| B3 | I hand a committed prospect to the project team → they seed an engagement at `draft` and I track it. | 🟢 | `/engagements` |
| B4 | A dedicated "analyze a prospect" wizard with saved prospect cards. | ⚪ | today it's chat + the engagements tracker |

*Guide: `huminic-sales-and-prescription-guide.md` (Persona 1).*

---

## Part C — Huminic project team (create the prescription)

| # | User story | Status | Notes |
|---|------------|--------|-------|
| C1 | I drive the consultative agent through the six phases (orient→audit→design→author→validate→package) → it authors the six prescription artifacts into the customer's `canon/`. | 🟢 | interactive; human relays real inputs |
| C2 | I watch the engagement flip stages as phases complete → I always know where we are. | 🟢 | `/engagements/<customer>` |
| C3 | I approve the five readiness gates (`ready_to_blueprint`, `ready_to_instantiate_runtime`, `ready_to_publish_mcp_projections`, `ready_to_hand_off_externally`, `topology_decided`) → the package is hand-off-ready. | 🟢 | real approver, auditable |
| C4 | At `ready_to_run` I hand to provisioning → the live customer storefront is created. | 🟢 | `provision-launch-profiles.ts --slug` |
| C5 | A fully autonomous prescription run (no human relay). | ⚪ | the operator-path is interactive by design |

*Guide: `huminic-sales-and-prescription-guide.md` (Persona 2) + `consulting-human-operator-guide.md`.*

---

## Part D — Customer-admin (the dealer, at `/p/<slug>/`)

| # | User story | Status | Notes |
|---|------------|--------|-------|
| D1 | I sign into my branded storefront → I see my 6-tab console. | 🟢 | per-profile branding from `studio.yaml` |
| D2 | I pick one of my agents and chat → I get real AI replies grounded in my SOUL. | 🟢 | persists into Comms as `channel: chat` |
| D3 | I read/edit my wiki within governed bounds; the KSG gate blocks canon/governance → I curate knowledge safely. | 🟢 | block 422 / allow 200 verified |
| D4 | I see my widget embeds, copy the snippet, and a public visitor uses my widget without logging in. | 🟢 | `/w/<slug>` (chat mode) |
| D5 | I open a unified Sales/Service inbox and read threads across channels → one place for all conversations. | 🟢 (UI) | threads populate as channels are wired |
| D6 | I reply to an inbound message on SMS/voice/video/email → the right adapter dispatches it. | 🟡 | needs channel creds (shared or own) + a recipient |
| D7 | I build an audience and schedule a Service campaign → deliveries land and replies come back to Comms. | 🟡 | send needs channel creds; builder + worker are live |
| D8 | I open the Data tab and self-serve dashboards. | ⚪ | data-canvas / Metabase is post-launch (tile dimmed) |
| D9 | Inbound ADF lead emails are parsed into Sales threads with vehicle/contact extracted. | 🟢 (engine) | lands once the dealer's inbound email is pointed in |
| D10 | A subscribed agent replies autonomously per rules (business hours, max turns). | 🟢 (engine) | enable per thread; needs the channel wired |

*Guide: `customer-admin-guide.md`.*

---

## Part E — Huminic rollup operator (company-level view across children)

| # | User story | Status | Notes |
|---|------------|--------|-------|
| E1 | I authorize a child profile for rollup (child `studio.yaml` declares `rollup:huminic` + I hold an admin/wildcard MCP token) → I can read across it. | 🟢 | two-part grant |
| E2 | I run `mcp_rollup_query` (structured: table/where/aggregate across child Brains) → I get a company rollup; every query is audited. | 🟢 | reads child Brain (incl. comms_log) |
| E3 | A child without the grant is denied (`cross-profile-write-denied`) → isolation holds. | 🟢 | verified by design |
| E4 | A rollup dashboard UI. | ⚪ | query works via MCP; no UI yet |

*Guide: `huminic-rollup-operator-guide.md`.*

---

## Part F — Nexxus customers: what we can do (readiness)

The Huminic customer cluster **replaces the Nexxus customer-facing surface**. Each
Nexxus dealer becomes a profile with a branded storefront. The Serra cluster is
already provisioned: `serra-automotive`, `serra-honda`, `serra-nissan`,
`serra-service`, `tony-serra-ford`, `ford-of-columbia`, `hyundai-of-columbia`,
`huminic-motors` — plus `huminic`, `strukture`, `cedar-ridge-automotive`.

**Ready now for a Nexxus customer (🟢):**
- A branded storefront at `/p/<slug>/` with login (provision the dealer's user).
- AI chat with their agent(s), grounded in their SOUL + wiki.
- Governed knowledge editing (KSG) — their playbooks/processes as living wiki.
- A unified Sales/Service inbox surface + Service campaign builder.
- ADF inbound lead parsing (the Serra lead-email format) into Sales threads.
- Agent-autonomous two-way reply engine (rules-gated).
- Per-profile choice of shared (united) vs own channel credentials.

**One operator action away (🟡):**
- Live channel round-trips (SMS/voice/video): set the shared `VAPI_ASSISTANT_ID` /
  `TAVUS_PERSONA_ID` (SMS shared works as-is via central-mcp), or put the dealer's
  own creds in their `.env` and set that channel to `own`. Then exercise with a
  test recipient.
- Outbound email + customer-admin password reset: per-profile Resend/central-mcp token.
- Each dealer's storefront login: `create-user.ts --customer-admin`.

**Stays in Nexxus / post-launch (⚪):**
- The Nexxus data warehouse → Data Brain migration is operator-owned; the Data tab
  (Metabase dashboards) is post-launch.
- Nexxus's old metrics dashboards are intentionally dropped in favor of the
  user-buildable data surface (post-launch).

*Guide: `nexxus-migration-customer-guide.md` (IA mapping, where old data lives, cutover sequence, what stays).*

---

## Part G — Operator action checklist (flip 🟡 → 🟢)

1. **Shared channel ids** (for shared Vapi/Tavus sends): set `VAPI_ASSISTANT_ID`,
   optional `VAPI_PHONE_NUMBER_ID`, and `TAVUS_PERSONA_ID` as shared env in Coolify.
   (Shared SMS already routes via central-mcp `tm_send_message`.)
2. **Per-customer credentials** (only if a tenant uses *own* creds): put
   `TEXTMAGIC_*` / `VAPI_API_KEY` / `TAVUS_*` in that profile's `.env` and set the
   channel to `own` in its `studio.yaml`.
3. **Outbound email / password reset**: provision the per-profile Resend token via
   central-mcp (`docs/system-services-resend.md`).
4. **Onboard a dealer**: `provision-launch-profiles.ts --slug <slug> --brand … --customer-admin-username … --customer-admin-password …`, then hand them `/p/<slug>/`.
5. **Point inbound email** (ADF leads) at the dealer's intake so threads populate.
6. **Go-live test**: with a test phone/email, send one outbound per channel and
   confirm it lands + the reply returns to Comms.

## Part H — Not in scope yet (⚪, see `issues.md`)

Data dashboards (Metabase), logout button, multi-user-per-profile invites,
concurrent-edit detection, rollup dashboard UI, a fully autonomous (no-relay)
consultative run, sales campaigns (Service-only by decision).
