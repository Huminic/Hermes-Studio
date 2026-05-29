# System Services — Resend Integration

**Status:** design + scaffold landed. Tokens / activation are operator actions.
**Owner:** platform-architect
**Created:** 2026-05-29

## Goal

One Resend integration that the whole system uses for transactional and notification email:
- Studio auth flows (password reset, verify email, invite).
- Studio system notifications (gateway down, deployment events, scheduled-job failures, audit alerts).
- Customer-facing outbound (lead follow-up, campaign, daily recap, service updates) — initiated by per-profile runtime agents.
- Internal team alerts (HUMINIC-side ops notifications).

Match Nexxus's existing Resend behavior so the migration is feature-equivalent, but route everything through Hermes's standard mechanism instead of importing the `resend` npm package directly.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Studio (admin, auth flows, system notifications)            │
│  → src/server/notifications.ts                               │
│        |                                                      │
│        ↓ HTTP POST                                            │
└────────│─────────────────────────────────────────────────────┘
         │
┌────────↓─────────────────────────────────────────────────────┐
│  central-mcp at localhost:4002                                │
│  tools: resend_send_email, resend_get_email                   │
│  config: ~/Claude-store/central-mcp/config/local.yaml         │
│  Resend API key: re_RJnKb56W…                                 │
└────────↑─────────────────────────────────────────────────────┘
         │
         │ Hermes agents call same tools via their mcp.json
         │
┌────────│─────────────────────────────────────────────────────┐
│  Hermes agents (per profile)                                  │
│  Customer runtime agents (lead-follow-up, etc.)               │
│  Consultative agent (engagement notifications)                │
│  Data governors (audit alerts when reconciliation fires)      │
└──────────────────────────────────────────────────────────────┘
```

## Standardized from address

```
notifications@huminic.ai
```

Display name varies by sender:
- Studio system → `Huminic Studio <notifications@huminic.ai>`
- Customer runtime → `<Customer Brand> via Huminic <notifications@huminic.ai>` — display name is read from the customer profile's `studio.yaml` `branding.persona_name`.
- Consultative agent → `Huminic Consultative Architect <notifications@huminic.ai>`.

This matches Nexxus's existing `RESEND_FROM = "Nexxus Connect <notifications@huminic.ai>"` pattern (from `~/Claude-store/nexxus2.2_replit/server/outbound.ts:23`). The domain is already Resend-verified.

## Per-profile MCP wiring

Each Hermes profile gets a `central-mcp` server entry in its `mcp.json`. Tokens are profile-scoped (one per profile so the audit trail attributes sends to the right sender).

Default shape (after operator provisions per-profile tokens):

```json
{
  "servers": [
    {
      "name": "central-mcp",
      "description": "Platform-wide service hub (Resend, Coolify, VinSolutions, Vapi, Tavus, etc.)",
      "url": "http://localhost:4002/mcp",
      "transport": "http",
      "auth": {
        "type": "bearer",
        "token_env": "CENTRAL_MCP_TOKEN"
      },
      "enabled": true,
      "tool_allowlist": [
        "resend_send_email",
        "resend_get_email"
      ]
    }
  ]
}
```

`tool_allowlist` keeps each profile scoped to the tools it needs. The consultative agent gets the email tools plus more (e.g. Coolify status reads for awareness). Data governors get only audit-relevant tools.

## Operator actions required to activate

1. Add per-profile tokens to `~/Claude-store/central-mcp/config/local.yaml` under `auth.tokens:`. Recommended names: `huminic-runtime`, `serra-automotive-runtime`, `strukture-runtime`, `consultative-agent`, `huminic-data-governor`, `serra-automotive-data-governor`, `strukture-data-governor`. Each token's `allowed_providers` should include `resend` plus whatever else that profile needs.
2. Restart central-mcp (`pm2 restart central-mcp` or equivalent).
3. Set each profile's `CENTRAL_MCP_TOKEN` env var via Coolify env injection (so the live container picks it up) or directly in `~/.hermes/profiles/<profile>/.env`.
4. Verify each profile can call `resend_send_email` (test send to operator's address).

## Studio-side helper

`src/server/notifications.ts` exports `sendNotification({ to, subject, html, text? })`. Internals:

1. Read Studio's own central-mcp token from `process.env.CENTRAL_MCP_STUDIO_TOKEN`.
2. POST to `http://localhost:4002/mcp` with a JSON-RPC `tools/call` for `resend_send_email`.
3. Use `Huminic Studio <notifications@huminic.ai>` as the from address.
4. Return `{ ok: boolean, email_id?: string, error?: string }`.

Used by:
- `src/routes/api/auth/forgot-password.ts` (Phase 3) — password reset email.
- `src/routes/api/admin/invite.ts` (Phase 3) — admin invite email.
- A future audit-event hook that emails when severity ≥ warn.

## Nexxus patterns to port

Source: `~/Claude-store/nexxus2.2_replit/server/`.

| Nexxus file | Pattern | Hermes-side landing |
|-------------|---------|---------------------|
| `outbound.ts` | Single `Resend` instance, single `RESEND_FROM`, sendEmail with rate-limit guard | central-mcp + per-profile token + per-profile rate limit at the MCP layer |
| `notificationService.ts` | Trigger notifications (after-hours follow-up, 24h check-in) | Customer runtime agent invokes `resend_send_email` via mcp; profile config declares the from-display-name |
| `routes/auth.ts` (password reset) | `resend.emails.send(...)` for reset tokens | Studio's `src/server/notifications.ts` |
| `routes/webhooks.ts` (lead notifications) | Webhook handler sends lead-alert email | Lead-follow-up agent on the customer profile picks up the lead event and emails via MCP |
| `services/scheduler.ts` (scheduled sends) | Cron-driven email | Hermes cron jobs on the customer profile run a prompt that includes "send via resend_send_email" |
| `services/notificationService.ts:704` cc/bcc | Multi-recipient | Resend's tool supports `cc`/`bcc`; pass through |

## Hermes does NOT have an email parser

You asked. To confirm: Hermes natively handles email via IMAP/SMTP env vars (`EMAIL_ADDRESS`, `EMAIL_PASSWORD`, `EMAIL_IMAP_HOST`, `EMAIL_SMTP_HOST`, etc., per `implementation/ENV_AND_CONNECTORS.md`). The IMAP side is the inbound parser — Hermes can receive email and route to a profile/agent. SMTP is outbound through a vanilla mail server, no rich-template support.

Resend covers the rich-template / transactional outbound side that Nexxus uses. Hermes's IMAP stays in place for inbound parsing (e.g. customer-replies-to-the-bot scenarios).

The IMAP + Resend split:
- Inbound: Hermes IMAP per profile (`EMAIL_*` env vars in `.env`).
- Outbound transactional / notification: central-mcp + Resend.
- Outbound plain SMTP (rarely used): Hermes SMTP env vars, optional.

## Rate limiting + cost guards

Resend has rate limits (per API key, per Resend plan). For platform-wide use:
- Central-mcp's `max_items_per_call: 100` is per call.
- Add a Studio-side rate-limit middleware on `sendNotification` (e.g. 100 sends/profile/hour) to prevent runaway agents from burning the Resend budget.
- The `live-web-artifact` skill should never invoke `resend_send_email` directly — only the dedicated outbound path goes through.

## Audit + observability

Every send returns a Resend `email_id`. Log to `~/.hermes/profiles/<sender-profile>/sent-email-log.jsonl` with `{timestamp, to, subject_hash, email_id, profile, agent_session_id}`. The DSG can audit this log to detect anomalous send patterns.

## Phase tracking

This system-services concern spans phases:
- Phase 2 (this doc + scaffold mcp.json entries + Studio helper) — DONE on landing.
- Phase 3 (Studio auth flows use sendNotification) — wires in fork code.
- Phase 4 (named Nexxus agents use Resend) — per-customer runtime agents.
- Phase 6 (full per-profile MCP wiring with real tokens) — operator activates.
- Phase 8 (validation includes a Resend roundtrip per profile).
