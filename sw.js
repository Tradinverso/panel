// Service worker mínimo: solo habilita la instalación como app (PWA).
// NO cachea nada → siempre sirve la última versión de la red (sin contenido obsoleto
// mientras seguimos subiendo cambios). El handler de 'fetch' es lo único que Chrome
// exige para mostrar "Instalar app".
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  // Las peticiones con Range (audio/vídeo al buscar/avanzar) NO se interceptan:
  // pasarlas por fetch() dentro del SW rompe la reproducción y el seek, sobre
  // todo en iOS/Safari. Se dejan al navegador, que las sirve nativamente (206).
  if (e.request.headers.has('range')) return;
  e.respondWith(fetch(e.request));
});
