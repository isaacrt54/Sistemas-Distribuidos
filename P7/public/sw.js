const CACHE_NAME = 'batalla-naval-cache-v1';

// Los archivos estáticos para guardar en caché (HTML, CSS, JS, Imágenes)
const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/client.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// Evento de Instalación: Cachea los archivos estáticos necesarios para la PWA
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Archivos cacheados exitosamente');
                return cache.addAll(URLS_TO_CACHE);
            })
    );
});

// Evento de Activación: Limpia cachés antiguas si es necesario
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Borrando caché antiguo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Evento de Fetch: Intercepta las peticiones y responde con caché o red según la estrategia
self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('/api/')) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                // Si no está en caché, lo vamos a buscar a internet
                return fetch(event.request);
            })
    );
});