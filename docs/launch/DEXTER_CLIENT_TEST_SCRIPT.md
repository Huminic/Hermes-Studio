# Client-Side Test & Validation Script — for Dexter

Goal: independently validate the 6-entity system from a **real browser**, the way a dealer user would. You are verifying Claude's claims (catalog: `docs/launch/PYRAMID_E2E_CATALOG.md`). Record PASS/FAIL + a screenshot for each step. **No customer contact** — only the synthetic data below.

## Setup
- Browser in **incognito / fresh profile** (no cached session). Memory rule: validate with fresh localStorage.
- Target: **https://studio.huminic.app**
- Logins (all 6): username `<store>-admin@huminic.dev`, password `HuminicLaunch2026`
  (full list: `docs/launch/CRITICAL_URLS.md`). Stores: serra-honda, serra-service, serra-nissan, tony-serra-ford, hyundai-of-columbia, ford-of-columbia.
- ⚠️ The login endpoint **rate-limits** rapid attempts (429). If you get "Too many requests," wait ~60s. Space out the 6 logins.

## A. Store-picker landing
1. Open `https://studio.huminic.app/` → **expect:** "Choose your store to sign in", 6 cards (Serra Honda/Service/Nissan, Tony Serra Ford, Hyundai/Ford of Columbia), each with an accent stripe + SALES/SERVICE badge, the 2-paragraph explainer, and **412.654.6500** as a tap-to-call link. **No password box on this page.**
2. Click a card → expect the store's branded login form.

## B. Per-store walk (do for all 6; serra-service is the new one — do it first)
For each store: card → sign in → confirm:
1. **Left nav** shows 7 tabs: Agents, Knowledge, Widgets, Data, Teambox, Campaigns, Notifications.
2. **Header** shows the store name (e.g. "Serra Service · Agents").
3. **Agents:** the roster is correct — sales stores show **Caroline, CRM Guru, Nancy Gaston, Semantic Guardian**; **serra-service** shows **Nancy Gaston (default), CRM Guru, Semantic Guardian** (no Caroline). Pick an agent, send "Hi" → expect a reply in the agent's voice.
4. **Knowledge:** wiki tree loads (company-wiki sections) — no raw server paths/errors shown.
5. **Widgets:** at least 1 widget listed with status "ready", a live preview, and a **copy-able embed snippet** (`...nexxus-widget.min.js?id=<slug>`).
6. **Data:** dashboard loads; "build your own" card sources available (calls/video/sms/email/chat/leads/service/sales/campaigns/followups).
7. **Teambox:** Sales/Service segment switch + channel filters (Text/Email/Call/Video/Chat) render.
8. **Campaigns:** page loads (service templates + CSV upload affordance).
9. **Notifications:** routing table renders.
- Capture one screenshot per store (the Agents tab is a good single shot).

## C. Client-side INBOUND test (safe — notifies operator inbox only)
This is the one live lead you can create from the browser:
1. Open a public widget contact form: `https://studio.huminic.app/w/serra-service-contact` (and/or `/w/serra-honda-contact`).
2. Submit with **synthetic** data: name "Dexter Test", email `neoweaver@gmail.com`, phone `+14126546500`, message "client-side validation test".
3. **Expect:** success state, and within ~1 min a lead notification email in the operator inbox (Duane confirms). The conversation should appear in that store's **Teambox** (Service for serra-service-contact).
- ⚠️ Do **not** submit real customer info, and do not send SMS/place calls — telephony legs are run server-side by Claude.

## D. Negative / security checks
1. **Bad login:** wrong password → "Invalid credentials" (and an unknown username gives the *same* message — no user enumeration).
2. **Cross-store:** logged in as serra-service, manually browse to `/p/serra-honda/comms` → expect the **login gate**, not serra-honda's data.
3. **No backend leakage:** nowhere in the UI should you see server file paths (`/root/...`), env var names, tokens, or raw error stacks.

## E. Public widget render
- `https://studio.huminic.app/w/serra-honda-sales-chat` and `/w/serra-service-chat` → expect a chat widget renders (no login needed).

## Record results
Fill this and hand back to Claude/Duane:

| ID | Check | Store | PASS/FAIL | Screenshot | Notes |
|----|-------|-------|-----------|------------|-------|
| A1 | store picker | — | | | |
| B-serra-service | full walk | serra-service | | | |
| B-serra-honda | full walk | serra-honda | | | |
| B-serra-nissan | full walk | serra-nissan | | | |
| B-tony-serra-ford | full walk | tony-serra-ford | | | |
| B-hyundai | full walk | hyundai-of-columbia | | | |
| B-ford | full walk | ford-of-columbia | | | |
| C | widget form inbound | serra-service | | | |
| D1 | bad login | — | | | |
| D2 | cross-store block | — | | | |
| D3 | no leakage | — | | | |
| E | public widget render | — | | | |

Anything unclear or a path you need → say so in the tmux session.
