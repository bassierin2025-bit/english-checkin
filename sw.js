// Service Worker — cache-first offline support
const VERSION = 'v17';
const CACHE = 'english-checkin-' + VERSION;

const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
];

const CDN = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // core MUST succeed
    await cache.addAll(CORE);
    // CDN best-effort — don't fail install if any CDN is unreachable
    await Promise.all(CDN.map(url =>
      fetch(url, { mode: 'no-cors' }).then(r => cache.put(url, r)).catch(() => {})
    ));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  e.respondWith((async () => {
    // 1. Try cache
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) {
      // Refresh in background (stale-while-revalidate) for same-origin
      if (new URL(req.url).origin === self.location.origin) {
        fetch(req).then(resp => {
          if (resp && resp.status === 200) {
            caches.open(CACHE).then(c => c.put(req, resp.clone()));
          }
        }).catch(() => {});
      }
      return cached;
    }

    // 2. Try network, cache on success
    try {
      const resp = await fetch(req);
      if (resp && resp.status === 200 && req.url.startsWith('http')) {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
      }
      return resp;
    } catch (err) {
      // 3. Offline + nothing in cache → serve app shell for navigations
      if (req.mode === 'navigate' || req.destination === 'document') {
        return caches.match('./index.html');
      }
      throw err;
    }
  })());
});

// Allow page to trigger an update check
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
