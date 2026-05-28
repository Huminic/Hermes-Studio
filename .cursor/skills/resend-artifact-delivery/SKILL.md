---
name: resend-artifact-delivery
description: Send Hermes Studio public artifact links with Resend. Use when a user asks an agent to email, share, send, or deliver a published artifact/report link.
disable-model-invocation: true
---

# Resend Artifact Delivery

Use this only for already-published Hermes Studio artifacts.

## Preconditions

1. The Studio server must have `RESEND_API_KEY` and `RESEND_FROM_EMAIL` set.
2. The artifact must be reviewed and published in Studio.
3. Recipients must be explicit email addresses provided by the user or approved customer profile data.

## Send Flow

1. Confirm the artifact title, profile, and recipient list.
2. POST to `/api/artifacts/{artifactId}/send` with JSON:

```json
{
  "to": ["recipient@example.com"],
  "subject": "Report is ready",
  "message": "A Hermes Studio report is ready for review."
}
```

3. Report the returned public link and Resend id.
4. If the API reports Resend is not configured, tell the operator to set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` on the Studio server, then restart Studio.

## Guardrails

- Do not send draft or unpublished artifacts.
- Do not include secrets, API keys, internal notes, or unredacted customer data in the email body.
- Do not guess recipients.
- Prefer sending links rather than attachments unless the artifact owner has approved download sharing.
