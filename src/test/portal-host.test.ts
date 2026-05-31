import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isPortalHost, portalHosts } from '@/lib/portal-host'

describe('portal-host', () => {
  const originalPortalHost = process.env.PORTAL_HOST

  beforeEach(() => {
    delete process.env.PORTAL_HOST
  })

  afterEach(() => {
    if (originalPortalHost === undefined) {
      delete process.env.PORTAL_HOST
    } else {
      process.env.PORTAL_HOST = originalPortalHost
    }
  })

  it('defaults to portal.huminic.app when PORTAL_HOST is unset', () => {
    expect(portalHosts()).toEqual(['portal.huminic.app'])
  })

  it('matches the default host case-insensitively', () => {
    expect(isPortalHost('portal.huminic.app')).toBe(true)
    expect(isPortalHost('PORTAL.HUMINIC.APP')).toBe(true)
  })

  it('does not match the studio host', () => {
    expect(isPortalHost('studio.huminic.app')).toBe(false)
    expect(isPortalHost('localhost')).toBe(false)
  })

  it('handles null/undefined/empty hostnames', () => {
    expect(isPortalHost(null)).toBe(false)
    expect(isPortalHost(undefined)).toBe(false)
    expect(isPortalHost('')).toBe(false)
  })

  it('honors PORTAL_HOST env override with comma-separated values', () => {
    process.env.PORTAL_HOST = 'portal.example.com,live.example.com'
    expect(portalHosts()).toEqual(['portal.example.com', 'live.example.com'])
    expect(isPortalHost('portal.example.com')).toBe(true)
    expect(isPortalHost('live.example.com')).toBe(true)
    expect(isPortalHost('portal.huminic.app')).toBe(false)
  })

  it('trims whitespace and lowercases env values', () => {
    process.env.PORTAL_HOST = '  Portal.Example.com , Live.Example.com  '
    expect(portalHosts()).toEqual(['portal.example.com', 'live.example.com'])
  })

  it('falls back to defaults when PORTAL_HOST is empty string', () => {
    process.env.PORTAL_HOST = ''
    expect(portalHosts()).toEqual(['portal.huminic.app'])
  })
})
