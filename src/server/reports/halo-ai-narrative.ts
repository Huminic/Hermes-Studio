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
 * The set of numeric tokens the model is ALLOWED to emit — derived ONLY from the
 * structured facts: coverage counts, the window, each metric display value, each
 * native period date, and each baseline detail (periods/needed/mean/stddev).
 */
export function allowedNumbersFor(card: HaloReportCard): Set<string> {
  const facts: string[] = [
    String(card.window_days),
    String(card.coverage.total),
    String(card.coverage.current_value),
    String(card.coverage.no_current_data),
    String(card.coverage.withheld),
  ]
  for (const c of card.cards) {
    if (c.display) facts.push(c.display)
    const p = c.provenance?.period
    if (p?.start) facts.push(p.start)
    if (p?.end) facts.push(p.end)
    const b = c.baseline
    if (b.state === 'insufficient_history') facts.push(String(b.periods_available), String(b.needed))
    if (b.state === 'zero_variance') facts.push(String(b.periods_available), String(b.mean))
    if (b.state === 'band') facts.push(String(b.periods_available), String(b.mean), String(b.stddev))
  }
  const set = new Set<string>()
  for (const f of facts) for (const t of numericTokens(f)) set.add(t)
  return set
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
  const allowedNums = allowedNumbersFor(card)

  // Evidence references must all be real card slugs.
  for (const cl of claims) {
    for (const ev of cl.evidence) {
      if (!allowedSlugs.has(ev)) return { ok: false, reason: `unknown_evidence:${ev}` }
    }
  }
  // A factual (numeric-bearing) claim MUST carry at least one evidence slug.
  for (const cl of claims) {
    if (numericTokens(cl.text).length > 0 && cl.evidence.length === 0) {
      return { ok: false, reason: 'unreferenced_numeric_claim' }
    }
  }

  const narrative = renderNarrative(obj.summary, claims)

  // Numeric grounding: every numeric token must exist in the allowed facts.
  for (const tok of numericTokens(narrative)) {
    if (!allowedNums.has(tok)) return { ok: false, reason: `hallucinated_number:${tok}` }
  }
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
  '- Use ONLY the provided facts. Never invent, estimate, or infer a number, rate, dollar amount, or date.',
  '- The only numbers you may write are ones that appear verbatim in the facts (coverage counts, a metric',
  '  display value, a native period date, or a baseline periods/mean/stddev).',
  '- Missing is NOT zero. If a metric is withheld or has no current value, say so plainly — never write 0.',
  '- No benchmarks, targets, scores, grades, rankings, percentiles, or "above/below average" language.',
  '  Industry references are directional and NON-SCORING; describe them in words only.',
  '- No causal or attribution claims (no "because", "due to", "driven by", "leads to", "reflects strong…").',
  '- Do not name any CRM/vendor. Do not mention Service or Parts (this is a Sales-only card).',
  '',
  'OUTPUT: return STRICT JSON ONLY, no prose around it, of the exact shape:',
  '{ "summary": string, "claims": [ { "text": string, "evidence": string[] } ] }',
  'Each claim.text is one factual sentence; claim.evidence lists the metric slug(s) it rests on',
  '(slugs must come from the facts). Put any sentence that states a number in claims with evidence.',
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
