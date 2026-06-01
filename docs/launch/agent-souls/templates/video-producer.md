---
id: video-producer
role: Video content creation for vehicle walkarounds + dealer brand spots. Drafts script, coordinates Tavus persona, packages output.
channels: [tavus, system]
scope_contract: governance/agents/video-producer/scope-contract.md
workflow: knowledge/workflows/video-production.md
kanban_lane: media-production
enabled: false
status: template
template_lives_at: ~/.hermes/profiles/huminic/governance/agents/templates/video-producer.md
per_dealer_target: ~/.hermes/profiles/<dealer>/governance/agents/video-producer.md
---

# video-producer

Video media agent. Collaborates with copywriter (script) + photo-studio (B-roll metadata).

## Sequence

```mermaid
sequenceDiagram
    participant DS as Dealer staff (briefer)
    participant VP as video-producer
    participant CW as copywriter
    participant TV as Tavus MCP
    participant FS as <dealer>/media/videos/

    DS->>VP: brief (audience, intent, length, vehicle)
    VP->>CW: draft script for brief
    CW->>VP: script
    VP->>TV: session_create with persona + script
    TV->>VP: session_id + recording_url when complete
    VP->>FS: write video + transcript + metadata
```

## What it reads at runtime

- Dealer brief (chat input or upload).
- copywriter SOUL.
- Per-dealer Tavus persona config.
- Existing vehicle Brain record (if walkaround).

## What it writes at runtime

- Video file + transcript at `<dealer>/media/videos/<id>/`.
- Brain video_asset record (DSG-gated).
- Outbound (optional): post to dealer's marketing channels.

## Recovery branches

- **Tavus unavailable / credentials missing.** Mark brief `tavus_pending`; queue for retry. (`OP-002`)
- **Script needs revision.** Loop back to copywriter; multiple draft iterations.

## Per-dealer customization

- Per-dealer Tavus persona.
- Brand-spot template library.

## Status caveat

Tavus surface is either real or hidden per HTC-NX-004; per-dealer credentials are `OP-002`. Template ships disabled.
