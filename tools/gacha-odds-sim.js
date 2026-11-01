// 模擬保底和補運的實際效果：node tools/gacha-odds-sim.js [抽數]
const { RATES, TIERS, PITY, catchUp, oddsFor } = require("../public/data.js");

const DRAWS = Number(process.argv[2]) || 2000000;
const LIFE = 365;

function roll(odds) {
  let at = Math.random();
  for (const t of TIERS) { if (at < odds[t]) return t; at -= odds[t]; }
  return "N";
}
const quantile = (list, q) => [...list].sort((a, b) => a - b)[Math.floor(list.length * q)];

function run(useCatchUp, usePity) {
  const got = Object.fromEntries(TIERS.map((t) => [t, 0]));
  const gapUR = [], gapSSR = [];
  let boosted = 0, peak = 1;
  for (let done = 0; done < DRAWS;) {
    const counts = {};
    let sinceSSR = 0, sinceUR = 0;
    for (let i = 0; i < LIFE && done < DRAWS; i += 1, done += 1) {
      const boost = useCatchUp ? catchUp(counts, i) : 1;
      if (boost > 1) boosted += 1;
      peak = Math.max(peak, boost);
      const tier = roll(usePity ? oddsFor({ sinceSSR, sinceUR, boost }) : oddsFor({ boost }));
      got[tier] += 1;
      counts[tier] = (counts[tier] || 0) + 1;
      sinceSSR += 1; sinceUR += 1;
      if (tier === "UR") { gapUR.push(sinceUR); sinceUR = 0; }
      if (tier === "UR" || tier === "SSR") { gapSSR.push(sinceSSR); sinceSSR = 0; }
    }
  }
  const avg = (l) => l.reduce((a, b) => a + b, 0) / l.length;
  return {
    rates: Object.fromEntries(TIERS.map((t) => [t, `${((got[t] / DRAWS) * 100).toFixed(2)}%`])),
    UR: { avg: +avg(gapUR).toFixed(1), p50: quantile(gapUR, 0.5), p99: quantile(gapUR, 0.99), max: gapUR.reduce((a, b) => Math.max(a, b), 0) },
    SSRplus: { avg: +avg(gapSSR).toFixed(1), p50: quantile(gapSSR, 0.5), p99: quantile(gapSSR, 0.99), max: gapSSR.reduce((a, b) => Math.max(a, b), 0) },
    boostedDraws: `${((boosted / DRAWS) * 100).toFixed(0)}%`, peakBoost: +peak.toFixed(2),
  };
}

const noPity = run(false, false);
console.log("基礎", RATES, PITY);
console.log("無保底無補運", noPity);
console.log("只有保底", run(false, true));
console.log("保底＋補運", run(true, true));
