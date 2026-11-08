/* Beauty Concept – service worker: l'app funziona anche senza internet */
const CACHE = 'beauty-concept-v3';
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const ASSETS = ['./', './index.html', './style.css', './app.js', './cloud.js', './firebase-config.js',
  './appuntamento.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './logo.png', './logo-256.png',
  FB + 'firebase-app.js', FB + 'firebase-auth.js', FB + 'firebase-firestore.js'];

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
  // librerie Firebase: copia salvata sul telefono (servono anche offline)
  if (url.href.startsWith(FB)) {
    e.respondWith(caches.match(req).then(c => c || fetch(req).then(r => salva(req, r))));
    return;
  }
  if (url.origin !== location.origin) return; // database e login Firebase vanno sempre in rete
  // file dell'app: risposta immediata dalla copia, aggiornata in background
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(cached => {
    const net = fetch(req).then(r => (url.search ? r : salva(req, r))).catch(() => cached);
    return cached || net;
  }));
});
