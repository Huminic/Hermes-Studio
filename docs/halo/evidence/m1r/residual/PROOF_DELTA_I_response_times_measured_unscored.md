# PROOF DELTA I — VinSolutions Response Times measured-but-unscored evidence (nothing promoted)

**Gate:** 4I · **Revision:** I1 · **Accepted week:** 2026-08-24..2026-08-30 (America/New_York)

**Rooftops:** 21043 (Serra Honda of Sylacauga) · 21044 (Serra Nissan of Sylacauga) · 21047 (Tony Serra Ford)

**Boundary:** Sales-only (Service/Parts permanently excluded; missing is never zero)

> **What this gate did, and did not do.** Gate 4I ingested ONE completed real read-only browser
> capture of the VinSolutions **Response Times** report for the three governed Sales rooftops and
> recorded it as **supplemental, measured-but-unscored** evidence for SW-013, SW-016 and SW-017. It
> **promotes nothing.** The portfolio is unchanged: **17 evaluated / 278 unresolved** (51 / 834 / 885
> cells). SW-013, SW-016 and SW-017 remain in the 122 Gate-4G HOLD partition. No Gate 4H artifact is
> modified; the Gate 4H ledger, customer contract, and CRM control remain byte-identical.

---

## 1. Evidence provenance and chain-of-custody

| Field                   | Value                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------ |
| capture_id              | `HUM-VIN-006-RT-20260901-21043-21044-21047`                                          |
| capture_method          | Computer Use accessibility-tree read of an authenticated VinSolutions Chrome session |
| source host             | `vinsolutions.app.coxautoinc.com` (Sales-only VinSolutions surface)                  |
| period                  | 2026-08-24..2026-08-30 · comparison 2026-07-25..2026-08-23 (previous 30 days)        |
| lead type               | **Sales** selected; Service & Parts / Service / Parts **not** selected               |
| native CSV/XLSX control | none found — UI aggregates + Total Responded drilldown captured                      |
| external mutation       | none (read-only)                                                                     |
| raw evidence            | retained internal working copy, **out-of-repo** (aggregate-only commit rule)         |
| raw byte count          | 39,173                                                                               |
| raw sha256              | `554d8dfe8791e76e45a00627b8584a476633b7f9fbf15257a172300bdd9b7b41`                   |

The raw per-lead rows carry internal-only rep names and are **never committed to the repository or
rendered to the customer**. Only the immutable reference (byte count + sha256), the transcribed
aggregates, and the independently-recomputed SW-013 figures are committed.

**Counts verified against Good Leads (responded population).** The Total Responded drilldown row count
exactly equals the report Good Leads count for every rooftop: Honda **54**, Nissan **22**, Ford **19**.
The total-lead drilldown (83 / 31 / 24) is retained only as an internal cross-check and is **not** used
for any calculation. Response buckets reconcile to Total Responded; `no_response = 0` in the responded
population; `good + bad = total_leads` with `duplicate ⊆ bad` per the report definition ("Bad Leads
includes Duplicate leads"). Zero Service/Parts data and zero customer PII were captured.

---

## 2. Nothing promotes — each reason tied to committed governance

The generator reads the **committed** Gate 4G matrix and fails closed unless SW-013/016/017 are
non-promotable. For all three, the committed `frozen_e1_spec` has all nine required-resolved fields
(`numerator`, `denominator`, `event_sequence`, `window`, `threshold`, `minimum_sample`,
`minimum_history`, `ambiguity_handling`, `unit`) marked `unresolved (held)` and `rank_direction`
`not_applicable (held)`.

**SW-013** — "After-hours leads with **no response** by opening +15 min." Not promoted, because:

1. The committed `frozen_e1_spec` is entirely held; there is no ratified spec and no committed
   baseline/rank to score or rank against.
2. **Definition mismatch.** The committed condition is a **no-response** population; this capture
   measures **late response among good leads that WERE responded to** (Response later than Actionable
   +15). Different population, different event. Promoting would require altering the committed
   definition to fit the data — forbidden by the goal.
3. The committed **promotion-probe** already ruled SW-013 `not_promotable` / `definition_compatible:
false` (dashboard AVERAGE, not the definitional median; after-hours filtering changes the
   population; blank responders excluded), and the committed **acquisition-contract** marks the
   `readonly_browser_capture` route `candidate_unproved` / `closes_cells_only_when_proved: true`. This
   capture resolves neither median-vs-average, a business-hours calendar, nor an untouched-lead policy.

**SW-016** — "Weekend/holiday response SLA breach rate >20%." Not promoted: committed spec fully held;
the weekend open+15 figures are **supplemental only** (unratified SLA definition; no holiday calendar).

**SW-017** — "Phone leads with no outbound call attempt within 5 minutes." Not promoted: **evidence
absent** — the Response Times table does not identify phone lead origin or an outbound call attempt.
Missing is never zero.

### The measured-unscored layer does not weaken evaluated criteria

Gate 4I adds a strictly **non-evaluated** claim layer (`measured_unscored`, figures tagged
`computed_observation`) so real measured evidence can be reported transparently **without** being
presented as a scored, ranked, or promoted metric. It does **not** relax `frozen_e1_spec`: a metric is
evaluated/promotable only when the nine fields are resolved **and** a committed baseline/rank exists.

---

## 3. Independent recompute of the SW-013 supplemental figure

The after-hours late-response denominator / breaches / rate was **independently recomputed** from the
retained raw responded-row timestamps (Received < Actionable ⇒ after-hours; Response > Actionable +15 ⇒
breach) and exactly matched the captured `derived_checks`:

| Rooftop      | denominator | breaches | rate  |
| ------------ | ----------- | -------- | ----- |
| 21043 Honda  | 27          | 7        | 25.9% |
| 21044 Nissan | 10          | 7        | 70.0% |
| 21047 Ford   | 7           | 3        | 42.9% |

These are `computed_observation` supplemental figures, **not** an SW-013 score.

---

## 4. Customer-safe observations (Sales-only; recoverable lead opportunity only)

The customer artifact carries per-rooftop observations with claim layers **separated** — observed_fact
(measured), inference (a defensible conclusion), hypothesis (plausible, needs more evidence). Every
string is plain (Gate 4H `plainify` + guards), contains **no rep name, no customer identity, no
Service/Parts data, no PII**, and makes **no cars-sold or ROI estimate** (no accepted same-period
close-rate denominator or formula exists) — opportunities are framed only as **recoverable
lead-response opportunity**. Score / rank / variance are withheld pending a ratified baseline.

Highlights (observed_fact): Honda avg **6:09**, 57% over 30 min, after-hours late-answer 25.9%; Nissan
avg **7:27**, 55% over 30 min, 41% within 15 min (polarized), after-hours 70.0%; Ford avg **8:24** vs
prior **6:21**, 63% over 30 min, after-hours 42.9% (deterioration vs prior).

---

## 5. Controls

- **Focused tests** (`src/test/gate4i-response-times-audit.test.ts`): 18/18 — provenance/host,
  Sales-only controls, chain-of-custody (39,173 bytes + sha256), counts = Good Leads (54/22/19),
  bucket reconciliation, after-hours rate recompute, all-nine-held ⇒ non-promotable for
  SW-013/016/017, `promoted:false` + reasons, measured-unscored does-not-relax, accounting 17/278 =
  51/834/885 unchanged, SW-013/016/017 still unresolved/4G, claim-layer separation, no ROI/cars-sold,
  no rep/person-name or responded-row leak (planted-name guard), and the deterioration-vs-prior split.
- **Hash guard** (`src/test/gate4i-evidence-hashes.test.ts`): recomputes every SHA-256 below from the
  committed bytes.
- Deterministic (byte-identical rerun); Prettier + ESLint clean; changed-file `tsc` adds no new errors.
- No PDFs. No browser / CRM / Gmail / schedule / main / production / unrelated changes.

### Recorded hashes (sha256, first 16 hex)

| File                                                                                  | sha256:16          |
| ------------------------------------------------------------------------------------- | ------------------ |
| `src/server/reports/residual/gate4i-response-times.ts`                                | `99f155e7904e593b` |
| `scripts/m1r-residual/build-gate4i-response-times-audit.ts`                           | `eb1e371bbb05f67b` |
| `docs/halo/evidence/m1r/residual/gate4i-response-times-measured-unscored-ledger.json` | `3d3e0ae280dcf740` |
| `docs/halo/evidence/m1r/residual/gate4i-customer-safe-observations.json`              | `4320d186ca781079` |
| `src/test/gate4i-response-times-audit.test.ts`                                        | `32179a8a5041d580` |

Each `sha256:16` is recomputed from the current committed bytes by
`src/test/gate4i-evidence-hashes.test.ts`.
