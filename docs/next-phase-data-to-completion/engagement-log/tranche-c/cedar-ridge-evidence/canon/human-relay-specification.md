---
title: Cedar Ridge Automotive Group human relay specification
type: invariant
status: canonical
slug: human-relay-specification
---
## Approval gates
- ready_to_blueprint
- ready_to_instantiate_runtime
- ready_to_publish_mcp_projections
- ready_to_hand_off_externally
- topology_decided

Each gate requires an operator signature in `engagement-state.yaml`.

## Input requests as smells
When an agent cannot find what it needs, it records a lookup_miss and
surfaces an assumption to the operator. Assumptions are NOT silent.

## Feedback loops that must close
- assumption → resolution → suggested_knowledge_change → KSG promote
- reconciliation_item → resolution → wiki edit or Brain update
- hunch → resolution → wiki or Brain change OR explicit dismissal with rationale

