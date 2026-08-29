/**
 * Halo Data — EVIDENCE-CONSTRAINED AI narration (M2, isolated dev).
 *
 * Layers an optional LLM-written narrative ON TOP of the deterministic grounded
 * narrative, WITHOUT relaxing any grounding guarantee. The model receives ONLY
 * structured aggregate report-card facts (profile, coverage, per-metric
 * slug/label/display/current-state, provenance source + native period, industry
 * state, baseline state, limitations). It never sees customer PII or raw
 * conversations. The model MUST return strict JSON whose factual claims each cite
 * the metric slug(s) they rest on; the output is then VALIDATED before display:
 *
 *   - every numeric token must appear in the allowed structured facts,
 *   - every cited evidence slug must be a real card slug,
 *   - no benchmark / scoring / ranking language,
 *   - no unsupported causal / attribution language,
 *   - any factual (numeric) claim must carry evidence.
 *
 * On provider-unconfigured, timeout, malformed output, or ANY validation failure
 * we FALL BACK to the deterministic narrative and expose a concise fallback
 * reason + provider mode (never credentials). There is never a blank/error report.
 *
 * The completion dependency is INJECTABLE so tests exercise every path without a
 * live provider. Default = `completeChat` (the same Hermes→OpenAI→unconfigured
 * path used by Ask-AI). Reads nothing; pure transform over already-built facts.
 */
import { completeChat, type ChatResult } from '../dashboard-ask'
import type { HaloReportCard } from './halo-report-card'

/** Injectable single-shot completion (same shape as `completeChat`). */
export type CompletionFn = (
  system: string,
  user: string,
  opts?: { maxTokens?: number; temperature?: number },
) => Promise<ChatResult>

export type HaloAiClaim = { text: string; evidence: string[] }

/** Structured aggregate facts handed to the model — NO PII, NO raw conversations. */
export type HaloAiFacts = {
  profile: string
  sales_only: true
  window_days: number
  coverage: HaloReportCard['coverage']
  metrics: Array<{
    slug: string
    label: string
    category: string
    unit: string
    display: string | null
    current_state: 'value' | 'no_current_data' | 'withheld'
    provenance_source: string | null
    native_period: { start: string | null; end: string | null } | null
    industry_state: string
    baseline_state: string
  }>
  limitations: string[]
}

export type NarrationDeps = { complete?: CompletionFn; timeoutMs?: number }

const DEFAULT_TIMEOUT_MS = 20_000

/** Build the model-facing structured facts from an already-assembled report card. */
export function buildHaloAiFacts(card: HaloReportCard): HaloAiFacts {
  return {
    profile: card.profile,
    sales_only: true,
    window_days: card.window_days,
    coverage: card.coverage,
    metrics: card.cards.map((c) => ({
      slug: c.slug,
      label: c.label,
      category: c.category,
      unit: c.unit,
      display: c.display,
      current_state: c.current.state,
      provenance_source: c.provenance?.source ?? null,
      native_period: c.provenance?.period ?? null,
      industry_state: c.industry.state,
      baseline_state: c.baseline.state,
    })),
    limitations: card.limitations,
  }
}

/** Numeric tokens (commas stripped) contained in a string. */
function numericTokens(s: string): string[] {
  const raw = s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []
  return raw.map((t) => t.replace(/,/g, ''))
}

/**
 * The numeric tokens + exact provenance dates a claim may emit, derived ONLY from
 * the facts of the metric slug(s) THAT CLAIM cites — never card-global. This closes
 * the cross-evidence laundering gap: a claim citing appt.show_rate cannot borrow the
 * gross value, and a provenance date is honoured only as an EXACT whole string (its
 * fragments — 2026, 08, 17 — are never whitelisted).
 *
 * Per cited metric:
 *   - current display numbers ONLY when the current state is an actual value,
 *   - baseline numbers ONLY when a band is computable (band: mean/stddev/periods;
 *     zero_variance: mean/periods). `insufficient_history` yields NO number, so a
 *     withheld / no-current metric with no computable baseline lends nothing.
 *   - exact provenance period date strings (start/end) — matched whole, not tokenized.
 */
export function allowedForClaim(
  card: HaloReportCard,
  slugs: ReadonlyArray<string>,
): { numbers: Set<string>; dates: string[] } {
  const numbers = new Set<string>()
  const dates: string[] = []
  const add = (s: string | number) => {
    for (const t of numericTokens(String(s))) numbers.add(t)
  }
  for (const slug of slugs) {
    const c = card.cards.find((x) => x.slug === slug)
    if (!c) continue
    if (c.current.state === 'value' && c.display) add(c.display)
    const b = c.baseline
    if (b.state === 'band') {
      add(b.mean)
      add(b.stddev)
      add(b.periods_available)
    } else if (b.state === 'zero_variance') {
      add(b.mean)
      add(b.periods_available)
    }
    // insufficient_history: no computable baseline number → nothing added.
    const p = c.provenance?.period
    if (p?.start) dates.push(p.start)
    if (p?.end) dates.push(p.end)
  }
  return { numbers, dates }
}

const ALLOWED_SLUGS = (card: HaloReportCard) => new Set(card.cards.map((c) => c.slug))

// Benchmark / scoring / ranking language is never supported by a report card (all
// industry references are non-scoring). "non-scoring" itself is explicitly allowed.
const BENCHMARK_RE =
  /\b(target|benchmark|percentile|out-?perform(?:s|ed|ing)?|below average|above average|industry (?:average|standard|leading|norm)|top \d+\s*%|scored?|scoring|graded?|ranks?|ranked|ranking|beats?|exceeds?|best-in-class|par with|on par|leaderboard)\b/i
// Any causal / attribution claim is unsupported (the card carries no causal analysis).
const CAUSAL_RE =
  /\b(because|due to|caused? by|driven by|as a result of|thanks to|owing to|leads? to|results? in|resulted in|attributable to|stems? from|explains? why|reflects? (?:strong|weak|poor|good|healthy|solid|robust))\b/i

export type ValidationResult =
  | { ok: true; narrative: string; claims: HaloAiClaim[] }
  | { ok: false; reason: string }

/** Render the model's structured output into the display narrative string. */
function renderNarrative(summary: string, claims: HaloAiClaim[]): string {
  const lines = [summary.trim()]
  for (const c of claims) lines.push(`• ${c.text.trim()}`)
  return lines.filter(Boolean).join('\n')
}

/**
 * Validate the model's structured output against the allowed facts. PURE — exported
 * for direct testing. Returns the rendered narrative on success, else a concise
 * (credential-free) fallback reason.
 */
export function validateAiNarrative(parsed: unknown, card: HaloReportCard): ValidationResult {
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'model_output_malformed' }
  const obj = parsed as { summary?: unknown; claims?: unknown }
  if (typeof obj.summary !== 'string' || !Array.isArray(obj.claims)) {
    return { ok: false, reason: 'model_output_malformed' }
  }
  const claims: HaloAiClaim[] = []
  for (const raw of obj.claims) {
    if (!raw || typeof raw !== 'object') return { ok: false, reason: 'model_output_malformed' }
    const c = raw as { text?: unknown; evidence?: unknown }
    if (typeof c.text !== 'string' || !Array.isArray(c.evidence)) {
      return { ok: false, reason: 'model_output_malformed' }
    }
    if (!c.evidence.every((e) => typeof e === 'string')) return { ok: false, reason: 'model_output_malformed' }
    claims.push({ text: c.text, evidence: c.evidence as string[] })
  }

  const allowedSlugs = ALLOWED_SLUGS(card)

  // The summary carries NO numbers — every numeric statement must live in a claim
  // that cites the metric it rests on. This removes the "summary states a global
  // number with no evidence" path entirely.
  if (numericTokens(obj.summary).length > 0) return { ok: false, reason: 'numeric_summary' }

  for (const cl of claims) {
    // Evidence references must all be real card slugs.
    for (const ev of cl.evidence) {
      if (!allowedSlugs.has(ev)) return { ok: false, reason: `unknown_evidence:${ev}` }
    }
    // A numeric claim with no evidence cannot be grounded — reject before scanning.
    if (cl.evidence.length === 0) {
      if (numericTokens(cl.text).length > 0) return { ok: false, reason: 'unreferenced_numeric_claim' }
      continue
    }
    // Per-claim grounding: numbers are validated ONLY against the cited metrics'
    // facts. Exact provenance dates are removed as whole strings first, so their
    // fragments can never be reused as a rate/value.
    const { numbers, dates } = allowedForClaim(card, cl.evidence)
    let scan = cl.text
    for (const d of dates) scan = scan.split(d).join(' ')
    for (const tok of numericTokens(scan)) {
      if (!numbers.has(tok)) return { ok: false, reason: `hallucinated_number:${tok}` }
    }
  }

  const narrative = renderNarrative(obj.summary, claims)

  // Strip the explicitly-allowed "non-scoring" phrase before the benchmark scan so
  // it is never flagged, then reject any benchmark/scoring/ranking language.
  const benchScan = narrative.replace(/non-?scoring/gi, '').replace(/non-?scored/gi, '')
  if (BENCHMARK_RE.test(benchScan)) return { ok: false, reason: 'unsupported_benchmark_language' }
  if (CAUSAL_RE.test(narrative)) return { ok: false, reason: 'unsupported_causal_language' }

  return { ok: true, narrative, claims }
}

const SYSTEM_PROMPT = [
  'You are a dealership Sales report-card narrator. You write a short, plain-language summary of an',
  'ALREADY-COMPUTED report card. You have NO analytics engine and NO data beyond the JSON facts given.',
  '',
  'HARD RULES:',
  '- The "summary" MUST contain NO digits at all. Keep it qualitative (e.g. "several measures have a',
  '  current value; the rest are withheld or awaiting data"). Every number goes in a claim.',
  '- In a claim, the ONLY numbers you may write are those attached to a metric slug you cite in that',
  '  claim.evidence: that metric\'s own display value, its own baseline number, or its own exact native',
  '  period date (write dates whole, exactly as given). Never reuse one metric\'s number for another.',
  '- Never invent, estimate, infer, round, or re-split a number or date. Do not pull a piece out of a',
  '  date (e.g. a year) to use as a rate or count.',
  '- A withheld or no-current metric has NO number — say it is withheld / has no current value in words.',
  '  Missing is NOT zero; never write 0 for a missing value.',
  '- No benchmarks, targets, scores, grades, rankings, percentiles, or "above/below average" language.',
  '  Industry references are directional and NON-SCORING; describe them in words only.',
  '- No causal or attribution claims (no "because", "due to", "driven by", "leads to", "reflects strong…").',
  '- Do not name any CRM/vendor. Do not mention Service or Parts (this is a Sales-only card).',
  '',
  'OUTPUT: return STRICT JSON ONLY, no prose around it, of the exact shape:',
  '{ "summary": string, "claims": [ { "text": string, "evidence": string[] } ] }',
  'Each claim.text is one factual sentence; claim.evidence lists the metric slug(s) it rests on',
  '(slugs must come from the facts). Any sentence that states a number MUST be a claim that cites the',
  'exact metric whose number it uses.',
].join('\n')

function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    // Tolerate models that wrap JSON in prose/code fences: take the outermost object.
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

const TIMEOUT_SENTINEL = '__halo_ai_timeout__'

async function completeWithTimeout(
  complete: CompletionFn,
  system: string,
  user: string,
  timeoutMs: number,
): Promise<ChatResult> {
  const timeout = new Promise<ChatResult>((resolve) => {
    setTimeout(() => resolve({ ok: false, error: TIMEOUT_SENTINEL }), timeoutMs).unref?.()
  })
  return Promise.race([complete(system, user, { maxTokens: 700, temperature: 0.2 }), timeout])
}

export type HaloNarration = {
  narrative_mode: 'ai_grounded' | 'deterministic_grounded'
  /** Provider label only — 'hermes' | 'openai-direct' | 'none'. Never a credential. */
  narrative_provider: string
  /** Null on ai_grounded; a concise, credential-free reason on fallback. */
  narrative_fallback_reason: string | null
  /** Evidence-referenced claims on ai_grounded; null on fallback. */
  narrative_claims: HaloAiClaim[] | null
  /** The narrative to display (AI on success, deterministic on fallback). */
  narrative: string
}

/**
 * Attempt evidence-constrained AI narration for a report card. ALWAYS resolves —
 * on any failure it returns the card's deterministic narrative with a fallback
 * reason. `card.narrative` (deterministic grounded) is the fail-closed fallback.
 */
export async function narrateHaloReportCard(
  card: HaloReportCard,
  deps: NarrationDeps = {},
): Promise<HaloNarration> {
  const complete = deps.complete ?? completeChat
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const deterministic = (reason: string, provider = 'none'): HaloNarration => ({
    narrative_mode: 'deterministic_grounded',
    narrative_provider: provider,
    narrative_fallback_reason: reason,
    narrative_claims: null,
    narrative: card.narrative,
  })

  const facts = buildHaloAiFacts(card)
  let result: ChatResult
  try {
    result = await completeWithTimeout(complete, SYSTEM_PROMPT, JSON.stringify(facts), timeoutMs)
  } catch {
    return deterministic('provider_error')
  }

  if (!result.ok) {
    if ('unconfigured' in result && result.unconfigured) return deterministic('provider_unconfigured')
    if (result.error === TIMEOUT_SENTINEL) return deterministic('provider_timeout')
    return deterministic('provider_error')
  }

  const provider = result.via
  const parsed = parseJsonLoose(result.text)
  const validated = validateAiNarrative(parsed, card)
  if (!validated.ok) return deterministic(validated.reason, provider)

  return {
    narrative_mode: 'ai_grounded',
    narrative_provider: provider,
    narrative_fallback_reason: null,
    narrative_claims: validated.claims,
    narrative: validated.narrative,
  }
}

/** Merge narration onto a card, returning a NEW card (immutable). */
export async function withAiNarration(
  card: HaloReportCard,
  deps: NarrationDeps = {},
): Promise<HaloReportCard> {
  const n = await narrateHaloReportCard(card, deps)
  return {
    ...card,
    narrative: n.narrative,
    narrative_mode: n.narrative_mode,
    narrative_provider: n.narrative_provider,
    narrative_fallback_reason: n.narrative_fallback_reason,
    narrative_claims: n.narrative_claims,
  }
}
