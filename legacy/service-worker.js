// Kill-switch service worker.
// Clears all caches from earlier versions and unregisters itself so the next
// navigation fetches everything fresh from the network. The new Vite build
// (post-cutover) does not register a service worker; this file exists only
// to clean up after installed clients that still have the legacy SW.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
      self.registration.unregister(),
    ]).then(() => self.clients.claim())
  );
});

// No fetch handler — let the browser hit the network directly.
