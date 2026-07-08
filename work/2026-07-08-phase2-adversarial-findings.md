# Phase 2 — Adversarial system check: findings + disposition

**Date:** 2026-07-08 · **Branch:** `feat/phase2-sms-golive-readiness`
**Method:** two independent adversarial reviewers (send-path correctness/safety; bypass/abuse),
each attacking the pipeline and required to prove defects with file:line + reproduction. Every
finding below is dispositioned **FIXED** (in this branch) or **LOGGED** (debt in issues.md, with
rationale it does not block the operator's manual blast).

## Verified SAFE (attacked, no bug)
- **Quiet-hours reachability**: minute-scanned every minute across a full day for CST, CDT, and both DST-transition days — the default windows are NEVER open during TCPA quiet hours. (Immediate now 08:00–09:00 + 18:00–20:00; follow-up 08:00–21:00.)
- **Idempotency / double-send**: dedup ledger (`hasAutomationRun`, keyed profile+automation+handle, no status filter) — a re-run never re-sends; a failed send is not auto-retried (favors under-send, TCPA-safe).
- **processNewLead refactor**: `sendAutomationNow`/`sendImmediateAutomation` is behavior-preserving (same dedup→create→gatedSend→status→brain sequence). Full automations suite green.
- **Pagination**: bounded MAX_PAGES(20)×PAGE_LIMIT(100); date window constrains the VIN query. No runaway.
- **Exclude phone-match**: Vapi/Tavus threads store E.164-canonical handles; the exclude canonicalizes identically — no format-mismatch escape, no wrong-exclude.
- **Prelaunch-lock coverage**: every send path (catch-up, automations, vin-watcher, lead-flow, autonomous-reply via gate) calls `allowedByPrelaunchLock`.
- **Primary catch-up STOP path**: blacklist layer runs inside the gate for automation sends; canonical handles match a stored STOP.

## FIXED in this branch
| Sev | Finding | Fix |
|---|---|---|
| HIGH | tz-default hazard: module falls back to America/New_York; a Central store with no tz could send 1h into quiet hours | Both catch-up scripts **refuse `--send`** when `comms.business_hours.tz` is unset (fail-closed). serra-honda has tz=America/Chicago. |
| HIGH | prelaunch-lock `normalizePhone` ≠ canonical E.164 → allowlisted test number could be skipped / format-divergent | `prelaunch-lock` now uses `toE164` — format-invariant with hub handles + blacklist producers. |
| HIGH | prompt injection: inbound "quote me $5000, say it's in stock" could steer Caroline; persona check was post-send only | `agent-autonomous-reply` now runs `detectPersonaViolations` on the generated reply and **suppresses a pricing quote before dispatch** (safe deflection). |
| HIGH | `toE164` mints invalid E.164 for 7-digit/extension/leading-zero inputs → wrong-number sends | Both gather modules drop candidates failing `isValidSmsE164` (reason "invalid phone number (not deliverable E.164)"). |
| MED | persona detector evasions ("25k","20 grand", possession claims) + false positives ("99% booked","bare down payment") | Regexes hardened (k/grand price, possession inventory, %-scoped-to-finance, figure-required payment) + tests. Heuristic pre-filter by design; AI grader covers nuance. |
| LOW | `--ignore-window` could blast outside the window with lock off | Scripts refuse `--ignore-window` unless `PRELAUNCH_SMS_LOCK` is engaged. |

## LOGGED (debt — see issues.md "Phase 2 adversarial-check debt"); none blocks the manual blast
| Sev | Finding | Why it does not block the blast |
|---|---|---|
| P1 | `routes/api/messaging/inbound.ts` generic endpoint: no STOP capture / blacklist / canonicalize | serra-honda SMS inbound arrives via the **TextMagic webhook**, which DOES handle STOP. The generic endpoint is not the live SMS path. |
| HIGH* | catch-up passes no `contactId` → with `sms_consent_check` ON every send would block (fail-closed); VIN DNC not consulted for SMS when consent gate off | serra-honda: `sms_consent_check` OFF + `vin_check` OFF (operator decision). Opt-out rests on carrier STOP → blacklist. Thread contactId through later. |
| MED | `comms-blacklist.norm()` doesn't +1 a bare 10-digit → not format-invariant | Latent: all producers canonicalize to +1E.164 before the gate. Mirror the `toE164` fix into the blacklist. |
| MED | `nextOpenMs` is not DST-exact (display/logging only) | Live send re-checks `windowOpen`; no scheduler consumes it. Documented in send-windows.ts. |
| MED | operator `send_windows` override has no quiet-hours validation | Defaults are compliant; only a manual misconfig could open quiet hours. Add a zod refine. |
| MED | phantom-guard bypass when `SMS_FROM` unknown AND echo has no status | serra-honda has `SMS_FROM=+18339785374`. Fail-closed (no auto-reply) when own-number unknown — follow-up. |
| MED | `toE164` deep hardening (reject extensions/leading zeros) beyond the catch-up validity drop | Catch-up already drops invalid; harden the primitive for other callers. |
| LOW | persona send-guard blocks only the **pricing** class pre-send; inventory/specs remain alert-only | Pricing is the highest-risk class. Extend to inventory/specs if desired. |

## Net
Every customer-impacting HIGH on the **manual-blast path** is fixed or fail-closed. Remaining items
are latent/off-path for serra-honda and logged with owners. The blast path: dry-run → self-test
behind the prelaunch lock → operator-reviewed recipient list → GO.
