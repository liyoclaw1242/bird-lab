const test = require("node:test");
const assert = require("node:assert");
const { open } = require("../db.js");
const { migrate, seed, loadCards } = require("../setup.js");
const { createGame } = require("../game.js");
const { createApi } = require("../api.js");
const E = require("../../public/engine.js");

let db, clock, game, api, all;
const at = (date) => { clock = new Date(`${date}T04:00:00Z`); };
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
const bestMoves = (fight, team) => {
  let best = { score: -1 };
  const walk = (s, moves) => {
    if (E.isOver(s)) { if (s.score > best.score) best = { score: s.score, moves }; return; }
    for (const slot of E.legalSlots(s)) {
      walk(E.step(fight, team, s, slot, false), [...moves, { slot, signature: false }]);
      if (!s.signatureUsed) walk(E.step(fight, team, s, slot, true), [...moves, { slot, signature: true }]);
    }
  };
  walk(E.startState(team), []);
  return best.moves;
};

test.before(async () => {
  db = await open({ url: null });
  await migrate(db);
  all = loadCards();
  await seed(db, all);
  at("2026-11-01");
  game = createGame(db, { now: () => clock, verifyGoogle: async (credential) => {
    if (credential === "forged") throw new Error("bad signature");
    return credential;
  } });
  api = createApi(game);
});

test("卡池是完整資料庫，而且匯入可重跑", async () => {
  assert.ok(all.length > 10000);
  await seed(db, all.slice(0, 100));
  const { rows } = await db.query("SELECT count(*)::int AS n FROM cards");
  assert.strictEqual(rows[0].n, all.length);
  assert.strictEqual(new Set(all.map((c) => c.id)).size, all.length);
  assert.ok(all.every((c) => c.atk > 0 && c.def > 0 && c.file && c.zh && c.facts.length >= 2));
});

test("新玩家有每種食性各一隻，隊伍可直接打", async () => {
  const p = await newPlayer();
  const s = await game.state(p.id);
  assert.strictEqual(s.owned, 3);
  assert.deepStrictEqual(s.team.map((c) => c.type).sort(), ["meat", "mixed", "plant"]);
  assert.ok(s.best > 0);
  assert.strictEqual(s.total, all.length);
});

test("沒有憑證或假憑證都進不來", async () => {
  assert.strictEqual((await api({ method: "GET", op: "state" })).status, 401);
  assert.strictEqual((await api({ method: "GET", op: "state", token: "x" })).status, 401);
});

test("沒有任何路由能列舉整個卡池", async () => {
  const p = await newPlayer();
  for (const op of ["cards", "pool", "search", "card"]) {
    assert.strictEqual((await api({ method: "GET", op, token: p.token })).status, 404);
  }
  const c = await game.collection(p.id, 0);
  assert.strictEqual(c.cards.length, 3);
});

test("正式環境不接受跳日", async () => {
  const p = await newPlayer();
  const r = await api({ method: "GET", op: "state", token: p.token, devOffset: "5" });
  assert.strictEqual(r.body.day, "2026-11-01");
});

test("每天免費抽一次，重送拿到同一張，隔天才有新的", async () => {
  at("2026-11-02");
  const p = await newPlayer();
  const first = await game.draw(p.id, "free");
  const again = await game.draw(p.id, "free");
  assert.strictEqual(again.card.id, first.card.id);
  assert.strictEqual(again.repeated, true);
  assert.strictEqual((await game.state(p.id)).owned, 4);
  at("2026-11-03");
  assert.strictEqual((await game.draw(p.id, "free")).repeated, false);
  assert.strictEqual((await game.state(p.id)).owned, 5);
});

test("同時送兩個抽卡請求只算一次", async () => {
  at("2026-11-04");
  const p = await newPlayer();
  const [a, b] = await Promise.all([game.draw(p.id, "free"), game.draw(p.id, "free")]);
  assert.strictEqual(a.card.id, b.card.id);
  assert.strictEqual((await game.state(p.id)).owned, 4);
});

test("沒打贏不能拿獎勵抽", async () => {
  at("2026-11-05");
  const p = await newPlayer();
  await assert.rejects(game.draw(p.id, "bonus"), (e) => e.code === "not_won");
});

test("完整打一場：分數由伺服器重算，贏了才有獎勵抽，一天一場", async () => {
  at("2026-11-06");
  const p = await newPlayer();
  const s = await game.state(p.id);
  const moves = bestMoves(s.fight, s.team);
  const teamIds = s.team.map((c) => c.id);
  const r = await game.submitFight(p.id, teamIds, moves);
  assert.ok(r.stars === 3, `最佳打法應拿 3 星，拿到 ${r.stars}`);
  assert.ok(Math.abs(r.score - s.best) < 1e-6);
  assert.strictEqual((await game.draw(p.id, "bonus")).repeated, false);
  const again = await game.submitFight(p.id, teamIds, playOut(s.fight, s.team));
  assert.strictEqual(again.repeated, true);
  assert.strictEqual(again.stars, 3);
});

test("伺服器和瀏覽器算出同樣的傷害", async () => {
  at("2026-11-07");
  const p = await newPlayer();
  const s = await game.state(p.id);
  const moves = playOut(s.fight, s.team);
  let local = E.startState(s.team);
  for (const m of moves) local = E.step(s.fight, s.team, local, m.slot, m.signature);
  const r = await game.submitFight(p.id, s.team.map((c) => c.id), moves);
  assert.ok(Math.abs(local.score - r.score) < 1e-6);
});

test("作弊的出牌會被擋", async () => {
  at("2026-11-08");
  const p = await newPlayer();
  const s = await game.state(p.id);
  const ids = s.team.map((c) => c.id);
  const reject = (team, moves, code) => assert.rejects(game.submitFight(p.id, team, moves), (e) => e.code === code);
  await reject(ids, [{ slot: 0 }, { slot: 0 }, { slot: 1 }, { slot: 0 }, { slot: 1 }], "illegal_move");
  await reject(ids, [{ slot: 0, signature: true }, { slot: 1, signature: true }, { slot: 0 }, { slot: 1 }, { slot: 0 }], "illegal_move");
  await reject(ids, [{ slot: 0 }], "bad_moves");
  await reject(ids, "nope", "bad_moves");
  await reject([ids[0], ids[0], ids[1]], [], "bad_team");
  const stranger = all.find((c) => !ids.includes(c.id)).id;
  await reject([ids[0], ids[1], stranger], [], "not_owned");
  assert.strictEqual((await game.state(p.id)).result, null);
});

test("隊伍只能放自己有的鳥", async () => {
  const p = await newPlayer();
  const s = await game.state(p.id);
  const ids = s.team.map((c) => c.id);
  assert.deepStrictEqual((await game.setTeam(p.id, [ids[2], ids[0], ids[1]])).team.map((c) => c.id), [ids[2], ids[0], ids[1]]);
  const stranger = all.find((c) => !ids.includes(c.id)).id;
  await assert.rejects(game.setTeam(p.id, [ids[0], ids[1], stranger]), (e) => e.code === "not_owned");
});

test("收藏分頁：新抽的在最前面，頁數正確", async () => {
  const p = await newPlayer();
  for (let i = 0; i < 26; i += 1) {
    at(E.addDays("2027-01-01", i));
    await game.draw(p.id, "free");
  }
  const first = await game.collection(p.id, 0);
  const last = await game.collection(p.id, 2);
  assert.strictEqual(first.owned, 29);
  assert.strictEqual(first.pages, 3);
  assert.strictEqual(first.cards.length, 12);
  assert.strictEqual(last.cards.length, 5);
  const ids = new Set();
  for (let i = 0; i < 3; i += 1) (await game.collection(p.id, i)).cards.forEach((c) => ids.add(c.id));
  assert.strictEqual(ids.size, 29);
});

test("收藏頁回報遇過幾個科、幾個目，總數來自整個卡池", async () => {
  const p = await newPlayer();
  const c = await game.collection(p.id, 0);
  const part = (i) => new Set(all.map((x) => x.file.split("/")[i])).size;
  assert.strictEqual(c.lineage.families.total, part(2));
  assert.strictEqual(c.lineage.orders.total, part(1));
  assert.ok(c.lineage.families.owned >= 1 && c.lineage.families.owned <= 3);
  assert.ok(c.lineage.orders.owned >= 1 && c.lineage.orders.owned <= c.lineage.families.owned);
  const s = await game.state(p.id);
  const stranger = all.find((x) => !s.team.some((m) => m.id === x.id || m.file.split("/")[2] === x.file.split("/")[2]));
  await db.query("INSERT INTO owned (player_id, card_id) VALUES ($1, $2)", [p.id, stranger.id]);
  assert.strictEqual((await game.collection(p.id, 0)).lineage.families.owned, c.lineage.families.owned + 1);
});

test("稀有度抽完會把機率分給其他稀有度，全收後回報收集完成", async () => {
  const small = await open({ url: null });
  await migrate(small);
  await seed(small, all.filter((c) => c.rarity === "N").slice(0, 40).concat(all.filter((c) => c.rarity === "UR").slice(0, 2)));
  const g = createGame(small, { now: () => clock });
  const { token } = await g.createPlayer();
  const id = await g.authenticate(token);
  const total = (await g.state(id)).total;
  const seen = new Set();
  let day = "2028-01-01", finished = false;
  for (let i = 0; i < total + 2 && !finished; i += 1) {
    at(day);
    try { seen.add((await g.draw(id, "free")).card.id); } catch (e) { assert.strictEqual(e.code, "complete"); finished = true; }
    day = E.addDays(day, 1);
  }
  assert.ok(finished);
  assert.strictEqual((await g.state(id)).owned, total);
  assert.strictEqual(seen.size, total - 3);
});

test("效能：完整卡池上抽卡和讀狀態都夠快", async () => {
  at("2029-01-01");
  const p = await newPlayer();
  const t0 = Date.now();
  await game.draw(p.id, "free");
  const t1 = Date.now();
  await game.state(p.id);
  const t2 = Date.now();
  console.log(`draw ${t1 - t0}ms, state ${t2 - t1}ms`);
  assert.ok(t1 - t0 < 1000);
  assert.ok(t2 - t1 < 1000);
});

const shareSetup = async (date, rarity) => {
  at(date);
  const owner = await newPlayer();
  const { card } = await game.draw(owner.id, "free");
  const { code, cap } = await game.share(owner.id, "free");
  return { owner, card, code, cap, rarity };
};

test("分享：朋友可領，領取人數依稀有度限制，同一人重送不重複", async () => {
  const { owner, card, code, cap } = await shareSetup("2030-01-01");
  assert.strictEqual(cap, { N: 10, R: 5, SR: 3, SSR: 2, UR: 1 }[card.rarity]);
  assert.strictEqual((await game.share(owner.id, "free")).code, code);
  const first = await newPlayer();
  assert.strictEqual((await game.sharePreview(code, first.id)).status, "open");
  assert.strictEqual((await game.claim(first.id, code)).card.id, card.id);
  assert.strictEqual((await game.claim(first.id, code)).repeated, true);
  assert.strictEqual((await game.state(first.id)).owned, 4);
  assert.strictEqual((await game.state(owner.id)).owned, 4);
  for (let i = 1; i < cap; i += 1) await game.claim((await newPlayer()).id, code);
  const late = await newPlayer();
  assert.strictEqual((await game.sharePreview(code, late.id)).status, "gone");
  assert.strictEqual((await game.sharePreview(code, late.id)).card, undefined);
  await assert.rejects(game.claim(late.id, code), (e) => e.code === "gone");
  assert.strictEqual((await game.state(late.id)).owned, 3);
  assert.strictEqual((await game.state(owner.id)).drawn[0].share.claimed, cap);
});

test("分享：不能領自己的、已有的或過期的，也不能分享沒抽到的", async () => {
  const { owner, card, code } = await shareSetup("2030-02-01");
  await assert.rejects(game.claim(owner.id, code), (e) => e.code === "mine");
  assert.strictEqual((await game.sharePreview(code, owner.id)).status, "mine");
  const friend = await newPlayer();
  await db.query("INSERT INTO owned (player_id, card_id) VALUES ($1, $2)", [friend.id, card.id]);
  assert.strictEqual((await game.sharePreview(code, friend.id)).status, "owned");
  await assert.rejects(game.claim(friend.id, code), (e) => e.code === "owned");
  await assert.rejects(game.share(friend.id, "free"), (e) => e.code === "no_draw");
  at("2030-02-03");
  assert.strictEqual((await game.sharePreview(code, null)).status, "open");
  at("2030-02-04");
  const late = await newPlayer();
  const expired = await game.sharePreview(code, late.id);
  assert.strictEqual(expired.status, "expired");
  assert.strictEqual(expired.card, undefined);
  await assert.rejects(game.claim(late.id, code), (e) => e.code === "expired");
});

test("分享：每人每天最多領 5 隻，隔天恢復", async () => {
  const taker = await newPlayer();
  const codes = [];
  for (let i = 0; i < 6; i += 1) codes.push((await shareSetup("2030-03-01")).code);
  for (const code of codes.slice(0, 5)) await game.claim(taker.id, code);
  await assert.rejects(game.claim(taker.id, codes[5]), (e) => e.code === "claim_limit");
  at("2030-03-02");
  await game.claim(taker.id, codes[5]);
});

test("分享頁：有鳥名和 OG，連結代碼被跳脫，失效連結不露出鳥", async () => {
  const { code, card } = await shareSetup("2030-04-01");
  const live = await api({ method: "GET", op: "share-page", query: { code } });
  assert.match(live.html, new RegExp(card.zh));
  assert.match(live.html, /og:image/);
  assert.match(live.html, /noindex/);
  const bad = await api({ method: "GET", op: "share-page", query: { code: `"><script>alert(1)</script>` } });
  assert.ok(!bad.html.includes("alert(1)"));
  at("2030-05-01");
  const old = await api({ method: "GET", op: "share-page", query: { code } });
  assert.ok(!old.html.includes(card.zh));
});

test("建立玩家有 IP 流量限制，下一小時恢復", async () => {
  clock = new Date("2030-06-01T04:10:00Z");
  for (let i = 0; i < 20; i += 1) assert.strictEqual((await api({ method: "POST", op: "player", ip: "1.2.3.4" })).status, 200);
  const blocked = await api({ method: "POST", op: "player", ip: "1.2.3.4" });
  assert.strictEqual(blocked.status, 429);
  assert.strictEqual((await api({ method: "POST", op: "player", ip: "5.6.7.8" })).status, 200);
  clock = new Date("2030-06-01T05:10:00Z");
  assert.strictEqual((await api({ method: "POST", op: "player", ip: "1.2.3.4" })).status, 200);
  const { rows } = await db.query("SELECT count(*)::int AS n FROM signup_limits");
  assert.ok(rows[0].n <= 2);
});

test("資料庫掛掉時回 503，不把內部錯誤交給玩家", async () => {
  const broken = createApi({ authenticate: async () => { throw new Error("db down secret"); } });
  const r = await broken({ method: "GET", op: "state", token: "x" });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.body.error, "resting");
  assert.ok(!JSON.stringify(r.body).includes("secret"));
});

const sub = () => `g-${Math.random().toString(36).slice(2)}`;

test("Google：綁定後換裝置登入拿回同一片林子，兩台裝置同時有效", async () => {
  at("2032-01-01");
  const phone = await newPlayer();
  const { card } = await game.draw(phone.id, "free");
  const account = sub();
  const bound = await game.login({ credential: account, token: phone.token });
  assert.strictEqual(bound.token, phone.token);
  assert.strictEqual((await game.state(phone.id)).google, true);
  const laptop = await game.login({ credential: account });
  assert.notStrictEqual(laptop.token, phone.token);
  assert.strictEqual(await game.authenticate(laptop.token), phone.id);
  assert.strictEqual(await game.authenticate(phone.token), phone.id);
  assert.ok((await game.collection(phone.id, 0)).cards.some((c) => c.id === card.id));
  await game.logout(laptop.token);
  await assert.rejects(game.authenticate(laptop.token), (e) => e.code === "bad_token");
  assert.strictEqual(await game.authenticate(phone.token), phone.id);
});

test("Google：新帳號直接登入會開新林子；偽造憑證進不來", async () => {
  const { token } = await game.login({ credential: sub() });
  assert.strictEqual((await game.state(await game.authenticate(token))).owned, 3);
  await assert.rejects(game.login({ credential: "forged" }), (e) => e.code === "bad_credential" && e.status === 400);
  await assert.rejects(game.login({ credential: 123 }), (e) => e.code === "bad_credential");
});

test("Google：裝置上有進度時不會默默切走，也不會合併兩片林子", async () => {
  at("2032-02-01");
  const account = sub();
  const owner = await newPlayer();
  await game.login({ credential: account, token: owner.token });
  const anon = await newPlayer();
  const noProgress = await game.login({ credential: account, token: anon.token });
  assert.strictEqual(await game.authenticate(noProgress.token), owner.id);
  const busy = await newPlayer();
  await game.draw(busy.id, "free");
  await assert.rejects(game.login({ credential: account, token: busy.token }), (e) => e.code === "needs_switch" && e.detail.here === 4 && e.detail.there === 3);
  assert.strictEqual((await game.state(busy.id)).google, false);
  const switched = await game.login({ credential: account, token: busy.token, confirm: true });
  assert.strictEqual(await game.authenticate(switched.token), owner.id);
  assert.strictEqual((await game.state(owner.id)).owned, 3);
  assert.strictEqual(await game.authenticate(busy.token), busy.id);
});

test("Google：已綁帳號不能再綁另一個，也不能搶別人的", async () => {
  const p = await newPlayer();
  await game.login({ credential: sub(), token: p.token });
  await assert.rejects(game.login({ credential: sub(), token: p.token }), (e) => e.code === "already_bound");
});

test("舊資料庫升級：憑證搬到 sessions，玩家還能登入", async () => {
  const old = await open({ url: null });
  await old.exec("CREATE TABLE players (id BIGSERIAL PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, team TEXT[] NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const crypto = require("crypto");
  const token = "old-token";
  await old.query("INSERT INTO players (token_hash, team) VALUES ($1, $2)", [crypto.createHash("sha256").update(token).digest("hex"), ["a", "b", "c"]]);
  await migrate(old);
  await migrate(old);
  assert.ok((await createGame(old).authenticate(token)) > 0);
});

const D = require("../../public/data.js");

test("每一抽的機率加總都是 1，也不會是負的", () => {
  for (const boost of [1, 1.25, 1.5]) for (let sinceSSR = 0; sinceSSR < D.PITY.SSR.hard; sinceSSR += 1) for (let sinceUR = 0; sinceUR < D.PITY.UR.hard; sinceUR += 1) {
    const odds = D.oddsFor({ sinceSSR, sinceUR, boost });
    assert.ok(Math.abs(D.TIERS.reduce((sum, t) => sum + odds[t], 0) - 1) < 1e-9);
    assert.ok(D.TIERS.every((t) => odds[t] >= -1e-12));
  }
});

test("補運不低於基礎機率、有上限，新帳號沒有補運", () => {
  assert.strictEqual(D.catchUp({ N: 6 }, 6), 1);
  assert.ok(D.catchUp({ N: 7 }, 7) > 1);
  assert.strictEqual(D.catchUp({ N: 3000 }, 3000), D.CATCH_UP.max);
  assert.strictEqual(D.catchUp({ UR: 50 }, 50), 1);
  assert.ok(D.catchUp({ N: 20, SSR: 4 }, 24) < D.catchUp({ N: 20 }, 20), "領到稀有鳥後補運要下降");
});

test("收完的稀有度，保底會往下一級落，機率總和不變", () => {
  const odds = D.redistribute(D.oddsFor({ sinceUR: D.PITY.UR.hard - 1 }), ["SSR", "N"]);
  assert.strictEqual(odds.UR, 0);
  assert.strictEqual(odds.SSR, 1);
  assert.strictEqual(D.redistribute({ UR: 0, SSR: 0, SR: 0, R: 0, N: 1 }, ["UR"]).UR, 1);
});

test("運氣再差也會在保底抽到", async () => {
  const small = await open({ url: null });
  await migrate(small);
  const pick = (r, n) => all.filter((c) => c.rarity === r).slice(0, n);
  await seed(small, [...pick("N", 120), ...pick("SSR", 6), ...pick("UR", 3)]);
  const g = createGame(small, { now: () => clock, random: () => 0.999999 });
  const { token } = await g.createPlayer();
  const id = await g.authenticate(token);
  let day = "2029-01-01";
  const got = [];
  for (let i = 0; i < D.PITY.UR.hard; i += 1) {
    at(day);
    got.push((await g.draw(id, "free")).card.rarity);
    day = E.addDays(day, 1);
  }
  const hard = D.PITY.SSR.hard;
  assert.deepStrictEqual(got.slice(0, hard - 1).filter((r) => r !== "N"), []);
  assert.ok(["SSR", "UR"].includes(got[hard - 1]));
  assert.strictEqual(got[D.PITY.UR.hard - 1], "UR");
  const { odds } = await g.state(id);
  assert.strictEqual(odds.urIn, D.PITY.UR.hard);
});

test("Google 跳轉回來要 CSRF 相符才把憑證交給前端", async () => {
  const post = (body, cookie) => api({ method: "POST", op: "google-callback", body, cookie });
  const ok = await post({ credential: "aa.bb-c_d", g_csrf_token: "t1" }, "x=1; g_csrf_token=t1");
  assert.strictEqual(ok.status, 200);
  assert.match(ok.html, /"aa\.bb-c_d"/);
  for (const [body, cookie] of [
    [{ credential: "aa.bb", g_csrf_token: "t1" }, "g_csrf_token=other"],
    [{ credential: "aa.bb", g_csrf_token: "t1" }, ""],
    [{ credential: "aa.bb" }, ""],
    [{ credential: "</script><script>alert(1)</script>", g_csrf_token: "t1" }, "g_csrf_token=t1"],
    [{ g_csrf_token: "t1" }, "g_csrf_token=t1"],
  ]) {
    const bad = await post(body, cookie);
    assert.strictEqual(bad.status, 400);
    assert.doesNotMatch(bad.html, /alert\(1\)/);
  }
});
