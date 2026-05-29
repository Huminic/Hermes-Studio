#!/usr/bin/env node
/**
 * V7 KSG conflict scenario dispatcher.
 *
 * Loads the unified KSG+DSG governor SOUL from cedar-ridge-automotive-data-governor
 * profile, asks it to review a proposed workflow against the canon, and saves
 * the verdict + reconciliation proposal to the customer profile.
 */

import fs from 'node:fs/promises'

const HERMES_URL = process.env.HERMES_API_URL || 'http://hermes-agent:8642'
const KEY = process.env.API_SERVER_KEY
const MODEL = process.env.HERMES_MODEL || 'gpt-4.1'

if (!KEY) {
  console.error('API_SERVER_KEY required')
  process.exit(2)
}

async function read(p) {
  return fs.readFile(p, 'utf8')
}

async function main() {
  const governorSOUL = await read(
    '/root/.hermes/profiles/cedar-ridge-automotive-data-governor/SOUL.md',
  )
  const canon = await read(
    '/root/.hermes/profiles/cedar-ridge-automotive/canon/consent-policy.md',
  )
  const workflow = await read(
    '/root/.hermes/profiles/cedar-ridge-automotive/knowledge/drafts/bulk-promo-blast.md',
  )

  const system = `${governorSOUL}

You are operating as the unified KSG + DSG governor for customer profile cedar-ridge-automotive. The customer profile's canon is below; a draft workflow has been proposed. Your job:

1. Read the canon.
2. Read the proposed workflow.
3. Decide: does the workflow conflict with the canon? If yes, identify each rule it violates and propose the smallest reconciliation that would let the workflow proceed.
4. Produce the verdict as a markdown artifact with the structure shown below. Output ONLY the artifact — no preamble.

REQUIRED OUTPUT STRUCTURE:

\`\`\`
---
id: ksg-verdict-bulk-promo-blast
type: governance
phase: runtime
title: KSG verdict — bulk-promo-blast workflow review
status: inbox
domain: governance
authority: cedar-ridge-automotive-data-governor
review_target: knowledge/drafts/bulk-promo-blast.md
canon_referenced: canon/consent-policy.md
verdict: rejected | needs_reconciliation | approved
---

# KSG Verdict — bulk-promo-blast workflow review

## Canon rules consulted
- ...

## Workflow violations found
- Rule N: ... (quote canon + workflow side-by-side)

## Smallest reconciliation proposal
... (concrete edits to the workflow that would make it canon-compliant)

## Required operator action
- The current draft MUST NOT be promoted to canon as-is.
- After reconciliation, KSG re-review.

## Audit reference
- This verdict is the canonical record of the rejection. The draft remains in knowledge/drafts/ until reconciled.
\`\`\`

CANON:
${canon}

PROPOSED WORKFLOW:
${workflow}`

  const res = await fetch(`${HERMES_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: 'Produce your verdict now.' },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    }),
  })
  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(JSON.stringify(data).slice(0, 400))
  }
  const verdict = data.choices?.[0]?.message?.content || ''
  console.log(
    `[ksg] ok — in=${data.usage?.prompt_tokens} out=${data.usage?.completion_tokens}`,
  )
  const outPath =
    '/root/.hermes/profiles/cedar-ridge-automotive/knowledge/inbox/07-ksg-verdict-bulk-promo-blast.md'
  await fs.writeFile(outPath, verdict, 'utf8')
  console.log(`  wrote ${outPath} (${verdict.length} bytes)`)

  // Verify canon is untouched
  const canonAfter = await read(
    '/root/.hermes/profiles/cedar-ridge-automotive/canon/consent-policy.md',
  )
  const canonUntouched = canonAfter === canon
  console.log(`  canon untouched? ${canonUntouched}`)

  const verdictLine = verdict.match(/^verdict:\s*(\w+)/m)?.[1] || 'unknown'
  console.log(`  verdict: ${verdictLine}`)
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
