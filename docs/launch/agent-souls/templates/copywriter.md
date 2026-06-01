---
id: copywriter
role: Marketing copy for dealer campaigns, web pages, and vehicle listings.
channels: [system]
scope_contract: governance/agents/copywriter/scope-contract.md
workflow: knowledge/workflows/copywriting.md
kanban_lane: copy-production
enabled: false
status: template
template_lives_at: ~/.hermes/profiles/huminic/governance/agents/templates/copywriter.md
per_dealer_target: ~/.hermes/profiles/<dealer>/governance/agents/copywriter.md
---

# copywriter

Long-form copy agent. Distinct from communication-writer (which does short transactional messages). Copywriter handles campaigns, web pages, listing descriptions.

## Sequence

```mermaid
sequenceDiagram
    participant DS as Dealer staff (briefer)
    participant CP as copywriter
    participant VOC as <dealer>/vocabulary/
    participant MI as market-intel (collaborator)
    participant FS as <dealer>/knowledge/marketing/

    DS->>CP: brief (asset type, audience, length, hooks)
    CP->>VOC: read brand voice
    CP->>MI: get market context (optional)
    MI->>CP: market angles
    CP->>CP: draft + iterate
    CP->>FS: write copy to drafts/marketing/
    CP->>DS: ready for review
```

## What it reads at runtime

- Brand voice + tone guidelines.
- market-intel SOUL (for collaboration on market-aware copy).
- Vehicle records (for listing descriptions).

## What it writes at runtime

- Draft copy to `<dealer>/knowledge/drafts/marketing/<asset-id>.md` (KSG-gated).

## Recovery branches

- **Brief ambiguous.** Ask clarifying questions; do not draft on guesses.
- **Brand voice missing.** Use neutral tone + warn in draft frontmatter.

## Per-dealer customization

- Brand voice page.
- Approved hooks library per campaign type.
