# HUM-VIN-006 — MCP Invocation & Readback Contract (Response Times dry-run)

Status: **D3 built + proven; D2 harness proven + torn down.** The only remaining
step is Codex transmitting ONE real Response Times trio through the tool below.

Producer/consumer separation (do not violate): **Codex is the data producer/tester;
Claude is the data-contract owner/consumer.** Claude does not fabricate a "valid" trio
and then also consume+approve it. Claude supplies + operates the transport and the
independent readback; Codex supplies the real trio.

---

## 1. The transport chain

```
Codex (real trio)
  → MCP call: response_times_bundle           [loopback MCP listener, own port]
  → forwards Bearer INGEST_SERVICE_SECRET      [server-held; never caller-supplied]
  → POST /api/ingest/dry-run-bundle            [studio edge, verifyIngestSecret + full validation]
  → atomic 0444 materialize                     [/srv/ingest-dev/dry-run/inbound/<profile>/<capture_id>/]
  → dry-run-watch.sh → dry-run-readback.ts     [Claude's INDEPENDENT reconcile → ACCEPT/QUARANTINE]
```

Nothing in this chain computes a metric, runs the Watchdog, or takes a customer
action. It only writes a trio directory for the reconcile readback.

## 2. Listener (D3) — how it is brought up

File: `central-mcp-ingest-dev/src/dev/vin006/bundle-mcp-server.ts`
(branch `dev/studio-ingest-dev`, commit `b6a0c3b`). Isolated worktree only — NOT the
shared central-mcp (no port 4002 / PM2 / config / dist / production).

```
MCP_BUNDLE_TOKEN=<least-privilege front-door token> \
INGEST_SERVICE_SECRET=<the edge's server-held secret> \
  node_modules/.bin/tsx src/dev/vin006/bundle-mcp-server.ts \
    --port=4113 \
    --edge=http://127.0.0.1:3623/api/ingest/dry-run-bundle
```

- Two independent secrets. `MCP_BUNDLE_TOKEN` gates `/mcp` identity; a caller presents
  ONLY this. `INGEST_SERVICE_SECRET` lives in the listener's env, is forwarded to the
  edge as the bearer, and is never accepted from / returned to / logged for the caller.
- Refuses to start if either secret is unset; refuses a non-loopback `--edge`.

## 3. The MCP tool

- Endpoint: `POST http://127.0.0.1:4113/mcp` (StreamableHTTP, stateless).
- Auth header: `Authorization: Bearer <MCP_BUNDLE_TOKEN>`. Missing/wrong → **401**.
- `tools/list` returns **exactly one** tool: `response_times_bundle`. No other tool.

`response_times_bundle` input (the envelope):

```jsonc
{
  "profile":    "serra-honda | serra-nissan | tony-serra-ford",
  "capture_id": "<[A-Za-z0-9_-]+ — no dots/separators>",
  "source_url": "https://vinsolutions.app.coxautoinc.com/...",
  "raw":        { "filename": "<*.csv>", "content_base64": "...", "sha256": "<64-hex>" },
  "derivative": { "filename": "<*.csv>", "content_base64": "...", "sha256": "<64-hex>" },
  "manifest":   { /* frozen v1 manifest — see SCHEMA_CONTRACT_BROWSER_EXTENSION.md §A.3 */ }
}
```

Return (in `content[0].text`, JSON): `{ http_status, ok, status, profile, capture_id,
raw_sha256, derivative_sha256, ... }`. `isError:true` whenever the edge rejects.
Success `status` is `"materialized"` (first time) or `"idempotent_skip"` (identical
re-send). Any collision on a differing capture_id → **409**, never an overwrite.

## 4. Edge validation gates (all fail-closed; see `src/routes/api/ingest/dry-run-bundle.ts`)

DEV-gated (`DRY_RUN_BUNDLE_ENABLED==='true'`); real auth (`verifyIngestSecret`). Rejects
on: ineligible profile; unsafe capture_id/filename; wrong source host; envelope↔manifest
disagreement (profile, `rooftop.vin_dealer_id` == governed {honda 21043, nissan 21044,
ford 21047}, `coverage.timezone`==America/New_York, capture_id, source_url, filenames);
`schema_version`==`huminic.vinsolutions.response_times_derivative_manifest.v1`;
`derivative_version`==`huminic.vinsolutions.response_times.canonical.v1`; `hold_only` &&
`no_action`; `validation.sales_only_proved` && `pii_minimized`; `validation.state`==
`ready_for_isolated_dev`; sha256 triple-binding (envelope==recomputed==manifest); atomic
0444 write; idempotent-or-409.

## 5. Independent readback (Claude, consumer side)

`scripts/dry-run-watch.sh` polls the inbound and runs `scripts/dry-run-readback.ts`,
which re-derives everything from the authoritative v1 manifest and QUARANTINES on any
mismatch (sha + derivative→raw binding; rooftop→governed; source host; required-core +
provenance headers; PII-forbidden; per-row provenance; RAW Sales-only; NY-local
in-window recompute; full-tuple multiset raw-in-window==derivative; excluded-event
multiset; additive local-field recompute incl. the blank/malformed UTC edge). ACCEPT is
the only path that clears the trio.

## 6. Go-live for the transmission window

1. Bring the harness up: `hs-ingest-dev` → `vite dev --port 3623 --host 127.0.0.1`
   with `DRY_RUN_BUNDLE_ENABLED=true`, the REAL `INGEST_SERVICE_SECRET`, and
   `INGEST_ELIGIBLE_PROFILES=serra-honda,serra-nissan,tony-serra-ford`.
2. Bring the listener up (§2) with the same `INGEST_SERVICE_SECRET` and a fresh
   `MCP_BUNDLE_TOKEN`; hand Codex only the `MCP_BUNDLE_TOKEN` + the `/mcp` URL.
3. Codex transmits ONE trio → expect `materialized`.
4. `dry-run-watch.sh` reconcile → ACCEPT.
5. Tear both down.

## 7. Evidence

- Listener isolation e2e — `bundle-mcp-proof.ts`, commit `95eabe3`, **7/7**: exactly one
  tool; valid call forwards the server-held secret → materialized (mock edge); unknown
  tool refused; missing MCP token → 401; secret only ever travels server→edge.
- Live wiring vs. real harnessed edge — `bundle-mcp-live.ts`, commit `0c6a8fc`, **3/3**:
  wrong ingest secret → edge 401 via MCP; correct auth + invalid bundle → edge's OWN
  validation 400 (`rooftop.vin_dealer_id` mismatch, past auth) via MCP, not an auth
  failure.
- Harness fail-closed (:3623): no-auth→401, wrong-bearer→401, correct-bearer+empty→403
  `profile '' not eligible`.
