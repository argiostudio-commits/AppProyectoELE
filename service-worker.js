/* =========================================================================
   service-worker.js
   Cachea todos los archivos de la aplicación la primera vez que se abre,
   para que después funcione 100% sin conexión a Internet (item 1 y 26
   del encargo). No se conecta a ningún servicio externo.
   Si modificás archivos de la app, subí el número de CACHE_NAME para que
   los usuarios reciban la versión nueva.
   ========================================================================= */

const CACHE_NAME = 'presupuestos-cache-v1';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './storage.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Estrategia: cache primero, y si no está, buscar en la red y guardarlo
// para la próxima vez. Así la app funciona sin conexión desde la segunda carga.
self.addEventListener('fetch', (event) => {
  if(event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if(cached) return cached;
      return fetch(event.request).then((response) => {
        if(response && response.status === 200 && response.type === 'basic'){
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
