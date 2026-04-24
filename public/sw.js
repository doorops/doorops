// Service Worker — DoorOps v2
// Force clear all caches on install
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

// Network-first — never serve auth from cache
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request).catch(() => {
    return caches.match(event.request);
  }));
});
