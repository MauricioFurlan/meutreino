const CACHE_NAME = 'meutreino-v1';
const urlsToCache = [
  '/meutreino/',
  '/meutreino/index.html',
  '/meutreino/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Network first, fallback to cache (para sempre ter dados frescos do Supabase)
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cacheia uma cópia das respostas de arquivos estáticos
        if (event.request.url.includes('/meutreino/') && !event.request.url.includes('supabase')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
