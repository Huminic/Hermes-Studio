/**
 * Light-themed, modern UI primitives shared by the Workspace Chat and Agents
 * pages. The shared src/components/ui/* primitives are dark-themed (theme
 * vars); the customer console is a light surface, so these match it. No new
 * dependencies — plain React + the existing hugeicons set.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowDown01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

const ACCENT = '#2f3b4d'

/**
 * Shared styling for native <select> controls so they read as modern, consistent
 * inputs instead of the OS "beveled" default. `appearance-none` strips the native
 * chrome; `selectChevronStyle` paints a custom chevron matching the Dropdown.
 * Usage: <select className={selectClass} style={selectChevronStyle}>…</select>
 */
export const selectClass =
  'appearance-none rounded-md border border-slate-200 bg-white py-1.5 pl-2.5 pr-8 text-xs text-slate-700 transition focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 disabled:opacity-50'

export const selectChevronStyle: CSSProperties = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.5rem center',
}

export type DropdownOption = { value: string; label: string; hint?: string }

/**
 * A single modern dropdown. Shows only the selected option's label in the
 * trigger (no "pick an…" copy). Closes on outside-click and Escape.
 */
export function Dropdown(props: {
  value: string | null
  options: Array<DropdownOption>
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = props.options.find((o) => o.value === props.value) ?? null

  return (
    <div ref={ref} className={'relative ' + (props.className ?? '')}>
      <button
        type="button"
        aria-label={props.ariaLabel ?? 'Select'}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-[180px] items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2"
        style={{ outlineColor: ACCENT }}
      >
        <span className="truncate">
          {selected ? selected.label : (props.placeholder ?? 'Select')}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={16}
          strokeWidth={2}
          color="#64748b"
        />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 z-50 mt-1 max-h-72 w-full min-w-[200px] overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {props.options.map((o) => {
            const active = o.value === props.value
            return (
              <li key={o.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    props.onChange(o.value)
                    setOpen(false)
                  }}
                  className={
                    'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 ' +
                    (active ? 'font-semibold text-slate-900' : 'text-slate-700')
                  }
                  style={active ? { background: `${ACCENT}0f` } : undefined}
                >
                  <span className="truncate">{o.label}</span>
                  {o.hint && (
                    <span className="truncate text-[11px] text-slate-500">
                      {o.hint}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * A modern, light, centered modal. Closes on backdrop click and Escape.
 * `size` controls max width.
 */
export function Modal(props: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  useEffect(() => {
    if (!props.open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') props.onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [props.open, props])

  if (!props.open) return null
  const maxW =
    props.size === 'lg'
      ? 'max-w-2xl'
      : props.size === 'sm'
        ? 'max-w-md'
        : 'max-w-xl'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={props.onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div
        className={
          'relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ' +
          maxW
        }
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900">
              {props.title}
            </h2>
            {props.subtitle && (
              <p className="mt-0.5 text-xs text-slate-500">{props.subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.8} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {props.children}
        </div>
        {props.footer && (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
            {props.footer}
          </footer>
        )}
      </div>
    </div>
  )
}
