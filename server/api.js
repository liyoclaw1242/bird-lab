// 不綁框架的路由：Vercel 函式和本機開發伺服器都走這裡。
const { GameError, ipKey } = require("./game.js");
const { sharePage } = require("./share-page.js");

// 正常請求的 body 都在 1 KB 上下（最大的是 Google 憑證和出牌紀錄），多的一律不收
const MAX_BODY = 16 * 1024;

// 每個 IP 每分鐘的請求上限。只記在這個函式實例的記憶體裡：不花資料庫寫入，
// 但 Vercel 開多個實例時各算各的，只擋得住單一來源的連發，真正的防線要靠平台防火牆。
// 手機網路常常一大群人共用一個 IP，所以上限放得很寬
function createLimiter({ limit = 240, windowMs = 60_000, maxKeys = 10_000, clock = Date.now } = {}) {
  let bucket = 0;
  let counts = new Map();
  return function allow(ip) {
    if (!ip) return true;
    const current = Math.floor(clock() / windowMs);
    if (current !== bucket || counts.size > maxKeys) { bucket = current; counts = new Map(); }
    const key = ipKey(ip);
    const n = (counts.get(key) || 0) + 1;
    counts.set(key, n);
    return n <= limit;
  };
}

// Google 整頁跳轉回來時把 ID token POST 到這裡。Google 要求比對表單和 cookie 的 g_csrf_token，防止別人替你登入。
// 真正驗證憑證仍由 POST login 負責：要等前端帶著這台裝置的存檔憑證一起送，才知道要綁哪片林子。
function googleCallback(body, cookie = "") {
  const fail = () => ({ status: 400, html: `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>一鳥在手</title></head><body><p>Google 登入沒有成功，再試一次。</p><a href="/">回到林子</a></body></html>` });
  const csrf = cookie.split(";").map((part) => part.trim().split("=")).find(([name]) => name === "g_csrf_token")?.[1];
  const { credential, g_csrf_token: sent } = body;
  if (!csrf || csrf !== sent || typeof credential !== "string" || credential.length > 4096 || !/^[\w.-]+$/.test(credential)) return fail();
  return { status: 200, html: `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>一鳥在手</title><script>try{sessionStorage.setItem("gacha-google-credential",${JSON.stringify(credential)})}catch(e){}location.replace("/")</script></head><body><a href="/">回到林子</a></body></html>` };
}

function createApi(game, { dev = false, googleClientId = process.env.GOOGLE_CLIENT_ID || "", limiter = createLimiter() } = {}) {
  const routes = {
    "GET health": () => game.health(),
    "POST player": (ctx) => game.createPlayer(ctx.ip),
    "GET state": (ctx) => game.state(ctx.playerId, ctx.offset).then((s) => ({ ...s, dev, googleClientId })),
    "POST login": (ctx) => game.login({ credential: ctx.body.credential, confirm: ctx.body.confirm === true, token: ctx.token, ip: ctx.ip }),
    "POST logout": (ctx) => game.logout(ctx.token),
    "POST revoke": (ctx) => game.revoke(ctx.playerId),
    "GET collection": (ctx) => game.collection(ctx.playerId, ctx.query.page),
    "POST team": (ctx) => game.setTeam(ctx.playerId, ctx.body.team),
    "POST draw": (ctx) => game.draw(ctx.playerId, ctx.body.kind, ctx.offset),
    "POST fight": (ctx) => game.submitFight(ctx.playerId, ctx.body.team, ctx.body.moves, ctx.offset),
    "POST share": (ctx) => game.share(ctx.playerId, ctx.body.kind, ctx.offset),
    "GET share": (ctx) => game.sharePreview(ctx.query.code, ctx.playerId, ctx.offset),
    "POST claim": (ctx) => game.claim(ctx.playerId, ctx.body.code, ctx.offset),
  };
  const PUBLIC = new Set(["GET health", "POST player", "POST login"]);
  const OPTIONAL = new Set(["GET share"]);

  return async function handle({ method, op, query = {}, body = {}, token, devOffset, ip = "", origin = "", cookie = "" }) {
    const key = `${method} ${op}`;
    if (!limiter(ip)) return { status: 429, body: { error: "slow_down", message: "動作太快了，休息一分鐘再來" } };
    if (body && JSON.stringify(body).length > MAX_BODY) return { status: 413, body: { error: "too_big", message: "送來的資料太大了" } };
    try {
      // 給連結預覽爬蟲看的頁面，CDN 快取一小時，所以剩餘份數可能稍微落後
      if (key === "GET share-page") {
        const preview = await game.sharePreview(query.code, null, 0).catch(() => null);
        return { status: 200, html: sharePage(String(query.code || ""), preview, origin, query.lang === "en" ? "en" : "zh-Hant"), cache: "public, s-maxage=3600" };
      }
      if (key === "POST google-callback") return googleCallback(body || {}, cookie);
      const route = routes[key];
      if (!route) return { status: 404, body: { error: "not_found" } };
      let playerId = null;
      if (OPTIONAL.has(key) && token) playerId = await game.authenticate(token).catch(() => null);
      else if (!PUBLIC.has(key) && !OPTIONAL.has(key)) playerId = await game.authenticate(token);
      // 跳日只在本機開發有效，正式環境一律以伺服器的台北日期為準
      const offset = dev ? Number(devOffset) || 0 : 0;
      return { status: 200, body: await route({ playerId, query, body: body || {}, offset, ip, token }) };
    } catch (error) {
      if (error instanceof GameError) return { status: error.status, body: { error: error.code, message: error.message, ...error.detail } };
      console.error(error);
      return { status: 503, body: { error: "resting", message: "森林今天休息中，晚點再來" } };
    }
  };
}

module.exports = { createApi, createLimiter };
