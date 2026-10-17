const CACHE_NAME = "kikutan-toeic990-v8";
const ASSETS = [
  "./",
  "./index.html",
  "./app-v2.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon-180.png",
  "./icons/favicon-32.png",
  "./icons/favicon-16.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("kikutan-toeic990-") && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  // 別サイト（Firebase など）への通信には関与しない
  if (new URL(req.url).origin !== self.location.origin) return;

  // ページ本体はネット優先（更新がすぐ届くように）。オフライン時はキャッシュ。
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  // アプリ情報（manifest）はネット優先：古い情報でインストールされないように
  if (new URL(req.url).pathname.endsWith(".webmanifest")) {
    event.respondWith(fetch(req, { cache: "no-cache" }).catch(() => caches.match(req)));
    return;
  }

  // アイコン等はキャッシュ優先
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
