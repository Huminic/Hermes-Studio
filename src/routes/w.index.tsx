import { createFileRoute, notFound } from '@tanstack/react-router'
import { listPublicWidgets } from '../server/public-widgets'

/**
 * Public widget index: lists every widget across all profiles for
 * operator preview / QA. Each entry links to the live /w/$slug page.
 * No auth required.
 */
export const Route = createFileRoute('/w/')({
  server: {
    handlers: {
      GET: async () => {
        const widgets = listPublicWidgets()
        const rows = widgets
          .map((w) => {
            const fm = w.frontmatter
            const title = escapeHtml(String(fm.title ?? w.slug))
            const slug = escapeHtml(w.slug)
            const mode = escapeHtml(String(fm.mode ?? 'unknown'))
            const profile = escapeHtml(w.profile)
            const agent = escapeHtml(String(fm.agent ?? ''))
            return `<tr>
              <td><a href="/w/${slug}">${title}</a></td>
              <td><code>${slug}</code></td>
              <td>${mode}</td>
              <td>${profile}</td>
              <td>${agent || '<em>none</em>'}</td>
            </tr>`
          })
          .join('\n')
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Public widgets — Huminic Studio</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 920px; margin: 32px auto; padding: 0 16px; color: #222; }
  h1 { font-size: 1.3rem; margin: 0 0 4px; }
  p { color: #555; margin: 0 0 24px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #ececec; font-size: 0.92rem; }
  th { font-weight: 600; background: #fafafa; }
  code { background: #f4f4f6; padding: 1px 6px; border-radius: 4px; font-size: 0.86rem; }
  a { color: #0a7dff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .empty { color: #888; font-style: italic; padding: 24px 0; }
</style>
</head>
<body>
<h1>Public widgets</h1>
<p>Every widget declared across all profiles. Click a title to open the live public route.</p>
${
  widgets.length === 0
    ? '<div class="empty">No widgets found in any profile.</div>'
    : `<table>
        <thead><tr><th>Title</th><th>Slug</th><th>Mode</th><th>Profile</th><th>Agent</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`
}
</body>
</html>`
        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=30',
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
