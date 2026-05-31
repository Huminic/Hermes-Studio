---
title: Cedar Ridge Automotive Group integration playbooks
type: invariant
status: canonical
slug: integration-playbooks
---
## VinSolutions
- Auth: per-profile env var (see .env)
- Allowed scopes: federation.read_scopes / comms_* per studio.yaml
- Read: federation.query.vinsolutions
- Write: comms_send_* (where applicable)
- Audit: every call lands in ~/.hermes/mcp-audit.log + comms_log

## Vapi
- Auth: per-profile env var (see .env)
- Allowed scopes: federation.read_scopes / comms_* per studio.yaml
- Read: federation.query.vapi
- Write: comms_send_* (where applicable)
- Audit: every call lands in ~/.hermes/mcp-audit.log + comms_log

## TextMagic
- Auth: per-profile env var (see .env)
- Allowed scopes: federation.read_scopes / comms_* per studio.yaml
- Read: federation.query.textmagic
- Write: comms_send_* (where applicable)
- Audit: every call lands in ~/.hermes/mcp-audit.log + comms_log

## Google Analytics
- Auth: per-profile env var (see .env)
- Allowed scopes: federation.read_scopes / comms_* per studio.yaml
- Read: federation.query.google_analytics
- Write: comms_send_* (where applicable)
- Audit: every call lands in ~/.hermes/mcp-audit.log + comms_log

