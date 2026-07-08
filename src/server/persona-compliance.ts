/**
 * Persona-compliance heuristics — a fast, deterministic pre-filter that flags
 * outbound agent SMS which breaks Caroline's hard rules (governance/agents/
 * caroline/personas/sms.md): never quote pricing/financing, never claim
 * inventory/stock, never quote specs. It is a coarse guard for the Sentinel —
 * the AI conversation-quality grader handles nuance/fabrication separately.
 *
 * Deliberately conservative: patterns target unambiguous violations (a dollar
 * amount, "in stock", an MPG/HP figure) to keep false positives low. A hit is a
 * signal to review, not proof.
 */

export type PersonaRuleClass = 'pricing' | 'inventory' | 'specs'

export type PersonaViolation = {
  ruleClass: PersonaRuleClass
  /** The matched phrase (for the alert detail). */
  match: string
}

type Rule = { ruleClass: PersonaRuleClass; re: RegExp }

const RULES: Rule[] = [
  // Pricing / financing — the highest-risk class. Amount-focused to keep false
  // positives low (a bare "down payment" with no figure is NOT a quote).
  { ruleClass: 'pricing', re: /\$\s?\d[\d,]*(?:\.\d{1,2})?/ }, // "$25,000", "$299"
  { ruleClass: 'pricing', re: /\b\d{1,3}(?:,\d{3})*\s?(?:\/mo\b|per month|a month)/i }, // "399/mo"
  { ruleClass: 'pricing', re: /\bmsrp\b/i }, // agent must never cite MSRP
  // "%" only counts as pricing next to a finance word (avoids "99% booked", "10% chance of rain").
  { ruleClass: 'pricing', re: /\b\d{1,2}(?:\.\d+)?\s?%\s?(?:apr|interest|financ|down|off\b)/i },
  // Evasions: "25k", "20 grand" (car-price range), not "25k miles".
  { ruleClass: 'pricing', re: /\b\d{1,3}\s?k\b(?!\s*(?:mile|mi\b|km|kilomet))/i },
  { ruleClass: 'pricing', re: /\b\d{1,3}\s?grand\b/i },
  // A payment/price WITH a figure (drops the noisy bare "down/monthly payment").
  { ruleClass: 'pricing', re: /\b(?:down|monthly)\s+payment\s+(?:of|is|:|around|about|~)?\s*\$?\d/i },
  { ruleClass: 'pricing', re: /\bprice(?:d)?\s+(?:is|at|:|around|about|~)?\s*\$?\d/i },
  // Inventory / stock claims.
  { ruleClass: 'inventory', re: /\bin stock\b/i },
  { ruleClass: 'inventory', re: /\bon the lot\b/i },
  { ruleClass: 'inventory', re: /\bin (?:our )?inventory\b/i },
  // Definitive possession claim (evasion of the phrases above).
  { ruleClass: 'inventory', re: /\bwe(?:'ve| have| have got| got)\s+(?:it|that|one|two|three|four|a few|\d)\b/i },
  // Specs — MPG / horsepower / towing figures.
  { ruleClass: 'specs', re: /\b\d{1,3}\s?mpg\b/i },
  { ruleClass: 'specs', re: /\b\d{2,4}\s?(?:hp|horsepower)\b/i },
  { ruleClass: 'specs', re: /\btow(?:ing)?\s+(?:up to\s+)?\d[\d,]*\s?(?:lb|lbs|pounds)\b/i },
]

/**
 * Scan one message body; return every distinct rule-class violation (one entry
 * per class, first match wins for the phrase). Empty when clean.
 */
export function detectPersonaViolations(text: string): PersonaViolation[] {
  if (!text) return []
  const byClass = new Map<PersonaRuleClass, string>()
  for (const { ruleClass, re } of RULES) {
    if (byClass.has(ruleClass)) continue
    const m = re.exec(text)
    if (m) byClass.set(ruleClass, m[0].trim())
  }
  return [...byClass.entries()].map(([ruleClass, match]) => ({ ruleClass, match }))
}
