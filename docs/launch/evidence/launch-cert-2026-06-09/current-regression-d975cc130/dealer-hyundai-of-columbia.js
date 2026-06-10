(function(){
  var CFG = {"profile":"hyundai-of-columbia","origin":"https://studio.huminic.app","name":"Hyundai of Columbia","accent":"#0d9488","subtitle":"Choose how to connect","channels":{"chat":true,"callback":true,"form":true,"video":true},"chatSlug":"hyundai-of-columbia-sales-chat","formSlug":"hyundai-of-columbia-contact","videoAgent":"Caroline"};
  var FLAG = '__huminicWidget_' + CFG.profile.replace(/[^a-z0-9]/gi,'_');
  if (window[FLAG]) return; window[FLAG] = true;
  var O = CFG.origin, ACCENT = CFG.accent;

  var ICON = {
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>'
  };
  function svg(p, cls, color){ return '<svg viewBox="0 0 24 24" fill="none" stroke="'+(color||'currentColor')+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:'+(cls||20)+'px;height:'+(cls||20)+'px">'+p+'</svg>'; }
  function esc(s){ return String(s||'').replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  var OPTIONS = [
    { key:'chat', on: CFG.channels.chat, label:'Web Chat', sub:'Chat with our AI assistant', icon:ICON.chat, bg:'#eff6ff', fg:'#2563eb' },
    { key:'callback', on: CFG.channels.callback, label:'Instant Call Back', sub:'Get a call back now', icon:ICON.phone, bg:'#ecfdf5', fg:'#059669' },
    { key:'form', on: CFG.channels.form, label:'Contact Form', sub:'Send us a message', icon:ICON.send, bg:'#fff7ed', fg:'#ea580c' },
    { key:'video', on: CFG.channels.video, label:'Two-Way Video', sub:'Face-to-face with '+esc(CFG.videoAgent), icon:ICON.video, bg:'#faf5ff', fg:'#9333ea' }
  ].filter(function(o){ return o.on; });

  var root = document.createElement('div');
  root.id = 'huminic-dealer-widget';
  root.style.cssText = 'all:initial;font-family:system-ui,-apple-system,Segoe UI,sans-serif;';
  document.body.appendChild(root);

  var panel = null, open = false, view = 'menu', overlay = null;

  function launcher(){
    var b = document.createElement('button');
    b.type='button';
    b.setAttribute('aria-label','Choose how to connect');
    b.style.cssText='position:fixed;right:24px;bottom:24px;z-index:2147483000;width:56px;height:56px;border:0;border-radius:9999px;background:'+ACCENT+';color:#fff;box-shadow:0 8px 24px rgba(15,23,42,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;';
    b.innerHTML = svg(ICON.chat, 22, '#fff');
    b.onclick = function(){ open ? close() : openMenu(); };
    return b;
  }
  var btn = launcher();
  root.appendChild(btn);

  function openMenu(){ open=true; view='menu'; render(); btn.innerHTML = svg(ICON.x,22,'#fff'); }
  function close(){ open=false; if(panel){panel.remove();panel=null;} btn.innerHTML = svg(ICON.chat,22,'#fff'); }

  function header(title, sub, withBack){
    var h = '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px;color:#fff;background:'+ACCENT+'">'
      + '<div style="display:flex;align-items:center;gap:8px">'
      + (withBack
          ? '<button data-act="back" aria-label="Back" style="background:none;border:0;color:rgba(255,255,255,.85);cursor:pointer;display:flex">'+svg(ICON.back,16,'#fff')+'</button>'
          : '<div style="width:32px;height:32px;border-radius:9999px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center">'+svg(ICON.chat,16,'#fff')+'</div>')
      + '<div><div style="font-size:14px;font-weight:600">'+esc(title)+'</div><div style="font-size:12px;color:rgba(255,255,255,.7)">'+esc(sub)+'</div></div>'
      + '</div>'
      + '<button data-act="close" aria-label="Close" style="background:none;border:0;color:rgba(255,255,255,.7);cursor:pointer;display:flex">'+svg(ICON.x,16,'#fff')+'</button>'
      + '</div>';
    return h;
  }

  function render(){
    if(!panel){
      panel = document.createElement('div');
      panel.style.cssText='position:fixed;right:24px;bottom:88px;z-index:2147483000;width:320px;max-width:calc(100vw - 32px);background:#fff;border:1px solid #f3f4f6;border-radius:16px;box-shadow:0 20px 60px rgba(15,23,42,.28);overflow:hidden';
      root.appendChild(panel);
    }
    var body='';
    if(view==='menu'){
      body = header(CFG.name, CFG.subtitle, false) + '<div style="padding:12px;display:flex;flex-direction:column;gap:8px">';
      OPTIONS.forEach(function(o){
        body += '<button data-opt="'+o.key+'" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:1px solid #f3f4f6;border-radius:12px;padding:12px;background:#fff;cursor:pointer">'
          + '<div style="width:40px;height:40px;border-radius:12px;background:'+o.bg+';display:flex;align-items:center;justify-content:center;flex-shrink:0">'+svg(o.icon,20,o.fg)+'</div>'
          + '<div><div style="font-size:14px;font-weight:500;color:#111827">'+esc(o.label)+'</div><div style="font-size:12px;color:#6b7280">'+esc(o.sub)+'</div></div>'
          + '</button>';
      });
      body += '</div>';
    } else if(view==='chat'){
      body = header(CFG.name,'Web Chat',true) + '<iframe title="Web chat" src="'+O+'/w/'+encodeURIComponent(CFG.chatSlug)+'" style="width:100%;height:520px;border:0;display:block"></iframe>';
    } else if(view==='form'){
      body = header(CFG.name,'Contact Form',true) + '<iframe title="Contact form" src="'+O+'/w/'+encodeURIComponent(CFG.formSlug)+'" style="width:100%;height:520px;border:0;display:block"></iframe>';
    } else if(view==='callback'){
      body = header(CFG.name,'Instant Call Back',true) + callbackForm();
    }
    panel.innerHTML = body;
    wire();
  }

  function callbackForm(){
    return '<form data-cb="1" style="padding:16px;display:flex;flex-direction:column;gap:12px">'
      + '<div style="font-size:12px;color:#6b7280">Leave your number and we\'ll call you right back.</div>'
      + '<input name="name" placeholder="Your name" style="width:100%;box-sizing:border-box;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;font-size:14px"/>'
      + '<input name="phone" placeholder="Phone number" required style="width:100%;box-sizing:border-box;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;font-size:14px"/>'
      + '<textarea name="message" rows="2" placeholder="What can we help with? (optional)" style="width:100%;box-sizing:border-box;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;font-size:14px"></textarea>'
      + '<div data-cbmsg style="font-size:12px;color:#dc2626;display:none">Something went wrong — please try again.</div>'
      + '<button type="submit" style="width:100%;border:0;border-radius:8px;padding:8px;font-size:14px;font-weight:600;color:#fff;background:'+ACCENT+';cursor:pointer">Request call back</button>'
      + '</form>';
  }

  function wire(){
    panel.querySelectorAll('[data-act="close"]').forEach(function(e){ e.onclick=close; });
    panel.querySelectorAll('[data-act="back"]').forEach(function(e){ e.onclick=function(){ view='menu'; render(); }; });
    panel.querySelectorAll('[data-opt]').forEach(function(e){
      e.onclick=function(){
        var k=e.getAttribute('data-opt');
        if(k==='video'){ close(); startVideo(); return; }
        view=k; render();
      };
    });
    var form = panel.querySelector('form[data-cb]');
    if(form){
      form.onsubmit=function(ev){
        ev.preventDefault();
        var fd=new FormData(form);
        var phone=(fd.get('phone')||'').toString().trim();
        if(!phone) return;
        var btnEl=form.querySelector('button[type=submit]');
        btnEl.textContent='Sending…'; btnEl.disabled=true;
        fetch(O+'/api/public/callback-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:CFG.profile,name:fd.get('name'),phone:phone,message:fd.get('message')})})
          .then(function(r){return r.json();})
          .then(function(d){
            if(d && d.ok){ panel.querySelector('form[data-cb]').outerHTML='<div style="padding:24px;text-align:center"><div style="font-size:14px;font-weight:500;color:#111827">You\'re all set.</div><div style="font-size:12px;color:#6b7280;margin-top:4px">We\'ll call you back shortly.</div></div>'; }
            else { fail(); }
          })
          .catch(fail);
        function fail(){ var m=form.querySelector('[data-cbmsg]'); if(m)m.style.display='block'; btnEl.textContent='Request call back'; btnEl.disabled=false; }
      };
    }
  }

  function startVideo(){
    overlay = document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#000;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML='<button data-vclose aria-label="End video" style="position:absolute;top:16px;right:16px;z-index:10;border:0;border-radius:9999px;background:rgba(255,255,255,.15);color:#fff;padding:8px;cursor:pointer">'+svg(ICON.x,18,'#fff')+'</button><p style="color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:40px">Connecting to video chat…</p>';
    document.body.appendChild(overlay);
    overlay.querySelector('[data-vclose]').onclick=endVideo;
    fetch(O+'/api/public/video-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:CFG.profile})})
      .then(function(r){return r.json();})
      .then(function(d){
        if(d && d.ok && d.conversationUrl){
          var f=document.createElement('iframe');
          f.title='Video chat'; f.src=d.conversationUrl; f.allow='microphone; camera; autoplay; display-capture';
          f.style.cssText='width:100%;height:100%;border:0';
          overlay.innerHTML=''; overlay.appendChild(f);
          var c=document.createElement('button'); c.innerHTML=svg(ICON.x,18,'#fff');
          c.style.cssText='position:absolute;top:16px;right:16px;z-index:10;border:0;border-radius:9999px;background:rgba(255,255,255,.15);color:#fff;padding:8px;cursor:pointer';
          c.onclick=endVideo; overlay.appendChild(c);
        } else { videoError(); }
      })
      .catch(videoError);
  }
  function videoError(){ if(overlay) overlay.innerHTML='<button data-vclose aria-label="End video" style="position:absolute;top:16px;right:16px;border:0;border-radius:9999px;background:rgba(255,255,255,.15);color:#fff;padding:8px;cursor:pointer">'+svg(ICON.x,18,'#fff')+'</button><p style="color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:40px">Video chat is temporarily unavailable. Please try Web Chat instead.</p>'; if(overlay){var b=overlay.querySelector('[data-vclose]'); if(b)b.onclick=endVideo;} }
  function endVideo(){ if(overlay){overlay.remove();overlay=null;} }
})();
