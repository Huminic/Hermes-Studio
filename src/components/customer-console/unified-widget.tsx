/**
 * Unified storefront widget — the floating circle launcher + dropdown menu on the
 * public `/p/<profile>` page. Ported 1:1 from the Nexxus "Choose how to connect"
 * widget (teal #0d9488 header, four tinted option rows). One launcher fans out to:
 *
 *   - Web Chat          → opens the live chat widget (`/w/<chat_slug>`) in-panel
 *   - Instant Call Back → in-panel name+phone form → /api/public/callback-request
 *   - Contact Form      → opens the live form widget (`/w/<form_slug>`) in-panel
 *   - Two-Way Video     → /api/public/video-session mints a Tavus session, then a
 *                         fullscreen iframe (camera/mic). No vendor name shown.
 *
 * Self-contained (React + Tailwind only). Display config comes from the PUBLIC
 * subset of studio.yaml's `unified_widget`; the Tavus persona is resolved
 * server-side, so no vendor identifiers ever reach the browser.
 */
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import type { UnifiedWidgetPublic } from '@/lib/studio-config'

type Props = {
  profile: string
  /** Store display name shown in the header (branding.persona_name). */
  personaName: string
  unified: UnifiedWidgetPublic
}

type PanelView = 'menu' | 'chat' | 'form' | 'callback'

// Inline lucide paths captured from the live widget so the icons match exactly
// without taking an icon-library dependency.
function IconChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
function IconPhone() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}
function IconSend() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </svg>
  )
}
function IconVideo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  )
}
function IconChatSmall() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-white">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
function IconX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}
function IconBack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  )
}

type OptionKey = 'chat' | 'callback' | 'form' | 'video'
type Option = {
  key: OptionKey
  label: string
  sub: string
  icon: () => ReactElement
  iconBg: string
  iconColor: string
  testid: string
}

export function UnifiedWidget({ profile, personaName, unified }: Props) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<PanelView>('menu')

  if (unified.enabled === false) return null

  const accent = unified.accent ?? '#0d9488'
  const channels = unified.channels ?? {}
  const chatSlug = unified.chat_slug ?? `${profile}-sales-chat`
  const formSlug = unified.form_slug ?? `${profile}-contact`
  const videoName = unified.video_agent_name ?? 'our team'

  const allOptions: Array<Option> = [
    { key: 'chat', label: 'Web Chat', sub: 'Chat with our AI assistant', icon: IconChat, iconBg: 'bg-blue-50', iconColor: 'text-blue-600', testid: 'widget-option-chat' },
    { key: 'callback', label: 'Instant Call Back', sub: 'Get a call back now', icon: IconPhone, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', testid: 'widget-option-callback' },
    { key: 'form', label: 'Contact Form', sub: 'Send us a message', icon: IconSend, iconBg: 'bg-orange-50', iconColor: 'text-orange-600', testid: 'widget-option-form' },
    { key: 'video', label: 'Two-Way Video', sub: `Face-to-face with ${videoName}`, icon: IconVideo, iconBg: 'bg-purple-50', iconColor: 'text-purple-600', testid: 'widget-option-video' },
  ]
  const options = allOptions.filter((o) => channels[o.key] !== false)

  function startVideo() {
    // Tavus opens in its OWN window/tab — never an iframe (cross-origin
    // camera/mic + framing rules make embedding unreliable). Open synchronously
    // on the click so it is not popup-blocked, then navigate it once the room
    // URL is minted.
    const win = window.open('', '_blank')
    if (win) {
      try {
        win.document.write(
          '<!doctype html><meta charset="utf-8"><title>Connecting…</title><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;color:#374151">Connecting to video chat…</body>',
        )
        win.document.close()
      } catch {
        /* ignore */
      }
    }
    fetch('/api/public/video-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
    })
      .then((r) => r.json())
      .then((data: { ok?: boolean; conversationUrl?: string }) => {
        if (data?.ok && data.conversationUrl) {
          if (win) win.location.href = data.conversationUrl
          else window.open(data.conversationUrl, '_blank', 'noopener')
        } else {
          videoFail(win)
        }
      })
      .catch(() => videoFail(win))
  }

  function videoFail(win: Window | null) {
    if (!win) return
    try {
      win.document.body.innerHTML =
        '<div style="text-align:center;padding:40px;font-family:system-ui,-apple-system,sans-serif;color:#374151">Video chat is temporarily unavailable. Please try Web Chat instead.</div>'
    } catch {
      try {
        win.close()
      } catch {
        /* ignore */
      }
    }
  }

  function choose(key: OptionKey) {
    if (key === 'video') {
      setOpen(false)
      void startVideo()
      return
    }
    setView(key)
  }

  return (
    <>
      {/* Two-Way Video opens Tavus in its own browser window (see startVideo) —
          no in-page iframe overlay. */}

      {/* Dropdown panel */}
      {open && (
        <div
          className="fixed bottom-20 right-6 z-50 w-80 max-w-[calc(100vw-2rem)]"
          data-testid="widget-menu"
        >
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 text-white" style={{ backgroundColor: accent }}>
              <div className="flex items-center gap-2">
                {view === 'menu' ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                    <IconChatSmall />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setView('menu')}
                    className="text-white/80 hover:text-white"
                    data-testid="widget-back"
                    aria-label="Back"
                  >
                    <IconBack />
                  </button>
                )}
                <div>
                  <p className="text-sm font-semibold">{personaName}</p>
                  <p className="text-xs text-white/70">
                    {view === 'menu' ? (unified.subtitle ?? 'Choose how to connect') : labelFor(view)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-white/70 hover:text-white"
                data-testid="widget-close"
                aria-label="Close"
              >
                <IconX />
              </button>
            </div>

            {/* Body */}
            {view === 'menu' && (
              <div className="space-y-2 p-3">
                {options.map((o) => {
                  const Icon = o.icon
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => choose(o.key)}
                      className="flex w-full items-center gap-3 rounded-xl border border-gray-100 p-3 text-left transition-colors hover:bg-gray-50"
                      data-testid={o.testid}
                    >
                      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${o.iconBg}`}>
                        <span className={o.iconColor}>
                          <Icon />
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{o.label}</p>
                        <p className="text-xs text-gray-500">{o.sub}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {view === 'chat' && (
              <iframe title="Web chat" src={`/w/${chatSlug}`} className="h-[520px] w-full border-0" />
            )}
            {view === 'form' && (
              <iframe title="Contact form" src={`/w/${formSlug}`} className="h-[520px] w-full border-0" />
            )}
            {view === 'callback' && (
              <CallbackForm profile={profile} accent={accent} />
            )}
          </div>
        </div>
      )}

      {/* Launcher */}
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          if (!open) setView('menu')
        }}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105"
        style={{ backgroundColor: accent }}
        data-testid="widget-launcher"
        aria-label={open ? 'Close menu' : 'Choose how to connect'}
      >
        {open ? <IconX /> : <IconChatSmall />}
      </button>
    </>
  )
}

function labelFor(view: PanelView): string {
  switch (view) {
    case 'chat':
      return 'Web Chat'
    case 'form':
      return 'Contact Form'
    case 'callback':
      return 'Instant Call Back'
    default:
      return 'Choose how to connect'
  }
}

function CallbackForm({ profile, accent }: { profile: string; accent: string }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!phone.trim()) return
    setStatus('sending')
    try {
      const res = await fetch('/api/public/callback-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, name, phone, message }),
      })
      setStatus(res.ok ? 'done' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="p-6 text-center" data-testid="widget-callback-done">
        <p className="text-sm font-medium text-gray-900">You're all set.</p>
        <p className="mt-1 text-xs text-gray-500">We'll call you back shortly.</p>
      </div>
    )
  }

  return (
    <form className="space-y-3 p-4" onSubmit={submit} data-testid="widget-callback-form">
      <p className="text-xs text-gray-500">Leave your number and we'll call you right back.</p>
      <input
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
        placeholder="Phone number"
        value={phone}
        required
        onChange={(e) => setPhone(e.target.value)}
      />
      <textarea
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
        placeholder="What can we help with? (optional)"
        rows={2}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      {status === 'error' && (
        <p className="text-xs text-red-600">Something went wrong — please try again.</p>
      )}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: accent }}
      >
        {status === 'sending' ? 'Sending…' : 'Request call back'}
      </button>
    </form>
  )
}
