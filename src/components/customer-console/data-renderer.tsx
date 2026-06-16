/**
 * customer-console.data — the customer Data Store (InfoStore sub-page).
 *
 * Shows user-friendly database stats and major data categories — contacts,
 * threads, campaigns, and follow-ups. This is the Data Store view within
 * InfoStore, not the Performance dashboard (which lives in the Dashboard tab).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudioConfig } from '../../lib/studio-config'

const PRIMARY = '#2f3b4d'

type MessageStats = {
  total: number
  inbound: number
  outbound: number
  by_channel: Record<string, { inbound: number; outbound: number }>
}
type FollowupStats = {
  immediate_triggers: number
  checkin_triggers: number
  last_fire: number | null
  sends: { total: number; outbound: number; by_channel: Record<string, number> }
}
type ThreadStats = {
  total: number
  open: number
  closed: number
  by_domain: Record<string, number>
}
type CampaignStats = {
  campaigns: number
  by_status: Record<string, number>
  deliveries_sent: number
  deliveries_failed: number
}
type LeadFunnel =
  | {
      available: true
      source: 'vin-live'
      total: number
      by_status: Record<string, number>
    }
  | { available: false; source: 'vin-live' | 'none'; reason: string }

type Reports = {
  profile: string
  generated_at: number
  comms: {
    window_days: number
    messages: MessageStats
    threads: ThreadStats
    calls_in: number
    texts_out: number
  }
  followups: FollowupStats
  campaigns: CampaignStats
  lead_funnel: LeadFunnel
}

type UploadRow = {
  id: string
  ts: number
  filename: string
  classification: string
  size_bytes: number
  checksum: string
  embedded: number
}

export function CustomerDataRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [reports, setReports] = useState<Reports | null>(null)
  const [uploads, setUploads] = useState<Array<UploadRow>>([])
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadNote, setUploadNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const res = await fetch(
        `/api/customer/reports?profile=${encodeURIComponent(props.profile)}`,
        { credentials: 'include' },
      )
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        reports?: Reports
        error?: string
      }
      if (!res.ok || !j.ok || !j.reports) {
        setFailed(true)
        return
      }
      setReports(j.reports)
      const uploadRes = await fetch(
        `/api/customer/data-uploads?profile=${encodeURIComponent(props.profile)}`,
        { credentials: 'include' },
      )
      const uploadJ = (await uploadRes.json().catch(() => ({}))) as {
        ok: boolean
        uploads?: Array<UploadRow>
      }
      if (uploadRes.ok && uploadJ.ok) {
        setUploads(uploadJ.uploads ?? [])
      }
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [props.profile])

  useEffect(() => {
    void load()
  }, [load])

  const uploadFile = useCallback(
    async (file: File) => {
      setUploadBusy(true)
      setUploadNote(null)
      try {
        const contentBase64 = arrayBufferToBase64(await file.arrayBuffer())
        const res = await fetch('/api/customer/data-uploads', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile: props.profile,
            filename: file.name,
            mime_type: file.type || undefined,
            content_base64: contentBase64,
            classification: classifyForUpload(file),
          }),
        })
        const j = (await res.json().catch(() => ({}))) as {
          ok: boolean
          error?: string
          upload?: { filename: string; embedded: boolean }
          uploads?: Array<UploadRow>
        }
        if (!res.ok || !j.ok) {
          setUploadNote(j.error ?? 'We could not upload that file.')
          return
        }
        setUploads(j.uploads ?? [])
        setUploadNote(
          `${j.upload?.filename ?? file.name} uploaded${
            j.upload?.embedded ? ' and indexed for search.' : '.'
          }`,
        )
      } catch {
        setUploadNote('We could not upload that file.')
      } finally {
        setUploadBusy(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    },
    [props.profile],
  )

  if (loading && !reports) {
    return (
      <div className="p-4 text-sm text-slate-500">Loading your dashboard…</div>
    )
  }
  if (failed && !reports) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        We couldn’t load your dashboard just now.
        <button
          type="button"
          onClick={() => void load()}
          className="ml-3 font-medium underline hover:brightness-90"
          style={{ color: PRIMARY }}
        >
          Try again
        </button>
      </div>
    )
  }
  if (!reports) return null

  const { comms, followups, campaigns } = reports
  const embeddedUploads = uploads.filter((u) => u.embedded).length

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Data Store</h2>
          <p className="text-xs text-slate-500">
            Database snapshots and major data categories.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {/* Major data categories — database stats, not dashboard metrics */}
      <div className="grid gap-4 sm:grid-cols-2">
        <DataCategory
          title="Contacts"
          detail="Customer phone numbers, emails, and display names stored across all conversations."
          note="Contacts are created automatically when leads come in or conversations start."
        />
        <DataCategory
          title="Threads"
          detail={`${comms.threads.total} total conversations (${comms.threads.open} open, ${comms.threads.closed} closed).`}
          note="Each thread tracks one customer conversation across all channels."
        />
        <DataCategory
          title="Campaigns"
          detail={`${campaigns.campaigns} campaigns with ${campaigns.deliveries_sent} delivered messages.`}
          note="Outbound campaigns you've scheduled for service reminders or follow-ups."
        />
        <DataCategory
          title="Follow-ups"
          detail={`${followups.immediate_triggers + followups.checkin_triggers} triggers set up.`}
          note="Automated follow-up rules that send texts after a conversation starts or when a lead comes in."
        />
        <DataCategory
          title="Uploaded reports"
          detail={`${uploads.length} file${uploads.length === 1 ? '' : 's'} in the Data Store.`}
          note={`${embeddedUploads} indexed for search from text-readable content.`}
        />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Data uploads
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Upload reports, exports, and reference files into the Data Store.
              Text-readable files are indexed for search when possible.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".csv,.tsv,.txt,.md,.json,.xml,.yaml,.yml,.pdf,.xls,.xlsx"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0]
                if (file) void uploadFile(file)
              }}
            />
            <button
              type="button"
              disabled={uploadBusy}
              onClick={() => fileRef.current?.click()}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
              style={{ background: PRIMARY }}
            >
              {uploadBusy ? 'Uploading…' : 'Upload data'}
            </button>
          </div>
        </div>
        {uploadNote && (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {uploadNote}
          </div>
        )}
        <div className="mt-4 overflow-hidden rounded-md border border-slate-100">
          {uploads.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500">
              No uploaded reports yet.
            </div>
          ) : (
            uploads.slice(0, 8).map((upload) => (
              <div
                key={upload.id}
                className="grid gap-2 border-b border-slate-100 px-3 py-2 text-xs last:border-0 sm:grid-cols-[minmax(0,1fr)_120px_100px_130px]"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800">
                    {upload.filename}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {new Date(upload.ts).toLocaleString()}
                  </div>
                </div>
                <div className="capitalize text-slate-600">
                  {upload.classification}
                </div>
                <div className="text-slate-500">
                  {formatBytes(upload.size_bytes)}
                </div>
                <div className="text-slate-500">
                  {upload.embedded ? 'Search indexed' : 'Stored'}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
        <p>
          The Data Store shows what&apos;s in your database — not live activity
          or performance metrics. For dashboards, charts, and real-time
          activity, use the <strong>Dashboard</strong> tab.
        </p>
      </div>
    </div>
  )
}

function classifyForUpload(file: File): 'document' | 'data' | undefined {
  const name = file.name.toLowerCase()
  if (/\.(csv|tsv|json|xml|ya?ml|xls|xlsx)$/.test(name)) return 'data'
  if (file.type.startsWith('text/') || /\.(txt|md)$/.test(name)) return 'document'
  return undefined
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function DataCategory({
  title,
  detail,
  note,
}: {
  title: string
  detail: string
  note: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{detail}</p>
      <p className="mt-2 text-xs text-slate-500">{note}</p>
    </div>
  )
}
