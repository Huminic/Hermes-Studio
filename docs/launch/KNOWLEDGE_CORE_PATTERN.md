# Knowledge-Core Pattern — Decision Memo

**From:** spike `scripts/spike-knowledge-core.ts` (throwaway), run live against the real
`huminic` profile, composing real production helpers.
**Date:** 2026-06-05. **Status:** decision memo — recommends a pattern; nothing built for production.

---

## TL;DR

The pattern works, and the spike surfaced one structural truth that should drive everything:

> **The DATA side already has a guardian in the write-stream. The KNOWLEDGE side does not.**
> Make the knowledge side match the data side. That single move is the spine.

---

## What was proven (live, on `huminic`, real helpers)

| # | Scenario | Result | Helper exercised (real) |
|---|---|---|---|
| A | **Recall** "what is our time off policy" | ✅ returned the *right whole page* (`policies/time-off.md`) | `customer-wiki` read/list |
| B | **Guarded publish** "call off 3 days in advance" | ✅ located → consistency-ok → drafted 1→3 → rule-gate-ok → **published** | `ksg-gate` + `customer-wiki` write |
| C | **Guarded block** "never need to notify before calling off" | ✅ **BLOCKED (consistency)** — canon unchanged | consistency stage |
| D | **Rule gate** write to `governance/` | ✅ **BLOCKED (protected-tree)** | real `evaluateWikiSave` |
| — | **Memorialize to Brain** | ⚠️ **BLOCKED by the Data Semantic Guardian** — `unknown-actor` | real `insertEvent → dsgGate` |

Row "—" is the headline. My write used a fake actor (`spike:knowledge-core`); the brain's
`writeOne` runs `dsgGate` inline and **correctly rejected it**. The guardian-in-the-stream
*exists and works* — on the data side. (My spike first mis-reported this as "ok"; I only
caught it by verifying. That's the discipline the Constitution must make mechanical.)

## The four dimensions — recommended pattern

### 1. Wiki — **addressing, not RAG** ✅ confirmed
Recall returns the right *whole, governed page* by topic match against title/path/headings.
No vectors, no chunk-soup, provenance intact. **Keep knowledge addressable.** Vectors stay
on the data side (below). Recall stays keyword/addressing until the corpus is big enough to
miss — we're nowhere near that.

### 2. Guardian — **make it structural on the knowledge side** (the spine)
- **Data side (today):** `writeOne → dsgGate → write`. Guardian is *in the stream*. Real. Works.
- **Knowledge side (today):** `writeCustomerWikiFile` writes directly. `ksg-gate` is only a
  *rule* pre-check an API *may* call; the *semantic* governor (consistency/contradiction) is
  **unbuilt** (the spike used a deterministic stand-in).
- **Recommendation:** route the wiki write helper through an inline `ksgGate` exactly the way
  `writeOne` routes through `dsgGate`. Two stages: **(1) rule gate** (real, `ksg-gate`) then
  **(2) semantic consistency** (the LLM-reasoned data-governor — env-gated, needs an inference
  key). Pipeline proven end-to-end: `locate → consistency → propose → rule-gate → publish`,
  with contradiction and protected-tree blocks both firing.

### 3. MCP / recall — **a gated tool, following the federation pattern**
`federation-mcp-handlers.ts` is the template: a tool descriptor + a handler that **scope-gates,
audits, and memorializes to the Brain.** Expose `knowledge_recall(profile, query)` the same way.
That makes recall available to **any agent** (the "knowledge gateway"), gated and audited — not
a private convenience. A per-turn auto-inject *hook* can layer on later; raw `.md` as an MCP
*resource* is the simple read primitive underneath. (Answer to the earlier question: yes, an
agent can read the `.md` over MCP directly — no embedding step required.)

### 4. Data — **the vector seam is on the data side, and it already exists**
`federation_query` (scopes + MindsDB/shim) is the data-retrieval seam. Vectors plug in *there*,
later — **not** in the wiki. Build nothing now; the boundary is clean and confirmed.

## The emerging invariant (for the Constitution)

> **No write to canon — knowledge or data — except through a guardian gate, under a recognized
> actor identity, memorialized to the Brain.**

The **data side already enforces this**. The **knowledge side must be made to match.** That one
sentence is enforceable, testable, and resolves most of the "disjointed/inconsistent" risk.

## Honest gaps — what the real build takes (not done here)

1. **Semantic governor is unbuilt + env-gated.** The deterministic stand-in proved the pipeline;
   real consistency reasoning needs an inference key + the data-governor agent wired as the
   stage-2 check on the knowledge write path.
2. **Knowledge write path is not structurally gated.** `writeCustomerWikiFile` must route through
   the gate inline (mirror `writeOne`), so the guardian can't be bypassed.
3. **Recognized-actor identity.** Guarded writes + memorialization must run as a real
   agent/governor identity, not an ad-hoc label (the DSG correctly rejects unknown actors).
4. **Two-tree tension.** There are *two* knowledge trees: `company-wiki/` (what the customer sees)
   and `knowledge/inbox|drafts|published` (the promotion pipeline). They're disconnected. Decide:
   **published canon = the customer-visible tree**, with inbox/drafts as staging behind it. The
   capture→draft→published promotion (`evaluatePromote`, ordering-enforced) is the safe path for
   conversation-capture — capture to inbox, guardian promotes.

## Recommended next move (after you read this)

Smallest real build that turns the spine into production, in order:
1. Make the wiki write path **structurally gated** (inline `ksgGate`), mirroring `writeOne`.
2. Wire the **data-governor agent** as the stage-2 semantic check (env-gated; degrades to
   rule-gate-only when no inference key).
3. Unify the **two trees** (published = customer-visible).
4. Then write **Constitution v0** around the invariant above, and load Huminic's real wiki data.

`scripts/spike-knowledge-core.ts` is throwaway — delete once this is read. The 3 seed pages it
wrote to `huminic/company-wiki/` (value-proposition, glossary, time-off) are genuine starter
content; keep or replace them when real Huminic data is loaded.
