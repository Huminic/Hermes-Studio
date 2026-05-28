(function () {
  if (window.HermesWidgetLoaded) return;
  window.HermesWidgetLoaded = true;
  var script = document.currentScript;
  var key = script && script.getAttribute('data-widget-key');
  if (!key) return;
  var base = new URL(script.src).origin;
  var root = document.createElement('div');
  root.id = 'hermes-customer-widget';
  root.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483000;font-family:system-ui,-apple-system,Segoe UI,sans-serif';
  document.body.appendChild(root);
  fetch(base + '/api/public/widgets/' + encodeURIComponent(key))
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (!data.ok || !data.widget) return;
      var widget = data.widget;
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = widget.launcherLabel || 'Ask Huminic';
      button.style.cssText = 'border:0;border-radius:999px;background:#2563eb;color:white;padding:12px 16px;font-weight:700;box-shadow:0 12px 30px rgba(15,23,42,.22);cursor:pointer';
      var panel = document.createElement('div');
      panel.style.cssText = 'display:none;position:absolute;right:0;bottom:56px;width:320px;max-width:calc(100vw - 40px);background:white;color:#111827;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 20px 60px rgba(15,23,42,.24);overflow:hidden';
      panel.innerHTML = '<div style="padding:16px;border-bottom:1px solid #e5e7eb"><strong>' + escapeHtml(widget.launcherLabel || 'Huminic Agents') + '</strong><div style="color:#6b7280;font-size:13px;margin-top:4px">Choose an available agent.</div></div>';
      var list = document.createElement('div');
      list.style.cssText = 'padding:8px';
      (widget.agents || []).forEach(function (agent) {
        var row = document.createElement('button');
        row.type = 'button';
        row.style.cssText = 'display:block;width:100%;text-align:left;background:transparent;border:0;border-radius:12px;padding:12px;cursor:pointer;color:#111827';
        row.innerHTML = '<strong>' + escapeHtml(agent.label) + '</strong><div style="font-size:12px;color:#6b7280;margin-top:3px">' + escapeHtml(agent.description || '') + '</div><div style="font-size:11px;color:#2563eb;margin-top:6px">' + escapeHtml((agent.channels || []).join(', ')) + '</div>';
        row.onclick = function () {
          window.dispatchEvent(new CustomEvent('hermes-widget-agent-selected', { detail: { agent: agent, widget: widget } }));
          alert('Agent selected: ' + agent.label + '\\nSession minting is configured server-side during integration migration.');
        };
        list.appendChild(row);
      });
      if (!widget.agents || widget.agents.length === 0) {
        list.innerHTML = '<div style="padding:12px;color:#6b7280;font-size:13px">No customer-facing agents have been enabled yet.</div>';
      }
      panel.appendChild(list);
      button.onclick = function () { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; };
      root.appendChild(panel);
      root.appendChild(button);
    })
    .catch(function () {});
  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
})();
