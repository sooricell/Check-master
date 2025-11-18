// sw.js - Service Worker

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open("checkmaster-v1").then(cache => {
      return cache.addAll([
        "./",
        "./index.html",
        "./main.js",
        "./manifest.json",
        "./icon-192.png",
        "./icon-512.png"
      ]);
    })
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(resp => resp || fetch(e.request))
  );
});
