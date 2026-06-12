# Widget URLs & Landing Pages — revised (Huminic Studio)

**Updated:** 2026-06-09. Supersedes the old single-mode `nexxus-widget.min.js?id=…` snippet for the storefront launcher.

This is the **unified storefront widget** — the floating "Choose how to connect" launcher (Web Chat · Instant Call Back · Contact Form · Two-Way Video), ported from Nexxus and now self-hosted on Studio.

---

## 1. Self-hosted embed (for dealer.com — the contractual deliverable)

One script tag per store. No keys, no other code. Drop it on the dealer's site:

```html
<script async src="https://studio.huminic.app/widget/dealer/<slug>.js"></script>
```

| Store | Embed URL |
|---|---|
| Serra Honda | `https://studio.huminic.app/widget/dealer/serra-honda.js` |
| Serra Nissan | `https://studio.huminic.app/widget/dealer/serra-nissan.js` |
| Tony Serra Ford | `https://studio.huminic.app/widget/dealer/tony-serra-ford.js` |
| Hyundai of Columbia | `https://studio.huminic.app/widget/dealer/hyundai-of-columbia.js` |
| Ford of Columbia | `https://studio.huminic.app/widget/dealer/ford-of-columbia.js` |
| Serra Service | `https://studio.huminic.app/widget/dealer/serra-service.js` |

> **Serra Service** is its own account. Its widget presents **Web Chat · Instant Call Back · Contact Form** — **Two-Way Video is off by design** for the service rooftop. The five sales stores above present all four modes.

**Path matches Nexxus exactly** (`/widget/dealer/<slug>.js`). After the host cutover (live.huminic.app → Studio), the embeds already on the dealer.com sites keep working **with zero changes** — only the host they resolve to moves.

The bundle is self-contained vanilla JS (no framework assumptions about the dealer's page); config (store name, accent, which options, video agent) is injected server-side. The Two-Way Video persona is resolved server-side and never appears in the page source.

## 2. Storefront landing pages (Studio-hosted)

The same launcher also renders on the store's Studio storefront landing — no login, public:

| Store | Landing URL |
|---|---|
| Serra Honda | `https://studio.huminic.app/p/serra-honda` |
| Serra Nissan | `https://studio.huminic.app/p/serra-nissan` |
| Tony Serra Ford | `https://studio.huminic.app/p/tony-serra-ford` |
| Hyundai of Columbia | `https://studio.huminic.app/p/hyundai-of-columbia` |
| Ford of Columbia | `https://studio.huminic.app/p/ford-of-columbia` |
| Serra Service | `https://studio.huminic.app/p/serra-service` |

## 3. Verification / demo page

A "pretend dealer.com" page that injects each store's embed so you can see it live:

`https://studio.huminic.app/dealer-widget-verification.html`

(Click a store button → its teal launcher appears bottom-right.)

---

## 4. What the four options do

| Option | Visitor experience | Where it lands |
|---|---|---|
| **Web Chat** | Live chat with the store's AI (Caroline) | opens `/w/<slug>-sales-chat` in-panel → Comms · Sales |
| **Instant Call Back** | Leaves name + phone, asks for a call back | `POST /api/public/callback-request` → Comms · Sales lead **+ notification email**. No SMS is sent. |
| **Contact Form** | The store contact form | opens `/w/<slug>-contact` in-panel → Comms · Sales lead **+ email** |
| **Two-Way Video** | Live face-to-face video session with the AI agent | `POST /api/public/video-session` mints a session server-side → fullscreen video → Comms · video thread **+ email** |

**Two-Way Video** is enabled on the **5 sales stores** (Serra Service has video off by design). The video agent's **display name is configured per store** (server-side `video_agent_name`); visitor-facing copy reads "Two-Way Video" / "Face-to-face with <agent>" — **no third-party vendor name appears anywhere**. Video is **render-verified** across the sales stores; the live face-to-face handoff is confirmed during the walkthrough before it is called final.

## 5. Underlying public endpoints (CORS-open for cross-origin embedding)

- `GET  /widget/dealer/<slug>.js` — the embed bundle (per store).
- `POST /api/public/video-session` — `{profile}` → `{ ok, conversationUrl }`.
- `POST /api/public/callback-request` — `{profile, name, phone, message}` → lead + notification.
- `GET  /w/<slug>` — the live chat/form widget surfaces (already `frame-ancestors *`).

## 6. Per-store config (operator-controlled)

In each profile's `studio.yaml` under `unified_widget`: `enabled`, `accent` (teal `#0d9488`), `subtitle`, `channels` (chat/callback/form/video toggles), `chat_slug`, `form_slug`, `video_persona_id` (server-side only), `video_agent_name`. Customer-admins cannot edit this.

## 7. What changed vs Nexxus

- The old `nexxus-widget.min.js?id=<widget>` snippet was a **single-mode** launcher (one widget = one mode). It is superseded for the storefront by the **unified** launcher above.
- The video-only `/widget/dealer/<slug>.js` from Nexxus is replaced by a **full unified** bundle at the same path (chat + callback + form + video), so it is a strict superset and a drop-in.
