# Huminic Studio Agent Context

This repository is the Hermes Studio app currently being customized and rebranded as **Huminic Studio**.

## Current Product Direction

- Build features in Huminic Studio first.
- Keep capabilities modular so they can later be extracted for Persanabox or another customer portal.
- Studio is the internal/admin/operator console. A separate customer-facing portal/panel is planned.
- Persanabox is a future adapter, not the current implementation surface.

## Related Paths

- Studio repo/app: `/Users/dw/Hermes-Studio`
- Hermes root/config/profiles: `/Users/dw/.hermes`
- Customer profiles: `/Users/dw/.hermes/profiles`
- Planning docs/backlog: `/Users/dw/Documents/misc_store`
- Current Studio URL: `http://epoch.local:9119`

## Authoritative Docs

Read these before large changes:

- `/Users/dw/Documents/misc_store/HERMES_STUDIO_PORTABLE_CAPABILITY_PLAN.md`
- `/Users/dw/Documents/misc_store/HERMES_STUDIO_PORTABLE_BACKLOG.md`
- `/Users/dw/Documents/misc_store/UNIFIED_WIDGET_BUILDER_PLAN.md`
- `/Users/dw/Documents/misc_store/HERMES_OPERATING_MANUAL.md`

## Implemented MVP Areas

- Artifact registry, publishing, public links, downloads, and Resend delivery.
- Resend artifact delivery skill.
- Agent migration metadata scaffold.
- Per-profile customer widget config and hosted `hermes-widget.js`.
- Public widget config/session endpoints.
- Huminic branding pass: visible Hermes Studio branding should appear as Huminic Studio with a lowercase `h` mark.

Known intentional stub:

- Vapi/Tavus live session minting is guarded and not connected until real persona IDs and server-side credentials are mapped.

## Engineering Rules

- Prefer configuration over code.
- Keep feature logic in typed schemas, server stores/services, and API routes; React screens should be adapters.
- Keep secrets server-side.
- Public widget manifests and artifacts must not expose credentials, private prompts, or internal file paths.
- Preserve Hermes Agent/Gateway terminology only where it describes the underlying runtime.
- After changes, run `npm run build`; for larger changes also run `npm test` and Playwright as appropriate.
