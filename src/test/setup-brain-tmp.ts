/**
 * Global test setup — point HOME at a fresh disposable /tmp directory so the DEFAULT
 * per-profile Brain path (os.homedir()/.hermes/...) resolves under /tmp, never the
 * developer's real ~/.hermes. Each test FILE runs in its own vitest process (forks +
 * isolate), so this creates a fresh HOME per file.
 *
 * Unlike setting BRAIN_PROFILES_ROOT (which OVERRIDES os.homedir and therefore breaks
 * tests that vi.spyOn(os, 'homedir')), moving HOME leaves os.homedir mockable: a test
 * that mocks os.homedir keeps full per-test isolation; a test that does not still lands
 * under /tmp. We intentionally do NOT set BRAIN_PROFILES_ROOT here.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

if (!process.env.HERMES_TEST_HOME) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-test-home-'))
  process.env.HERMES_TEST_HOME = home
  process.env.HOME = home
  process.env.USERPROFILE = home
}
