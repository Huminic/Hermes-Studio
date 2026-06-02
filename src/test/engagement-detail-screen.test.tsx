// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { EngagementState } from '@/lib/engagement-state'

// The detail screen renders a <Link> in its header. Stub it to a plain anchor
// so the component can mount without a full RouterProvider — we are testing the
// detail body rendering, not navigation.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ to, children, ...rest }: any) => (
      <a href={typeof to === 'string' ? to : '#'} {...rest}>
        {children}
      </a>
    ),
  }
})

import { EngagementDetailScreen } from '@/screens/engagements/engagement-detail-screen'

// GAP-VER-005 regression guard.
//
// Root cause of the gap: `src/routes/engagements.tsx` existed as a PARENT
// route for `engagements.$customer.tsx` but rendered the overview screen with
// no <Outlet/>, so navigating to /engagements/<customer> changed the URL while
// the child detail route never mounted (the overview stayed on screen).
//
// The fix mirrors the repo's own `/w/` convention: no parent layout file —
// `engagements.index.tsx` serves the overview at `/engagements/` and
// `engagements.$customer.tsx` is a root-level sibling for the detail. These
// tests lock in (a) the detail component actually mounts and renders its
// sections, and (b) the swallowing parent file stays gone.

const STATE: EngagementState = {
  schema_version: 1,
  customer: 'huminic',
  current_stage: 'creation',
  stage_entered_at: '2026-05-29T01:49:33Z',
  stage_history: [
    {
      stage: 'draft',
      entered_at: '2026-05-29T01:49:33Z',
      exited_at: '2026-05-29T02:00:00Z',
      notes: 'seeded',
      skipped: false,
    },
  ],
  assigned_consultative_agent: 'consultative-agent',
  build_time_crew: [{ role: 'architect', profile: 'consultative-agent' }],
  run_time_crew: [
    { role: 'architect', profile: 'consultative-agent' },
    { role: 'knowledge-semantic-guardian', profile: 'huminic-data-governor' },
  ],
  deployment_notes: [
    {
      area: 'VinSolutions API',
      status: 'open',
      impact_if_missing: 'Lead routing degraded without CRM credentials.',
      surfaced_at: '2026-05-29T02:10:00Z',
      resolved_at: null,
    },
  ],
  readiness_gates: {
    topology_decided: {
      status: 'approved',
      approved_by: 'duane',
      approved_at: '2026-05-29T02:20:00Z',
      decision: 'single-tenant',
    },
    ready_to_run: { status: 'pending' },
  },
  open_decisions: [
    {
      id: 'DEC-1',
      description: 'Choose CRM sync cadence.',
      blocking_stage: 'submission',
    },
  ],
  adjacent_data_neighbors: [
    { name: 'service-history', source_type: 'dms', likelihood: 'high' },
  ],
} as unknown as EngagementState

function renderDetail(customer: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <EngagementDetailScreen customer={customer} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('EngagementDetailScreen (GAP-VER-005)', () => {
  it('mounts and renders the detail sections for a seeded customer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ customers: [{ customer: 'huminic', state: STATE }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    renderDetail('huminic')

    // The detail body — NOT the overview list — must appear.
    await waitFor(() => {
      expect(screen.getByText('Current stage')).toBeTruthy()
    })
    expect(screen.getByText('Readiness gates')).toBeTruthy()
    expect(screen.getByText('Deployment notes')).toBeTruthy()
    expect(screen.getByText('Build-time crew')).toBeTruthy()
    expect(screen.getByText('Run-time crew')).toBeTruthy()
    expect(screen.getByText('Stage history')).toBeTruthy()
    // A deployment note from the seeded state is surfaced.
    expect(screen.getByText('VinSolutions API')).toBeTruthy()
  })

  it('renders a not-found notice when the customer has no engagement state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ customers: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    renderDetail('does-not-exist')

    await waitFor(() => {
      expect(
        screen.getByText(/No engagement found for "does-not-exist"/),
      ).toBeTruthy()
    })
  })

  it('keeps the swallowing parent route file deleted', () => {
    const routesDir = path.resolve(__dirname, '..', 'routes')
    // The parent layout that caused the gap must NOT come back.
    expect(fs.existsSync(path.join(routesDir, 'engagements.tsx'))).toBe(false)
    // The index route (overview) and the detail route are siblings.
    expect(fs.existsSync(path.join(routesDir, 'engagements.index.tsx'))).toBe(true)
    expect(
      fs.existsSync(path.join(routesDir, 'engagements.$customer.tsx')),
    ).toBe(true)
  })
})
