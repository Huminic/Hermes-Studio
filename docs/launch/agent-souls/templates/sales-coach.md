---
id: sales-coach
role: Coaches dealer sales staff via chat. Reads thread transcripts + offers per-conversation improvement suggestions.
channels: [chat]
scope_contract: governance/agents/sales-coach/scope-contract.md
workflow: knowledge/workflows/sales-coaching.md
kanban_lane: coaching
enabled: false
status: template
template_lives_at: ~/.hermes/profiles/huminic/governance/agents/templates/sales-coach.md
per_dealer_target: ~/.hermes/profiles/<dealer>/governance/agents/sales-coach.md
---

# sales-coach

Inward-facing coaching agent. Dealer-staff-only (not customer-facing).

## Sequence

```mermaid
sequenceDiagram
    participant ST as Sales staff (chat user)
    participant SC as sales-coach
    participant CMS as messaging-hub (transcripts)
    participant KB as <dealer>/knowledge/coaching/

    ST->>SC: open chat "review my last 5 conversations"
    SC->>CMS: query staff's threads
    SC->>SC: analyze tone, missed-cues, follow-up gaps
    SC->>KB: read coaching playbook
    SC->>ST: structured feedback (5 strengths, 3 improvements)
```

## What it reads at runtime

- Staff member's messaging-hub threads (scoped to their assigned threads only).
- Per-dealer coaching playbook at `<dealer>/knowledge/coaching/`.
- Tone + intent rubrics.

## What it writes at runtime

- Coaching session transcript.
- Optional: anonymized aggregated coaching report (no per-individual surfacing).

## Recovery branches

- **No threads to review.** Helpful default response (suggest a recent transcript to discuss).
- **Sensitive content (customer PII).** Apply standard PII redaction per `src/server/pii-redactor.ts` patterns before any coaching analysis.

## Per-dealer customization

- Coaching playbook content.
- Per-staff vs aggregated rubric.
