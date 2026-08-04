const CACHE_NAME = 'treino-v3';
const urlsToCache = [
  '/meutreino/login.html',
  '/meutreino/index.html',
  '/meutreino/professor.html',
  '/meutreino/editor.html',
  '/meutreino/anamnese.html',
  '/meutreino/treinador.html',
  '/meutreino/owner.html',
  '/meutreino/auth-guard.js',
  '/meutreino/manifest.json',
  '/meutreino/icon-192.svg',
  '/meutreino/icon-512.svg'
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
  const url = event.request.url;

  // NUNCA cachear requisições ao Supabase (dados autenticados, tempo real)
  if (url.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // CDN (chart.js, supabase-js) — cache first (muda pouco)
  if (url.includes('cdn.jsdelivr.net')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // Páginas do app — network first, fallback cache (para funcionar offline)
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
