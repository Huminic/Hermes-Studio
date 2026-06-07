# Pyramid E2E — Assumptions & Judgment Calls Log

Autonomous /goal run started 2026-06-06. Every UI/judgment/assumption call is
logged here for operator review (per the goal's "catalog every assumption"
directive). Status: OPEN = needs operator confirmation; ACCEPTED = operator
pre-authorized or low-risk default.

| ID | Area | Assumption / decision | Rationale | Status |
|----|------|------------------------|-----------|--------|
| A-01 | serra-service identity | New 6th profile slug = `serra-service`; cloned structurally from `serra-honda` | Operator: "identical to serra and columbia stores with a different login" | ACCEPTED |
| A-02 | serra-service login | `serra-service-admin@huminic.dev` / `HuminicLaunch2026` (matches other 5) | Consistency + testability; operator may swap to `<store>.<name>@huminic.ai` forwarding later | OPEN |
| A-03 | serra-service agents | Roster = nancy-gaston (default), crm-guru, semantic-guardian; Caroline (sales) excluded | Service is Nancy's domain; sales lives in serra-honda | ACCEPTED |
| A-04 | serra-service notifications | Plain email (`lead_format: email`), recipient `neoweaver@gmail.com` placeholder | Operator: service ≠ ADF; no real BDC recipients during test | ACCEPTED |
| A-05 | serra-service VIN | `vin.org_id` shared with serra-honda (`24d64f99…`) | Same rooftop's customer base; federated multi-VIN deferred | OPEN |
| A-06 | serra-service accent | `#0e7490` (cyan-700) to visually distinguish service from Honda red | UI judgment | ACCEPTED |
| A-07 | serra-service wiki content | company-wiki + brain cloned from serra-honda as the default starter; service-specific content not authored | "default folder content as prescribed"; deep content is operator/Nancy's to refine | OPEN |
| A-08 | serra-service Vapi/SMS number | `+19014361271` (Nancy), already in the Serra Honda Vapi account per Nexxus roster | Operator confirmed Nancy has a number | ACCEPTED |
| A-09 | Root landing | `/` now renders the public store-picker (was redirect→/chat). Studio admin reaches admin UI via `/chat` directly | Goal: "redirect the current login page to a store picker" | ACCEPTED |
| A-10 | Store-picker roster | Static manifest of the 6 customer entities (not a live profile list) | Avoids leaking internal/non-customer profiles (huminic, fictitious, test, huminic-motors) | ACCEPTED |
| A-11 | Store-picker copy | 2-paragraph explainer: choose your store + contact 412.654.6500 by voice/text for logins; "don't share logins" | Operator-specified content | ACCEPTED |
| A-12 | Tavus inbound | New `/api/webhooks/tavus/$profile` mirrors Vapi: channel `video`, domain `sales`, notification via matrix (`inbound_video`), same agent/profile | Goal: "inbound across Vapi and Tavus, same agent/profile" | ACCEPTED |
| A-13 | Live comms test identities | Two-way SMS uses two operator-owned numbers (Elliott ↔ store line); email to duanekwells@/neoweaver@gmail.com only | Goal: no customer contact | ACCEPTED |
| A-14 | Columbia scope | Columbia (hyundai/ford) = inbound webhook + plain email only; no sales-SMS, no service billing | Operator memo 2026-06-06 | ACCEPTED |
| A-15 | Outbound gating | OUTBOUND_LIVE_ENABLED + vin.watcher.enabled stay OFF until go-live; tests exercise wiring with CommGate engaged | Pre-launch safety; operator flips at cutover | ACCEPTED |

## Discovered defects (found + fixed during this run)
| ID | Severity | Finding | Fix | Status |
|----|----------|---------|-----|--------|
| D-01 | HIGH | Container storefronts referenced customer agents (`nancy-gaston`, `crm-guru`, `semantic-guardian` on all stores; `caroline` on all but serra-honda) whose SOUL files were MISSING on the live volume — agents would degrade to the generic profile SOUL. Host had the complete roster. | Migrated `governance/agents/*` host→container for all 6; verified all 4 customer agents present on every store. | FIXED |
| D-02 | MED | Container stores lacked `company-wiki/` (the Knowledge default folder content); host had it. | Migrated `company-wiki/` host→container for all 6. | FIXED |
| D-04 | HIGH | Store-picker landing at `/` was shadowed by the Studio admin gateway LoginScreen (only `/p/` was exempted from the global auth gate in workspace-shell). Anonymous customers saw the wrong (admin) login. Found via headed browser pass. | Exempted `/` alongside `/p/` in workspace-shell's pre-auth gate so the public store-picker renders standalone. | FIXED (redeploying) |
| D-03 | MED | Container `serra-service` was a thin stub (no widgets, `data:false`, `nancy.md` instead of `nancy-gaston.md`, login `serra-service@huminic.app`). | Replaced with full host build: service studio.yaml, 2 service widgets, full agent roster, login `serra-service-admin@huminic.dev`. | FIXED |

| D-05 | LOW | Public store-picker `/` fires Studio admin pollers (`/api/sessions`, `/api/gateway-status`, `/api/files`) → 401s in console (page renders fine; pollers back off). | Cosmetic; deferred. Public landing should not mount admin data hooks — refactor later. | DEFERRED |
| D-06 | MED | Customer `/api/customer/widgets` leaked the absolute server `filePath` (`/root/.hermes/profiles/.../widget.md`) to the client — info disclosure. Found via live probe. | Strip `filePath` from the response; keep server-internal. + regression test asserting no `/root/.hermes` in body. | **FIXED — verified live** (commit 2a17aa31c pushed 07:35; the LIVE container still served the leak until it restarted ~07:39; independent reviewer + my recheck at 07:40/07:42 confirm `filePath:0 /root:0`). **Correction:** I prematurely marked this "deployed" at push-time before the container picked up the build — per Core Value #1, "deployed" must mean *verified live*, which it now is. |

## Operator-only / out of scope (not done by agent)
- DNS / Caddy flip to `live.huminic.app`.
- Rotation of the leaked broker tokens (security debt — still outstanding).
- Real customer data + real BDC recipient entry.
- Registering live provider callbacks (TextMagic sub-accounts, Vapi, Tavus) — diverts live inbound; done at the cutover moment.
