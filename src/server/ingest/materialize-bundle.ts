import fs from 'node:fs'
import path from 'node:path'

/**
 * Atomically materialize a dry-run trio (raw + derivative + manifest) into an isolated dev
 * inbound: write into a private temp dir, then rename it onto the final target so the reconcile
 * watcher never sees a partial trio.
 *
 * Modes are set with explicit chmod, NOT the umask-masked create mode. A restrictive ambient
 * umask (e.g. 0177 leaked from a launcher) would otherwise create the temp dir without the
 * owner-execute bit (0600) — non-traversable → EACCES writing inside. chmod makes the result
 * deterministic under ANY umask: dirs 0755 (traversable), final files 0444 (immutable).
 *
 * The caller is responsible for path safety (target under inbound, safe profile/capture/filenames),
 * for staging `tmp` OUTSIDE any reconcile-watcher glob (e.g. one level under inbound, not under
 * inbound/<profile>/) so a partial trio is never globbed before the rename, and for cleanup on
 * throw. `tmp` must be on the same filesystem as `target` so the reveal is an atomic rename.
 * This throws on any fs error.
 */
export function materializeTrio(args: {
  profDir: string        // <inbound>/<profile> — the target's parent, ensured to exist
  tmp: string            // private staging dir on the same filesystem, OUTSIDE the watcher glob
  target: string         // final <inbound>/<profile>/<captureId>
  rawFile: string
  rawBuf: Buffer
  derFile: string
  derBuf: Buffer
  manifestJson: string
}): void {
  const { profDir, tmp, target, rawFile, rawBuf, derFile, derBuf, manifestJson } = args
  fs.mkdirSync(profDir, { recursive: true })
  fs.chmodSync(profDir, 0o755)          // traversable+writable regardless of umask
  fs.mkdirSync(tmp)
  fs.chmodSync(tmp, 0o755)              // owner rwx so files can be created inside, regardless of umask
  const writeImmutable = (name: string, data: string | Buffer) => {
    const p = path.join(tmp, name)
    fs.writeFileSync(p, data)
    fs.chmodSync(p, 0o444)              // exactly 0444 (immutable), not umask-masked
  }
  writeImmutable(rawFile, rawBuf)
  writeImmutable(derFile, derBuf)
  writeImmutable('manifest.v1.json', manifestJson)
  fs.renameSync(tmp, target)            // atomic reveal (tmp and target share profDir)
}
