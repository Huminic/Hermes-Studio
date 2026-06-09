# Huminic Studio — Desktop Tester Guide (EVERYTHING)

**What this is:** the complete, self-contained test script for the Huminic Studio go-live. Work top to bottom. For every numbered step, record **PASS / FAIL** and take a **screenshot**. If anything looks wrong, note exactly what and where.

**Golden rules**
- Use a **fresh / incognito browser window** (clean cookies + storage) for each major section.
- **No real customer data, ever.** Use only synthetic names + **your own** email and phone.
- All test **lead notifications go to `duanekwells@gmail.com`** — keep that inbox open in another tab.
- Host under test: **https://studio.huminic.app**
- **SMS is OUT of scope** (separate later release). Do not test SMS; its absence is not a failure.

---

## 0. Scope at a glance

You are testing 6 store profiles:

| Store | Type | Lead format |
|---|---|---|
| Serra Honda (`serra-honda`) | Sales | ADF-XML |
| Serra Service (`serra-service`) | Service | Email |
| Serra Nissan (`serra-nissan`) | Sales | ADF-XML |
| Tony Serra Ford (`tony-serra-ford`) | Sales | ADF-XML |
| Hyundai of Columbia (`hyundai-of-columbia`) | Sales | Email |
| Ford of Columbia (`ford-of-columbia`) | Sales | Email |

You will test: the **unified storefront widget** + its **self-hosted dealer.com embed** (the priority), the individual chat/contact widgets, inbound leads by **web form** and **phone**, the **no-vendor-names** rule, the **logged-in admin walk**, and **security** checks.

---

## 1. Logins (needed only for Part F — the admin walk)

Parts A–E and G need **no login**. Part F (the in-store admin tabs) needs these per-store logins:

| Store | Username | Password |
|---|---|---|
| serra-honda | `serra-honda` | **ask Duane** |
| serra-service | `serra-service-admin@huminic.dev` | **ask Duane** |
| serra-nissan | `serra-nissan@huminic.app` | **ask Duane** |
| tony-serra-ford | `tony-serra-ford@huminic.app` | **ask Duane** |
| hyundai-of-columbia | `hyundai-of-columbia@huminic.app` | **ask Duane** |
| ford-of-columbia | `ford-of-columbia@huminic.app` | **ask Duane** |

> ⚠️ **Passwords are not in this document** — Duane will give them to you. (The usernames above are confirmed correct.) Log in at `https://studio.huminic.app/p/<store-slug>/`. Login is **rate-limited** — if you see "too many attempts" (HTTP 429), wait ~60 seconds between tries.

---

## A. ⭐ Unified storefront widget (the priority — no login)

The floating round **teal button** in the bottom-right of each store's public landing page.

**Landing pages:**
- https://studio.huminic.app/p/serra-honda
- https://studio.huminic.app/p/serra-nissan
- https://studio.huminic.app/p/tony-serra-ford
- https://studio.huminic.app/p/hyundai-of-columbia
- https://studio.huminic.app/p/ford-of-columbia

For **each** store, open the landing page (incognito) and:

1. **A1** — A **teal circle** appears bottom-right. Click it → a panel opens titled **"<Store Name> · Choose how to connect"** with four rows:
   - **Web Chat** — "Chat with our AI assistant"
   - **Instant Call Back** — "Get a call back now"
   - **Contact Form** — "Send us a message"
   - **Two-Way Video** — "Face-to-face with Caroline"
2. **A2 — Web Chat:** click → a live chat opens inside the panel. Type "Hi, what do you have?" → you get a coherent reply from Caroline. Footer says **"Powered by Huminic"**.
3. **A3 — Contact Form:** use the back arrow (←) to return to the menu, click **Contact Form** → the form loads in the panel. Submit synthetic data with **your own email** → success message. Then check `duanekwells@gmail.com` for the lead email (Serra stores = an **XML/ADF** lead; Columbia = a plain email).
4. **A4 — Instant Call Back:** back → **Instant Call Back** → enter a name + **your own phone** → submit → "We'll call you back shortly." Then check `duanekwells@gmail.com` for a **"Call-back request"** notification. (No text message is sent — this just alerts the store to call you.)
5. **A5 — Two-Way Video:** back → **Two-Way Video** → a fullscreen "Connecting to video chat…" then a **live face-to-face video session** (allow camera + microphone when prompted). Speak briefly, then close with the **X**.
6. **A6 — Close/back:** the back arrow returns to the menu; the **X** closes the launcher.

**Do A1–A6 on all 5 storefronts.** Record one screenshot of the open menu per store.

---

## B. ⭐ Self-hosted dealer.com embed (the contractual deliverable — no login)

This proves the same widget works **embedded on the dealer's own website** via one script tag.

1. **B1** — Open **https://studio.huminic.app/dealer-widget-verification.html** (this page pretends to be a dealer.com site). Click each store button across the top — its teal launcher appears bottom-right.
2. **B2** — For each store, repeat the A1–A6 checks (menu, Web Chat, Contact Form, Instant Call Back, Two-Way Video). Everything must behave identically to Part A.
3. **B3 — view source:** right-click the page → View Page Source (or open the script URL directly, e.g. `https://studio.huminic.app/widget/dealer/serra-honda.js`). It must contain **no** third-party vendor names (see Part E). 

**The one-tag embed snippet per store** (this is what goes on a real dealer.com site — for reference, you don't need to install it):
```
<script async src="https://studio.huminic.app/widget/dealer/serra-honda.js"></script>
<script async src="https://studio.huminic.app/widget/dealer/serra-nissan.js"></script>
<script async src="https://studio.huminic.app/widget/dealer/tony-serra-ford.js"></script>
<script async src="https://studio.huminic.app/widget/dealer/hyundai-of-columbia.js"></script>
<script async src="https://studio.huminic.app/widget/dealer/ford-of-columbia.js"></script>
```

---

## C. Individual public widgets (no login)

Each store also exposes standalone widget pages. Open each (incognito) and confirm it renders (no login, no error):

- Sales chat: `https://studio.huminic.app/w/<store>-sales-chat` (service store: `/w/serra-service-chat`)
- Service chat: `https://studio.huminic.app/w/<store>-service`
- Contact form: `https://studio.huminic.app/w/<store>-contact`

(Replace `<store>` with each slug.) **C1** — each chat widget shows a working chat; **C2** — each contact widget shows a real form (Name, Email, Phone, Message), **not** a "coming soon" stub.

---

## D. Inbound leads — form + phone (confirm the lead AND the email)

### D1 — Web form
For at least serra-honda + one Columbia store: open `/w/<store>-contact`, submit synthetic data (your own email, message "interested in a Civic") → inline ✓ success. Then confirm a notification email lands at **`duanekwells@gmail.com`** — Serra stores = **ADF-XML** (XML), Columbia = **plain email**.

### D2 — Phone (these are LIVE AI phone lines — call from your own phone only)
Call the store's number, have a short chat with the AI, hang up. Confirm a notification email arrives at `duanekwells@gmail.com`.

| Store | Voice number |
|---|---|
| Serra Honda | **+1 901-203-8267** |
| Serra Service | **+1 901-436-1271** |
| Serra Nissan | **+1 256-862-3318** |
| Tony Serra Ford | **+1 256-459-9707** |
| Hyundai of Columbia | **+1 901-203-9398** |
| Ford of Columbia | **+1 931-369-2815** |

---

## E. ⭐⭐ NO third-party vendor names (CRITICAL — hard fail if found)

Nowhere a customer or dealer can see may a technology-vendor name appear. Check **every** surface you touched (widget menus, chat, the video screen, the embed page source, the notification **emails** — subject + body + any XML, and the in-store screens in Part F).

- **MUST NOT appear anywhere visible:** `vapi`, `tavus`, `textmagic`, `vinsolutions` / "vin solutions", `signalwire`, `resend`.
- The video option must read **"Two-Way Video" / "Face-to-face with Caroline"** — never a vendor name.
- Lead "Source" should read a channel ("Phone call", "Web form", "Video call") — never a vendor.
- Email subjects should read like "New lead — …" / "New voice lead — …" — never "Vapi lead" / "Tavus lead".
- **Report any vendor name you see, with a screenshot + where.** This is a hard fail.

---

## F. In-store admin walk (needs the Part 1 logins)

Log in at `https://studio.huminic.app/p/<store>/` for each store and confirm:

1. **F1 — Left nav tabs:** Agents, Knowledge, Widgets, Data, Teambox, Campaigns, Notifications. Header shows the store name.
2. **F2 — Agents:** correct roster (sales stores: Caroline, CRM Guru, Nancy Gaston, Semantic Guardian; serra-service: Nancy default, no Caroline). Pick the default agent, send "Hi, what do you have?" → coherent reply.
3. **F3 — Knowledge:** the wiki tree loads, no raw server paths or errors.
4. **F4 — Widgets:** at least one widget shows "ready" with a live preview + a copy-able embed snippet.
5. **F5 — Data:** the dashboard loads; the **lead funnel shows live numbers** (serra-honda has hundreds of leads with real statuses) — not 0, not an error. The "Build your own dashboard" metric list reads **Calls / Video / Leads** (no vendor names in parentheses).
6. **F6 — Teambox:** Sales / Service segments + channel filters render. Your Part-A/D test leads (e.g. "Dexter Test") appear here in the right segment.
7. **F7 — Campaigns:** loads (service templates + upload).
8. **F8 — Notifications:** the routing table renders.

One screenshot per store.

---

## G. Security / negative checks (no login needed for most)

1. **G1 — Bad login:** wrong password → "Invalid credentials". Unknown username → the **same** message (no hint about which was wrong).
2. **G2 — Cross-store block:** logged in as one store, browse to another store's tab URL (e.g. `/p/serra-nissan/comms` while logged in as serra-honda) → you get a login gate, **not** the other store's data.
3. **G3 — No backend leakage:** nowhere should you see server file paths (`/root/...`), environment-variable names, tokens, or raw error stack traces.

---

## Record your results

| ID | Check | Store(s) | PASS/FAIL | Screenshot | Notes |
|----|-------|----------|-----------|------------|-------|
| A1–A6 | Unified widget (5 storefronts) | each of 5 | | | |
| B1–B3 | Self-hosted embed (dealer.com page) | each of 5 | | | |
| C1–C2 | Individual public widgets | each | | | |
| D1 | Web-form lead → email arrives | per store | | | |
| D2 | Phone call → email arrives | per store | | | |
| E | **NO vendor names** (all surfaces) | all | | | |
| F1–F8 | In-store admin walk | each (login) | | | |
| G1 | Bad login message | — | | | |
| G2 | Cross-store block | — | | | |
| G3 | No backend leakage | — | | | |

**Deferred — do NOT test, not a failure:** SMS / text messaging (separate later release).

---

## Notes for the tester
- The **teal** color of the widget is intentional and the same on every store (it is not the store's brand color).
- **Two-Way Video** is the same agent (**Caroline**) on all five stores by design.
- If a video call says "temporarily unavailable," retry once; if it persists, note the store + time.
- The system is still pointed at the **test host** (`studio.huminic.app`) and test inbox (`duanekwells@gmail.com`). Real dealer inboxes + the live domain are switched on at final cutover.
