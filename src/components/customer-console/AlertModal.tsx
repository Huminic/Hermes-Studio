/**
 * AlertModal — the dashboard's "Create alert" modal. A light-themed dialog over the
 * (dark) cockpit that hosts the shared AlertWizard, optionally pre-seeded with a
 * metric. Opened by the dashboard's "Create alert" button. Closes on backdrop click,
 * Escape, or after a successful create.
 */
import { useEffect } from 'react'
import { AlertWizard } from './AlertWizard'

export function AlertModal({
  profile,
  presetMetricId,
  onClose,
}: {
  profile: string
  presetMetricId?: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create alert"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(6,10,20,0.6)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '8vh 16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="text-slate-900"
        style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Create an alert</h3>
          <button type="button" aria-label="Close" className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Get an email when a metric crosses a line you set — or when it’s unusual for this dealer.
        </p>
        <AlertWizard profile={profile} presetMetricId={presetMetricId} onCreated={onClose} />
      </div>
    </div>
  )
}
