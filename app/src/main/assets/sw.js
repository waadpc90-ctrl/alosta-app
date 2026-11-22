const CACHE_NAME = 'alosta-pwa-v1.0.19';
const CORE_SHELL = [
  './vendor/app-tailwind.css?v=v1_0_19',
  './vendor/react.production.min.js',
  './vendor/react-dom.production.min.js',
  './vendor/qrious.min.js',
  './vendor/firebase-app.js',
  './vendor/firebase-auth.js',
  './vendor/firebase-firestore.js',
  './vendor/lucide.min.js',
  './vendor/alosta-engine.js?v=v1_0_19',
  './vendor/app-compiled.js?v=v1_0_19',
  './apple-touch-icon.png',
  './app-icon-192.png',
  './app-icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_SHELL).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = req.url || '';
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('.apk') ||
    url.includes('.mp4') ||
    url.includes('__portal_status')
  ) {
    return;
  }

  // Network-First for HTML, manifest, and our own app bundles so iOS/Web PWA users ALWAYS receive updates immediately
  const isNetworkFirst =
    req.mode === 'navigate' ||
    url.endsWith('.html') ||
    url.endsWith('.json') ||
    url.endsWith('/') ||
    url.includes('app-compiled.js') ||
    url.includes('dashboard-compiled.js') ||
    url.includes('alosta-engine.js') ||
    url.includes('app-tailwind.css');

  if (isNetworkFirst) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache-First for immutable third-party vendor libs and static icons
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok && url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
