#!/usr/bin/env node
/**
 * V4 Cedar Ridge consultative simulation dispatcher.
 *
 * Routes through the production Hermes gateway's chatCompletions endpoint
 * (the working endpoint in current portable mode — see D-V0-005).
 * Reads the consultative-agent SOUL + governance + method + prescription
 * templates from the production volume, composes a system prompt, and
 * produces the six prescription artifacts for cedar-ridge-automotive.
 *
 * Run from inside the hermes-studio container (it has network access
 * to hermes-agent at http://hermes-agent:8642):
 *
 *   docker exec hermes-studio-... node /tmp/v4-consultative-dispatch.mjs
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const HERMES_URL = process.env.HERMES_API_URL || 'http://hermes-agent:8642'
const HERMES_KEY = process.env.API_SERVER_KEY || process.env.HERMES_API_KEY
const MODEL = process.env.HERMES_MODEL || 'gpt-4.1'
const CONSULTATIVE = '/root/.hermes/profiles/consultative-agent'
const CUSTOMER = '/root/.hermes/profiles/cedar-ridge-automotive'

if (!HERMES_KEY) {
  console.error('API_SERVER_KEY env var required (find in /root/.hermes/.env)')
  process.exit(2)
}

async function read(rel, base = CONSULTATIVE) {
  try {
    return await fs.readFile(path.join(base, rel), 'utf8')
  } catch (e) {
    console.error(`!! could not read ${rel}: ${e.message}`)
    return ''
  }
}

async function dispatch(systemPrompt, userPrompt, label) {
  const t0 = Date.now()
  const res = await fetch(`${HERMES_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${HERMES_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 3500,
    }),
  })
  const data = await res.json()
  const elapsed = Date.now() - t0
  if (!res.ok || data.error) {
    throw new Error(
      `[${label}] HTTP ${res.status} — ${data.error?.message || JSON.stringify(data).slice(0, 200)}`,
    )
  }
  const out = data.choices?.[0]?.message?.content || ''
  const usage = data.usage || {}
  console.log(
    `[${label}] ok — ${elapsed}ms, in=${usage.prompt_tokens || '?'} out=${usage.completion_tokens || '?'}`,
  )
  return out
}

async function saveArtifact(filename, content) {
  const full = path.join(CUSTOMER, 'knowledge/inbox', filename)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, content, 'utf8')
  console.log(`  wrote ${full} (${content.length} bytes)`)
}

async function updateEngagementState(stage, note) {
  const p = path.join(CUSTOMER, 'engagement-state.yaml')
  const cur = await fs.readFile(p, 'utf8')
  const nowZ = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  // simple replace of current_stage + append to stage_history
  const replaced = cur
    .replace(/current_stage: \w+/, `current_stage: ${stage}`)
    .replace(
      /stage_entered_at: [^\n]+/,
      `stage_entered_at: ${nowZ}`,
    )
  // append a history entry
  const history = `  - stage: ${stage}\n    entered_at: ${nowZ}\n    exited_at: null\n    notes: "${note}"\n    skipped: false\n`
  const out = replaced.replace(
    /(stage_history:\n)/,
    `$1${history}`,
  )
  await fs.writeFile(p, out, 'utf8')
  console.log(`  engagement-state advanced to ${stage}`)
}

async function loadConsultativeBrain() {
  // Load just enough of the wiki to ground the system prompt without exploding tokens.
  const parts = []
  parts.push('# OPERATING IDENTITY\n\n' + (await read('SOUL.md')))
  parts.push(
    '# SCOPE CONTRACT\n\n' +
      (await read('governance/consultative-agent-scope-contract.md')),
  )
  parts.push(
    '# HUMAN RELAY SPECIFICATION\n\n' +
      (await read('governance/human-relay-specification.md')),
  )
  parts.push(
    '# APPROVAL MATRIX\n\n' +
      (await read('governance/approval-matrix.md')),
  )
  parts.push(
    '# METHOD OVERVIEW\n\n' +
      (await read('knowledge/method/method-overview.md')),
  )
  parts.push(
    '# PRESCRIPTION PACKAGE OVERVIEW\n\n' +
      (await read('knowledge/prescription/prescription-package-overview.md')),
  )
  return parts.join('\n\n---\n\n')
}

const PHASES = [
  {
    key: 'orient',
    label: 'orient',
    method: 'knowledge/method/orient.md',
    artifact: '01-orient-strawman-and-industry-frame.md',
    prompt: (intake) => `You are at the ORIENT phase of the consultative method for a NEW engagement against customer profile \`cedar-ridge-automotive\`.

Below is the customer intake brief — this is the ONLY input you have so far. There is no existing wiki, no prior engagements.

${intake}

Produce a markdown artifact titled "Orient Phase — Industry Strawman & Engagement Frame". Required structure:

\`\`\`
---
id: cedar-ridge-orient-strawman
type: prescription
phase: orient
title: Orient Phase — Industry Strawman & Engagement Frame
status: inbox
domain: consultative-engagement
created: 2026-05-29
authority: consultative-agent
---

# Orient Phase — Industry Strawman & Engagement Frame

## Industry frame
... (one paragraph: which industry strawman from the library you are leading with, why, and what is non-standard about Cedar Ridge)

## Engagement strawman (point of view, ahead of audit)
... (3-5 bullet hypotheses about what the right shape of the solution likely is — your default house position, to be challenged in audit)

## Operator input requests (human relay)
- ... (3-6 concrete questions you need a human to answer before you can advance past orient)

## Adjacent data neighbors (preliminary)
- ... (3-6 data sources you suspect will become relevant even if not in scope today; mark each as in-scope-now | adjacent | future)

## Impact of Missing Details
... (one paragraph: what you cannot conclude until the operator answers the input requests, and what risk that places on the prescription if you proceed anyway)

## Next phase entry criteria
- All operator input requests answered (or deferred with rationale)
- ready_to_blueprint gate unblocked
\`\`\`

Quote phrases from the intake brief verbatim where you ground a hypothesis. Do not invent facts not present in the brief.`,
  },
  {
    key: 'audit',
    label: 'audit',
    method: 'knowledge/method/audit.md',
    artifact: '02-audit-as-is-and-evidence-gaps.md',
    prompt: (intake) => `You are at the AUDIT phase of the consultative method against \`cedar-ridge-automotive\`. The orient strawman has been produced. The operator has answered the input requests as follows:

OPERATOR INPUT RESPONSES (treat as authoritative):
- Q: Is VinSolutions data exportable via API? A: Yes via their REST API (DealerSocket parent), needs partner credentials Cedar Ridge already has.
- Q: What is the SLA goal for first-touch on a new lead? A: Within 30 minutes 24/7 once a customer-initiated message lands.
- Q: Do you have written customer consent records for SMS outreach? A: Yes, captured via VinSolutions opt-in fields and DOM trust-form on websites.
- Q: Who owns the federated KPI definitions? A: The Group GM (Marcus Vega) signs off on each KPI definition before it ships to leadership dashboards.
- Q: Should the consultative work include the body shops? A: No, deferred to phase 2 — focus on sales + service desk + BDC for now.

INTAKE BRIEF (for cross-reference):
${intake}

Produce the AUDIT artifact with this structure:

\`\`\`
---
id: cedar-ridge-audit-as-is
type: prescription
phase: audit
title: Audit Phase — As-Is + Evidence Gaps
status: inbox
domain: consultative-engagement
created: 2026-05-29
authority: consultative-agent
---

# Audit Phase — As-Is + Evidence Gaps

## As-is system map
... (table of: function | tool | inputs | outputs | owners | observed gap)

## Evidence captured
... (bulleted list of what was observed vs claimed)

## Evidence gaps
... (bulleted list of what we could NOT verify in this audit pass; each gets a follow-up owner)

## Next most likely data neighbors (refined from orient)
... (table of: source | likelihood | scope | what we'd learn)

## Open decisions surfaced
... (numbered list — each becomes an entry in engagement-state.yaml.open_decisions)

## Continuous data discretion findings
... (for each major data source: include? exclude? defer? with one-line rationale)

## Impact of Missing Details
... (paragraph on what is unverified and how it constrains design)

## Gate recommendation
- ready_to_blueprint: ready / not_ready — explain
\`\`\`

Be specific. Reference the operator's answers verbatim where they unlock conclusions.`,
  },
  {
    key: 'design',
    label: 'design',
    method: 'knowledge/method/design.md',
    artifact: '03-design-agentic-topology-and-data-shape.md',
    prompt: (intake) => `You are at the DESIGN phase for \`cedar-ridge-automotive\`. Orient + audit are complete. Operator approved \`ready_to_blueprint\` gate with note "Audit complete; topology decision still pending."

Reference inputs available to design:
- Intake brief (5 goals, constraints, pain points)
- Audit findings (VinSolutions API confirmed, 30-min lead SLA, signed consent, Marcus Vega owns KPIs, body-shop deferred)

Produce the DESIGN artifact with structure matching the prescription overview's "agentic-design" template:

\`\`\`
---
id: cedar-ridge-design-topology
type: prescription
phase: design
title: Design Phase — Agentic Topology + Data Shape Proposal
status: inbox
domain: consultative-engagement
created: 2026-05-29
authority: consultative-agent
references: [cedar-ridge-orient-strawman, cedar-ridge-audit-as-is]
---

# Design Phase — Agentic Topology + Data Shape

## Topology proposal
... (one paragraph picking one of: we-host | hybrid | external. Justify against the audit's constraints.)

## Agent roster
... (table: agent name | role | profile path | scope contract reference | Kanban lane | owner)

The roster MUST include:
- a primary consultative-resident agent
- a lead-follow-up agent
- a lead-response agent
- a service appointment agent
- a CRM-data-guru agent for VinSolutions ingest
- per-rooftop dashboard-author agents if rooftops need isolated reporting
- the unified KSG+DSG governor agent

## Crew shapes
... (build-time vs run-time, list members)

## Knowledge shape
... (the wiki branches the customer needs: governance, knowledge/workflows, knowledge/reports/specs, knowledge/widgets, data/customer-context)

## Data shape proposal
... (table: data class | source | landing location | semantic guard | reporting consumer)

## MCP access proposal
... (table: server | who can call it | scope | secret storage)

## Federation read scopes
... (yes/no for each: huminic, serra-automotive — explain. Cedar Ridge to Cedar Ridge cross-rooftop SHOULD be a federation case worth modeling.)

## Open decisions for operator
... (numbered)

## Impact of Missing Details
... (paragraph)

## Gate recommendation
- topology_decided: ready / not_ready — explain
- ready_to_instantiate_runtime: not_ready until topology_decided is approved
\`\`\`

Use \`---\` to separate frontmatter from body exactly as shown. Keep total length under 2000 words.`,
  },
  {
    key: 'author',
    label: 'author',
    method: 'knowledge/method/author.md',
    artifact: '04-author-wiki-skeleton-and-six-artifacts.md',
    prompt: (intake) => `You are at the AUTHOR phase for \`cedar-ridge-automotive\`. Orient/audit/design complete. Operator approved topology_decided with decision: \`hybrid\` (consultative + governance hosted by Huminic; runtime agents run in Cedar Ridge's profile under Huminic Studio infrastructure).

Produce the AUTHOR artifact — the consolidated wiki skeleton + the six prescription artifacts' filenames + first-pass content for each:

\`\`\`
---
id: cedar-ridge-author-wiki-skeleton
type: prescription
phase: author
title: Author Phase — Wiki Skeleton + Prescription Drafts
status: inbox
domain: consultative-engagement
created: 2026-05-29
authority: consultative-agent
references: [cedar-ridge-orient-strawman, cedar-ridge-audit-as-is, cedar-ridge-design-topology]
---

# Author Phase — Wiki Skeleton + Prescription Drafts

## Wiki skeleton (paths to create under \`~/.hermes/profiles/cedar-ridge-automotive/\`)
... (tree-form list of directories + key files. Mark which already exist from V5.)

## Prescription artifact 1 — client-wiki spec
... (one paragraph + bullets: governance/scope-contract.md, governance/approval-matrix.md, knowledge/workflows/lead-follow-up.md, knowledge/workflows/service-reminder.md, etc.)

## Prescription artifact 2 — agentic-design
... (reference the design phase output; expand into per-agent SOUL fragments)

## Prescription artifact 3 — data-storage spec
... (which classes go where: customer context in profile data/, VinSolutions ingest in dedicated SQLite under /root/.hermes/profiles/<customer>/data/vinsolutions.sqlite, dashboards in knowledge/dashboards/, etc.)

## Prescription artifact 4 — MCP access spec
... (table: VinSolutions MCP, Vapi MCP, Tavus MCP, Resend MCP for outbound, central-mcp Coolify for ops)

## Prescription artifact 5 — knowledge semantic agent spec
... (KSG watch paths, governance rules, conflict resolution)

## Prescription artifact 6 — data semantic agent spec
... (DSG watch paths, schema enforcement, contract violations)

## Deployment notes (Impact of Missing Details)
... (3-6 entries about what would degrade if any of the six artifacts ships incomplete)

## Open decisions remaining
... (numbered)

## Gate recommendation
- ready_to_instantiate_runtime: ready / not_ready
- ready_to_publish_mcp_projections: ready / not_ready
\`\`\`

Be concrete. Reference Cedar Ridge specifics, not generic dealership patterns.`,
  },
  {
    key: 'validate',
    label: 'validate',
    method: 'knowledge/method/validate.md',
    artifact: '05-validate-challenge-loop-and-confidence.md',
    prompt: (intake) => `You are at the VALIDATE phase for \`cedar-ridge-automotive\`. Author complete. Run the challenge-loop on the prescription package.

\`\`\`
---
id: cedar-ridge-validate-challenge
type: prescription
phase: validate
title: Validate Phase — Challenge Loop + Confidence Scores
status: inbox
domain: consultative-engagement
created: 2026-05-29
authority: consultative-agent
references: [cedar-ridge-author-wiki-skeleton]
---

# Validate Phase — Challenge Loop + Confidence Scores

## Challenge 1 — Can VinSolutions API support 30-min SLA?
... (the challenge, what we tested, the result, confidence 0-1)

## Challenge 2 — Does the hybrid topology preserve compliance?
... (same shape)

## Challenge 3 — Will the BDC team adopt the new flow?
...

## Challenge 4 — Federation across rooftops vs against group GM authority
...

## Challenge 5 — Failure mode when Vapi escalation breaks
...

## Aggregate confidence scores per artifact
... (table: artifact | confidence | gating concerns)

## Surface findings that became open decisions
... (numbered)

## Impact of Missing Details (post-validate)
...

## Gate recommendation
- ready_to_publish_mcp_projections: ready / not_ready
- ready_to_hand_off_externally: not_ready until package phase
\`\`\``,
  },
  {
    key: 'package',
    label: 'package',
    method: 'knowledge/method/package.md',
    artifact: '06-package-manifest-and-ready-to-run.md',
    prompt: (intake) => `You are at the PACKAGE phase for \`cedar-ridge-automotive\`. All prior phases approved. Produce the final manifest.

\`\`\`
---
id: cedar-ridge-package-manifest
type: prescription
phase: package
title: Package Phase — Engagement Manifest + Ready to Run
status: inbox
domain: consultative-engagement
created: 2026-05-29
authority: consultative-agent
references: [cedar-ridge-orient-strawman, cedar-ridge-audit-as-is, cedar-ridge-design-topology, cedar-ridge-author-wiki-skeleton, cedar-ridge-validate-challenge]
---

# Package Phase — Engagement Manifest + Ready to Run

## Manifest summary
- customer: cedar-ridge-automotive
- topology: hybrid
- phases completed: orient, audit, design, author, validate, package
- artifacts produced: 6
- gates approved (recommend): all 5

## Runtime crew composition (final)
... (table)

## Build-time crew dissolved
... (paragraph: which roles released, which artifacts archived)

## Pillar handoff
... (which deliverables land where after ready_to_run: profile dir, customer-console plugin renderer wiring, MCP server bootstrap)

## Operator approvals required to flip ready_to_run
... (numbered checklist that the operator must walk through in /engagements)

## Open follow-ons (NOT blocking ready_to_run)
... (e.g., body-shop expansion, Tavus video addition)

## Impact of Missing Details (final)
... (one paragraph: what THIS engagement deliberately leaves unaddressed, owner of each, when revisit)

## Recommended engagement-state.yaml deltas
- current_stage: ready_to_run
- all 5 readiness_gates → status: approved
- topology_decided.decision: hybrid
\`\`\``,
  },
]

async function main() {
  console.log(`V4 dispatch starting against ${HERMES_URL} model=${MODEL}`)
  const brain = await loadConsultativeBrain()
  const intake = await read('data/intake-brief.md', CUSTOMER)
  console.log(`brain=${brain.length}c, intake=${intake.length}c`)

  for (const phase of PHASES) {
    console.log(`\n=== PHASE ${phase.label} ===`)
    const methodPage = await read(phase.method)
    const systemPrompt =
      brain +
      `\n\n---\n\n# THIS PHASE: ${phase.label.toUpperCase()}\n\n` +
      methodPage +
      `\n\n---\n\n# OPERATING PROTOCOL\n\nProduce the artifact in markdown. Include the frontmatter EXACTLY as required. Include "Impact of Missing Details" as a section heading every time. Quote source brief or operator answers verbatim where they ground a conclusion. Do not invent facts. Output ONLY the markdown artifact — no preamble, no explanation outside the artifact.`
    const userPrompt = phase.prompt(intake)
    const artifact = await dispatch(systemPrompt, userPrompt, phase.label)
    await saveArtifact(phase.artifact, artifact)
    await updateEngagementState(
      phase.key === 'package' ? 'ready_to_run' : phaseToStage(phase.key),
      `Consultative ${phase.label} phase produced via V4 dispatch.`,
    )
  }
  console.log('\nV4 dispatch complete.')
}

function phaseToStage(key) {
  // Map phase key to engagement-state stage
  return {
    orient: 'gathering_data',
    audit: 'gathering_data',
    design: 'solution_discovery',
    author: 'creation',
    validate: 'submission',
    package: 'ready_to_run',
  }[key]
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
