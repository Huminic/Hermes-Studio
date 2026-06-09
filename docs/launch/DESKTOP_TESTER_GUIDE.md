# Huminic Studio — Desktop Tester Guide

Welcome, and thank you for testing. This guide walks you through the whole system **one platform at a time**. Each platform starts with a short **"What you're looking at"** explanation so you understand the screen and what's happening behind it, then gives you exact steps and what a **PASS** looks like.

You don't need to be technical. Just follow along, and for every numbered check write **PASS** or **FAIL** and grab a **screenshot**.

---

## Before you start (read this once)

**What is Huminic Studio?** It's the new system that runs each car dealership's AI assistant — the chat bubble on their website, the AI that answers their phone, the video assistant, and the back-office where the dealership's staff manage it all. We are replacing an older system ("Nexxus") with this one, and you're confirming everything works before we go live.

**The golden rules:**
- Use a **fresh / incognito browser window** for each platform (so old logins/data don't interfere).
- **Never use real customer information.** Use made-up names and **your own** email + phone only.
- Every test lead (form, call-back, etc.) sends a notification email to **`duanekwells@gmail.com`** — keep that inbox open in a second tab. That inbox is how you confirm a lead "went through."
- The website to test is **https://studio.huminic.app**
- **Text messaging (SMS) is NOT part of this test** — it's a later release. If you notice SMS missing, that's expected, not a bug.

**The 6 stores you're testing:**

| Store | What it is | Login username | Password |
|---|---|---|---|
| Serra Honda | Sales | `serra-honda` | `De@ler$ucce$$2026` |
| Serra Service | Service dept. | `serra-service-admin@huminic.dev` | `De@ler$ucce$$2026` |
| Serra Nissan | Sales | `serra-nissan@huminic.app` | `De@ler$ucce$$2026` |
| Tony Serra Ford | Sales | `tony-serra-ford@huminic.app` | `De@ler$ucce$$2026` |
| Hyundai of Columbia | Sales | `hyundai-of-columbia@huminic.app` | `De@ler$ucce$$2026` |
| Ford of Columbia | Sales | `ford-of-columbia@huminic.app` | `De@ler$ucce$$2026` |

You only need the login for **Platform 6** (the staff back-office). Everything else is public — no login.

## Access model — three separate surfaces (important)

The system has **three distinct surfaces**. Keep them separate when testing:

| Surface | What it is | URL | Who gets in |
|---|---|---|---|
| **Storefront / Widgets** | Public shopper-facing launcher, embeds, standalone widget/contact pages | `/p/<store>` landing, `/widget/dealer/<store>.js`, `/w/<slug>` | Anyone (public) |
| **Workspace** | The dealer/staff profile-scoped console (manage AI, inbox, campaigns, etc.) | `/p/<store>/chat` (after login) | That store's **customer-admin** login only |
| **Global Huminic Studio** | The operator/admin back-end (all profiles, system ops). **Not** part of dealer testing. | **`https://studio.huminic.app/`** (root) — fallback `/dashboard` | **`is_admin` only** |

**Entry URLs:**
- **Global Huminic Studio login:** `https://studio.huminic.app/`  *(fallback/direct: `https://studio.huminic.app/dashboard`)*
- **Workspace logins (the stores you test):**
  - `https://studio.huminic.app/p/serra-honda/chat`
  - `https://studio.huminic.app/p/serra-nissan/chat`
  - `https://studio.huminic.app/p/tony-serra-ford/chat`
  - `https://studio.huminic.app/p/hyundai-of-columbia/chat`
  - `https://studio.huminic.app/p/ford-of-columbia/chat`
  - `https://studio.huminic.app/p/serra-service/chat`
- Optional store chooser (not the Studio root): `https://studio.huminic.app/stores`

**For this test you use the Storefront (no login) and the Workspace (the store logins in the table above).** The store logins are **Workspace-only** — they must **not** be able to reach Global Huminic Studio. If a store login lands you in an operator backend listing *many* stores/profiles, that's a security failure — record it. The Studio **root `/` is the operator login** (it redirects to the Studio dashboard); a store login that reaches `/` is sent on to its own `/p/<store>/chat`.

---

# PLATFORM 1 — The Website Chat Widget (what a car shopper sees)

### What you're looking at
This is the **storefront landing page** for each dealership. In the bottom-right corner there's a round **teal button** — the "widget." This is the AI front door for shoppers: one button that lets them chat, request a call-back, fill a form, or start a live video. Behind the scenes, clicking an option connects the shopper straight to that store's AI assistant (named **Caroline**) and quietly creates a sales lead for the dealership.

### What's being tested
The launcher button, the pop-up menu, and each of its **four** ways to connect — on **all five** sales storefronts.

### The pages (open each in incognito — no login)
- https://studio.huminic.app/p/serra-honda
- https://studio.huminic.app/p/serra-nissan
- https://studio.huminic.app/p/tony-serra-ford
- https://studio.huminic.app/p/hyundai-of-columbia
- https://studio.huminic.app/p/ford-of-columbia

### Steps (do these on EACH of the 5 pages)

**1.1 — The launcher.** When the page loads, a **teal circle** appears bottom-right. Click it. A panel slides up titled **"<Store Name> · Choose how to connect"** with four rows, each with a colored icon:
- 💬 **Web Chat** — "Chat with our AI assistant"
- 📞 **Instant Call Back** — "Get a call back now"
- ✈️ **Contact Form** — "Send us a message"
- 🎥 **Two-Way Video** — "Face-to-face with Caroline"

*PASS = the teal circle opens this exact four-option menu with the correct store name at the top.*

**1.2 — Web Chat.** Click **Web Chat**. A live chat opens inside the panel. Type *"Hi, what do you have?"* and send.
*What's happening:* you're talking to the store's real AI assistant. *PASS = you get a sensible, on-topic reply, and the footer says "Powered by Huminic."*

**1.3 — Contact Form.** Click the **back arrow (←)** at the top to return to the menu, then click **Contact Form**. Fill it with a fake name and **your own email**, then submit.
*What's happening:* this creates a sales lead and emails the dealership. *PASS = you see a success confirmation, AND a notification email arrives at `duanekwells@gmail.com`* (see Platform 5 for what it should look like).

**1.4 — Instant Call Back.** Back (←) → **Instant Call Back**. Enter a fake name and **your own phone number**, submit.
*What's happening:* the shopper is asking the store to call them. No text is sent to the phone — instead the dealership gets alerted to call back. *PASS = you see "We'll call you back shortly," AND a "Call-back request" email arrives at `duanekwells@gmail.com`.*

**1.5 — Two-Way Video.** Back (←) → **Two-Way Video**. The screen goes full-screen with "Connecting to video chat…", then a **live video assistant (Caroline)** appears. Allow **camera + microphone** when the browser asks. Say hello, then close with the **X**.
*What's happening:* this is a real, live AI video call. *PASS = the video session connects and you can see/hear the assistant. Then a video lead email arrives at `duanekwells@gmail.com`.*

**1.6 — Close behavior.** The back arrow (←) always returns to the menu; the **X** closes the widget entirely.

> Repeat 1.1–1.6 on all five storefronts. Take at least one screenshot of the open menu per store.

---

# PLATFORM 2 — The Embed on a Dealer's Own Website (the big one)

### What you're looking at
The exact same widget, but now proving it works **installed on a dealership's own website** (like dealer.com), not just on our pages. Real dealers add the widget to their site with **one line of code**. We've built a "pretend dealer website" page so you can see it work that way.

### What's being tested
That the self-hosted widget loads and fully works when embedded on an outside website — this is a **contractual requirement**, so it's important.

### Steps (no login)

**2.1 — Open the demo page:** **https://studio.huminic.app/dealer-widget-verification.html**
*What you're looking at:* a plain page that pretends to be a dealership's website. Across the top are buttons for each store.

**2.2 — Load a store.** Click a store button (e.g. **serra-honda**). Its **teal widget** appears bottom-right, exactly like Platform 1.

**2.3 — Run the full menu.** For each store button, repeat checks **1.1 through 1.5** (open menu, Web Chat, Contact Form, Instant Call Back, Two-Way Video). Everything must behave the same as on the real storefront.
*PASS = all four options work for all five stores from this outside page.*

**2.4 — The install snippet (reference only — you don't install anything).** Each store's widget is added to a real site with a single line like:
```
<script async src="https://studio.huminic.app/widget/dealer/serra-honda.js"></script>
```
(One per store: `serra-honda`, `serra-nissan`, `tony-serra-ford`, `hyundai-of-columbia`, `ford-of-columbia`.) You can open any of those `.js` links directly in the browser — it should be computer code, and (per the critical check below) must contain **no** vendor names.

---

# PLATFORM 3 — Standalone Widget Pages (direct links)

### What you're looking at
Besides the all-in-one launcher, each store has direct, full-page versions of its individual widgets. These are the pages the launcher opens inside its panel, but you can also visit them directly.

### What's being tested
That each individual chat and contact widget loads and works on its own (no login).

### Steps
Open each link (replace `<store>` with each slug: serra-honda, serra-nissan, tony-serra-ford, hyundai-of-columbia, ford-of-columbia; service dept uses `serra-service`):

- **3.1 Sales chat:** `https://studio.huminic.app/w/<store>-sales-chat` → a working chat opens. *(service: `/w/serra-service-chat`)*
- **3.2 Service chat:** `https://studio.huminic.app/w/<store>-service` → a working chat opens.
- **3.3 Contact form:** `https://studio.huminic.app/w/<store>-contact` → a real form (Name, Email, Phone, Message) — **not** a "coming soon" placeholder.

---

# PLATFORM 4 — The Phone (live AI voice line)

### What you're looking at
Each store has a real phone number answered by its AI assistant. When you call, the AI talks to you like a dealership rep and, afterward, creates a lead for the store.

### What's being tested
That each phone number connects to the right store's AI and produces a lead notification.

### Steps
**Call from your own phone only.** Call the number, have a short conversation with the AI (e.g. ask about a vehicle), then hang up. Confirm a notification email arrives at `duanekwells@gmail.com`.

| Store | Phone number |
|---|---|
| Serra Honda | **+1 901-203-8267** |
| Serra Service | **+1 901-436-1271** |
| Serra Nissan | **+1 256-862-3318** |
| Tony Serra Ford | **+1 256-459-9707** |
| Hyundai of Columbia | **+1 901-203-9398** |
| Ford of Columbia | **+1 931-369-2815** |

*PASS = the AI answers, holds a coherent conversation, and a lead email arrives afterward.*

---

# PLATFORM 5 — The Lead Inbox (email confirmation)

### What you're looking at
The inbox **`duanekwells@gmail.com`**. Every lead from a form, call-back, video, or phone call sends a notification email here. This is how you confirm a lead actually "went through" without needing to log in anywhere.

### What's being tested
That leads arrive, in the right format, with no vendor names.

### What to look for
- **5.1 — It arrived.** Each test from Platforms 1–4 should produce a matching email within a minute or two.
- **5.2 — Right format.** The **Serra** sales stores (serra-honda, serra-nissan, tony-serra-ford) send a structured **ADF/XML** lead (looks like code/XML — that's correct; it's the format dealership systems read). The **Columbia** stores (hyundai-of-columbia, ford-of-columbia) and **Serra Service** send a plain, readable email.
- **5.3 — Clean wording.** The "Source" / lead type should read like a normal channel — **"Phone call," "Web form," "Video call," "Call-back request"** — and the subject like **"New lead — …"**. See the critical check below.

---

# PLATFORM 6 — The Workspace (dealership staff console)

### What you're looking at
This is the **Workspace** — the dealer/staff console for a single store, at `/p/<store>/*`. It's the dealership's own working area (manage the AI, knowledge, widgets, reports, the inbox of conversations, campaigns). It is **profile-scoped**: a store login only ever sees its **own** store. **This is the only part that needs a login** (from the table at the top).

> **Not** the same as **Global Huminic Studio** (the operator/admin backend across all stores). A store/Workspace login must **never** reach Global Studio. Verify this in **S2** below — a Workspace login that reaches an operator backend listing many stores is a **security failure**.

### What's being tested
That each store's staff console loads correctly and shows that store's own data — including the leads you created in earlier platforms.

### Steps (log in at `https://studio.huminic.app/p/<store>/` with the username + password from the table)
> Tip: login is **rate-limited**. If you get "too many attempts," wait ~60 seconds.

**6.1 — Tabs + header.** After login you see tabs: **Agents, Knowledge, Widgets, Data, Teambox, Campaigns, Notifications**, and the store's name in the header.

**6.2 — Agents.** The roster is correct (sales stores show **Caroline, CRM Guru, Nancy Gaston, Semantic Guardian**; Serra Service shows **Nancy** as the default, no Caroline). Pick the default agent and send "Hi, what do you have?" → coherent reply.

**6.3 — Knowledge.** The store's knowledge pages load with no error messages or strange file paths.

**6.4 — Widgets.** At least one widget shows **"ready"** with a live preview and a copy-able install snippet.

**6.5 — Data.** A dashboard loads with **live numbers** (serra-honda has hundreds of leads). It should never show an error or all-zeros. In the "Build your own dashboard" metric list, the options read **Calls / Video / Leads** (plain words — no vendor names in parentheses).

**6.6 — Teambox (the inbox).** Conversations are split into **Sales** and **Service**. The leads you created earlier (your fake "Contact Form" / "Call-back" tests) should appear here in the correct segment. This is the "did my lead land?" confirmation inside the app.

**6.7 — Campaigns.** The page loads (service templates + upload).

**6.8 — Notifications.** A routing table renders (who gets alerted, and when).

> Do 6.1–6.8 for each store. One screenshot per store.

---

# ⭐⭐ CRITICAL CHECK — No vendor names anywhere (applies to every platform)

### What you're looking at / why
Behind the scenes the system uses third-party technology providers, but a **customer or dealer must never see those names**. This is a hard requirement — finding any of them is an automatic **FAIL**, so keep an eye out the whole time.

**These words must NOT appear anywhere a person can see** (widgets, chat, the video screen, the embed code, the emails, or the admin screens):
`vapi`, `tavus`, `textmagic`, `vinsolutions` / "vin solutions", `signalwire`, `resend`.

- The video option must say **"Two-Way Video" / "Face-to-face with Caroline"** — never a vendor name.
- Lead "Source" must read a normal channel ("Phone call," "Web form," "Video call") — never a vendor.
- Email subjects must read "New lead — …" / "New voice lead — …" — never "Vapi lead" / "Tavus lead."

**If you ever see one of these words, screenshot it and note exactly where. That's a hard fail.**

---

# Security spot-checks

- **S1 — Bad login.** A wrong password shows "Invalid credentials." An unknown username shows the **same** message (it must not reveal which part was wrong).
- **S2 — Wrong store.** While logged into one store, try opening another store's page (e.g. `/p/serra-nissan/comms` while logged in as serra-honda). You should hit a **login wall**, not see the other store's data.
- **S3 — No technical leakage.** You should never see server file paths (like `/root/...`), internal setting names, long secret keys, or raw error/crash text.
- **S4 — Global Studio boundary (important).** While logged in with a **store (Workspace) credential**, try to open the operator backend directly — `https://studio.huminic.app/dashboard` (and `/profiles`). You must **not** reach an operator console listing many stores: you should be **redirected to your own `/p/<store>/chat`** (or shown a "no Global Studio access" message). A Workspace login that reaches the global operator backend or a multi-store list is a **security failure** — record it. (Only `is_admin` operator accounts may reach Global Huminic Studio.)

---

# Your results sheet

| ID | Platform / Check | Store(s) | PASS/FAIL | Screenshot | Notes |
|----|------------------|----------|-----------|------------|-------|
| 1.1–1.6 | Website chat widget | each of 5 | | | |
| 2.1–2.4 | Embed on dealer.com page | each of 5 | | | |
| 3.1–3.3 | Standalone widget pages | each | | | |
| 4 | Phone (AI voice) | each of 6 | | | |
| 5.1–5.3 | Lead emails arrive + format | per test | | | |
| 6.1–6.8 | Store admin console | each (login) | | | |
| ⭐ | NO vendor names | everywhere | | | |
| S1 | Bad-login message | — | | | |
| S2 | Wrong-store block | — | | | |
| S3 | No technical leakage | — | | | |

**Not in scope (do not test, not a failure):** SMS / text messaging — separate later release.

---

### A few things that are intentional (so you don't flag them)
- The widget button is **teal on every store** by design (it's not the store's brand color).
- **Two-Way Video** is the same assistant (**Caroline**) on all five stores by design.
- If a video call says "temporarily unavailable," retry once; if it keeps happening, note the store + time.
- Everything currently points at the **test site** (`studio.huminic.app`) and **test inbox** (`duanekwells@gmail.com`). The live website and the real dealership inboxes get switched on at final go-live.
