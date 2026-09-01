/**
 * Canonical Semantic Watchdog catalog loader (295 conditions).
 *
 * Fail-closed: the loader asserts exactly 295 entries with unique, sequential
 * SW-001..SW-295 ids. Any drift throws — the spine cannot be built on a mutated
 * catalog. Pure (no I/O beyond the caller-supplied parsed JSON).
 */

export type CatalogCondition = {
  metric_id: string
  section: string
  subsection: string
  condition: string
  acquisition_class: string
  source: string
  owner: string
  next_action: string
}

export const CATALOG_SIZE = 295

export function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

export function expectedCatalogId(index0: number): string {
  return `SW-${pad3(index0 + 1)}`
}

/**
 * Validate + normalize the raw catalog array. Throws on any count/sequence/uniqueness
 * defect so a spine can never be built from a corrupted catalog.
 */
export function loadCatalog(raw: unknown): Array<CatalogCondition> {
  if (!Array.isArray(raw)) {
    throw new Error('catalog is not an array')
  }
  if (raw.length !== CATALOG_SIZE) {
    throw new Error(
      `catalog must have exactly ${CATALOG_SIZE} conditions, got ${raw.length}`,
    )
  }
  const seen = new Set<string>()
  const out: Array<CatalogCondition> = []
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] as Record<string, unknown>
    const id = typeof r.metric_id === 'string' ? r.metric_id : ''
    const want = expectedCatalogId(i)
    if (id !== want) {
      throw new Error(
        `catalog id out of sequence at index ${i}: expected ${want}, got "${id}"`,
      )
    }
    if (seen.has(id)) {
      throw new Error(`duplicate catalog id: ${id}`)
    }
    seen.add(id)
    out.push({
      metric_id: id,
      section: str(r.section),
      subsection: str(r.subsection),
      condition: str(r.condition),
      acquisition_class: str(r.acquisition_class),
      source: str(r.source),
      owner: str(r.owner),
      next_action: str(r.next_action),
    })
  }
  return out
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
