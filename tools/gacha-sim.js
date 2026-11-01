// 用不同打法跑 public/engine.js，看星數能不能反映「會不會玩」：node tools/gacha-sim.js [每格場數]
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const E = require("../public/engine.js");

const dir = path.join(__dirname, "../docs/gacha-research");
const CARDS = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, "../server/data/cards.json.gz"))).toString("utf8"));
const BOSSES = JSON.parse(fs.readFileSync(path.join(dir, "bosses.json"), "utf8")).map((b) => ({ ...b, type: E.NICHE_TYPE[b.niche] }));

const RATE = { UR: 0.01, SSR: 0.05, SR: 0.17, R: 0.32, N: 0.45 };
function collection(day, rand) {
  const owned = Object.keys(E.TYPES).map((type) => CARDS.filter((c) => c.type === type && c.rarity === "N").at(-1));
  for (let i = 0; i < day * 2; i++) {
    const left = CARDS.filter((c) => !owned.includes(c));
    if (!left.length) break;
    const tiers = Object.entries(RATE).filter(([t]) => left.some((c) => c.rarity === t));
    let at = rand() * tiers.reduce((sum, [, p]) => sum + p, 0), tier = tiers.at(-1)[0];
    for (const [t, p] of tiers) { if (at < p) { tier = t; break; } at -= p; }
    const pool = left.filter((c) => c.rarity === tier);
    owned.push(pool[Math.floor(rand() * pool.length)]);
  }
  return owned;
}

const byPower = (cards) => [...cards].sort((a, b) => E.power(b) - E.power(a));
const pickTeam = {
  random: (owned, boss, rand) => E.shuffle(owned, rand).slice(0, 3),
  strongest: (owned) => byPower(owned).slice(0, 3),
  counter: (owned, boss) => [...owned].sort((a, b) => b.atk * E.typeMul(b.type, boss.type) - a.atk * E.typeMul(a.type, boss.type)).slice(0, 3),
  // 兩個型態各派最會打的，再補一隻最能撐的
  cover: (owned, boss, rand, fight) => {
    const team = [];
    for (const form of new Set(fight.forms)) {
      const rest = owned.filter((c) => !team.includes(c));
      team.push(rest.reduce((a, b) => (b.atk * E.typeMul(b.type, form) > a.atk * E.typeMul(a.type, form) ? b : a)));
    }
    return [...team, ...byPower(owned.filter((c) => !team.includes(c)))].slice(0, 3);
  },
};

function play(fight, team, choose) {
  let s = E.startState(team);
  while (!E.isOver(s)) {
    const [slot, signature] = choose(fight, team, s);
    s = E.step(fight, team, s, slot, signature);
  }
  return s.score;
}

const moves = {
  random: (rand) => (fight, team, s) => {
    const slots = E.legalSlots(s);
    return [slots[Math.floor(rand() * slots.length)], !s.signatureUsed && rand() < 0.3];
  },
  hardest: () => (fight, team, s) => {
    const slots = E.legalSlots(s);
    const slot = slots.reduce((a, b) => (E.preview(fight, team, s, b, false).dealt > E.preview(fight, team, s, a, false).dealt ? b : a));
    return [slot, !s.signatureUsed];
  },
  // 模擬會看預告的玩家：招牌留給牠最虛的回合，會被打死就換一隻能撐的，不往前算
  reader: () => (fight, team, s) => {
    const slots = E.legalSlots(s);
    const value = (i) => {
      const { dealt, taken } = E.preview(fight, team, s, i, false);
      return dealt - (taken >= s.hp[i] ? dealt * 0.6 : 0);
    };
    const slot = slots.reduce((a, b) => (value(b) > value(a) ? b : a));
    const left = fight.script.slice(s.round);
    const bestTake = Math.max(...left.map((k) => E.INTENTS[k].take));
    return [slot, !s.signatureUsed && E.INTENTS[fight.script[s.round]].take === bestTake];
  },
  perfect: null,
};

const STYLES = [
  ["亂選隊伍＋亂打", "random", "random"],
  ["最強三張＋只挑傷害最高", "strongest", "hardest"],
  ["最強三張＋看預告", "strongest", "reader"],
  ["看相剋選隊＋只挑傷害最高", "counter", "hardest"],
  ["看相剋選隊＋看預告", "counter", "reader"],
  ["顧兩型態選隊＋只挑傷害最高", "cover", "hardest"],
  ["顧兩型態選隊＋看預告", "cover", "reader"],
  ["最強三張＋完美出牌", "strongest", "perfect"],
  ["看相剋選隊＋完美出牌", "counter", "perfect"],
  ["顧兩型態選隊＋完美出牌", "cover", "perfect"],
];

const trials = +process.argv[2] || 300;
const start = Date.UTC(2026, 10, 1);
for (const day of [0, 7, 30, 90, 180]) {
  const tally = Object.fromEntries(STYLES.map(([name]) => [name, [0, 0, 0, 0]]));
  let beatenByRawTeam = 0;
  for (let t = 0; t < trials; t++) {
    const rand = E.rng(`d${day}t${t}`);
    const date = new Date(start + t * 86400e3).toISOString().slice(0, 10);
    const owned = collection(day, rand);
    const boss = E.bossOfDay(BOSSES, date);
    const fight = E.makeFight(boss, date, owned);
    const best = E.bestScore(fight, owned);
    for (const [name, team, move] of STYLES) {
      const roster = pickTeam[team](owned, boss, rand, fight);
      const score = move === "perfect" ? E.bestPlay(fight, roster) : play(fight, roster, moves[move](rand));
      tally[name][E.starsFor(score, best)]++;
    }
    if (E.bestPlay(fight, pickTeam.strongest(owned)) < best * E.STAR_CUTS[2]) beatenByRawTeam++;
  }
  console.log(`\n第 ${day} 天（${trials} 場）：0★/1★/2★/3★ 佔比；最強三張打不到 3★ 的比例 ${Math.round((beatenByRawTeam / trials) * 100)}%`);
  for (const [name, c] of Object.entries(tally))
    console.log(`  ${name.padEnd(16, "　")} ${c.map((n) => String(Math.round((n / trials) * 100)).padStart(3)).join(" ")}`);
}
