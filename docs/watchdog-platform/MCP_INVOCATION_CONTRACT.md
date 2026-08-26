# HUM-VIN-006 — MCP Invocation & Readback Contract (dry-run transmission)

Status: **D3 + D4 + D5 built, proven, torn down.** Two least-privilege MCP routes + a
server-side arming wrapper are ready. Remaining: Codex transmits the real deliveries.

Producer/consumer separation (do not violate): **Codex is the data producer/tester;
Claude owns the data-contract, the transport, and the independent readback.** Claude does
not fabricate a "valid" delivery and then also consume+approve it.

Withheld semantics (everywhere): only a **locally-ACCEPTED** delivery flows onward. Any
refusal / quarantine / stale / duplicate stays **missing/withheld — never zeroed**.

---

## 1. What gets transmitted

| Route | Tool | Count | Delivery |
|---|---|---|---|
| Response Times | `response_times_bundle` (:4113) | **3 trios** (serra-honda, serra-nissan, tony-serra-ford) | `deliver-trio.sh` × 3 |
| Native scheduled XLSX | `xlsx_family_hold` (:4123) | **14 accepted originals** — Honda 5, Nissan 5, Ford 4 (incl. both Aug-23 + Aug-24 Sales Communication) | `deliver-xlsx.sh` × 14 |

7 other Monday XLSX outcomes remain rejected/quarantined at the producer → **withheld** (not sent).

## 2. Arming (server-side; one command)

```
bash /home/ubuntu/central-mcp-ingest-dev/scripts/vin006/arm-dry-run.sh
```

Generates two MCP tokens + one ingest secret **server-side** into `.runtime/secrets.env`
(0600, never printed / never to the Mac / never on argv), then starts — fully detached —
the isolated studio edge (`:3623`, `DRY_RUN_BUNDLE_ENABLED=true`, `INGEST_HOLD_ROOT=/srv/ingest-dev/hold`),
the **RT** one-tool listener (`:4113`), the **XLSX** one-tool listener (`:4123`), and the
readback watcher (an external watcher it did not spawn is left untouched). It verifies
fail-closed readiness (edge no-auth→401, both `/healthz`→200) and prints only non-secret
facts. `disarm-dry-run.sh` tears down 3623/4113/4123 (+ an owned watcher) and removes secrets.

## 3. Delivery (per item, over SSH stdin)

Codex streams each envelope over SSH stdin; the wrapper sources the token **server-side**
and calls the **actual MCP tool** (genuine Central-MCP evidence, not a raw edge POST):

```
# Response Times — run 3× (one per profile)
ssh <server> 'bash /home/ubuntu/central-mcp-ingest-dev/scripts/vin006/deliver-trio.sh' < <profile>-trio.json
# Native XLSX — run 14× (one per accepted original)
ssh <server> 'bash /home/ubuntu/central-mcp-ingest-dev/scripts/vin006/deliver-xlsx.sh' < <family>-envelope.json
```

Each prints only the non-secret result JSON. Exit 0 iff accepted (`materialized` /
`held` / `replay` / `idempotent_skip`); non-zero = withheld.

## 4. Route A — `response_times_bundle` (:4113)

Envelope: `{ profile, capture_id, source_url, raw{filename,content_base64,sha256},
derivative{filename,content_base64,sha256}, manifest{…v1…} }` (frozen manifest = browser
extension §A.3). Forwards to `POST /api/ingest/dry-run-bundle` → atomic 0444 materialize
into `/srv/ingest-dev/dry-run/inbound/<profile>/<capture_id>/`. Edge gates: exact
`schema_version`/`derivative_version`/`validation.state=ready_for_isolated_dev`,
rooftop→governed dealer (honda 21043 / nissan 21044 / ford 21047), source host, sha256
triple-binding (envelope==recomputed==manifest), PII/sales-only, idempotent-or-409.

## 5. Route B — `xlsx_family_hold` (:4123, SEPARATE token/port)

Accepts the **existing governed hold envelope unchanged** (the `--emit-envelope` shape).
Least-privilege — authorizes ONLY the six native SCHEDULED XLSX families and nothing else
(enforced in the handler, since the MCP SDK does not validate inputSchema):
`source_type=gmail_scheduler`, exact OOXML `.xlsx`, `report_kind ∈ {sales_comm_log,
cage_kpi, lead_source_roi, dealership_performance, crm_sales_gross, appointments}`, exact
producer fields (`profile, filename, mime_type, report_kind, period_hint, subject, sender,
gmail_message_id, received_at, content_base64, sha256, size_bytes`), `additionalProperties:false`.
**Browser CSV/PDF and `browser_export` cannot traverse this listener.** Reuses `runHoldCli`
(full provenance-union / format-allowlist / magic-byte / integrity / catalog-route gates),
then `POST /api/ingest/hold` (Studio re-verifies → `held` | `replay` | 422 quarantine).

## 6. Secrets & least-privilege

- `MCP_BUNDLE_TOKEN` gates `/mcp` on :4113; `MCP_XLSX_TOKEN` gates `/mcp` on :4123. A caller
  presents only the one token for the route it uses.
- `INGEST_SERVICE_SECRET` lives only in the listeners' env; it is the forwarded hold/edge
  bearer and is never accepted from / returned to / logged for the caller.
- Each listener exposes exactly ONE tool; non-loopback edge/endpoint refused.

## 7. Independent readback (Response Times)

`scripts/dry-run-watch.sh` → `scripts/dry-run-readback.ts` re-derives from the authoritative
v1 manifest and QUARANTINEs on any mismatch. ACCEPT is the only path that clears a trio.
Readback JSON: `/srv/ingest-dev/dry-run/readback/<profile>/<capture_id>.readback.json`.

## 8. Evidence

- RT listener isolation — `bundle-mcp-proof.ts` **7/7**; live vs real edge — `bundle-mcp-live.ts` **3/3**.
- XLSX listener isolation — `xlsx-hold-mcp-proof.ts` **13/13** (guard withholds all out-of-family;
  valid Honda `sales_comm_log` reaches edge → held; secret only server→edge; 1 tool; 401 without token).
- Wrapper live vs harnessed studio: MCP-native delivery reaches the real edges; guard/validation
  rejections are withheld with no secret leak; arm returns cleanly; disarm removes all + secrets.
- Known studio debt (non-blocking): hold edge returns 500 (not 422) on an **unparseable** XLSX
  (synthetic bytes only; real originals parse) — see `issues.md` 2026-08-26.
