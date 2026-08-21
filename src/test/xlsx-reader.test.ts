import { describe, it, expect } from 'vitest'
import { readXlsx, XlsxError, colToIndex, excelSerialToISO } from '@/server/ingest/xlsx-reader'
import { makeXlsx } from './helpers/make-xlsx'

describe('zero-dep xlsx reader (round-trip against the writer)', () => {
  it('reads sheet names in order + a cell matrix (strings, numbers, dates)', () => {
    const buf = makeXlsx([
      { name: 'Report', rows: [['Serra Honda'], ['Generated', '2026-08-11']] },
      {
        name: 'Data',
        rows: [
          ['Lead_Source', 'Total_Leads', 'Sale_Date'],
          ['Repeat Customer', 79, { date: '2026-08-04' }],
          ['Autoweb', 20, { date: '2026-08-10' }],
        ],
      },
    ])
    const { sheets } = readXlsx(buf)
    expect(sheets.map((s) => s.name)).toEqual(['Report', 'Data'])
    const data = sheets[1].rows
    expect(data[0]).toEqual(['Lead_Source', 'Total_Leads', 'Sale_Date'])
    expect(data[1]).toEqual(['Repeat Customer', '79', '2026-08-04'])
    expect(data[2]).toEqual(['Autoweb', '20', '2026-08-10'])
  })

  it('handles ampersands / special chars via shared strings', () => {
    const buf = makeXlsx([{ name: 'S', rows: [['A & B <co>', 'x"y']] }])
    expect(readXlsx(buf).sheets[0].rows[0]).toEqual(['A & B <co>', 'x"y'])
  })

  it('tolerates a truly blank extra sheet (empty rows)', () => {
    const buf = makeXlsx([
      { name: 'Data', rows: [['h1', 'h2'], ['a', 'b']] },
      { name: 'Sheet3', rows: [] },
    ])
    const { sheets } = readXlsx(buf)
    expect(sheets.map((s) => s.name)).toEqual(['Data', 'Sheet3'])
    expect(sheets[1].rows).toEqual([])
  })

  it('rejects non-xlsx bytes with XlsxError', () => {
    expect(() => readXlsx(Buffer.from('not a zip'))).toThrow(XlsxError)
  })

  it('helper functions: colToIndex + excelSerialToISO', () => {
    expect(colToIndex('A1')).toBe(0)
    expect(colToIndex('B2')).toBe(1)
    expect(colToIndex('AA10')).toBe(26)
    expect(excelSerialToISO(46238)).toBe('2026-08-04') // Excel 1900 serial for 2026-08-04
  })
})
