// 安全相關的行為：輸入大小、限流、憑證撤銷與上限、出牌紀錄不存垃圾
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { open } = require("../db.js");
const { migrate, seed, loadCards, withoutPhotos } = require("../setup.js");
const { createGame, MAX_SESSIONS, ipKey } = require("../game.js");
const { createApi, createLimiter } = require("../api.js");
const E = require("../../public/engine.js");

let db, clock, game, api;
const newPlayer = async () => {
  const { token } = await game.createPlayer();
  return { token, id: await game.authenticate(token) };
};
const playOut = (fight, team) => {
  let s = E.startState(team);
  const moves = [];
  while (!E.isOver(s)) {
    const slot = E.legalSlots(s)[0];
    moves.push({ slot, signature: false });
    s = E.step(fight, team, s, slot, false);
  }
  return moves;
};
const sub = () => `g-${Math.random().toString(36).slice(2)}`;

test.before(async () => {
  db = await open({ url: null });
  await migrate(db);
  await seed(db, withoutPhotos(loadCards()));
  clock = new Date("2026-11-01T04:00:00Z");
  game = createGame(db, { now: () => clock, verifyGoogle: async (credential) => credential });
  api = createApi(game, { limiter: () => true });
});

test("出牌紀錄只存出牌欄位，塞在裡面的大字串不會進資料庫", async () => {
  const p = await newPlayer();
  const s = await game.state(p.id);
  const moves = playOut(s.fight, s.team).map((m) => ({ ...m, junk: "x".repeat(100_000) }));
  await game.submitFight(p.id, s.team.map((c) => c.id), moves);
  const { rows: [row] } = await db.query("SELECT moves FROM fights WHERE player_id = $1", [p.id]);
  assert.ok(JSON.stringify(row.moves).length < 500);
  assert.deepStrictEqual(Object.keys(row.moves[0]).sort(), ["signature", "slot"]);
});

test("太大的請求直接 413，不進遊戲邏輯", async () => {
  const p = await newPlayer();
  const r = await api({ method: "POST", op: "fight", token: p.token, body: { team: [], moves: ["x".repeat(20_000)] } });
  assert.strictEqual(r.status, 413);
  assert.strictEqual(r.body.error, "too_big");
});

test("欄位長度和格式：超長憑證、超長牌號、亂填頁數、不存在的分享種類都被擋", async () => {
  const p = await newPlayer();
  assert.strictEqual((await api({ method: "GET", op: "state", token: "a".repeat(300) })).status, 401);
  await assert.rejects(game.login({ credential: "a".repeat(5000) }), (e) => e.code === "bad_credential");
  await assert.rejects(game.setTeam(p.id, ["a".repeat(100), "b", "c"]), (e) => e.code === "bad_team");
  const far = await api({ method: "GET", op: "collection", token: p.token, query: { page: "1e400" } });
  assert.strictEqual(far.status, 200);
  assert.strictEqual(far.body.cards.length, 0);
  const share = await api({ method: "POST", op: "share", token: p.token, body: { kind: { $ne: 1 } } });
  assert.strictEqual(share.status, 400);
  assert.strictEqual(share.body.error, "bad_kind");
});

test("Google 跳轉回來的超長憑證不收", async () => {
  const r = await api({ method: "POST", op: "google-callback", body: { credential: "a".repeat(5000), g_csrf_token: "t" }, cookie: "g_csrf_token=t" });
  assert.strictEqual(r.status, 400);
});

test("IPv6 以 /64 為單位限流，IPv4 照原樣", () => {
  assert.strictEqual(ipKey("1.2.3.4"), "1.2.3.4");
  assert.strictEqual(ipKey("::ffff:1.2.3.4"), "1.2.3.4");
  assert.strictEqual(ipKey("2001:db8:0:1::5"), "2001:db8:0:1::/64");
  assert.strictEqual(ipKey("2001:0db8:0000:0001:aaaa:bbbb:cccc:dddd"), "2001:db8:0:1::/64");
  assert.strictEqual(ipKey("2001:DB8::1"), "2001:db8:0:0::/64");
  assert.notStrictEqual(ipKey("2001:db8:0:1::5"), ipKey("2001:db8:0:2::5"));
});

test("同一段 IPv6 換位址也躲不過建立玩家的限流", async () => {
  clock = new Date("2033-03-01T04:10:00Z");
  for (let i = 0; i < 20; i += 1) assert.strictEqual((await api({ method: "POST", op: "player", ip: `2001:db8:9:9::${i + 1}` })).status, 200);
  assert.strictEqual((await api({ method: "POST", op: "player", ip: "2001:db8:9:9:ffff::1" })).status, 429);
  assert.strictEqual((await api({ method: "POST", op: "player", ip: "2001:db8:9:a::1" })).status, 200);
  clock = new Date("2026-11-01T04:00:00Z");
});

test("記憶體限流：同一個 IP 超過上限回 429，下一分鐘恢復，沒有 IP 不限", async () => {
  let now = 0;
  const limiter = createLimiter({ limit: 3, clock: () => now });
  const limited = createApi({ health: async () => ({ ok: true }) }, { limiter });
  const hit = (ip) => limited({ method: "GET", op: "health", ip });
  for (let i = 0; i < 3; i += 1) assert.strictEqual((await hit("1.1.1.1")).status, 200);
  const blocked = await hit("1.1.1.1");
  assert.strictEqual(blocked.status, 429);
  assert.strictEqual(blocked.body.error, "slow_down");
  assert.strictEqual((await hit("2.2.2.2")).status, 200);
  for (let i = 0; i < 10; i += 1) assert.strictEqual((await hit("")).status, 200);
  now = 60_000;
  assert.strictEqual((await hit("1.1.1.1")).status, 200);
});

test("撤銷：換一組新憑證，舊的和其他裝置立刻失效，鳥都還在，別人不受影響", async () => {
  const p = await newPlayer();
  const other = await newPlayer();
  const account = sub();
  await game.login({ credential: account, token: p.token });
  const laptop = await game.login({ credential: account });
  const { card } = await game.draw(p.id, "free");
  const r = await api({ method: "POST", op: "revoke", token: p.token });
  assert.strictEqual(r.status, 200);
  assert.match(r.body.token, /^[a-f0-9]{64}$/);
  await assert.rejects(game.authenticate(p.token), (e) => e.code === "bad_token");
  await assert.rejects(game.authenticate(laptop.token), (e) => e.code === "bad_token");
  assert.strictEqual(await game.authenticate(r.body.token), p.id);
  assert.strictEqual(await game.authenticate(other.token), other.id);
  assert.ok((await game.collection(p.id, 0)).cards.some((c) => c.id === card.id));
  assert.strictEqual((await api({ method: "POST", op: "revoke" })).status, 401);
});

test("同一張 Google 憑證重送很多次，sessions 不會無限長，最新的那台還能用", async () => {
  const account = sub();
  const first = await game.login({ credential: account });
  const id = await game.authenticate(first.token);
  let last;
  for (let i = 0; i < MAX_SESSIONS + 5; i += 1) {
    clock = new Date(Date.UTC(2026, 10, 1, 5, 0, i));
    last = await game.login({ credential: account });
  }
  clock = new Date("2026-11-01T04:00:00Z");
  const { rows: [{ n }] } = await db.query("SELECT count(*)::int AS n FROM sessions WHERE player_id = $1", [id]);
  assert.strictEqual(n, MAX_SESSIONS);
  assert.strictEqual(await game.authenticate(last.token), id);
  await assert.rejects(game.authenticate(first.token), (e) => e.code === "bad_token");
});

test("憑證期限：預設不失效；設了天數只對 Google 帳號生效，匿名存檔碼永遠有效", async () => {
  clock = new Date("2026-11-01T04:00:00Z");
  const guest = await newPlayer();
  const bound = await newPlayer();
  await game.login({ credential: sub(), token: bound.token });
  const expiring = createGame(db, { now: () => clock, sessionDays: 30 });
  clock = new Date("2026-11-25T04:00:00Z");
  assert.strictEqual(await expiring.authenticate(bound.token), bound.id);
  clock = new Date("2026-12-05T04:00:00Z");
  await assert.rejects(expiring.authenticate(bound.token), (e) => e.code === "bad_token");
  assert.strictEqual(await expiring.authenticate(guest.token), guest.id);
  assert.strictEqual(await game.authenticate(bound.token), bound.id);
  clock = new Date("2026-11-01T04:00:00Z");
});

test("錯誤碼都有英文翻譯（包含 API 層自己回的）", () => {
  const I18n = require("../../public/i18n.js");
  const source = fs.readFileSync(path.join(__dirname, "../api.js"), "utf8") + fs.readFileSync(path.join(__dirname, "../../api/gacha.js"), "utf8");
  const codes = [...source.matchAll(/error: "(\w+)"/g)].map((m) => m[1]).filter((c) => c !== "not_found" && c !== "resting");
  assert.ok(codes.length >= 3);
  for (const code of codes) assert.ok(`err.${code}` in I18n.DICT.en, code);
});

test("security.txt 有聯絡方式和期限", () => {
  const text = fs.readFileSync(path.join(__dirname, "../../public/.well-known/security.txt"), "utf8");
  assert.match(text, /^Contact: mailto:/m);
  const expires = new Date(text.match(/^Expires: (.+)$/m)[1]);
  assert.ok(expires > new Date("2026-11-04"));
});

test("Vercel 入口：壞掉的 JSON 回 400，不是 503", async () => {
  const handler = require("../../api/gacha.js");
  const result = await new Promise((resolve) => {
    const res = {
      code: 0, headers: {},
      status(code) { this.code = code; return this; },
      setHeader(key, value) { this.headers[key] = value; return this; },
      json(body) { resolve({ code: this.code, body }); },
      send(body) { resolve({ code: this.code, body }); },
    };
    const req = { method: "POST", headers: { host: "example.test" }, query: { op: "draw" } };
    Object.defineProperty(req, "body", { get() { throw new SyntaxError("Invalid JSON"); } });
    handler(req, res);
  });
  assert.strictEqual(result.code, 400);
  assert.strictEqual(result.body.error, "bad_request");
});
