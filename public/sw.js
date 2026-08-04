const CACHE_NAME = "bulkbun-pwa-v1";
const ASSETS = ["/", "/favicon.png", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        }),
      );
    }),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);
  // تجاهل أي بروتوكول غير http أو https لمنع أخطاء الإضافات
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // لا تقم بتخزين طلبات السيرفر الداخلية الخاصة بـ TanStack Start / Vinxi
  if (url.pathname.includes("/_server/") || url.pathname.includes("/api/")) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const toCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, toCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match("/");
        });
    }),
  );
});
