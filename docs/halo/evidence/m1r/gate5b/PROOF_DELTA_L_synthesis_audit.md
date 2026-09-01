# PROOF DELTA L — Gate 5B customer-facing consultant synthesis

**Gate:** 5B · **Revision:** L4 (R3 corrective) · **Accepted week:** 2026-08-24..2026-08-30 (America/New_York)

> **R3 corrective (complete standalone PDF-consumer contract).** The report-model is now the COMPLETE,
> validated one-file input the PDF generator needs, built by the standalone reader from a dealer bundle
> plus that dealer's appendix partition ALONE. The enriched bundle embeds the notification candidates
> (3, `activated=false`), a `visibility_plan` (grouped themes), and a `coverage_summary`; the appendix
> gives every one of the 295 entries a **specific customer-safe title/label** (catalog title for
> Sales-relevant not-measured metrics — whole-word Service/Parts/DMS neutralized; "Separate
> operational-domain metric" for the 36 out-of-domain). The model carries dealer name/ID, accepted
> week and freshness, executive narrative, four clusters (structured facts and typed narrative/
> implication/hypotheses/actions), cross-cluster synthesis, ranked opportunities, the ROI scenario,
> inert notification candidates, coverage 17/278/295, visibility themes, and the complete 295-entry
> appendix. The reader **fails closed** on missing sections, malformed typed claims/citations,
> incomplete facts, strict enum/nested violations (operational_target.kind/value_display/comparator/
> direction, rating, confidence, peer_rank.of, evidence.period.end/freshness, finite value/rank
> bounds), an invalid appendix status (no ignored cells), a valued not-measured cell, an activated
> notification candidate, unsafe customer language, or coverage that is not exactly the SW-001..SW-295
> catalog set. The emitted one-file model carries **no** internal filenames / Gate 5A / internal-audit /
> raw-evidence metadata (built_from/built_without removed), so the whole file passes the customer-safety
> scan. Values, targets, ranks, confidence, benchmark mappings, ROI arithmetic, notification
> definitions/activation, and the 51/834/885 accounting are unchanged; Gate 5A and Gate 4H/4I/4J are
> byte-identical; the cross-dealer / notification / ROI / coverage ledger bytes are unchanged from R2.

> **R2 corrective (standalone consumer contract + typed claims).** (3) **Standalone complete fact
> contract.** Each dealer bundle's `clusters[].facts[]` is now a full `CustomerFact` (metric_id,
> customer label, exact Gate 5A value + display, unit, operational target with comparator/direction,
> native + display variance, rating, peer rank + tie, confidence, customer-safe source + freshness +
> period, numerator/denominator, and reference-only industry context when present). The 295×3 appendix
> evaluated cells add confidence + customer-safe source + freshness; not-measured cells stay missing
> (no value) with friendly reason/unlock. A new **standalone reader** (`customer-report.ts`) assembles
> the full per-dealer model from the bundle + that dealer's appendix partition ALONE — it imports no
> Gate 5A / internal-audit / raw evidence — returning 17 fully-structured evaluated facts + 278
> not-measured, and failing closed on duplicates / missing IDs / non-295 coverage / incomplete facts /
> a not-measured value. Three `gate5b-report-model-<dealer>.json` artifacts are emitted by that reader
> as standalone-consumer evidence; this is the only input contract the PDF generator will consume.
> (4) **Typed claim layers.** The executive narrative and every cluster narrative are now typed claim
> objects (claim / text / cites); actions carry `claim: recommendation` with owner/cadence/
> success_measure/effort/impact. Every inference/hypothesis cites ≥2 evaluated metrics or explicitly
> notes a single-metric observation, and every cited ID is present in that dealer's evaluated fact set.
> The Cluster-D hypothesis no longer says "write" (SW-033 is not cited there) and uses bounded
> "showroom follow-through" language for its SW-045/SW-046 citations. **No metric value, classification,
> rank, target, benchmark mapping, ROI operand/arithmetic, notification activation, or the 51/834/885
> accounting changed** (unchanged-value join proven in tests); Gate 5A and Gate 4H/4I/4J artifacts are
> byte-identical; the `cross-dealer`, `notification`, `roi`, and `coverage` ledger bytes are unchanged
> from R1. R1's Sales-only boundary and narrowed SW-012/SW-090 claims are preserved.

> **R1 corrective (two customer-projection acceptance defects).** (1) **Permanent Sales-only boundary
> in customer projection.** All customer-facing artifacts (per-dealer synthesis, coverage-expansion,
> 295×3 appendix, cross-dealer and notification ledgers) now contain **zero** whole-word Service/Parts
> (case-insensitive). Catalog items outside this Sales report's governed domain (the 36 withheld) are
> grouped into a neutral "Separate operational domain" theme — "This metric belongs to a separate
> operational domain and is not part of this Sales report", next step "separate-domain reporting would
> require a separately governed analysis" — never naming the excluded domains. The customer guard now
> fails closed on whole-word service/parts; the internal audit may still state the exclusion boundary
> and is intentionally excluded from the customer scan. (2) **Narrowed SW-012 / SW-090 claims to
> measured definitions.** Every "never worked" statement is replaced with "no tracked response within
> the first 30 minutes"; every "ownership is clean" / "rather than assignment" assertion is replaced
> with bounded wording (assignment timeliness passed this specific two-hour check; later ownership and
> execution remain separate questions), and the assignment-vs-execution idea is now an explicit
> **hypothesis** that does not rule out assignment quality. The "Showroom execution and ownership"
> heading is preserved. **No metric value, evidence classification, peer rank, benchmark mapping, ROI
> arithmetic, or the 51/834/885 accounting changed.** Gate 5A and Gate 4H/4I/4J artifacts are
> byte-identical; `gate5b-notification-automation-ledger.json` and `gate5b-roi-scenario-ledger.json`
> bytes are unchanged from L1.

**Rooftops:** 21043 (Serra Honda of Sylacauga) · 21044 (Serra Nissan of Sylacauga) · 21047 (Tony Serra Ford)

**Boundary:** Sales-only (Service/Parts permanently excluded; missing is unknown, never zero)

> **Scope.** Gate 5B turns the committed Gate 5A comparison + peer-rank ledgers and the committed
> Gate 4H partition into a deterministic, customer-safe automotive-consultant synthesis. It alters **no**
> metric value, rank, classification, baseline mapping, or the **51 / 834 / 885** accounting, and it
> computes **no** new evaluation. Every narrative is a pure template of committed facts (byte-identical
> rerun). No PDFs. Gate 5A and Gate 4H / 4I / 4J artifacts are byte-identical.

---

## 1. Per-dealer synthesis (all three rooftops)

Each dealer bundle contains an executive narrative (what is working, the largest controllable
opportunity, how the evidence connects) and **four evidence clusters** using **all 17** evaluated
metrics, each metric appearing **exactly once**:

- **A. Response consistency** — SW-011, SW-012, SW-015. The template explicitly detects the pattern
  where a healthy median coexists with untouched leads / rep outliers and states that store-average
  speed can mask inconsistency.
- **B. Conversation effectiveness** — SW-021, SW-022, SW-133, SW-142, SW-145, SW-149, SW-150.
  Distinguishes observed message flags from inferred causes.
- **C. Appointment conversion** — SW-031, SW-032, SW-033, SW-041. Connects set → show → no-show →
  write; separates follow-through / rep-quality / confirmation / logging as **hypotheses**, not faults.
- **D. Showroom execution & ownership** — SW-045, SW-046, SW-090. A zero test-drive value is
  labeled a possible logging effect, never proof that no activity occurred.

Each cluster carries measured facts (value, operational-target comparison, three-store peer rank),
a plain narrative, an evidence-backed implication, hypotheses to test, and a prioritized action plan
(owner from the allowed role vocabulary, cadence, success measure, effort/impact). Claim layers are
separated throughout: **fact / inference / hypothesis / recommendation**.

## 2. Cross-cluster synthesis and ranked opportunities

Cross-cluster interactions are emitted per dealer (e.g. healthy median + untouched leads + low set;
low set + soft show + a conversation flag; healthy assignment + weak follow-through). **Every
cross-cluster conclusion cites ≥2 measured metrics or is labeled a hypothesis.** Opportunities are
ranked by a deterministic evidence weight (off-target severity × cluster leverage × confidence ×
peer position), never by rhetoric.

## 3. Notifications / automation (nothing activated)

Candidates are built only from observed evaluated **breach** signals; each carries trigger, audience,
timing, payload, guardrails, and whether it is `notification_only` or
`external_action_requires_approval`. **Nothing is activated or sent.**

## 4. Bounded vehicle / ROI scenarios (no dollars)

For each dealer the ROI ledger computes, from accepted operands, the **appointment gap to the 25%
operational target** (`max(0, 0.25 × leads − appointments_set)`), the **additional shows** if the gap
closed (`gap × current_show_rate`), and **incremental units** under a labeled low/base/high
show-to-sale range. The high bound (0.41) is cited **only** as dated Foureyes H2 2023 reference context,
never as a dealer's measured rate. The show rate uses this dealer's accepted formula (shows over all
appointment rows this period) — grounding the earlier SW-032 denominator note in the accepted formula
and current-week evidence rather than the earlier 23-row example. Formulas, assumptions, confidence,
sensitivity, and no-causal-attribution warnings are included. **No dollar value is shown** — no accepted
store-specific gross with lineage exists this cycle.

## 5. Coverage-expansion plan + 295×3 appendix (customer-friendly; fully accounted)

The coverage plan groups all **278** unresolved metrics by logical theme and next visibility unlock,
using only customer-facing phrases ("Not measured this cycle", "Next visibility unlock") — no
hold / quarantine / blocked / withheld / limitation language. The 295×3 appendix lists **885** cells,
each exactly once: **51 evaluated** (value / basis / variance / peer rank / evidence retained) and
**834 not-measured** (reason + next-unlock retained). Every SW ID is accounted for.

## 6. Controls

- **Focused tests** (`src/test/gate5b-synthesis-audit.test.ts`): 34/34 — three dealers; 17 metrics used
  exactly once per dealer; cross-cluster conclusions cite ≥2 or hypothesis; ROI gap/shows/units
  recompute and dollars null with reference-only high bound; 885-cell exactness (51/834, unique);
  278 unresolved grouped once with customer-friendly language only; ranks/baselines unchanged vs Gate
  5A; privacy guards with planted-term + non-role-owner fail-closed; notification contract complete
  and not activated; **plus R2/R3**: the standalone reader assembles the full package from one bundle +
  its appendix partition, the report-model carries every PDF section, all 295 appendix entries have a
  specific label, the exact SW-001..SW-295 catalog set is enforced, strict enums/nested fields and the
  shadow malformed-probe set (SW-999 / bogus-status / banana / sideways / missing-nested) are rejected,
  and the whole one-file model passes the customer-safety scan.

**Contractual vs non-contractual.** The **exact 278-metric-ID set** carried by the visibility plan and
the not-measured partition is **contractual** (validated to equal the not-measured ID set and, with the
17 evaluated, the exact SW-001..SW-295 catalog). The **grouping of those 278 into ~28 visibility
themes is NON-contractual** presentation and may be regrouped in a later gate without breaking the
consumer contract, provided the union of theme IDs still equals the 278 exactly.

- **Hash guard** (`src/test/gate5b-evidence-hashes.test.ts`): recomputes every SHA-256 below.
- Deterministic (byte-identical rerun); Prettier + ESLint clean; changed-file `tsc` adds no new errors.
- Only Gate 5B files changed; Gate 5A + Gate 4H/4I/4J byte-identical. No PDFs; nothing sent/activated.

### Recorded hashes (sha256, first 16 hex)

| File                                                                        | sha256:16          |
| --------------------------------------------------------------------------- | ------------------ |
| `src/server/reports/gate5b/synthesis.ts`                                    | `2102c293db498ebe` |
| `src/server/reports/gate5b/customer-report.ts`                              | `556cfef08ee490a5` |
| `scripts/m1r-gate5b/build-gate5b-synthesis.ts`                              | `b8c9166461884898` |
| `src/test/gate5b-synthesis-audit.test.ts`                                   | `1a5b1637f9500940` |
| `docs/halo/evidence/m1r/gate5b/gate5b-synthesis-21043.json`                 | `0687c5edc290bd99` |
| `docs/halo/evidence/m1r/gate5b/gate5b-synthesis-21044.json`                 | `ac9f475744b085a4` |
| `docs/halo/evidence/m1r/gate5b/gate5b-synthesis-21047.json`                 | `69e8b3f77c2ecca9` |
| `docs/halo/evidence/m1r/gate5b/gate5b-cross-dealer-opportunity-ledger.json` | `5367fb8b36b01a61` |
| `docs/halo/evidence/m1r/gate5b/gate5b-notification-automation-ledger.json`  | `87f7cdc13bdd3537` |
| `docs/halo/evidence/m1r/gate5b/gate5b-roi-scenario-ledger.json`             | `6a4e045c7f6a78e4` |
| `docs/halo/evidence/m1r/gate5b/gate5b-coverage-expansion-plan.json`         | `d8787db62973be99` |
| `docs/halo/evidence/m1r/gate5b/gate5b-customer-appendix-295x3.json`         | `68f31f1a49c08494` |
| `docs/halo/evidence/m1r/gate5b/gate5b-report-model-21043.json`              | `04c3f965e1d087e9` |
| `docs/halo/evidence/m1r/gate5b/gate5b-report-model-21044.json`              | `10dcfe6e1ba1fd73` |
| `docs/halo/evidence/m1r/gate5b/gate5b-report-model-21047.json`              | `1d37f783eeb59ba6` |
| `docs/halo/evidence/m1r/gate5b/gate5b-internal-audit.json`                  | `23b1306d7a789d34` |

Each `sha256:16` is recomputed from the current committed bytes by
`src/test/gate5b-evidence-hashes.test.ts`.
