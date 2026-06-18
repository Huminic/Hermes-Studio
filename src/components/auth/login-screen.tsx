import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

export function LoginScreen() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [profileAuthMode, setProfileAuthMode] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Dismiss the boot splash overlay the moment the login renders, so it doesn't
  // linger on top of (and wash out) the login card during hydration
  // (GAP-AUTH-HYDRATION-SPLASH-001).
  useEffect(() => {
    if (typeof window !== 'undefined') window.__dismissSplash?.()
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth-session', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setProfileAuthMode(Boolean(d?.profile_auth_mode))
      })
      .catch(() => {
        if (cancelled) return
        setProfileAuthMode(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const body =
        profileAuthMode === true
          ? { username, password }
          : { password }
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (data.ok) {
        // LC-BLOCKER-006: a Workspace (customer-admin, non-admin) login at the
        // Global Studio gateway goes to its own /p/<profile>/* console, not the
        // operator backend. Scoped partner admins and super-admins reload into
        // Global Studio.
        if (
          data.is_customer_admin === true &&
          data.is_admin !== true &&
          !data.scope_profiles &&
          data.profile
        ) {
          // Single-store customer admin: route to their store
          window.location.href = `/p/${encodeURIComponent(data.profile)}/dashboard`
        } else {
          // Super-admin or scoped partner admin: reload to Global Studio
          window.location.reload()
        }
      } else {
        setError(data.error || 'Invalid credentials')
        setLoading(false)
      }
    } catch (err) {
      setError('Authentication failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-950 font-sans text-slate-900 md:bg-slate-50">
      <section className="flex w-full flex-col md:min-h-screen md:flex-row">
        <div className="flex min-h-64 flex-col justify-between bg-[#2f3b4d] px-6 py-7 text-white md:w-[46%] md:px-10 md:py-10 lg:px-14">
          <div aria-hidden className="h-11" />

          <div className="mt-12 max-w-md md:mt-0">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
              Operator access
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-5xl">
              Huminic Studio
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Manage profiles, agents, workflows, launch operations, and
              Workspace configuration from one secure Studio.
            </p>
          </div>

          <div className="mt-10 text-xs text-slate-500">
            Powered by Huminic
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center bg-white px-6 py-10 md:px-10">
          <div className="w-full max-w-md">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
              Sign in
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {profileAuthMode === true
                ? 'Sign in with your Studio profile credentials.'
                : 'Enter your Studio password to continue.'}
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              {profileAuthMode === true && (
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  <span>Username</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="username"
                    className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-950 placeholder-slate-400 outline-none transition focus:border-slate-700 focus:ring-4 focus:ring-slate-700/15"
                    disabled={loading}
                    autoFocus
                  />
                </label>
              )}
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-950 placeholder-slate-400 outline-none transition focus:border-slate-700 focus:ring-4 focus:ring-slate-700/15"
                  disabled={loading}
                  autoFocus={profileAuthMode !== true}
                />
              </label>

              {error && (
                <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  loading ||
                  !password ||
                  (profileAuthMode === true && !username) ||
                  profileAuthMode === null
                }
                className="h-12 w-full rounded-lg bg-[#2f3b4d] px-4 text-base font-semibold text-white transition hover:brightness-95 focus:outline-none focus:ring-4 focus:ring-slate-700/25 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:opacity-100"
              >
                {loading ? 'Authenticating...' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  )
}
