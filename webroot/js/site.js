/* Huminic Motors — demo dealership shared JS
   Handles: shared header/footer, nav, lead-capture modal (soft + hard-gate),
   FOMO toasts, inventory data helpers, VDP wiring. Vanilla, no deps. */
(function () {
  "use strict";

  var API_BASE = "https://studio.huminic.app";
  var CAPTURE_URL = API_BASE + "/api/public/demo-capture";
  var LOGIN_URL = API_BASE + "/api/public/demo-login?profile=huminic-motors";
  var PROFILE = "huminic-motors";
  var LS = {
    session: "hm_session_id",
    captured: "hm_captured",
    lead: "hm_lead",
    softSeen: "hm_soft_seen"
  };

  var PHONE = "(512) 555-0100";
  var ADDRESS = "1200 Innovation Parkway, Austin, TX 78701";

  /* ---------- small helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }
  function money(n) {
    if (n == null || isNaN(n)) return "";
    return "$" + Number(n).toLocaleString("en-US");
  }
  function num(n) { return Number(n).toLocaleString("en-US"); }
  function qs(name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)").exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : null;
  }
  function safeLS(fn, dflt) { try { return fn(); } catch (e) { return dflt; } }

  /* ---------- session + capture state ---------- */
  function getSession() {
    var s = safeLS(function () { return localStorage.getItem(LS.session); }, null);
    if (!s) {
      s = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : "hm-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      safeLS(function () { localStorage.setItem(LS.session, s); });
    }
    return s;
  }
  function isCaptured() { return safeLS(function () { return localStorage.getItem(LS.captured) === "1"; }, false); }
  function markCaptured(lead) {
    safeLS(function () {
      localStorage.setItem(LS.captured, "1");
      if (lead) localStorage.setItem(LS.lead, JSON.stringify(lead));
    });
  }
  function getLead() { return safeLS(function () { return JSON.parse(localStorage.getItem(LS.lead) || "{}"); }, {}); }

  var SESSION = getSession();

  /* ---------- validation ---------- */
  function validPhone(v) {
    if (!v) return false;
    var t = v.trim();
    if (/^\+[1-9]\d{7,14}$/.test(t)) return true;      // loose E.164
    var digits = t.replace(/\D/g, "");
    return digits.length === 10 || digits.length === 11; // US-style
  }
  function validEmail(v) {
    if (!v) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
  }

  /* ================= HEADER / FOOTER ================= */
  var NAV = [
    { href: "index.html", label: "Home", key: "home" },
    { href: "inventory.html", label: "Inventory", key: "inventory" },
    { href: "service.html", label: "Service", key: "service" },
    { href: "about.html", label: "About", key: "about" },
    { href: "contact.html", label: "Contact", key: "contact" }
  ];
  var MARK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l2-6h12l2 6"/><circle cx="7.5" cy="17.5" r="1.6" fill="currentColor" stroke="none"/><circle cx="16.5" cy="17.5" r="1.6" fill="currentColor" stroke="none"/><path d="M6.5 11l1.2-3.2A2 2 0 0 1 9.6 6.5h4.8a2 2 0 0 1 1.9 1.3L17.5 11"/></svg>';

  function renderHeader() {
    var mount = $("[data-header]");
    if (!mount) return;
    var active = mount.getAttribute("data-active") || "";
    var header = el("header", { class: "site-header" });
    var navLinks = NAV.map(function (n) {
      return '<a href="' + n.href + '"' + (n.key === active ? ' class="active"' : "") + '>' + n.label + "</a>";
    }).join("");
    header.innerHTML =
      '<div class="wrap header-inner">' +
        '<a class="brand" href="index.html"><span class="mark">' + MARK_SVG + '</span>Huminic Motors</a>' +
        '<nav class="nav" data-nav>' + navLinks + '</nav>' +
        '<div class="header-right">' +
          '<button class="btn btn-ghost btn-sm login-btn" data-login><span class="login-label">Login</span></button>' +
          '<button class="nav-toggle" data-nav-toggle aria-label="Menu">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';
    mount.replaceWith(header);

    $("[data-nav-toggle]").addEventListener("click", function () {
      $("[data-nav]").classList.toggle("open");
    });
    $("[data-login]").addEventListener("click", function () {
      window.open(LOGIN_URL + "&session=" + encodeURIComponent(SESSION), "_blank", "noopener");
    });
  }

  function renderFooter() {
    var mount = $("[data-footer]");
    if (!mount) return;
    var footer = el("footer", { class: "site-footer" });
    footer.innerHTML =
      '<div class="wrap">' +
        '<div class="footer-grid">' +
          '<div>' +
            '<div class="footer-brand"><span class="mark">' + MARK_SVG + '</span>Huminic Motors</div>' +
            '<p class="footer-blurb">Your neighborhood Huminic dealership in Austin — new, certified, and pre-owned vehicles, plus a full-service department you can trust.</p>' +
          '</div>' +
          '<div><h4>Shop</h4><ul>' +
            '<li><a href="inventory.html?condition=new">New Vehicles</a></li>' +
            '<li><a href="inventory.html?condition=cpo">Certified Pre-Owned</a></li>' +
            '<li><a href="inventory.html?condition=used">Used Vehicles</a></li>' +
            '<li><a href="inventory.html">All Inventory</a></li>' +
          '</ul></div>' +
          '<div><h4>Dealership</h4><ul>' +
            '<li><a href="service.html">Service Center</a></li>' +
            '<li><a href="about.html">About Us</a></li>' +
            '<li><a href="about.html">Hours &amp; Directions</a></li>' +
            '<li><a href="contact.html">Contact</a></li>' +
          '</ul></div>' +
          '<div><h4>Visit Us</h4><ul>' +
            '<li>' + ADDRESS + '</li>' +
            '<li><a href="tel:+15125550100">' + PHONE + '</a></li>' +
            '<li>Sales: Mon–Sat 9–7</li>' +
            '<li>Service: Mon–Fri 7:30–6</li>' +
          '</ul></div>' +
        '</div>' +
        '<div class="footer-bottom">' +
          '<span>© ' + new Date().getFullYear() + ' Huminic Motors. All rights reserved.</span>' +
          '<span class="demo-badge"><span class="dot"></span>Demo Site — a Huminic demonstration dealership.</span>' +
        '</div>' +
      '</div>';
    mount.replaceWith(footer);
  }

  /* ================= LEAD-CAPTURE MODAL ================= */
  var modalEl = null;
  var pendingContext = null;
  var pendingAfter = null;

  function buildModal() {
    if (modalEl) return modalEl;
    var overlay = el("div", { class: "modal-overlay", "data-modal": "" });
    overlay.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="hm-modal-title">' +
        '<button class="modal-close" data-modal-close aria-label="Close">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button>' +
        '<div data-modal-form>' +
          '<div class="modal-head">' +
            '<span class="kicker" data-modal-kicker>Let\'s connect</span>' +
            '<h3 id="hm-modal-title" data-modal-title>Welcome — want a quick hand?</h3>' +
            '<p data-modal-desc>Leave your details and our AI assistant will reach out right away to help you.</p>' +
            '<div class="ctx-pill" data-modal-ctx style="display:none"></div>' +
          '</div>' +
          '<div class="modal-body">' +
            '<div class="field" data-field="name"><label>Name (optional)</label><input type="text" data-in="name" placeholder="Your name" autocomplete="name"></div>' +
            '<div class="field" data-field="phone"><label>Phone</label><input type="tel" data-in="phone" placeholder="(512) 555-0123" autocomplete="tel"><span class="err">Enter a valid phone number.</span></div>' +
            '<div class="field" data-field="email"><label>Email</label><input type="email" data-in="email" placeholder="you@email.com" autocomplete="email"><span class="err">Enter a valid email address.</span></div>' +
            '<div class="modal-disclosure">This is a live demonstration — we\'ll only contact <b>you</b> as part of this demo, not anyone else.</div>' +
          '</div>' +
          '<div class="modal-foot">' +
            '<div class="modal-actions">' +
              '<button class="btn btn-ghost" data-modal-dismiss>Skip for now</button>' +
              '<button class="btn btn-primary" data-modal-submit>Get a callback</button>' +
            '</div>' +
            '<button class="modal-skip" data-modal-repskip style="display:none">Skip (rep demo)</button>' +
          '</div>' +
        '</div>' +
        '<div class="modal-success" data-modal-success style="display:none">' +
          '<div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>' +
          '<h3>Thanks!</h3>' +
          '<p>Watch your phone — our AI will reach out to help you shortly.</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    modalEl = overlay;

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });
    $("[data-modal-close]", overlay).addEventListener("click", closeModal);
    $("[data-modal-dismiss]", overlay).addEventListener("click", closeModal);
    $("[data-modal-submit]", overlay).addEventListener("click", submitModal);
    $("[data-modal-repskip]", overlay).addEventListener("click", function () {
      markCaptured({ name: qs("prospect") || "", phone: "", email: "", rep: qs("rep") || "" });
      showSuccess();
    });

    // prefill from rep-demo params
    var pname = qs("prospect");
    if (pname) $("[data-in='name']", overlay).value = pname;

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay.classList.contains("open")) closeModal();
    });
    return overlay;
  }

  function openModal(opts) {
    opts = opts || {};
    var m = buildModal();
    pendingContext = opts.context || null;
    pendingAfter = opts.after || null;

    $("[data-modal-form]", m).style.display = "";
    $("[data-modal-success]", m).style.display = "none";

    $("[data-modal-kicker]", m).textContent = opts.kicker || "Let's connect";
    $("[data-modal-title]", m).textContent = opts.title || "Welcome — want a quick hand?";
    $("[data-modal-desc]", m).textContent = opts.desc || "Leave your details and our AI assistant will reach out right away to help you.";
    $("[data-modal-submit]", m).textContent = opts.cta || "Get a callback";

    var ctxPill = $("[data-modal-ctx]", m);
    if (opts.ctxLabel) { ctxPill.textContent = opts.ctxLabel; ctxPill.style.display = ""; }
    else ctxPill.style.display = "none";

    // rep-demo skip button
    if (qs("rep")) $("[data-modal-repskip]", m).style.display = "";

    ["name", "phone", "email"].forEach(function (f) {
      $("[data-field='" + f + "']", m).classList.remove("invalid");
    });

    m.classList.add("open");
    setTimeout(function () {
      var first = $("[data-in='name']", m);
      if (first && !first.value) first.focus(); else $("[data-in='phone']", m).focus();
    }, 60);
  }

  function closeModal() {
    if (modalEl) modalEl.classList.remove("open");
    pendingContext = null; pendingAfter = null;
  }

  function showSuccess() {
    var m = modalEl;
    $("[data-modal-form]", m).style.display = "none";
    $("[data-modal-success]", m).style.display = "";
    m.classList.add("open");
    var after = pendingAfter;
    setTimeout(function () {
      closeModal();
      if (typeof after === "function") after();
    }, 2400);
  }

  function submitModal() {
    var m = modalEl;
    var name = $("[data-in='name']", m).value.trim();
    var phone = $("[data-in='phone']", m).value.trim();
    var email = $("[data-in='email']", m).value.trim();
    var ok = true;

    var pf = $("[data-field='phone']", m);
    if (!validPhone(phone)) { pf.classList.add("invalid"); ok = false; } else pf.classList.remove("invalid");
    var ef = $("[data-field='email']", m);
    if (!validEmail(email)) { ef.classList.add("invalid"); ok = false; } else ef.classList.remove("invalid");
    if (!ok) return;

    var btn = $("[data-modal-submit]", m);
    btn.disabled = true; btn.textContent = "Sending…";

    var payload = {
      profile: PROFILE,
      session_id: SESSION,
      name: name,
      phone: phone,
      email: email,
      context: pendingContext || "general_inquiry"
    };
    markCaptured({ name: name, phone: phone, email: email });

    function done() { showSuccess(); btn.disabled = false; btn.textContent = "Get a callback"; }

    try {
      fetch(CAPTURE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function () { done(); })
        .catch(function () { done(); }); // graceful: still confirm
    } catch (e) { done(); }
  }

  /* Public entry: gate an action behind capture.
     If already captured, runs `after` immediately. */
  function gate(opts) {
    opts = opts || {};
    if (isCaptured()) { if (typeof opts.after === "function") opts.after(); return; }
    openModal(opts);
  }

  /* ================= SOFT WELCOME MODAL ================= */
  function maybeSoftModal() {
    if (isCaptured()) return;
    if (qs("rep")) return; // rep demos skip the nag
    if (safeLS(function () { return sessionStorage.getItem(LS.softSeen) === "1"; }, false)) return;

    var shown = false;
    function trigger() {
      if (shown || isCaptured()) return;
      shown = true;
      safeLS(function () { sessionStorage.setItem(LS.softSeen, "1"); });
      openModal({
        kicker: "Welcome to Huminic Motors",
        title: "Want a quick hand?",
        desc: "Our AI assistant can answer questions, check availability, or set up a test drive. Drop your info and we'll reach out.",
        cta: "Yes, reach out",
        context: "soft_welcome:" + (document.body.getAttribute("data-page") || "site")
      });
      cleanup();
    }
    function onScroll() {
      var sc = window.scrollY || document.documentElement.scrollTop;
      if (sc > window.innerHeight * 0.9) trigger();
    }
    function cleanup() { window.removeEventListener("scroll", onScroll); clearTimeout(t); }
    var t = setTimeout(trigger, 15000);
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ================= FOMO TOASTS ================= */
  var TOASTS = [
    { i: "car", t: "Jordan from Round Rock just booked a test drive of the <b>Summit</b>.", w: "2 min ago" },
    { i: "wrench", t: "Someone just scheduled service on a <b>Ridge</b>.", w: "5 min ago" },
    { i: "eye", t: "<b>3 shoppers</b> are viewing the <b>Trail</b> right now.", w: "just now" },
    { i: "car", t: "Priya from Cedar Park reserved a test drive of the <b>Apex</b>.", w: "8 min ago" },
    { i: "spark", t: "A new <b>2026 Ion</b> just arrived on the lot.", w: "12 min ago" },
    { i: "wrench", t: "Marcus booked a <b>30k-mile service</b> for Saturday.", w: "6 min ago" },
    { i: "eye", t: "<b>5 people</b> viewed the <b>Aurora</b> in the last hour.", w: "just now" },
    { i: "car", t: "Dana from Pflugerville is test-driving the <b>Vega</b> today.", w: "15 min ago" },
    { i: "spark", t: "The <b>Breeze</b> is our most-viewed model this week.", w: "just now" },
    { i: "wrench", t: "An oil change slot just opened for tomorrow morning.", w: "3 min ago" }
  ];
  var TOAST_ICONS = {
    car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13"/><path d="M3 13h18v4H3z"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17" cy="17.5" r="1.5"/></svg>',
    wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L4 17l3 3 5.5-5.5a4 4 0 0 0 5.2-5.2l-2.4 2.4-2.1-2.1z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z"/></svg>'
  };

  function startToasts() {
    if (window.matchMedia && window.matchMedia("(max-width: 480px)").matches) {
      // still show on mobile but ensure it doesn't cover the widget too long — same logic, fine
    }
    var stack = el("div", { class: "toast-stack", "aria-live": "polite" });
    document.body.appendChild(stack);
    var order = TOASTS.slice().sort(function () { return Math.random() - 0.5; });
    var idx = 0, current = null;

    function dismiss(node) {
      if (!node || node._gone) return;
      node._gone = true;
      node.classList.add("leaving");
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 320);
    }
    function show() {
      if (current) dismiss(current);
      var data = order[idx % order.length]; idx++;
      var node = el("div", { class: "toast" });
      node.innerHTML =
        '<span class="tico">' + (TOAST_ICONS[data.i] || TOAST_ICONS.spark) + '</span>' +
        '<div class="tbody">' + data.t + '<div class="ttime">' + data.w + '</div></div>' +
        '<button class="tclose" aria-label="Dismiss">×</button>';
      $(".tclose", node).addEventListener("click", function () { dismiss(node); if (current === node) current = null; });
      stack.appendChild(node);
      current = node;
      // auto-hide this toast after a while even before next
      setTimeout(function () { if (current === node) { dismiss(node); current = null; } }, 9000);
    }
    // first toast after a short delay, then rotate 12–18s
    setTimeout(function () {
      show();
      (function loop() {
        var delay = 12000 + Math.random() * 6000;
        setTimeout(function () { show(); loop(); }, delay);
      })();
    }, 6000);
  }

  /* ================= WIDGET BRIDGE ================= */
  function openWidget(mode) {
    // mode: 'chat' | 'callback' | 'form' | 'video'
    try {
      if (window.HuminicWidget && typeof window.HuminicWidget.open === "function") {
        window.HuminicWidget.open(mode);
        return true;
      }
    } catch (e) {}
    // Fallback: try to click the injected launcher button
    var launcher = document.querySelector(
      "#huminic-widget-launcher, .huminic-widget-launcher, [data-huminic-widget], [id*='huminic'][class*='launch'], iframe[src*='studio.huminic.app']"
    );
    if (launcher) { try { launcher.click(); return true; } catch (e) {} }
    return false;
  }

  /* ================= INVENTORY DATA ================= */
  var _invCache = null;
  function loadInventory() {
    if (_invCache) return Promise.resolve(_invCache);
    return fetch("data/inventory.json")
      .then(function (r) { return r.json(); })
      .then(function (d) { _invCache = (d && d.vehicles) || []; return _invCache; })
      .catch(function () { _invCache = []; return _invCache; });
  }
  function gradClass(model) {
    var m = (model || "").toLowerCase();
    var known = ["aurora", "breeze", "ridge", "summit", "trail", "ion", "vega", "apex"];
    return known.indexOf(m) >= 0 ? "g-" + m : "g-default";
  }
  var CAR_SVG = '<svg class="car-silhouette" viewBox="0 0 200 80" fill="rgba(255,255,255,0.9)" xmlns="http://www.w3.org/2000/svg"><path d="M20 55c0-3 2-5 6-6l14-2 16-16c3-3 7-4 11-4h40c5 0 10 2 14 6l14 14 20 3c6 1 10 5 10 11v6c0 2-2 4-4 4h-11a13 13 0 0 0-26 0H72a13 13 0 0 0-26 0H24c-2 0-4-2-4-4z"/><circle cx="59" cy="63" r="9" fill="rgba(15,23,42,0.55)"/><circle cx="141" cy="63" r="9" fill="rgba(15,23,42,0.55)"/><path d="M60 33l12-11c2-2 4-3 7-3h30c3 0 6 1 8 3l11 11z" fill="rgba(255,255,255,0.35)"/></svg>';
  var CONDITION_LABEL = { new: "New", used: "Used", cpo: "Certified" };

  function vehicleCard(v) {
    var a = el("a", { class: "veh-card", href: "vdp.html?stock=" + encodeURIComponent(v.stock_number) });
    var cond = (v.condition || "").toLowerCase();
    a.innerHTML =
      '<div class="veh-photo ' + gradClass(v.model) + '">' +
        '<span class="badge ' + cond + '">' + (CONDITION_LABEL[cond] || cond) + '</span>' +
        CAR_SVG +
        '<span class="veh-body">' + (v.body || "") + '</span>' +
        '<span class="veh-model">' + v.model + '</span>' +
      '</div>' +
      '<div class="veh-info">' +
        '<h3 class="veh-title">' + v.year + ' ' + v.make + ' ' + v.model + '</h3>' +
        '<p class="veh-sub">' + (v.trim || "") + ' · ' + (v.exterior_color || "") + '</p>' +
        '<div class="veh-meta">' +
          '<span>' + num(v.mileage) + ' mi</span>' +
          '<span>Stock #' + v.stock_number + '</span>' +
        '</div>' +
        '<div class="veh-price-row">' +
          '<span class="veh-price">' + money(v.price_usd) + '</span>' +
          '<span class="veh-cta">View details →</span>' +
        '</div>' +
      '</div>';
    return a;
  }

  /* ================= PAGE INIT HOOKS ================= */
  function initFeatured() {
    var mount = $("[data-featured]");
    if (!mount) return;
    loadInventory().then(function (list) {
      // pick a nice mix: a new SUV, a CPO, an EV, a sport
      var picks = [];
      var byStock = function (s) { return list.filter(function (v) { return v.stock_number === s; })[0]; };
      ["HM-1002", "HM-1003", "HM-1013", "HM-1007"].forEach(function (s) {
        var v = byStock(s); if (v) picks.push(v);
      });
      if (picks.length < 4) picks = list.slice(0, 4);
      mount.innerHTML = "";
      picks.forEach(function (v) { mount.appendChild(vehicleCard(v)); });
    });
  }

  function initInventory() {
    var grid = $("[data-inv-grid]");
    if (!grid) return;
    var state = {
      condition: qs("condition") || "all",
      model: "all",
      min: "",
      max: "",
      sort: "featured"
    };

    loadInventory().then(function (list) {
      // build model dropdown
      var models = list.map(function (v) { return v.model; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
      var modelSel = $("[data-f-model]");
      models.forEach(function (m) { modelSel.appendChild(el("option", { value: m }, m)); });

      // wire condition chips
      Array.prototype.forEach.call(document.querySelectorAll("[data-f-cond]"), function (chip) {
        if (chip.getAttribute("data-f-cond") === state.condition) chip.classList.add("active");
        chip.addEventListener("click", function () {
          document.querySelectorAll("[data-f-cond]").forEach(function (c) { c.classList.remove("active"); });
          chip.classList.add("active");
          state.condition = chip.getAttribute("data-f-cond");
          render();
        });
      });
      modelSel.addEventListener("change", function () { state.model = modelSel.value; render(); });
      $("[data-f-min]").addEventListener("input", function () { state.min = this.value; render(); });
      $("[data-f-max]").addEventListener("input", function () { state.max = this.value; render(); });
      $("[data-f-sort]").addEventListener("change", function () { state.sort = this.value; render(); });
      var reset = $("[data-f-reset]");
      if (reset) reset.addEventListener("click", function () {
        state = { condition: "all", model: "all", min: "", max: "", sort: "featured" };
        modelSel.value = "all"; $("[data-f-min]").value = ""; $("[data-f-max]").value = "";
        $("[data-f-sort]").value = "featured";
        document.querySelectorAll("[data-f-cond]").forEach(function (c) { c.classList.toggle("active", c.getAttribute("data-f-cond") === "all"); });
        render();
      });

      function render() {
        var out = list.filter(function (v) {
          if (state.condition !== "all" && (v.condition || "").toLowerCase() !== state.condition) return false;
          if (state.model !== "all" && v.model !== state.model) return false;
          if (state.min !== "" && v.price_usd < Number(state.min)) return false;
          if (state.max !== "" && v.price_usd > Number(state.max)) return false;
          return true;
        });
        if (state.sort === "price-asc") out.sort(function (a, b) { return a.price_usd - b.price_usd; });
        else if (state.sort === "price-desc") out.sort(function (a, b) { return b.price_usd - a.price_usd; });
        else if (state.sort === "miles-asc") out.sort(function (a, b) { return a.mileage - b.mileage; });

        grid.innerHTML = "";
        if (!out.length) {
          grid.appendChild(el("div", { class: "empty-state" }, "<h3>No vehicles match your filters</h3><p>Try widening your price range or clearing a filter.</p>"));
        } else {
          out.forEach(function (v) { grid.appendChild(vehicleCard(v)); });
        }
        var label = out.length + (out.length === 1 ? " vehicle" : " vehicles") + " available";
        Array.prototype.forEach.call(document.querySelectorAll("[data-inv-count]"), function (rc) { rc.textContent = label; });
      }
      render();
    });
  }

  function initVDP() {
    var mount = $("[data-vdp]");
    if (!mount) return;
    var stock = qs("stock");
    loadInventory().then(function (list) {
      var v = list.filter(function (x) { return x.stock_number === stock; })[0];
      if (!v) {
        mount.innerHTML = '<div class="empty-state"><h3>Vehicle not found</h3><p>This vehicle may have sold. <a href="inventory.html">Browse current inventory →</a></p></div>';
        return;
      }
      document.title = v.year + " " + v.make + " " + v.model + " · Huminic Motors";
      var cond = (v.condition || "").toLowerCase();
      var ctxTag = (v.model + ":" + v.stock_number);

      mount.innerHTML =
        '<div class="crumbs"><a href="index.html">Home</a> / <a href="inventory.html">Inventory</a> / ' + v.year + ' ' + v.model + '</div>' +
        '<div class="vdp-grid">' +
          '<div>' +
            '<div class="vdp-hero ' + gradClass(v.model) + '">' +
              '<span class="badge ' + cond + '">' + (CONDITION_LABEL[cond] || cond) + '</span>' +
              CAR_SVG +
              '<span class="vh-body">' + (v.body || "") + '</span>' +
              '<span class="vh-model">' + v.model + '</span>' +
            '</div>' +
            '<div class="vdp-thumbs">' +
              '<div class="vdp-thumb ' + gradClass(v.model) + '"></div>' +
              '<div class="vdp-thumb ' + gradClass(v.model) + '" style="opacity:.7"></div>' +
              '<div class="vdp-thumb ' + gradClass(v.model) + '" style="opacity:.55"></div>' +
              '<div class="vdp-thumb ' + gradClass(v.model) + '" style="opacity:.4"></div>' +
            '</div>' +
            '<div class="panel" style="margin-top:22px">' +
              '<h2 style="margin-top:0">Overview</h2>' +
              '<p class="muted">This ' + (CONDITION_LABEL[cond] || cond) + ' ' + v.year + ' ' + v.make + ' ' + v.model + ' ' + (v.trim || "") +
                ' in ' + (v.exterior_color || "its factory finish") + ' is ready for a test drive at our Austin showroom. ' +
                (cond === "cpo" ? "As a Certified Pre-Owned vehicle, it includes a multi-point inspection and extended coverage. " : "") +
                'Contact us to check availability, get financing options, or schedule a visit.</p>' +
            '</div>' +
          '</div>' +
          '<div class="vdp-panel">' +
            '<span class="badge ' + cond + '" style="position:static;display:inline-block;margin-bottom:10px">' + (CONDITION_LABEL[cond] || cond) + '</span>' +
            '<h1>' + v.year + ' ' + v.make + ' ' + v.model + '</h1>' +
            '<p class="vdp-sub">' + (v.trim || "") + ' · ' + (v.body || "") + '</p>' +
            '<div class="vdp-price">' + money(v.price_usd) + ' <small>+ tax &amp; fees</small></div>' +
            '<div class="vdp-actions">' +
              '<button class="btn btn-primary" data-vdp-chat>Chat</button>' +
              '<button class="btn btn-outline" data-vdp-text>Text Us</button>' +
              '<button class="btn btn-outline full" data-vdp-callback>Call Me Back</button>' +
              '<button class="btn btn-primary" data-vdp-testdrive>Schedule Test Drive</button>' +
              '<button class="btn btn-ghost" data-vdp-avail>Check Availability</button>' +
            '</div>' +
            '<table class="spec-table">' +
              row("Year", v.year) + row("Make", v.make) + row("Model", v.model) +
              row("Trim", v.trim) + row("Body", v.body) +
              row("Mileage", num(v.mileage) + " mi") +
              row("Price", money(v.price_usd)) +
              row("Exterior", v.exterior_color) +
              row("Condition", CONDITION_LABEL[cond] || cond) +
              row("VIN", v.vin) + row("Stock #", v.stock_number) +
            '</table>' +
            '<p class="vdp-disclaim">Demo listing. Pricing and availability shown are illustrative for this demonstration.</p>' +
          '</div>' +
        '</div>';

      function row(k, val) { return '<tr><td class="k">' + k + '</td><td class="v">' + (val == null ? "" : val) + '</td></tr>'; }

      // widget actions
      $("[data-vdp-chat]", mount).addEventListener("click", function () { openWidget("chat"); });
      $("[data-vdp-text]", mount).addEventListener("click", function () { if (!openWidget("form")) openWidget("chat"); });
      $("[data-vdp-callback]", mount).addEventListener("click", function () { if (!openWidget("callback")) openWidget("chat"); });
      // site lead-capture actions
      $("[data-vdp-testdrive]", mount).addEventListener("click", function () {
        gate({ kicker: "Schedule a test drive", title: "Book your test drive", desc: "Tell us how to reach you and we'll confirm a time for the " + v.year + " " + v.model + ".", cta: "Request test drive", ctxLabel: "Test drive · " + v.year + " " + v.model + " (#" + v.stock_number + ")", context: "test_drive:" + ctxTag });
      });
      $("[data-vdp-avail]", mount).addEventListener("click", function () {
        gate({ kicker: "Check availability", title: "Is it still available?", desc: "Leave your details and we'll confirm availability of the " + v.year + " " + v.model + " right away.", cta: "Check availability", ctxLabel: "Availability · " + v.year + " " + v.model + " (#" + v.stock_number + ")", context: "check_availability:" + ctxTag });
      });
    });
  }

  /* Generic CTA wiring via data attributes:
     data-lead-cta with data-lead-context / data-lead-title etc. */
  function initLeadCtas() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-lead-cta]"), function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        gate({
          kicker: btn.getAttribute("data-lead-kicker") || "Let's connect",
          title: btn.getAttribute("data-lead-title") || "Let's set this up",
          desc: btn.getAttribute("data-lead-desc") || "Leave your details and our AI assistant will reach out right away.",
          cta: btn.getAttribute("data-lead-btn") || "Continue",
          ctxLabel: btn.getAttribute("data-lead-ctxlabel") || "",
          context: btn.getAttribute("data-lead-context") || "cta"
        });
      });
    });
  }

  function initContactForm() {
    var form = $("[data-contact-form]");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = (form.querySelector("[name='name']") || {}).value || "";
      var phone = (form.querySelector("[name='phone']") || {}).value || "";
      var email = (form.querySelector("[name='email']") || {}).value || "";
      var msg = (form.querySelector("[name='message']") || {}).value || "";

      // route through capture flow; prefill what we have
      var m = buildModal();
      if (name) $("[data-in='name']", m).value = name.trim();
      if (phone) $("[data-in='phone']", m).value = phone.trim();
      if (email) $("[data-in='email']", m).value = email.trim();

      if (isCaptured()) {
        // already captured — treat as an immediate confirmation
        openModal({ kicker: "Message received", title: "Book your test drive", desc: "", context: "contact_form" });
        // show success straight away
        pendingContext = "contact_form" + (msg ? ":msg" : "");
        showSuccess();
        return;
      }
      openModal({
        kicker: "Contact us",
        title: "Almost there",
        desc: "Confirm your contact info and our AI assistant will follow up on your message right away.",
        cta: "Send message",
        ctxLabel: "Contact form",
        context: "contact_form" + (msg ? ":with_message" : "")
      });
    });
  }

  /* prefill any generic prospect param into contact form */
  function prefillFromParams() {
    var pname = qs("prospect");
    if (!pname) return;
    var f = $("[data-contact-form]");
    if (f && f.querySelector("[name='name']")) f.querySelector("[name='name']").value = pname;
  }

  /* ================= BOOT ================= */
  function boot() {
    renderHeader();
    renderFooter();
    initFeatured();
    initInventory();
    initVDP();
    initLeadCtas();
    initContactForm();
    prefillFromParams();
    startToasts();
    maybeSoftModal();
  }

  // expose a tiny API for inline use if needed
  window.HuminicSite = {
    gate: gate,
    openWidget: openWidget,
    session: SESSION,
    isCaptured: isCaptured
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
