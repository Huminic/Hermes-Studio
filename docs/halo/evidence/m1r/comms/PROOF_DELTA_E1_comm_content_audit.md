# Gate 4E — Proof Delta E1 (communication-content / NLP audit + disposition)

**Branch:** `codex/halo-295-unshrinkable-inputs`. One writer. **Status:** submitted for review,
NOT self-certified. **Bounded gate:** a re-audit of exactly the **75** `nlp_content_capable_pending`
IDs from the committed Gate 4C1 capability delta (`docs/halo/contract/sw295-comm-capability-delta.json`),
to decide which — if any — are **definition-exact and DETERMINISTIC** from the accepted, restricted,
Sales-only Enhanced Communication Log (weekly) over 2026-08-24..30 at Honda 21043, Nissan 21044,
Ford 21047. No PDF/customer-final, no production, no browser/Gmail/schedule/CRM/external mutation,
no other gate. Raw message content is read ONLY in `/tmp/halo-295-comm-20260901`, reduced to
aggregate features, and discarded; no body, name, phone, email, or per-row token is committed.

## 1. Result — 5 promotable (deterministic), 70 HELD

Of the 75, **5** are definition-exact deterministic content conditions and are PROMOTED
(evaluated in Proof Delta E2): **SW-021, SW-142, SW-145, SW-149, SW-150**. The other **70** are
EXPLICIT HOLDs. The 225-cell rooftop disposition = 75 IDs × 3 rooftops (15 evaluated + 210 held).

Category tally over the 75:

| category | count | meaning |
| -------- | ----- | ------- |
| `definition_exact_deterministic_now` | 5 | promoted (literal surface pattern; no meaning inferred) |
| `definition_exact_via_governed_semantic_provider` | 63 | the condition IS a semantic judgement (sentiment/intent/objection/entity/language/keyword-meaning); a governed model would evaluate it exactly, but none is approved in-boundary → HELD |
| `requires_ratified_semantic_definition_or_threshold` | 4 | SW-131 (architecture note), SW-171 (ALL-CAPS rule vs auto-acronyms), SW-203 (reading-level mismatch threshold), SW-289 (personalization-score formula) |
| `outside_accepted_evidence` | 3 | SW-030 (CSI/complaint), SW-073 & SW-183 (CRM manager notes) |

## 2. Provider-governance verdict (directive step 4) — no in-boundary semantic provider

Read-only repository inventory: the only AI paths are the customer-facing chat route
(`src/routes/api/customer/chat.ts`, external OpenAI-direct / Hermes inference) and an external-LLM
conversation-insights prompt (`src/server/reports/ai-conversation-insights.ts`); the leads
classifier and lead-flow are explicitly deterministic ("No NLP"). **None is a governed, in-boundary
semantic provider approved to classify this tenant's restricted communication content**, and routing
bodies through the external chat provider would transmit customer text outside the approved
boundary. Therefore **no live model is called in Gate 4E**, and every genuinely-semantic condition is
HELD with this documented provider/privacy gap — not proxied into a keyword rule.

## 3. Why the 5 are deterministic and definition-exact (not proxies)

Each promoted condition is a LITERAL surface pattern computable without understanding meaning:

- **SW-142** unfilled merge tags — an unfilled merge tag is the template placeholder markup
  (`{{FirstName}}`, `{FirstName}`, `[[…]]`, `<<…>>`, `%%…%%`, `%…%`, `$…$`) surviving verbatim into
  the sent message. Deterministic delimiter regex; enumerated syntaxes disclosed (recall boundary).
- **SW-149** rep mean word count `< 15` — deterministic whitespace tokenisation (token contains a
  Unicode letter/number); "average < 15 words" is the literal metric.
- **SW-150** rep only sends links — a message is link-only iff it has ≥1 URL and, with URLs removed,
  no letters/numbers remain; "only" is evaluated over ALL the rep's eligible messages.
- **SW-145** same body to `> 5` customers/day — exact trim-normalised body identity grouped by
  calendar day, counting distinct customers; "same message body" is literal.
- **SW-021** identical body to `> 70%` of leads — a rep's most-frequent identical (trim-normalised)
  body across `> 70%` of that rep's distinct leads; "identical" and ">70%" are literal.

Conditions requiring message MEANING (sentiment, intent, objection, competitor/entity, language,
sarcasm, apology-as-concept, "high intent", question-vs-`?`) are HELD, not approximated — a keyword
list is a proxy and an automatic fail. SW-171 is HELD because its "ALL CAPS" disjunct cannot be
separated from auto-domain acronyms (SUV, VIN, AWD, MSRP) without a ratified rule; promoting only
its `!!!`/`???` part would drop a named disjunct and change the condition.

## 4. Privacy + isolation

Message Content is read in-memory in `/tmp` only; the isolated reader (`comm-content-reader.ts`)
reuses the frozen Gate 4C1 `readCommWeekly` for ALL fail-closed validation (schema, Sales-only,
window, uniqueness, one-rooftop) and binds its content re-read to those validated rows 1:1. Emitted
features are non-PII (integer/boolean/one-way body-identity hash) and, like the frozen derived rows,
are NEVER committed — only aggregate cells are. The frozen reader/contract bytes are UNCHANGED.

## 5. Matrix artifact

`docs/halo/contract/sw295-comm-content-matrix.json` — the 75-row execution matrix (condition,
category, disposition, promoted spec or hold reason) + the 225-cell rooftop disposition + the
provider verdict + category tally. Candidate set asserted equal to the committed
`nlp_content_capable_pending` 75 (unique, canonical).

**Gate 4E-R2 (shadow repair — GOVERNING CONTRACT).** EVERY candidate row — promoted AND held —
carries a `frozen_e1_spec` with EXACTLY this hardcoded literal 14-key schema (the frozen E1
contract, `frozen_e1_spec_schema` in the artifact):

`population, numerator, denominator, event_sequence, window, threshold, minimum_sample,
minimum_history, exclusions, ambiguity_handling, join_requirements, unit, rank_direction,
missing_data_behavior`.

- **PROMOTE** rows map every field explicitly from the actual evaluator / literal condition
  (executable): the literal `threshold` (<15 words, >5 customers, >70% leads, merge-tag present,
  link-only), `unit = ratio`, `rank_direction = lower_is_better`, the evaluator population/
  numerator/denominator/event_sequence/exclusions/ambiguity_handling, `join_requirements = none`,
  `minimum_sample = none (no invented floor)`, `missing_data_behavior = unresolved, not zero`.
- **HOLD** rows populate ONLY governed known facts — catalog `population` (if explicit), the
  capability `join_or_nlp_required` (+ missing item) as `join_requirements`, the permanent
  Sales-only `exclusions`, and the standing `missing_data_behavior = "unresolved; missing is never
  zero"` — and set every unknown/condition-specific field to the exact sentinel `unresolved (held)`
  / `not_applicable (held)`. Crucially, `window` and `minimum_history` are `unresolved (held)`: the
  universal one-week evaluation period is NOT used as a condition-specific window/history. No
  threshold, event sequence, unit, ambiguity rule, or sample is inferred. Non-executable by
  construction.

**The frozen contract is independent of implementation.** The regression test declares the literal
14-key list itself (it does not import or derive it from code) and asserts all 75 rows conform, that
HOLD frozen specs are non-executable, and — a **negative regression** — that the
implementation-derived evaluator-metadata schema (`CONTENT_SPEC_KEYS`, from `PromotedSpec`) is a
DIFFERENT key set that CANNOT satisfy the frozen contract.

**The separate `spec` field (Gate 4E-R1) is EVALUATOR METADATA ONLY** (its 14 keys are the
`PromotedSpec` shape: `metric_id, title, population, numerator, denominator, detection_threshold,
window, zero_denominator, source_fields, baseline_basis, rank_direction, false_positive_controls,
false_negative_controls, limitations`). It does **NOT** satisfy or replace `frozen_e1_spec`; it is
retained only as auxiliary evaluator detail.

## Committed artifacts (SHA-256 first 16)

| File | sha256:16 |
| ---- | --------- |
| `src/server/reports/comms/comm-content-features.ts` | `cba283ce2109a66f` |
| `src/server/reports/comms/comm-content-reader.ts` | `ab34883ce0f875ef` |
| `src/server/reports/comms/comm-content-metrics.ts` | `0b82ed09af039e66` |
| `docs/halo/contract/sw295-comm-content-matrix.json` | `c92debbd13971af8` |

Each `sha256:16` is recomputed from the current committed bytes by
`src/test/comm-evidence-hashes.test.ts`, so a later formatting cycle that desyncs this proof fails
the suite instead of shipping a stale hash.
