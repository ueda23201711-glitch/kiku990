const CACHE_NAME="kikutan-toeic990-v4";
const ASSETS=[
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/toeic990-192.png",
  "./icons/toeic990-512.png",
  "./icons/toeic990-maskable-192.png",
  "./icons/toeic990-maskable-512.png",
  "./icons/apple-touch-icon-180.png"
];
self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k===CACHE_NAME?null:caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch", e=>{
  if (e.request.method!=="GET") return;
  e.respondWith(caches.match(e.request).then(cached=>cached || fetch(e.request).then(res=>{
    const copy=res.clone();
    caches.open(CACHE_NAME).then(c=>c.put(e.request, copy));
    return res;
  })));
});
