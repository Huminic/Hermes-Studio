// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

// Stub TanStack Router so the route component renders without a RouterProvider.
// createFileRoute captures the options; Link renders a plain anchor carrying the
// resolved profile param so we can assert each card links to its storefront.
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => ({
    options: opts,
    component: opts.component,
  }),
  Link: ({
    params,
    children,
    ...rest
  }: {
    params?: { profile?: string }
    children?: React.ReactNode
  } & Record<string, unknown>) =>
    React.createElement(
      'a',
      { 'data-profile': params?.profile, ...rest },
      children,
    ),
}))

describe('store-picker landing (/stores)', () => {
  it('lists all 6 entities, each linking to its storefront, with the admin contact', async () => {
    const mod = await import('@/routes/stores')
    const Landing = (mod.Route as { component: React.ComponentType }).component
    const { container } = render(<Landing />)
    const txt = container.textContent ?? ''

    // All six entities present by display name.
    for (const name of [
      'Serra Honda',
      'Serra Service',
      'Serra Nissan',
      'Tony Serra Ford',
      'Hyundai of Columbia',
      'Ford of Columbia',
    ]) {
      expect(txt).toContain(name)
    }

    // Each card links to its /p/$profile storefront (6 cards).
    const profiles = Array.from(
      container.querySelectorAll('a[data-profile]'),
    ).map((a) => a.getAttribute('data-profile'))
    expect(profiles).toEqual(
      expect.arrayContaining([
        'serra-honda',
        'serra-service',
        'serra-nissan',
        'tony-serra-ford',
        'hyundai-of-columbia',
        'ford-of-columbia',
      ]),
    )
    expect(profiles).toHaveLength(6)

    // Existing-user explainer + admin contact number present.
    expect(txt).toContain('412.654.6500')
    expect(txt).toMatch(/choose your store/i)
    expect(txt).toMatch(/contact your administrator/i)
  })
})
