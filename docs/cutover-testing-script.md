# Nexxus → Huminic Studio Cutover Testing Script

**Purpose:** structured side-by-side comparison so a human tester can verify
the new Huminic Studio customer cluster matches Nexxus before hard cutover.

**Audience:** human tester (you or a teammate). The agent has not done a
browser/MCP walkthrough — that's this script's job.

**Environment assumptions BEFORE you start:**

- [ ] PR #26 merged to `main` AND Coolify has redeployed `hermes-studio`.
      Verify by `gh pr list --repo Huminic/Hermes-Studio` (PR should be merged)
      AND by hitting `https://studio.huminic.app/api/plugins` — should return
      `customer-console` v0.2.0.
- [ ] Provisioning script run: `docker exec <hermes-agent-container> bash <
      scripts/provision-existing-customers.sh`. Verify with
      `docker exec <container> ls /root/.hermes/profiles/` — should list
      consultative-agent, huminic, serra-honda, serra-service, serra-nissan,
      tony-serra-ford, ford-of-columbia, hyundai-of-columbia, strukture +
      data-governor profiles.
- [ ] Customer-admin accounts created for each. Pattern:
      `docker exec -i <container> pnpm tsx scripts/create-user.ts --profile
      <slug> --username <handle> --customer-admin`.
- [ ] For the Vapi test path: `lead_notifications.adf_email` in the target
      profile's studio.yaml points at `neoweaver@gmail.com`. Edit via
      `docker exec` then `cp` if needed.
- [ ] central-mcp has a Resend token provisioned and the env var
      `CENTRAL_MCP_TOKEN` is set in the hermes-studio container.
- [ ] If testing SMS: TextMagic webhook URL added in TextMagic dashboard:
      `https://studio.huminic.app/api/webhooks/textmagic/<profile>?domain=service`.

If any gate above is open, **stop**. Don't proceed; surface to operator.

---

## Section 1 — Login parity (per customer)

For each profile slug in the cutover roster (serra-honda, serra-service,
serra-nissan, tony-serra-ford, ford-of-columbia, hyundai-of-columbia,
plus huminic and strukture):

| Step | Nexxus reference | Huminic action | Expect |
|---|---|---|---|
| 1 | Log into Nexxus dashboard for the store | Navigate to `https://studio.huminic.app/p/<slug>` | Brand-correct landing page (header color matches accent_color in studio.yaml; persona name correct) |
| 2 | (n/a) | Click "Log in" | Profile-branded login form |
| 3 | Username from existing Nexxus tenant | Type customer-admin username | (form input) |
| 4 | Password | Type password | (form input) |
| 5 | Submit | Submit | Redirects into the storefront with 6 tabs: Chat, Knowledge, Tools, Data, Comms, Campaigns |

**Defects to note:** wrong brand color, missing tab, login error message, 500 on submit.

---

## Section 2 — Agent roster comparison (per customer)

For each customer:

1. In Nexxus, list the active agents the store has (Vapi assistant +
   named agents from agent-instructions.json). Typically: 1 primary
   (Caroline / Nancy / Magnolia / Georgia / Savannah / Elizabeth) + the
   8 named agents (Data Guru, Sales Coach, Communication Writer, Photo
   Studio, Video Producer, Copywriter, Market Intel, Creative Director).
2. In Huminic at `/p/<slug>/chat`, the picker should be **EMPTY** (all
   agents `enabled: false` post-provisioning). That's correct cutover state.
3. Verify the SOULs exist on disk:
   `docker exec <container> ls /root/.hermes/profiles/<slug>/governance/agents/`
   Expect 9 `.md` files (1 primary + 8 named).
4. Spot-check Caroline's file shows `enabled: false`:
   `docker exec <container> head -10 /root/.hermes/profiles/serra-honda/governance/agents/caroline.md`
   Expect `enabled: false` in the frontmatter.

**Defects to note:** missing SOUL, wrong enabled state, picker showing an
agent before cutover.

---

## Section 3 — Vapi inbound webhook (Elliott → ADF email)

This is the lead-notification round-trip test. Operator runs it ONCE
against a chosen customer (recommend `serra-honda`) without touching
the Nexxus webhook config.

**Preconditions:**

- [ ] Create a fresh test Vapi assistant in the Vapi dashboard (NOT
      Caroline/Nancy/etc — those still serve Nexxus). Configure its
      end-of-call-report webhook to
      `https://studio.huminic.app/api/webhooks/vapi/serra-honda`.
- [ ] Note that test assistant's Vapi phone number for the test call.

**Run:**

```bash
pnpm tsx scripts/elliott-test-huminic.ts --target serra-honda --phone <test-assistant-phone>
```

**Expect:**

1. Elliott places the call. Console prints the call id and waits.
2. After the call ends (~30-60s typical), the webhook fires.
3. Open `https://studio.huminic.app/p/serra-honda/comms`. Switch to
   the **Sales** segment. There should be a new thread tagged `voice`
   with the call summary as the first inbound message.
4. Check `neoweaver@gmail.com` inbox. Subject:
   `Vapi lead — Elliott Test`. Attachment: `lead-<timestamp>.adf.xml`.
   Open the attachment — it should be valid ADF XML mentioning Elliott.

**Failure modes + checks:**

| Symptom | Where to look |
|---|---|
| Webhook never fires | Vapi dashboard → assistant → webhook settings. Curl the webhook URL with a synthetic event to confirm Studio is up. |
| Thread created but no email | `lead_notifications.adf_email` empty OR `CENTRAL_MCP_TOKEN` missing. Check `/api/customer/widgets?profile=serra-honda` (auth needed) — if Studio APIs answer, the auth gate is fine. |
| Email arrives without attachment | central-mcp Resend tool response — agent's debug log in the response message column of the thread (system-tagged message) will say `lead-notification` reason. |
| `notification.via: unconfigured` | `studio.yaml.lead_notifications.adf_email` is empty for that profile. |

**Defects to note:** any step that doesn't produce the expected artifact.

---

## Section 4 — Widget tests (per customer)

For each customer that has widgets configured:

1. In Nexxus, find the equivalent widget. Note the slug, mode (chat /
   voice / video / form), and assigned agent.
2. In Huminic: `/p/<slug>/tools` → Widget tab. The widget should appear
   with the same slug. Status should be `missing-file` until you author
   the widget file via the editor (KSG-gated).
3. Click **Copy** on the embed snippet. Paste into a scratch HTML file
   open in a browser. Confirm the widget loader script loads.
4. For chat-mode widgets: open `/w/<slug>` directly in an incognito
   tab. Confirm the chat box loads and round-trips with an answer.
5. For form-mode widgets: submit the form. Expect a new thread in
   `/p/<slug>/comms` with channel `form` and the submitted message
   as the inbound content.
6. For voice/video widgets: expect "unconfigured" status until Vapi/Tavus
   credentials land.

**Defects to note:** widget not listed, embed snippet wrong, chat doesn't
round-trip, form doesn't land in Comms.

---

## Section 5 — SMS round-trip (TextMagic)

Provision steps once:

- [ ] In TextMagic dashboard for the target test profile, add an
      inbound webhook URL:
      `https://studio.huminic.app/api/webhooks/textmagic/serra-service?domain=service`.
- [ ] Set `TEXTMAGIC_WEBHOOK_SECRET` in the profile's `.env` if you want
      to require auth (recommended for prod, optional for first test).

**Test:**

1. From a personal phone, send an SMS to the TextMagic-receiving number
   associated with serra-service. Body: "Need an oil change".
2. Within ~5 seconds the new system should land it as a thread in
   `/p/serra-service/comms` Service segment, channel `sms`.
3. (Optional) From the Comms composer, reply on the same `sms` channel.
   If `TEXTMAGIC_API_KEY` is set in the profile env, the reply dispatches
   via the TextMagic adapter. Otherwise, the message is recorded
   locally with `adapter_status: unconfigured`.

**Defects to note:** thread never appears, wrong segment, reply fails.

---

## Section 6 — ADF email inbound (Serra dealer-feed format)

If a Nexxus inbound email pipe delivers ADF-XML messages today:

1. Find or compose a sample ADF email from the feed.
2. POST it to `https://studio.huminic.app/api/messaging/inbound` with
   the body:
   ```json
   {
     "profile": "<slug>",
     "channel": "email",
     "domain": "sales",
     "contact_handle": "lead@example.com",
     "body": "<full ADF XML here>"
   }
   ```
   Use the `HERMES_INBOUND_TOKEN` from the profile .env in the
   `x-inbound-token` header.
3. Expect: thread in Comms Sales segment with channel `email-adf` and
   the parsed `lead_meta` block visible on the inbound message.

**Defects to note:** XML didn't parse (lead_meta is null), wrong channel
tag, no ADF email outbound (only inbound parses here — outbound emit
happens via the lead-notifications path in Section 3).

---

## Section 7 — Chat parity (per customer, once an agent is enabled)

After the operator enables Caroline (for example):

1. Flip `enabled: false` → `enabled: true` in
   `~/.hermes/profiles/serra-honda/governance/agents/caroline.md`.
   (Restart hermes-studio container OR wait — the file read is per-request.)
2. In Huminic: `/p/serra-honda/chat`. Picker should now show Caroline.
3. Type "Hi" → expect a SOUL-grounded reply from Caroline.
4. Side-by-side: ask the SAME question in the Nexxus chat surface for
   Serra Honda. Compare the answers for tone + structure parity. They
   won't be identical (different model + prompt) but should hit the same
   beats.

**Defects to note:** picker still empty after flip, reply unrelated to
SOUL, errors.

---

## Section 8 — Knowledge edit + promote

For one customer:

1. Open `/p/<slug>/knowledge`. Tree should show `knowledge/`,
   `data/`, etc. — NOT `governance/` or `canon/` (those are
   operator-only).
2. Pick a file in `knowledge/inbox/` (the provisioning script seeds
   none — operator drops one in OR you click "new file" later).
3. Click **Promote**. The file should move to
   `knowledge/drafts/<same-name>.md`.
4. Try to save a file with no frontmatter — KSG should block with
   `missing-frontmatter`.
5. Try to save into `canon/anything.md` — should block with
   `protected-tree`.

**Defects to note:** promote moves to wrong location, KSG silently
allows a violation, tree leaks protected dirs.

---

## Section 9 — Campaigns

For one customer:

1. Open `/p/<slug>/campaigns`. Should default to Service-only.
2. Click "New campaign" → pick the Service Recall template.
3. Audience JSON: `{"channel": "sms"}`. Click "Preview audience".
   Expect a count and small sample of contacts (uses whatever contacts
   are in the profile's messaging-hub.db).
4. Save + schedule.
5. Hit "Tick now". Expect a result object with `sent: <n>, failed: <n>`.
6. Verify in Comms that outbound `sms` messages tagged `via: campaign`
   landed in threads.

**Defects to note:** preview is empty when contacts exist, tick fails,
deliveries don't land.

---

## Section 10 — Consult sub-page (huminic only)

1. Open `/p/huminic/tools`. Sub-nav should show `Widget` and `Consult`.
2. Click Consult. The engagement-state from
   `~/.hermes/profiles/huminic/engagement-state.yaml` should render
   (current stage, gates, deployment notes).
3. Click a future stage chip — should advance.
4. Approve a non-topology gate — should record approver = the logged-in
   username.
5. Approve `topology_decided` with decision = `we-host` — should accept.
6. Try to approve `topology_decided` with decision = `garbage` — should
   reject with 400.

**Defects to note:** stage doesn't advance, gate save fails, schema
violations get through.

---

## Section 11 — Cross-profile isolation

1. Log into `/p/serra-honda` as serra-honda's customer-admin.
2. In the URL bar, change the path to `/p/serra-nissan/comms`. Should
   show the login screen (the session is scoped to serra-honda).
3. Open browser dev tools → console. Run:
   ```js
   await fetch('/api/customer/agents?profile=serra-nissan').then(r=>r.json())
   ```
   Expect `{ ok: false, error: 'Unauthorized for this profile.' }`
   with HTTP 403.

**Defects to note:** can read another profile's data.

---

## Section 12 — Studio admin override

1. Log in as a Studio admin (`is_admin: true` in auth.yaml — e.g.,
   `duane` on huminic).
2. Visit `/p/serra-honda/chat`. Should load (admin is super-user).
3. Visit `/profiles` and confirm the Studio admin chrome is intact.

**Defects to note:** admin can't reach customer surfaces, admin
chrome bleeds onto `/p/*` routes.

---

## Section 13 — MCP UI gaps the agent did NOT cover

Honest disclosure: the implementation agent did NOT run Playwright/MCP
walkthroughs of the customer cluster UI surfaces. The 357 test pass
covers API + integration, not browser-rendered UI. These items belong
to this human-tester pass:

- [ ] Storefront login form renders correctly in Safari + Firefox + Chrome
- [ ] Mobile breakpoints for `/p/<slug>/comms` (3-column inbox on phones)
- [ ] Storefront accent color renders correctly on each customer
- [ ] Keyboard nav j/k/r in Comms works without trapping focus
- [ ] Monaco-lite knowledge editor handles a 50 KB+ wiki page without lag
- [ ] Frontmatter panel renders parsed YAML fields legibly
- [ ] Long thread lists in Comms (100+ messages) don't lock up
- [ ] SSE reconnect after a browser tab is backgrounded for 10 minutes
- [ ] Widget preview iframe sandbox doesn't break the chat round-trip
- [ ] Agent typing indicator clears reliably

Record any anomaly in `docs/customer-cluster-defect-register.md`
with severity B / I / D.

---

## Test report template

After running this script, fill out and hand back to the operator:

```
Date: ____
Tester: ____
Environment: studio.huminic.app (build sha ____)
Sections passed: 1 2 3 4 5 6 7 8 9 10 11 12 13
Defects found:
  - <copy entries from the register>
Recommendation: GO / NO-GO for hard cutover
```
