import { createFileRoute, notFound } from '@tanstack/react-router'
import { findPublicWidget } from '../server/public-widgets'

/**
 * Public widget route declared by the customer-console plugin manifest:
 *   /w/$slug  →  customer-console.widget-public
 *
 * Resolves the slug across all profiles (no profile context in the URL by
 * design — the widget knows its own profile via frontmatter). Serves the
 * widget's frontmatter + body so a public visitor can interact without auth.
 */
export const Route = createFileRoute('/w/$slug')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const widget = findPublicWidget(params.slug)
        if (!widget) {
          return new Response('Widget not found', {
            status: 404,
            headers: { 'Content-Type': 'text/plain' },
          })
        }
        const fm = widget.frontmatter as Record<string, unknown>
        const title = String(fm.title ?? params.slug)
        const greeting = String(fm.greeting ?? '')
        const mode = String(fm.mode ?? 'chat')
        const brand = (fm.brand as Record<string, unknown>) || {}
        const accent = String(brand.accent_color ?? '#0a7dff')
        const primary = String(brand.primary_color ?? '#222')
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #f7f7f8; color: ${escapeHtml(primary)}; }
  .widget { max-width: 480px; margin: 40px auto; background: white; border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,.08); overflow: hidden; }
  .header { background: ${escapeHtml(primary)}; color: white; padding: 16px 20px; }
  .header h1 { margin: 0; font-size: 1.05rem; font-weight: 600; }
  .header .mode { font-size: 0.75rem; opacity: .7; text-transform: uppercase; letter-spacing: 0.04em; }
  .greet { padding: 18px 20px; line-height: 1.45; font-size: 0.95rem; }
  .meta { padding: 12px 20px; border-top: 1px solid #eee; font-size: 0.75rem; color: #777; }
  .cta { padding: 0 20px 18px; }
  .cta button { background: ${escapeHtml(accent)}; color: white; border: 0; border-radius: 8px; padding: 10px 16px; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
<div class="widget" data-profile="${escapeHtml(widget.profile)}" data-slug="${escapeHtml(widget.slug)}" data-mode="${escapeHtml(mode)}">
  <div class="header">
    <div class="mode">${escapeHtml(mode)} widget</div>
    <h1>${escapeHtml(title)}</h1>
  </div>
  <div class="greet">${escapeHtml(greeting)}</div>
  <div class="cta">
    <button onclick="alert('Chat handoff stub. Widget plugin renderer will live-wire this in Phase 5 v2.')">Start chat</button>
  </div>
  <div class="meta">Served by Huminic Studio · profile: ${escapeHtml(widget.profile)}</div>
</div>
</body>
</html>`
        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=60',
          },
        })
      },
    },
  },
  loader: () => notFound(),
})

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c] || c,
  )
}
