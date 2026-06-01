---
id: communication-writer
role: Composes outbound text and email content. Collaborator agent invoked by lead-follow-up, lead-response, service, copywriter.
channels: [system]
scope_contract: governance/agents/communication-writer/scope-contract.md
workflow: knowledge/workflows/composition.md
kanban_lane: compose
enabled: false
status: template
template_lives_at: ~/.hermes/profiles/huminic/governance/agents/templates/communication-writer.md
per_dealer_target: ~/.hermes/profiles/<dealer>/governance/agents/communication-writer.md
---

# communication-writer

Pure-compose agent. No direct channel dispatch. Returns drafted text to caller.

## Sequence

```mermaid
sequenceDiagram
    participant CALLER as Caller agent
    participant CW as communication-writer
    participant VOC as <dealer>/vocabulary/

    CALLER->>CW: compose(intent, audience, channel, context)
    CW->>VOC: read brand voice + channel tone
    CW->>CW: draft N variants
    CW->>CW: self-select best variant per rubric
    CW->>CALLER: drafted_text + variant_metadata
```

## What it reads at runtime

- Per-dealer brand voice at `<dealer>/vocabulary/brand-voice.md`.
- Per-channel tone guidelines at `<dealer>/vocabulary/channel-tones/<channel>.md`.
- Caller-provided context.

## What it writes at runtime

- Nothing persistent. Returns text to caller; caller is responsible for any persistence.

## Recovery branches

- **Compose LLM timeout.** Return error to caller; caller decides whether to retry or fallback.
- **Brand voice missing.** Use default tone; warn in metadata.

## Per-dealer customization

- Brand voice page.
- Per-channel tone pages.
