const CACHE_NAME = 'gsa-store-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo-gsa-hub.jpg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(() => {})
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Ignora requisições que não sejam GET ou que sejam para APIs externas ou rotas internas do Vite/HMR
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    !event.request.url.startsWith(self.location.origin) ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/')
  ) {
    return;
  }

  // Para navegação SPA interna, tenta rede e faz fallback para index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cachedIndex = await caches.match('/index.html');
        return cachedIndex || fetch(event.request);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) return response;
      return fetch(event.request).catch(() => {
        return new Response('', { status: 408, statusText: 'Offline' });
      });
    })
  );
});
