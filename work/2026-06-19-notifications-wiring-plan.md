# Notifications Wiring + Help Manual — Plan

**Date:** 2026-06-19
**Branch:** `feat/notifications-store-wiring` (from `main`)
**Goal:** Wire per-store lead notifications for real production use (proper recipient emails + ADF/XML address for Serra stores), full CRUD in the Workspace Notifications UI with a per-notification template chooser, behavior identical to the webhook path, unify Tavus/Vapi/widget, add a help "?" modal + instruction manual, then re-send the 3 missed leads. "All communications full on."

## Verified inputs (evidence-based, from Nexxus DB + recovery script)

### ADF intake addresses (Serra sales stores; Columbia = email only)
| Store | ADF email | Brand | Lead source |
|---|---|---|---|
| serra-honda | leads@serrahonda.co | Honda | Dealers WebSite |
| serra-nissan | leads@serranissanofsylacauga.net | Nissan | Dealers WebSite |
| tony-serra-ford | leads@tonyserraford.net | Ford | Dealers WebSite |
| ford-of-columbia | (none) | Ford | Dealer Website |
| hyundai-of-columbia | (none) | Hyundai | Dealer .Com (Our Website) |
| serra-service | (none in Nexxus) | — | — |

### Human recipients (operator-given + resolved from Nexxus users)
- Sam Mayfield = sam.mayfield@bc.auto
- Durran Cage = durran@cageautomotive.com
- Duane Wells = duane.wells@huminic.ai
- Victoria Whitley = victoria@misscommunicationconsulting.com
- Don Wood = dwood@serrahonda.net

### Target routing per store
- **ford-of-columbia / hyundai-of-columbia** (email): Mayfield, Cage, Wells. (Already configured today.)
- **serra-honda** (email + ADF): Whitley, Wood, Cage, Wells (email) + leads@serrahonda.co (adf-xml).
- **serra-nissan / tony-serra-ford / serra-service**: PENDING operator confirmation (human recipients beyond ADF + owner).

## Work breakdown
1. **Schema** — add `format: 'email'|'adf-xml'` to `NotificationRuleSchema` (per-notification template). Add per-store `adf_brand` / `adf_lead_source` for ADF parity with Nexxus.
2. **Dispatch** — `dispatchLeadNotification` sends each routing rule with its own `format` (humans=email card, ADF contact=adf-xml). Falls back to store `lead_format` when a rule has none. `recordLeadNotify` only on success (unchanged).
3. **API** (`notifications.ts`) — GET/PUT already exist; extend normalize/validate to accept `format`. Full CRUD (add/edit/delete/enable rows) is array-replace on PUT (already the model).
4. **UI** (`notifications-renderer.tsx`) — full CRUD table for routing rules: event, recipient, channel, **template chooser (email vs adf-xml)**, label, enabled, + Test-send (uses production renderer). Show ADF contacts distinctly.
5. **Config** — write routing into each store's runtime `studio.yaml` (dev + prod container).
6. **Unify channels** — verify Tavus + widget (form/chat/callback) + Vapi all call `notifyNewLead`/`dispatchLeadNotification` identically; fix any divergence. Confirm Teambox capture unaffected.
7. **Help** — circled "?" in workspace header → modal → opens instruction manual (write the manual).
8. **Comms full on** — set `OUTBOUND_LIVE_ENABLED=true` on studio prod (monitored, announced); confirm CommGate channel flags.
9. **Re-send 3 missed leads** — serra-honda ×2 (pull from Vapi) + hyundai ×1 (re-dispatch), via production renderer, no "late" wording, spaced.
10. **Tests** (vitest) + build; deploy; live headed verification with fresh browser; cert report + reconciliation record.

## Acceptance
Notifications work for all stores with the given emails; UI does full CRUD incl. template chooser; behavior identical to webhook notifications; Tavus/Vapi/widget handled the same; help modal+manual present; 3 missed leads delivered.
