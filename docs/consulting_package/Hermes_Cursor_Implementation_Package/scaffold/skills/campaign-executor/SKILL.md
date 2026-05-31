---
name: campaign-executor
type: skill
status: shipped
version: 0.1.0
scope: per-profile
ksg_gated: false
dsg_gated: true
---

# campaign-executor

Tranche D skill stub. Loaded per-profile via the profile's `distribution.yaml`
when the workflow needs this capability.

## Inputs
Inputs vary per skill; see the SRS Part 5 D.2 mapping.

## Outputs
All outputs land through MCP brain_* or comms_* tools and are
DSG-gated. Audit lands in mcp-audit.log + metadata_audit.

## Activation
Conditional — only activates when the controlling agent has a workflow
that calls into this skill via MCP. No standalone activation.
