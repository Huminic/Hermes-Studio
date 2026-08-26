import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getProfilesRoot } from '../server/profiles-browser'

/**
 * Fail-closed isolation guard: a dev/harness process (DEV_ANALYTICS_ROOT set)
 * must never silently resolve the production ~/.hermes profile config.
 */
describe('profiles-browser isolation guard', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    delete process.env.STUDIO_PROFILES_ROOT
    delete process.env.BRAIN_PROFILES_ROOT
    delete process.env.DEV_ANALYTICS_ROOT
  })
  afterEach(() => {
    process.env = { ...saved }
  })

  it('throws in harness mode with no isolated profiles root (fail-closed)', () => {
    process.env.DEV_ANALYTICS_ROOT = '/srv/ingest-dev/analytics'
    expect(() => getProfilesRoot()).toThrow(/refusing to read production/i)
  })

  it('resolves the isolated root when BRAIN_PROFILES_ROOT is set', () => {
    process.env.DEV_ANALYTICS_ROOT = '/srv/ingest-dev/analytics'
    process.env.BRAIN_PROFILES_ROOT = '/srv/ingest-dev/analytics'
    expect(getProfilesRoot()).toBe('/srv/ingest-dev/analytics')
    expect(getProfilesRoot()).not.toContain('/.hermes')
  })

  it('resolves production default when not in harness mode', () => {
    expect(getProfilesRoot()).toContain('/.hermes/profiles')
  })
})
