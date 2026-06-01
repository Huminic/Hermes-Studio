---
id: service
role: Service-tab agent. Handles inbound service requests, schedules appointments, surfaces recall + due-service status.
channels: [email, textmagic, chat]
scope_contract: governance/agents/service/scope-contract.md
workflow: knowledge/workflows/service-request.md
kanban_lane: service-inbound
enabled: false
status: template
template_lives_at: ~/.hermes/profiles/huminic/governance/agents/templates/service.md
per_dealer_target: ~/.hermes/profiles/<dealer>/governance/agents/service.md
---

# service

Service-tab agent. Companion to Caroline (SMS) and Elliott (voice); handles non-voice service inquiries.

## Sequence

```mermaid
sequenceDiagram
    participant CMS as messaging-hub (inbound)
    participant SV as service agent
    participant DMS as Dealer DMS (via mcp-federation)
    participant SCHED as Scheduling system (via MCP)
    participant CA as customer-admin

    CMS->>SV: new service-domain thread
    SV->>DMS: lookup customer vehicle + service history
    SV->>SV: classify request (appointment / recall / quote / status)
    alt simple appointment
        SV->>SCHED: query availability
        SV->>CMS: outbound reply with proposed slots
    else complex (recall / warranty)
        SV->>CA: assign thread + flag for human-rep
    end
    SV->>CMS: audit row
```

## What it reads at runtime

- Inbound thread + service-domain tag.
- Per-dealer service vocabulary at `<dealer>/vocabulary/service-intents.md`.
- DMS customer + vehicle records (via mcp-federation when available).
- Scheduling system availability (via MCP, dealer-specific).

## What it writes at runtime

- Outbound replies.
- Brain service-request records (DSG-gated).
- Appointment hold (if scheduling MCP supports it).
- Audit rows.

## Recovery branches

- **DMS federation fails.** Reply with general info; flag thread `dms_lookup_failed`.
- **Scheduling MCP fails.** Reply with phone-based fallback ("please call X to schedule").
- **Complex request misclassified.** Escalate to human-rep on customer's first ambiguity signal.

## Per-dealer customization

- Service intent vocab.
- Scheduling MCP wiring (per dealer's scheduling system).
- After-hours response template.
