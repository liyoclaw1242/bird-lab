// 用真的 Postgres 跑併發。PGlite 只有單一連線，測不到搶鎖和同時領最後一份。
const test = require("node:test");
const assert = require("node:assert");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { open } = require("../db.js");
const { migrate, seed, loadCards, withoutPhotos } = require("../setup.js");
const { createGame } = require("../game.js");
const E = require("../../public/engine.js");

let pg, db, game, clock = new Date("2031-01-01T04:00:00Z");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gacha-pg-"));
const player = async () => game.authenticate((await game.createPlayer()).token);

test.before(async () => {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port: 55433, persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("gacha");
  db = await open({ url: "postgres://postgres:pw@localhost:55433/gacha" });
  await migrate(db);
  await migrate(db);
  await seed(db, withoutPhotos(loadCards()));
  game = createGame(db, { now: () => clock, verifyGoogle: async (credential) => credential });
});
test.after(async () => {
  await db.close();
  await pg.stop().catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
});

test("完整流程在真實 Postgres 上能跑", async () => {
  const id = await player();
  const s = await game.state(id);
  assert.strictEqual(s.owned, 3);
  await game.setTeam(id, [s.team[2].id, s.team[0].id, s.team[1].id]);
  await game.draw(id, "free");
  const team = (await game.state(id)).team;
  const fresh = await game.state(id);
  let at = E.startState(team);
  const moves = [];
  while (!E.isOver(at)) { const slot = E.legalSlots(at)[0]; moves.push({ slot, signature: false }); at = E.step(fresh.fight, team, at, slot, false); }
  const r = await game.submitFight(id, team.map((c) => c.id), moves);
  assert.ok(r.score > 0);
  assert.strictEqual((await game.state(id)).result.stars, r.stars);
  assert.strictEqual((await game.collection(id, 0)).owned, 4);
});

test("同時抽 8 次只抽到一張", async () => {
  const id = await player();
  const results = await Promise.all(Array.from({ length: 8 }, () => game.draw(id, "free")));
  assert.strictEqual(new Set(results.map((r) => r.card.id)).size, 1);
  assert.strictEqual(results.filter((r) => !r.repeated).length, 1);
  assert.strictEqual((await game.state(id)).owned, 4);
});

test("同時送 6 份戰鬥結果只算一場", async () => {
  const id = await player();
  const s = await game.state(id);
  let at = E.startState(s.team);
  const moves = [];
  while (!E.isOver(at)) { const slot = E.legalSlots(at)[0]; moves.push({ slot, signature: false }); at = E.step(s.fight, s.team, at, slot, false); }
  const results = await Promise.all(Array.from({ length: 6 }, () => game.submitFight(id, s.team.map((c) => c.id), moves)));
  assert.strictEqual(results.filter((r) => !r.repeated).length, 1);
});

test("多人同時搶，領取不會超過上限；同一人連點只算一份", async () => {
  const owner = await player();
  await game.draw(owner, "free");
  const { code, cap } = await game.share(owner, "free");
  const takers = await Promise.all(Array.from({ length: cap + 6 }, player));
  const results = await Promise.allSettled(takers.map((id) => game.claim(id, code)));
  assert.strictEqual(results.filter((r) => r.status === "fulfilled").length, cap);
  assert.ok(results.filter((r) => r.status === "rejected").every((r) => r.reason.code === "gone"));
  const { rows: [row] } = await db.query("SELECT claimed FROM shares WHERE code = $1", [code]);
  assert.strictEqual(row.claimed, cap);

  const owner2 = await player();
  await game.draw(owner2, "free");
  const second = await game.share(owner2, "free");
  const id = await player();
  const clicks = await Promise.all(Array.from({ length: 6 }, () => game.claim(id, second.code)));
  assert.strictEqual(clicks.filter((r) => !r.repeated).length, 1);
  const { rows: [after] } = await db.query("SELECT claimed FROM shares WHERE code = $1", [second.code]);
  assert.strictEqual(after.claimed, 1);
});

test("同時領多條連結，也不會超過每日上限", async () => {
  const codes = [];
  for (let i = 0; i < 8; i += 1) {
    const owner = await player();
    await game.draw(owner, "free");
    codes.push((await game.share(owner, "free")).code);
  }
  const id = await player();
  const results = await Promise.allSettled(codes.map((code) => game.claim(id, code)));
  assert.strictEqual(results.filter((r) => r.status === "fulfilled").length, 5);
});

test("多人同時分享與建立連結不會重複", async () => {
  const id = await player();
  await game.draw(id, "free");
  const links = await Promise.all(Array.from({ length: 5 }, () => game.share(id, "free")));
  assert.strictEqual(new Set(links.map((l) => l.code)).size, 1);
});

test("同一個 Google 帳號同時從兩個匿名玩家綁定，只有一個成功", async () => {
  const [a, b] = await Promise.all([game.createPlayer(), game.createPlayer()]);
  const results = await Promise.allSettled([a, b].map(({ token }) => game.login({ credential: "race", token })));
  const bound = await db.query("SELECT count(*)::int AS n FROM players WHERE google_sub = 'race'");
  assert.strictEqual(bound.rows[0].n, 1);
  assert.ok(results.some((r) => r.status === "fulfilled"));
  for (const r of results) if (r.status === "rejected") assert.ok(["login_race", "needs_switch"].includes(r.reason.code));
});

test("Vercel 入口：走真實函式建立玩家、讀狀態、輸出分享頁", async () => {
  process.env.DATABASE_URL = "postgres://postgres:pw@localhost:55433/gacha";
  const handler = require("../../api/gacha.js");
  const run = (req) => new Promise((resolve) => {
    const res = {
      code: 0, headers: {},
      status(code) { this.code = code; return this; },
      setHeader(key, value) { this.headers[key] = value; return this; },
      json(body) { resolve({ code: this.code, headers: this.headers, body }); },
      send(body) { resolve({ code: this.code, headers: this.headers, body }); },
    };
    handler({ headers: { host: "example.test", "x-real-ip": "9.9.9.9" }, query: {}, ...req }, res);
  });
  assert.deepStrictEqual((await run({ method: "GET", query: { op: "health" } })).body, { ok: true });
  const { body: { token } } = await run({ method: "POST", query: { op: "player" } });
  const state = await run({ method: "GET", query: { op: "state" }, headers: { authorization: `Bearer ${token}` } });
  assert.strictEqual(state.code, 200);
  assert.strictEqual(state.body.dev, false);
  const page = await run({ method: "GET", query: { op: "share-page", code: "abc" } });
  assert.match(page.body, /https:\/\/example\.test\/og\.png/);
  assert.match(page.headers["content-type"], /text\/html/);
  delete process.env.DATABASE_URL;
});
