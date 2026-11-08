/* Beauty Concept – service worker: l'app funziona anche senza internet */
const CACHE = 'beauty-concept-v2';
const ASSETS = ['./', './index.html', './style.css', './app.js', './appuntamento.html',
  './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './logo.png', './logo-256.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(cached => {
    const net = fetch(req).then(res => {
      if (res.ok && !new URL(req.url).search) caches.open(CACHE).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => cached);
    return cached || net;
  }));
});
