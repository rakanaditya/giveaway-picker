const CACHE_NAME = "gp-music-pwa-v1";
const OFFLINE_ASSETS = [
  "/music",
  "/music.html",
  "/manifest.json",
  "/js/music-mobile-pwa.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Hanya cache asset dari domain sendiri (abaikan stream eksternal YouTube/Spotify)
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return (
          cached ||
          fetch(event.request)
            .then((response) => {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
              return response;
            })
            .catch(() => caches.match("/music"))
        );
      })
    );
  }
});
