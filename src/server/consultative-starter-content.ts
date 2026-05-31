/**
 * Consultative Agent starter content verifier (SRS Tranche C.2).
 *
 * The Consultative Agent MUST start with: Artifact A, B v1.1, C v1.0,
 * D v1, the Cursor implementation package, the Hermes Studio operating
 * context, the data architect handoff notes, the cutover ritual, and
 * any canon declared in canon/house-canon-index.md.
 *
 * Engagement initialization fails closed if any starter artifact is
 * missing (acceptance C.2 first bullet).
 */

import fs from 'node:fs'
import path from 'node:path'

export type StarterArtifact = {
  id: string
  label: string
  candidatePaths: Array<string>
}

export type StarterArtifactStatus = StarterArtifact & {
  present: boolean
  resolved_path: string | null
}

export function defaultStarterArtifacts(repoRoot: string): Array<StarterArtifact> {
  const pkg = path.join(
    repoRoot,
    'docs',
    'consulting_package',
    'Hermes_Cursor_Implementation_Package',
  )
  return [
    {
      id: 'artifact-a-methodology',
      label: 'Artifact A — Methodology',
      candidatePaths: [
        path.join(pkg, 'artifacts', 'Artifact_A_Methodology_Revised_v2.md'),
      ],
    },
    {
      id: 'artifact-b-spec',
      label: 'Artifact B — Spec (v1.1)',
      candidatePaths: [
        path.join(pkg, 'artifacts', 'Artifact_B_Spec_Revised_v1_1.md'),
      ],
    },
    {
      id: 'artifact-c-worked-wiki',
      label: 'Artifact C — Consultative-Agent worked-wiki (zip)',
      candidatePaths: [
        path.join(pkg, 'artifacts', 'consultative-agent-wiki-revised.zip'),
      ],
    },
    {
      id: 'artifact-d-data-brain-schema',
      label: 'Artifact D — Data Brain Schema v1',
      candidatePaths: [
        path.join(pkg, 'artifacts', 'Artifact_D_Data_Brain_Schema_v1.md'),
      ],
    },
    {
      id: 'cursor-package-readme',
      label: 'Hermes Cursor Implementation Package',
      candidatePaths: [path.join(pkg, '00_README_START_HERE.md')],
    },
    {
      id: 'data-architect-handoff',
      label: 'Data architect handoff notes',
      candidatePaths: [
        path.join(repoRoot, 'docs', 'data-architect-handoff-notes.md'),
      ],
    },
    {
      id: 'cutover-ritual',
      label: 'Cutover ritual document',
      candidatePaths: [path.join(repoRoot, 'docs', 'cutover-ritual.md')],
    },
    {
      id: 'srs-next-phase',
      label: 'SRS — Next Phase Combined',
      candidatePaths: [
        path.join(
          repoRoot,
          'docs',
          'next-phase-data-to-completion',
          'SRS_Phase_Next_Combined.md',
        ),
      ],
    },
  ]
}

export function checkStarterContent(
  repoRoot: string,
  artifacts: Array<StarterArtifact> = defaultStarterArtifacts(repoRoot),
): {
  ok: boolean
  missing: Array<string>
  status: Array<StarterArtifactStatus>
} {
  const status = artifacts.map((a) => {
    for (const p of a.candidatePaths) {
      if (fs.existsSync(p)) {
        return { ...a, present: true, resolved_path: p }
      }
    }
    return { ...a, present: false, resolved_path: null }
  })
  const missing = status.filter((s) => !s.present).map((s) => s.id)
  return { ok: missing.length === 0, missing, status }
}
