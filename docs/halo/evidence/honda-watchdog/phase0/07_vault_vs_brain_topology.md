# Phase 0 — pre-admission vault vs admitted Honda landing/Brain topology

**Reconstructed at (UTC):** 2026-09-02 (read-only code inspection; INGEST HEAD `4c41df11d`, MAIN HEAD `9ac76c58b`)
**Objective:** pin the exact separation between the neutral pre-admission quarantine/evidence
**vault** and the admitted Honda **landing area / Brain (InfoStore)**, and prove from code that
contaminated/quarantined bytes cannot be promoted.

## 1. Two physically separate roots

| Store | Root (default) | Definition |
|---|---|---|
| Hold/quarantine vault | `$INGEST_HOLD_ROOT` (default `~/.hermes/ingest-hold`) | INGEST `src/server/ingest/hold-store.ts` `holdRoot()` (~lines 148-151) |
| Per-profile Brain (InfoStore) | `$BRAIN_PROFILES_ROOT/<profile>/brain/brain.db` (default `~/.hermes/profiles/<profile>/brain/brain.db`) | MAIN `src/server/brain-store.ts` `resolveBrainPaths()` (~lines 117-136) |

- **Honda Brain:** `~/.hermes/profiles/serra-honda/brain/brain.db` (one tenant per DB; `profile`
  column partitions rows). **Honda quarantine:** `$INGEST_HOLD_ROOT/serra-honda/quarantine/<sha256>/`.
- Held (accepted-eligible) artifacts land at
  `$INGEST_HOLD_ROOT/serra-honda/held/<report_kind>/<period>/<sha256>/` — a **different subtree**
  from `.../quarantine/<sha256>/` (`hold-store.ts` `manifestDir()` ~lines 580-584). No path overlap;
  the two roots can be on separate volumes.

## 2. Delivery status lifecycle and the promotion guard (fail-closed)

- **Validation state is set at land time**, one of `held | quarantined`
  (`hold-store.ts` `HoldValidationState` ~line 59; `quarantineReceipt`/`heldReceipt` ~lines 439-444).
- **Promotion searches ONLY the `held` namespace** and refuses any non-held manifest:
  - `promote-held-to-analytics.ts` `findHeldDirs()` searches `<holdRoot>/<profile>/held` only
    (~lines 102-119) — never `quarantine`.
  - Guard (~line 133): `if (manifest.validation_state !== 'held') throw new PromoteAbort(...)`.
- **Quarantined deliveries write ZERO analytical rows:** `ingest-delivery-store.ts` (~lines
  109-112) returns `accepted_rows: 0` and inserts no `ingest_row` when `status === 'quarantined'`.
- **Active-row queries filter `d.status = 'accepted'`** (`ingest-delivery-store.ts` ~line 182), so
  quarantined entries never surface to Watchdog metrics.

## 3. Quarantine is terminal (proven by test, reproduced 2026-09-02)

- `src/test/ingest-hold-idempotency.test.ts` (~lines 65-78): a current-quarantine **never replays a
  stale held** of the same SHA — it returns `quarantined` and withholds, while the historical held
  artifact is preserved as evidence. **Reproduced this session: 3/3 PASS.**
- `promote-held-to-analytics.test.ts`: **12/12 PASS** — promotion guard rejects non-held.
- No code path updates/reclassifies a quarantined entry (`grep` for `UPDATE…quarantine` → none).

**Conclusion (code-proved):** contaminated bytes (the quarantined Honda ROI/CAGE/Communication
deliveries) live in a separate quarantine subtree, write no rows, are excluded from analytics
queries, and cannot be promoted (guard requires `validation_state == 'held'`). Quarantine is
terminal for that artifact — it cannot be sanitized downstream into acceptance.

## 4. Ownership / access / retention — UNRESOLVED

- **Technical isolation is proven** (above). **Raw retention is lossless** regardless of
  parse/quarantine outcome (`src/routes/api/ingest/report.ts` comment: "Lossless raw retention
  regardless of parse/quarantine outcome").
- **NOT provable from repo files:** an explicit access-control policy (who may read the vault vs
  the Brain), deletion criteria, and retention windows. No such policy document was found in either
  repo.
- **Disposition:** `UNRESOLVED / reported_pending_phase0_verification` — the vault-vs-Brain
  access-control and retention policy must be authored (owner: Codex/Duane) before it can be pinned
  as proved. Recorded in `09_conflict_register.json`.

## 5. Prohibited-access confirmation

All findings are from static, read-only code inspection and locally-run unit tests. No live store,
network, Gmail, or VinSolutions access was used.
