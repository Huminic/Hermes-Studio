/**
 * Server-side studio.yaml reader. Hands the API endpoint a parsed config or a
 * default if the file is missing or malformed.
 */

import fs from 'node:fs'
import path from 'node:path'
import { getProfileWorkspaceRoot } from './profiles-browser'
import {
  parseStudioConfig,
  defaultStudioConfig,
  type StudioConfig,
} from '../lib/studio-config'

export type ReadStudioConfigResult = {
  config: StudioConfig
  source: 'file' | 'default'
  parseErrors?: Array<string>
}

export function readStudioConfig(profile: string): ReadStudioConfigResult {
  let root: string
  try {
    root = getProfileWorkspaceRoot(profile)
  } catch (err) {
    return {
      config: defaultStudioConfig(profile),
      source: 'default',
      parseErrors: [(err as Error).message],
    }
  }

  const file = path.join(root, 'studio.yaml')
  if (!fs.existsSync(file)) {
    return { config: defaultStudioConfig(profile), source: 'default' }
  }
  const text = fs.readFileSync(file, 'utf8')
  const parsed = parseStudioConfig(text)
  if (parsed.ok) {
    return { config: parsed.config, source: 'file' }
  }
  return {
    config: defaultStudioConfig(profile),
    source: 'default',
    parseErrors: parsed.errors,
  }
}
