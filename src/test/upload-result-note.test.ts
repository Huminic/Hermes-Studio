import { describe, expect, it } from 'vitest'
import { uploadResultNote } from '@/components/customer-console/data-renderer'

describe('uploadResultNote (D8 upload feedback)', () => {
  it('tells the dealer a recognized ROI report now powers the dashboard', () => {
    const n = uploadResultNote('june-roi.csv', false, { ok: true, kind: 'lead_source_roi', rows: 39 })
    expect(n).toMatch(/lead-source ROI/)
    expect(n).toMatch(/39 rows/)
    expect(n).toMatch(/dashboard/)
  })

  it('labels a KPI report correctly', () => {
    const n = uploadResultNote('kpi.csv', false, { ok: true, kind: 'kpi_salesperson', rows: 12 })
    expect(n).toMatch(/salesperson KPI/)
  })

  it('guides PDF uploads to export CSV for metrics (no parsing claimed)', () => {
    const n = uploadResultNote('report.pdf', false, undefined)
    expect(n).toMatch(/export the report as CSV/i)
    expect(n).not.toMatch(/powers your dashboard/i)
  })

  it('explains an unrecognized CSV', () => {
    const n = uploadResultNote('random.csv', false, { ok: false, reason: 'no Lead_Source column' })
    expect(n).toMatch(/wasn't recognized/i)
    expect(n).toMatch(/no Lead_Source column/)
  })

  it('falls back to a plain uploaded/indexed message', () => {
    expect(uploadResultNote('notes.txt', true, undefined)).toMatch(/indexed for search/)
    expect(uploadResultNote('notes.txt', false, undefined)).toMatch(/uploaded\./)
  })
})
