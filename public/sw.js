// Minimal service worker for field use:
//  - static assets (/_next/static, icons): cache-first (immutable)
//  - page navigations: network-first with cached fallback, then /offline
//  - API requests: never intercepted (the outbox handles offline writes)
// Registered in production builds only (see components/pwa-register.tsx).

const STATIC_CACHE = 'sf-static-v1';
const PAGE_CACHE = 'sf-pages-v1';
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }
  // Data and auth must always hit the network.
  if (url.pathname.startsWith('/api/')) return;

  // Immutable build assets: cache-first.
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/icon.svg' ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(event.request).then(
          (hit) =>
            hit ||
            fetch(event.request).then((res) => {
              if (res.ok) cache.put(event.request, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }

  // Page navigations: network-first, cached copy offline, /offline last.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(event.request)
            .then((hit) => hit || caches.match(OFFLINE_URL)),
        ),
    );
  }
});
