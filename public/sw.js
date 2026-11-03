// PWA：網頁先走網路，確保部署後馬上是新版；斷網時才用快取開出畫面。
// API 不經手。跨網域的貼紙也不經手，交給瀏覽器的 HTTP 快取，線稿才讀得到圖片像素。
const CACHE = "yi-niao-v3";
const SHELL = ["/", "/style.css", "/engine.js", "/data.js", "/i18n.js", "/birdnotes.js", "/sound.js", "/scenery.js", "/doodle.js", "/game.js", "/logo.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/s/")) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(async () => (await caches.match(request)) || (request.mode === "navigate" ? caches.match("/") : Response.error())));
});
