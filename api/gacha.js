// Vercel 函式入口。正式環境需要 DATABASE_URL，建表和匯入卡池由部署步驟的 npm run seed 負責。
const { open } = require("../server/db.js");
const { createGame } = require("../server/game.js");
const { createApi } = require("../server/api.js");

let ready;
const api = () => (ready ||= open().then((db) => createApi(createGame(db))));

module.exports = async function handler(req, res) {
  try {
    const handle = await api();
    // Vercel 讀 req.body 時才解析 JSON，格式壞掉會丟錯；這是玩家送錯，不是森林休息
    let body;
    try { body = req.body; } catch { return res.status(400).setHeader("cache-control", "no-store").json({ error: "bad_request", message: "送來的資料格式不對" }); }
    const result = await handle({
      method: req.method,
      op: req.query.op,
      query: req.query,
      body,
      token: (req.headers.authorization || "").replace(/^Bearer /, ""),
      cookie: req.headers.cookie || "",
      ip: req.headers["x-real-ip"] || "",
      origin: `https://${req.headers["x-forwarded-host"] || req.headers.host}`,
    });
    res.status(result.status).setHeader("cache-control", result.cache || "no-store");
    if (result.html !== undefined) return res.setHeader("content-type", "text/html; charset=utf-8").send(result.html);
    return res.json(result.body);
  } catch (error) {
    console.error(error);
    return res.status(503).setHeader("cache-control", "no-store").json({ error: "resting", message: "森林今天休息中，晚點再來" });
  }
};
