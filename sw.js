// Bump this version number on every deploy to invalidate the cache.
const CACHE_NAME = 'tsv-bkk-v58-' + '20260418v22';

const APP_SHELL = [
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/members.js',
  './js/data.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/gks-logo.png'
];

const EXTERNAL_CACHE = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll([...APP_SHELL, ...EXTERNAL_CACHE]).catch(() => {})
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    (async () => {
      // Delete ALL older caches
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
      await self.clients.claim();
      // NOTE: no forced client.navigate() here — that raced with the
      // client-side `controllerchange` → window.location.reload() handler
      // and caused the app to hang mid-load after a deploy. The client
      // already auto-reloads once when the new SW takes control.
    })()
  );
});

// Network-first for app shell (HTML/JS/CSS/JSON) so users ALWAYS get latest after a deploy.
// Cache-first for external libs + tiles (they rarely change).
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Never intercept Firebase, Telegram, Sheets APIs, or map tiles
  if (url.includes('firebaseio.com') ||
      url.includes('api.telegram.org') ||
      url.includes('googleusercontent.com') ||
      url.includes('script.google.com') ||
      url.includes('googleapis.com') ||
      url.includes('tile.openstreetmap.org')) {
    return;
  }

  // Leaflet CDN — cache-first
  if (url.includes('unpkg.com')) {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        }).catch(() => cached)
      )
    );
    return;
  }

  // App shell — network-first, fall back to cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache fresh copy
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')))
  );
});

// Allow clients to ask sw to skip waiting (hard-refresh trigger)
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
