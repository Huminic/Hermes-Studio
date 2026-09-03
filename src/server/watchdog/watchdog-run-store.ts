/**
 * Watchdog run compatibility facade.
 *
 * The generic canonical §7 core (canonical-watchdog-store.ts) is the reusable owner;
 * the PKT-02-01 adapter (pkt-02-01-canonical-adapter.ts) builds its envelope; the
 * packet-specific watchdog_packet_* store (packet-brain-store.ts) is preserved
 * unchanged as the rollback surface. This facade is the single read/write entry point:
 *
 *   - persistWatchdogRun      -> canonical ONLY (new packets never dual-write legacy).
 *   - readWatchdogRun         -> canonical (fully verified) if present, else legacy.
 *   - reconstructedShaWatchdog -> canonical if present, else legacy.
 *   - listWatchdogRuns        -> canonical ∪ legacy, canonical wins on run_key.
 *   - backfillLegacyToCanonical (re-exported) migrates the accepted PKT-02-01 run.
 *
 * "Prefer canonical, fall back to legacy only when canonical is ABSENT": a canonical
 * run that exists but fails full-graph verification THROWS (it is not masked by the
 * legacy fallback); only a genuinely missing canonical run falls back.
 */
import { HONDA_PROFILE } from '../reports/packet/leads-input'
import {
  listPacketRuns,
  readPacketRun,
  reconstructedContentSha as reconstructedContentShaLegacy,
} from './packet-brain-store'
import {
  listCanonicalRuns,
  readCanonicalRun,
  reconstructedContentShaCanonical,
} from './canonical-watchdog-store'
import {
  backfillLegacyToCanonical,
  persistPkt0201Canonical,
} from './pkt-02-01-canonical-adapter'
import type { StoredPacketRun } from './packet-brain-store'
import type {
  CanonicalPersistResult,
  StoredCanonicalRun,
} from './canonical-watchdog-store'
import type { PacketRun } from '../reports/packet/engine'

export {
  backfillLegacyToCanonical,
  persistPkt0201Canonical,
  readPkt0201Canonical,
  listPkt0201CanonicalRuns,
  type BackfillResult,
} from './pkt-02-01-canonical-adapter'
export {
  readCanonicalRunRawForensic,
  CanonicalWatchdogIntegrityError,
  CanonicalWatchdogStoreError,
  type StoredCanonicalRun,
} from './canonical-watchdog-store'
// Item 9: the packet-AGNOSTIC public persistence entry point + validation + read/list,
// for any future packet that builds its own CanonicalRunEnvelope.
export {
  persistCanonicalRunEnvelope,
  validateEnvelope,
  envelopeContentSha,
  readCanonicalRun as readCanonicalRunGeneric,
  reconstructedContentShaCanonical as reconstructedContentShaGeneric,
  listCanonicalRuns as listCanonicalRunsGeneric,
  type CanonicalRunEnvelope,
} from './canonical-watchdog-store'

type Opts = { profile?: string; profileRoot?: string; repoRoot?: string }

/** New packets write CANONICAL only (no indefinite dual-write). PKT-02-01 path. */
export function persistWatchdogRun(
  run: PacketRun,
  opts: Opts = {},
): CanonicalPersistResult {
  return persistPkt0201Canonical(run, opts)
}

/** Read a run preferring the fully-verified canonical graph; fall back to the legacy
 *  adapter only when NO canonical run exists for the key. */
export function readWatchdogRun(
  runKey: string,
  opts: Opts = {},
):
  | ((StoredCanonicalRun | StoredPacketRun) & {
      source: 'canonical' | 'legacy'
    })
  | null {
  const profile = opts.profile ?? HONDA_PROFILE
  const canonical = readCanonicalRun(runKey, {
    profile,
    profileRoot: opts.profileRoot,
  })
  if (canonical) return { ...canonical, source: 'canonical' }
  const legacy = readPacketRun(runKey, {
    profile,
    profileRoot: opts.profileRoot,
  })
  return legacy ? { ...legacy, source: 'legacy' } : null
}

/** Reconstructed content hash, canonical-first. */
export function reconstructedShaWatchdog(
  runKey: string,
  opts: Opts = {},
): { sha: string | null; source: 'canonical' | 'legacy' | 'absent' } {
  const profile = opts.profile ?? HONDA_PROFILE
  const c = reconstructedContentShaCanonical(runKey, {
    profile,
    profileRoot: opts.profileRoot,
  })
  if (c !== null) return { sha: c, source: 'canonical' }
  const l = reconstructedContentShaLegacy(runKey, {
    profile,
    profileRoot: opts.profileRoot,
  })
  return l !== null
    ? { sha: l, source: 'legacy' }
    : { sha: null, source: 'absent' }
}

/** Union of canonical + legacy run keys for a profile; canonical wins a shared key. */
export function listWatchdogRuns(opts: Opts = {}): Array<{
  run_key: string
  period: string
  content_sha256: string
  source: 'canonical' | 'legacy'
}> {
  const profile = opts.profile ?? HONDA_PROFILE
  const out = new Map<
    string,
    {
      run_key: string
      period: string
      content_sha256: string
      source: 'canonical' | 'legacy'
    }
  >()
  for (const r of listPacketRuns({ profile, profileRoot: opts.profileRoot }))
    out.set(r.run_key, { ...r, source: 'legacy' })
  for (const r of listCanonicalRuns({ profile, profileRoot: opts.profileRoot }))
    out.set(r.run_key, { ...r, source: 'canonical' })
  return [...out.values()]
}
