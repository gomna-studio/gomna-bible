const CACHE_NAME = 'gomna-v1';
const urlsToCache = [
  '/gomna-bible/gomna_blue.html',
  '/gomna-bible/favicon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
