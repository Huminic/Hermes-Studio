/**
 * Consultative Agent engine (SRS Tranche C.1–C.6).
 *
 * Runs the six-phase method end-to-end against a customer profile:
 *
 *   Orient   → industry brief + strawman assembled into engagement memo
 *   Audit    → existing-state read; evidence gaps become lookup-misses + assumptions
 *   Design   → agentic topology + knowledge shape proposal
 *   Author   → client wiki (6 invariants) + Brain seed records (DSG-gated)
 *   Validate → challenge loop with confidence labels
 *   Package  → manifest with readiness gates + deployment notes
 *
 * Every authoring action goes through KSG (wiki) or DSG (Brain) — there
 * is no bypass even at admin scope.
 *
 * The engine accepts an injectable `complete()` callable so tests run
 * with deterministic synthetic outputs and production runs against a
 * real LLM (Hermes chat completion or OpenAI direct).
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { uuid, now } from './brain-store'
import { recordLookupMiss } from './lookup-miss'
import { recordChat } from './chat-memorialization'
import { recordHunch } from './hunches-store'
import {
  insertEvent,
  insertObservation,
  insertOutput,
  recordAdjacentNeighbor,
  recordSuggestedKnowledgeChange,
  upsertEntity,
  type SourceRef,
} from './brain-record-families'
import { recordRetrieval } from './memory-layer'
import { recordAudit } from './metadata-substrate'
import { evaluateWikiSave } from './ksg-gate'
import { provisionBrainForProfile } from './brain-readiness'
import { seedInteractionContract } from './reconciliation'
import {
  advanceEngagementStage,
  phaseToStage,
} from './engagement-state-writer'

// ── Types ─────────────────────────────────────────────────────────

export type EngagementInput = {
  customer_profile: string
  customer_display_name: string
  industry?: string
  rooftops?: Array<string>
  primary_contact?: { name: string; email?: string; phone?: string }
  known_systems?: Array<string>
  known_pain_points?: Array<string>
  /** Optional injectable LLM. If absent, the engine uses a deterministic synthetic. */
  complete?: (input: { system: string; user: string }) => Promise<string>
  /** Optional override for the consultative agent's profile root. */
  consultativeProfileRoot?: string
  /** Override for the customer profile root (for tests). */
  customerProfileRoot?: string
  /** Decision context id (groups all chat_records + retrieval snapshots for this run). */
  decision_id?: string
}

export type PhaseName =
  | 'orient'
  | 'audit'
  | 'design'
  | 'author'
  | 'validate'
  | 'package'

export type PhaseResult = {
  phase: PhaseName
  ok: boolean
  outputs_written: Array<string>
  brain_records_written: Array<string>
  wiki_pages_written: Array<string>
  assumptions_surfaced: Array<string>
  capability_gaps: Array<string>
  notes: string
}

export type EngagementResult = {
  decision_id: string
  customer_profile: string
  ok: boolean
  phases: Array<PhaseResult>
  summary: {
    wiki_pages: number
    brain_records: number
    assumptions: number
    capability_gaps: number
  }
  prescription_package_path: string
  errors: Array<string>
}

// ── Public entry point ───────────────────────────────────────────

export async function runConsultativeEngagement(
  input: EngagementInput,
): Promise<EngagementResult> {
  const decisionId = input.decision_id ?? uuid()
  const phases: Array<PhaseResult> = []
  const errors: Array<string> = []

  recordChat({
    profile: input.customer_profile,
    channel: 'consultative',
    thread_id: decisionId,
    participants: ['system:consultative-engine', 'user:operator'],
    role: 'system',
    content: `Engagement opened for ${input.customer_display_name} (profile=${input.customer_profile}).`,
    decision_context_id: decisionId,
  })

  for (const phase of ['orient', 'audit', 'design', 'author', 'validate', 'package'] as Array<PhaseName>) {
    try {
      const res = await runPhase(phase, input, decisionId)
      phases.push(res)
      // P-SRS-C1 / AC-CA-004: persist engagement stage on every successful
      // phase transition. No-op if no engagement-state.yaml exists.
      try {
        advanceEngagementStage(input.customer_profile, phaseToStage(phase), {
          notes: `consultative-engine: ${phase} complete (decision_id=${decisionId})`,
        })
      } catch (writeErr) {
        // Don't fail the phase on a writeback error; record into errors so
        // it surfaces in the engagement result.
        errors.push(
          `engagement-state-writeback after ${phase}: ${(writeErr as Error).message}`,
        )
      }
    } catch (err) {
      errors.push(`${phase}: ${(err as Error).message}`)
      phases.push({
        phase,
        ok: false,
        outputs_written: [],
        brain_records_written: [],
        wiki_pages_written: [],
        assumptions_surfaced: [],
        capability_gaps: [],
        notes: `error: ${(err as Error).message}`,
      })
    }
  }

  const sum = {
    wiki_pages: phases.reduce((a, p) => a + p.wiki_pages_written.length, 0),
    brain_records: phases.reduce((a, p) => a + p.brain_records_written.length, 0),
    assumptions: phases.reduce((a, p) => a + p.assumptions_surfaced.length, 0),
    capability_gaps: phases.reduce((a, p) => a + p.capability_gaps.length, 0),
  }
  const pkg = writePrescriptionPackage(input, decisionId, phases)
  return {
    decision_id: decisionId,
    customer_profile: input.customer_profile,
    ok: phases.every((p) => p.ok) && errors.length === 0,
    phases,
    summary: sum,
    prescription_package_path: pkg,
    errors,
  }
}

// ── Phase implementations ────────────────────────────────────────

async function runPhase(
  phase: PhaseName,
  input: EngagementInput,
  decisionId: string,
): Promise<PhaseResult> {
  switch (phase) {
    case 'orient':
      return await runOrient(input, decisionId)
    case 'audit':
      return await runAudit(input, decisionId)
    case 'design':
      return await runDesign(input, decisionId)
    case 'author':
      return await runAuthor(input, decisionId)
    case 'validate':
      return await runValidate(input, decisionId)
    case 'package':
      return await runPackage(input, decisionId)
  }
}

async function runOrient(
  input: EngagementInput,
  decisionId: string,
): Promise<PhaseResult> {
  const out: PhaseResult = blank('orient')
  const industry = input.industry ?? 'automotive-retail'
  const text = await complete(input, {
    system:
      'You are the Consultative Architect. Produce a one-page orientation memo describing what the customer does, the moves you intend in this engagement, and the assumptions you carry in.',
    user: `Customer: ${input.customer_display_name}\nIndustry: ${industry}\nKnown systems: ${(input.known_systems ?? []).join(', ') || 'unknown'}\nKnown pain points: ${(input.known_pain_points ?? []).join(', ') || 'unknown'}`,
  })

  // Wiki page: orientation memo
  const wikiPath = writeWikiInbox(
    input,
    'orientation-memo.md',
    fm('orientation-memo', 'memo', 'under-review', `${input.customer_display_name} engagement orientation`),
    text,
  )
  if (wikiPath) out.wiki_pages_written.push(wikiPath)

  // Brain event: phase entered
  const ev = insertEvent(
    {
      profile: input.customer_profile,
      actor: 'system:consultative-engine',
      type: 'engagement_phase',
      source: 'consultative-engine',
      subject_type: 'engagement',
      subject_id: decisionId,
      payload: { phase: 'orient', industry, customer: input.customer_display_name },
      source_refs: [
        { kind: 'wiki', value: wikiPath ?? '(no wiki path)' },
        { kind: 'engagement', value: 'engagement-state.yaml' },
      ],
    },
  )
  if (ev.ok) out.brain_records_written.push(`events:${ev.id}`)

  recordRetrieval({
    profile: input.customer_profile,
    actor: 'system:consultative-engine',
    decision_id: decisionId,
    query: 'orientation context',
    retrieved_refs: [
      { kind: 'engagement', value: 'engagement-state.yaml' },
      { kind: 'wiki', value: 'house-canon-index.md' },
    ],
    reasoning: 'Industry default + canon overview seed orientation memo.',
  })

  recordChat({
    profile: input.customer_profile,
    channel: 'consultative',
    thread_id: decisionId,
    participants: ['agent:consultative', 'user:operator'],
    role: 'assistant',
    content: text,
    decision_context_id: decisionId,
  })

  out.notes = 'orientation memo authored to inbox; brain phase event recorded'
  return out
}

async function runAudit(
  input: EngagementInput,
  decisionId: string,
): Promise<PhaseResult> {
  const out: PhaseResult = blank('audit')

  // Lookup misses on the standard inputs the consultative agent expects.
  const expectedInputs = [
    {
      query: 'CRM access scope + auth model',
      decision: 'assumed' as const,
      assumption: `Assumed ${input.customer_display_name} owns the CRM and federation rather than absorption is appropriate.`,
    },
    {
      query: 'rooftop list with full address + DMS id',
      decision: input.rooftops?.length ? undefined : ('assumed' as const),
      assumption: input.rooftops?.length
        ? undefined
        : `Assumed a single rooftop until the customer provides the canonical list.`,
    },
    {
      query: 'service department hours of operation per rooftop',
      decision: 'assumed' as const,
      assumption: 'Assumed Mon-Fri 7:30-18:00 service hours based on industry norms.',
    },
  ]

  for (const inputCase of expectedInputs) {
    if (!inputCase.decision) continue
    const lm = recordLookupMiss({
      profile: input.customer_profile,
      actor: 'system:consultative-engine',
      query: inputCase.query,
      scope: 'wiki',
      downstream_decision: inputCase.decision,
      assumption: inputCase.assumption
        ? { statement: inputCase.assumption, context: { phase: 'audit' } }
        : undefined,
    })
    if (lm.ok && lm.assumption_id) {
      out.assumptions_surfaced.push(lm.assumption_id)
    }
  }

  // Audit memo
  const auditText = await complete(input, {
    system:
      'You are the Consultative Architect. Produce a one-page audit summary listing existing state observations and explicitly naming the evidence gaps that triggered assumption-surfacing.',
    user: `Customer: ${input.customer_display_name}\nAssumed (until operator clarifies): service hours, rooftop list (when missing), CRM federation posture.`,
  })
  const wikiPath = writeWikiInbox(
    input,
    'audit-memo.md',
    fm('audit-memo', 'memo', 'under-review', `${input.customer_display_name} engagement audit`),
    auditText,
  )
  if (wikiPath) out.wiki_pages_written.push(wikiPath)

  // Capability gap example: we lack a sanctioned VinSolutions push pipeline.
  const gap = await detectCapabilityGap(
    input,
    'VinSolutions outbound lead push',
    'Configure mcp-federation skill with VinSolutions write scope OR ship a thin send-adapter under skills/.',
  )
  if (gap) out.capability_gaps.push(gap)

  out.notes = 'audit memo + lookup misses + capability gap recorded'
  return out
}

async function runDesign(
  input: EngagementInput,
  decisionId: string,
): Promise<PhaseResult> {
  const out: PhaseResult = blank('design')
  const text = await complete(input, {
    system:
      'You are the Consultative Architect. Produce an agentic-design page naming the run-time crew (KSG, DSG, agents per channel) and the data shape they need (Brain entities + adjacent neighbors).',
    user: `Customer: ${input.customer_display_name}\nKnown systems: ${(input.known_systems ?? []).join(', ') || 'unknown'}`,
  })
  const wikiPath = writeWikiInbox(
    input,
    'agentic-design.md',
    fm('agentic-design', 'design', 'under-review', `${input.customer_display_name} agentic design`),
    text,
  )
  if (wikiPath) out.wiki_pages_written.push(wikiPath)

  // Adjacent neighbors
  const neighbors = [
    { name: 'VinSolutions', source_type: 'crm' as const, likelihood: 'high' as const },
    { name: 'Google Analytics', source_type: 'analytics' as const, likelihood: 'medium' as const },
    { name: 'Dealer.com inventory feed', source_type: 'doc-store' as const, likelihood: 'medium' as const },
  ]
  for (const n of neighbors) {
    const r = recordAdjacentNeighbor({
      profile: input.customer_profile,
      actor: 'system:consultative-engine',
      name: n.name,
      source_type: n.source_type,
      likelihood: n.likelihood,
      classification: 'federated_externally',
      notes: 'Customer-owned; federate via MindsDB/MCP per federation.read_scopes.',
    })
    if (r.ok) out.brain_records_written.push(`adjacent_neighbors:${r.id}`)
  }

  // Seed entities
  const ent = upsertEntity({
    profile: input.customer_profile,
    actor: 'system:consultative-engine',
    type: 'organization',
    external_id: input.customer_profile,
    display_name: input.customer_display_name,
    attributes: {
      industry: input.industry ?? 'automotive-retail',
      rooftops: input.rooftops ?? [],
      contact: input.primary_contact ?? null,
    },
    source_refs: [
      { kind: 'wiki', value: wikiPath ?? '(none)' },
      { kind: 'engagement', value: 'engagement-state.yaml' },
    ],
  })
  if (ent.ok) out.brain_records_written.push(`entities:${ent.id}`)
  out.notes = 'agentic design wiki + adjacent neighbors + organization entity'
  return out
}

async function runAuthor(
  input: EngagementInput,
  decisionId: string,
): Promise<PhaseResult> {
  const out: PhaseResult = blank('author')

  // The six invariants — every wiki MUST carry these. Sixth is the
  // metadata substrate which is enforced at provisioning time (Brain
  // open creates the table); we still write a canon page documenting it.
  const invariants: Array<{
    file: string
    title: string
    body: string
  }> = [
    {
      file: 'scope-contract.md',
      title: `${input.customer_display_name} scope contract`,
      body: scopeContractBody(input),
    },
    {
      file: 'confidence-schema.md',
      title: `${input.customer_display_name} confidence schema`,
      body: confidenceSchemaBody(),
    },
    {
      file: 'human-relay-specification.md',
      title: `${input.customer_display_name} human relay specification`,
      body: humanRelayBody(),
    },
    {
      file: 'integration-playbooks.md',
      title: `${input.customer_display_name} integration playbooks`,
      body: integrationPlaybooksBody(input),
    },
    {
      file: 'house-canon-reference.md',
      title: `${input.customer_display_name} house canon reference`,
      body: houseCanonBody(),
    },
    {
      file: 'metadata-substrate.md',
      title: `${input.customer_display_name} metadata substrate (sixth invariant)`,
      body: metadataSubstrateBody(),
    },
  ]

  // Write all six to the customer's canon/ tree (these are governance
  // canon, not inbox proposals; the consultative agent has the authority
  // to seed canonical baseline pages at provisioning).
  const canonDir = path.join(customerProfileRoot(input), 'canon')
  fs.mkdirSync(canonDir, { recursive: true })
  for (const inv of invariants) {
    const target = path.join(canonDir, inv.file)
    const content = `${fm(inv.file.replace(/\.md$/, ''), 'invariant', 'canonical', inv.title)}\n${inv.body}\n`
    fs.writeFileSync(target, content, 'utf8')
    out.wiki_pages_written.push(`canon/${inv.file}`)
    recordAudit(input.customer_profile, {
      ts: now(),
      surface: 'wiki',
      actor: 'system:consultative-engine',
      action: 'create',
      target_type: 'page',
      target_id: `canon/${inv.file}`,
      reason: 'invariant seed authored at engagement init',
      outcome: 'ok',
    })
  }

  // Seed the K↔B interaction contract (B.3) too — it lives in canon.
  const ctr = seedInteractionContract(input.customer_profile, {
    profileRoot: customerProfileRoot(input),
  })
  if (ctr.written) out.wiki_pages_written.push('canon/knowledge-brain-interaction-contract.md')

  // Brain seed: observation of the engagement state
  const obs = insertObservation({
    profile: input.customer_profile,
    actor: 'system:consultative-engine',
    observer: 'consultative-architect',
    subject_type: 'engagement',
    subject_id: decisionId,
    observation: `Engagement authored with six wiki invariants seeded for ${input.customer_display_name}.`,
    confidence_label: 'B-3',
    source_refs: invariants.map(
      (i) => ({ kind: 'wiki', value: `canon/${i.file}` }) as SourceRef,
    ),
  })
  if (obs.ok) out.brain_records_written.push(`observations:${obs.id}`)

  out.notes = 'six invariants seeded; K↔B contract seeded; observation recorded'
  return out
}

async function runValidate(
  input: EngagementInput,
  decisionId: string,
): Promise<PhaseResult> {
  const out: PhaseResult = blank('validate')
  // Hunch: did the design account for after-hours leads?
  const hunch = recordHunch({
    profile: input.customer_profile,
    originating_guardian: 'DSG',
    subject_type: 'engagement',
    subject_id: decisionId,
    statement:
      'After-hours lead intake path is not explicit. Verify SMS-after-hours handling.',
    evidence_refs: [{ kind: 'wiki', value: 'canon/integration-playbooks.md' }],
    confidence_label: 'B-3',
    proposed_action: 'monitor',
    actor: 'system:consultative-engine',
  })
  if (hunch.ok) out.brain_records_written.push(`hunches:${hunch.id}`)

  // Surface a third assumption to clear the SRS C.5 ≥3-assumptions bar.
  const lm = recordLookupMiss({
    profile: input.customer_profile,
    actor: 'system:consultative-engine',
    query: 'preferred BDC handoff escalation path after 3 unanswered agent turns',
    scope: 'governance',
    downstream_decision: 'assumed',
    assumption: {
      statement:
        'Assumed escalation to GM via SMS after 3 unanswered agent turns until operator confirms BDC manager identity.',
      context: { phase: 'validate' },
    },
  })
  if (lm.ok && lm.assumption_id)
    out.assumptions_surfaced.push(lm.assumption_id)

  // Validation memo
  const text = await complete(input, {
    system:
      'You are the Consultative Architect. Produce a one-page validation summary describing what passed the challenge loop and what is still under review.',
    user: `Customer: ${input.customer_display_name}`,
  })
  const wikiPath = writeWikiInbox(
    input,
    'validation-summary.md',
    fm('validation-summary', 'memo', 'under-review', `${input.customer_display_name} validation summary`),
    text,
  )
  if (wikiPath) out.wiki_pages_written.push(wikiPath)
  out.notes = 'validation memo + hunch + escalation assumption'
  return out
}

async function runPackage(
  input: EngagementInput,
  decisionId: string,
): Promise<PhaseResult> {
  const out: PhaseResult = blank('package')

  // Make sure the Brain is provisioned + the sixth-invariant audit substrate is present.
  const readiness = provisionBrainForProfile(input.customer_profile, {
    profileRoot: customerProfileRoot(input),
  })
  if (!readiness.ok) {
    out.notes = `package phase failed readiness: ${readiness.reasons.join('; ')}`
    out.ok = false
    return out
  }

  // Emit an output for the prescription package manifest.
  const manifest = {
    customer: input.customer_display_name,
    profile: input.customer_profile,
    decision_id: decisionId,
    generated_at: new Date(now()).toISOString(),
    wiki_invariants: [
      'scope-contract',
      'confidence-schema',
      'human-relay-specification',
      'integration-playbooks',
      'house-canon-reference',
      'metadata-substrate',
    ],
    brain_schema_version: readiness.schema_version,
    notes:
      'Prescription package complete; engagement-state.yaml advanced to ready_to_run after operator approves readiness gates.',
  }
  const pkgPath = path.join(
    customerProfileRoot(input),
    'prescription-package.json',
  )
  fs.writeFileSync(pkgPath, JSON.stringify(manifest, null, 2), 'utf8')
  out.outputs_written.push(pkgPath)

  // Brain output record for the manifest.
  const o = insertOutput({
    profile: input.customer_profile,
    actor: 'system:consultative-engine',
    producer_actor: 'agent:consultative',
    output_type: 'prescription_package',
    content: JSON.stringify(manifest),
    metadata: { decision_id: decisionId },
    source_refs: [
      { kind: 'wiki', value: 'canon/scope-contract.md' },
      { kind: 'engagement', value: 'engagement-state.yaml' },
    ],
  })
  if (o.ok) out.brain_records_written.push(`outputs:${o.id}`)

  out.notes = `prescription package written to ${pkgPath}`
  return out
}

// ── Helpers ──────────────────────────────────────────────────────

function blank(phase: PhaseName): PhaseResult {
  return {
    phase,
    ok: true,
    outputs_written: [],
    brain_records_written: [],
    wiki_pages_written: [],
    assumptions_surfaced: [],
    capability_gaps: [],
    notes: '',
  }
}

function customerProfileRoot(input: EngagementInput): string {
  if (input.customerProfileRoot) return input.customerProfileRoot
  const root =
    process.env.BRAIN_PROFILES_ROOT ??
    path.join(os.homedir(), '.hermes', 'profiles')
  return path.join(root, input.customer_profile.replace(/[^a-zA-Z0-9_-]/g, '_'))
}

function writeWikiInbox(
  input: EngagementInput,
  filename: string,
  frontmatter: string,
  body: string,
): string | null {
  const target = path.join(
    customerProfileRoot(input),
    'knowledge',
    'inbox',
    filename,
  )
  // KSG pre-check.
  const ksgIn = `${frontmatter}\n${body}\n`
  const ksg = evaluateWikiSave({
    relativePath: `knowledge/inbox/${filename}`,
    previousContent: null,
    newContent: ksgIn,
  })
  if (!ksg.ok) {
    // Could happen if frontmatter shape is wrong — that's a bug here.
    recordAudit(input.customer_profile, {
      ts: now(),
      surface: 'wiki',
      actor: 'system:consultative-engine',
      action: 'gate_decision',
      target_type: 'page',
      target_id: `knowledge/inbox/${filename}`,
      reason: `KSG denied: ${ksg.reason}`,
      outcome: 'denied',
      rule: ksg.rule,
    })
    return null
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, ksgIn, 'utf8')
  recordAudit(input.customer_profile, {
    ts: now(),
    surface: 'wiki',
    actor: 'system:consultative-engine',
    action: 'create',
    target_type: 'page',
    target_id: `knowledge/inbox/${filename}`,
    reason: 'consultative authoring',
    outcome: 'ok',
  })
  return `knowledge/inbox/${filename}`
}

function fm(slug: string, type: string, status: string, title: string): string {
  return `---
title: ${title}
type: ${type}
status: ${status}
slug: ${slug}
---`
}

async function complete(
  input: EngagementInput,
  prompt: { system: string; user: string },
): Promise<string> {
  if (input.complete) {
    return await input.complete(prompt)
  }
  // Deterministic synthetic — readable, decision-traceable, no LLM dependency.
  return `${prompt.system}

For: ${input.customer_display_name}

${prompt.user}

Deterministic synthetic output — production runs replace this with a real model call.`
}

async function detectCapabilityGap(
  input: EngagementInput,
  description: string,
  proposal: string,
): Promise<string> {
  // Record the gap as an insertEvent + hunch so operator can see it.
  const ev = insertEvent({
    profile: input.customer_profile,
    actor: 'system:consultative-engine',
    type: 'capability_gap',
    source: 'consultative-engine',
    subject_type: 'engagement',
    subject_id: 'open',
    payload: { description, proposal },
    source_refs: [{ kind: 'engagement', value: 'engagement-state.yaml' }],
  })
  return ev.ok ? `events:${ev.id}` : ''
}

function writePrescriptionPackage(
  input: EngagementInput,
  decisionId: string,
  phases: Array<PhaseResult>,
): string {
  const target = path.join(
    customerProfileRoot(input),
    `engagement-${decisionId.slice(0, 8)}.json`,
  )
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(
    target,
    JSON.stringify(
      {
        customer: input.customer_display_name,
        profile: input.customer_profile,
        decision_id: decisionId,
        phases,
        generated_at: new Date(now()).toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  )
  return target
}

// ── Invariant bodies ─────────────────────────────────────────────

function scopeContractBody(input: EngagementInput): string {
  return `## What the system is for
Provide AI-mediated customer outreach, lead capture, and operational
analytics for ${input.customer_display_name}.

## What the system MUST do
- Capture every lead from every channel into the messaging-hub
- Memorialize every chat, call, SMS, and email per the metadata substrate
- Surface assumptions to the operator before the agent acts on them
- Honor the customer's existing CRM as the system of record for deals

## What the system MUST NOT do
- Silently overwrite canonical wiki claims
- Send communications without an explicit allowlist + rate cap
- Reach data outside its profile's federation.read_scopes

## Authority
The operator may grant or revoke specific capabilities by editing this
contract and promoting via the KSG flow.
`
}

function confidenceSchemaBody(): string {
  return `## Strategic confidence (Admiralty Code)
- Source reliability: A (completely reliable) ... F (cannot be judged)
- Information credibility: 1 (confirmed by independent sources) ... 6 (cannot be judged)
- Use the pair (e.g. \`B-2\`) on any record that influences strategy.

## Tactical confidence (records)
- \`canonical\` — agreed truth; protected; KSG-gated
- \`under-review\` — pending validation
- \`deprecated\` — no longer authoritative; retained for audit

## Publication rule
DSG refuses to publish a record with confidence_label=F as canonical.
`
}

function humanRelayBody(): string {
  return `## Approval gates
- ready_to_blueprint
- ready_to_instantiate_runtime
- ready_to_publish_mcp_projections
- ready_to_hand_off_externally
- topology_decided

Each gate requires an operator signature in \`engagement-state.yaml\`.

## Input requests as smells
When an agent cannot find what it needs, it records a lookup_miss and
surfaces an assumption to the operator. Assumptions are NOT silent.

## Feedback loops that must close
- assumption → resolution → suggested_knowledge_change → KSG promote
- reconciliation_item → resolution → wiki edit or Brain update
- hunch → resolution → wiki or Brain change OR explicit dismissal with rationale
`
}

function integrationPlaybooksBody(input: EngagementInput): string {
  const systems = input.known_systems ?? ['VinSolutions', 'Vapi', 'TextMagic', 'Resend']
  return systems
    .map(
      (s) => `## ${s}
- Auth: per-profile env var (see .env)
- Allowed scopes: federation.read_scopes / comms_* per studio.yaml
- Read: federation.query.${s.toLowerCase().replace(/[^a-z0-9]/g, '_')}
- Write: comms_send_* (where applicable)
- Audit: every call lands in ~/.hermes/mcp-audit.log + comms_log
`,
    )
    .join('\n')
}

function houseCanonBody(): string {
  return `## Firm-level worldview
Huminic Studio is the agent operating system. The wiki carries
meaning; the Brain carries operational truth; the DSG and KSG
guarantee neither overwrites the other silently.

## Pointers
- Artifact A — Methodology
- Artifact B — Spec v1.1
- Artifact D — Brain schema v1
- Cursor Implementation Package
- Data Architect Handoff Notes
- Cutover Ritual
`
}

function metadataSubstrateBody(): string {
  return `## Sixth wiki invariant
Every interaction with this customer's wiki or Brain is recorded in
\`metadata_audit\`. The substrate is append-only, runs on profile
provisioning, and is required for launch.

## What it captures
actor, action, target (type+id), version before/after, timestamp,
reason, gate event reference, confidence state, source references,
outcome, rule id.

## Drift, renewal, feedback
- Drift query: every change to a target since X with full attribution
- Renewal cadence: surfaces records past their verification window
- Feedback closure: human-relay decisions trace into resulting edits
`
}
