import { useEffect, useState } from 'react'

/**
 * VinSolutions native weekly performance + standalone Response-Time panels for
 * the Sales tab. Data comes from /api/customer/native-metrics, which reads ONLY
 * accepted, non-superseded native families and promoted RT readbacks. Absent
 * families render an explicit "unavailable" state — never a fabricated zero.
 *
 * Response Times are shown in a SEPARATE, clearly-labeled panel and are never
 * blended with the dealership-performance response-time aggregates.
 */

type Unavailable = { available: false; reason?: string }

type DealershipPerformance = {
  available: true
  provenance: {
    period: { start: string | null; end: string | null }
    acceptedRows: number
    checksum: string
  }
  summary: {
    leads: number | null
    apptsSet: number | null
    apptsShow: number | null
    totalVisits: number | null
    visitsSold: number | null
    soldInPeriod: number | null
    frontGross: number | null
    backGross: number | null
    avgTotalGross: number | null
  }
  byInventoryType: Array<{
    label: string
    leads: number | null
    soldInPeriod: number | null
  }>
}

type AppointmentsMetrics = {
  available: true
  provenance: { period: { start: string | null; end: string | null } }
  total: number
  completed: number
  confirmed: number
  show: number
  noShow: number
  cancelled: number
  rescheduled: number
}

type ResponseTimeReadback = {
  available: true
  units: 'minutes'
  period: { start: string | null; end: string | null; timezone?: string }
  coverage: { total_rows?: number; accepted_rows?: number; reconciles: boolean }
  metrics: Record<string, unknown>
}

type NativeMetricsResponse = {
  ok: boolean
  profile: string
  dealershipPerformance: DealershipPerformance | Unavailable
  appointments: AppointmentsMetrics | Unavailable
  responseTimes: ResponseTimeReadback | Unavailable
  error?: string
}

const nf = new Intl.NumberFormat('en-US')
const num = (v: number | null | undefined): string =>
  v === null || v === undefined ? '—' : nf.format(v)
const money = (v: number | null | undefined): string =>
  v === null || v === undefined
    ? '—'
    : v.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
const minutes = (v: unknown): string => {
  const x = Number(v)
  return Number.isFinite(x) ? `${x.toFixed(1)} min` : '—'
}
const period = (p: { start: string | null; end: string | null }): string =>
  p.start && p.end ? `${p.start} – ${p.end}` : 'period n/a'

function Stat({
  label,
  value,
  testid,
}: {
  label: string
  value: string
  testid?: string
}) {
  return (
    <div className="min-w-0" data-testid={testid}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="truncate text-lg font-semibold tabular-nums text-slate-900">
        {value}
      </div>
    </div>
  )
}

function Unavailable({ label, reason }: { label: string; reason?: string }) {
  return (
    <div
      className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500"
      data-testid="native-unavailable"
    >
      <span className="font-medium text-slate-600">{label}</span> — unavailable
      {reason ? <span className="text-slate-400"> ({reason})</span> : null}
    </div>
  )
}

export function NativePerformancePanel({ profile }: { profile: string }) {
  const [data, setData] = useState<NativeMetricsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/customer/native-metrics?profile=${encodeURIComponent(profile)}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        const body = (await res.json()) as NativeMetricsResponse
        if (!res.ok || !body.ok) {
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        if (!cancelled) setData(body)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [profile])

  if (loading) {
    return (
      <div
        className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500"
        data-testid="native-loading"
      >
        Loading native weekly performance…
      </div>
    )
  }

  if (error || !data) {
    return (
      <section className="min-w-0" data-testid="native-performance">
        <Unavailable
          label="Native weekly performance"
          reason={error ?? 'no data'}
        />
      </section>
    )
  }

  const dp = data.dealershipPerformance
  const appt = data.appointments
  const rt = data.responseTimes

  return (
    <section className="min-w-0 space-y-4" data-testid="native-performance">
      {/* ── VinSolutions Native Weekly Performance ─────────────────────── */}
      <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            VinSolutions Native Weekly Performance
          </h3>
          <span className="text-xs text-slate-400">
            Accepted native report
            {dp.available ? ` · ${period(dp.provenance.period)}` : ''}
          </span>
        </header>

        {dp.available ? (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Leads" value={num(dp.summary.leads)} testid="dp-leads" />
              <Stat label="Appts Set" value={num(dp.summary.apptsSet)} testid="dp-apptsSet" />
              <Stat label="Appts Show" value={num(dp.summary.apptsShow)} testid="dp-apptsShow" />
              <Stat label="Total Visits" value={num(dp.summary.totalVisits)} testid="dp-totalVisits" />
              <Stat label="Visits Sold" value={num(dp.summary.visitsSold)} testid="dp-visitsSold" />
              <Stat label="Sold in Period" value={num(dp.summary.soldInPeriod)} testid="dp-soldInPeriod" />
              <Stat label="Front Gross" value={money(dp.summary.frontGross)} testid="dp-frontGross" />
              <Stat label="Back Gross" value={money(dp.summary.backGross)} testid="dp-backGross" />
              <Stat label="Avg Total Gross" value={money(dp.summary.avgTotalGross)} testid="dp-avgTotalGross" />
            </dl>

            {dp.byInventoryType.length > 0 && (
              <div className="mt-4 min-w-0 overflow-x-auto">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  By inventory type
                </div>
                <table className="w-full text-sm" data-testid="dp-inventory">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-1 pr-3 font-medium">Type</th>
                      <th className="py-1 pr-3 font-medium">Leads</th>
                      <th className="py-1 font-medium">Sold in Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dp.byInventoryType.map((r) => (
                      <tr key={r.label} className="border-t border-slate-100">
                        <td className="py-1 pr-3 text-slate-700">{r.label}</td>
                        <td className="py-1 pr-3 tabular-nums text-slate-900">{num(r.leads)}</td>
                        <td className="py-1 tabular-nums text-slate-900">{num(r.soldInPeriod)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <Unavailable label="Dealership performance" reason={dp.reason} />
        )}

        {/* Appointments — a distinct native family under the same panel. */}
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Appointments
          </h4>
          {appt.available ? (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="appt-grid">
              <Stat label="Total" value={num(appt.total)} testid="appt-total" />
              <Stat label="Completed" value={num(appt.completed)} testid="appt-completed" />
              <Stat label="Confirmed" value={num(appt.confirmed)} testid="appt-confirmed" />
              <Stat label="Show" value={num(appt.show)} testid="appt-show" />
              <Stat label="No-Show" value={num(appt.noShow)} testid="appt-noShow" />
              <Stat label="Cancelled" value={num(appt.cancelled)} testid="appt-cancelled" />
              <Stat label="Rescheduled" value={num(appt.rescheduled)} testid="appt-rescheduled" />
            </dl>
          ) : (
            <Unavailable label="Appointments" reason={appt.reason} />
          )}
        </div>
      </div>

      {/* ── Standalone Response Times (never blended) ──────────────────── */}
      <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4" data-testid="response-times">
        <header className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            Standalone Response Times
          </h3>
          <span className="text-xs text-slate-400">
            {rt.available ? `${period(rt.period)} · units: ${rt.units}` : 'standalone source'}
          </span>
        </header>
        <p className="mb-3 text-xs text-slate-500">
          Standalone source — not blended with dealership-performance response-time
          aggregates.
        </p>

        {rt.available ? (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Actual Avg" value={minutes(rt.metrics.response_time_actual_avg_min)} testid="rt-actual-avg" />
              <Stat label="Actual Median" value={minutes(rt.metrics.response_time_actual_median_min)} testid="rt-actual-median" />
              <Stat label="Adjusted Avg" value={minutes(rt.metrics.response_time_adjusted_avg_min)} testid="rt-adjusted-avg" />
              <Stat label="Adjusted Median" value={minutes(rt.metrics.response_time_adjusted_median_min)} testid="rt-adjusted-median" />
            </dl>

            <div className="mt-4 min-w-0">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Target categories
              </div>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="rt-targets">
                {Object.entries(
                  (rt.metrics.target_category_counts as Record<string, number>) ?? {},
                ).map(([label, count]) => (
                  <Stat key={label} label={label} value={num(count)} />
                ))}
              </dl>
            </div>

            <div className="mt-3 text-xs text-slate-400">
              Coverage: {num(rt.coverage.accepted_rows)} / {num(rt.coverage.total_rows)} rows
              {rt.period.timezone ? ` · ${rt.period.timezone}` : ''} ·{' '}
              {rt.coverage.reconciles ? 'reconciles' : 'does not reconcile'}
            </div>
          </>
        ) : (
          <Unavailable label="Response times" reason={rt.reason} />
        )}
      </div>
    </section>
  )
}
