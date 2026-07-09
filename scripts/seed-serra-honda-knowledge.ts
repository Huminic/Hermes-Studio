#!/usr/bin/env tsx
/**
 * Seed Serra Honda knowledge nodes into the company-wiki.
 *
 * Reads fixture files from scripts/seed/serra-honda/company-wiki/ and writes
 * each one through guardedWikiWrite so every write passes the KSG gate and is
 * memorialized to the Brain. Also installs the Caroline SMS persona into
 * governance/agents/caroline/personas/sms.md.
 *
 * Usage:
 *   pnpm tsx scripts/seed-serra-honda-knowledge.ts [--dry-run] [--force] [--promote <relPath>]
 *
 * Honors $BRAIN_PROFILES_ROOT (defaults to ~/.hermes/profiles).
 * Idempotent: existing files are skipped unless --force or --promote is used.
 *
 * --dry-run      Validate every node passes the KSG gate; write nothing.
 * --force        Overwrite nodes that already exist (except canonical-frozen).
 * --promote <p>  Re-save one node at relPath as status: canonical after operator
 *                verifies the source. <p> is relative to company-wiki/, e.g.
 *                "dealership/hours-location-contact.md".
 *                IMPORTANT: edit the fixture file to replace draft content with
 *                verified facts BEFORE running --promote.
 *
 * Example dry-run (no writes, safe for CI):
 *   BRAIN_PROFILES_ROOT=/tmp/test-profiles pnpm tsx scripts/seed-serra-honda-knowledge.ts --dry-run
 *
 * Example promote after operator verifies hours:
 *   pnpm tsx scripts/seed-serra-honda-knowledge.ts --promote dealership/hours-location-contact.md
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateWikiSave } from '../src/server/ksg-gate'
import { guardedWikiWrite } from '../src/server/guarded-wiki'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PROFILE = 'serra-honda'
const ACTOR = 'system:seed-serra-honda-knowledge'
const SEED_DIR = path.join(__dirname, 'seed', 'serra-honda')
const WIKI_FIXTURE_DIR = path.join(SEED_DIR, 'company-wiki')
const PERSONA_FIXTURE_SRC = path.join(
  SEED_DIR,
  'governance',
  'agents',
  'caroline',
  'personas',
  'sms.md',
)

function profilesRoot(): string {
  return process.env.BRAIN_PROFILES_ROOT ?? path.join(os.homedir(), '.hermes', 'profiles')
}

function profileRoot(): string {
  return path.join(profilesRoot(), PROFILE)
}

/**
 * Walk a directory tree and collect all .md file paths, returning them as
 * paths relative to the given base dir.
 */
function walkFixtures(dir: string, base: string = dir): Array<string> {
  const results: Array<string> = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkFixtures(full, base))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(path.relative(base, full))
    }
  }
  return results
}

/**
 * Convert a fixture-relative path (e.g. "sales/trade-in-process.md") to a
 * company-wiki relative path (e.g. "company-wiki/sales/trade-in-process.md")
 * using POSIX separators, as required by guardedWikiWrite + ensureSafePath.
 */
function toWikiRelPath(fixtureRel: string): string {
  return 'company-wiki/' + fixtureRel.replace(/\\/g, '/')
}

type SeedResult = {
  relPath: string
  ok: boolean
  action: string
  warnings: Array<string>
  reason?: string
}

function seedNode(
  fixtureRel: string,
  dryRun: boolean,
  force: boolean,
): SeedResult {
  const fixturePath = path.join(WIKI_FIXTURE_DIR, fixtureRel)
  const content = fs.readFileSync(fixturePath, 'utf8')
  const wikiRelPath = toWikiRelPath(fixtureRel)

  if (dryRun) {
    // In dry-run mode: resolve "previous content" from the temp BRAIN_PROFILES_ROOT
    // (which may not exist yet, that's fine — just validate the gate).
    let previousContent: string | null = null
    const destFull = path.join(profileRoot(), wikiRelPath)
    if (fs.existsSync(destFull)) {
      previousContent = fs.readFileSync(destFull, 'utf8')
    }
    const gate = evaluateWikiSave({
      relativePath: wikiRelPath,
      previousContent,
      newContent: content,
    })
    if (!gate.ok) {
      return {
        relPath: wikiRelPath,
        ok: false,
        action: 'dry-run',
        warnings: [],
        reason: `[${gate.rule}] ${gate.reason}`,
      }
    }
    return {
      relPath: wikiRelPath,
      ok: true,
      action: 'dry-run',
      warnings: gate.warnings,
    }
  }

  // Live write path — check if already exists and skip unless --force.
  const destFull = path.join(profileRoot(), wikiRelPath)
  if (fs.existsSync(destFull) && !force) {
    return {
      relPath: wikiRelPath,
      ok: true,
      action: 'skip (exists)',
      warnings: [],
    }
  }

  const result = guardedWikiWrite({
    profile: PROFILE,
    relPath: wikiRelPath,
    content,
    actor: ACTOR,
  })

  if (!result.ok) {
    return {
      relPath: wikiRelPath,
      ok: false,
      action: 'write-failed',
      warnings: [],
      reason: `[${result.rule}] ${result.reason}`,
    }
  }

  return {
    relPath: wikiRelPath,
    ok: true,
    action: result.action,
    warnings: result.warnings,
  }
}

/**
 * Promote a single node: re-read the fixture (which the operator must have already
 * edited to replace placeholder content with verified real facts), flip
 * `status: draft` → `status: canonical` in memory, and write through guardedWikiWrite.
 *
 * The fixture file itself is NOT modified — it remains as-is in the repo.
 * Only the profile volume receives the promoted content.
 *
 * IMPORTANT: before running --promote, the operator must:
 *   1. Edit the fixture file to replace all placeholder fact lines with verified values.
 *   2. Remove the "> STATUS: DRAFT" notice block from the fixture.
 *   3. Commit the updated fixture to the repo.
 *   4. Then run: pnpm tsx scripts/seed-serra-honda-knowledge.ts --promote <path>
 */
function promoteNode(wikiRelPath: string): void {
  // Normalize to the full company-wiki/ prefix.
  const normalized = wikiRelPath.startsWith('company-wiki/')
    ? wikiRelPath
    : 'company-wiki/' + wikiRelPath.replace(/^\//, '')

  // Resolve the fixture path by stripping the company-wiki/ prefix.
  const fixtureRel = normalized.replace(/^company-wiki\//, '')
  const fixturePath = path.join(WIKI_FIXTURE_DIR, fixtureRel)

  if (!fs.existsSync(fixturePath)) {
    console.error(`ERROR: fixture not found at ${fixturePath}`)
    console.error('Edit the fixture file with verified facts before promoting.')
    process.exit(1)
  }

  const content = fs.readFileSync(fixturePath, 'utf8')

  // Safety check: refuse to promote if the placeholder notice is still present.
  if (content.includes('FACTS PENDING OPERATOR VERIFICATION') || content.includes('STATUS: DRAFT')) {
    console.error(`ERROR: fixture still contains placeholder content.`)
    console.error(`  ${fixturePath}`)
    console.error('Remove the STATUS: DRAFT notice and replace placeholder facts with verified values before promoting.')
    process.exit(1)
  }

  // Replace status: draft with status: canonical in frontmatter (in memory only —
  // do NOT write back to the fixture file).
  const promoted = content.replace(/^(status:\s*)draft(\s*)$/m, '$1canonical$2')
  if (promoted === content) {
    // May already be canonical in the fixture — check the gate instead of erroring.
    console.warn('WARN: status: draft not found in fixture. The fixture may already be set to canonical.')
    console.warn('Proceeding with content as-is.')
  }

  // Write through guardedWikiWrite. The previous content on the volume must be
  // draft (not canonical) for this to succeed — canonical-frozen blocks rewrites.
  const result = guardedWikiWrite({
    profile: PROFILE,
    relPath: normalized,
    content: promoted !== content ? promoted : content,
    actor: ACTOR,
  })

  if (!result.ok) {
    console.error(`ERROR promoting ${normalized}: [${result.rule}] ${result.reason}`)
    process.exit(1)
  }

  console.log(`  promoted: ${normalized} -> status: canonical (action=${result.action})`)
  if (result.warnings.length > 0) {
    for (const w of result.warnings) console.warn(`  WARN: ${w}`)
  }
  if (result.memo_note) {
    console.warn(`  memo_note: ${result.memo_note}`)
  }
}

/**
 * Install the Caroline SMS persona to:
 *   <profileRoot>/governance/agents/caroline/personas/sms.md
 *
 * This is a direct filesystem write (not through guardedWikiWrite, which is
 * scoped to company-wiki/). The governance/ tree is written by the operator
 * path only.
 */
function installPersona(dryRun: boolean, force: boolean): void {
  const destDir = path.join(profileRoot(), 'governance', 'agents', 'caroline', 'personas')
  const destPath = path.join(destDir, 'sms.md')

  if (dryRun) {
    // For dry-run: just confirm the fixture is readable.
    if (!fs.existsSync(PERSONA_FIXTURE_SRC)) {
      console.error(`  FAIL persona: fixture not found at ${PERSONA_FIXTURE_SRC}`)
    } else {
      console.log(`  [dry-run] persona: would write governance/agents/caroline/personas/sms.md`)
    }
    return
  }

  if (fs.existsSync(destPath) && !force) {
    console.log(`  persona: skip (exists) — governance/agents/caroline/personas/sms.md`)
    return
  }

  if (!fs.existsSync(PERSONA_FIXTURE_SRC)) {
    console.error(`  FAIL persona: fixture not found at ${PERSONA_FIXTURE_SRC}`)
    return
  }

  fs.mkdirSync(destDir, { recursive: true })
  fs.copyFileSync(PERSONA_FIXTURE_SRC, destPath)
  console.log(`  persona: wrote governance/agents/caroline/personas/sms.md`)
}

/**
 * Guard against accidentally writing into the LIVE profile volume. A real write
 * (seed or promote) that targets the default ~/.hermes/profiles (i.e.
 * BRAIN_PROFILES_ROOT is unset) must be explicitly confirmed with --live. This
 * closes the footgun where running the script without BRAIN_PROFILES_ROOT wrote
 * real content into the running serra-honda profile.
 */
function assertLiveWriteConfirmed(live: boolean): void {
  if (!process.env.BRAIN_PROFILES_ROOT && !live) {
    console.error(
      'REFUSING to write to the LIVE profile volume (~/.hermes/profiles) without confirmation.',
    )
    console.error('This would write real knowledge into the running serra-honda profile.')
    console.error('  • Test/sandbox: set BRAIN_PROFILES_ROOT=/some/temp/dir (recommended)')
    console.error('  • Intentionally seed the LIVE volume: pass --live')
    process.exit(1)
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')
  const live = process.argv.includes('--live')
  const promoteIdx = process.argv.indexOf('--promote')
  const promoteArg = promoteIdx !== -1 ? process.argv[promoteIdx + 1] : null

  const root = profilesRoot()
  console.log(
    `seed-serra-honda-knowledge — root=${root} profile=${PROFILE} dryRun=${dryRun} force=${force} live=${live}`,
  )

  // --promote mode: single node promotion, then exit.
  if (promoteArg) {
    if (dryRun) {
      console.error('ERROR: --promote and --dry-run are mutually exclusive.')
      process.exit(1)
    }
    assertLiveWriteConfirmed(live)
    console.log(`\npromoting: ${promoteArg}`)
    promoteNode(promoteArg)
    console.log('done.')
    return
  }

  // A full seed that writes to disk must confirm the target when it's the live
  // default volume. (--dry-run writes nothing and is always safe.)
  if (!dryRun) {
    assertLiveWriteConfirmed(live)
  }

  // Ensure profile root exists for dry-run against a temp dir.
  if (dryRun) {
    fs.mkdirSync(profileRoot(), { recursive: true })
  }

  // Walk all fixtures and seed/validate each one.
  const fixtures = walkFixtures(WIKI_FIXTURE_DIR)
  if (fixtures.length === 0) {
    console.error(`ERROR: no fixtures found at ${WIKI_FIXTURE_DIR}`)
    process.exit(1)
  }

  console.log(`\n=== Company wiki nodes (${fixtures.length} fixtures) ===`)
  let failures = 0
  for (const rel of fixtures.sort()) {
    const result = seedNode(rel, dryRun, force)
    const tag = result.ok ? 'OK  ' : 'FAIL'
    console.log(`  ${tag} ${result.action.padEnd(18)} ${result.relPath}`)
    if (result.reason) {
      console.error(`       reason: ${result.reason}`)
      failures++
    }
    for (const w of result.warnings) {
      console.warn(`       WARN: ${w}`)
    }
  }

  console.log(`\n=== Persona ===`)
  installPersona(dryRun, force)

  console.log('')
  if (failures > 0) {
    console.error(`\n${failures} node(s) failed the KSG gate. Fix before seeding.`)
    process.exit(1)
  }
  console.log(`\ndone. ${fixtures.length} nodes ${dryRun ? 'validated (dry-run)' : 'seeded'}, persona installed.`)
}

void main()
