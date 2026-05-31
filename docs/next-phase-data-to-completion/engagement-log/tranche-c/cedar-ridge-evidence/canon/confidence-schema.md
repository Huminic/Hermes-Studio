---
title: Cedar Ridge Automotive Group confidence schema
type: invariant
status: canonical
slug: confidence-schema
---
## Strategic confidence (Admiralty Code)
- Source reliability: A (completely reliable) ... F (cannot be judged)
- Information credibility: 1 (confirmed by independent sources) ... 6 (cannot be judged)
- Use the pair (e.g. `B-2`) on any record that influences strategy.

## Tactical confidence (records)
- `canonical` — agreed truth; protected; KSG-gated
- `under-review` — pending validation
- `deprecated` — no longer authoritative; retained for audit

## Publication rule
DSG refuses to publish a record with confidence_label=F as canonical.

