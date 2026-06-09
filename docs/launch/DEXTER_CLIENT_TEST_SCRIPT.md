# Client-Side Test & Validation Script — for Dexter (non-SMS go-live)

Goal: independently validate the 6-store system from a **real browser + real phone**, the way a dealer would. Record PASS/FAIL + a screenshot for each step. **No real customer data** — only synthetic data + your own email/phone.

**Scope of THIS test = non-SMS parity.** SMS is a separate later feature run — do **not** test SMS. The **unified storefront widget** (the floating "Choose how to connect" launcher, section G) is now live; its **Two-Way Video** is live on **serra-honda** only — on the other stores the video option is intentionally off (pending per-store video-agent mapping) so it will not appear there. Don't fail a store for not showing the video option.

## Setup
- Browser **incognito / fresh profile** (fresh localStorage).
- Target host: **https://studio.huminic.app**
- Logins (all 6): username `<store>-admin@huminic.dev`, password `HuminicLaunch2026`.
  Stores: serra-honda, serra-service, serra-nissan, tony-serra-ford, hyundai-of-columbia, ford-of-columbia.
- ⚠️ Login **rate-limits** (HTTP 429) — space the 6 logins ~60s apart.
- **Lead notifications during this test go to `duanekwells@gmail.com`.** Keep that inbox open — you'll confirm leads arrive there. (Final config will use each store's real BDC list + the per-store storefront users.)

## A. Store-picker landing
1. Open `https://studio.huminic.app/` → expect "Choose your store to sign in", 6 branded cards (accent stripe + SALES/SERVICE badge), explainer, tap-to-call link. No password box here.
2. Click a card → store-branded login form.

## B. Per-store storefront walk (all 6)
Card → sign in → confirm:
1. **Left nav** tabs: Agents, Knowledge, Widgets, Data, Teambox, Campaigns, Notifications.
2. **Header** shows the store name.
3. **Agents:** correct roster (sales stores: Caroline, CRM Guru, Nancy Gaston, Semantic Guardian; serra-service: Nancy default, CRM Guru, Semantic Guardian — no Caroline). Pick the default agent, send "Hi, what do you have?" → expect a coherent reply.
4. **Knowledge:** wiki tree loads, no raw server paths/errors.
5. **Widgets:** ≥1 widget "ready" with a live preview + copy-able embed snippet.
6. **Data:** dashboard loads; **lead funnel shows live numbers** (serra-honda has hundreds of leads with real statuses — ACTIVE_NEW_LEAD etc.). Not 0, not an error.
7. **Teambox:** Sales/Service segments + channel filters render.
8. **Campaigns:** loads (service templates + CSV upload).
9. **Notifications:** routing table renders.
- One screenshot per store.

## C. INBOUND lead paths — verify the lead LANDS *and* the email ARRIVES
### C1 — Web form (every store with a form widget; serra-* have `…-contact`)
- Open the form widget, e.g. `https://studio.huminic.app/w/serra-honda-contact` → expect a real form (Name*, Email*, Phone, Message*) with the store brand — **not** a "coming soon" stub.
- Submit synthetic data (name "Dexter Test", **your own** email, message "interested in a Civic") → expect the inline ✓ success.
- **C1a (lead landed):** log into that store → **Teambox** → confirm the "Dexter Test" thread appears in the right segment (sales-domain widget → Sales; service → Service).
- **C1b (email arrived):** confirm a notification email lands at **duanekwells@gmail.com** — Serra **sales** stores = **ADF-XML** (XML attachment/body), Service + Columbia = **plain email**.

### C2 — Voice (real phone call; voice is LIVE on the store numbers)
Call the store's voice line, have a short chat with the AI, hang up → expect a **voice thread** in that store's Teambox + a notification email at duanekwells@gmail.com.
| Store | Voice number |
|---|---|
| serra-honda | +1 901-203-8267 |
| serra-service | +1 901-436-1271 |
| serra-nissan | +1 256-862-3318 |
| tony-serra-ford | +1 256-459-9707 |
| hyundai-of-columbia | +1 901-203-9398 |
| ford-of-columbia | +1 931-369-2815 |

(These are live AI lines — calling them is a real call answered by the store's assistant. Use your own phone only.)

## D. ⭐ No third-party vendor names — CRITICAL (operator requirement)
Nowhere a dealer/customer can see may a tech-vendor name appear. Check the **notification emails** (subject + body + ADF) AND the **UI** (Teambox thread subjects, message detail, Data page, widgets):
- **MUST NOT appear anywhere visible:** `vapi`, `tavus`, `textmagic`, `vinsolutions` / "vin solutions", `signalwire`, `resend`.
- Lead "Source" should read a channel ("Phone call", "Video call", "Web form") — **not** a vendor.
- Email subjects should read like "New voice lead — …" / "New lead — …" — **not** "Vapi lead" / "Tavus lead".
- Report ANY vendor name you see (where + screenshot). This is a hard fail if found.

## E. Negative / security checks
1. **Bad login:** wrong password → "Invalid credentials"; unknown username → the *same* message (no enumeration).
2. **Cross-store:** logged in as serra-service, browse to `/p/serra-honda/comms` → login gate, not serra-honda's data.
3. **No backend leakage:** no server file paths (`/root/...`), env var names, tokens, or raw stack traces anywhere.

## F. Public widget render
- `https://studio.huminic.app/w/serra-honda-sales-chat` and `/w/serra-service-chat` → chat widget renders (no login).

## G. ⭐ Unified storefront widget (the "Choose how to connect" launcher)
This is the floating circle on the **public storefront landing** (no login). It is the most important migrated widget.
1. Open `https://studio.huminic.app/p/serra-honda` (fresh/incognito, **no login**). Expect a **teal circle** bottom-right.
2. Click it → a panel opens: header **"Serra Honda" / "Choose how to connect"** + 4 rows with colored icons:
   - **Web Chat** — "Chat with our AI assistant"
   - **Instant Call Back** — "Get a call back now"
   - **Contact Form** — "Send us a message"
   - **Two-Way Video** — "Face-to-face with Caroline"
3. **G1 — Web Chat:** click → chat opens in the panel; send "Hi" → coherent reply (Caroline).
4. **G2 — Contact Form:** click → the contact form loads in the panel; submit synthetic data (your own email) → success. Then confirm the lead in Teambox (Sales) + an email at **duanekwells@gmail.com**.
5. **G3 — Instant Call Back:** click → name + phone form; submit (name "Dexter Test", **your own** phone) → "We'll call you back shortly." Confirm a **Call-back request** thread in Teambox (Sales) + an email at duanekwells@gmail.com. (No SMS is sent — this just alerts the store to call back.)
6. **G4 — Two-Way Video (serra-honda only):** click → fullscreen "Connecting to video chat…" then a **live video session with Caroline** (allow camera/mic). Talk briefly, then close (X). Confirm a **video thread** lands in Teambox + an email at duanekwells@gmail.com. On the other 5 stores the video row is intentionally absent.
7. **G5 — back/close:** the back arrow returns to the menu; the X closes the launcher.
8. **G6 — vendor names:** nowhere in the widget (header, options, video screen) may `tavus`/`vapi`/`textmagic` appear. "Two-Way Video" + "Face-to-face with Caroline" only. Hard fail if a vendor name shows.

## Record results
| ID | Check | Store | PASS/FAIL | Screenshot | Notes |
|----|-------|-------|-----------|------------|-------|
| A1 | store picker | — | | | |
| B-* | full walk (×6) | each | | | |
| C1 | web-form lead → Teambox + email | per store | | | |
| C2 | voice call → thread + email | per store | | | |
| D | NO vendor names (emails + UI) | all | | | |
| E1 | bad login | — | | | |
| E2 | cross-store block | — | | | |
| E3 | no backend leakage | — | | | |
| F | public widget render | — | | | |
| G1 | unified widget · Web Chat | serra-honda | | | |
| G2 | unified widget · Contact Form → lead+email | serra-honda | | | |
| G3 | unified widget · Instant Call Back → lead+email | serra-honda | | | |
| G4 | unified widget · Two-Way Video (live Caroline) | serra-honda | | | |
| G5 | unified widget · back/close | serra-honda | | | |
| G6 | unified widget · NO vendor names | serra-honda | | | |

**Deferred (do NOT test / not failures):** SMS (separate feature run). Two-Way Video on the **non-serra-honda** stores (video row intentionally off until each store's video agent is mapped).
**Note:** the live Nexxus app is scheduled to be shut down before the final acceptance test; voice/lead traffic then flows only to Studio.
