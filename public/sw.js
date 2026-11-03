// PWA：網頁先走網路，確保部署後馬上是新版；斷網時才用快取開出畫面。
// API 不經手。貼紙永遠不會變，所以快取優先：看過的鳥第二次就不必再等 Cloudflare。
const CACHE = "yi-niao-v3";
const STICKERS = "yi-niao-stickers-v1";
const STICKER_ORIGIN = "https://yi-niao-stickers.yi-niao.workers.dev";
const SHELL = ["/", "/style.css", "/engine.js", "/data.js", "/i18n.js", "/sound.js", "/scenery.js", "/doodle.js", "/game.js", "/logo.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== STICKERS).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

// 一律用 cors 去抓再存：<img> 和線稿（crossOrigin 讀像素）共用同一份，不會存到讀不了的 opaque 回應
async function sticker(url) {
  const cache = await caches.open(STICKERS);
  const hit = await cache.match(url);
  if (hit) return hit;
  const response = await fetch(new Request(url, { mode: "cors" }));
  if (response.ok) cache.put(url, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  if (url.origin === STICKER_ORIGIN) { event.respondWith(sticker(url.href)); return; }
  if (url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/s/")) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(async () => (await caches.match(request)) || (request.mode === "navigate" ? caches.match("/") : Response.error())));
});
