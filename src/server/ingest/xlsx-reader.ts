/**
 * Zero-dependency XLSX reader (HUM-VIN-006).
 *
 * XLSX is a ZIP of XML parts. The codebase intentionally ships no XLSX/ZIP
 * dependency and `node_modules` is shared — so this parses the container with
 * Node's built-in `zlib.inflateRawSync` (DEFLATE) + a minimal Central-Directory
 * ZIP reader, and reads the OOXML parts with lightweight XML scanning. Scope is
 * exactly what the six scheduled VinSolutions exports need: sheet names in order,
 * shared strings, per-sheet cell matrices (as strings), and date-formatted
 * numeric cells resolved to ISO dates (for period evidence).
 *
 * Not a general XLSX engine: no formulas, styles beyond date-format detection,
 * merged-cell expansion, or streaming. Malformed input throws `XlsxError`.
 */
import zlib from 'node:zlib'

export class XlsxError extends Error {}

// ── ZIP container ───────────────────────────────────────────────────────────

type ZipEntry = {
  name: string
  method: number
  compSize: number
  localOffset: number
}

function readZipEntries(buf: Buffer): Array<ZipEntry> {
  // Locate End Of Central Directory (0x06054b50) scanning back from the end.
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new XlsxError('not a zip/xlsx (no EOCD)')
  const count = buf.readUInt16LE(eocd + 10)
  let ptr = buf.readUInt32LE(eocd + 16) // central directory offset
  const entries: Array<ZipEntry> = []
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new XlsxError('bad central dir header')
    const method = buf.readUInt16LE(ptr + 10)
    const compSize = buf.readUInt32LE(ptr + 20)
    const nameLen = buf.readUInt16LE(ptr + 28)
    const extraLen = buf.readUInt16LE(ptr + 30)
    const commentLen = buf.readUInt16LE(ptr + 32)
    const localOffset = buf.readUInt32LE(ptr + 42)
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen)
    entries.push({ name, method, compSize, localOffset })
    ptr += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function readEntry(buf: Buffer, e: ZipEntry): Buffer {
  if (buf.readUInt32LE(e.localOffset) !== 0x04034b50) throw new XlsxError('bad local header')
  const nameLen = buf.readUInt16LE(e.localOffset + 26)
  const extraLen = buf.readUInt16LE(e.localOffset + 28)
  const start = e.localOffset + 30 + nameLen + extraLen
  const comp = buf.subarray(start, start + e.compSize)
  if (e.method === 0) return Buffer.from(comp) // stored
  if (e.method === 8) return zlib.inflateRawSync(comp) // deflate
  throw new XlsxError(`unsupported zip method ${e.method}`)
}

function fileText(buf: Buffer, entries: Array<ZipEntry>, name: string): string | null {
  const e = entries.find((x) => x.name === name)
  return e ? readEntry(buf, e).toString('utf8') : null
}

// ── XML helpers (sufficient for OOXML, not a full parser) ───────────────────

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

// ── shared strings ──────────────────────────────────────────────────────────

function parseSharedStrings(xml: string | null): Array<string> {
  if (!xml) return []
  const out: Array<string> = []
  for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
    // an <si> may hold one <t> or several <r><t> runs; concatenate all <t>.
    const parts = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []
    out.push(parts.map((t) => decodeXml(t.replace(/<[^>]+>/g, ''))).join(''))
  }
  return out
}

// ── date-formatted style indices ────────────────────────────────────────────

const BUILTIN_DATE_FMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

function parseDateStyleIndices(stylesXml: string | null): Set<number> {
  const dateStyles = new Set<number>()
  if (!stylesXml) return dateStyles
  // custom numFmts whose format code looks like a date
  const customDateFmtIds = new Set<number>()
  for (const nf of stylesXml.match(/<numFmt\b[^>]*\/>/g) ?? []) {
    const id = Number(attr(nf, 'numFmtId'))
    const code = attr(nf, 'formatCode') ?? ''
    if (Number.isFinite(id) && /[dmyhs]/i.test(code) && !/[#0]/.test(code.replace(/[^#0]/g, ''))) {
      customDateFmtIds.add(id)
    } else if (Number.isFinite(id) && /(yy|mm|dd|d\/|\/m|h:mm)/i.test(code)) {
      customDateFmtIds.add(id)
    }
  }
  const cellXfs = stylesXml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] ?? ''
  const xfs = cellXfs.match(/<xf\b[^>]*\/?>/g) ?? []
  xfs.forEach((xf, i) => {
    const fmtId = Number(attr(xf, 'numFmtId'))
    if (BUILTIN_DATE_FMT_IDS.has(fmtId) || customDateFmtIds.has(fmtId)) dateStyles.add(i)
  })
  return dateStyles
}

// ── cell refs + Excel serial dates ──────────────────────────────────────────

export function colToIndex(ref: string): number {
  const m = ref.match(/^([A-Z]+)/)
  if (!m) return 0
  let n = 0
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Excel serial date → ISO YYYY-MM-DD (1900 date system, incl. the 1900 leap bug). */
export function excelSerialToISO(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  return new Date(ms).toISOString().slice(0, 10)
}

// ── sheet matrix ──────────────────────────────────────────────────────────

function parseSheet(
  xml: string,
  shared: Array<string>,
  dateStyles: Set<number>,
): Array<Array<string>> {
  const rows: Array<Array<string>> = []
  for (const rowXml of xml.match(/<row\b[\s\S]*?<\/row>|<row\b[^>]*\/>/g) ?? []) {
    const cells: Array<string> = []
    for (const cm of rowXml.match(/<c\b[^>]*>[\s\S]*?<\/c>|<c\b[^>]*\/>/g) ?? []) {
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
        else if (raw !== '' && dateStyles.has(style) && Number.isFinite(Number(raw))) {
          value = excelSerialToISO(Number(raw))
        } else value = raw
      }
      const col = colToIndex(ref)
      while (cells.length < col) cells.push('')
      cells[col] = value
    }
    rows.push(cells)
  }
  return rows
}

// ── public API ────────────────────────────────────────────────────────────

export type XlsxSheet = { name: string; rows: Array<Array<string>> }

export function readXlsx(buf: Buffer): { sheets: Array<XlsxSheet> } {
  const entries = readZipEntries(buf)
  const wb = fileText(buf, entries, 'xl/workbook.xml')
  if (!wb) throw new XlsxError('missing xl/workbook.xml')
  const rels = fileText(buf, entries, 'xl/_rels/workbook.xml.rels') ?? ''
  const shared = parseSharedStrings(fileText(buf, entries, 'xl/sharedStrings.xml'))
  const dateStyles = parseDateStyleIndices(fileText(buf, entries, 'xl/styles.xml'))

  const relTarget = new Map<string, string>()
  for (const r of rels.match(/<Relationship\b[^>]*\/>/g) ?? []) {
    const id = attr(r, 'Id')
    const target = attr(r, 'Target')
    if (id && target) relTarget.set(id, target.replace(/^\/?xl\//, '').replace(/^\.\//, ''))
  }

  const sheets: Array<XlsxSheet> = []
  for (const s of wb.match(/<sheet\b[^>]*\/>/g) ?? []) {
    const name = decodeXml(attr(s, 'name') ?? `Sheet${sheets.length + 1}`)
    const rid = attr(s, 'r:id') ?? attr(s, 'id')
    const target = rid ? relTarget.get(rid) : undefined
    const path = target ? `xl/${target}` : `xl/worksheets/sheet${sheets.length + 1}.xml`
    const sheetXml = fileText(buf, entries, path)
    sheets.push({ name, rows: sheetXml ? parseSheet(sheetXml, shared, dateStyles) : [] })
  }
  return { sheets }
}
