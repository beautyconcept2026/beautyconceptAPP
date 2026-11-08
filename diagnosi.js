'use strict';
/* Beauty Concept – diagnosi: mostra gli errori a schermo e permette di forzare l'aggiornamento */
(function () {
  function banner(msg) {
    let b = document.getElementById('errBanner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'errBanner';
      b.style.cssText = 'position:fixed;left:10px;right:10px;top:calc(10px + env(safe-area-inset-top));z-index:9999;background:#c2465a;color:#fff;border-radius:16px;padding:12px 14px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3)';
      document.body.appendChild(b);
    }
    b.innerHTML = '<b>Si è verificato un problema</b><br><span style="opacity:.9;word-break:break-word"></span>' +
      '<div style="display:flex;gap:8px;margin-top:10px"><button id="errAgg" style="flex:1;border:0;border-radius:10px;padding:9px;font-weight:600;background:#fff;color:#c2465a">🔄 Aggiorna app</button>' +
      '<button id="errChiudi" style="border:0;border-radius:10px;padding:9px 12px;background:rgba(255,255,255,.2);color:#fff">Chiudi</button></div>';
    b.querySelector('span').textContent = msg;
    b.querySelector('#errAgg').onclick = aggiornaApp;
    b.querySelector('#errChiudi').onclick = () => b.remove();
  }
  window.addEventListener('error', e => {
    if (!e.message || /ResizeObserver/.test(e.message)) return;
    banner(e.message + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : ''));
  });
  window.addEventListener('unhandledrejection', e => {
    const m = e.reason && (e.reason.message || String(e.reason));
    if (m && !/offline|network|Failed to fetch|unavailable/i.test(m)) banner(m);
  });

  // Forza il caricamento dell'ultima versione: svuota la memoria dei file dell'app (NON i dati)
  async function aggiornaApp() {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if (window.caches) {
        const k = await caches.keys();
        await Promise.all(k.filter(x => x.startsWith('beauty-concept')).map(x => caches.delete(x)));
      }
    } catch (e) { /* ignora */ }
    location.replace(location.pathname + '?v=' + Date.now());
  }
  window.BCAggiorna = aggiornaApp;
  document.addEventListener('click', e => { if (e.target.closest('[data-aggiorna]')) aggiornaApp(); });
})();
