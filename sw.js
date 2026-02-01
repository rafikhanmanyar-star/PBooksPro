// Service Worker for PBooksPro
const CACHE_NAME = 'finance-tracker-pro-v1.1.4';
const urlsToCache = [
  './',
  './index.html',
  './index.tsx',
  './App.tsx',
  './manifest.json',
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((err) => {
        console.error('Cache install failed:', err);
      })
  );
  // REMOVED: self.skipWaiting() - Don't automatically take control
  // The service worker will wait until user chooses to update
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // REMOVED: self.clients.claim() - Don't automatically take control
  // Wait for user action before activating new version
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Don't intercept requests from admin portal (port 5174) or Vite internals
  const url = new URL(event.request.url);
  if (url.port === '5174' || url.hostname.includes('admin') ||
    url.pathname.includes('/@vite') || url.pathname.includes('/@react-refresh') ||
    url.pathname.includes('/src/') || url.pathname.includes('.ts') || url.pathname.includes('.tsx') ||
    url.search.includes('t=')) { // Vite timestamp
    return; // Let the request go through normally
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      })
      .catch(() => {
        // If both fail, return offline page or fallback
        if (event.request.destination === 'document') {
          return caches.match('./index.html').then(indexRes => {
            return indexRes || new Response('<h1>Offline</h1><p>You are offline and the app is not cached.</p>', {
              status: 503,
              headers: { 'Content-Type': 'text/html' }
            });
          });
        }

        // Ensure we return a valid response object for non-document requests to avoid "Failed to convert value to 'Response'"
        return new Response('Offline/Network Error', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' })
        });
      })
  );
});

// Listen for SKIP_WAITING message from client (user-initiated update)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    // User requested update - now take control
    self.skipWaiting();
  }
});

