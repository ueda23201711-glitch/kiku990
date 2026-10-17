// 手書きメモは /tegaki-memo/ に引っ越しました。この Service Worker は自分を外すだけです。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => { event.waitUntil(self.registration.unregister()); });
