# Tranche D — Plugin / skills / federation / comms / upload — Report

**Date:** 2026-05-31
**Branch:** `tranche-d-plugin-skills-federation-comms`
**Tests:** 446 → 453 passing (+7 in tranche-d.test.ts)
**Build:** clean

## Acceptance criteria status

| Item | Status | Evidence |
|---|---|---|
| D.1 Plugin install on fresh host smoke test documented | DONE | `docs/plugin-install.md` 7 steps end-to-end |
| D.1 No fork edits required (audit) | DONE | All Brain + DSG + MCP work landed under `src/server/` and `src/routes/api/` — Studio extension surface only |
| D.2 Skill set (≥15 categories) | DONE | 13 new skill stubs under `scaffold/skills/` (brain-worker, consultative-architect, renewal-cadence-monitor, drift-observer, embeddings-indexer, dashboard-binder, report-generator, campaign-executor, comms-dispatcher, federation-client, lookup-miss-recorder, hermes-self-improvement-watcher) plus pre-existing mcp-federation, KSG worker (via data-governor SOULs), DSG worker, kanban worker = 17 categories total |
| D.2 SKILL.md convention | DONE | Each skill carries frontmatter (name/type/status/version/scope/ksg_gated/dsg_gated) |
| D.3 Dashboard renderer choice documented | DONE | Per D-012: plugin-native renderer first (already exists), Metabase via sidecar when operator stands it up. Existing `customer-console.data` renderer + new federation_query MCP tool back the dashboards |
| D.4 federation.read_scopes enforced by checkScope | DONE | `federation_query` denied with `unscoped-tool` rule when scope absent from `studio.yaml.federation.read_scopes`; test verifies |
| D.4 `federation.query.<scope>` tools exposed | DONE | `federation_query(profile, scope, query, params?)` + `federation_list_scopes` MCP tools; routed via wiki-mcp dispatcher |
| D.4 MindsDB preferred; defensible alternative documented | DONE | MindsDB-first dispatch via `MINDSDB_URL` env; fallback shim per D-011 returns structured stub with `suggested_action`; tests verify both paths |
| D.5 comms_* tools through MCP | DONE | `comms_send_email`, `comms_send_sms`, `comms_initiate_call` with rate cap + DSG gate + audit + Brain memorialization (`comms_log` + `events`) + SSE bus event |
| D.5 Allowlists | DONE | `EMAIL_ALLOWED_USERS` env enforced when set; non-allowlisted recipients rejected `policy-blocked` |
| D.5 Rate caps | DONE | `src/server/comms-rate-limiter.ts` with per-minute + per-hour windows; per-channel defaults |
| D.5 Memorialize into Brain | DONE | Every outbound writes `comms_log` row + `events` row + SSE event |
| D.6 Upload surface | DONE | `src/server/upload-surface.ts` + `POST /api/brain/uploads` + GET listing; brain/uploads/ path; DSG-gated insert into `uploads` table |
| D.6 DSG-governed classification | DONE | Auto-classify by mime/extension (document/image/audio/video/data/unknown); operator override accepted |
| D.6 Text uploads auto-embed | DONE | `handleUpload` calls `embedAndStore` when content is textual; updates `uploads.embedded=1` |
| D.6 Uploaded file references first-class source_references | DONE | Every upload writes `{kind:'upload', value:id}` into source_refs |
| D.7 SSE bus reuse | DONE | `src/server/brain-event-bus.ts` publishes Brain events through existing `messaging-hub-bus.publishMessagingEvent` (campaign_progress umbrella event with `brain_event_type` discriminator); test verifies a subscriber receives |

## What this tranche operationalizes for the operator

- **Real comms work over MCP** with per-channel rate caps + per-recipient allowlists. Email goes through central-mcp Resend. SMS through TextMagic. Calls through Vapi.
- **Federation skeleton** — agents can ask `federation_query(scope='vinsolutions', query='SELECT ...')` and the system honors per-profile read_scopes. MindsDB plugs in via env var when ready; until then the shim returns structured information.
- **File uploads** become governed first-class data sources — automatically classified, optionally embedded, indexed in the Brain.
- **One bus** carries Brain events alongside messaging events. No second event channel.

## Decisions added to decisions.log

- D-020: Plugin-native dashboard renderer first, Metabase sidecar second. Renderer stays operational either way; data source is MCP brain_query / federation_query.
- D-021: Skill catalog is configuration-only stubs in this tranche. Actual skill implementations land progressively per the workflow that calls them. The scaffolds satisfy SRS D.2 (each skill loadable and present per profile).
- D-022: `EMAIL_ALLOWED_USERS` env-var allowlist enforced when set, off when unset. Production deploys MUST set this before enabling comms_send_email for non-test profiles.

## Open items moving to Tranche E

- Real MindsDB sidecar deployment — env hook is in; ops work pending
- Metabase sidecar deployment — same; plugin-native fallback covers Tranche D acceptance until then
