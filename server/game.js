// 抽卡與戰鬥的權威邏輯。卡池不對外列舉：玩家只拿得到自己收藏裡的牌，這是貼紙授權不做成圖鑑的底線。
const crypto = require("crypto");
const E = require("../public/engine.js");
const { verifyGoogle: defaultVerifyGoogle } = require("./google.js");
const { BOSSES, SHARE_CAPS, SHARE_DAYS, BONUS_KINDS, bonusAllowed, CLAIMS_PER_DAY, PITY, TIERS, catchUp, oddsFor, redistribute } = require("../public/data.js");
const isKind = (kind) => kind === "free" || BONUS_KINDS.includes(kind);

const PAGE_SIZE = 12;
const CANDIDATES_PER_TYPE = 6;
const SIGNUPS_PER_HOUR = 20;
// 同一個帳號最多同時保留幾台裝置的登入。一張 Google 憑證一小時內可以重送，不設上限就能灌出無數筆 sessions
const MAX_SESSIONS = 20;
// 欄位長度上限：正常值都遠小於此，擋掉塞大字串進資料庫或查詢的請求
const MAX_CREDENTIAL = 4096;
const MAX_TOKEN = 256;
const MAX_CARD_ID = 64;
const MAX_PAGE = 10000;

class GameError extends Error {
  constructor(status, code, message, detail) {
    super(message);
    this.detail = detail;
    this.status = status;
    this.code = code;
  }
}

const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");

// IPv6 使用者通常整段 /64 都是自己的，換位址不用成本，所以限流以 /64 為單位；IPv4 照原樣
function ipKey(ip) {
  const text = String(ip || "").trim().toLowerCase();
  if (!text.includes(":")) return text;
  if (/^::ffff:\d+\.\d+\.\d+\.\d+$/.test(text)) return text.slice(7);
  const [head, tail = ""] = text.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = text.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
const toCard = (row) => row.data;

// sessionDays：綁了 Google 的帳號，登入憑證幾天後失效（從建立那天算）。預設不失效，要由站長設 GACHA_SESSION_DAYS 才開。
// 匿名玩家永遠不失效：存檔碼就是他們唯一的鑰匙，過期等於把鳥丟掉
function createGame(db, { now = () => new Date(), random = crypto.randomInt ? () => crypto.randomInt(0, 2 ** 32) / 2 ** 32 : Math.random, verifyGoogle = defaultVerifyGoogle, sessionDays = Number(process.env.GACHA_SESSION_DAYS) || 0 } = {}) {
  const dayOf = (offset = 0) => E.addDays(E.taipeiDate(now()), offset);

  async function starters(q) {
    const picked = [];
    for (const type of Object.keys(E.TYPES)) {
      const { rows } = await q.query("SELECT id FROM cards WHERE rarity = 'N' AND type = $1 ORDER BY random() LIMIT 1", [type]);
      if (!rows.length) throw new GameError(503, "pool_empty", "卡池還沒準備好");
      picked.push(rows[0].id);
    }
    return picked;
  }

  // 擋住大量灌假玩家。沒有 IP（本機和測試）時不限制
  async function limitSignups(ip) {
    if (!ip) return;
    const current = new Date(now());
    current.setUTCMinutes(0, 0, 0);
    const { rows } = await db.query(
      `INSERT INTO signup_limits (ip_hash, hour) VALUES ($1, $2)
       ON CONFLICT (ip_hash, hour) DO UPDATE SET count = signup_limits.count + 1 RETURNING count`,
      [hash(ipKey(ip)), current.toISOString()],
    );
    if (rows[0].count === 1) await db.query("DELETE FROM signup_limits WHERE hour < $1", [current.toISOString()]);
    if (rows[0].count > SIGNUPS_PER_HOUR) throw new GameError(429, "too_many_players", "這裡一小時內來了太多新玩家，晚點再試");
  }

  async function newSession(q, playerId) {
    const token = crypto.randomBytes(32).toString("hex");
    await q.query("INSERT INTO sessions (token_hash, player_id, created_at) VALUES ($1, $2, $3)", [hash(token), playerId, new Date(now()).toISOString()]);
    return token;
  }

  // 超過上限時踢掉最舊的裝置。被踢的裝置再用 Google 登入一次就好，鳥不會少
  async function pruneSessions(q, playerId) {
    await q.query(
      `DELETE FROM sessions WHERE player_id = $1 AND token_hash NOT IN (
         SELECT token_hash FROM sessions WHERE player_id = $1 ORDER BY created_at DESC, token_hash LIMIT $2)`,
      [playerId, MAX_SESSIONS],
    );
  }

  async function insertPlayer(q, googleSub = null) {
    const team = await starters(q);
    const { rows } = await q.query("INSERT INTO players (team, google_sub) VALUES ($1, $2) RETURNING id", [team, googleSub]);
    for (const id of team) await q.query("INSERT INTO owned (player_id, card_id) VALUES ($1, $2)", [rows[0].id, id]);
    return newSession(q, rows[0].id);
  }

  async function createPlayer(ip) {
    await limitSignups(ip);
    return { token: await db.tx((q) => insertPlayer(q)) };
  }

  const ownedCount = async (q, playerId) => (await q.query("SELECT count(*)::int AS n FROM owned WHERE player_id = $1", [playerId])).rows[0].n;

  // 不合併兩片林子：匿名帳號能無限開，能合併就能靠開分身養大一個 Google 帳號
  async function login({ credential, token, confirm = false, ip = "" }) {
    if (typeof credential !== "string" || credential.length > MAX_CREDENTIAL) throw new GameError(400, "bad_credential", "Google 登入沒有成功，再試一次");
    const sub = await verifyGoogle(credential).catch((error) => {
      console.error("google verify", error.message);
      throw new GameError(400, "bad_credential", "Google 登入沒有成功，再試一次");
    });
    const current = token ? await authenticate(token).catch(() => null) : null;
    const { rows: [known] } = await db.query("SELECT id FROM players WHERE google_sub = $1", [sub]);
    if (!known && !current) await limitSignups(ip);
    try {
      return await db.tx(async (q) => {
        if (current) await q.query("SELECT id FROM players WHERE id = $1 FOR UPDATE", [current]);
        const { rows: [bound] } = await q.query("SELECT id FROM players WHERE google_sub = $1", [sub]);
        if (bound) {
          const target = Number(bound.id);
          if (target === current) return { token, switched: false };
          if (current && !confirm) {
            const { rows: [mine] } = await q.query("SELECT google_sub FROM players WHERE id = $1", [current]);
            const here = await ownedCount(q, current);
            if (!mine.google_sub && here > E.TEAM_SIZE) {
              throw new GameError(409, "needs_switch", "這個 Google 帳號已經有一片林子了", { here, there: await ownedCount(q, target) });
            }
          }
          const fresh = await newSession(q, target);
          await pruneSessions(q, target);
          return { token: fresh, switched: true };
        }
        if (!current) return { token: await insertPlayer(q, sub), switched: true };
        const { rows } = await q.query("UPDATE players SET google_sub = $2 WHERE id = $1 AND google_sub IS NULL RETURNING id", [current, sub]);
        if (!rows.length) throw new GameError(409, "already_bound", "這片林子綁了另一個 Google 帳號，先登出再試");
        return { token, switched: false };
      });
    } catch (error) {
      if (error.code === "23505") throw new GameError(409, "login_race", "登入撞在一起了，再試一次");
      throw error;
    }
  }

  async function logout(token) {
    await db.query("DELETE FROM sessions WHERE token_hash = $1", [hash(token)]);
    return { ok: true };
  }

  // 換一組新憑證，這個玩家其他所有憑證（其他裝置、外流的存檔碼）立刻失效
  async function revoke(playerId) {
    return db.tx(async (q) => {
      await q.query("SELECT id FROM players WHERE id = $1 FOR UPDATE", [playerId]);
      await q.query("DELETE FROM sessions WHERE player_id = $1", [playerId]);
      return { token: await newSession(q, playerId) };
    });
  }

  async function authenticate(token) {
    if (!token) throw new GameError(401, "no_token", "沒有玩家憑證");
    if (typeof token !== "string" || token.length > MAX_TOKEN) throw new GameError(401, "bad_token", "找不到這位玩家");
    const { rows } = sessionDays > 0
      ? await db.query(
        `SELECT s.player_id FROM sessions s JOIN players p ON p.id = s.player_id
         WHERE s.token_hash = $1 AND (p.google_sub IS NULL OR s.created_at > $2::timestamptz - make_interval(days => $3::int))`,
        [hash(token), new Date(now()).toISOString(), sessionDays],
      )
      : await db.query("SELECT player_id FROM sessions WHERE token_hash = $1", [hash(token)]);
    if (!rows.length) throw new GameError(401, "bad_token", "找不到這位玩家");
    return Number(rows[0].player_id);
  }

  async function roster(q, playerId) {
    const { rows } = await q.query(
      `SELECT data FROM (
         SELECT c.data, row_number() OVER (PARTITION BY c.type ORDER BY c.atk + c.def DESC, c.id) AS rank
         FROM owned o JOIN cards c ON c.id = o.card_id WHERE o.player_id = $1
       ) ranked WHERE rank <= $2`,
      [playerId, CANDIDATES_PER_TYPE],
    );
    return rows.map(toCard);
  }

  const fightFor = (day, cards) => E.makeFight(E.bossOfDay(BOSSES, day), day, cards);

  async function cardsById(q, ids) {
    const { rows } = await q.query("SELECT id, data FROM cards WHERE id = ANY($1)", [ids]);
    const found = Object.fromEntries(rows.map((r) => [r.id, r.data]));
    return ids.map((id) => found[id]);
  }

  async function state(playerId, offset = 0) {
    const day = dayOf(offset);
    const [{ rows: [player] }, { rows: [counts] }, { rows: draws }, { rows: fights }, candidates, odds] = await Promise.all([
      db.query("SELECT team, google_sub FROM players WHERE id = $1", [playerId]),
      db.query("SELECT (SELECT count(*) FROM owned WHERE player_id = $1)::int AS owned, (SELECT count(*) FROM cards)::int AS total", [playerId]),
      db.query(
        `SELECT d.kind, c.data, s.code, s.cap, s.claimed FROM draws d JOIN cards c ON c.id = d.card_id
         LEFT JOIN shares s ON s.player_id = d.player_id AND s.day = d.day AND s.kind = d.kind
         WHERE d.player_id = $1 AND d.day = $2`,
        [playerId, day],
      ),
      db.query("SELECT day::text AS day, stars, score, best FROM fights WHERE player_id = $1 AND day > $2::date - 370 AND day <= $2::date ORDER BY day DESC", [playerId, day]),
      roster(db, playerId),
      oddsView(playerId),
    ]);
    const fight = fightFor(day, candidates);
    const today = fights.find((f) => f.day === day) || null;
    let streak = 0;
    let cursor = today?.stars > 0 ? day : E.addDays(day, -1);
    const stars = Object.fromEntries(fights.map((f) => [f.day, f.stars]));
    while (stars[cursor] > 0) { streak += 1; cursor = E.addDays(cursor, -1); }
    return {
      day,
      google: !!player.google_sub,
      odds,
      fight,
      best: today ? today.best : E.bestScore(fight, candidates),
      result: today && { stars: today.stars, score: today.score, best: today.best },
      draws: { free: draws.some((d) => d.kind === "free"), bonus: draws.filter((d) => d.kind !== "free").length, bonusAllowed: today ? bonusAllowed(today.stars) : 0 },
      drawn: draws.map((d) => ({ kind: d.kind, card: d.data, share: d.code ? { code: d.code, cap: d.cap, claimed: d.claimed } : null })),
      team: await cardsById(db, player.team),
      owned: counts.owned,
      total: counts.total,
      streak,
      history: fights.slice(0, 14).map((f) => ({ day: f.day, stars: f.stars })),
    };
  }

  // 遇過幾個科、幾個目：貼紙路徑就是 目/科，不必另存欄位。只回數字，不列舉卡池。
  // 全卡池的總數每個程序算一次就夠，卡池在執行中不會變
  let lineageTotals = null;
  async function lineage(q, playerId) {
    const distinct = "count(DISTINCT split_part(data->>'file', '/', 2))::int AS orders, count(DISTINCT split_part(data->>'file', '/', 3))::int AS families";
    lineageTotals ||= (await q.query(`SELECT ${distinct} FROM cards`)).rows[0];
    const { rows: [mine] } = await q.query(`SELECT ${distinct} FROM owned o JOIN cards c ON c.id = o.card_id WHERE o.player_id = $1`, [playerId]);
    return { orders: { owned: mine.orders, total: lineageTotals.orders }, families: { owned: mine.families, total: lineageTotals.families } };
  }

  async function collection(playerId, page = 0) {
    const safePage = Math.min(MAX_PAGE, Math.max(0, Math.floor(Number(page)) || 0));
    const [{ rows }, { rows: [{ count }] }, lineageView] = await Promise.all([
      db.query(
        `SELECT c.data FROM owned o JOIN cards c ON c.id = o.card_id WHERE o.player_id = $1
         ORDER BY o.seq DESC LIMIT $2 OFFSET $3`,
        [playerId, PAGE_SIZE, safePage * PAGE_SIZE],
      ),
      db.query("SELECT count(*)::int AS count FROM owned WHERE player_id = $1", [playerId]),
      lineage(db, playerId),
    ]);
    return { page: safePage, pageSize: PAGE_SIZE, pages: Math.max(1, Math.ceil(count / PAGE_SIZE)), owned: count, cards: rows.map(toCard), lineage: lineageView };
  }

  async function assertOwned(q, playerId, ids) {
    const { rows } = await q.query("SELECT card_id FROM owned WHERE player_id = $1 AND card_id = ANY($2)", [playerId, ids]);
    if (rows.length !== ids.length) throw new GameError(400, "not_owned", "隊伍裡有你還沒有的鳥");
  }

  function validTeam(ids) {
    if (!Array.isArray(ids) || ids.length !== E.TEAM_SIZE || new Set(ids).size !== E.TEAM_SIZE || !ids.every((id) => typeof id === "string" && id.length <= MAX_CARD_ID)) {
      throw new GameError(400, "bad_team", `隊伍要剛好 ${E.TEAM_SIZE} 隻不同的鳥`);
    }
    return ids;
  }

  async function setTeam(playerId, ids) {
    validTeam(ids);
    await db.tx(async (q) => {
      await assertOwned(q, playerId, ids);
      await q.query("UPDATE players SET team = $2 WHERE id = $1", [playerId, ids]);
    });
    return { team: await cardsById(db, ids) };
  }

  // 保底只看自己抽的紀錄，朋友分享和初始的鳥不算；從紀錄推算就不必多存一份會對不上的計數。
  // 補運看整片林子，所以領到朋友分的稀有鳥，補運會跟著下降
  async function luckOf(q, playerId) {
    const [{ rows: drawn }, { rows: owned }] = await Promise.all([
      q.query(
        `SELECT c.rarity FROM draws d JOIN cards c ON c.id = d.card_id
         WHERE d.player_id = $1 ORDER BY d.day DESC, d.kind DESC`,
        [playerId],
      ),
      q.query(
        "SELECT c.rarity, count(*)::int AS n FROM owned o JOIN cards c ON c.id = o.card_id WHERE o.player_id = $1 GROUP BY c.rarity",
        [playerId],
      ),
    ]);
    const since = (tiers) => { const i = drawn.findIndex((d) => tiers.includes(d.rarity)); return i < 0 ? drawn.length : i; };
    const counts = Object.fromEntries(owned.map((r) => [r.rarity, r.n]));
    counts.N = Math.max(0, (counts.N || 0) - Object.keys(E.TYPES).length);
    return { sinceSSR: since(["SSR", "UR"]), sinceUR: since(["UR"]), boost: catchUp(counts, drawn.length) };
  }

  async function oddsView(playerId) {
    const luck = await luckOf(db, playerId);
    return {
      boost: luck.boost,
      ssrIn: PITY.SSR.hard - luck.sinceSSR,
      urIn: PITY.UR.hard - luck.sinceUR,
      next: oddsFor(luck),
    };
  }

  // 只從還沒有的牌抽
  async function pickUnowned(q, playerId) {
    const { rows: tiers } = await q.query(
      `SELECT DISTINCT c.rarity FROM cards c
       WHERE NOT EXISTS (SELECT 1 FROM owned o WHERE o.player_id = $1 AND o.card_id = c.id)`,
      [playerId],
    );
    const available = tiers.map((t) => t.rarity);
    if (!available.length) throw new GameError(409, "complete", "整座林子的鳥都收集完了");
    const odds = redistribute(oddsFor(await luckOf(q, playerId)), available);
    let at = random();
    let tier = TIERS.filter((t) => odds[t] > 0).at(-1);
    for (const name of TIERS) {
      if (odds[name] > 0 && at < odds[name]) { tier = name; break; }
      at -= odds[name];
    }
    const { rows } = await q.query(
      `SELECT c.id, c.data FROM cards c
       WHERE c.rarity = $2 AND NOT EXISTS (SELECT 1 FROM owned o WHERE o.player_id = $1 AND o.card_id = c.id)
       ORDER BY random() LIMIT 1`,
      [playerId, tier],
    );
    return rows[0];
  }

  // 同一天同一種抽重送，回傳原本那張牌，連點或斷線重試都不會多抽
  async function draw(playerId, kind, offset = 0) {
    if (!isKind(kind)) throw new GameError(400, "bad_kind", "沒有這種抽法");
    const day = dayOf(offset);
    return db.tx(async (q) => {
      await q.query("SELECT id FROM players WHERE id = $1 FOR UPDATE", [playerId]);
      const { rows: done } = await q.query(
        "SELECT c.data FROM draws d JOIN cards c ON c.id = d.card_id WHERE d.player_id = $1 AND d.day = $2 AND d.kind = $3",
        [playerId, day, kind],
      );
      if (done.length) return { card: done[0].data, repeated: true };
      if (kind !== "free") {
        const { rows } = await q.query("SELECT stars FROM fights WHERE player_id = $1 AND day = $2", [playerId, day]);
        if (!rows.length) throw new GameError(403, "not_won", "先打今天的 BOSS 才有獎勵抽");
        if (BONUS_KINDS.indexOf(kind) >= bonusAllowed(rows[0].stars)) throw new GameError(403, "bonus_used", "今天的獎勵樹已經搖完了");
      }
      const picked = await pickUnowned(q, playerId);
      await q.query("INSERT INTO owned (player_id, card_id) VALUES ($1, $2)", [playerId, picked.id]);
      await q.query("INSERT INTO draws (player_id, day, kind, card_id) VALUES ($1, $2, $3, $4)", [playerId, day, kind, picked.id]);
      return { card: picked.data, repeated: false };
    });
  }

  // 戰鬥沒有亂數，伺服器照出牌順序重播一次，客戶端回報的分數一律不採信
  function replay(fight, team, moves) {
    if (!Array.isArray(moves)) throw new GameError(400, "bad_moves", "出牌紀錄格式不對");
    let s = E.startState(team);
    for (const move of moves) {
      if (E.isOver(s)) throw new GameError(400, "bad_moves", "戰鬥結束後還在出牌");
      const slot = move?.slot, signature = move?.signature === true;
      if (!E.legalSlots(s).includes(slot)) throw new GameError(400, "illegal_move", "這隻鳥這回合不能上場");
      if (signature && s.signatureUsed) throw new GameError(400, "illegal_move", "招牌動作一場只能用一次");
      s = E.step(fight, team, s, slot, signature);
    }
    if (!E.isOver(s)) throw new GameError(400, "bad_moves", "戰鬥還沒打完");
    return s;
  }

  async function submitFight(playerId, teamIds, moves, offset = 0) {
    validTeam(teamIds);
    const day = dayOf(offset);
    return db.tx(async (q) => {
      await q.query("SELECT id FROM players WHERE id = $1 FOR UPDATE", [playerId]);
      const { rows: done } = await q.query("SELECT stars, score, best FROM fights WHERE player_id = $1 AND day = $2", [playerId, day]);
      if (done.length) return { ...done[0], repeated: true };
      await assertOwned(q, playerId, teamIds);
      const candidates = await roster(q, playerId);
      const fight = fightFor(day, candidates);
      const team = await cardsById(q, teamIds);
      const final = replay(fight, team, moves);
      // 只存重播用得到的欄位：出牌紀錄是玩家送來的，原樣存進 JSONB 會被塞進好幾 MB 的垃圾
      const kept = moves.map((move) => ({ slot: move.slot, signature: move.signature === true }));
      const best = E.bestScore(fight, candidates);
      const stars = E.starsFor(final.score, best);
      await q.query(
        "INSERT INTO fights (player_id, day, stars, score, best, team, moves) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [playerId, day, stars, final.score, best, teamIds, JSON.stringify(kept)],
      );
      return { stars, score: final.score, best, repeated: false };
    });
  }

  // 只有當天抽到的牌能分享，一次抽卡只有一條連結；領取只是複製，分享的人不會失去牠
  async function share(playerId, kind, offset = 0) {
    if (!isKind(kind)) throw new GameError(400, "bad_kind", "沒有這種抽法");
    const day = dayOf(offset);
    const { rows: [drawn] } = await db.query(
      "SELECT d.card_id, c.rarity FROM draws d JOIN cards c ON c.id = d.card_id WHERE d.player_id = $1 AND d.day = $2 AND d.kind = $3",
      [playerId, day, kind],
    );
    if (!drawn) throw new GameError(404, "no_draw", "今天還沒抽到這張牌");
    const { rows } = await db.query(
      `INSERT INTO shares (code, player_id, day, kind, card_id, cap) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (player_id, day, kind) DO UPDATE SET cap = shares.cap RETURNING code, cap, claimed`,
      [crypto.randomBytes(8).toString("hex"), playerId, day, kind, drawn.card_id, SHARE_CAPS[drawn.rarity]],
    );
    return rows[0];
  }

  const expired = (shareDay, day) => day > E.addDays(shareDay, SHARE_DAYS - 1);

  // 連結失效後不再露出鳥的內容，卡池不會因為舊連結被慢慢蒐集
  async function sharePreview(code, playerId, offset = 0) {
    if (typeof code !== "string" || !/^[a-f0-9]{16}$/.test(code)) return { status: "missing" };
    const day = dayOf(offset);
    const { rows: [row] } = await db.query(
      "SELECT s.player_id, s.day::text AS day, s.cap, s.claimed, c.data FROM shares s JOIN cards c ON c.id = s.card_id WHERE s.code = $1",
      [code],
    );
    if (!row) return { status: "missing" };
    if (expired(row.day, day)) return { status: "expired" };
    const base = { card: row.data, cap: row.cap, left: row.cap - row.claimed, lastDay: E.addDays(row.day, SHARE_DAYS - 1) };
    if (playerId !== null && Number(row.player_id) === playerId) return { ...base, status: "mine" };
    if (playerId !== null) {
      const { rows } = await db.query("SELECT 1 FROM owned WHERE player_id = $1 AND card_id = $2", [playerId, row.data.id]);
      if (rows.length) return { ...base, status: "owned" };
    }
    if (row.claimed >= row.cap) return { status: "gone", cap: row.cap };
    return { ...base, status: "open" };
  }

  async function claim(playerId, code, offset = 0) {
    if (typeof code !== "string" || !/^[a-f0-9]{16}$/.test(code)) throw new GameError(404, "missing", "找不到這條連結");
    const day = dayOf(offset);
    return db.tx(async (q) => {
      await q.query("SELECT id FROM players WHERE id = $1 FOR UPDATE", [playerId]);
      const { rows: [row] } = await q.query(
        "SELECT s.player_id, s.day::text AS day, s.card_id, c.data FROM shares s JOIN cards c ON c.id = s.card_id WHERE s.code = $1",
        [code],
      );
      if (!row) throw new GameError(404, "missing", "找不到這條連結");
      const { rows: done } = await q.query("SELECT 1 FROM claims WHERE player_id = $1 AND code = $2", [playerId, code]);
      if (done.length) return { card: row.data, repeated: true };
      if (Number(row.player_id) === playerId) throw new GameError(409, "mine", "這是你自己分享的鳥");
      if (expired(row.day, day)) throw new GameError(410, "expired", "這條連結過期了");
      const { rows: owned } = await q.query("SELECT 1 FROM owned WHERE player_id = $1 AND card_id = $2", [playerId, row.card_id]);
      if (owned.length) throw new GameError(409, "owned", "你的林子裡已經有這隻了");
      const { rows: [{ count }] } = await q.query("SELECT count(*)::int AS count FROM claims WHERE player_id = $1 AND day = $2", [playerId, day]);
      if (count >= CLAIMS_PER_DAY) throw new GameError(429, "claim_limit", `今天已經領了 ${CLAIMS_PER_DAY} 隻，明天再來`);
      const { rows: taken } = await q.query("UPDATE shares SET claimed = claimed + 1 WHERE code = $1 AND claimed < cap RETURNING claimed", [code]);
      if (!taken.length) throw new GameError(410, "gone", "這隻已經被領完了");
      await q.query("INSERT INTO owned (player_id, card_id) VALUES ($1, $2)", [playerId, row.card_id]);
      await q.query("INSERT INTO claims (player_id, code, card_id, day) VALUES ($1, $2, $3, $4)", [playerId, code, row.card_id, day]);
      return { card: row.data, repeated: false };
    });
  }

  const health = async () => {
    await db.query("SELECT 1");
    return { ok: true };
  };

  return { health, login, logout, revoke, share, sharePreview, claim, createPlayer, authenticate, state, collection, setTeam, draw, submitFight, dayOf };
}

module.exports = { createGame, GameError, PAGE_SIZE, MAX_SESSIONS, ipKey };
