/**
 * customer-console.campaigns — customer-grade Campaigns page (SERRA-UI-9).
 *
 * Light-theme, plain-language surface for reaching customers:
 *   - friendly channel picker (Text / Email / Call / Video) + labeled filters
 *     that build the underlying audience query behind the scenes,
 *   - "Upload a list (.csv)" to import contacts and target them directly,
 *   - "Send now" (no jargon) to dispatch a ready campaign,
 *   - a results view per campaign (audience size, delivered, failed, status).
 * The customer never sees or types raw JSON.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudioConfig } from '../../lib/studio-config'

const PRIMARY = '#3b82f6'
const ACTIVE = '#8b5cf6'

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
  preview: {
    count: number
    sample: Array<{
      id: string
      display_name: string | null
      channels: Array<string>
    }>
  }
}
type CampaignResults = {
  campaign_id: string
  status: string
  audience_name: string | null
  audience_size: number
  delivered: number
  failed: number
}

/** Customer-facing channel options → underlying channel + template channel. */
const CHANNELS: Array<{
  value: string
  label: string
  /** Which template `channel` to show for this option (null = any). */
  templateChannel: 'email' | 'sms' | null
}> = [
  { value: 'sms', label: 'Text message', templateChannel: 'sms' },
  { value: 'email', label: 'Email', templateChannel: 'email' },
  { value: 'voice', label: 'Phone call', templateChannel: null },
  { value: 'video', label: 'Video message', templateChannel: null },
]

function channelLabel(value: string): string {
  return CHANNELS.find((c) => c.value === value)?.label ?? value
}

function statusLabel(status: string): string {
  switch (status) {
    case 'complete':
      return 'Sent'
    case 'in_progress':
      return 'Sending'
    case 'scheduled':
      return 'Scheduled'
    case 'failed':
      return 'Failed'
    case 'draft':
    default:
      return 'Draft'
  }
}

function describeAudience(a: Audience): string {
  const q = a.query as {
    contact_ids?: Array<string>
    channel?: string
    last_contacted_before?: number
    last_contacted_after?: number
  }
  if (Array.isArray(q.contact_ids)) {
    return `${q.contact_ids.length} uploaded contact${q.contact_ids.length === 1 ? '' : 's'}`
  }
  const parts: Array<string> = []
  if (q.channel) parts.push(channelLabel(q.channel))
  if (q.last_contacted_before) {
    parts.push(
      `not contacted since ${new Date(q.last_contacted_before).toLocaleDateString()}`,
    )
  }
  if (q.last_contacted_after) {
    parts.push(
      `contacted since ${new Date(q.last_contacted_after).toLocaleDateString()}`,
    )
  }
  return parts.length ? parts.join(' · ') : 'Everyone'
}

export function CustomerCampaignsRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [campaigns, setCampaigns] = useState<Array<Campaign>>([])
  const [templates, setTemplates] = useState<Array<CampaignTemplate>>([])
  const [audiences, setAudiences] = useState<Array<Audience>>([])
  const [view, setView] = useState<'list' | 'build'>('list')

  // Build form state.
  const [channel, setChannel] = useState<string>('sms')
  const [pickedTemplate, setPickedTemplate] = useState<string>('')
  const [audienceName, setAudienceName] = useState('My customer list')
  const [audienceMode, setAudienceMode] = useState<'filter' | 'upload'>('filter')
  const [filterBeforeAfter, setFilterBeforeAfter] = useState<
    '' | 'before' | 'after'
  >('')
  const [filterDate, setFilterDate] = useState<string>('')
  const [uploadedAudience, setUploadedAudience] = useState<{
    id: string
    name: string
    imported: number
  } | null>(null)
  const [uploadNote, setUploadNote] = useState<string | null>(null)

  const [preview, setPreview] = useState<PreviewResponse['preview'] | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Results view.
  const [openResults, setOpenResults] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, CampaignResults>>({})
  const [sendNote, setSendNote] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement | null>(null)

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
      const campJ = (await campRes
        .json()
        .catch(() => ({}))) as ListCampaignsResponse
      const audJ = (await audRes
        .json()
        .catch(() => ({}))) as ListAudiencesResponse
      if (campRes.ok && campJ.ok) {
        setCampaigns(campJ.campaigns)
        setTemplates(campJ.templates)
      }
      if (audRes.ok && audJ.ok) setAudiences(audJ.audiences)
    } catch {
      // ignore — empty state renders below
    }
  }, [props.profile])

  useEffect(() => {
    void load()
  }, [load])

  // Templates relevant to the chosen channel (sms/email have templates; call
  // and video reuse the text/email scripts as the spoken/sent message).
  const channelDef = CHANNELS.find((c) => c.value === channel) ?? CHANNELS[0]
  const visibleTemplates = templates.filter((t) =>
    channelDef.templateChannel ? t.channel === channelDef.templateChannel : true,
  )

  useEffect(() => {
    if (
      visibleTemplates.length &&
      !visibleTemplates.some((t) => t.id === pickedTemplate)
    ) {
      setPickedTemplate(visibleTemplates[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, templates])

  /** Build the underlying audience query from the friendly form controls. */
  const buildQuery = useCallback((): Record<string, unknown> => {
    const q: Record<string, unknown> = {}
    if (channel) q.channel = channel
    if (filterBeforeAfter && filterDate) {
      const ms = new Date(filterDate).getTime()
      if (!Number.isNaN(ms)) {
        if (filterBeforeAfter === 'before') q.last_contacted_before = ms
        else q.last_contacted_after = ms
      }
    }
    return q
  }, [channel, filterBeforeAfter, filterDate])

  const runPreview = useCallback(async () => {
    setFeedback(null)
    setBusy(true)
    try {
      const res = await fetch('/api/customer/audiences', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          action: 'preview',
          query: buildQuery(),
        }),
      })
      const j = (await res.json().catch(() => ({}))) as PreviewResponse
      if (res.ok && j.ok) setPreview(j.preview)
    } finally {
      setBusy(false)
    }
  }, [buildQuery, props.profile])

  const onUploadFile = useCallback(
    async (file: File) => {
      setBusy(true)
      setFeedback(null)
      setUploadNote(null)
      try {
        const text = await file.text()
        const niceName =
          file.name.replace(/\.csv$/i, '').trim() || 'Imported list'
        const res = await fetch('/api/customer/audiences/upload', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile: props.profile,
            name: niceName,
            csv: text,
          }),
        })
        const j = (await res.json().catch(() => ({}))) as {
          ok: boolean
          error?: string
          audience?: { id: string; name: string }
          imported?: number
          skipped?: Array<{ row: number; reason: string }>
        }
        if (!res.ok || !j.ok || !j.audience) {
          setUploadNote(
            j.error ?? 'We could not read that file. Please upload a .csv list.',
          )
          return
        }
        const imported = j.imported ?? 0
        const skipped = j.skipped ?? []
        setUploadedAudience({
          id: j.audience.id,
          name: j.audience.name,
          imported,
        })
        setAudienceName(j.audience.name)
        const skippedReasons = skipped.length
          ? ` ${skipped.length} row${skipped.length === 1 ? '' : 's'} skipped — ${
              skipped[0].reason
            }.`
          : ''
        setUploadNote(
          `Imported ${imported} contact${imported === 1 ? '' : 's'}.${skippedReasons}`,
        )
        await load()
      } catch {
        setUploadNote('We could not read that file. Please upload a .csv list.')
      } finally {
        setBusy(false)
      }
    },
    [load, props.profile],
  )

  const saveCampaign = useCallback(async () => {
    setBusy(true)
    setFeedback(null)
    try {
      const tpl = templates.find((t) => t.id === pickedTemplate)
      if (!tpl) {
        setFeedback('Please choose a message to send.')
        return
      }

      // Resolve the audience id — either the uploaded list or a freshly-saved
      // filter audience.
      let audienceId: string
      if (audienceMode === 'upload') {
        if (!uploadedAudience) {
          setFeedback('Please upload a .csv list first.')
          return
        }
        audienceId = uploadedAudience.id
      } else {
        const audRes = await fetch('/api/customer/audiences', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile: props.profile,
            name: audienceName,
            query: buildQuery(),
          }),
        })
        const audJ = (await audRes.json().catch(() => ({}))) as {
          ok: boolean
          audience?: Audience
        }
        if (!audRes.ok || !audJ.ok || !audJ.audience) {
          setFeedback('We could not save that audience. Please try again.')
          return
        }
        audienceId = audJ.audience.id
      }

      const campRes = await fetch('/api/customer/campaigns', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          audience_id: audienceId,
          channel,
          message_template: tpl.message_template,
          schedule: Date.now() + 60_000,
          template: tpl.id,
        }),
      })
      const campJ = (await campRes.json().catch(() => ({}))) as {
        ok: boolean
      }
      if (!campRes.ok || !campJ.ok) {
        setFeedback('We could not save that campaign. Please try again.')
        return
      }
      setView('list')
      setPreview(null)
      setUploadedAudience(null)
      setUploadNote(null)
      await load()
    } finally {
      setBusy(false)
    }
  }, [
    audienceMode,
    audienceName,
    buildQuery,
    channel,
    load,
    pickedTemplate,
    props.profile,
    templates,
    uploadedAudience,
  ])

  const sendNow = useCallback(async () => {
    setBusy(true)
    setSendNote(null)
    try {
      const res = await fetch('/api/customer/campaigns/tick', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: props.profile }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        results?: Array<{ sent?: number; failed?: number }>
      }
      if (res.ok && j.ok) {
        const sent = (j.results ?? []).reduce((n, r) => n + (r.sent ?? 0), 0)
        const failed = (j.results ?? []).reduce(
          (n, r) => n + (r.failed ?? 0),
          0,
        )
        if (sent === 0 && failed === 0) {
          setSendNote('Nothing was due to send right now.')
        } else {
          setSendNote(
            `Sent ${sent} message${sent === 1 ? '' : 's'}` +
              (failed ? `, ${failed} could not be delivered.` : '.'),
          )
        }
      } else {
        setSendNote('We could not send right now. Please try again.')
      }
      await load()
    } finally {
      setBusy(false)
    }
  }, [load, props.profile])

  const toggleResults = useCallback(
    async (campaignId: string) => {
      if (openResults === campaignId) {
        setOpenResults(null)
        return
      }
      setOpenResults(campaignId)
      try {
        const res = await fetch(
          `/api/customer/campaigns/results?profile=${encodeURIComponent(
            props.profile,
          )}&campaign_id=${encodeURIComponent(campaignId)}`,
          { credentials: 'include' },
        )
        const j = (await res.json().catch(() => ({}))) as {
          ok: boolean
          results?: CampaignResults
        }
        if (res.ok && j.ok && j.results) {
          setResults((prev) => ({ ...prev, [campaignId]: j.results! }))
        }
      } catch {
        // ignore
      }
    },
    [openResults, props.profile],
  )

  // ── Build view ────────────────────────────────────────────────────────────
  if (view === 'build') {
    const selectedTemplate = templates.find((t) => t.id === pickedTemplate)
    return (
      <div className="flex flex-col gap-3 text-slate-900">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView('list')}
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            ← Back
          </button>
          <h3 className="text-sm font-semibold">New campaign</h3>
        </div>

        {/* Channel */}
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <label className="block text-xs font-medium text-slate-600">
            How do you want to reach people?
          </label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </section>

        {/* Message */}
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium text-slate-600">
            Choose a message
          </div>
          {visibleTemplates.length === 0 ? (
            <div className="mt-1 text-xs text-slate-500">
              No ready-made messages for this channel yet.
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {visibleTemplates.map((t) => {
                const active = t.id === pickedTemplate
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setPickedTemplate(t.id)}
                    className={
                      'rounded-md border px-2.5 py-1.5 text-left text-xs ' +
                      (active
                        ? 'text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
                    }
                    style={active ? { background: ACTIVE, borderColor: ACTIVE } : undefined}
                  >
                    <div className="font-semibold">{t.name}</div>
                    <div
                      className={
                        'text-[10px] ' + (active ? 'text-white/80' : 'text-slate-400')
                      }
                    >
                      {t.description}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          {selectedTemplate && (
            <div className="mt-2 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
              {selectedTemplate.message_template}
            </div>
          )}
        </section>

        {/* Audience */}
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium text-slate-600">
            Who should receive it?
          </div>
          <div className="mt-2 flex gap-2">
            {(
              [
                ['filter', 'My existing contacts'],
                ['upload', 'Upload a list (.csv)'],
              ] as const
            ).map(([mode, label]) => {
              const active = audienceMode === mode
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAudienceMode(mode)}
                  className={
                    'rounded-md border px-2.5 py-1 text-xs ' +
                    (active
                      ? 'text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
                  }
                  style={active ? { background: PRIMARY, borderColor: PRIMARY } : undefined}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {audienceMode === 'filter' && (
            <div className="mt-3 flex flex-col gap-2">
              <label className="block text-xs">
                <span className="text-slate-500">Audience name</span>
                <input
                  value={audienceName}
                  onChange={(e) => setAudienceName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <label className="block text-xs">
                  <span className="text-slate-500">Last contacted</span>
                  <select
                    value={filterBeforeAfter}
                    onChange={(e) =>
                      setFilterBeforeAfter(
                        e.target.value as '' | 'before' | 'after',
                      )
                    }
                    className="mt-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                  >
                    <option value="">No date filter</option>
                    <option value="before">Before…</option>
                    <option value="after">After…</option>
                  </select>
                </label>
                {filterBeforeAfter && (
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                  />
                )}
                <button
                  type="button"
                  onClick={() => void runPreview()}
                  disabled={busy}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Preview audience
                </button>
              </div>
              {preview && (
                <div className="text-xs text-slate-600">
                  This will reach{' '}
                  <span className="font-semibold text-slate-900">
                    {preview.count}
                  </span>{' '}
                  {preview.count === 1 ? 'person' : 'people'}.
                  {preview.sample.length > 0 && (
                    <span className="text-slate-400">
                      {' '}
                      For example:{' '}
                      {preview.sample
                        .map((s) => s.display_name ?? 'a contact')
                        .join(', ')}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {audienceMode === 'upload' && (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-[11px] text-slate-500">
                Upload a spreadsheet saved as .csv with columns for name, phone,
                and email. We will only message people who have a phone or email.
              </p>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void onUploadFile(f)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Choose a .csv file
                </button>
              </div>
              {uploadNote && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                  {uploadNote}
                </div>
              )}
            </div>
          )}
        </section>

        {feedback && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            {feedback}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void saveCampaign()}
            disabled={busy || !pickedTemplate}
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: PRIMARY }}
          >
            Save campaign
          </button>
        </div>
        <p className="text-[11px] text-slate-400">
          Saved campaigns are queued to send. Use “Send now” on the campaigns
          list to deliver them immediately.
        </p>
      </div>
    )
  }

  // ── List view ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 text-slate-900">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Campaigns</h3>
          <div className="text-[11px] text-slate-500">
            Reach your customers by text, email, call, or video.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void sendNow()}
            disabled={busy}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            title="Sends ready campaigns to their audience immediately."
          >
            Send now
          </button>
          <button
            type="button"
            onClick={() => {
              setView('build')
              setPreview(null)
              setUploadNote(null)
              setUploadedAudience(null)
              setFeedback(null)
            }}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-white"
            style={{ background: PRIMARY }}
          >
            New campaign
          </button>
        </div>
      </div>
      <p className="-mt-1 text-[11px] text-slate-400">
        “Send now” sends any ready campaign to its audience immediately.
      </p>
      {sendNote && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
          {sendNote}
        </div>
      )}

      {/* Audiences */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-xs font-semibold text-slate-600">Your lists</div>
        {audiences.length === 0 ? (
          <div className="mt-1 text-xs text-slate-500">
            No lists yet. Create a campaign or upload a .csv to build one.
          </div>
        ) : (
          <ul className="mt-1 divide-y divide-slate-100 text-xs">
            {audiences.map((a) => (
              <li key={a.id} className="flex justify-between gap-2 py-1.5">
                <span className="font-medium text-slate-800">{a.name}</span>
                <span className="text-slate-400">{describeAudience(a)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Campaigns */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-xs font-semibold text-slate-600">Campaigns</div>
        {campaigns.length === 0 ? (
          <div className="mt-1 text-xs text-slate-500">
            No campaigns yet. Create one to reach your customers.
          </div>
        ) : (
          <ul className="mt-1 divide-y divide-slate-100 text-xs">
            {campaigns.map((c) => {
              const r = results[c.id]
              const open = openResults === c.id
              return (
                <li key={c.id} className="py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">
                      {c.template ?? 'Campaign'}
                    </span>
                    <span className="text-slate-500">
                      {channelLabel(c.channel)}
                    </span>
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
                        (c.status === 'complete'
                          ? 'bg-emerald-100 text-emerald-700'
                          : c.status === 'in_progress'
                            ? 'bg-amber-100 text-amber-700'
                            : c.status === 'failed'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-slate-100 text-slate-600')
                      }
                    >
                      {statusLabel(c.status)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void toggleResults(c.id)}
                      className="text-[11px] font-medium"
                      style={{ color: PRIMARY }}
                    >
                      {open ? 'Hide results' : 'View results'}
                    </button>
                  </div>
                  {open && (
                    <div className="mt-2 grid grid-cols-3 gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-center">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {r ? r.audience_size : '—'}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          People in audience
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-emerald-700">
                          {r ? r.delivered : '—'}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Delivered
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-rose-700">
                          {r ? r.failed : '—'}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Could not deliver
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
