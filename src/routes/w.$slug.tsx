import { createFileRoute, notFound } from '@tanstack/react-router'
import { findPublicWidget } from '../server/public-widgets'

/**
 * Public widget route declared by the customer-console plugin manifest:
 *   /w/$slug  →  customer-console.widget-public
 *
 * Resolves the slug across all profiles (no profile context in the URL by
 * design — the widget knows its own profile via frontmatter) and serves a
 * functional widget per the declared mode. Currently:
 *   - chat: live chat UI POSTing to /api/public/widget-chat
 *   - voice/video/form: stub with a "coming soon" note (Phase 5 v2)
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
        const html = renderWidgetHtml(widget)
        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            // Public embed: framed cross-origin from dealer sites (server-entry
            // already sends frame-ancestors *); cross-origin CORP keeps the
            // document and its sub-resources loadable off-origin.
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'Cache-Control': 'public, max-age=60',
          },
        })
      },
    },
  },
  loader: () => notFound(),
})

function renderWidgetHtml(widget: {
  profile: string
  slug: string
  frontmatter: Record<string, unknown>
  body: string
}): string {
  const fm = widget.frontmatter
  // WF-013 / final walkthrough: never show internal/debug text, "Chat Widget",
  // or a store-title header on the public widget surface. `pageTitle` is for
  // the browser <title> only.
  const pageTitle = String(fm.title ?? widget.slug)
  const greeting = String(fm.greeting ?? '')
  const mode = String(fm.mode ?? 'chat')
  const agent = String(fm.agent ?? '')
  const brand = (fm.brand as Record<string, unknown>) || {}
  const accent = String(brand.accent_color ?? '#0a7dff')
  const primary = String(brand.primary_color ?? '#222')
  // Customer-facing brand label — never the raw profile slug.
  const brandName = String(brand.name ?? fm.persona_name ?? fm.brand_name ?? '')

  const body =
    mode === 'chat'
      ? chatModeBody(widget)
      : mode === 'form'
        ? formModeBody(widget)
        : stubBody(mode)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(pageTitle)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { --accent: ${escapeHtml(accent)}; --primary: ${escapeHtml(primary)}; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; background: #f5f5f7; color: var(--primary); min-height: 100vh; }
  .frame { max-width: 560px; margin: 32px auto; padding: 0 16px; }
  .card { background: white; border-radius: 12px; box-shadow: 0 6px 28px rgba(0,0,0,.08); overflow: hidden; }
  .greet { padding: 18px 22px; line-height: 1.5; font-size: 0.95rem; }
  .chat { padding: 0 22px 16px; }
  .messages { display: flex; flex-direction: column; gap: 10px; min-height: 80px; max-height: 50vh; overflow-y: auto; padding: 8px 0 12px; }
  .msg { padding: 10px 14px; border-radius: 12px; max-width: 80%; line-height: 1.4; font-size: 0.92rem; white-space: pre-wrap; }
  .msg.you { background: #eef0f3; align-self: flex-end; border-bottom-right-radius: 4px; }
  .msg.agent { background: #f7f0e8; align-self: flex-start; border-bottom-left-radius: 4px; }
  .msg.error { background: #fde8e8; color: #b21212; align-self: stretch; font-size: 0.85rem; }
  .composer { display: flex; flex-wrap: nowrap; gap: 8px; border-top: 1px solid #ececec; padding: 14px 0 0; }
  .composer input { flex: 1 1 auto; min-width: 0; width: 100%; border: 1px solid #d8d8d8; border-radius: 8px; padding: 10px 12px; font-size: 0.95rem; outline: none; }
  .composer input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent); }
  .composer button { flex: 0 0 auto; background: #4a5568; color: white; border: 0; border-radius: 8px; padding: 0 18px; font-weight: 600; cursor: pointer; }
  .composer button:disabled { opacity: .55; cursor: not-allowed; }
  .meta { padding: 12px 22px; border-top: 1px solid #ececec; font-size: 0.72rem; color: #888; display: flex; justify-content: space-between; }
  .stub { padding: 22px; text-align: center; color: #777; font-size: 0.95rem; }
  .typing { font-style: italic; opacity: .65; font-size: 0.88rem; padding: 4px 4px 0; }
  .leadform { padding: 4px 22px 20px; }
  .leadform .field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 13px; }
  .leadform label { font-size: 0.8rem; font-weight: 600; color: #444; }
  .leadform label .req { color: var(--accent); margin-left: 2px; }
  .leadform input, .leadform textarea { border: 1px solid #d8d8d8; border-radius: 8px; padding: 10px 12px; font-size: 0.95rem; font-family: inherit; outline: none; width: 100%; }
  .leadform textarea { resize: vertical; min-height: 84px; }
  .leadform input:focus, .leadform textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent); }
  .leadform button { background: #4a5568; color: white; border: 0; border-radius: 8px; padding: 12px 18px; font-weight: 600; font-size: 0.95rem; cursor: pointer; width: 100%; }
  .leadform button:disabled { opacity: .55; cursor: not-allowed; }
  .leadform .formerr { background: #fde8e8; color: #b21212; border-radius: 8px; padding: 10px 12px; font-size: 0.85rem; margin-bottom: 12px; display: none; }
  .leadform .ok { text-align: center; padding: 26px 8px; }
  .leadform .ok .check { font-size: 2rem; line-height: 1; margin-bottom: 10px; }
  .leadform .ok p { margin: 0; color: #444; line-height: 1.5; }
</style>
</head>
<body>
<div class="frame">
  <div class="card" data-profile="${escapeHtml(widget.profile)}" data-slug="${escapeHtml(widget.slug)}" data-mode="${escapeHtml(mode)}" data-agent="${escapeHtml(agent)}">
    ${body}
    <div class="meta">
      <span>Powered by Huminic</span>
    </div>
  </div>
</div>
</body>
</html>`
}

function chatModeBody(widget: {
  profile: string
  slug: string
  frontmatter: Record<string, unknown>
}): string {
  const greeting = String(widget.frontmatter.greeting ?? '')
  return `<div class="chat">
  <div class="greet">${escapeHtml(greeting)}</div>
  <div class="messages" id="msgs"></div>
  <div class="typing" id="typing" style="display:none">Assistant is typing…</div>
  <form class="composer" id="composer" autocomplete="off">
    <input type="text" id="msg" placeholder="Type a message…" required />
    <button type="submit" id="send">Send</button>
  </form>
</div>
<script>
(function() {
  var profile = ${JSON.stringify(widget.profile)};
  var slug = ${JSON.stringify(widget.slug)};
  var sessionId = (function() {
    try {
      var k = 'huminic-widget-' + slug + '-session';
      var s = sessionStorage.getItem(k);
      if (s) return s;
      s = (crypto && crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2)));
      sessionStorage.setItem(k, s);
      return s;
    } catch (e) { return 'anon-' + Date.now(); }
  })();
  var msgs = document.getElementById('msgs');
  var form = document.getElementById('composer');
  var input = document.getElementById('msg');
  var send = document.getElementById('send');
  var typing = document.getElementById('typing');
  var history = [];
  function append(role, text, cls) {
    var div = document.createElement('div');
    div.className = 'msg ' + (cls || (role === 'user' ? 'you' : 'agent'));
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }
  function clearPending(timeoutId) {
    if (timeoutId) window.clearTimeout(timeoutId);
    typing.style.display = 'none';
    send.disabled = false;
  }
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    append('user', text);
    history.push({ role: 'user', content: text });
    input.value = '';
    send.disabled = true;
    typing.style.display = 'block';
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = window.setTimeout(function() {
      if (controller) controller.abort();
    }, 30000);
    fetch('/api/public/widget-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: profile, slug: slug, session_id: sessionId, history: history }),
      signal: controller ? controller.signal : undefined,
    })
      .then(function(r) {
        return r.json()
          .catch(function() { return { ok: false }; })
          .then(function(d) { return { status: r.status, body: d }; });
      })
      .then(function(res) {
        clearPending(timeoutId);
        if (res.status !== 200 || !res.body || !res.body.ok) {
          append('agent', 'Sorry, something went wrong. Please try again.', 'error');
          return;
        }
        var reply = res.body.reply || '';
        history.push({ role: 'assistant', content: reply });
        append('agent', reply);
      })
      .catch(function(err) {
        clearPending(timeoutId);
        append('agent', 'Sorry, we could not reach the assistant. Please try again.', 'error');
      });
  });
})();
</script>`
}

function formModeBody(widget: {
  profile: string
  slug: string
  frontmatter: Record<string, unknown>
}): string {
  const fm = widget.frontmatter
  const greeting = String(fm.greeting ?? 'Send us a message and we’ll be in touch.')
  const fmDomain = typeof fm.domain === 'string' ? fm.domain : 'sales'
  const domain = fmDomain === 'service' ? 'service' : 'sales'
  const submitLabel = String(fm.submit_label ?? 'Submit')
  const thanks = String(
    fm.thank_you ??
      'Thanks — your message has been received. A member of our team will reach out shortly.',
  )
  return `<div class="leadform">
  <div class="greet">${escapeHtml(greeting)}</div>
  <div id="formview">
    <div class="formerr" id="formerr"></div>
    <form id="leadform" autocomplete="on">
      <div class="field">
        <label for="lf-name">Name<span class="req">*</span></label>
        <input type="text" id="lf-name" name="name" required />
      </div>
      <div class="field">
        <label for="lf-email">Email<span class="req">*</span></label>
        <input type="email" id="lf-email" name="email" required />
      </div>
      <div class="field">
        <label for="lf-phone">Phone</label>
        <input type="tel" id="lf-phone" name="phone" />
      </div>
      <div class="field">
        <label for="lf-message">Message<span class="req">*</span></label>
        <textarea id="lf-message" name="message" required></textarea>
      </div>
      <button type="submit" id="lf-submit">${escapeHtml(submitLabel)}</button>
    </form>
  </div>
  <div class="ok" id="okview" style="display:none">
    <div class="check">✓</div>
    <p>${escapeHtml(thanks)}</p>
  </div>
</div>
<script>
(function() {
  var profile = ${JSON.stringify(widget.profile)};
  var slug = ${JSON.stringify(widget.slug)};
  var domain = ${JSON.stringify(domain)};
  var form = document.getElementById('leadform');
  var errBox = document.getElementById('formerr');
  var btn = document.getElementById('lf-submit');
  function showErr(t) { errBox.textContent = t; errBox.style.display = 'block'; }
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    errBox.style.display = 'none';
    var name = document.getElementById('lf-name').value.trim();
    var email = document.getElementById('lf-email').value.trim();
    var phone = document.getElementById('lf-phone').value.trim();
    var message = document.getElementById('lf-message').value.trim();
    if (!name || !email || !message) {
      showErr('Please fill in your name, email, and a message.');
      return;
    }
    btn.disabled = true;
    var orig = btn.textContent;
    btn.textContent = 'Sending…';
    fetch('/api/public/widget-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: profile, slug: slug, domain: domain, name: name, email: email, phone: phone, message: message }),
    })
      .then(function(r) { return r.json().then(function(d) { return { status: r.status, body: d }; }); })
      .then(function(res) {
        if (res.status !== 200 || !res.body || !res.body.ok) {
          btn.disabled = false;
          btn.textContent = orig;
          showErr((res.body && res.body.error) ? res.body.error : 'Sorry, something went wrong. Please try again.');
          return;
        }
        document.getElementById('formview').style.display = 'none';
        document.getElementById('okview').style.display = 'block';
      })
      .catch(function() {
        btn.disabled = false;
        btn.textContent = orig;
        showErr('Sorry, we could not submit the form. Please try again.');
      });
  });
})();
</script>`
}

function stubBody(_mode: string): string {
  return `<div class="stub">
  <p>This experience is coming soon.</p>
</div>`
}

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
