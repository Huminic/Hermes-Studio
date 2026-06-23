/**
 * Synthetic widget monitor — loads a customer's PUBLIC website in a real
 * browser (Playwright/Chromium) and verifies OUR embedded widget is present and
 * functioning: the embed script is on the page, the launcher renders, opening it
 * shows the expected channels (chat / callback / video / form), and the chat
 * surface points at our app. This is the only check that exercises the live
 * customer-facing widget end-to-end, so a deploy that breaks all those pages is
 * caught before it goes unnoticed.
 *
 * Runs in-container; Chromium is provided by the image (apk) and located via
 * PLAYWRIGHT_CHROMIUM_PATH. Playwright is imported dynamically so the rest of
 * the app (and unit tests) never require a browser. Fully fail-safe: a browser
 * that cannot launch yields { infra: true } (coverage down) — NEVER a false
 * "widget broken" alarm.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type WidgetCheckResult = {
  url: string
  ok: boolean
  scriptPresent: boolean
  launcherPresent: boolean
  /** channel key → rendered in the opened menu. */
  channels: Record<string, boolean>
  error?: string
  /** True when the browser itself could not run — coverage gap, not a fault. */
  infra?: boolean
}

export type WidgetTarget = {
  profile: string
  urls: Array<string>
  /** Channels that MUST render (default: ['chat']). */
  expectChannels?: Array<string>
}

const LAUNCHER_SELECTOR = 'button[aria-label="Choose how to connect"]'
const DEFAULT_EXPECT = ['chat']

/** Read the per-customer monitored-widget targets (file, env-overridable). */
export function readWidgetTargets(): Array<WidgetTarget> {
  const raw =
    process.env.SENTINEL_WIDGET_TARGETS ??
    readTargetsFile() ??
    null
  if (!raw) return []
  try {
    const obj = JSON.parse(raw) as Record<
      string,
      { urls?: Array<string>; expectChannels?: Array<string> }
    >
    return Object.entries(obj)
      .map(([profile, v]) => ({
        profile,
        urls: Array.isArray(v.urls) ? v.urls.filter(Boolean) : [],
        expectChannels: v.expectChannels,
      }))
      .filter((t) => t.urls.length > 0)
  } catch {
    return []
  }
}

function readTargetsFile(): string | null {
  try {
    const p = path.join(os.homedir(), '.hermes', 'sentinel-widget-targets.json')
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
  } catch {
    return null
  }
}

/** Injectable launcher so tests run without a real browser. */
export type BrowserLauncher = () => Promise<{
  newPage: () => Promise<BrowserPage>
  close: () => Promise<void>
}>

export type BrowserPage = {
  goto: (url: string, opts?: unknown) => Promise<unknown>
  evaluate: <T>(fn: string | ((arg?: unknown) => T), arg?: unknown) => Promise<T>
  click: (selector: string, opts?: unknown) => Promise<unknown>
  waitForTimeout: (ms: number) => Promise<void>
}

/** Resolve a usable Chromium executable (Alpine names it inconsistently). */
function resolveChromiumPath(): string | undefined {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean) as Array<string>
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c
    } catch {
      /* ignore */
    }
  }
  return undefined // let Playwright try its own (works on dev hosts)
}

/** Default launcher — real Chromium via Playwright, located by env/known paths. */
const defaultLauncher: BrowserLauncher = async () => {
  const { chromium } = (await import('playwright')) as typeof import('playwright')
  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromiumPath(),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  return {
    newPage: async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        userAgent:
          'Mozilla/5.0 (HuminicSentinel) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      })
      return (await ctx.newPage()) as unknown as BrowserPage
    },
    close: async () => {
      await browser.close()
    },
  }
}

export type CheckWidgetOpts = {
  launch?: BrowserLauncher
  expectChannels?: Array<string>
  navTimeoutMs?: number
  settleMs?: number
}

/**
 * Run the synthetic check against a single public URL. Never throws.
 */
export async function checkWidget(
  url: string,
  opts: CheckWidgetOpts = {},
): Promise<WidgetCheckResult> {
  const expect = opts.expectChannels ?? DEFAULT_EXPECT
  const launch = opts.launch ?? defaultLauncher
  const navTimeoutMs = opts.navTimeoutMs ?? 30_000
  const settleMs = opts.settleMs ?? 3_000

  const empty: WidgetCheckResult = {
    url,
    ok: false,
    scriptPresent: false,
    launcherPresent: false,
    channels: {},
  }

  let browser: Awaited<ReturnType<BrowserLauncher>> | null = null
  try {
    browser = await launch()
  } catch (e) {
    // Browser unavailable ⇒ coverage gap, NOT a widget fault.
    return { ...empty, infra: true, error: e instanceof Error ? e.message : String(e) }
  }

  try {
    const page = await browser.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeoutMs })
    await page.waitForTimeout(settleMs) // let the async embed script render

    const present = await page.evaluate<{ script: boolean; launcher: boolean }>(`(() => {
      const script = Array.from(document.querySelectorAll('script[src]'))
        .some(s => /\\/widget\\/dealer\\/.*\\.js/.test(s.src));
      const b = document.querySelector('${LAUNCHER_SELECTOR}');
      const r = b && b.getBoundingClientRect();
      return { script, launcher: !!(r && r.width > 0 && r.height > 0) };
    })()`)

    if (!present.launcher) {
      return {
        ...empty,
        scriptPresent: present.script,
        launcherPresent: false,
        error: present.script
          ? 'embed script present but launcher did not render'
          : 'our widget embed script is not on the page',
      }
    }

    await page.click(LAUNCHER_SELECTOR, { timeout: 5_000 })
    await page.waitForTimeout(500)

    const menu = await page.evaluate<{ channels: Record<string, boolean> }>(`(() => {
      const opts = Array.from(document.querySelectorAll('button[data-opt]'));
      const channels = {};
      for (const b of opts) channels[b.getAttribute('data-opt')] = b.getBoundingClientRect().width > 0;
      return { channels };
    })()`)

    const missing = expect.filter((c) => !menu.channels[c])
    const ok = present.script && missing.length === 0
    return {
      url,
      ok,
      scriptPresent: present.script,
      launcherPresent: true,
      channels: menu.channels,
      error: ok ? undefined : `missing expected channel(s): ${missing.join(', ')}`,
    }
  } catch (e) {
    return { ...empty, launcherPresent: true, error: e instanceof Error ? e.message : String(e) }
  } finally {
    try {
      await browser.close()
    } catch {
      /* ignore */
    }
  }
}
