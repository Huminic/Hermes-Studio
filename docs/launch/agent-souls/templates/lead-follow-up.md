---
id: lead-follow-up
role: Stalled-lead nudge agent. Picks up leads with no reply in M hours, composes follow-up via communication-writer, dispatches via best channel.
channels: [email, textmagic]
scope_contract: governance/agents/lead-follow-up/scope-contract.md
workflow: knowledge/workflows/lead-follow-up.md
kanban_lane: sales-followup
enabled: false
status: template
template_lives_at: ~/.hermes/profiles/huminic/governance/agents/templates/lead-follow-up.md
per_dealer_target: ~/.hermes/profiles/<dealer>/governance/agents/lead-follow-up.md
---

# lead-follow-up

Template for per-dealer instantiation. Cron-triggered scan of stalled leads; composes nudges.

## Sequence

```mermaid
sequenceDiagram
    participant CR as Cron (per-dealer)
    participant LFU as lead-follow-up agent
    participant CMS as messaging-hub
    participant CW as communication-writer (collaborator)
    participant DSG as <dealer>-data-governor

    CR->>LFU: scheduled tick (e.g., every 30 min)
    LFU->>CMS: query threads where domain=sales AND last_inbound_age > M hours AND no_outbound_since_inbound
    LFU->>LFU: filter by per-dealer follow-up policy
    LFU->>CW: compose follow-up text given thread history
    CW->>LFU: drafted message
    LFU->>CMS: outbound dispatch on best channel
    LFU->>DSG: audit row (followup_dispatched, thread_id)
```

## What it reads at runtime

- Own SOUL + workflow page (`lead-follow-up.md`).
- Stalled thread list from messaging-hub.
- Per-dealer follow-up sequence config (e.g., 24h SMS, 72h email, 7d give-up).
- communication-writer SOUL for composition collaboration.

## What it writes at runtime

- Outbound messages on the chosen channel.
- Thread `last_followup_at` metadata.
- Audit rows.

## Recovery branches

- **Adapter failure.** Per-channel retry policy. If persistent fail on chosen channel, escalate to alternate channel or mark stalled.
- **All follow-ups exhausted.** Mark thread `closed_lost` with reason; surface in weekly report.

## Per-dealer customization

- Schedule cadence per `<dealer>/cron/lead-follow-up.yaml`.
- Follow-up sequence rules per `<dealer>/knowledge/workflows/lead-follow-up.md`.
- Flip `enabled: true` when sequence is decided + adapter credentials live.
