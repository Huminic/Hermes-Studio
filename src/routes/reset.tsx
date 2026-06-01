import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

/**
 * /reset?token=<hex> — password reset page.
 *
 * Closes CZ-005 + paired with CZ-004 (POST /api/auth/reset-request).
 *
 * Renders the new-password form when ?token= is present. Submits to
 * /api/auth/reset-confirm. On success, points the user at the portal login.
 */

type ConfirmResponse =
  | { ok: true; profile: string; username: string }
  | { ok: false; error: string }

async function postConfirm(
  token: string,
  newPassword: string,
): Promise<ConfirmResponse> {
  const res = await fetch('/api/auth/reset-confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  })
  return (await res.json()) as ConfirmResponse
}

function ResetPage() {
  const [search, setSearch] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.location.search
  })
  const token = new URLSearchParams(search).get('token')?.trim() ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<null | { profile: string; username: string }>(
    null,
  )

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (!token) {
      setError('Missing or expired token.')
      return
    }
    setBusy(true)
    try {
      const r = await postConfirm(token, newPassword)
      if (!r.ok) {
        const map: Record<string, string> = {
          invalid: 'This reset link is invalid.',
          expired: 'This reset link has expired. Request a new one.',
          used: 'This reset link has already been used.',
          'weak-password': 'Password must be at least 8 characters.',
        }
        setError(map[r.error] ?? r.error ?? 'Reset failed.')
        return
      }
      setDone({ profile: r.profile, username: r.username })
      setNotice('Password updated. You can now sign in.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0a0f1c] p-4 text-slate-100">
        <div className="w-full max-w-sm rounded-lg border border-white/10 bg-white/5 p-6 shadow-xl">
          <h1 className="text-xl font-semibold">Reset link missing</h1>
          <p className="mt-2 text-sm opacity-70">
            This page expects a <code>?token=…</code> query parameter from the
            reset email. If you got here without clicking a reset link,{' '}
            <a className="underline" href="/">go back to the portal login</a> and
            click "Forgot password?".
          </p>
        </div>
      </div>
    )
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
            reset password
          </span>
        </div>
        <p className="text-xs opacity-60">
          Choose a new password for your account.
        </p>
        <label className="flex flex-col gap-1 text-xs">
          <span className="opacity-60">New password</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
            disabled={!!done}
            className="rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
            required
            minLength={8}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="opacity-60">Confirm new password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            disabled={!!done}
            className="rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
            required
            minLength={8}
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
        {!done && (
          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {busy ? 'Updating…' : 'Update password'}
          </button>
        )}
        {done && (
          <a
            href={`/p/${encodeURIComponent(done.profile)}/chat`}
            className="mt-1 rounded bg-indigo-500 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-indigo-400"
          >
            Continue to sign in
          </a>
        )}
      </form>
    </div>
  )
}

export const Route = createFileRoute('/reset')({
  component: ResetPage,
})
