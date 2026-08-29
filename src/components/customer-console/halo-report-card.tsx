import { useEffect, useMemo, useState } from 'react'

/**
 * Halo Data report-card panel (read-only). GET /api/customer/halo-report is the ONLY
 * semantic source. Renders store identity, coverage, the deterministic-grounded
 * narrative (with its mode label), every metric grouped by category with separate
 * current / industry / dealer-baseline states + provenance/period, and explicit
 * limitations. Never renders missing as zero; never renders an incompatible industry
 * reference as a score. Responsive.
 */

type CurrentLayer =
  | { state: 'value'; value: number; unit: string }
  | { state: 'no_current_data'; reason: string }
  | { state: 'withheld'; reason: string }

type IndustryLayer =
  | { state: 'no_benchmark'; note: string }
  | {
      state: 'directional_non_scoring'
      scoring: false
      range: string
      source_url: string
      source_type: string
      confidence: string
      source_published_or_updated: string
      verified_on: string
      definition_compatibility: string
      note: string
    }

type BaselineLayer =
  | { state: 'insufficient_history'; periods_available: number; needed: number }
  | { state: 'zero_variance'; periods_available: number; mean: number; note: string }
  | { state: 'band'; mean: number; stddev: number; periods_available: number }

type CardProvenance = { source: string; period?: { start: string | null; end: string | null }; checksum?: string } | null

type HaloCard = {
  slug: string
  label: string
  category: string
  unit: string
  display: string | null
  current: CurrentLayer
  industry: IndustryLayer
  baseline: BaselineLayer
  provenance: CardProvenance
}

type HaloReport = {
  profile: string
  sales_only: boolean
  manifest_version: string
  window_days: number
  narrative_mode: string
  narrative_provider?: string
  narrative_fallback_reason?: string | null
  narrative_claims?: Array<{ text: string; evidence: string[] }> | null
  cards: HaloCard[]
  coverage: { total: number; current_value: number; no_current_data: number; withheld: number }
  limitations: string[]
  narrative: string
}

function currentText(c: CurrentLayer, display: string | null): { label: string; tone: 'value' | 'withheld' | 'none' } {
  if (c.state === 'value' && display != null) return { label: display, tone: 'value' }
  if (c.state === 'withheld') return { label: 'Withheld', tone: 'withheld' }
  return { label: 'No current value', tone: 'none' }
}

function IndustryLine({ ind }: { ind: IndustryLayer }) {
  if (ind.state === 'directional_non_scoring') {
    return (
      <div className="text-xs text-slate-500" data-testid="halo-industry">
        <span className="font-medium text-slate-600">Industry:</span> directional · <span className="font-medium">non-scoring</span> ·{' '}
        {ind.range} <span className="text-slate-400">(definition {ind.definition_compatibility}; verified {ind.verified_on})</span>{' '}
        <a href={ind.source_url} className="text-sky-600 underline" target="_blank" rel="noreferrer">source</a>
      </div>
    )
  }
  return (
    <div className="text-xs text-slate-500" data-testid="halo-industry">
      <span className="font-medium text-slate-600">Industry:</span> no definition-compatible benchmark
    </div>
  )
}

function round3(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000)
}

function BaselineLine({ b }: { b: BaselineLayer }) {
  // The evaluator supplies mean/stddev/history count only — it does NOT classify the
  // current value as inside/outside the band. So never say "within"; state neutrally.
  const text =
    b.state === 'insufficient_history'
      ? `insufficient history (${b.periods_available}/${b.needed} governed periods)`
      : b.state === 'zero_variance'
        ? `zero variance across ${b.periods_available} periods — non-scoring`
        : `historical band available (${b.periods_available} periods; mean ${round3(b.mean)}, sd ${round3(b.stddev)}) — non-scoring`
  return (
    <div className="text-xs text-slate-500" data-testid="halo-baseline">
      <span className="font-medium text-slate-600">Dealer baseline:</span> {text}
    </div>
  )
}

export function HaloReportCardPanel({ profile }: { profile: string }) {
  const [report, setReport] = useState<HaloReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/customer/halo-report?profile=${encodeURIComponent(profile)}`, { credentials: 'include' })
      .then(async (res) => {
        const body = (await res.json()) as { ok: boolean; report?: HaloReport; error?: string }
        if (!res.ok || !body.ok || !body.report) throw new Error(body.error || `HTTP ${res.status}`)
        if (!cancelled) setReport(body.report)
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

  const grouped = useMemo(() => {
    const m = new Map<string, HaloCard[]>()
    for (const c of report?.cards ?? []) {
      const g = m.get(c.category) ?? []
      g.push(c)
      m.set(c.category, g)
    }
    return [...m.entries()]
  }, [report])

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500" data-testid="halo-loading">
        Loading Halo Data report…
      </div>
    )
  }
  if (error || !report) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500" data-testid="halo-error">
        Halo Data report unavailable — {error ?? 'no data'}
      </div>
    )
  }

  const cov = report.coverage
  return (
    <section className="min-w-0 space-y-4" data-testid="halo-report">
      {/* Store identity + mode */}
      <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
        <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Halo Data — {report.profile}</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Sales only</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700" data-testid="halo-narrative-mode">
              narrative: {report.narrative_mode}
            </span>
            <span className="text-slate-400" data-testid="halo-window-note">
              requested activity window: {report.window_days} days · native source periods shown per metric · manifest {report.manifest_version}
            </span>
          </div>
        </header>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="halo-coverage">
          <Stat label="Current values" value={`${cov.current_value} / ${cov.total}`} />
          <Stat label="No current data" value={String(cov.no_current_data)} />
          <Stat label="Withheld" value={String(cov.withheld)} />
          <Stat label="Total measures" value={String(cov.total)} />
        </dl>
      </div>

      {/* Narrative — deterministic-grounded by default, upgraded to AI-grounded only
          when evidence-constrained narration validates. Mode + fallback are visible. */}
      <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>Narrative</span>
          <span
            className={
              report.narrative_mode === 'ai_grounded'
                ? 'rounded bg-sky-50 px-1.5 py-0.5 font-normal normal-case text-sky-700'
                : 'rounded bg-slate-100 px-1.5 py-0.5 font-normal normal-case text-slate-500'
            }
            data-testid="halo-narrative-provider"
          >
            {report.narrative_mode === 'ai_grounded'
              ? `AI-grounded · ${report.narrative_provider ?? 'provider'}`
              : report.narrative_mode}
          </span>
        </div>
        {report.narrative_fallback_reason && (
          <div className="mb-1 text-[11px] font-normal normal-case text-amber-700" data-testid="halo-narrative-fallback">
            AI narration unavailable — {report.narrative_fallback_reason}; showing the deterministic grounded summary.
          </div>
        )}
        <p className="whitespace-pre-wrap text-sm text-slate-700" data-testid="halo-narrative">{report.narrative}</p>
      </div>

      {/* Metric cards grouped by category */}
      {grouped.map(([category, cards]) => (
        <div key={category} className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{category}</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cards.map((c) => {
              const cur = currentText(c.current, c.display)
              return (
                <div key={c.slug} className="min-w-0 rounded-md border border-slate-100 p-3" data-testid={`halo-card-${c.slug}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="truncate text-sm font-medium text-slate-800">{c.label}</div>
                    <div
                      className={
                        cur.tone === 'value'
                          ? 'text-lg font-semibold tabular-nums text-slate-900'
                          : cur.tone === 'withheld'
                            ? 'text-xs font-medium text-amber-700'
                            : 'text-xs text-slate-400'
                      }
                      data-testid={`halo-current-${c.slug}`}
                    >
                      {cur.label}
                    </div>
                  </div>
                  {c.current.state === 'withheld' && (
                    <div className="mt-0.5 text-[11px] text-slate-400">{c.current.reason}</div>
                  )}
                  <div className="mt-1 space-y-0.5">
                    <IndustryLine ind={c.industry} />
                    <BaselineLine b={c.baseline} />
                    {c.provenance && (
                      <div className="text-[11px] text-slate-400" data-testid={`halo-prov-${c.slug}`}>
                        source: {c.provenance.source}
                        {c.provenance.period?.start && c.provenance.period?.end
                          ? ` · ${c.provenance.period.start}–${c.provenance.period.end}`
                          : ''}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Limitations */}
      <div className="min-w-0 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4" data-testid="halo-limitations">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Data limitations</div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
          {report.limitations.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="truncate text-lg font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  )
}
