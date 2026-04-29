const CACHE_NAME = 'gomna-v21';
const DATA_CACHE_NAME = 'gomna-data-v21';
const APP_SHELL_CACHE = [
  '/',
  '/index.html',
  '/index_new.html',
  '/favicon.png',
  '/manifest.json'
];

function isDataRequest(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return /\/gomna_data_.*\.js$/i.test(url.pathname);
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL_CACHE))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== DATA_CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  if (isDataRequest(event.request)) {
    // Cache-first for large Bible data files, with network fallback.
    event.respondWith(
      caches.open(DATA_CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response && response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => caches.match(event.request));
        })
      )
    );
    return;
  }

  // Network-first for everything else, preserving offline fallback.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
