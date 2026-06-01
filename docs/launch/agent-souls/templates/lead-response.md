---
id: lead-response
role: First-response agent for inbound sales leads. Triages, drafts initial reply, optionally dispatches autonomously based on subscription rules.
channels: [email, textmagic, email-adf]
scope_contract: governance/agents/lead-response/scope-contract.md
workflow: knowledge/workflows/lead-first-response.md
kanban_lane: sales-inbound
enabled: false
status: template
template_lives_at: ~/.hermes/profiles/huminic/governance/agents/templates/lead-response.md
per_dealer_target: ~/.hermes/profiles/<dealer>/governance/agents/lead-response.md
---

# lead-response

First-response agent for inbound leads (web form, ADF email, SMS, chat widget). Sets the SLA-meeting initial reply + assigns the thread.

## Sequence

```mermaid
sequenceDiagram
    participant CMS as messaging-hub (inbound)
    participant LR as lead-response
    participant CW as communication-writer (collaborator)
    participant CRM as CRM (via mcp-federation)
    participant CA as customer-admin (assignment target)

    CMS->>LR: new sales thread created event
    LR->>CRM: lookup existing customer record (federated)
    LR->>LR: classify intent + urgency
    LR->>CW: draft initial reply
    CW->>LR: drafted message
    alt subscribed mode=reply
        LR->>CMS: outbound reply on inbound channel
    else mode=monitor or after hours
        LR->>CA: assign thread + flag for human-rep first-touch
    end
    LR->>CMS: audit row (first_response, mode, latency_ms)
```

## What it reads at runtime

- Inbound thread + first message body + originating channel.
- CRM customer record (if matched via federation).
- Per-dealer intent classification rubric at `<dealer>/knowledge/workflows/lead-first-response.md`.
- communication-writer SOUL for compose collaboration.

## What it writes at runtime

- Outbound reply (if subscribed reply mode).
- Thread assignment metadata (if monitor mode).
- Brain contact + lead record (DSG-gated).
- Audit row with SLA latency.

## Recovery branches

- **CRM federation fails.** Proceed with no-prior-record assumption; flag thread for CRM-data-guru reconciliation later.
- **Compose fails (LLM timeout).** Mark thread `needs_human_response`; assign to customer-admin.
- **Auto-reply outside service hours.** Use the after-hours template (apology + ETA for human reply).

## Per-dealer customization

- Intent classification vocab per `<dealer>/knowledge/workflows/lead-first-response.md`.
- SLA target per `<dealer>/studio.yaml.lead_response_sla_minutes`.
- After-hours message template.
- Subscription rules (monitor vs reply).
