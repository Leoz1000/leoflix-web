// LeoTv service worker. It makes the web app installable and lets it open
// quickly, but it never stores the catalog, the account data or the video:
// - pages: always from the network, the saved copy only when offline;
// - hashed files in assets/: saved once, they never change;
// - api, video and version checks: never touched.
const CACHE = 'leotv-app-2';
const MAX_FILES = 60;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  // the oldest files go first, so old builds do not pile up
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_FILES; i++) await cache.delete(keys[i]);
}

async function fromNetworkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    // only the app's own page is kept for offline use
    if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) await cache.put('./', response.clone());
    return response;
  } catch (err) {
    const saved = await cache.match('./');
    if (saved) return saved;
    throw err;
  }
}

async function fromCacheFirst(request) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    trim(cache);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (path.includes('/api/') || path.endsWith('/version.json') || path.endsWith('/sw.js')) return;
  // the app download (and its short page) go straight to the network
  if (path.endsWith('.apk') || /\/apk\/?$/.test(path)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fromNetworkFirst(request));
  } else if (path.includes('/assets/')) {
    event.respondWith(fromCacheFirst(request));
  }
});
