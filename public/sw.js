// Service Worker for PBooks Pro Cloud (PWA)
// CACHE_NAME is injected at build time from version.json.

const CACHE_NAME = 'pbookspro-2026.06.21.315';
const IMMUTABLE_ASSET_PATTERN = /\/assets\/[^/]+-[a-f0-9]{8,}\.(js|css|woff2?|png|jpg|jpeg|gif|svg|webp|wasm)$/i;

const NEVER_CACHE_PATHS = new Set([
  '/index.html',
  '/version.json',
  '/manifest.json',
  '/sw.js',
  '/env-config.json',
]);

/** Offline / error fallback URLs — relative to SW scope. */
const SHELL_URLS = ['./index.html', './manifest.json'];

/** Vite dev / preview — never intercept (breaks HMR and module loading). */
const DEV_PORTS = new Set(['5173', '5174', '4173']);

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

function isDevBypass(url) {
  if (DEV_PORTS.has(url.port)) return true;
  if (url.hostname.includes('admin')) return true;
  if (url.pathname.includes('/@vite')) return true;
  if (url.pathname.includes('/@react-refresh')) return true;
  if (url.pathname.includes('/src/')) return true;
  if (url.search.includes('t=')) return true;
  return false;
}

/** event.respondWith() must always settle to a Response. */
function respond(event, promise) {
  event.respondWith(
    Promise.resolve(promise).then(
      (value) => (value instanceof Response ? value : Response.error()),
      () => Response.error()
    )
  );
}

async function cacheMatchVariants(request) {
  const url = new URL(request.url);
  const keys = [request, request.url, url.pathname];
  if (url.pathname.startsWith('/')) {
    keys.push('.' + url.pathname);
  }
  for (const key of keys) {
    const hit = await caches.match(key);
    if (hit) return hit;
  }
  return undefined;
}

async function fallbackResponse(request) {
  const cached = await cacheMatchVariants(request);
  if (cached) return cached;

  const path = normalizePath(new URL(request.url).pathname);
  const wantsShell =
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    path.endsWith('/index.html');

  if (wantsShell) {
    for (const shellUrl of SHELL_URLS) {
      const shell = await caches.match(shellUrl);
      if (shell) return shell;
    }
  }

  return Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(
        SHELL_URLS.map(async (url) => {
          try {
            await cache.add(url);
          } catch {
            /* offline install — activate without shell */
          }
        })
      );
      await self.skipWaiting();
    })()
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

  if (isDevBypass(url)) {
    return;
  }

  if (shouldNeverCache(url)) {
    respond(
      event,
      fetch(event.request, { cache: 'no-store' }).catch(() => fallbackResponse(event.request))
    );
    return;
  }

  if (isImmutableHashedAsset(url)) {
    const isScriptOrStyle = /\.(js|css)(?:\?|$)/i.test(url.pathname);
    if (isScriptOrStyle) {
      respond(
        event,
        fetch(event.request, { cache: 'no-store' })
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => fallbackResponse(event.request))
      );
      return;
    }

    respond(
      event,
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      }).catch(() => fallbackResponse(event.request))
    );
    return;
  }

  respond(
    event,
    fetch(event.request)
      .catch(() => fallbackResponse(event.request))
  );
});
