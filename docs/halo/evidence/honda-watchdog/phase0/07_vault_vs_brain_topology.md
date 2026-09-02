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

## 4. Ownership / access / retention — POLICY PINNED; current enforcement NONCONFORMING

Technical isolation is proven (§§1–3). **Raw retention is lossless** regardless of parse/quarantine
outcome (`src/routes/api/ingest/report.ts` comment: "Lossless raw retention regardless of
parse/quarantine outcome"). This section pins the concrete access-control / retention **policy**.
Per Phase 0 rule and the shadow-correction directive, **no runtime permission was changed** in this
evidence correction; only the current state is recorded and the target policy is pinned.

### 4.1 Current runtime state (observed read-only 2026-09-02, NOT changed)

| Path | Mode | Owner | Conformance |
|---|---|---|---|
| `/srv/ingest-dev/hold` | `0750` (`drwxr-x---`) | `ubuntu:ubuntu` | not 0700 |
| `/srv/ingest-dev/hold/serra-honda` and most `held/`,`quarantine/` children | `0775` (`drwxrwxr-x`) | `ubuntu:ubuntu` | group/other-permissive |
| some children (e.g. `held/crm_sales_gross`) | `0755` (`drwxr-xr-x`) | `ubuntu:ubuntu` | other-readable |
| `/srv/ingest-dev/analytics`, `analytics/serra-honda`, `analytics/brain` | `0775` (`drwxrwxr-x`) | `ubuntu:ubuntu` | group/other-permissive |
| held/quarantine files (`manifest.json`, `original.xlsx`) | `0444` (`-r--r--r--`) | `ubuntu:ubuntu` | world-readable |

**Finding:** least privilege is **NOT** yet enforced — dirs are 0750/0775/0755 (not 0700) and raw
files are 0444 (not 0600), under a single shared `ubuntu` identity with no dedicated service account.

### 4.2 Pinned vault policy (target; authored here, enforced downstream)

1. **Fail-closed admission.** New protected raw admission MUST fail closed until the vault subtree is
   **`0700` on directories and `0600` on files**, OR an equivalent **dedicated service identity**
   (separate service account owning the vault, non-`ubuntu`) is documented and in force. Until then,
   no new protected raw admission is authorized.
2. **Access limitation.** Raw bytes are accessible only to (a) the ingest service identity and
   (b) the Codex acceptance controller, through an **audited operator path**. Claude/Studio receives
   only **minimized derivatives / receipts** (no raw rows, no signed URLs) unless separately
   authorized by Duane.
3. **Audit.** Every raw access is recorded as an audit artifact carrying: **SHA, profile, period,
   actor, time, action, reason.**
4. **Retention (no automatic deletion).** Artifacts are retained **unchanged in dev** pending a
   Duane-approved retention / legal direction. **Legal hold wins** over any retention window.
   Deletion requires **separate explicit approval** and a **manifest / tombstone** record; no silent
   or automatic deletion is permitted.

### 4.3 Disposition

`POLICY PINNED / ENFORCEMENT NONCONFORMING`. The policy above is pinned now; current runtime
(4.1) does not conform to 4.2(1). This gap is carried as a **Phase 3 admission gate** (enforce
`0700`/`0600` or a dedicated service identity before any new protected raw admission) in
`09_conflict_register.json` C-02. Runtime permissions are intentionally left unchanged in this
Phase 0 evidence correction.

## 5. Prohibited-access confirmation

All findings are from static, read-only code inspection and locally-run unit tests. No live store,
network, Gmail, or VinSolutions access was used.
