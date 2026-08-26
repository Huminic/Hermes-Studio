/**
 * AlertWizard — the reusable metric-alert form. Used inline on the Notifications
 * page (AlertsPanel) and inside the dashboard's AlertModal. Self-contained: fetches
 * the metric catalog, builds the rule (rises above X / falls below X threshold, or a
 * 2σ/3σ per-dealer baseline), collects recipient(s), shows a live plain-language
 * preview, and POSTs to /api/customer/alerts. Percent metrics are entered as a
 * percentage and stored 0–1. Calls onCreated() on success.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

export type CatalogMetric = {
  id: string
  label: string
  description: string
  category: string
  format: 'percent' | 'count' | 'currency'
  concerning: 'above' | 'below'
  source: 'vin-report' | 'hub'
}
type CatalogGroup = { category: string; metrics: Array<CatalogMetric> }
type Direction = 'above' | 'below'
type RuleType = 'threshold' | 'baseline'

function fmtBound(format: CatalogMetric['format'], raw: string): string {
  const n = Number(raw)
  if (!raw.trim() || !Number.isFinite(n)) return '…'
  if (format === 'percent') return `${n}%`
  if (format === 'currency') return `$${n.toLocaleString()}`
  return String(n)
}

export function AlertWizard({
  profile,
  presetMetricId,
  onCreated,
}: {
  profile: string
  presetMetricId?: string
  onCreated?: () => void
}) {
  const [catalog, setCatalog] = useState<Array<CatalogGroup>>([])
  const [metricId, setMetricId] = useState(presetMetricId ?? '')
  const [direction, setDirection] = useState<Direction>('below')
  const [ruleType, setRuleType] = useState<RuleType>('threshold')
  const [threshold, setThreshold] = useState('')
  const [sigma, setSigma] = useState('2')
  const [email, setEmail] = useState('duanekwells@gmail.com')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/customer/alerts?profile=${encodeURIComponent(profile)}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j: { catalog?: Array<CatalogGroup> }) => {
        if (!alive) return
        const cat = j.catalog ?? []
        setCatalog(cat)
        // default the direction from a preset metric's concerning side
        const preset = cat.flatMap((g) => g.metrics).find((m) => m.id === presetMetricId)
        if (preset) setDirection(preset.concerning)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [profile, presetMetricId])

  const metric = useMemo(
    () => catalog.flatMap((g) => g.metrics).find((m) => m.id === metricId),
    [catalog, metricId],
  )

  function pickMetric(id: string) {
    setMetricId(id)
    const m = catalog.flatMap((g) => g.metrics).find((x) => x.id === id)
    if (m) setDirection(m.concerning)
  }

  const preview = useMemo(() => {
    if (!metric) return null
    const dir = direction === 'above' ? 'rises above' : 'falls below'
    if (ruleType === 'threshold') return `Email ${email || '…'} when ${metric.label} ${dir} ${fmtBound(metric.format, threshold)}.`
    const side = direction === 'above' ? 'unusually high' : 'unusually low'
    return `Email ${email || '…'} when ${metric.label} is ${side} for this dealer (beyond ${sigma}σ of its recent baseline).`
  }, [metric, direction, ruleType, threshold, sigma, email])

  const create = useCallback(async () => {
    if (!metric) { setErr('Pick a metric.'); return }
    setBusy(true)
    setErr(null)
    try {
      const thr = metric.format === 'percent' && threshold.trim() !== '' ? Number(threshold) / 100 : Number(threshold)
      const body = {
        profile, email, metric_id: metric.id, rule_type: ruleType, direction,
        ...(ruleType === 'threshold' ? { threshold: thr } : { baseline_sigma: Number(sigma) }),
      }
      const res = await fetch('/api/customer/alerts', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = (await res.json().catch(() => ({}))) as { ok: boolean; error?: string }
      if (!res.ok || !j.ok) { setErr(j.error ?? 'Could not create the alert.'); return }
      setDone(true)
      setThreshold('')
      onCreated?.()
    } catch {
      setErr('Could not create the alert.')
    } finally {
      setBusy(false)
    }
  }, [metric, profile, email, ruleType, direction, threshold, sigma, onCreated])

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs text-slate-600 sm:col-span-2">
        Metric to watch
        <select className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" value={metricId} onChange={(e) => pickMetric(e.target.value)}>
          <option value="">Choose a metric…</option>
          {catalog.map((g) => (
            <optgroup key={g.category} label={g.category}>
              {g.metrics.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {metric && <p className="-mt-1 text-[11px] text-slate-500 sm:col-span-2">{metric.description}</p>}

      <label className="text-xs text-slate-600">
        Alert when it
        <select className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
          <option value="above">rises above</option>
          <option value="below">falls below</option>
        </select>
      </label>

      <label className="text-xs text-slate-600">
        Rule
        <select className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" value={ruleType} onChange={(e) => setRuleType(e.target.value as RuleType)}>
          <option value="threshold">a number I set</option>
          <option value="baseline">unusual for this dealer</option>
        </select>
      </label>

      {ruleType === 'threshold' ? (
        <label className="text-xs text-slate-600">
          Threshold {metric?.format === 'percent' ? '(%)' : metric?.format === 'currency' ? '($)' : ''}
          <input type="number" className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" placeholder={metric?.format === 'percent' ? 'e.g. 50' : 'e.g. 10'} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </label>
      ) : (
        <label className="text-xs text-slate-600">
          Sensitivity
          <select className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" value={sigma} onChange={(e) => setSigma(e.target.value)}>
            <option value="2">Standard (2σ)</option>
            <option value="3">Strong (3σ)</option>
          </select>
        </label>
      )}

      <label className="text-xs text-slate-600 sm:col-span-2">
        Email to notify
        <input className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" placeholder="name@dealer.com (comma-separate for several)" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>

      {preview && (
        <div className="rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600 sm:col-span-2">
          <span className="font-medium text-slate-500">Preview: </span>{preview}
        </div>
      )}

      {err && <div className="text-xs text-amber-700 sm:col-span-2">{err}</div>}
      {done && <div className="text-xs text-emerald-700 sm:col-span-2">Alert created.</div>}

      <div className="sm:col-span-2">
        <button type="button" disabled={busy} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60" onClick={create}>
          {busy ? 'Creating…' : 'Create alert'}
        </button>
      </div>
    </div>
  )
}
