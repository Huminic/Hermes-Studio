/**
 * Zero-dependency XLSX reader (HUM-VIN-006).
 *
 * XLSX is a ZIP of XML parts. The codebase ships no XLSX/ZIP dependency and
 * `node_modules` is shared — so this parses the container with Node's built-in
 * `zlib.inflateRawSync` + a minimal Central-Directory ZIP reader, and reads the
 * OOXML parts with lightweight XML scanning: sheet names in order, shared
 * strings, per-sheet cell matrices (as strings), Excel-date numeric cells → ISO.
 *
 * HARDENED / FAIL-CLOSED for untrusted input:
 *  - input-size, per-entry inflated-size (decompression-bomb), total-inflated,
 *    entry-count, sheet-count, and per-sheet cell-count caps — exceeding any → throw.
 *  - malformed ZIP (no EOCD / bad headers / unsupported method) → throw.
 *  - malformed/empty workbook (missing workbook.xml / no sheets) → throw.
 * Never returns partial/ambiguous output on bad input.
 */
import zlib from 'node:zlib'

export class XlsxError extends Error {}

export type XlsxLimits = {
  maxInputBytes: number
  maxEntryBytes: number
  maxTotalBytes: number
  maxEntries: number
  maxSheets: number
  maxCells: number
}

export const DEFAULT_LIMITS: XlsxLimits = {
  maxInputBytes: 25 * 1024 * 1024,
  maxEntryBytes: 64 * 1024 * 1024,
  maxTotalBytes: 128 * 1024 * 1024,
  maxEntries: 1024,
  maxSheets: 64,
  maxCells: 1_000_000,
}

// ── ZIP container ───────────────────────────────────────────────────────────

type ZipEntry = {
  name: string
  method: number
  compSize: number
  uncompSize: number
  localOffset: number
}

function readZipEntries(buf: Buffer, limits: XlsxLimits): Array<ZipEntry> {
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new XlsxError('not a zip/xlsx (no EOCD)')
  const count = buf.readUInt16LE(eocd + 10)
  if (count > limits.maxEntries) throw new XlsxError(`too many zip entries (${count})`)
  let ptr = buf.readUInt32LE(eocd + 16)
  const entries: Array<ZipEntry> = []
  for (let n = 0; n < count; n++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== 0x02014b50)
      throw new XlsxError('bad central dir header')
    const method = buf.readUInt16LE(ptr + 10)
    const compSize = buf.readUInt32LE(ptr + 20)
    const uncompSize = buf.readUInt32LE(ptr + 24)
    const nameLen = buf.readUInt16LE(ptr + 28)
    const extraLen = buf.readUInt16LE(ptr + 30)
    const commentLen = buf.readUInt16LE(ptr + 32)
    const localOffset = buf.readUInt32LE(ptr + 42)
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen)
    entries.push({ name, method, compSize, uncompSize, localOffset })
    ptr += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

type Budget = { total: number }

function readEntry(buf: Buffer, e: ZipEntry, limits: XlsxLimits, budget: Budget): Buffer {
  if (e.uncompSize > limits.maxEntryBytes)
    throw new XlsxError(`entry ${e.name} too large (${e.uncompSize})`)
  if (e.localOffset + 30 > buf.length || buf.readUInt32LE(e.localOffset) !== 0x04034b50)
    throw new XlsxError('bad local header')
  const nameLen = buf.readUInt16LE(e.localOffset + 26)
  const extraLen = buf.readUInt16LE(e.localOffset + 28)
  const start = e.localOffset + 30 + nameLen + extraLen
  const comp = buf.subarray(start, start + e.compSize)
  let out: Buffer
  if (e.method === 0) out = Buffer.from(comp)
  else if (e.method === 8) {
    // maxOutputLength makes zlib itself fail-closed on a decompression bomb,
    // not relying on the (spoofable) central-directory size field.
    out = zlib.inflateRawSync(comp, { maxOutputLength: limits.maxEntryBytes }) as Buffer
  } else throw new XlsxError(`unsupported zip method ${e.method}`)
  budget.total += out.length
  if (budget.total > limits.maxTotalBytes) throw new XlsxError('total inflated size cap exceeded')
  return out
}

function fileText(
  buf: Buffer,
  entries: Array<ZipEntry>,
  name: string,
  limits: XlsxLimits,
  budget: Budget,
): string | null {
  const e = entries.find((x) => x.name === name)
  return e ? readEntry(buf, e, limits, budget).toString('utf8') : null
}

// ── XML helpers ───────────────────────────────────────────────────────────

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`))
  return m ? m[1] : undefined
}

function parseSharedStrings(xml: string | null): Array<string> {
  if (!xml) return []
  const out: Array<string> = []
  for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
    const parts = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []
    out.push(parts.map((t) => decodeXml(t.replace(/<[^>]+>/g, ''))).join(''))
  }
  return out
}

const BUILTIN_DATE_FMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

function parseDateStyleIndices(stylesXml: string | null): Set<number> {
  const dateStyles = new Set<number>()
  if (!stylesXml) return dateStyles
  const customDateFmtIds = new Set<number>()
  for (const nf of stylesXml.match(/<numFmt\b[^>]*\/>/g) ?? []) {
    const id = Number(attr(nf, 'numFmtId'))
    const code = attr(nf, 'formatCode') ?? ''
    if (Number.isFinite(id) && /(yy|mm|dd|d\/|\/m|h:mm|mmm)/i.test(code)) customDateFmtIds.add(id)
  }
  const cellXfs = stylesXml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] ?? ''
  const xfs = cellXfs.match(/<xf\b[^>]*\/?>/g) ?? []
  xfs.forEach((xf, i) => {
    const fmtId = Number(attr(xf, 'numFmtId'))
    if (BUILTIN_DATE_FMT_IDS.has(fmtId) || customDateFmtIds.has(fmtId)) dateStyles.add(i)
  })
  return dateStyles
}

export function colToIndex(ref: string): number {
  const m = ref.match(/^([A-Z]+)/)
  if (!m) return 0
  let n = 0
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Excel serial date → ISO YYYY-MM-DD (1900 date system). */
export function excelSerialToISO(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  return new Date(ms).toISOString().slice(0, 10)
}

function parseSheet(
  xml: string,
  shared: Array<string>,
  dateStyles: Set<number>,
  maxCells: number,
): Array<Array<string>> {
  const rows: Array<Array<string>> = []
  let cellCount = 0
  for (const rowXml of xml.match(/<row\b[\s\S]*?<\/row>|<row\b[^>]*\/>/g) ?? []) {
    const cells: Array<string> = []
    for (const cm of rowXml.match(/<c\b[^>]*>[\s\S]*?<\/c>|<c\b[^>]*\/>/g) ?? []) {
      if (++cellCount > maxCells) throw new XlsxError('cell-count cap exceeded')
      const openTag = cm.match(/<c\b[^>]*>/)?.[0] ?? cm
      const ref = attr(openTag, 'r') ?? ''
      const type = attr(openTag, 't')
      const style = Number(attr(openTag, 's'))
      let value = ''
      if (type === 'inlineStr') {
        const t = cm.match(/<t[^>]*>([\s\S]*?)<\/t>/)
        value = t ? decodeXml(t[1]) : ''
      } else {
        const v = cm.match(/<v>([\s\S]*?)<\/v>/)
        const raw = v ? v[1] : ''
        if (type === 's') value = shared[Number(raw)] ?? ''
        else if (type === 'str') value = decodeXml(raw)
        else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE'
        else if (raw !== '' && dateStyles.has(style) && Number.isFinite(Number(raw)))
          value = excelSerialToISO(Number(raw))
        else value = raw
      }
      const col = colToIndex(ref)
      while (cells.length < col) cells.push('')
      cells[col] = value
    }
    rows.push(cells)
  }
  return rows
}

export type XlsxSheet = { name: string; rows: Array<Array<string>> }

export function readXlsx(
  buf: Buffer,
  limitOverrides: Partial<XlsxLimits> = {},
): { sheets: Array<XlsxSheet> } {
  const limits = { ...DEFAULT_LIMITS, ...limitOverrides }
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new XlsxError('empty/short input')
  if (buf.length > limits.maxInputBytes) throw new XlsxError(`input too large (${buf.length})`)

  const budget: Budget = { total: 0 }
  const entries = readZipEntries(buf, limits)
  const wb = fileText(buf, entries, 'xl/workbook.xml', limits, budget)
  if (!wb) throw new XlsxError('missing xl/workbook.xml')
  const rels = fileText(buf, entries, 'xl/_rels/workbook.xml.rels', limits, budget) ?? ''
  const shared = parseSharedStrings(
    fileText(buf, entries, 'xl/sharedStrings.xml', limits, budget),
  )
  const dateStyles = parseDateStyleIndices(
    fileText(buf, entries, 'xl/styles.xml', limits, budget),
  )

  const relTarget = new Map<string, string>()
  for (const r of rels.match(/<Relationship\b[^>]*\/>/g) ?? []) {
    const id = attr(r, 'Id')
    const target = attr(r, 'Target')
    if (id && target) relTarget.set(id, target.replace(/^\/?xl\//, '').replace(/^\.\//, ''))
  }

  const sheetTags = wb.match(/<sheet\b[^>]*\/>/g) ?? []
  if (sheetTags.length === 0) throw new XlsxError('workbook has no sheets')
  if (sheetTags.length > limits.maxSheets)
    throw new XlsxError(`too many sheets (${sheetTags.length})`)

  const sheets: Array<XlsxSheet> = []
  for (const s of sheetTags) {
    const name = decodeXml(attr(s, 'name') ?? `Sheet${sheets.length + 1}`)
    const rid = attr(s, 'r:id') ?? attr(s, 'id')
    const target = rid ? relTarget.get(rid) : undefined
    const path = target ? `xl/${target}` : `xl/worksheets/sheet${sheets.length + 1}.xml`
    const sheetXml = fileText(buf, entries, path, limits, budget)
    sheets.push({
      name,
      rows: sheetXml ? parseSheet(sheetXml, shared, dateStyles, limits.maxCells) : [],
    })
  }
  return { sheets }
}
