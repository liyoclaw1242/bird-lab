// 戰鬥規則（純函式，瀏覽器和 tools/gacha-sim.js 共用）。同一天、同一組牌，結果完全相同。
(function (root) {
  const TEAM_SIZE = 3;
  const ROUNDS = 5;
  const SIGNATURE_MUL = 2;
  const HP_PER_DEF = 1.5;
  const ATK_SCALE = 1.5;
  const STAR_CUTS = [0.6, 0.8, 0.95];
  const CANDIDATES_PER_TYPE = 6;

  const TYPES = {
    meat: { label: "吃肉", beats: "mixed" },
    mixed: { label: "吃蟲雜食", beats: "plant" },
    plant: { label: "吃植物", beats: "meat" },
  };

  const INTENTS = {
    peck: { label: "普通啄", hint: "正常攻防", hit: 1, take: 1 },
    smash: { label: "全力一擊", hint: "挨打 ×1.8", hit: 1.8, take: 1 },
    rest: { label: "喘氣", hint: "牠很虛，傷害 ×1.4", hit: 0.3, take: 1.4 },
    armor: { label: "縮起來", hint: "傷害 ×0.5", hit: 0.6, take: 0.5 },
  };

  const NICHE_TYPE = {
    Vertivore: "meat", "Aquatic predator": "meat", Scavenger: "meat",
    Invertivore: "mixed", Omnivore: "mixed",
    Granivore: "plant", Frugivore: "plant", Nectarivore: "plant",
    "Herbivore aquatic": "plant", "Herbivore terrestrial": "plant",
  };

  const typeMul = (from, to) => (TYPES[from].beats === to ? 1.5 : TYPES[to].beats === from ? 0.67 : 1);

  function rng(text) {
    let h = 2166136261;
    for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
    return () => {
      h = (h + 0x6d2b79f5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rand) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  const taipeiDate = (at = new Date()) => new Date(at.getTime() + 8 * 3600e3).toISOString().slice(0, 10);
  const addDays = (date, n) => new Date(Date.parse(date) + n * 86400e3).toISOString().slice(0, 10);

  // 洗好的 BOSS 輪完一圈才重複
  function bossOfDay(bosses, date) {
    const day = Math.floor(Date.parse(date) / 86400e3);
    const order = (cycle) => {
      const list = shuffle(bosses, rng(`cycle:${cycle}`));
      const previousLast = shuffle(bosses, rng(`cycle:${cycle - 1}`)).at(-1);
      // 只看前一圈洗牌的原始結尾：兩圈交界不連續遇到同一隻
      return list[0] === previousLast ? [...list.slice(1), list[0]] : list;
    };
    return order(Math.floor(day / bosses.length))[day % bosses.length];
  }

  function scriptOfDay(date) {
    const rand = rng(`script:${date}`);
    const extra = ["peck", "smash", "rest", "armor"];
    const picks = ["smash", "rest", "armor", extra[Math.floor(rand() * 4)], extra[Math.floor(rand() * 4)]];
    return shuffle(picks, rand);
  }

  // 中途換食性，單一食性的隊伍才不會是唯一解
  function formsOfDay(boss, date) {
    const rand = rng(`form:${date}`);
    const others = Object.keys(TYPES).filter((t) => t !== boss.type);
    const second = others[Math.floor(rand() * others.length)];
    const switchAt = 2 + Math.floor(rand() * 2);
    return Array.from({ length: ROUNDS }, (_, i) => (i < switchAt ? boss.type : second));
  }

  const power = (card) => card.atk + card.def;

  // BOSS 跟著收藏變強，所以牌變強不會讓戰鬥變簡單
  function makeFight(boss, date, owned) {
    const top = [...owned].sort((a, b) => power(b) - power(a)).slice(0, TEAM_SIZE);
    const scale = top.reduce((sum, c) => sum + power(c) / 2, 0) / top.length;
    return { boss, script: scriptOfDay(date), forms: formsOfDay(boss, date), bossAtk: scale * (ATK_SCALE + 0.5 * boss.atkShape), bossDef: 40 + 40 * boss.defShape };
  }

  const startState = (team) => ({ round: 0, score: 0, hp: team.map((c) => c.def * HP_PER_DEF), last: -1, signatureUsed: false });
  const isOver = (s) => s.round >= ROUNDS || s.hp.every((v) => v <= 0);

  function legalSlots(s) {
    const alive = s.hp.flatMap((v, i) => (v > 0 ? [i] : []));
    const fresh = alive.filter((i) => i !== s.last);
    return fresh.length ? fresh : alive;
  }

  function preview(fight, team, s, slot, signature) {
    const card = team[slot];
    const intent = INTENTS[fight.script[s.round]];
    const form = fight.forms[s.round];
    const dealt = card.atk * typeMul(card.type, form) * intent.take * (signature ? SIGNATURE_MUL : 1) * 100 / (100 + fight.bossDef);
    const taken = fight.bossAtk * intent.hit * typeMul(form, card.type) * 100 / (100 + card.def);
    return { dealt, taken };
  }

  function step(fight, team, s, slot, signature) {
    const { dealt, taken } = preview(fight, team, s, slot, signature);
    const hp = [...s.hp];
    hp[slot] = Math.max(0, hp[slot] - taken);
    return { round: s.round + 1, score: s.score + dealt, hp, last: slot, signatureUsed: s.signatureUsed || signature };
  }

  function bestPlay(fight, team, s = startState(team)) {
    if (isOver(s)) return s.score;
    let best = s.score;
    for (const slot of legalSlots(s)) {
      best = Math.max(best, bestPlay(fight, team, step(fight, team, s, slot, false)));
      if (!s.signatureUsed) best = Math.max(best, bestPlay(fight, team, step(fight, team, s, slot, true)));
    }
    return best;
  }

  // 全部 109 張窮舉太慢：每種食性只留最強幾張，最佳隊伍不會落在這之外的機率很低
  function candidates(owned) {
    return Object.keys(TYPES).flatMap((type) =>
      owned.filter((c) => c.type === type).sort((a, b) => power(b) - power(a)).slice(0, CANDIDATES_PER_TYPE));
  }

  function bestScore(fight, owned) {
    const pool = candidates(owned);
    let best = 0;
    for (let a = 0; a < pool.length; a++)
      for (let b = a + 1; b < pool.length; b++)
        for (let c = b + 1; c < pool.length; c++)
          best = Math.max(best, bestPlay(fight, [pool[a], pool[b], pool[c]]));
    return best;
  }

  const starsFor = (score, best) => STAR_CUTS.filter((cut) => score / best >= cut).length;

  const api = {
    TEAM_SIZE, ROUNDS, SIGNATURE_MUL, HP_PER_DEF, STAR_CUTS, TYPES, INTENTS, NICHE_TYPE,
    typeMul, rng, shuffle, taipeiDate, addDays, bossOfDay, scriptOfDay, formsOfDay, power,
    makeFight, startState, isOver, legalSlots, preview, step, bestPlay, bestScore, starsFor,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.GachaEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
