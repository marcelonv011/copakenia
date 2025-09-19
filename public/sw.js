// sw.js - simple "network first" fallback
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

// Opcional: cache básico para funcionar offline
const CACHE = 'ck-static-v1';
const ASSETS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .catch(() => null)
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // solo GET
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then((r) => r || caches.match('/'))
    )
  );
});
