/**
 * Watchdog notification fixture — supported, app-layer seed / prove / cleanup.
 *
 * Purpose: exercise the metric-alert engine end-to-end on an ISOLATED, dedicated
 * fixture profile so the Watchdog produces a real notification record and DECIDES
 * to fire it, while outbound dispatch stays provably OFF (dry-run). No email is
 * ever sent; the recipient is under `.invalid`.
 *
 * It uses ONLY exported application-layer functions (the same ones the API routes
 * and the scheduled tick call) — never direct DB surgery:
 *   - getOrCreateThread / appendMessage         (messaging-hub app layer)
 *   - createMetricAlert / listNotifications /
 *     deleteNotification                         (notifications store app layer)
 *   - resolveMetricValues / evaluateProfileAlerts /
 *     dispatchFiringAlerts                        (watchdog engine)
 *   - deleteThread                               (messaging-hub app layer, cleanup)
 *
 * Isolation rails:
 *   - Refuses to run unless BRAIN_PROFILES_ROOT is set to a NON-production root
 *     (must not resolve ~/.hermes). All reads/writes land under that root.
 *   - Operates on EXACTLY one dedicated profile: `wd-fixture`. It never touches
 *     the governed profiles; seed/cleanup emit before/after brain.db hashes of
 *     serra-honda / serra-nissan / tony-serra-ford to prove they are unchanged.
 *
 * Usage:  BRAIN_PROFILES_ROOT=/srv/ingest-dev/analytics tsx scripts/watchdog-fixture.ts <seed|prove|cleanup|quarantine|status>
 *
 * OPERATIONAL LIMITATION — read-initializes-on-missing: a GET on the notifications
 * API/UI (e.g. /api/customer/alerts?profile=wd-fixture) calls listNotifications →
 * openBrain, which CREATES an empty profile DB if absent. A live headed UI page
 * left open on the fixture polls and re-materializes an empty, markerless dir even
 * after cleanup. Protocol: gather all API/UI evidence WHILE the fixture is seeded;
 * navigate/close the fixture page BEFORE cleanup; after cleanup verify absence with
 * the filesystem + `status` only (status never lists when the dir is absent) — do
 * NOT issue any fixture API/UI read post-cleanup. A stray empty dir can be recovered
 * with `quarantine` (path-verified move to os.tmpdir; refuses non-empty/ready dirs).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  appendMessage,
  deleteThread,
  getOrCreateThread,
  listThreads,
  upsertContact,
} from '../src/server/messaging-hub-store'
import {
  createMetricAlert,
  deleteNotification,
  listNotifications,
} from '../src/server/watchdog/notifications-store'
import { resolveMetricValues } from '../src/server/watchdog/metric-values'
import { evaluateProfileAlerts } from '../src/server/watchdog/alert-engine'
import {
  dispatchFiringAlerts,
  type AlertSender,
} from '../src/server/watchdog/alert-dispatch'

export const FIXTURE_PROFILE = 'wd-fixture'
export const TAG = 'WATCHDOG-FIXTURE'
export const RECIPIENT = 'verifier@fixture.invalid'
export const CONTACT = 'wd-fixture+seed@fixture.invalid'
const METRIC_ID = 'engagement.conversations'
const METRIC_LABEL = 'Conversations held'
const THRESHOLD = 5
const WINDOW_DAYS = 30
export const GOVERNED = ['serra-honda', 'serra-nissan', 'tony-serra-ford']

export type SeedPhase = 'seeding' | 'ready'

export type FixtureMarker = {
  tag: string
  profile: string
  recipient: string
  /** Unique id for this seed attempt — the ownership token for quarantine/cleanup. */
  runId: string
  /** 'seeding' = provisional (writes in flight); 'ready' = finalized + safe to clean. */
  phase: SeedPhase
  /** null until the seed is finalized to 'ready'. */
  threadId: string | null
  alertId: string | null
  seededAt: number
}

/** The single governed isolated analytics root this fixture may target on the host. */
export const ALLOWED_ANALYTICS_ROOT = '/srv/ingest-dev/analytics'

function canonical(p: string): string {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

/**
 * Fail-closed root guard. BRAIN_PROFILES_ROOT must canonically resolve to EXACTLY
 * the governed analytics root OR be strictly under the OS temp dir (test harness).
 * This rejects '/', '/srv', '~/.hermes*', and every other path — so a broad or
 * production root can never be a target.
 */
export function fixtureRoot(): string {
  const raw = process.env.BRAIN_PROFILES_ROOT
  if (!raw) {
    throw new Error(
      'BRAIN_PROFILES_ROOT must be set — refusing (unset would default to ~/.hermes / production).',
    )
  }
  const root = path.resolve(raw) // lexical
  const real = canonical(raw) // canonical (symlinks resolved)
  const tmp = canonical(os.tmpdir())
  const allowedReal = canonical(ALLOWED_ANALYTICS_ROOT)
  const underTmp = (p: string) => p === tmp || p.startsWith(tmp + path.sep)
  // Analytics: the CANONICAL path must be the governed analytics root (a symlink
  // named "…/analytics" that resolves elsewhere is rejected).
  const isAnalytics = real === allowedReal
  // Temp: BOTH the lexical and the canonical path must stay under os.tmpdir, so a
  // symlink like /tmp/link -> /srv (lexically under tmp, canonically not) is rejected.
  const isTemp = underTmp(root) && underTmp(real)
  if (!isAnalytics && !isTemp) {
    throw new Error(
      `Refusing BRAIN_PROFILES_ROOT="${raw}": must canonically be ${ALLOWED_ANALYTICS_ROOT} or stay under the OS temp dir (lexical + canonical).`,
    )
  }
  return root
}

function profileDir(): string {
  return path.join(fixtureRoot(), FIXTURE_PROFILE)
}
function markerPath(): string {
  return path.join(profileDir(), '.watchdog-fixture.json')
}

/**
 * WAL-safe file-set hash: full sha256 over an ordered set of files, folding each
 * file's name + presence + bytes into the digest. Including the `-wal`/`-shm`
 * sidecars captures any not-yet-checkpointed writes, so the hash is stable and
 * complete without mutating the database (no checkpoint side effects).
 */
function fileSetHash(files: Array<string>): string {
  const h = crypto.createHash('sha256')
  for (const f of files) {
    h.update(path.basename(f))
    h.update(fs.existsSync(f) ? '\x01' : '\x00')
    if (fs.existsSync(f)) h.update(fs.readFileSync(f))
    h.update('\x00')
  }
  return h.digest('hex')
}

/**
 * Full content hash per governed profile over BOTH stores (brain.db +
 * messaging-hub.db) and their WAL/SHM sidecars — the evidence that the governed
 * profiles are byte-for-byte unchanged across the fixture lifecycle.
 */
export function governedHashes(
  profiles: Array<string> = GOVERNED,
): Record<string, string> {
  const root = fixtureRoot()
  const out: Record<string, string> = {}
  for (const p of profiles) {
    const brain = path.join(root, p, 'brain', 'brain.db')
    const hub = path.join(root, p, 'messaging-hub.db')
    out[p] = fileSetHash([
      brain,
      `${brain}-wal`,
      `${brain}-shm`,
      hub,
      `${hub}-wal`,
      `${hub}-shm`,
    ])
  }
  return out
}

/**
 * Seed: a tagged thread + one synthetic INBOUND reply (so engagement.conversations
 * resolves to a real value of 1), and a tagged metric alert that fires when
 * conversations fall below 5. Writes a marker for precise cleanup.
 */
/** Move a directory to `dest`, falling back to copy+remove across filesystems (EXDEV). */
function moveDir(src: string, dest: string): void {
  try {
    fs.renameSync(src, dest)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EXDEV') {
      fs.cpSync(src, dest, { recursive: true })
      fs.rmSync(src, { recursive: true, force: true })
    } else {
      throw e
    }
  }
}

/**
 * Quarantine a FAILED seed's partial directory. Re-reads the on-disk marker and
 * requires it to be exactly OUR provisional (owned) marker — same tag / profile /
 * recipient / runId and phase='seeding' — plus a path-shape check, THEN renames
 * the owned dir to a unique path under os.tmpdir. Never blind-rm; refuses if the
 * marker doesn't validate as owned.
 */
function quarantinePartial(owned: FixtureMarker): string {
  const dir = profileDir()
  let onDisk: FixtureMarker
  try {
    onDisk = JSON.parse(fs.readFileSync(markerPath(), 'utf8')) as FixtureMarker
  } catch {
    throw new Error(`refusing to quarantine: marker unreadable at ${markerPath()}`)
  }
  const ownedOk =
    onDisk.tag === TAG &&
    onDisk.profile === FIXTURE_PROFILE &&
    onDisk.recipient === RECIPIENT &&
    onDisk.phase === 'seeding' &&
    onDisk.runId === owned.runId
  if (!ownedOk) {
    throw new Error('refusing to quarantine: on-disk marker failed owned-provisional validation')
  }
  const parentReal = canonical(path.dirname(dir))
  const rootReal = canonical(fixtureRoot())
  if (path.basename(dir) !== FIXTURE_PROFILE || parentReal !== rootReal) {
    throw new Error('refusing to quarantine: path-shape validation failed')
  }
  const dest = path.join(canonical(os.tmpdir()), `wd-fixture-quarantine-${owned.runId}`)
  moveDir(dir, dest)
  return dest
}

/**
 * Transaction-like seed. From the FIRST filesystem touch: create the exact profile
 * dir and write a validated PROVISIONAL ownership marker (phase='seeding', runId)
 * BEFORE any app-layer write. Do the supported app-layer writes, then finalize the
 * marker to phase='ready' with the thread/alert ids. On ANY failure, quarantine the
 * owned partial dir to os.tmpdir (validated by the provisional marker) and rethrow —
 * so no unowned residue is ever left and nothing is blind-removed.
 *
 * `opts.onAfterFirstWrite` is a test hook fired right after the first app-layer
 * write (upsertContact) to exercise the failure/quarantine path.
 */
export function seedFixture(
  now: number = Date.now(),
  opts: { onAfterFirstWrite?: () => void } = {},
): FixtureMarker {
  fixtureRoot()
  const dir = profileDir()
  // Never clobber an existing fixture — force an explicit cleanup first.
  if (fs.existsSync(dir)) {
    throw new Error(`Refusing to seed: fixture profile dir already exists at ${dir} — run cleanup first.`)
  }

  // Establish provisional ownership BEFORE any app-layer write.
  const runId = crypto.randomUUID()
  const provisional: FixtureMarker = {
    tag: TAG,
    profile: FIXTURE_PROFILE,
    recipient: RECIPIENT,
    runId,
    phase: 'seeding',
    threadId: null,
    alertId: null,
    seededAt: now,
  }
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(markerPath(), JSON.stringify(provisional, null, 2))

  try {
    // Supported contact/thread/message layer (mirrors /api/messaging/inbound):
    // register the synthetic contact so the conversation resolves via a real
    // contact identity, not a handle fallback. This is the FIRST app-layer write.
    upsertContact({
      profile: FIXTURE_PROFILE,
      display_name: `${TAG} synthetic customer`,
      identifiers: { chat: CONTACT },
    })
    opts.onAfterFirstWrite?.() // test hook: inject a failure after the first write

    const thread = getOrCreateThread({
      profile: FIXTURE_PROFILE,
      domain: 'sales',
      channel: 'chat',
      contact_handle: CONTACT,
      subject: `${TAG} seed thread`,
      force_new: true,
    })
    // One outbound touch + one inbound reply → a real "conversation" (replied=1).
    appendMessage({
      thread_id: thread.id,
      direction: 'outbound',
      role: 'assistant',
      channel: 'chat',
      content: `[${TAG}] synthetic outbound touch — never sent`,
      author: 'fixture-agent',
    })
    appendMessage({
      thread_id: thread.id,
      direction: 'inbound',
      role: 'user',
      channel: 'chat',
      content: `[${TAG}] synthetic inbound reply`,
      author: CONTACT,
    })

    const created = createMetricAlert(
      {
        profile: FIXTURE_PROFILE,
        email: RECIPIENT,
        metric_id: METRIC_ID,
        metric_label: METRIC_LABEL,
        rule_type: 'threshold',
        direction: 'below',
        threshold: THRESHOLD,
        query_name: `${TAG} conversations low`,
        description: `${TAG} synthetic metric alert — heads-up only, never sends (recipient under .invalid).`,
      },
      now,
    )
    if (!created.ok) throw new Error(`createMetricAlert failed: ${created.error}`)

    // Finalize the marker to 'ready' ONLY after every write succeeded.
    const ready: FixtureMarker = {
      ...provisional,
      phase: 'ready',
      threadId: thread.id,
      alertId: created.id,
    }
    fs.writeFileSync(markerPath(), JSON.stringify(ready, null, 2))
    return ready
  } catch (err) {
    const quarantine = quarantinePartial(provisional)
    throw new Error(
      `seed failed (${err instanceof Error ? err.message : String(err)}); quarantined partial fixture to ${quarantine}`,
    )
  }
}

export type FixtureProof = {
  conversations: number | null
  fires: number
  firingMessages: Array<string>
  dispatch: Array<{ to: string; dry_run: boolean; sent: boolean }>
  senderCalls: Array<string>
  outboundEnabled: boolean
  commsTickEnabled: boolean
  notificationRecords: number
}

/**
 * Prove: resolve the live metric value, evaluate the alert, and dispatch with
 * send:false. Asserts (by returned shape) that it FIRES but nothing is sent and
 * outbound/tick env are off. The injected sender must never be called.
 */
export async function proveFixture(
  now: number = Date.now(),
  opts: { sender?: AlertSender } = {},
): Promise<FixtureProof> {
  fixtureRoot()
  const values = resolveMetricValues(FIXTURE_PROFILE, WINDOW_DAYS, now)
  const conversations = values.has(METRIC_ID) ? (values.get(METRIC_ID) ?? null) : null
  const decisions = evaluateProfileAlerts(FIXTURE_PROFILE, { values, now })

  const senderCalls: Array<string> = []
  const guardSender: AlertSender = async (input) => {
    senderCalls.push(input.to)
    return { ok: false, error: 'fixture sender is disabled — must never be called' }
  }
  const dispatch = await dispatchFiringAlerts(FIXTURE_PROFILE, decisions, {
    now,
    send: false, // DRY-RUN: decide only, send nothing
    sender: opts.sender ?? guardSender,
  })

  const firing = decisions.filter((d) => d.decision.fires)
  const tagged = listNotifications(FIXTURE_PROFILE).filter((n) => n.email === RECIPIENT)
  return {
    conversations,
    fires: firing.length,
    firingMessages: firing.map((f) => ('message' in f.decision ? f.decision.message : '')),
    dispatch: dispatch.map((d) => ({ to: d.to, dry_run: d.dry_run, sent: d.sent })),
    senderCalls,
    outboundEnabled: process.env.OUTBOUND_LIVE_ENABLED === 'true',
    commsTickEnabled: process.env.COMMS_TICK_ENABLED === 'true',
    notificationRecords: tagged.length,
  }
}

export type FixtureCleanup = {
  deletedNotifications: number
  deletedThreads: number
  residualNotifications: number
  removedDir: boolean
}

/**
 * Cleanup: delete exactly the tagged notification + thread (by marker id, falling
 * back to the tagged recipient), then remove the dedicated fixture profile dir so
 * zero residue remains. Precise — never touches other profiles.
 */
export function cleanupFixture(): FixtureCleanup {
  const root = fixtureRoot()
  const dir = profileDir()

  // Require a valid, OWNED marker. Missing/invalid → refuse; never rm blindly.
  let marker: FixtureMarker
  try {
    marker = JSON.parse(fs.readFileSync(markerPath(), 'utf8')) as FixtureMarker
  } catch {
    throw new Error(`Refusing cleanup: missing/unreadable fixture marker at ${markerPath()}.`)
  }
  const ownershipOk =
    marker.tag === TAG &&
    marker.profile === FIXTURE_PROFILE &&
    marker.recipient === RECIPIENT &&
    marker.phase === 'ready' && // accept ONLY a finalized marker
    typeof marker.runId === 'string' &&
    marker.runId.length > 0 &&
    typeof marker.alertId === 'string' &&
    marker.alertId.length > 0 &&
    typeof marker.threadId === 'string' &&
    marker.threadId.length > 0
  if (!ownershipOk) {
    throw new Error(
      'Refusing cleanup: fixture marker failed ownership validation (tag/profile/recipient/phase=ready/runId/ids).',
    )
  }

  // Owned ids (validated as non-null strings by ownershipOk above).
  const alertId = marker.alertId as string
  const threadId = marker.threadId as string

  // Delete EXACTLY the owned records by id (supported app-layer functions).
  const before = listNotifications(FIXTURE_PROFILE)
  let deletedNotifications = 0
  for (const n of before.filter((n) => n.id === alertId)) {
    if (deleteNotification(FIXTURE_PROFILE, n.id)) deletedNotifications++
  }
  const deletedThreads = deleteThread(FIXTURE_PROFILE, threadId) ? 1 : 0
  const residualNotifications = listNotifications(FIXTURE_PROFILE).length

  // Remove the dedicated fixture dir ONLY when ALL hold:
  //   - path shape: basename is the fixture profile and its parent is the root;
  //   - ownership: the validated marker file is still present;
  //   - EXACT accounting: exactly one owned notification + one owned thread were
  //     deleted and NO notifications remain. If anything unexpected exists in the
  //     fixture profile (concurrent/foreign records), refuse the recursive remove.
  let removedDir = false
  const parentReal = canonical(path.dirname(dir))
  const rootReal = canonical(root)
  const exactAccounting =
    deletedNotifications === 1 && deletedThreads === 1 && residualNotifications === 0
  if (
    exactAccounting &&
    path.basename(dir) === FIXTURE_PROFILE &&
    parentReal === rootReal &&
    fs.existsSync(markerPath()) &&
    fs.existsSync(dir)
  ) {
    fs.rmSync(dir, { recursive: true, force: true })
    removedDir = true
  }
  return { deletedNotifications, deletedThreads, residualNotifications, removedDir }
}

/**
 * Quarantine a PRE-EXISTING fixture dir that is NOT a live owned fixture — e.g. an
 * empty dir the running :3730 server lazily materialized (openBrain/getDb ensure)
 * when its API/UI was queried for this profile, or a partial dir with a non-'ready'
 * marker. Refuses if a valid READY owned marker is present (that's a live fixture —
 * use cleanup). Path-verified; renames to a unique os.tmpdir path — never blind-rm.
 */
export function quarantineStale(): { quarantined: string | null; reason: string } {
  const root = fixtureRoot()
  const dir = profileDir()
  if (!fs.existsSync(dir)) return { quarantined: null, reason: 'no fixture dir present' }

  let marker: FixtureMarker | null = null
  try {
    marker = JSON.parse(fs.readFileSync(markerPath(), 'utf8')) as FixtureMarker
  } catch {
    marker = null
  }
  const isLiveOwned =
    !!marker &&
    marker.tag === TAG &&
    marker.profile === FIXTURE_PROFILE &&
    marker.phase === 'ready' &&
    !!marker.alertId &&
    !!marker.threadId
  if (isLiveOwned) {
    throw new Error('refusing to quarantine: a valid READY fixture marker is present — use cleanup instead.')
  }

  // Verify it holds NO records — the poll/GET-initialized empty fixture only. If any
  // notification or thread exists, refuse (it is not the empty artifact we expect).
  const notifCount = listNotifications(FIXTURE_PROFILE).length
  const threadCount = listThreads({ profile: FIXTURE_PROFILE }).length
  if (notifCount > 0 || threadCount > 0) {
    throw new Error(
      `refusing to quarantine: fixture dir is not empty (notifications=${notifCount}, threads=${threadCount}).`,
    )
  }

  const parentReal = canonical(path.dirname(dir))
  const rootReal = canonical(root)
  if (path.basename(dir) !== FIXTURE_PROFILE || parentReal !== rootReal) {
    throw new Error('refusing to quarantine: path-shape validation failed')
  }
  const dest = path.join(canonical(os.tmpdir()), `wd-fixture-quarantine-stale-${crypto.randomUUID()}`)
  moveDir(dir, dest)
  return {
    quarantined: dest,
    reason: marker ? 'partial dir (non-ready marker)' : 'stale artifact (no marker)',
  }
}

export function fixtureStatus() {
  fixtureRoot()
  const dirExists = fs.existsSync(profileDir())
  const notifications = dirExists ? listNotifications(FIXTURE_PROFILE).length : 0
  return { profile: FIXTURE_PROFILE, dirExists, notifications, governed: governedHashes() }
}

async function main(): Promise<void> {
  const cmd = process.argv[2]
  fixtureRoot() // fail-closed guard before anything
  if (cmd === 'seed') {
    const governedBefore = governedHashes()
    const seed = seedFixture()
    console.log(JSON.stringify({ ok: true, cmd, seed, governedBefore, governedAfter: governedHashes() }, null, 2))
  } else if (cmd === 'prove') {
    const prove = await proveFixture()
    console.log(JSON.stringify({ ok: true, cmd, prove, governed: governedHashes() }, null, 2))
  } else if (cmd === 'cleanup') {
    const governedBefore = governedHashes()
    const cleanup = cleanupFixture()
    console.log(JSON.stringify({ ok: true, cmd, cleanup, governedBefore, governedAfter: governedHashes() }, null, 2))
  } else if (cmd === 'quarantine') {
    const res = quarantineStale()
    console.log(JSON.stringify({ ok: true, cmd, ...res }, null, 2))
  } else if (cmd === 'status') {
    console.log(JSON.stringify({ ok: true, cmd, ...fixtureStatus() }, null, 2))
  } else {
    console.error('usage: watchdog-fixture <seed|prove|cleanup|quarantine|status>')
    process.exit(2)
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.stack : e)
    process.exit(1)
  })
}
