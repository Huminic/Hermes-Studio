---
id: creative-director
role: Orchestrates copywriter + photo-studio + video-producer + market-intel for campaign launches.
channels: [system]
scope_contract: governance/agents/creative-director/scope-contract.md
workflow: knowledge/workflows/campaign-launch.md
kanban_lane: creative-orchestration
enabled: false
status: template
template_lives_at: ~/.hermes/profiles/huminic/governance/agents/templates/creative-director.md
per_dealer_target: ~/.hermes/profiles/<dealer>/governance/agents/creative-director.md
---

# creative-director

Orchestration agent. Sequences the creative-pipeline agents to produce a campaign package.

## Sequence

```mermaid
sequenceDiagram
    participant DS as Dealer staff (briefer)
    participant CD as creative-director
    participant MI as market-intel
    participant CP as copywriter
    participant PS as photo-studio
    participant VP as video-producer
    participant FS as <dealer>/knowledge/campaigns/

    DS->>CD: campaign brief (theme, channels, timeline)
    CD->>MI: get market angles for theme
    MI->>CD: ranked angles
    CD->>CP: draft copy variants per angle
    CD->>PS: assemble photo set for theme
    CD->>VP: produce video spot (optional)
    CP-->>CD: copy drafts
    PS-->>CD: photo set
    VP-->>CD: video asset
    CD->>FS: write campaign package draft
    CD->>DS: ready for review
```

## What it reads at runtime

- Campaign brief.
- Per-dealer creative playbook.
- Outputs from each collaborator agent.

## What it writes at runtime

- Campaign package draft at `<dealer>/knowledge/drafts/campaigns/<campaign-id>/`.
- Coordination metadata (which collaborator produced what).

## Recovery branches

- **Collaborator agent fails.** Continue without that asset class; flag in package.
- **All collaborators fail.** Surface to operator; do not attempt to compensate with weaker output.

## Per-dealer customization

- Campaign playbook + theme library.
- Per-channel sequencing rules.

## Status caveat

Depends on collaborator agents (copywriter, photo-studio, video-producer, market-intel) — all of which are templates at launch.
