# Nexxus Customer Surface — Recon & Modeling

**Date:** 2026-05-29
**Source:** Live recon of `https://live.huminic.app/p/huminic` and adjacent routes via Playwright
**Evidence:** `docs/v0-evidence/nexxus-live-p-huminic.png`

---

## What live.huminic.app actually is today

`live.huminic.app` is the **existing Nexxus deployment**, not a fresh Huminic surface.

- HTTP response `<title>Nexxus Connect</title>` on every route (`/p/*`, `/login`, `/admin`, `/console`, `/dashboard`, `/w/*`, `/widget/*`).
- Single React SPA bundle: `/assets/index-Cq2-vYu-.js` + `/assets/index-BMae-BMc.css`.
- All non-API routes 200 and serve the same `index.html`; client-side routing decides what to render.
- Authenticated API at `/api/auth/me` returns `401 {message: "Access token required"}` — admin surface is present and gated.
- The fork `~/Claude-store/nexxus2.2_replit/` matches this shape (single-bundle Vite + Express-served SPA).

**Implication:** When operator says "customer interaction surfaces will be a separate cluster outside of the current studio webui," they're describing what Nexxus already does today — a separate customer-facing app — and want the new Huminic stack to mirror that topology instead of jamming the customer surface into `studio.huminic.app`.

## Public landing API shape

```
GET /api/public/landing/huminic  →  200
{
  "id": "f1b20850-8ad4-4c36-a342-4dc108e92ab6",
  "name": "Huminic",
  "slug": "huminic",
  "personaName": "Admin"
}
```

- Only `huminic` is provisioned. `serra-automotive`, `strukture`, `serra` all return `404 {message: "Organization not found"}`.
- API response is minimal — it is **organization metadata only**. The visible page content (form fields, copy, video CTA, stats) is hard-coded into the React SPA, NOT data-driven from the landing API.

## What renders at /p/huminic

| Element | Source |
|---|---|
| `<h1>Huminic</h1>` (brand) | API `name` field |
| "Let's schedule a VIP test drive" heading | Hard-coded in SPA |
| Form widget (First Name, Last Name, Phone, Email, "What are you looking for?", consent text, "Get in Touch" submit) | Hard-coded in SPA |
| Right-pane "We are here for you 24/7" + "Start a Live Video Chat" button | Hard-coded in SPA |
| Stat row: `500+ Vehicles`, `4.9★ Rating`, `24/7 Available` | Hard-coded in SPA |
| Logo (HuminicIcon) | Hard-coded in SPA |

In Nexxus today, **per-org customization is shallow** — name + persona name. Everything else is baked into the customer SPA.

## Route inventory (live.huminic.app)

| Route | Status | What it is |
|---|---|---|
| `/p/$slug` | 200 (SPA) | Public profile landing — form + video CTA |
| `/w/$slug` | 200 (SPA) | Public widget — same SPA, client-side routes via React |
| `/widget/$slug` | 200 (SPA) | Same |
| `/login` | 200 (SPA) | Admin/customer login |
| `/admin` | 200 (SPA) | Admin surface (auth-gated client-side) |
| `/console` | 200 (SPA) | Customer console (auth-gated client-side) |
| `/dashboard` | 200 (SPA) | Dashboard |
| `/api/public/landing/$slug` | 200/404 | Public org metadata |
| `/api/auth/me` | 401 | Auth probe |
| `/api/public/profiles` | 404 | Not exposed |
| `/api/public/widgets` | 404 | Not exposed |

## Widget modes shown

Operator's directive named four widget modes: chat, voice, video, form. The live Nexxus customer surface at `/p/huminic` shows **two** of them simultaneously on one page:

1. **Form mode** — the "VIP test drive" form (left column)
2. **Video mode** — "Start a Live Video Chat" button (right column)

No chat mode or voice mode visible on this landing. The "landing page" model in Nexxus puts the most-likely conversion paths (form + live video) front and center.

## Where customer-side configuration would live

The recon did NOT find a public customer-config surface. The customer-side config that operator described ("the customer web surface had a configuration setting page") would necessarily live behind the `/login` → `/console` (or similar) authenticated routes, which require credentials I don't have.

In Nexxus, the customer admin surface exists but operates from inside the same SPA — same domain, same bundle, different routes gated by client-side auth. There is no separate "customer admin domain."

## Implications for the Huminic plan

1. **The customer cluster is a separate deployment, but it's the same shape as Nexxus today** — a single Vite SPA + light backend, sitting at `live.huminic.app` (or successor). It serves both public landings AND authenticated customer-config surfaces.
2. **Studio (`studio.huminic.app`) stays operator-side**: agent admin, profile admin, engagement tracking, KSG/DSG verdicts, governance — same as today.
3. **State-sharing model is the open question.** The Nexxus customer SPA today is backed by Nexxus's own database; in the new world, it needs to be backed by Hermes profile state (`~/.hermes/profiles/<profile>/knowledge/widgets/*.md` etc).
4. **Per-profile customization in Nexxus is shallow.** If we want richer customization (true per-profile branding, per-profile widget mix, per-profile copy), the new customer cluster needs to data-drive what is hard-coded in Nexxus today.

## Open questions for operator

Captured in main response.
