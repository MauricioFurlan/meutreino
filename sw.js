// v4: tema MuscleFit (preto + ciano) e a nova brand.css. Trocar o nome do
// cache é o que descarta a lista antiga no activate — sem isso o celular
// continuaria servindo o CSS/HTML do tema antigo.
const CACHE_NAME = 'meutreino-v4';
const urlsToCache = [
  '/login.html',
  '/index.html',
  '/professor.html',
  '/treinos.html',
  '/editor.html',
  '/anamnese.html',
  '/treinador.html',
  '/owner.html',
  '/anotacoes.html',
  '/evolucao.html',
  '/auth-guard.js',
  '/metrics.js',
  '/manifest.json',
  '/manifest-pro.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-pro-192.png',
  '/icon-pro-512.png'
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

  // CDN (supabase-js, chart.js) — cache first (muda pouco)
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

  // Páginas do app — network first, fallback cache (funciona offline)
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
