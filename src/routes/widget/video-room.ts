/**
 * GET /widget/video-room?c=<conversationId>   (public — same-origin video wrapper)
 *
 * Fixes LC-BLOCKER-001. The Two-Way Video provider hosts the live room on a
 * domain that contains a banned vendor term. Embedding that URL directly put the
 * vendor host into (a) our /api/public/video-session JSON response and (b) the
 * public iframe `src` on every storefront + dealer.com embed.
 *
 * This wrapper is served from OUR origin. The widget points its overlay iframe at
 * `<our-origin>/widget/video-room?c=<id>` (clean — no vendor host in the API
 * response or the dealer-page DOM). The wrapper, on our origin, embeds the actual
 * room one frame down. The conversation id is opaque (no vendor term).
 *
 * Camera/mic delegate through both frames via the `allow` attribute. The id is
 * strictly validated, and the room host is hard-coded server-side, so this can
 * never be coerced into framing an arbitrary URL.
 *
 * Residual (documented + escalated, not code-fixable): the wrapper's own nested
 * frame still connects to the provider host at the NETWORK layer. Eliminating
 * that requires a provider/Daily custom domain (operator/provider config).
 */
import { createFileRoute } from '@tanstack/react-router'

// The room host is fixed server-side — never derived from client input. When a
// provider custom domain is configured (operator action), change it here.
const ROOM_HOST = 'https://tavus.daily.co'
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/

function page(body: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/>` +
      `<meta name="viewport" content="width=device-width, initial-scale=1"/>` +
      `<title>Video</title>` +
      `<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}` +
      `iframe{width:100%;height:100%;border:0;display:block}` +
      `p{color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:40px}</style>` +
      `</head><body>${body}</body></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Must be framable by the storefront + any dealer.com page.
        'Content-Security-Policy': 'frame-ancestors *',
        'Cache-Control': 'no-store',
      },
    },
  )
}

export const Route = createFileRoute('/widget/video-room')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const c = new URL(request.url).searchParams.get('c') ?? ''
        if (!ID_RE.test(c)) {
          return page('<p>Video chat is temporarily unavailable.</p>')
        }
        // c is validated to the safe id charset, so interpolation is injection-safe.
        return page(
          `<iframe src="${ROOM_HOST}/${c}" allow="microphone; camera; autoplay; display-capture; fullscreen" allowfullscreen></iframe>`,
        )
      },
    },
  },
})
