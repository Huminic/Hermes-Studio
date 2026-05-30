/**
 * customer-console.campaigns — Phase C.8.
 *
 * Service sub-page only (operator decision 2026-05-29). Shows a campaign
 * list, audience builder with preview, template picker, and a manual
 * "tick now" button to run the scheduled-send worker on demand.
 */

import { useCallback, useEffect, useState } from 'react'
import type { StudioConfig } from '../../lib/studio-config'

type Campaign = {
  id: string
  audience_id: string
  channel: string
  message_template: string
  schedule: number | null
  status: string
  template: string | null
  created_at: number
  updated_at: number
}

type Audience = {
  id: string
  name: string
  query: Record<string, unknown>
  created_at: number
}

type CampaignTemplate = {
  id: string
  name: string
  description: string
  channel: 'email' | 'sms'
  message_template: string
  domain: 'service'
}

type ListCampaignsResponse = {
  ok: boolean
  campaigns: Array<Campaign>
  templates: Array<CampaignTemplate>
}
type ListAudiencesResponse = { ok: boolean; audiences: Array<Audience> }
type PreviewResponse = {
  ok: boolean
  preview: { count: number; sample: Array<{ id: string; display_name: string | null; channels: Array<string> }> }
}

export function CustomerCampaignsRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [campaigns, setCampaigns] = useState<Array<Campaign>>([])
  const [templates, setTemplates] = useState<Array<CampaignTemplate>>([])
  const [audiences, setAudiences] = useState<Array<Audience>>([])
  const [view, setView] = useState<'list' | 'build'>('list')
  const [pickedTemplate, setPickedTemplate] = useState<string>('')
  const [audienceName, setAudienceName] = useState('All SMS contacts')
  const [audienceQuery, setAudienceQuery] = useState<string>(
    '{"channel": "sms"}',
  )
  const [preview, setPreview] = useState<PreviewResponse['preview'] | null>(
    null,
  )
  const [feedback, setFeedback] = useState<string | null>(null)
  const [tickResult, setTickResult] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const accent = props.config.branding.accent_color ?? '#1e40af'

  const load = useCallback(async () => {
    try {
      const [campRes, audRes] = await Promise.all([
        fetch(
          `/api/customer/campaigns?profile=${encodeURIComponent(props.profile)}`,
          { credentials: 'include' },
        ),
        fetch(
          `/api/customer/audiences?profile=${encodeURIComponent(props.profile)}`,
          { credentials: 'include' },
        ),
      ])
      const campJ = (await campRes.json().catch(() => ({}))) as ListCampaignsResponse
      const audJ = (await audRes.json().catch(() => ({}))) as ListAudiencesResponse
      if (campRes.ok && campJ.ok) {
        setCampaigns(campJ.campaigns)
        setTemplates(campJ.templates)
        if (!pickedTemplate && campJ.templates.length) {
          setPickedTemplate(campJ.templates[0].id)
        }
      }
      if (audRes.ok && audJ.ok) {
        setAudiences(audJ.audiences)
      }
    } catch {
      // ignore
    }
  }, [pickedTemplate, props.profile])

  useEffect(() => {
    void load()
  }, [load])

  const runPreview = useCallback(async () => {
    setFeedback(null)
    setBusy(true)
    try {
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(audienceQuery) as Record<string, unknown>
      } catch (err) {
        setFeedback(`Invalid query JSON: ${(err as Error).message}`)
        return
      }
      const res = await fetch('/api/customer/audiences', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          action: 'preview',
          query: parsed,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as PreviewResponse
      if (res.ok && j.ok) setPreview(j.preview)
    } finally {
      setBusy(false)
    }
  }, [audienceQuery, props.profile])

  const saveAudienceAndCampaign = useCallback(async () => {
    setBusy(true)
    setFeedback(null)
    try {
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(audienceQuery) as Record<string, unknown>
      } catch (err) {
        setFeedback(`Invalid query JSON: ${(err as Error).message}`)
        return
      }
      const audRes = await fetch('/api/customer/audiences', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          name: audienceName,
          query: parsed,
        }),
      })
      const audJ = (await audRes.json().catch(() => ({}))) as {
        ok: boolean
        audience?: Audience
      }
      if (!audRes.ok || !audJ.ok || !audJ.audience) {
        setFeedback(`Audience save failed.`)
        return
      }
      const tpl = templates.find((t) => t.id === pickedTemplate)
      if (!tpl) {
        setFeedback('Template not selected.')
        return
      }
      const campRes = await fetch('/api/customer/campaigns', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          audience_id: audJ.audience.id,
          channel: tpl.channel,
          message_template: tpl.message_template,
          schedule: Date.now() + 60_000,
          template: tpl.id,
        }),
      })
      const campJ = (await campRes.json().catch(() => ({}))) as {
        ok: boolean
        campaign?: Campaign
      }
      if (!campRes.ok || !campJ.ok) {
        setFeedback('Campaign save failed.')
        return
      }
      setFeedback(`Campaign created (id: ${campJ.campaign?.id ?? '?'})`)
      setView('list')
      await load()
    } finally {
      setBusy(false)
    }
  }, [
    audienceName,
    audienceQuery,
    load,
    pickedTemplate,
    props.profile,
    templates,
  ])

  const tickNow = useCallback(async () => {
    setBusy(true)
    setTickResult(null)
    try {
      const res = await fetch('/api/customer/campaigns/tick', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: props.profile }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        results: unknown
      }
      if (res.ok && j.ok) setTickResult(j.results)
      await load()
    } finally {
      setBusy(false)
    }
  }, [load, props.profile])

  if (view === 'build') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView('list')}
            className="text-xs opacity-70 hover:opacity-100"
          >
            ← back
          </button>
          <h3 className="text-sm font-medium">New Service campaign</h3>
        </div>

        <section className="rounded border border-white/10 bg-white/5 p-3">
          <div className="mb-1 text-xs font-medium opacity-70">Template</div>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPickedTemplate(t.id)}
                className={
                  'rounded border px-2 py-1 text-xs ' +
                  (t.id === pickedTemplate
                    ? 'font-semibold'
                    : 'border-white/10 opacity-70 hover:opacity-100')
                }
                style={
                  t.id === pickedTemplate
                    ? { borderColor: accent }
                    : undefined
                }
              >
                <div>{t.name}</div>
                <div className="text-[10px] opacity-60">{t.channel}</div>
              </button>
            ))}
          </div>
          {pickedTemplate && (
            <pre className="mt-2 max-h-32 overflow-y-auto rounded bg-black/30 p-2 text-[10px]">
              {templates.find((t) => t.id === pickedTemplate)
                ?.message_template ?? ''}
            </pre>
          )}
        </section>

        <section className="rounded border border-white/10 bg-white/5 p-3">
          <label className="text-xs">
            <span className="block opacity-70">Audience name</span>
            <input
              value={audienceName}
              onChange={(e) => setAudienceName(e.target.value)}
              className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
            />
          </label>
          <label className="mt-2 text-xs">
            <span className="block opacity-70">
              Audience query (JSON DSL)
            </span>
            <textarea
              value={audienceQuery}
              onChange={(e) => setAudienceQuery(e.target.value)}
              rows={4}
              className="mt-1 w-full resize-y rounded border border-white/10 bg-black/30 px-2 py-1 text-xs font-mono"
            />
          </label>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void runPreview()}
              disabled={busy}
              className="rounded border border-white/10 px-2 py-1 text-xs opacity-80 hover:opacity-100 disabled:opacity-40"
            >
              Preview audience
            </button>
            {preview && (
              <div className="text-xs">
                Matches: <span className="font-medium">{preview.count}</span>
                {preview.sample.length > 0 && (
                  <span className="opacity-60">
                    {' '}
                    · sample:{' '}
                    {preview.sample
                      .map((s) => s.display_name ?? s.id.slice(0, 6))
                      .join(', ')}
                  </span>
                )}
              </div>
            )}
          </div>
        </section>

        {feedback && (
          <div className="rounded border border-emerald-400/30 bg-emerald-500/10 p-2 text-xs">
            {feedback}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void saveAudienceAndCampaign()}
            disabled={busy || !pickedTemplate}
            className="rounded px-3 py-1.5 text-sm font-medium disabled:opacity-40"
            style={{ background: accent, color: '#fff' }}
          >
            Save + schedule
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Service campaigns</h3>
          <div className="text-[10px] opacity-50">
            Per operator decision 2026-05-29: Service-only sub-page.
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void tickNow()}
            disabled={busy}
            className="rounded border border-white/10 px-2 py-1 text-xs opacity-80 hover:opacity-100 disabled:opacity-40"
            title="Run the scheduled-send worker now"
          >
            Tick now
          </button>
          <button
            type="button"
            onClick={() => setView('build')}
            className="rounded px-3 py-1.5 text-xs font-medium"
            style={{ background: accent, color: '#fff' }}
          >
            New campaign
          </button>
        </div>
      </div>

      <div className="rounded border border-white/10 bg-white/5 p-3">
        <div className="text-xs font-medium opacity-70">Audiences</div>
        {audiences.length === 0 ? (
          <div className="text-xs opacity-60">No audiences yet.</div>
        ) : (
          <ul className="mt-1 text-xs">
            {audiences.map((a) => (
              <li
                key={a.id}
                className="flex justify-between border-b border-white/5 py-0.5"
              >
                <span>{a.name}</span>
                <span className="opacity-50">
                  {JSON.stringify(a.query).slice(0, 40)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded border border-white/10 bg-white/5 p-3">
        <div className="text-xs font-medium opacity-70">Campaigns</div>
        {campaigns.length === 0 ? (
          <div className="text-xs opacity-60">No campaigns scheduled yet.</div>
        ) : (
          <ul className="mt-1 text-xs">
            {campaigns.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 py-1"
              >
                <span className="font-medium">
                  {c.template ?? c.id.slice(0, 6)}
                </span>
                <span className="opacity-60">{c.channel}</span>
                <span
                  className={
                    'rounded px-1.5 py-0.5 text-[10px] uppercase ' +
                    (c.status === 'complete'
                      ? 'bg-emerald-500/20'
                      : c.status === 'in_progress'
                        ? 'bg-amber-400/20'
                        : 'bg-white/10')
                  }
                >
                  {c.status}
                </span>
                <span className="opacity-50">
                  {c.schedule
                    ? `scheduled ${new Date(c.schedule).toLocaleString()}`
                    : 'draft'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {tickResult !== null && (
        <div className="rounded border border-white/10 bg-black/20 p-2 text-[11px]">
          <div className="opacity-60">Last tick:</div>
          <pre className="overflow-x-auto">
            {JSON.stringify(tickResult, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
