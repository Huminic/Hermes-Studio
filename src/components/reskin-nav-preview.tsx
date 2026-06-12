/**
 * ReskinNavPreview — NON-PRODUCTION prototype of a regrouped Studio/Workspace
 * left navigation.
 *
 * Context: the live per-store Studio nav (src/routes/p.$profile.$tab.tsx)
 * renders a flat 8-item icon rail: Agents, Knowledge, Widgets, Data, Dashboard,
 * Teambox, Campaigns, Notifications. This component proposes collapsing that
 * flat list into a smaller set of CATEGORY groups with expand/collapse
 * dropdowns, for Duane to review.
 *
 * This file is rendered ONLY by the /reskin-preview route. It does NOT touch
 * the live nav components. It is a static/clickable mockup — selecting an item
 * highlights it locally; it does not navigate the real app.
 *
 * Styling reuses the same Tailwind palette the live storefront nav uses
 * (slate-* surface, purple-500 #8b5cf6 Nexxus accent) and the same hugeicons
 * line-icon set. No new deps, no new design system.
 */
import { useMemo, useState } from 'react'
import {
  Analytics01Icon,
  Chart01Icon,
  GridIcon,
  InboxIcon,
  LibraryIcon,
  Megaphone01Icon,
  Notification03Icon,
  Robot01Icon,
  Settings01Icon,
  ArrowDown01Icon,
  MessageMultiple01Icon,
  Database01Icon,
  Store01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'

/** Nexxus brand accent — same value the live nav uses (NAV_ACCENT). */
const NAV_ACCENT = '#8b5cf6'

type NavLeaf = {
  /** Mirrors the live `tabsList` id / route param where one exists. */
  id: string
  label: string
  icon: IconSvgElement
  /** Where this would point in the real app, for reference only. */
  hint: string
}

type NavCategory = {
  id: string
  label: string
  icon: IconSvgElement
  items: Array<NavLeaf>
}

/**
 * Proposed grouping. Every leaf maps 1:1 to a current flat nav item so nothing
 * is lost; only the top-level surface shrinks from 8 flat links to 4 category
 * groups (+ a standalone Settings affordance).
 */
const NAV_GROUPS: Array<NavCategory> = [
  {
    id: 'engage',
    label: 'Engage',
    icon: MessageMultiple01Icon,
    items: [
      { id: 'chat', label: 'Agents', icon: Robot01Icon, hint: '/p/$profile/chat' },
      { id: 'comms', label: 'Teambox', icon: InboxIcon, hint: '/p/$profile/comms' },
      {
        id: 'campaigns',
        label: 'Campaigns',
        icon: Megaphone01Icon,
        hint: '/p/$profile/campaigns',
      },
      {
        id: 'notifications',
        label: 'Notifications',
        icon: Notification03Icon,
        hint: '/p/$profile/notifications',
      },
    ],
  },
  {
    id: 'intelligence',
    label: 'Knowledge & Data',
    icon: Database01Icon,
    items: [
      {
        id: 'knowledge',
        label: 'Knowledge',
        icon: LibraryIcon,
        hint: '/p/$profile/knowledge',
      },
      { id: 'data', label: 'Data', icon: Analytics01Icon, hint: '/p/$profile/data' },
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: Chart01Icon,
        hint: '/p/$profile/dashboard',
      },
    ],
  },
  {
    id: 'storefront',
    label: 'Storefront',
    icon: Store01Icon,
    items: [
      { id: 'tools', label: 'Widgets', icon: GridIcon, hint: '/p/$profile/tools' },
    ],
  },
]

export function ReskinNavPreview() {
  // First category open by default; tracks which groups are expanded.
  const [open, setOpen] = useState<Record<string, boolean>>({ engage: true })
  // Active leaf (clickable mockup state — does NOT navigate the real app).
  const [activeId, setActiveId] = useState<string>('chat')

  const allLeaves = useMemo(
    () => NAV_GROUPS.flatMap((g) => g.items),
    [],
  )
  const activeLeaf = allLeaves.find((l) => l.id === activeId) ?? allLeaves[0]

  function toggle(groupId: string) {
    setOpen((prev) => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white font-sans text-slate-900 md:flex-row">
      {/* Proposed grouped left nav — full-width stacked on mobile, side rail on md+ */}
      <aside className="flex w-full flex-col border-b border-slate-200 bg-slate-50 md:w-64 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: NAV_ACCENT }}
          />
          <span className="text-sm font-semibold text-slate-900">Studio</span>
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
            Preview
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Proposed navigation">
          {NAV_GROUPS.map((group) => {
            const expanded = open[group.id] ?? false
            const groupHasActive = group.items.some((i) => i.id === activeId)
            return (
              <div key={group.id} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggle(group.id)}
                  aria-expanded={expanded}
                  className={
                    'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ' +
                    (groupHasActive
                      ? 'font-medium text-slate-900'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
                  }
                >
                  <HugeiconsIcon
                    icon={group.icon}
                    size={18}
                    strokeWidth={1.8}
                    color={groupHasActive ? NAV_ACCENT : 'currentColor'}
                  />
                  <span className="flex-1 text-left">{group.label}</span>
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    size={16}
                    strokeWidth={1.8}
                    className={
                      'shrink-0 text-slate-400 transition-transform ' +
                      (expanded ? 'rotate-180' : '')
                    }
                  />
                </button>

                {/* Sub-items dropdown */}
                <div
                  className={
                    'overflow-hidden transition-all ' +
                    (expanded ? 'mt-0.5 max-h-96' : 'max-h-0')
                  }
                >
                  <ul className="ml-3 border-l border-slate-200 pl-2">
                    {group.items.map((item) => {
                      const active = item.id === activeId
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setActiveId(item.id)}
                            title={item.hint}
                            className={
                              'relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ' +
                              (active
                                ? 'font-medium'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
                            }
                            style={active ? { color: NAV_ACCENT } : undefined}
                          >
                            {active && (
                              <span
                                aria-hidden
                                className="absolute -left-[9px] top-1.5 h-5 w-0.5 rounded-r-full"
                                style={{ background: NAV_ACCENT }}
                              />
                            )}
                            <HugeiconsIcon
                              icon={item.icon}
                              size={16}
                              strokeWidth={1.8}
                              color={active ? NAV_ACCENT : 'currentColor'}
                            />
                            <span>{item.label}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            )
          })}

          {/* Standalone Settings affordance (kept top-level, not nested) */}
          <div className="mt-2 border-t border-slate-200 pt-2">
            <button
              type="button"
              onClick={() => setActiveId('settings')}
              className={
                'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ' +
                (activeId === 'settings'
                  ? 'font-medium'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
              }
              style={activeId === 'settings' ? { color: NAV_ACCENT } : undefined}
            >
              <HugeiconsIcon
                icon={Settings01Icon}
                size={18}
                strokeWidth={1.8}
                color={activeId === 'settings' ? NAV_ACCENT : 'currentColor'}
              />
              <span>Settings</span>
            </button>
          </div>
        </nav>

        <div className="border-t border-slate-200 px-4 py-2 text-[10px] text-slate-400">
          Powered by Huminic
        </div>
      </aside>

      {/* Right side: explanatory panel (not the real app content) */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-slate-200 bg-white px-4 py-2 md:h-14 md:flex-nowrap md:py-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-slate-900">
              Navigation reskin
            </span>
            <span className="text-slate-300">·</span>
            <span className="truncate text-sm text-slate-500">
              {activeId === 'settings' ? 'Settings' : activeLeaf?.label}
            </span>
          </div>
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
            Prototype — not production
          </span>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-2xl space-y-6">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-medium">This is a non-production prototype.</p>
              <p className="mt-1 text-amber-700">
                It previews a proposed regrouping of the Studio left nav. Clicking
                items here only updates this mockup — it does not navigate the
                live application, and the live nav is unchanged.
              </p>
            </div>

            <section>
              <h2 className="text-sm font-semibold text-slate-900">
                What changed
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                The current nav is a flat rail of 8 icons. This proposal collapses
                those same 8 destinations into 4 expandable category groups plus a
                standalone Settings entry, so the top level reads as ~4 choices
                instead of 8.
              </p>
            </section>

            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {NAV_GROUPS.map((group) => (
                <div
                  key={group.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon
                      icon={group.icon}
                      size={16}
                      strokeWidth={1.8}
                      color={NAV_ACCENT}
                    />
                    <span className="text-sm font-medium text-slate-900">
                      {group.label}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {group.items.map((item) => (
                      <li key={item.id}>{item.label}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={Settings01Icon}
                    size={16}
                    strokeWidth={1.8}
                    color={NAV_ACCENT}
                  />
                  <span className="text-sm font-medium text-slate-900">
                    Settings
                  </span>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  <li>Top-level (not nested)</li>
                </ul>
              </div>
            </section>
          </div>
        </main>

        <footer className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] text-slate-500">
          Powered by Huminic · prototype route /reskin-preview
        </footer>
      </div>
    </div>
  )
}
