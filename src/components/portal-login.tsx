import { useState } from 'react'

type LoginResponse = {
  ok: boolean
  profile?: string
  username?: string
  is_admin?: boolean
  is_customer_admin?: boolean
  error?: string
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

async function postResetRequest(email: string): Promise<{ ok: boolean }> {
  const res = await fetch('/api/auth/reset-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  return (await res.json()) as { ok: boolean }
}

export function PortalLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const data = await postLogin(username, password)
      if (!data.ok) {
        setError(data.error ?? 'Invalid credentials')
        return
      }
      if (data.is_customer_admin === true && data.profile) {
        window.location.href = `/p/${encodeURIComponent(data.profile)}/chat`
        return
      }
      if (data.is_admin === true) {
        setError(
          'This account is for staff. Visit studio.huminic.app to sign in.',
        )
        return
      }
      setError('Account is not authorized for any storefront.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function onForgot() {
    setError(null)
    setNotice(null)
    if (!username) {
      setError('Enter your email above first.')
      return
    }
    setBusy(true)
    try {
      await postResetRequest(username)
      setResetSent(true)
      setNotice(
        `If an account exists for ${username}, a reset link has been sent.`,
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0a0f1c] p-4 text-slate-100">
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-6 shadow-xl"
      >
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Huminic</h1>
          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide">
            portal
          </span>
        </div>
        <div className="text-xs opacity-60">
          Sign in to access your store dashboard.
        </div>
        <label className="flex flex-col gap-1 text-xs">
          <span className="opacity-60">Email</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            inputMode="email"
            className="rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="opacity-60">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
            required
          />
        </label>
        {error && (
          <div className="rounded border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded border border-emerald-400/30 bg-emerald-500/10 p-2 text-xs text-emerald-300">
            {notice}
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <button
          type="button"
          onClick={onForgot}
          disabled={busy || resetSent}
          className="text-center text-xs opacity-60 hover:opacity-100 disabled:opacity-30"
        >
          {resetSent ? 'Reset link sent' : 'Forgot password?'}
        </button>
      </form>
    </div>
  )
}
