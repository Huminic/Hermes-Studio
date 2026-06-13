import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Analytics01Icon,
  Chart01Icon,
  GridIcon,
  InboxIcon,
  LibraryIcon,
  Logout03Icon,
  Megaphone01Icon,
  Notification03Icon,
  Robot01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
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
  dashboard: 'customer-console.performance',
  comms: 'customer-console.comms',
  campaigns: 'customer-console.campaigns',
  notifications: 'customer-console.notifications',
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
  scope_profiles?: string[]
}

type LoginResponse = {
  ok: boolean
  profile?: string
  username?: string
  is_admin?: boolean
  is_customer_admin?: boolean
  scope_profiles?: string[]
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

async function postLogout(): Promise<{ ok: boolean }> {
  const res = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as { ok: boolean }
}

function StorefrontTabRoute() {
  const { profile, tab } = Route.useParams()
  const queryClient = useQueryClient()
  const router = useRouter()

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

  const logoutMutation = useMutation({
    mutationFn: postLogout,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['auth-session'] })
      router.invalidate()
      if (typeof window !== 'undefined') {
        window.location.href = `/p/${encodeURIComponent(profile)}`
      }
    },
  })

  // Gate: customer-admin matching THIS profile, OR scoped partner admin with this profile in scope, OR Studio admin (super-user).
  const allowed =
    !!session?.authenticated &&
    (session.is_admin === true ||
      (session.is_customer_admin === true && session.profile === profile) ||
      (session.scope_profiles && session.scope_profiles.includes(profile)))

  if (authQuery.isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-white text-sm text-slate-500">
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
      <div className="m-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Unknown tab: <code>{tab}</code>. Expected one of:{' '}
        {Object.keys(TAB_TO_RENDERER).join(', ')}.
      </div>
    )
  }

  const Renderer = getRenderer(rendererKey)
  const AssistantRenderer = getRenderer('customer-console.assistant-pane')
  if (!Renderer) {
    return (
      <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
        Renderer not found: <code>{rendererKey}</code>
      </div>
    )
  }

  // Nexxus brand/active-nav accent (purple-500). Primary blue is #3b82f6.
  const NAV_ACCENT = '#8b5cf6'

  // Nexxus-style icon sidebar items. Each label sits below its line icon.
  // `id` is the internal route param (unchanged); `label` is display text.
  const tabsList: Array<{
    id: string
    label: string
    icon: IconSvgElement
  }> = [
    { id: 'chat', label: 'Agents', icon: Robot01Icon },
    { id: 'knowledge', label: 'Knowledge', icon: LibraryIcon },
    { id: 'tools', label: 'StoreFront', icon: GridIcon },
    { id: 'data', label: 'Data', icon: Analytics01Icon },
    { id: 'dashboard', label: 'Dashboard', icon: Chart01Icon },
    { id: 'comms', label: 'Teambox', icon: InboxIcon },
    { id: 'campaigns', label: 'Campaigns', icon: Megaphone01Icon },
    { id: 'notifications', label: 'Notifications', icon: Notification03Icon },
  ]

  return (
    <div className="flex min-h-dvh bg-white font-sans text-slate-900">
      <aside className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-slate-50 py-3">
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
                'group relative flex w-full flex-col items-center gap-1 px-1 py-2.5 text-[10px] transition-colors ' +
                (active
                  ? 'font-medium text-slate-900'
                  : 'text-slate-500 hover:text-slate-900') +
                (enabled ? '' : ' pointer-events-none opacity-40')
              }
              title={item.label}
              style={active ? { color: NAV_ACCENT } : undefined}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1.5 h-8 w-0.5 rounded-r-full"
                  style={{ background: NAV_ACCENT }}
                />
              )}
              <HugeiconsIcon
                icon={item.icon}
                size={22}
                strokeWidth={1.8}
                color={active ? NAV_ACCENT : 'currentColor'}
              />
              <span className="leading-tight">{item.label}</span>
            </Link>
          )
        })}
        <div className="mt-auto flex w-full border-t border-slate-200 pt-2">
          <button
            type="button"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="group relative flex w-full flex-col items-center gap-1 px-1 py-2.5 text-[10px] text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-50"
            title="Log out"
            aria-label="Log out"
          >
            <HugeiconsIcon
              icon={Logout03Icon}
              size={22}
              strokeWidth={1.8}
              color="currentColor"
            />
            <span className="leading-tight">Log out</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-slate-900">
              {config.branding.persona_name}
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-sm text-slate-500">Workspace</span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-row">
          <main className="flex-1 overflow-y-auto px-4 py-4">
            <Renderer profile={profile} config={config} params={{ tab }} />
          </main>
          {AssistantRenderer && (
            <aside className="hidden w-72 shrink-0 border-l border-slate-200 bg-slate-50 p-3 lg:block">
              <AssistantRenderer
                profile={profile}
                config={config}
                params={{}}
              />
            </aside>
          )}
        </div>

        <footer className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] text-slate-500">
          Powered by Huminic
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
      // Verify the session is scoped to THIS profile (or is Studio admin or scoped partner admin).
      const isAdmin = data.is_admin === true
      const isScopedPartner =
        data.scope_profiles && data.scope_profiles.includes(profile)
      const matchesProfile =
        data.is_customer_admin === true && data.profile === profile
      if (!isAdmin && !matchesProfile && !isScopedPartner) {
        setError(
          "This login isn't authorized for this store. Please use the login for this store.",
        )
        return
      }
      await queryClient.invalidateQueries({ queryKey: ['auth-session'] })
      // No navigate needed — the gate now passes and the route renders the
      // tab content on next render.
      router.invalidate()
    },
    onError: () => {
      setError('We couldn’t sign you in just now. Please try again.')
    },
  })

  const PRIMARY = '#3b82f6'

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white p-4 font-sans text-slate-900">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          loginMutation.mutate()
        }}
        className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-6 shadow-sm"
      >
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold text-slate-900">
            {config.branding.persona_name}
          </h1>
          <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
            {profile}
          </span>
        </div>
        <div className="text-xs text-slate-500">
          Customer admin sign-in for this storefront.
        </div>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            required
          />
        </label>
        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-600">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="mt-1 rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: PRIMARY }}
        >
          {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
        </button>
        <Link
          to="/p/$profile"
          params={{ profile }}
          className="text-center text-xs text-slate-400 hover:text-slate-600"
        >
          ← back to landing
        </Link>
      </form>
    </div>
  )
}
