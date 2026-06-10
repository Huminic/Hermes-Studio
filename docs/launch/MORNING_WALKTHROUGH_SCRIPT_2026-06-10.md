# Morning Walkthrough Script - Huminic Studio Launch

Purpose: give Duane and Codex a fast, practical demonstrative eval before final certification. This is not a full retest of every prior script; it is the final stakeholder walkthrough over the surfaces that matter.

## Ground Rules

- Use Chrome.
- Stay on `https://studio.huminic.app`.
- Do not test or cut over `live.huminic.app`.
- Capture every observation into one bucket:
  - launch-blocking
  - launch-polish
  - undefined / needs decision
  - backlog / wish list
  - email / demo / training note

## 1. Global Huminic Studio

Open:

`https://studio.huminic.app/`

Confirm:

- Root goes to Global Huminic Studio login/dashboard, not the store chooser.
- Duane/super-admin login reaches the global operator surface.
- Profile/global navigation is visible only where expected.
- Store-scoped credentials do not belong here.

Discussion:

- Confirm what Duane expects to show Durran now versus after scoped partner admin is built.

## 2. Store Workspace

Use Ford of Columbia first, then Serra Honda if time allows.

Open:

`https://studio.huminic.app/p/ford-of-columbia/chat`

Confirm tabs:

- Agents
- Knowledge
- Widgets / Storefront
- Data
- Teambox
- Campaigns
- Notifications

Check:

- Agents answer in dealership-safe language.
- Knowledge renders without raw paths or errors.
- Widgets show current install snippet and no stale coming-soon form copy.
- Data/custom dashboard behavior matches the dry-run evidence.
- Teambox shows the expected lead path.
- Campaigns show draft/list behavior without sending outbound messages.
- Notifications show routing capability and correct expectations.

## 3. Public Storefront Widget

Open:

`https://studio.huminic.app/p/ford-of-columbia`

Confirm:

- Teal launcher opens.
- Four options appear:
  - Web Chat
  - Instant Call Back
  - Contact Form
  - Two-Way Video
- Chat responds coherently.
- Contact/callback paths are real forms.
- No public copy exposes provider or technical names.
- Back and close behavior is clean.

## 4. Dealer.com Embed

Open:

`https://studio.huminic.app/dealer-widget-verification.html`

Confirm:

- Load one Serra store and one Columbia store.
- One-line install path is Huminic-hosted.
- Launcher/menu behavior matches the public Storefront widget.
- Video choice uses the direct grey-label room handoff after click.
- The widget/dropdown/install JS stays vendor-clean.

Example install snippet pattern:

```html
<script async src="https://studio.huminic.app/widget/dealer/ford-of-columbia.js"></script>
```

## 5. Two-Way Video

From a public widget:

- Click Two-Way Video.
- Confirm the handoff is simple and direct.
- Confirm the mic/camera permission flow is acceptable.
- Do not treat the grey-label room URL after click as a failure; the requirement is that the widget, dropdown, install JS, emails, and visible customer/dealer copy stay clean.

## 6. Phone / Voice

Choose one before final sign-off:

- Run a short live or agent-call-agent demo.
- Or explicitly accept the already verified webhook-to-lead/email evidence.

Still decide:

- Whether LC-MAJOR-012 shared-secret hardening is fixed before launch or accepted as a monitored risk.
- Whether live voice provider wiring is proven by a short call/agent-call demo or explicitly accepted based on synthetic webhook evidence.

## 7. Lead / Email / Teambox

Confirm at least one recent lead:

- Submitted from widget/contact/callback or voice/webhook.
- Visible in the correct inbox path.
- Visible in the correct Workspace Teambox.
- Branded as Huminic/dealer-safe.

## 8. Decisions Before Sending Emails

Confirm:

- Voice webhook hardening: fixed or accepted.
- Phone demo: done or accepted.
- Partner admin: safe fallback or build before launch.
- Campaign scope: service-only wording accepted or changed.
- Dealer.com email can be sent.
- Customer/partner emails can be sent.

## Completion Rule

Only after this walkthrough passes, or every new finding is classified and accepted, can Codex mark the certification goal complete.
