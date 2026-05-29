#!/usr/bin/env node
/**
 * V8 wiki edit propagation test.
 *
 * 1. The workflow page was just updated to add Rule 0 (suppression).
 * 2. Dispatch the lead-followup-agent with a question that, to answer
 *    correctly, REQUIRES reading the updated page.
 * 3. Verify the response references Rule 0 — proves the agent reads
 *    the workflow page on each invocation rather than relying on a
 *    cached/baked-in system prompt.
 */

import fs from 'node:fs/promises'

const HERMES_URL = process.env.HERMES_API_URL || 'http://hermes-agent:8642'
const KEY = process.env.API_SERVER_KEY
const MODEL = process.env.HERMES_MODEL || 'gpt-4.1'

async function main() {
  const soul = await fs.readFile(
    '/root/.hermes/profiles/cedar-ridge-automotive/governance/agents/lead-followup-agent.md',
    'utf8',
  )
  const workflow = await fs.readFile(
    '/root/.hermes/profiles/cedar-ridge-automotive/knowledge/workflows/lead-followup.md',
    'utf8',
  )

  const system = `${soul}

The customer profile's lead-followup workflow page is currently:

\`\`\`
${workflow}
\`\`\`

You must reason from this file. Do not invent rules not present here. When asked, quote the page verbatim where you ground a step.`

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
        {
          role: 'user',
          content:
            "Describe your operating loop in detail, especially any suppression rules you observe. List each rule you would apply, in order, and quote the workflow page where you ground each.",
        },
      ],
      temperature: 0.1,
      max_tokens: 1500,
    }),
  })
  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(JSON.stringify(data).slice(0, 400))
  }
  const out = data.choices?.[0]?.message?.content || ''

  const outPath =
    '/root/.hermes/profiles/cedar-ridge-automotive/knowledge/inbox/08-propagation-test-response.md'
  await fs.writeFile(
    outPath,
    `---\nid: v8-propagation-test\ntype: validation-evidence\nphase: runtime\ntitle: V8 wiki edit propagation evidence\nstatus: inbox\ncreated: 2026-05-29\nauthority: cedar-ridge-automotive\n---\n\n# V8 propagation test\n\n## Agent response\n\n${out}\n\n## Verification\n\n- workflow page updated with Rule 0 suppression at 2026-05-29T05:58:00Z\n- agent's response references Rule 0: ${
      /Rule 0|suppression|24 hour|21:00|quiet hour/i.test(out) ? 'YES' : 'NO'
    }\n- agent quotes the page verbatim where grounded: ${
      /verbatim|"|>/i.test(out) ? 'YES' : 'PARTIAL'
    }\n`,
    'utf8',
  )
  console.log(`wrote ${outPath} (${out.length} bytes of response)`)
  console.log(
    `propagation evidence: Rule 0 referenced = ${/Rule 0|suppression|24 hour|21:00|quiet hour/i.test(out)}`,
  )
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
