// v5: notificações push (handlers no fim do arquivo). Trocar o nome do
// cache é o que descarta a lista antiga no activate — sem isso o celular
// continuaria servindo o HTML antigo.
const CACHE_NAME = 'meutreino-v5';
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

// === Notificações push ===
// Quem manda é a Edge Function send-push. O payload é
// { title, body, tag, url }. A tag faz o lembrete novo substituir o antigo na
// bandeja em vez de empilhar.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'MeuTreino', {
      body: data.body || '',
      tag: data.tag || 'meutreino',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/index.html' }
    })
  );
});

// Toque na notificação: volta para o app se ele já estiver aberto, senão abre.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(url) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
