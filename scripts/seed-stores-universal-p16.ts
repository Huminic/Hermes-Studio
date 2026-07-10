#!/usr/bin/env tsx
/**
 * P1-6 — ground the 4 non-honda store widgets on the UNIVERSAL, brand-neutral
 * canonical nodes (behavior + policy only; ZERO invented facts). Honda model-
 * specific nodes (prologue-sourcing, test-drive w/ Accord/CR-V examples, role w/
 * Sylacauga) and fact nodes (inventory-and-pricing) are DELIBERATELY excluded so
 * those stay routed to a human, exactly like serra-honda. Writes through
 * guardedWikiWrite (KSG gate + Brain memorialize). Run INSIDE the studio container.
 */
import fs from 'node:fs'
import path from 'node:path'
import { guardedWikiWrite } from '../src/server/guarded-wiki'

const STORES: Record<string, string> = {
  'serra-nissan': 'Serra Nissan',
  'tony-serra-ford': 'Tony Serra Ford',
  'ford-of-columbia': 'Ford of Columbia',
  'hyundai-of-columbia': 'Hyundai of Columbia',
}
// Universal behavior/policy/process nodes only — verified free of model names in
// the body (the sole "Prologue" example in conversation-approach is neutralized
// below). No facts (hours/inventory/pricing) — those route to a human.
const NODES = [
  'policy/guardrails.md',
  'sales/conversation-approach.md',
  'sales/trade-in-process.md',
  'sales/trade-in-plus-down-payment-handling-play.md',
  'sales/lead-followup-cadence.md',
  'sales/budget-pre-owned-reengagement-play.md',
  'sales/passive-lead-checkback-play.md',
  'agents/caroline/escalation-path.md',
  'agents/caroline/tools.md',
]
const SRC = path.join(process.cwd(), 'scripts/seed/serra-honda/company-wiki')
const force = process.argv.includes('--force')

function genericize(content: string, store: string, display: string): string {
  return content
    // Slug in ALL forms: path prefix `serra-honda/`, the widget slug
    // `serra-honda-sales-chat`, and any bare occurrence.
    .replace(/serra-honda/g, store)
    .replace(/The Serra Way|Serra Way/g, 'Our Sales Approach')
    .replace(/Serra Honda of Sylacauga/g, display)
    .replace(/Serra Honda/g, display)
    // Neutralize Honda model names (used as examples in the guardrail/approach
    // nodes) so a non-Honda store never surfaces a Honda model.
    .replace(/the CR-V is a popular SUV/g, 'an SUV is a popular body style')
    .replace(/\bCR-V\b/g, 'SUV')
    .replace(/\bProlog(?:ue)?\b/gi, 'model')
    .replace(/\b(Accord|Civic|Pilot|Passport|HR-V|Ridgeline|Odyssey)\b/g, 'that model')
    // Drop Serra-specific customer-protection PROGRAM NAMES (not applicable to a
    // non-Serra store — asserting them would fabricate); keep the generic routing.
    .replace(/\s*\(Best Deal,?\s*72-Hour Exchange,?\s*No-Hassle Trade\)/g, '')
}

let ok = 0
let fail = 0
for (const [store, display] of Object.entries(STORES)) {
  for (const rel of NODES) {
    const src = fs.readFileSync(path.join(SRC, rel), 'utf8')
    const content = genericize(src, store, display)
    const relPath = `company-wiki/${rel}`
    const destFull = path.join(
      process.env.BRAIN_PROFILES_ROOT ??
        path.join(process.env.HOME ?? '/root', '.hermes', 'profiles'),
      store,
      relPath,
    )
    if (fs.existsSync(destFull) && !force) {
      console.log(`${store}  ${rel}  skip (exists)`)
      continue
    }
    const r = guardedWikiWrite({ profile: store, relPath, content, actor: 'system:p1-6-seed' })
    if (r.ok) {
      ok++
      console.log(`${store}  ${rel}  ${r.action}`)
    } else {
      fail++
      console.log(`${store}  ${rel}  FAILED [${r.rule}] ${r.reason}`)
    }
  }
}
console.log(`\ndone: ${ok} written, ${fail} failed`)
