// PWA：網頁先走網路，確保部署後馬上是新版；斷網時才用快取開出畫面。
// API 不經手。同一個網址的貼紙不會變（換圖時網址的 ?v= 會加一），所以快取優先：看過的鳥第二次就不必再等 Cloudflare。
const CACHE = "yi-niao-v4";
// 換圖時改名，舊版的貼紙快取在 activate 時整批刪掉
const STICKERS = "yi-niao-stickers-v4";
const STICKER_ORIGIN = "https://yi-niao-stickers.yi-niao.workers.dev";
const SHELL = ["/", "/style.css", "/engine.js", "/data.js", "/i18n.js", "/birdnotes.js", "/sound.js", "/scenery.js", "/doodle.js", "/game.js", "/logo.svg"];

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
  // 磁碟滿了存不進去也沒關係，這次照樣回圖
  if (response.ok) cache.put(url, response.clone()).catch(() => {});
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // 音檔的分段請求（Range，回 206）不能放進快取，cache.put 會丟錯，直接交給瀏覽器
  if (request.method !== "GET" || request.headers.has("range")) return;
  if (url.origin === STICKER_ORIGIN) { event.respondWith(sticker(url.href).catch(() => fetch(request))); return; }
  if (url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/s/")) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.status === 200) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
    }
    return response;
  }).catch(async () => (await caches.match(request)) || (request.mode === "navigate" ? caches.match("/") : Response.error())));
});
