// Service Worker for PBooks Pro Cloud (PWA)
// CACHE_NAME is injected at build time from version.json.

const CACHE_NAME = '%%PBOOKS_CACHE_NAME%%';
const IMMUTABLE_ASSET_PATTERN = /\/assets\/[^/]+-[a-f0-9]{8,}\.(js|css|woff2?|png|jpg|jpeg|gif|svg|webp|wasm)$/i;

const NEVER_CACHE_PATHS = new Set([
  '/index.html',
  '/version.json',
  '/manifest.json',
  '/sw.js',
  '/env-config.json',
]);

function normalizePath(pathname) {
  if (pathname === '/' || pathname === '') return '/index.html';
  return pathname.endsWith('/') ? `${pathname}index.html` : pathname;
}

function shouldNeverCache(url) {
  const path = normalizePath(url.pathname);
  if (NEVER_CACHE_PATHS.has(path)) return true;
  if (path.endsWith('/index.html')) return true;
  if (path.endsWith('/version.json')) return true;
  if (path.endsWith('/manifest.json')) return true;
  if (path.endsWith('/sw.js')) return true;
  return false;
}

function isImmutableHashedAsset(url) {
  return IMMUTABLE_ASSET_PATTERN.test(url.pathname);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    return;
  }

  if (
    url.port === '5174' ||
    url.hostname.includes('admin') ||
    url.pathname.includes('/@vite') ||
    url.pathname.includes('/@react-refresh') ||
    url.pathname.includes('/src/') ||
    url.search.includes('t=')
  ) {
    return;
  }

  if (shouldNeverCache(url)) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (isImmutableHashedAsset(url)) {
    const isScriptOrStyle = /\.(js|css)(?:\?|$)/i.test(url.pathname);
    if (isScriptOrStyle) {
      // Network-first for JS/CSS so refresh picks up new deployments immediately.
      event.respondWith(
        fetch(event.request, { cache: 'no-store' })
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => caches.match(event.request))
      );
      return;
    }

    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Default: network-first for everything else (icons, unhashed public files).
  event.respondWith(
    fetch(event.request)
      .then((response) => response)
      .catch(() => caches.match(event.request))
  );
});
