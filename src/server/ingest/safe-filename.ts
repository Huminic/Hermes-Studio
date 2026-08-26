/**
 * Safe-basename gate for dry-run bundle deliveries (raw + derivative CSVs).
 *
 * Real VinSolutions browser exports carry human filenames with SPACES and PARENTHESES,
 * e.g. `OPPORTUNITIES (3).csv`. Those are safe basenames and must be accepted. What must
 * still be rejected is anything that could escape the isolated target directory or smuggle
 * control bytes: path separators, dot traversal, leading-dot/dotfiles, NUL/control chars,
 * absolute paths, and any non-`.csv` extension.
 *
 * The consumer preserves the ORIGINAL filename (it must equal the manifest binding), so this
 * only decides accept/reject — it never rewrites the name.
 */

/** True if the string contains any NUL / C0 control (0x00-0x1F) or DEL (0x7F). */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c <= 0x1f || c === 0x7f) return true
  }
  return false
}

/** Accept iff `name` is a safe, in-directory `.csv` basename (spaces + parentheses allowed). */
export function isSafeDeliveryFilename(name: unknown): name is string {
  if (typeof name !== 'string') return false
  if (name.length === 0 || name.length > 255) return false
  if (name !== name.trim()) return false                 // no leading/trailing whitespace
  if (hasControlChar(name)) return false                 // no NUL / control chars
  if (/[/\\]/.test(name)) return false                   // no path separators (absolute or relative)
  if (name.startsWith('.')) return false                 // no dotfiles / leading dot (blocks ".", "..", "...")
  if (name.includes('..')) return false                  // no dot traversal anywhere
  if (!/\.csv$/i.test(name)) return false                // .csv only (no .json/.txt/.exe/double-ext)
  // closed character allowlist: letters, digits, space, parentheses, dot, underscore, hyphen
  return /^[A-Za-z0-9 ()._-]+\.csv$/i.test(name)
}
