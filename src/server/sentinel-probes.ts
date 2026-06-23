/**
 * Sentinel external-I/O probes — the real-network defaults the Sentinel injects
 * into its checks. Kept out of sentinel.ts so the engine + checks stay pure and
 * unit-testable (tests inject fakes for all of these).
 *
 * Every probe is fail-safe: on any error it returns an explicit failure/`graded:
 * false` rather than throwing or fabricating a healthy result.
 */

/** TextMagic account probe — reachability + remaining balance. */
export type TextmagicProbe = {
  ok: boolean
  /** Credentials absent ⇒ skip (not an alarm). */
  unconfigured?: boolean
  /** Remaining account balance (TextMagic credits), when readable. */
  balance?: number
  error?: string
}

/**
 * GET https://rest.textmagic.com/api/v2/user — returns the account incl.
 * `balance`. Uses the same env credentials the live SMS send path uses.
 */
export async function defaultProbeTextmagic(): Promise<TextmagicProbe> {
  const user = process.env.TEXTMAGIC_USERNAME
  const key = process.env.TEXTMAGIC_API_KEY
  if (!user || !key) return { ok: false, unconfigured: true }
  try {
    const res = await fetch('https://rest.textmagic.com/api/v2/user', {
      method: 'GET',
      headers: { 'X-TM-Username': user, 'X-TM-Key': key },
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const j = (await res.json().catch(() => ({}))) as { balance?: number }
    return {
      ok: true,
      balance: typeof j.balance === 'number' ? j.balance : undefined,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Conversation-quality grade for one transcript. */
export type ConversationGrade = {
  /** False ⇒ the grader could not run; never raises a quality finding. */
  graded: boolean
  /** 1 (poor) – 5 (excellent) when graded. */
  score: number
  /** One-line reason when the score is low. */
  issue?: string
}

const QC_RUBRIC =
  'You are a strict quality-control reviewer for a car-dealership messaging ' +
  'assistant. Grade the AGENT\'s replies in the transcript on a 1-5 scale ' +
  '(5 = accurate, helpful, on-topic, professional; 1 = wrong, evasive, rude, ' +
  'or off-topic). Penalise hallucinated facts, ignored questions, and broken ' +
  'promises. Respond with ONLY compact JSON: {"score":<1-5>,"issue":"<short ' +
  'reason if score<=3, else empty>"}.'

const HERMES_URL = process.env.HERMES_API_URL || 'http://hermes-agent:8642'
const HERMES_KEY = process.env.API_SERVER_KEY || process.env.HERMES_API_KEY
const OPENAI_KEY = process.env.OPENAI_API_KEY
const QC_MODEL = process.env.HERMES_MODEL || 'gpt-4.1'

function parseGrade(content: string): ConversationGrade {
  try {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return { graded: false, score: 0 }
    const obj = JSON.parse(match[0]) as { score?: number; issue?: string }
    const score = Number(obj.score)
    if (!Number.isFinite(score) || score < 1 || score > 5) {
      return { graded: false, score: 0 }
    }
    return { graded: true, score, issue: obj.issue || undefined }
  } catch {
    return { graded: false, score: 0 }
  }
}

/**
 * Grade one conversation transcript via the app's own inference (Hermes,
 * falling back to OpenAI-direct) — the same providers the chat route uses, so
 * no new vendor/key. Fail-safe: returns `graded:false` on any error.
 */
export async function defaultGradeConversation(
  transcript: string,
): Promise<ConversationGrade> {
  const messages = [
    { role: 'system', content: QC_RUBRIC },
    { role: 'user', content: transcript },
  ]
  try {
    if (HERMES_KEY) {
      const res = await fetch(`${HERMES_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${HERMES_KEY}`,
        },
        body: JSON.stringify({ model: QC_MODEL, messages, temperature: 0, max_tokens: 200 }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: unknown
        choices?: Array<{ message?: { content?: string } }>
      }
      if (res.ok && !data.error) {
        return parseGrade(data.choices?.[0]?.message?.content ?? '')
      }
    }
    if (OPENAI_KEY) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({ model: QC_MODEL, messages, temperature: 0, max_tokens: 200 }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: unknown
        choices?: Array<{ message?: { content?: string } }>
      }
      if (res.ok && !data.error) {
        return parseGrade(data.choices?.[0]?.message?.content ?? '')
      }
    }
    return { graded: false, score: 0 }
  } catch {
    return { graded: false, score: 0 }
  }
}
