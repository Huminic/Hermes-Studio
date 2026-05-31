# Tranche E — Huminic-the-company rollup — Report

**Date:** 2026-05-31
**Branch:** `tranche-e-rollup`
**Tests:** 453 → 460 (+7 in rollup.test.ts)
**Build:** clean

## Acceptance criteria status

| Item | Status | Evidence |
|---|---|---|
| E Parent reads from authorized children via existing surfaces | DONE | `rollupQuery()` reads child Brains via `openBrain` + DSG semantics; no new endpoint |
| E No fourth cross-profile access surface | DONE | Rollup goes through (a) existing wildcard token, (b) child-side `rollup:<parent>` scope in `studio.yaml.federation.read_scopes`, or (c) admin token — all existing surfaces |
| E Audit logs parent actor + child set | DONE | `recordAudit('huminic', { target_type:'rollup_query', reason:'…included=…denied=…' })`; test verifies row in parent's metadata_audit |
| E Child must explicitly grant rollup scope | DONE | `childHasGrantedRollup(child, parent)` checks `rollup:<parent>` literal in child's `federation.read_scopes` |
| E Non-granted child denied | DONE | Test `denies child without rollup grant` |
| E Admin token bypass works (intended path) | DONE | Test `admin token (with wildcard) bypasses the per-child grant` |
| E Non-wildcard non-admin token denied | DONE | Test `non-wildcard token without child scope is denied` |
| E Rollup against disallowed table denied | DONE | `metadata_audit` excluded from `ALLOWED_TABLES`; test verifies |
| E Dashboard pattern using dashboard renderer (SHOULD) | DEFERRED | Plugin-native renderer can call `mcp_rollup_query` directly; dashboard component lands in next iteration when operator stands up Metabase or selects an alternative |

## Tool exposed

```
mcp_rollup_query(parent_profile, child_profiles[], table, where?, aggregate?, column?, limit?)
```

ADMIN scope OR wildcard `allowed_profiles: ['*']` required. Each child profile
MUST declare `rollup:<parent>` in its `studio.yaml.federation.read_scopes`
unless the calling token is admin.

## Decisions added to decisions.log

- D-023: rollup grant scope literal is `rollup:<parent-profile>` (e.g., `rollup:huminic`). Lives in the existing `studio.yaml.federation.read_scopes` array rather than a new field. Keeps the SRS "no fourth access surface" rule and reuses existing scope vocabulary.
- D-024: rollup uses `ALLOWED_TABLES` allowlist (omits `metadata_audit` to prevent cross-profile leakage of audit metadata via rollup).
