/**
 * Notifications page (#207) — the alert routing matrix.
 *
 * Each rule maps a CONDITION to a recipient on a channel. Conditions are either
 * built-in lead/inbound events OR free-form Guardian/query conditions (Business
 * Guardian #208, Performance Guardian #209) — "when X happens, alert who, how".
 * Lead/inbound conditions route live today; Guardian conditions plug into the
 * same matrix as those producers come online.
 */
import { useEffect, useState } from 'react'
import type { StudioConfig } from '../../lib/studio-config'
import { selectClass, selectChevronStyle } from './console-ui'

type Channel = 'email' | 'sms'
type Template = 'email' | 'adf-xml'
type Rule = {
  event: string
  to: string
  channel: Channel
  /** Per-notification template. undefined → store default (lead_format). */
  format?: Template
  label?: string
  enabled: boolean
}

const KNOWN_LABELS: Record<string, string> = {
  new_lead: 'New lead (generic / email)',
  inbound_sms: 'Inbound text (SMS)',
  inbound_call: 'Inbound call',
  inbound_video: 'Inbound video',
  inbound_chat: 'Website chat',
  website_form: 'Website form',
  all: 'Any notification',
}

const CUSTOM = '__custom__'
const PRIMARY = '#2f3b4d'

const STORE_DEFAULT = '__default__'

function normalize(r: Record<string, unknown>): Rule {
  return {
    event: String(r.event ?? 'new_lead'),
    to: String(r.to ?? ''),
    channel: r.channel === 'sms' ? 'sms' : 'email',
    format:
      r.format === 'adf-xml' ? 'adf-xml' : r.format === 'email' ? 'email' : undefined,
    label: r.label ? String(r.label) : undefined,
    enabled: r.enabled !== false,
  }
}

export function CustomerNotificationsRenderer({
  profile,
}: {
  profile: string
  config: StudioConfig
}) {
  const [rules, setRules] = useState<Array<Rule>>([])
  const [known, setKnown] = useState<Array<string>>([])
  const [leadRecipient, setLeadRecipient] = useState<string | null>(null)
  const [leadFormat, setLeadFormat] = useState<Template>('email')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [testingTo, setTestingTo] = useState<string | null>(null)
  const [testMsg, setTestMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/customer/notifications?profile=${encodeURIComponent(profile)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        if (d.ok) {
          setRules((d.routing ?? []).map(normalize))
          setKnown(d.known_events ?? [])
          setLeadRecipient(d.lead_recipient ?? null)
          setLeadFormat(d.lead_format === 'adf-xml' ? 'adf-xml' : 'email')
        } else {
          setErr(d.error ?? 'Failed to load')
        }
      })
      .catch(() => alive && setErr('Failed to load'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [profile])

  function update(i: number, patch: Partial<Rule>) {
    setRules((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function addRule() {
    setRules((rs) => [
      ...rs,
      { event: 'new_lead', to: '', channel: 'email', enabled: true },
    ])
  }
  function removeRule(i: number) {
    setRules((rs) => rs.filter((_, idx) => idx !== i))
  }

  async function sendTest(rule: Rule) {
    if (!rule.to || !rule.to.includes('@')) {
      setTestMsg(null)
      setErr('Enter a valid email before sending a test.')
      return
    }
    setTestingTo(rule.to)
    setTestMsg(null)
    setErr(null)
    try {
      const res = await fetch('/api/customer/notifications-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          to: rule.to,
          format: rule.format ?? leadFormat,
        }),
      })
      const d = await res.json()
      if (d.ok) {
        setTestMsg(`Sample ${d.format === 'adf-xml' ? 'ADF' : 'email'} sent to ${rule.to}.`)
      } else {
        setErr(d.error ?? 'Test send failed')
      }
    } catch {
      setErr('Test send failed')
    } finally {
      setTestingTo(null)
    }
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    setErr(null)
    try {
      const res = await fetch('/api/customer/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, routing: rules }),
      })
      const d = await res.json()
      if (d.ok) {
        setMsg('Saved.')
        setRules((d.routing ?? rules).map(normalize))
      } else {
        setErr(d.error ?? 'Save failed')
      }
    } catch {
      setErr('Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm opacity-60">Loading notifications…</div>
  }

  return (
    <div className="flex flex-col gap-4 text-slate-900">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-xs text-slate-500">
          Decide who gets alerted when something happens — a new lead, an inbound
          message, or (as they come online) a Guardian condition or query result.
          Each rule is “when <em>this</em> happens, notify <em>this person</em>.”
        </p>
      </header>

      {leadRecipient && rules.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          No rules yet — new leads currently fall back to{' '}
          <span className="font-medium">{leadRecipient}</span>. Add a rule to
          route specific conditions to specific people.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">When (condition)</th>
              <th className="px-3 py-2 font-medium">Notify (recipient)</th>
              <th className="px-3 py-2 font-medium">Channel</th>
              <th className="px-3 py-2 font-medium">Template</th>
              <th className="px-3 py-2 font-medium">Label</th>
              <th className="px-3 py-2 font-medium">On</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule, i) => {
              const isCustom = !known.includes(rule.event)
              return (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-2 align-top">
                    <select
                      className={`w-full ${selectClass}`}
                      style={selectChevronStyle}
                      value={isCustom ? CUSTOM : rule.event}
                      onChange={(e) =>
                        update(i, {
                          event: e.target.value === CUSTOM ? '' : e.target.value,
                        })
                      }
                    >
                      {known.map((ev) => (
                        <option key={ev} value={ev}>
                          {KNOWN_LABELS[ev] ?? ev}
                        </option>
                      ))}
                      <option value={CUSTOM}>Custom condition…</option>
                    </select>
                    {isCustom && (
                      <input
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-900"
                        placeholder="condition id, e.g. perf_guardian:slow_first_response"
                        value={rule.event}
                        onChange={(e) => update(i, { event: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-900"
                      placeholder={
                        rule.channel === 'sms' ? '+1555…' : 'name@dealer.com'
                      }
                      value={rule.to}
                      onChange={(e) => update(i, { to: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <select
                      className={selectClass}
                      style={selectChevronStyle}
                      value={rule.channel}
                      onChange={(e) =>
                        update(i, { channel: e.target.value as Channel })
                      }
                    >
                      <option value="email">Email</option>
                      <option value="sms">SMS (soon)</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <select
                      className={selectClass}
                      style={selectChevronStyle}
                      value={rule.format ?? STORE_DEFAULT}
                      onChange={(e) =>
                        update(i, {
                          format:
                            e.target.value === STORE_DEFAULT
                              ? undefined
                              : (e.target.value as Template),
                        })
                      }
                    >
                      <option value={STORE_DEFAULT}>
                        Store default ({leadFormat === 'adf-xml' ? 'ADF/XML' : 'Styled email'})
                      </option>
                      <option value="email">Styled email</option>
                      <option value="adf-xml">ADF/XML (DMS)</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-900"
                      placeholder="e.g. Sales Manager"
                      value={rule.label ?? ''}
                      onChange={(e) => update(i, { label: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => update(i, { enabled: e.target.checked })}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top">
                    <button
                      type="button"
                      className="mr-3 text-slate-500 hover:text-slate-900 disabled:opacity-40"
                      onClick={() => sendTest(rule)}
                      disabled={testingTo === rule.to || rule.channel === 'sms'}
                      title="Send a sample notification to this recipient"
                    >
                      {testingTo === rule.to ? 'Sending…' : 'Test'}
                    </button>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-rose-600"
                      onClick={() => removeRule(i)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              )
            })}
            {rules.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                  No routing rules. Add one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: PRIMARY }}
          onClick={addRule}
        >
          + Add rule
        </button>
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: PRIMARY }}
          onClick={save}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {msg && <span className="text-xs text-emerald-700">{msg}</span>}
        {testMsg && <span className="text-xs text-emerald-700">{testMsg}</span>}
        {err && <span className="text-xs text-rose-700">{err}</span>}
      </div>

      <p className="text-[11px] text-slate-400">
        <strong>Template</strong> picks how each recipient receives the alert:
        the <em>styled email</em> card a person reads, or <em>ADF/XML</em> for a
        dealer CRM/DMS intake address (sent as a .adf.xml document). “Store
        default” follows this store’s configured format. Use <strong>Test</strong>{' '}
        to send that recipient a sample notification — it uses the exact same
        template as a real lead. SMS notifications are reserved (email is
        delivered today). Guardian conditions become selectable once the Business
        / Performance Guardians are live; until then you can type a custom
        condition id to pre-stage a rule.
      </p>
    </div>
  )
}
