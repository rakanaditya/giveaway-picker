// public/sw.js
const APP_VERSION = "v1.0.2"; // Ubah ke v1.0.1, v1.1.0, dst. setiap kali update kode!
const CACHE_NAME = `gp-music-cache-${APP_VERSION}`;
const ASSETS_TO_CACHE = [
  "/music",
  "/music.html",
  "/css/music.css",
  "/js/music-mobile-pwa.js",
  "/manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  // Langsung aktifkan Service Worker baru tanpa menunggu tab ditutup
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((oldKey) => caches.delete(oldKey))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
