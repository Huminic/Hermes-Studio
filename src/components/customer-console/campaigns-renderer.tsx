/**
 * customer-console.campaigns — the Marketing workspace (side-menu "Marketing",
 * in-page tab set "Campaigns / Automations / Lists" under an Overview).
 *
 *   - Overview: real live counts (active campaigns, active automations, lists).
 *   - Campaigns: full CRUD (create/edit/delete) with draft + send.
 *   - Automations: a real multi-object builder (trigger + channel + team agent +
 *     draft/active/paused) backed by /api/customer/automations. Outbound rides
 *     the store communications agent (Caroline sales / Nancy service) through the
 *     same gated send path; draft/paused never fire.
 *   - Lists: full CRUD, a downloadable sample CSV, DNC-on-import, and CRM-query
 *     list generation.
 *
 * The customer never sees or types raw JSON or vendor names.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudioConfig } from '../../lib/studio-config'

const PRIMARY = '#2f3b4d'
const ACTIVE = PRIMARY

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

type AutomationTrigger = 'new_lead' | 'lead_followup'
type AutomationStatus = 'draft' | 'active' | 'paused'
type Automation = {
  id: string
  name: string
  trigger: AutomationTrigger
  channel: string
  agent_id: string
  wait_hours: number
  status: AutomationStatus
  last_triggered_at: number | null
  created_at: number
  updated_at: number
}
type AutomationAgent = { id: string; label: string; team: string }

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

type View = 'list' | 'build'
type MainTab = 'overview' | 'campaigns' | 'automations' | 'lists'

const MAIN_TABS: Array<{ value: MainTab; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'automations', label: 'Automations' },
  { value: 'lists', label: 'Lists' },
]

/** Customer-facing channel options → underlying channel + template channel. */
const CHANNELS: Array<{
  value: string
  label: string
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

/** Channels an automation step may use (Text / Email / Call). */
const AUTOMATION_CHANNELS: Array<{ value: string; label: string }> = [
  { value: 'sms', label: 'Text message' },
  { value: 'email', label: 'Email' },
  { value: 'voice', label: 'Phone call' },
]

const TRIGGERS: Array<{ value: AutomationTrigger; label: string; hint: string }> = [
  {
    value: 'new_lead',
    label: 'New lead',
    hint: 'Reach out the moment a new lead is created outside the workspace.',
  },
  {
    value: 'lead_followup',
    label: 'Follow-up',
    hint: 'Wait, then follow up — unless the customer has already replied.',
  },
]

const WAIT_PRESETS = [1, 4, 24, 48]

function triggerLabel(t: AutomationTrigger): string {
  return TRIGGERS.find((x) => x.value === t)?.label ?? t
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

const SAMPLE_CSV = `name,phone,email
Jordan Avery,+14155550100,jordan.avery@example.com
Riley Chen,+14155550101,riley.chen@example.com
Sam Diaz,,sam.diaz@example.com
`

function describeAudience(a: Audience): string {
  const q = a.query as {
    contact_ids?: Array<string>
    channel?: string
    last_contacted_before?: number
    last_contacted_after?: number
  }
  if (Array.isArray(q.contact_ids)) {
    return `${q.contact_ids.length} contact${q.contact_ids.length === 1 ? '' : 's'}`
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

/** Small pill button-group — the modern selector used throughout (no <select>). */
function PillGroup<T extends string | number>(props: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  ariaLabel?: string
}) {
  return (
    <div role="group" aria-label={props.ariaLabel} className="flex flex-wrap gap-1.5">
      {props.options.map((o) => {
        const active = o.value === props.value
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => props.onChange(o.value)}
            className={
              'rounded-md border px-2.5 py-1.5 text-xs font-medium transition ' +
              (active
                ? 'text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
            }
            style={active ? { background: ACTIVE, borderColor: ACTIVE } : undefined}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function CustomerCampaignsRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [campaigns, setCampaigns] = useState<Array<Campaign>>([])
  const [templates, setTemplates] = useState<Array<CampaignTemplate>>([])
  const [audiences, setAudiences] = useState<Array<Audience>>([])
  const [view, setView] = useState<View>('list')
  const [mainTab, setMainTab] = useState<MainTab>('overview')
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)

  // Automations state.
  const [automations, setAutomations] = useState<Array<Automation>>([])
  const [automationAgents, setAutomationAgents] = useState<Array<AutomationAgent>>(
    [],
  )
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(
    null,
  )
  const [showAutomationBuilder, setShowAutomationBuilder] = useState(false)
  const [aName, setAName] = useState('')
  const [aTrigger, setATrigger] = useState<AutomationTrigger>('new_lead')
  const [aChannel, setAChannel] = useState('sms')
  const [aTeam, setATeam] = useState('sales')
  const [aWait, setAWait] = useState(24)
  const [automationNote, setAutomationNote] = useState<string | null>(null)

  // Build form state (campaign).
  const [channel, setChannel] = useState<string>('sms')
  const [pickedTemplate, setPickedTemplate] = useState<string>('')
  const [audienceName, setAudienceName] = useState('My customer list')
  const [audienceMode, setAudienceMode] = useState<
    'existing' | 'filter' | 'upload'
  >('filter')
  const [existingAudienceId, setExistingAudienceId] = useState('')
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
  const [showListBuilder, setShowListBuilder] = useState(false)
  const [listNote, setListNote] = useState<string | null>(null)

  const [preview, setPreview] = useState<PreviewResponse['preview'] | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Results view.
  const [openResults, setOpenResults] = useState<string | null>(null)
  const [openPreview, setOpenPreview] = useState<string | null>(null)
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

  const loadAutomations = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/customer/automations?profile=${encodeURIComponent(props.profile)}`,
        { credentials: 'include' },
      )
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        automations?: Array<Automation>
        agents?: Array<AutomationAgent>
      }
      if (res.ok && j.ok) {
        setAutomations(j.automations ?? [])
        setAutomationAgents(j.agents ?? [])
      }
    } catch {
      // empty state renders
    }
  }, [props.profile])

  useEffect(() => {
    void load()
    void loadAutomations()
  }, [load, loadAutomations])

  useEffect(() => {
    if (!existingAudienceId && audiences.length > 0) {
      setExistingAudienceId(audiences[0].id)
    }
  }, [audiences, existingAudienceId])

  const startNewCampaign = useCallback(() => {
    setEditingCampaign(null)
    setView('build')
    setMainTab('campaigns')
    setAudienceMode('filter')
    setPreview(null)
    setUploadNote(null)
    setUploadedAudience(null)
    setFeedback(null)
  }, [])

  const startUploadList = useCallback(() => {
    setEditingCampaign(null)
    setView('list')
    setMainTab('lists')
    setShowListBuilder(false)
    setPreview(null)
    setUploadNote(null)
    setUploadedAudience(null)
    setFeedback(null)
    setListNote(null)
    fileRef.current?.click()
  }, [])

  const startNewList = useCallback(() => {
    setEditingCampaign(null)
    setView('list')
    setMainTab('lists')
    setShowListBuilder(true)
    setAudienceMode('filter')
    setPreview(null)
    setUploadNote(null)
    setUploadedAudience(null)
    setFeedback(null)
    setListNote(null)
  }, [])

  const startEditCampaign = useCallback((campaign: Campaign) => {
    setEditingCampaign(campaign)
    setView('build')
    setMainTab('campaigns')
    setChannel(campaign.channel)
    setPickedTemplate(campaign.template ?? '')
    setAudienceMode('existing')
    setExistingAudienceId(campaign.audience_id)
    setPreview(null)
    setUploadNote(null)
    setUploadedAudience(null)
    setFeedback(null)
  }, [])

  // ── Automations actions ────────────────────────────────────────────────────
  const resetAutomationForm = useCallback(
    (a?: Automation) => {
      const fallbackTeam = automationAgents[0]?.team ?? 'sales'
      if (a) {
        setEditingAutomation(a)
        setAName(a.name)
        setATrigger(a.trigger)
        setAChannel(a.channel)
        setATeam(
          automationAgents.find((ag) => ag.id === a.agent_id)?.team ??
            fallbackTeam,
        )
        setAWait(a.wait_hours || 24)
      } else {
        setEditingAutomation(null)
        setAName('')
        setATrigger('new_lead')
        setAChannel('sms')
        setATeam(fallbackTeam)
        setAWait(24)
      }
      setShowAutomationBuilder(true)
      setAutomationNote(null)
    },
    [automationAgents],
  )

  const saveAutomation = useCallback(async () => {
    const name = aName.trim()
    if (!name) {
      setAutomationNote('Please name this automation.')
      return
    }
    const agent = automationAgents.find((ag) => ag.team === aTeam)
    const agentId = agent?.id ?? automationAgents[0]?.id ?? 'caroline'
    setBusy(true)
    setAutomationNote(null)
    try {
      const payload = {
        profile: props.profile,
        id: editingAutomation?.id,
        name,
        trigger: aTrigger,
        channel: aChannel,
        agent_id: agentId,
        wait_hours: aTrigger === 'lead_followup' ? aWait : 0,
      }
      const res = await fetch('/api/customer/automations', {
        method: editingAutomation ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        error?: string
      }
      if (res.ok && j.ok) {
        setShowAutomationBuilder(false)
        setEditingAutomation(null)
        await loadAutomations()
      } else {
        setAutomationNote(j.error ?? 'We could not save that automation.')
      }
    } finally {
      setBusy(false)
    }
  }, [
    aName,
    aTrigger,
    aChannel,
    aTeam,
    aWait,
    automationAgents,
    editingAutomation,
    loadAutomations,
    props.profile,
  ])

  const setAutomationStatus = useCallback(
    async (a: Automation, status: AutomationStatus) => {
      setBusy(true)
      setAutomationNote(null)
      try {
        const res = await fetch('/api/customer/automations', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: props.profile, id: a.id, status }),
        })
        const j = (await res.json().catch(() => ({}))) as { ok: boolean }
        if (res.ok && j.ok) await loadAutomations()
      } finally {
        setBusy(false)
      }
    },
    [loadAutomations, props.profile],
  )

  const deleteAutomation = useCallback(
    async (a: Automation) => {
      setBusy(true)
      setAutomationNote(null)
      try {
        const res = await fetch('/api/customer/automations', {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: props.profile, id: a.id }),
        })
        const j = (await res.json().catch(() => ({}))) as { ok: boolean }
        if (res.ok && j.ok) {
          if (editingAutomation?.id === a.id) {
            setShowAutomationBuilder(false)
            setEditingAutomation(null)
          }
          await loadAutomations()
        }
      } finally {
        setBusy(false)
      }
    },
    [editingAutomation, loadAutomations, props.profile],
  )

  // Templates relevant to the chosen channel.
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

  const saveAudienceList = useCallback(async () => {
    setBusy(true)
    setListNote(null)
    try {
      const audRes = await fetch('/api/customer/audiences', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          name: audienceName.trim() || 'New customer list',
          query: buildQuery(),
        }),
      })
      const audJ = (await audRes.json().catch(() => ({}))) as {
        ok: boolean
        audience?: Audience
        error?: string
      }
      if (!audRes.ok || !audJ.ok || !audJ.audience) {
        setListNote(
          audJ.error ?? 'We could not save that list. Please try again.',
        )
        return
      }
      setListNote('Saved list.')
      setShowListBuilder(false)
      setPreview(null)
      await load()
    } finally {
      setBusy(false)
    }
  }, [audienceName, buildQuery, load, props.profile])

  const buildCrmList = useCallback(async () => {
    setBusy(true)
    setListNote(null)
    try {
      const res = await fetch('/api/customer/audiences', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          action: 'crm_query',
          name: audienceName.trim() || undefined,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        imported?: number
        dnc_blocked?: number
        limits?: string
        error?: string
      }
      if (res.ok && j.ok) {
        const dnc = j.dnc_blocked
          ? ` ${j.dnc_blocked} opted-out contact${j.dnc_blocked === 1 ? '' : 's'} removed (Do Not Contact).`
          : ''
        setListNote(
          `Imported ${j.imported ?? 0} CRM lead${(j.imported ?? 0) === 1 ? '' : 's'}.${dnc}` +
            (j.limits ? ` ${j.limits}` : ''),
        )
        setShowListBuilder(false)
        await load()
      } else {
        setListNote(
          j.error ?? 'CRM list generation is not available for this store yet.',
        )
      }
    } finally {
      setBusy(false)
    }
  }, [audienceName, load, props.profile])

  const deleteList = useCallback(
    async (id: string) => {
      setBusy(true)
      setListNote(null)
      try {
        const res = await fetch('/api/customer/audiences', {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: props.profile, id }),
        })
        const j = (await res.json().catch(() => ({}))) as { ok: boolean }
        if (res.ok && j.ok) {
          setListNote('List removed.')
          await load()
        }
      } finally {
        setBusy(false)
      }
    },
    [load, props.profile],
  )

  const downloadSampleCsv = useCallback(() => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sample-contact-list.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [])

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
          dnc_blocked?: number
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
        const dnc = j.dnc_blocked ?? 0
        setUploadedAudience({
          id: j.audience.id,
          name: j.audience.name,
          imported,
        })
        setAudienceName(j.audience.name)
        const skippedReasons = skipped.length
          ? ` ${skipped.length} row${skipped.length === 1 ? '' : 's'} skipped — ${skipped[0].reason}.`
          : ''
        const dncReason = dnc
          ? ` ${dnc} opted-out contact${dnc === 1 ? '' : 's'} removed (Do Not Contact).`
          : ''
        setUploadNote(
          `Imported ${imported} contact${imported === 1 ? '' : 's'}.${skippedReasons}${dncReason}`,
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
      let audienceId: string
      if (audienceMode === 'existing') {
        if (!existingAudienceId) {
          setFeedback('Please choose a saved list.')
          return
        }
        audienceId = existingAudienceId
      } else if (audienceMode === 'upload') {
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
        method: editingCampaign ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          campaign_id: editingCampaign?.id,
          audience_id: audienceId,
          channel,
          message_template: tpl.message_template,
          schedule: null,
          template: tpl.id,
        }),
      })
      const campJ = (await campRes.json().catch(() => ({}))) as { ok: boolean }
      if (!campRes.ok || !campJ.ok) {
        setFeedback('We could not save that campaign. Please try again.')
        return
      }
      setView('list')
      setMainTab('campaigns')
      setEditingCampaign(null)
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
    editingCampaign,
    existingAudienceId,
    load,
    pickedTemplate,
    props.profile,
    templates,
    uploadedAudience,
  ])

  const sendNow = useCallback(
    async (campaignId: string) => {
      setBusy(true)
      setSendNote(null)
      try {
        const res = await fetch('/api/customer/campaigns/tick', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile: props.profile,
            campaign_id: campaignId,
            force: true,
          }),
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
            setSendNote('That campaign did not have any deliverable contacts.')
          } else {
            setSendNote(
              `Campaign sent ${sent} message${sent === 1 ? '' : 's'}` +
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
    },
    [load, props.profile],
  )

  const deleteCampaign = useCallback(
    async (campaignId: string) => {
      setBusy(true)
      setSendNote(null)
      try {
        const res = await fetch('/api/customer/campaigns', {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile: props.profile,
            campaign_id: campaignId,
          }),
        })
        const j = (await res.json().catch(() => ({}))) as { ok: boolean }
        if (res.ok && j.ok) await load()
      } finally {
        setBusy(false)
      }
    },
    [load, props.profile],
  )

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

  const draftCampaigns = campaigns.filter((c) => c.status === 'draft').length
  const sentCampaigns = campaigns.filter((c) => c.status === 'complete').length
  const activeCampaigns = campaigns.filter(
    (c) => c.status === 'scheduled' || c.status === 'in_progress',
  ).length
  const activeAutomations = automations.filter((a) => a.status === 'active').length
  const draftAutomations = automations.filter((a) => a.status === 'draft').length

  // ── Campaign build view ─────────────────────────────────────────────────────
  if (view === 'build') {
    const selectedTemplate = templates.find((t) => t.id === pickedTemplate)
    return (
      <div className="flex flex-col gap-3 text-slate-900">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setEditingCampaign(null)
              setView('list')
            }}
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            ← Back
          </button>
          <h3 className="text-sm font-semibold">
            {editingCampaign ? 'Edit campaign' : 'New campaign'}
          </h3>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium text-slate-600">
            How do you want to reach people?
          </div>
          <div className="mt-2">
            <PillGroup
              ariaLabel="Channel"
              value={channel}
              onChange={setChannel}
              options={CHANNELS.map((c) => ({ value: c.value, label: c.label }))}
            />
          </div>
        </section>

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
                    style={
                      active ? { background: ACTIVE, borderColor: ACTIVE } : undefined
                    }
                  >
                    <div className="font-semibold">{t.name}</div>
                    <div
                      className={
                        'text-[10px] ' +
                        (active ? 'text-white/80' : 'text-slate-400')
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

        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium text-slate-600">
            Who should receive it?
          </div>
          <div className="mt-2">
            <PillGroup
              ariaLabel="Audience source"
              value={audienceMode}
              onChange={(m) => setAudienceMode(m)}
              options={[
                ...(audiences.length > 0
                  ? [{ value: 'existing' as const, label: 'Saved list' }]
                  : []),
                { value: 'filter' as const, label: 'My existing contacts' },
                { value: 'upload' as const, label: 'Upload list' },
              ]}
            />
          </div>

          {audienceMode === 'existing' && (
            <div className="mt-3 flex flex-col gap-2">
              <span className="text-xs text-slate-500">Saved list</span>
              <PillGroup
                ariaLabel="Saved list"
                value={existingAudienceId}
                onChange={setExistingAudienceId}
                options={audiences.map((a) => ({ value: a.id, label: a.name }))}
              />
            </div>
          )}

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
                <div className="text-xs">
                  <span className="text-slate-500">Last contacted</span>
                  <div className="mt-1">
                    <PillGroup
                      ariaLabel="Last contacted filter"
                      value={filterBeforeAfter}
                      onChange={(v) => setFilterBeforeAfter(v)}
                      options={[
                        { value: '' as const, label: 'No date filter' },
                        { value: 'before' as const, label: 'Before…' },
                        { value: 'after' as const, label: 'After…' },
                      ]}
                    />
                  </div>
                </div>
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
                and email. We will only message people who have a phone or email,
                and opted-out contacts are removed automatically.
              </p>
              <div className="flex items-center gap-2">
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
                  Upload CSV
                </button>
                <button
                  type="button"
                  onClick={downloadSampleCsv}
                  className="inline-flex items-center gap-1 text-xs font-medium"
                  style={{ color: PRIMARY }}
                >
                  <DownloadIcon /> Sample CSV
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
            {editingCampaign ? 'Save draft' : 'Save as draft'}
          </button>
        </div>
        <p className="text-[11px] text-slate-400">
          Draft campaigns appear on the Campaigns list. Preview, edit, send, or
          delete them from their card.
        </p>
      </div>
    )
  }

  // ── Tabbed view ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 text-slate-900">
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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Marketing</h3>
          <div className="text-[11px] text-slate-500">
            Reach your customers, automate lead follow-up, and keep saved lists
            ready.
          </div>
        </div>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <div
          role="tablist"
          aria-label="Marketing sections"
          className="flex min-w-max gap-1 rounded-lg border border-slate-200 bg-white p-1"
        >
          {MAIN_TABS.map((tab) => {
            const active = mainTab === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMainTab(tab.value)}
                className={
                  'rounded-md px-3 py-1.5 text-xs font-semibold transition ' +
                  (active
                    ? 'text-white'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900')
                }
                style={active ? { background: PRIMARY } : undefined}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {sendNote && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
          {sendNote}
        </div>
      )}

      {mainTab === 'overview' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold text-slate-600">
              Active Campaigns
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {activeCampaigns}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {draftCampaigns} draft{draftCampaigns === 1 ? '' : 's'} ·{' '}
              {sentCampaigns} sent
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={startNewCampaign}
                className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-white"
                style={{ background: PRIMARY }}
              >
                New campaign
              </button>
              <button
                type="button"
                onClick={() => setMainTab('campaigns')}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Manage campaigns
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold text-slate-600">
              Active Automations
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {activeAutomations}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {automations.length} total · {draftAutomations} draft
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setMainTab('automations')
                  resetAutomationForm()
                }}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                New automation
              </button>
              <button
                type="button"
                onClick={() => setMainTab('automations')}
                className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-white"
                style={{ background: PRIMARY }}
              >
                Manage automations
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold text-slate-600">
              Saved audience lists
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {audiences.length}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Upload CSV audiences or build lists from your CRM.
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={startUploadList}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Upload list
              </button>
              <button
                type="button"
                onClick={startNewList}
                className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-white"
                style={{ background: PRIMARY }}
              >
                New list
              </button>
            </div>
          </section>
        </div>
      )}

      {mainTab === 'campaigns' && (
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-600">
                Campaigns
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Draft, send, preview, and review campaign results.
              </div>
            </div>
            <button
              type="button"
              onClick={startNewCampaign}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: PRIMARY }}
            >
              New campaign
            </button>
          </div>
          {campaigns.length === 0 ? (
            <div className="mt-3 text-xs text-slate-500">
              No campaigns yet. Create one to reach your customers.
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-xs">
              {campaigns.map((c) => {
                const r = results[c.id]
                const open = openResults === c.id
                const previewOpen = openPreview === c.id
                const canRevise =
                  c.status === 'draft' || c.status === 'scheduled'
                const audience = audiences.find((a) => a.id === c.audience_id)
                return (
                  <li key={c.id} className="py-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-800">
                          {c.template ?? 'Campaign'}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {channelLabel(c.channel)}
                          {audience ? ` · ${audience.name}` : ''}
                        </div>
                      </div>
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
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenPreview(previewOpen ? null : c.id)
                          }
                          className="text-[11px] font-medium"
                          style={{ color: PRIMARY }}
                        >
                          {previewOpen ? 'Hide preview' : 'Preview'}
                        </button>
                        {canRevise && (
                          <button
                            type="button"
                            onClick={() => startEditCampaign(c)}
                            className="text-[11px] font-medium"
                            style={{ color: PRIMARY }}
                          >
                            Edit
                          </button>
                        )}
                        {canRevise && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void sendNow(c.id)}
                            className="rounded-md px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                            style={{ background: PRIMARY }}
                          >
                            Send now
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void toggleResults(c.id)}
                          className="text-[11px] font-medium"
                          style={{ color: PRIMARY }}
                        >
                          {open ? 'Hide results' : 'View results'}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void deleteCampaign(c.id)}
                          className="text-[11px] font-medium text-slate-400 hover:text-rose-600 disabled:opacity-40"
                        >
                          {c.status === 'complete' ? 'Archive' : 'Delete'}
                        </button>
                      </div>
                    </div>
                    {previewOpen && (
                      <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Campaign preview
                        </div>
                        <div className="mt-1 whitespace-pre-wrap text-xs text-slate-700">
                          {c.message_template}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          Audience: {audience ? audience.name : c.audience_id}
                        </div>
                      </div>
                    )}
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
        </section>
      )}

      {mainTab === 'automations' && (
        <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-600">
                Automations
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Set up automatic outreach. Each automation sends through your
                store agent and stops the moment a customer replies. Draft and
                paused automations never send.
              </p>
            </div>
            <button
              type="button"
              onClick={() => resetAutomationForm()}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: PRIMARY }}
            >
              New automation
            </button>
          </div>

          {showAutomationBuilder && (
            <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold text-slate-600">
                {editingAutomation ? 'Edit automation' : 'New automation'}
              </div>
              <label className="block text-xs">
                <span className="text-slate-500">Name</span>
                <input
                  value={aName}
                  onChange={(e) => setAName(e.target.value)}
                  placeholder="e.g. Instant SMS for new leads"
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                />
              </label>

              <div className="text-xs">
                <span className="text-slate-500">When this happens</span>
                <div className="mt-1">
                  <PillGroup
                    ariaLabel="Trigger"
                    value={aTrigger}
                    onChange={(v) => setATrigger(v)}
                    options={TRIGGERS.map((t) => ({
                      value: t.value,
                      label: t.label,
                    }))}
                  />
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {TRIGGERS.find((t) => t.value === aTrigger)?.hint}
                </div>
              </div>

              {aTrigger === 'lead_followup' && (
                <div className="text-xs">
                  <span className="text-slate-500">Wait before sending</span>
                  <div className="mt-1">
                    <PillGroup
                      ariaLabel="Wait time"
                      value={aWait}
                      onChange={(v) => setAWait(v)}
                      options={WAIT_PRESETS.map((h) => ({
                        value: h,
                        label: `${h}h`,
                      }))}
                    />
                  </div>
                </div>
              )}

              <div className="text-xs">
                <span className="text-slate-500">Send by</span>
                <div className="mt-1">
                  <PillGroup
                    ariaLabel="Channel"
                    value={aChannel}
                    onChange={(v) => setAChannel(v)}
                    options={AUTOMATION_CHANNELS}
                  />
                </div>
              </div>

              {automationAgents.length > 0 && (
                <div className="text-xs">
                  <span className="text-slate-500">From your team</span>
                  <div className="mt-1">
                    <PillGroup
                      ariaLabel="Team"
                      value={aTeam}
                      onChange={(v) => setATeam(v)}
                      options={automationAgents.map((ag) => ({
                        value: ag.team,
                        label: ag.label,
                      }))}
                    />
                  </div>
                </div>
              )}

              {automationNote && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  {automationNote}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAutomationBuilder(false)
                    setEditingAutomation(null)
                  }}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveAutomation()}
                  disabled={busy}
                  className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  style={{ background: PRIMARY }}
                >
                  {editingAutomation ? 'Save automation' : 'Save as draft'}
                </button>
              </div>
            </div>
          )}

          {automations.length === 0 ? (
            <div className="text-xs text-slate-500">
              No automations yet. Create one to follow up with leads
              automatically.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 text-xs">
              {automations.map((a) => {
                const team = automationAgents.find((ag) => ag.id === a.agent_id)
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-start justify-between gap-2 py-2"
                  >
                    <div>
                      <div className="font-semibold text-slate-800">
                        {a.name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {triggerLabel(a.trigger)}
                        {a.trigger === 'lead_followup'
                          ? ` after ${a.wait_hours}h`
                          : ''}{' '}
                        · {channelLabel(a.channel)}
                        {team ? ` · ${team.label}` : ''}
                        {a.last_triggered_at
                          ? ` · last sent ${new Date(a.last_triggered_at).toLocaleDateString()}`
                          : ''}
                      </div>
                    </div>
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
                        (a.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : a.status === 'paused'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600')
                      }
                    >
                      {a.status === 'active'
                        ? 'Active'
                        : a.status === 'paused'
                          ? 'Paused'
                          : 'Draft'}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => resetAutomationForm(a)}
                        className="text-[11px] font-medium"
                        style={{ color: PRIMARY }}
                      >
                        Edit
                      </button>
                      {a.status === 'active' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void setAutomationStatus(a, 'paused')}
                          className="text-[11px] font-medium text-amber-700 disabled:opacity-40"
                        >
                          Pause
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void setAutomationStatus(a, 'active')}
                          className="rounded-md px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                          style={{ background: PRIMARY }}
                        >
                          Activate
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void deleteAutomation(a)}
                        className="text-[11px] font-medium text-slate-400 hover:text-rose-600 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {mainTab === 'lists' && (
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-600">
                Saved audience lists
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Upload a CSV, build a list from your CRM, or save a filtered
                contact list. Opted-out contacts are removed automatically.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadSampleCsv}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <DownloadIcon /> Sample CSV
              </button>
              <button
                type="button"
                onClick={startUploadList}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Upload list
              </button>
              <button
                type="button"
                onClick={startNewList}
                className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-white"
                style={{ background: PRIMARY }}
              >
                New list
              </button>
            </div>
          </div>

          {(uploadNote || listNote) && (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
              {listNote ?? uploadNote}
            </div>
          )}

          {showListBuilder && (
            <div className="mt-3 flex flex-col gap-2 rounded-md border border-slate-100 bg-slate-50 p-3">
              <div className="text-xs font-semibold text-slate-600">
                New saved list
              </div>
              <label className="block text-xs">
                <span className="text-slate-500">List name</span>
                <input
                  value={audienceName}
                  onChange={(e) => setAudienceName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                />
              </label>
              <div className="text-xs">
                <span className="text-slate-500">Preferred channel</span>
                <div className="mt-1">
                  <PillGroup
                    ariaLabel="Preferred channel"
                    value={channel}
                    onChange={setChannel}
                    options={CHANNELS.map((c) => ({
                      value: c.value,
                      label: c.label,
                    }))}
                  />
                </div>
              </div>
              <div className="text-xs">
                <span className="text-slate-500">Last contacted</span>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <PillGroup
                    ariaLabel="Last contacted filter"
                    value={filterBeforeAfter}
                    onChange={(v) => setFilterBeforeAfter(v)}
                    options={[
                      { value: '' as const, label: 'No date filter' },
                      { value: 'before' as const, label: 'Before…' },
                      { value: 'after' as const, label: 'After…' },
                    ]}
                  />
                  {filterBeforeAfter && (
                    <input
                      type="date"
                      value={filterDate}
                      onChange={(e) => setFilterDate(e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                    />
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void runPreview()}
                  disabled={busy}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Preview list
                </button>
                <button
                  type="button"
                  onClick={() => void saveAudienceList()}
                  disabled={busy}
                  className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  style={{ background: PRIMARY }}
                >
                  Save list
                </button>
                <button
                  type="button"
                  onClick={() => void buildCrmList()}
                  disabled={busy}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Build from CRM
                </button>
              </div>
              {preview && (
                <div className="text-xs text-slate-600">
                  This list will include{' '}
                  <span className="font-semibold text-slate-900">
                    {preview.count}
                  </span>{' '}
                  {preview.count === 1 ? 'person' : 'people'}.
                </div>
              )}
            </div>
          )}

          {audiences.length === 0 ? (
            <div className="mt-3 text-xs text-slate-500">
              No saved lists yet. Upload a CSV, build from your CRM, or create a
              filtered list.
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-xs">
              {audiences.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                >
                  <span className="font-medium text-slate-800">{a.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">{describeAudience(a)}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void deleteList(a.id)}
                      className="text-[11px] font-medium text-slate-400 hover:text-rose-600 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function DownloadIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
