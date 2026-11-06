// 瀏覽器和伺服器共用的設定。
(function (root) {
  const RATES = { UR: 0.01, SSR: 0.05, SR: 0.17, R: 0.32, N: 0.45 };
  // 分享連結：越稀有，能領的人越少。連結開放 3 天（含抽到當天），每人每天最多領 5 隻
  const SHARE_CAPS = { N: 10, R: 5, SR: 3, SSR: 2, UR: 1 };
  const SHARE_DAYS = 3;
  // 打 BOSS 的獎勵樹：有打就有 1 棵，每顆星再多 1 棵。每一棵是一種抽法，同一棵重送會拿回同一隻鳥
  const BONUS_KINDS = ["bonus", "bonus2", "bonus3", "bonus4"];
  const bonusAllowed = (stars) => Math.min(BONUS_KINDS.length, 1 + Math.max(0, stars | 0));
  const CLAIMS_PER_DAY = 5;
  // BOSS 用 Wikimedia Commons 的真實照片（tools/build-photos.py 產生，加了紙框），photo 是署名資料。
  const BOSSES = [
  { id: "passer", name: "麻雀", type: "plant", atkShape: 0.19, defShape: 0.2, img: "stickers/passer-photo.webp", photo: {"artist": "Andreas Trepte", "license": "CC BY-SA 2.5", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.5", "page": "https://commons.wikimedia.org/wiki/File:Tree-Sparrow-2009-16-02.jpg"} },
  { id: "urocissa", name: "臺灣藍鵲", type: "mixed", atkShape: 0.5, defShape: 0.44, img: "stickers/urocissa-photo.webp", photo: {"artist": "Charles J. Sharp", "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0", "page": "https://commons.wikimedia.org/wiki/File:Taiwan_blue_magpie_(Urocissa_caerulea)_Xindian.jpg"} },
  { id: "platalea", name: "黑面琵鷺", type: "meat", atkShape: 0.78, defShape: 0.6, img: "stickers/platalea-photo.webp", photo: {"artist": "spaceaero2", "license": "CC BY 3.0", "licenseUrl": "https://creativecommons.org/licenses/by/3.0", "page": "https://commons.wikimedia.org/wiki/File:Platalea_minor_okinawa.jpg"} },
  { id: "syrmaticus", name: "帝雉", type: "mixed", atkShape: 0.55, defShape: 0.56, img: "stickers/syrmaticus-photo.webp", photo: {"artist": "Snowyowls", "license": "CC BY-SA 3.0", "licenseUrl": "http://creativecommons.org/licenses/by-sa/3.0/", "page": "https://commons.wikimedia.org/wiki/File:Mikado_Pheasant_398.jpg"} },
  { id: "balaeniceps", name: "鯨頭鸛", type: "meat", atkShape: 0.9, defShape: 0.75, img: "stickers/balaeniceps-photo.webp", photo: {"artist": "Johannes Bahrdt", "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0", "page": "https://commons.wikimedia.org/wiki/File:Schoebill-Lake-Albert.jpg"} },
];

  // 保底：連續沒抽到時機率線性上升，到 hard 那一抽必中。一天最多兩抽，門檻依「幾週一隻」訂，不是照搬付費遊戲的 90 抽
  const PITY = { SSR: { soft: 15, hard: 25 }, UR: { soft: 50, hard: 70 } };
  // 補運：林子裡的鳥低於期望稀有度時，提高 SR 以上的機率，最多 1.5 倍，且不會低於公開的基礎機率。
  // 前幾抽不生效、樣本少時偏向期望值，否則開新帳號就有補運，分身抽卡會更划算
  const CATCH_UP = { max: 1.5, gain: 2, prior: 10, minDraws: 7, weight: { N: 1, R: 2, SR: 4, SSR: 8, UR: 16 } };
  const TIERS = ["UR", "SSR", "SR", "R", "N"];

  function catchUp(counts, draws) {
    if (draws < CATCH_UP.minDraws) return 1;
    const expected = TIERS.reduce((sum, t) => sum + RATES[t] * CATCH_UP.weight[t], 0);
    const owned = TIERS.reduce((sum, t) => sum + (counts[t] || 0), 0);
    const score = TIERS.reduce((sum, t) => sum + (counts[t] || 0) * CATCH_UP.weight[t], 0);
    const mean = (score + CATCH_UP.prior * expected) / (owned + CATCH_UP.prior);
    return Math.min(CATCH_UP.max, Math.max(1, 1 + CATCH_UP.gain * (expected - mean) / expected));
  }

  const climb = (base, next, { soft, hard }) => (next <= soft ? base : Math.min(1, base + ((next - soft) * (1 - base)) / (hard - soft)));

  // since 是距離上次抽到該稀有度（SSR 含 UR）已經幾抽，回傳下一抽的機率
  function oddsFor({ sinceSSR = 0, sinceUR = 0, boost = 1 } = {}) {
    const ur = climb(RATES.UR * boost, sinceUR + 1, PITY.UR);
    const top = Math.max(ur, climb((RATES.UR + RATES.SSR) * boost, sinceSSR + 1, PITY.SSR));
    const sr = Math.min(1 - top, RATES.SR * boost);
    const rest = 1 - top - sr;
    const low = RATES.R + RATES.N;
    return { UR: ur, SSR: top - ur, SR: sr, R: (rest * RATES.R) / low, N: (rest * RATES.N) / low };
  }

  // 抽完的稀有度機率往下一級移，最低一級也沒了才往上。必中 UR 但 UR 已收齊時，至少還是 SSR
  function redistribute(odds, available) {
    const out = { UR: 0, SSR: 0, SR: 0, R: 0, N: 0 };
    let carry = 0;
    for (const t of TIERS) {
      if (available.includes(t)) { out[t] = odds[t] + carry; carry = 0; } else carry += odds[t];
    }
    if (carry) { const top = TIERS.find((t) => available.includes(t)); if (top) out[top] += carry; }
    return out;
  }

  const api = { RATES, BOSSES, SHARE_CAPS, SHARE_DAYS, BONUS_KINDS, bonusAllowed, CLAIMS_PER_DAY, PITY, CATCH_UP, TIERS, catchUp, oddsFor, redistribute };
  if (typeof module !== "undefined") module.exports = api;
  else root.GachaData = api;
})(typeof window !== "undefined" ? window : globalThis);
