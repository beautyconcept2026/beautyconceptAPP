/* Beauty Concept – service worker: l'app funziona anche senza internet */
importScripts('ics.js');
const CACHE = 'beauty-concept-v13';
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const ASSETS = ['./', './index.html', './diagnosi.js', './style.css', './app.js', './import-gcal.js', './rubrica.js', './cloud.js', './assistente.js', './firebase-config.js',
  './appuntamento.html', './ics.js', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './logo.png', './logo-256.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))));
  self.clients.claim();
});
const salva = (req, res) => { if (res && res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); } return res; };
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // file calendario dell'appuntamento, creato al volo dai dati del link
  if (url.origin === location.origin && url.pathname.endsWith('/evento.ics')) {
    const d = self.BCIcs.daParametri(url.search);
    e.respondWith(d
      ? new Response(self.BCIcs.crea(d), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="appuntamento.ics"' } })
      : new Response('Link non valido', { status: 404 }));
    return;
  }
  // librerie Firebase: copia salvata sul telefono (servono anche offline)
  if (url.href.startsWith(FB)) {
    e.respondWith(caches.match(req).then(c => c || fetch(req).then(r => salva(req, r))));
    return;
  }
  if (url.origin !== location.origin) return; // database e login Firebase vanno sempre in rete
  // file dell'app: con internet sempre la versione più nuova (così non si mischiano versioni),
  // senza internet (o rete lentissima) la copia salvata sul telefono
  e.respondWith(new Promise(resolve => {
    let fatto = false;
    const daCache = () => caches.match(req, { ignoreSearch: true }).then(c => c || caches.match('./index.html'));
    const timer = setTimeout(() => daCache().then(c => { if (c && !fatto) { fatto = true; resolve(c); } }), 4000);
    fetch(req, { cache: 'no-cache' })
      .then(r => { if (!url.search) salva(req, r); if (!fatto) { fatto = true; clearTimeout(timer); resolve(r); } })
      .catch(() => daCache().then(c => { if (!fatto) { fatto = true; clearTimeout(timer); resolve(c || Response.error()); } }));
  }));
});
