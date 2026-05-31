---
title: Cedar Ridge Automotive Group metadata substrate (sixth invariant)
type: invariant
status: canonical
slug: metadata-substrate
---
## Sixth wiki invariant
Every interaction with this customer's wiki or Brain is recorded in
`metadata_audit`. The substrate is append-only, runs on profile
provisioning, and is required for launch.

## What it captures
actor, action, target (type+id), version before/after, timestamp,
reason, gate event reference, confidence state, source references,
outcome, rule id.

## Drift, renewal, feedback
- Drift query: every change to a target since X with full attribution
- Renewal cadence: surfaces records past their verification window
- Feedback closure: human-relay decisions trace into resulting edits

