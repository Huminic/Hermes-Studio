/**
 * Nexxus / Huminic single-ID widget embed (WS-7).
 *
 * ONE snippet, ONE id. The customer pastes:
 *
 *   <script async src="https://studio.huminic.app/nexxus-widget.min.js?id=WIDGET_ID"></script>
 *
 * The id can also be supplied as a data attribute:
 *
 *   <script async src=".../nexxus-widget.min.js" data-widget-id="WIDGET_ID"></script>
 *
 * The script reads that single id, fetches ALL config (mode, agent, branding,
 * greeting, title) from the public, unauthed endpoint
 *   GET /api/public/widget-config/<id>
 * keyed by that id, then renders a launcher that opens the live, functional
 * /w/<id> widget (chat round-trips through /api/public/widget-chat). No domain
 * key, no per-dealer baked-in script.
 *
 * This is the readable source. The minified production bundle is
 * nexxus-widget.min.js, built from this file via esbuild.
 */
(function () {
  if (window.NexxusWidgetLoaded) return
  window.NexxusWidgetLoaded = true

  var script = document.currentScript
  if (!script) return

  // Single id: ?id= on the script src wins, else data-widget-id.
  var id = ''
  try {
    id = new URL(script.src).searchParams.get('id') || ''
  } catch (e) {
    id = ''
  }
  if (!id) id = script.getAttribute('data-widget-id') || ''
  if (!id) return

  var origin
  try {
    origin = new URL(script.src).origin
  } catch (e) {
    return
  }

  fetch(origin + '/api/public/widget-config/' + encodeURIComponent(id))
    .then(function (res) {
      return res.json()
    })
    .then(function (data) {
      if (!data || !data.ok || !data.config) return
      render(origin, data.config)
    })
    .catch(function () {})

  function render(origin, cfg) {
    var accent = cfg.accent || '#0a7dff'
    var label = cfg.launcherLabel || cfg.title || 'Chat with us'

    var root = document.createElement('div')
    root.id = 'nexxus-widget-container'
    root.style.cssText =
      'position:fixed;right:20px;bottom:20px;z-index:2147483000;font-family:system-ui,-apple-system,Segoe UI,sans-serif'
    document.body.appendChild(root)

    var panel = document.createElement('div')
    panel.style.cssText =
      'display:none;position:absolute;right:0;bottom:64px;width:380px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(15,23,42,.28);overflow:hidden'
    var frame = document.createElement('iframe')
    frame.title = cfg.title || 'Widget'
    frame.style.cssText = 'width:100%;height:100%;border:0'
    // Lazy-load the live widget only when first opened.
    frame.dataset.src = origin + (cfg.url || '/w/' + encodeURIComponent(cfg.id))
    panel.appendChild(frame)

    var button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.style.cssText =
      'border:0;border-radius:999px;background:' +
      accent +
      ';color:#fff;padding:13px 20px;font-weight:700;font-size:14px;box-shadow:0 8px 24px rgba(15,23,42,.22);cursor:pointer'

    button.onclick = function () {
      var open = panel.style.display === 'none'
      if (open && !frame.src) frame.src = frame.dataset.src
      panel.style.display = open ? 'block' : 'none'
    }

    root.appendChild(panel)
    root.appendChild(button)
  }
})()
