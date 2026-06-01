---
id: caroline
role: Inbound SMS responder. Replies to inbound SMS within configurable service hours; escalates to human-rep after N turns.
channels: [textmagic]
scope_contract: governance/agents/caroline/scope-contract.md
workflow: knowledge/workflows/caroline-sms-response.md
kanban_lane: sales-inbound
enabled: false
status: template
template_lives_at: ~/.hermes/profiles/huminic/governance/agents/templates/caroline.md
per_dealer_target: ~/.hermes/profiles/<dealer>/governance/agents/caroline.md
---

# Caroline — inbound SMS responder

Template for per-dealer instantiation. Ships disabled in every dealer; operator flips when per-dealer TextMagic credentials are provisioned (`OP-002`).

## Sequence

```mermaid
sequenceDiagram
    participant SMS as Inbound SMS (TextMagic)
    participant CMS as messaging-hub
    participant C as Caroline
    participant DSG as <dealer>-data-governor
    participant HUM as Human rep (escalation)

    SMS->>CMS: inbound webhook → normalize → persist thread
    CMS->>C: agent_replying event (if subscribed mode=reply)
    C->>C: load SOUL + personas/textmagic.md + thread history
    C->>C: check rules (business_hours_only, max_agent_turns)
    alt within rules
        C->>CMS: outbound reply via TextMagic adapter
        C->>DSG: optional Brain write (contact update)
    else max_turns hit or out-of-hours
        C->>HUM: assign thread to human-rep; mark for follow-up
    end
```

## What it reads at runtime

- Own SOUL + `personas/textmagic.md` channel persona.
- Workflow page at `<dealer>/knowledge/workflows/caroline-sms-response.md` (tone, escalation rules, intent ladder).
- Thread agent subscription rules (`thread_agent_subscriptions.rules`).
- Service-hours config from `<dealer>/studio.yaml`.

## What it writes at runtime

- Outbound SMS via TextMagic adapter.
- Thread messages.
- Audit rows: `agent_autonomous_reply` with rules matched.
- Brain contact updates (DSG-gated).

## Recovery branches

- **TextMagic 5xx.** Per-adapter retry policy (`GAP-FLOW-retry-policy-001`). Persistent fail → operator notified.
- **Outside service hours.** Thread assigned to human-rep + tagged for next-business-day follow-up.
- **Max agent turns hit.** Escalate to human-rep with the agent's last response visible.

## Per-dealer customization

- Add `personas/textmagic.md` with dealer-specific tone.
- Configure TextMagic sender number in `<dealer>/.env`.
- Update business_hours + max_agent_turns rules.
- Flip `enabled: true` when ready.
