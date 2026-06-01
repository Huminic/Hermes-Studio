---
id: photo-studio
role: Vehicle photo enhancement + metadata enrichment agent.
channels: [system, file-upload]
scope_contract: governance/agents/photo-studio/scope-contract.md
workflow: knowledge/workflows/vehicle-photos.md
kanban_lane: media-production
enabled: false
status: template
template_lives_at: ~/.hermes/profiles/huminic/governance/agents/templates/photo-studio.md
per_dealer_target: ~/.hermes/profiles/<dealer>/governance/agents/photo-studio.md
---

# photo-studio

Vehicle media agent. Takes raw photos in, emits enhanced versions + tagged metadata.

## Sequence

```mermaid
sequenceDiagram
    participant DS as Dealer staff (uploader)
    participant PS as photo-studio
    participant V as Vision MCP (provider)
    participant FS as <dealer>/media/vehicles/
    participant DSG as <dealer>-data-governor

    DS->>FS: upload raw photos for VIN X
    DS->>PS: enhance + tag for VIN X
    PS->>V: vision_analyze(image) per photo
    V->>PS: detected angle, body part, lighting score
    PS->>PS: filter low-quality + classify gallery position
    PS->>FS: write enhanced versions + per-photo metadata
    PS->>DSG: write vehicle.media_set Brain record
```

## What it reads at runtime

- Raw uploaded photos at `<dealer>/media/vehicles/<vin>/raw/`.
- Existing vehicle Brain record (for VIN matching).
- Per-dealer photo policy at `<dealer>/knowledge/workflows/vehicle-photos.md`.

## What it writes at runtime

- Enhanced photos at `<dealer>/media/vehicles/<vin>/published/`.
- Per-photo metadata sidecar JSON.
- Brain vehicle.media_set record (DSG-gated).

## Recovery branches

- **Vision MCP unavailable.** Mark batch `pending_enhancement`; retry on next dispatch.
- **Low-quality batch.** Surface to dealer staff with quality-tag breakdown; let them decide whether to republish raw or re-shoot.

## Per-dealer customization

- Photo gallery position policy.
- Quality threshold per dealer brand.

## Status caveat

Vision MCP not in launch scope. Template ships for post-launch media pipeline.
