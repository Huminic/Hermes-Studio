# PROOF DELTA J — Alternate read-only CRM report pass, reconciled into the five CRM checks (0 promoted)

**Gate:** 4J · **Revision:** J1 · **Accepted week:** 2026-08-24..2026-08-30 (America/New_York)

**Pass rooftop:** 21047 (Tony Serra Ford) · **Observed:** 2026-09-01 · **Boundary:** Sales-only (Service/Parts permanently excluded; missing is never zero)

> **What this gate did, and did not do.** Gate 4H seeded five material-extreme devil's-advocate CRM
> checks (SW-034, SW-049, SW-050, SW-111, SW-114) as `required_not_performed`. Gate 4J performs that
> required alternate in-boundary check as a **read-only browser pass** and reconciles what was found.
> It **promotes nothing**, exported nothing, opened no customer row, saved no parameter, made no
> mutation, and retained no PII. **Capability discovered ≠ data acquired.** The portfolio is unchanged:
> **17 evaluated / 278 unresolved** (51 / 834 / 885 cells). No Gate 4H artifact is modified — the five
> records here **supersede** the Gate 4H `required_not_performed` seed states as of 2026-09-01, while
> Gate 4H remains a truthful historical snapshot (it opened no CRM access).

---

## 1. Reconciliation states (each supersedes `required_not_performed`; none asserts a measured value)

| Metric | Metric meaning                                      | Gate 4J state               | Candidate source                    |
| ------ | --------------------------------------------------- | --------------------------- | ----------------------------------- |
| SW-034 | closed ÷ write-ups (write-to-close)                 | `performed_candidate_found` | Deal Performance                    |
| SW-049 | current-week GPU vs trailing-30-day avg             | `performed_candidate_found` | Deal Performance                    |
| SW-050 | negative-front-gross new deals ÷ eligible new deals | `performed_schema_only`     | DMS Sales Flat Export (schema only) |
| SW-111 | rising volume × falling close (trend)               | `performed_candidate_found` | Deal Performance                    |
| SW-114 | show rate × close rate (composite)                  | `performed_no_route_found`  | none found in this pass             |

**Exact remaining requirement per metric** (nothing closes without one of these — all committed
`frozen_e1_spec` fields remain held, so none could close without a new policy choice):

- **SW-034** — **semantic ratification** that "Leads Desked" (or "Pencils Desked") is the write-up
  denominator, then a **dated Sales-only window** at all three rooftops. No native "Write Up" /
  "Writeup" / "Sales Log" / "Deal Log" report exists.
- **SW-049** — **semantic ratification** that "sold average gross" is the GPU definition, then
  **acquisition of both** the current-week and the trailing-30-day windows, and the trailing-30-day
  **baseline** the >15%-below comparison uses.
- **SW-050** — a **proved, dated, PII-safe window** export (no date limiter was proved; the export
  carries extensive buyer/co-buyer PII and was deliberately not exported), plus a **join/definition**
  isolating eligible new-car deals with non-blank Front Gross at all three rooftops.
- **SW-111** — **window acquisition** of ≥2 comparable periods (multi-week history), plus a **ratified
  composite trend threshold** for "rising" volume and "falling" close.
- **SW-114** — a **show-rate source** joined to sold outcomes and a **non-zero write-up total** at all
  three rooftops (the accepted Dashboard write-up TOTAL is observed 0), plus a **ratified high-show /
  low-close threshold**.

Capability discovered is strictly separated from data acquired: for all five, `data_acquired = false`
and `value_measured = false`. Missing remains **unknown, never zero**.

---

## 2. Fail-closed safety observation — Desk Log Service-Dept leakage

Under the Desk Log Type control `-- All Sales Leads --`, a visible row carried Source = **"Service
Dept"**. The Type control alone therefore does **not** guarantee a Sales-only population. Any Sales-only
use of Desk Log (or any typed lead list) requires an explicit **source-level exclusion of Service**; a
Type label is insufficient. Leaked/absent Service is excluded, never counted; missing is never zero.
Desk Log was not used as a metric source and was not exported. No customer or rep identity was retained.

This is why the Deal Performance candidacy above is recorded with its **Sales-only** Lead Type selection
proved (Service / Parts Order / Unknown unselected), rather than relying on a Type label.

---

## 3. Nothing closes; accounting unchanged

Every committed `frozen_e1_spec` for the five is still held (numerator, denominator, minimum_history,
threshold `unresolved (held)`; rank_direction `not_applicable (held)`). No existing accepted evidence
plus frozen spec closes any of the five without a new policy choice, so the partition is preserved:

- **17 evaluated / 278 unresolved** — the five remain unresolved / Gate-4G HOLD in the committed
  Gate 4H ledger.
- **51 / 834 / 885** evaluated / unresolved / total cells.

---

## 4. Customer-safe summary

The customer artifact says only that **additional in-CRM report routes were identified** that could
support these follow-up checks once the required setup and agreed definitions are in place, that **no
value was measured**, and that **missing information is unknown, never zero**. It exposes no internal
control, no report title, no PII, and claims no measurement (fail-closed guard on a denylist of report
titles / control names / PII columns).

---

## 5. Controls

- **Focused tests** (`src/test/gate4j-crm-reconciliation-audit.test.ts`): 12/12 — read-only/no-export/
  no-PII controls, Deal Performance Sales-only (Service/Parts Order/Unknown unselected), the Desk Log
  Service-Dept fail-closed safety observation, exactly the five seeds superseded, each carries a
  `performed_*` state (no longer `required_not_performed`), none promoted / no data acquired / no value
  measured / never zero, the exact remaining-requirement kind per metric, all five committed specs
  still held, accounting 17/278 = 51/834/885 with the five still unresolved/4G, and customer text with
  no internal-control/report/PII leak (planted-term guard throws).
- **Hash guard** (`src/test/gate4j-evidence-hashes.test.ts`): recomputes every SHA-256 below from the
  committed bytes.
- Deterministic (byte-identical rerun); Prettier + ESLint clean; changed-file `tsc` adds no new errors;
  all Gate 4H artifacts byte-identical.
- No PDFs. No main / production / Gmail / VinSolutions / schedule / dashboard / unrelated changes.

### Recorded hashes (sha256, first 16 hex)

| File                                                                    | sha256:16          |
| ----------------------------------------------------------------------- | ------------------ |
| `src/server/reports/residual/gate4j-crm-reconciliation.ts`              | `0b257e16797bf963` |
| `scripts/m1r-residual/build-gate4j-crm-reconciliation-audit.ts`         | `d4fee699cd76afe6` |
| `docs/halo/evidence/m1r/residual/gate4j-crm-reconciliation-ledger.json` | `cf1a9dbebc66f2ad` |
| `docs/halo/evidence/m1r/residual/gate4j-customer-safe-summary.json`     | `965ad9c159f37856` |
| `src/test/gate4j-crm-reconciliation-audit.test.ts`                      | `bc92d1c76ba55f08` |

Each `sha256:16` is recomputed from the current committed bytes by
`src/test/gate4j-evidence-hashes.test.ts`.
