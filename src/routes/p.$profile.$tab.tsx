import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  defaultStudioConfig,
  type StudioConfig,
} from '@/lib/studio-config'
import { getRenderer } from '@/lib/console-renderers'

export const Route = createFileRoute('/p/$profile/$tab')({
  component: StorefrontTabRoute,
})

const TAB_TO_RENDERER: Record<string, string> = {
  chat: 'customer-console.chat',
  knowledge: 'customer-console.knowledge',
  tools: 'customer-console.tools',
  data: 'customer-console.data',
  comms: 'customer-console.comms',
  campaigns: 'customer-console.campaigns',
}

type StudioConfigResponse = {
  config: StudioConfig
  source: 'file' | 'default'
}

type AuthSession = {
  authenticated: boolean
  profile_auth_mode: boolean
  profile?: string | null
  username?: string | null
  is_admin?: boolean
  is_customer_admin?: boolean
}

type LoginResponse = {
  ok: boolean
  profile?: string
  username?: string
  is_admin?: boolean
  is_customer_admin?: boolean
  error?: string
}

async function fetchStudioConfig(
  profile: string,
): Promise<StudioConfigResponse> {
  const res = await fetch(
    `/api/studio-config?profile=${encodeURIComponent(profile)}`,
    { credentials: 'include' },
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as StudioConfigResponse
}

async function fetchAuthSession(): Promise<AuthSession> {
  const res = await fetch('/api/auth-session', { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as AuthSession
}

async function postLogin(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const res = await fetch('/api/auth', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return (await res.json()) as LoginResponse
}

function StorefrontTabRoute() {
  const { profile, tab } = Route.useParams()

  const configQuery = useQuery({
    queryKey: ['studio-config', profile],
    queryFn: () => fetchStudioConfig(profile),
    staleTime: 60_000,
  })
  const authQuery = useQuery({
    queryKey: ['auth-session'],
    queryFn: fetchAuthSession,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  })

  const config = configQuery.data?.config ?? defaultStudioConfig(profile)
  const session = authQuery.data

  // Gate: customer-admin matching THIS profile, OR Studio admin (super-user).
  const allowed =
    !!session?.authenticated &&
    (session.is_admin === true ||
      (session.is_customer_admin === true && session.profile === profile))

  if (authQuery.isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm opacity-60">
        Loading…
      </div>
    )
  }

  if (!allowed) {
    return <CustomerLogin profile={profile} config={config} />
  }

  const rendererKey = TAB_TO_RENDERER[tab]
  if (!rendererKey) {
    return (
      <div className="m-6 rounded border border-amber-300/30 bg-amber-400/5 p-4 text-sm">
        Unknown tab: <code>{tab}</code>. Expected one of:{' '}
        {Object.keys(TAB_TO_RENDERER).join(', ')}.
      </div>
    )
  }

  const Renderer = getRenderer(rendererKey)
  const AssistantRenderer = getRenderer('customer-console.assistant-pane')
  if (!Renderer) {
    return (
      <div className="m-6 rounded border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-300">
        Renderer not found: <code>{rendererKey}</code>
      </div>
    )
  }

  const accent = config.branding.accent_color ?? '#1e40af'

  // Nexxus-style icon sidebar items. Each label sits below its glyph.
  const tabsList: Array<{ id: string; label: string; glyph: string }> = [
    { id: 'chat', label: 'Chat', glyph: '💬' },
    { id: 'knowledge', label: 'Knowledge', glyph: '📚' },
    { id: 'tools', label: 'Tools', glyph: '🛠️' },
    { id: 'data', label: 'Data', glyph: '📊' },
    { id: 'comms', label: 'Comms', glyph: '📥' },
    { id: 'campaigns', label: 'Campaigns', glyph: '📣' },
  ]

  const initial = config.branding.persona_name.slice(0, 1).toUpperCase()

  return (
    <div className="flex min-h-dvh bg-[#0a0f1c] text-slate-100">
      <aside className="flex w-[88px] shrink-0 flex-col items-center gap-1 border-r border-white/10 bg-[#080c14] py-3">
        <Link
          to="/p/$profile"
          params={{ profile }}
          className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold text-white"
          style={{ background: accent }}
          title={config.branding.persona_name}
        >
          {initial}
        </Link>
        <div className="my-2 h-px w-8 bg-white/10" />
        {tabsList.map((item) => {
          const enabled =
            config.menu[item.id as keyof StudioConfig['menu']] ?? true
          const active = item.id === tab
          return (
            <Link
              key={item.id}
              to="/p/$profile/$tab"
              params={{ profile, tab: item.id }}
              disabled={!enabled}
              className={
                'group relative flex w-full flex-col items-center gap-0.5 px-1 py-2 text-[10px] transition-colors ' +
                (active
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-100') +
                (enabled ? '' : ' pointer-events-none opacity-30')
              }
              title={item.label}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1 h-10 w-1 rounded-r"
                  style={{ background: accent }}
                />
              )}
              <span className="text-lg leading-none">{item.glyph}</span>
              <span className="leading-tight">{item.label}</span>
            </Link>
          )
        })}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/10 bg-[#0d1424] px-4 py-2">
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded text-xs font-semibold text-white"
              style={{ background: accent }}
            >
              {initial}
            </div>
            <div>
              <div className="text-sm font-semibold">
                {config.branding.persona_name}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">
                {profile} · {tab}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">
              {session?.username ?? 'guest'}
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-[10px] uppercase"
              style={{ background: `${accent}33`, color: '#fff' }}
            >
              {session?.is_admin
                ? 'studio admin'
                : session?.is_customer_admin
                  ? 'customer admin'
                  : 'guest'}
            </span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-row">
          <main className="flex-1 overflow-y-auto px-4 py-4">
            <Renderer profile={profile} config={config} params={{ tab }} />
          </main>
          {AssistantRenderer && (
            <aside className="hidden w-72 shrink-0 border-l border-white/10 bg-[#0d1424] p-3 lg:block">
              <AssistantRenderer
                profile={profile}
                config={config}
                params={{}}
              />
            </aside>
          )}
        </div>

        <footer className="border-t border-white/10 bg-[#080c14] px-4 py-2 text-[10px] text-slate-500">
          Powered by Huminic · brand chip {accent}
        </footer>
      </div>
    </div>
  )
}

function CustomerLogin({
  profile,
  config,
}: {
  profile: string
  config: StudioConfig
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const router = useRouter()

  const loginMutation = useMutation({
    mutationFn: () => postLogin(username, password),
    onSuccess: async (data) => {
      if (!data.ok) {
        setError(data.error ?? 'Invalid credentials')
        return
      }
      // Verify the session is scoped to THIS profile (or is Studio admin).
      const isAdmin = data.is_admin === true
      const matchesProfile =
        data.is_customer_admin === true && data.profile === profile
      if (!isAdmin && !matchesProfile) {
        setError(
          `Account is not authorized for ${profile}. Sign in with a customer-admin for this profile.`,
        )
        return
      }
      await queryClient.invalidateQueries({ queryKey: ['auth-session'] })
      // No navigate needed — the gate now passes and the route renders the
      // tab content on next render.
      router.invalidate()
    },
    onError: (err) => {
      setError((err as Error).message)
    },
  })

  const accent = config.branding.accent_color ?? '#1e40af'

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          loginMutation.mutate()
        }}
        className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-6"
        style={{ borderColor: accent }}
      >
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold">
            {config.branding.persona_name}
          </h1>
          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide">
            {profile}
          </span>
        </div>
        <div className="text-xs opacity-60">
          Customer admin sign-in for this storefront.
        </div>
        <label className="flex flex-col gap-1 text-xs">
          <span className="opacity-60">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            className="rounded border border-white/10 bg-black/20 px-2 py-1.5 text-sm"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="opacity-60">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-white/10 bg-black/20 px-2 py-1.5 text-sm"
            required
          />
        </label>
        {error && (
          <div className="rounded border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-300">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="mt-1 rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          style={{ background: accent, color: '#fff' }}
        >
          {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
        </button>
        <Link
          to="/p/$profile"
          params={{ profile }}
          className="text-center text-xs opacity-50 hover:opacity-100"
        >
          ← back to landing
        </Link>
      </form>
    </div>
  )
}
