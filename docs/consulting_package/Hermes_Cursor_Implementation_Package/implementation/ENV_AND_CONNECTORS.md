# Environment and Connectors

## Profile-level env files
Each profile should have a local `.env` derived from `.env.example`. Do not commit real secrets.

## Hermes email variables
Use placeholders for:
- `EMAIL_ADDRESS`
- `EMAIL_PASSWORD`
- `EMAIL_IMAP_HOST`
- `EMAIL_SMTP_HOST`
- `EMAIL_IMAP_PORT`
- `EMAIL_SMTP_PORT`
- `EMAIL_POLL_INTERVAL`
- `EMAIL_ALLOWED_USERS`
- `EMAIL_HOME_ADDRESS`

Hermes documents these as the email configuration variables for IMAP/SMTP operation. [Hermes email](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/email)

## MCP placeholders
Each profile should include `mcp.json` with placeholders for:
- CRM / transactional systems
- document stores
- internal data services
- browser automation or external system access if needed

## Transactional destinations by org
Make these explicit even if they begin as placeholders:
- HUMINIC operational systems
- Serra Automotive CRM / report targets
- Strukture operational systems

Structured operational data belongs in transactional systems / future Data Brain support, not in canonical wiki prose.

## Security posture
- commit `.env.example`, never real `.env`
- use dedicated service accounts where possible
- restrict email senders with allowlists when enabling Hermes email
