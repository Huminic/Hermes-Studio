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
          window.location.href = `/p/${encodeURIComponent(data.profile)}/chat`
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white px-8 py-10 shadow-2xl shadow-black/40 ring-1 ring-black/10">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <div className="flex items-center gap-2.5">
              <svg
                width="32"
                height="32"
                viewBox="0 0 100 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-blue-600"
              >
                <path
                  d="M50 10 L90 30 L90 70 L50 90 L10 70 L10 30 Z"
                  fill="currentColor"
                  opacity="0.18"
                />
                <path
                  d="M50 25 L75 38 L75 62 L50 75 L25 62 L25 38 Z"
                  fill="currentColor"
                  opacity="0.4"
                />
                <circle cx="50" cy="50" r="15" fill="currentColor" />
              </svg>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Huminic Studio
              </h1>
            </div>
          </div>

          {/* Title */}
          <h2 className="mb-2 text-center text-lg font-semibold text-slate-900">
            {profileAuthMode === true ? 'Sign in' : 'Enter Password'}
          </h2>
          <p className="mb-6 text-center text-sm text-slate-500">
            {profileAuthMode === true
              ? 'Sign in with your profile credentials'
              : 'This workspace is password-protected'}
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {profileAuthMode === true && (
              <div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  autoComplete="username"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  disabled={loading}
                  autoFocus
                />
              </div>
            )}
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                disabled={loading}
                autoFocus={profileAuthMode !== true}
              />
            </div>

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
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:opacity-100"
            >
              {loading ? 'Authenticating...' : 'Continue'}
            </button>
          </form>
        </div>

        {/* Footer — WF-001: neutral, Huminic-owned, unlinked (no third-party
            repo link on the public pre-auth login surface). */}
        <p className="mt-6 text-center text-xs text-slate-400">
          Powered by Huminic
        </p>
      </div>
    </div>
  )
}
