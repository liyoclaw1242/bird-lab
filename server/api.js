// 不綁框架的路由：Vercel 函式和本機開發伺服器都走這裡。
const { GameError } = require("./game.js");
const { sharePage } = require("./share-page.js");

function createApi(game, { dev = false, googleClientId = process.env.GOOGLE_CLIENT_ID || "" } = {}) {
  const routes = {
    "GET health": () => game.health(),
    "POST player": (ctx) => game.createPlayer(ctx.ip),
    "GET state": (ctx) => game.state(ctx.playerId, ctx.offset).then((s) => ({ ...s, dev, googleClientId })),
    "POST login": (ctx) => game.login({ credential: ctx.body.credential, confirm: ctx.body.confirm === true, token: ctx.token, ip: ctx.ip }),
    "POST logout": (ctx) => game.logout(ctx.token),
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

  return async function handle({ method, op, query = {}, body = {}, token, devOffset, ip = "", origin = "" }) {
    const key = `${method} ${op}`;
    try {
      // 給連結預覽爬蟲看的頁面，CDN 快取一小時，所以剩餘份數可能稍微落後
      if (key === "GET share-page") {
        const preview = await game.sharePreview(query.code, null, 0).catch(() => null);
        return { status: 200, html: sharePage(String(query.code || ""), preview, origin), cache: "public, s-maxage=3600" };
      }
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

module.exports = { createApi };
