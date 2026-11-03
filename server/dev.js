// 本機開發：同一個埠提供靜態檔和 API，資料存在 .data/，node server/dev.js 後開 http://localhost:5298/
const fs = require("fs");
const http = require("http");
const path = require("path");
const { open } = require("./db.js");
const { migrate, seed } = require("./setup.js");
const { createGame } = require("./game.js");
const { createApi } = require("./api.js");

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT) || 5298;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".mp3": "audio/mpeg" };

(async () => {
  const dataDir = process.env.GACHA_DATA_DIR || path.join(ROOT, ".data/gacha");
  fs.mkdirSync(dataDir, { recursive: true });
  const db = await open({ url: null, dataDir });
  await migrate(db);
  const { rows } = await db.query("SELECT count(*)::int AS count FROM cards");
  if (!rows[0].count) console.log(`匯入 ${await seed(db)} 張牌`);
  // GACHA_FAKE_GOOGLE=1 時把憑證內容直接當帳號編號，只給本機測試登入流程用
  const fake = process.env.GACHA_FAKE_GOOGLE ? { verifyGoogle: async (credential) => credential } : {};
  const handle = createApi(createGame(db, fake), { dev: true });

  http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const shareLink = url.pathname.match(/^\/s\/([^/]+)$/);
    if (shareLink) {
      const result = await handle({ method: "GET", op: "share-page", query: { code: shareLink[1], lang: url.searchParams.get("lang") } });
      res.writeHead(result.status, { "content-type": "text/html; charset=utf-8" });
      return res.end(result.html);
    }
    const googleBack = url.pathname === "/auth/google";
    if (url.pathname === "/api/gacha" || googleBack) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      let body = {};
      if (googleBack) body = Object.fromEntries(new URLSearchParams(raw));
      else try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
      const result = await handle({
        method: req.method,
        op: googleBack ? "google-callback" : url.searchParams.get("op"),
        cookie: req.headers.cookie || "",
        query: Object.fromEntries(url.searchParams),
        body,
        token: (req.headers.authorization || "").replace(/^Bearer /, ""),
        devOffset: req.headers["x-dev-offset"],
        ip: process.env.GACHA_DEV_IP || "",
      });
      if (result.html !== undefined) {
        res.writeHead(result.status, { "content-type": "text/html; charset=utf-8" });
        return res.end(result.html);
      }
      res.writeHead(result.status, { "content-type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify(result.body));
    }
    const target = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
    const file = target.endsWith(path.sep) || url.pathname.endsWith("/") ? path.join(target, "index.html") : target;
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end("not found");
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  }).listen(PORT, () => console.log(`http://localhost:${PORT}/`));
})();
