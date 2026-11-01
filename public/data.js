// 瀏覽器和伺服器共用的設定。
(function (root) {
  const RATES = { UR: 0.01, SSR: 0.05, SR: 0.17, R: 0.32, N: 0.45 };
  // 分享連結：越稀有，能領的人越少。連結開放 3 天（含抽到當天），每人每天最多領 5 隻
  const SHARE_CAPS = { N: 10, R: 5, SR: 3, SSR: 2, UR: 1 };
  const SHARE_DAYS = 3;
  const CLAIMS_PER_DAY = 5;
  const BOSSES = [
  { id: "passer", name: "麻雀", type: "plant", atkShape: 0.19, defShape: 0.2, img: "stickers/passer.webp" },
  { id: "urocissa", name: "臺灣藍鵲", type: "mixed", atkShape: 0.5, defShape: 0.44, img: "stickers/urocissa.webp" },
  { id: "platalea", name: "黑面琵鷺", type: "meat", atkShape: 0.78, defShape: 0.6, img: "stickers/platalea.webp" },
  { id: "syrmaticus", name: "帝雉", type: "mixed", atkShape: 0.55, defShape: 0.56, img: "stickers/syrmaticus.webp" },
  { id: "balaeniceps", name: "鯨頭鸛", type: "meat", atkShape: 0.9, defShape: 0.75, img: "stickers/balaeniceps.webp" },
];
  if (typeof module !== "undefined") module.exports = { RATES, BOSSES, SHARE_CAPS, SHARE_DAYS, CLAIMS_PER_DAY };
  else root.GachaData = { RATES, BOSSES, SHARE_CAPS, SHARE_DAYS, CLAIMS_PER_DAY };
})(typeof window !== "undefined" ? window : globalThis);
