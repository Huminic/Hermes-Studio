/**
 * Minimal, deterministic XLSX (OOXML/ZIP) builder for tests.
 *
 * Produces a Buffer that the repo's zero-dependency `readXlsx` can parse: one
 * worksheet, inline-string cells only (no sharedStrings/styles), STORED ZIP
 * entries (method 0, no compression, CRC left 0 — readXlsx does not validate it).
 * This lets classifier/reader unit tests synthesize positive and negative
 * workbooks with NO customer PII and NO dependency on the real governed files.
 */

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function colRef(n: number): string {
  let s = ''
  let x = n + 1
  while (x > 0) {
    const r = (x - 1) % 26
    s = String.fromCharCode(65 + r) + s
    x = Math.floor((x - 1) / 26)
  }
  return s
}

function worksheetXml(
  rows: Array<Array<string>>,
  formulaAt: Array<[number, number]> = [],
): string {
  const isFormula = (ri: number, ci: number) =>
    formulaAt.some(([r, c]) => r === ri && c === ci)
  const rowXml = rows
    .map((cells, ri) => {
      const cs = cells
        .map((v, ci) => {
          if (isFormula(ri, ci))
            return `<c r="${colRef(ci)}${ri + 1}"><f>1+1</f><v>${xmlEscape(v || '2')}</v></c>`
          return v === ''
            ? ''
            : `<c r="${colRef(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(v)}</t></is></c>`
        })
        .join('')
      return `<row r="${ri + 1}">${cs}</row>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`
}

type Part = { name: string; data: Buffer }

function zip(parts: Array<Part>): Buffer {
  const locals: Array<Buffer> = []
  const centrals: Array<Buffer> = []
  let offset = 0
  for (const p of parts) {
    const name = Buffer.from(p.name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(0, 8) // method = stored
    local.writeUInt16LE(0, 10) // mod time
    local.writeUInt16LE(0, 12) // mod date
    local.writeUInt32LE(0, 14) // crc32 (unchecked by readXlsx)
    local.writeUInt32LE(p.data.length, 18) // comp size
    local.writeUInt32LE(p.data.length, 22) // uncomp size
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28) // extra len
    const localOffset = offset
    locals.push(Buffer.concat([local, name, p.data]))
    offset += local.length + name.length + p.data.length

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10) // method
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(0, 16) // crc
    central.writeUInt32LE(p.data.length, 20)
    central.writeUInt32LE(p.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30) // extra
    central.writeUInt16LE(0, 32) // comment
    central.writeUInt16LE(0, 34) // disk start
    central.writeUInt16LE(0, 36) // int attr
    central.writeUInt32LE(0, 38) // ext attr
    central.writeUInt32LE(localOffset, 42)
    centrals.push(Buffer.concat([central, name]))
  }
  const localBlock = Buffer.concat(locals)
  const centralBlock = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4) // disk
  eocd.writeUInt16LE(0, 6) // disk start
  eocd.writeUInt16LE(parts.length, 8)
  eocd.writeUInt16LE(parts.length, 10)
  eocd.writeUInt32LE(centralBlock.length, 12)
  eocd.writeUInt32LE(localBlock.length, 16)
  eocd.writeUInt16LE(0, 20) // comment len
  return Buffer.concat([localBlock, centralBlock, eocd])
}

export type SheetSpec = {
  name: string
  rows: Array<Array<string>>
  /** [rowIndex, colIndex] cells to emit as formulas (adds an <f> element). */
  formulaAt?: Array<[number, number]>
}

/** Build an XLSX Buffer from one or more sheets. */
export function makeXlsxSheets(sheets: Array<SheetSpec>): Buffer {
  const sheetTags = sheets
    .map(
      (s, i) =>
        `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join('')
  const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`
  const relTags = sheets
    .map(
      (_s, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('')
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relTags}</Relationships>`
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`
  const parts: Array<Part> = [
    { name: '[Content_Types].xml', data: Buffer.from(ct, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(wb, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(rels, 'utf8') },
  ]
  sheets.forEach((s, i) => {
    parts.push({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: Buffer.from(worksheetXml(s.rows, s.formulaAt ?? []), 'utf8'),
    })
  })
  return zip(parts)
}

/** Build an XLSX Buffer with a single sheet (default name "Export") from a
 *  matrix of string cells (row 0 = headers). */
export function makeXlsx(
  rows: Array<Array<string>>,
  sheetName = 'Export',
): Buffer {
  return makeXlsxSheets([{ name: sheetName, rows }])
}
