// 分享連結 /s/:code 的頁面：爬蟲讀 meta 做預覽，真人立刻轉進遊戲領鳥。
// 爬蟲不帶語言，所以由分享的人決定預覽語言：英文介面分享出去的連結會帶 ?lang=en。
// 轉進遊戲時不帶語言，領鳥的人仍照自己瀏覽器的語言看。
const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const TEXT = {
  "zh-Hant": {
    html: "zh-Hant", locale: "zh_TW", site: "一鳥在手", go: "走進林子",
    home: "一鳥在手｜百鳥在林，不如一鳥在手",
    pitch: "每天搖一棵樹，遇見一隻真實世界的鳥，再帶三隻去打看起來超正經的 BOSS。",
    title: (card) => `朋友分你一隻${card.rarity}「${card.zh}」｜一鳥在手`,
    left: (n) => `還剩 ${n} 份，領完就沒了。`,
    imageAlt: "一隻潦草的鳥站在手上，旁邊寫著一鳥在手",
  },
  en: {
    html: "en", locale: "en_US", site: "A Bird in the Hand", go: "Into the woods",
    home: "A Bird in the Hand",
    pitch: "Shake a tree every day to meet a real-world bird, then take three of them to fight a very serious-looking BOSS.",
    title: (card) => `A friend shared a bird with you: ${card.en || card.sci} (${card.rarity}) | A Bird in the Hand`,
    left: (n) => `${n} left. Once they're gone, they're gone.`,
    imageAlt: "A scribbly bird perched on a hand, next to the words 一鳥在手",
  },
};

function sharePage(code, preview, origin = "", lang = "zh-Hant") {
  const L = TEXT[lang] || TEXT["zh-Hant"];
  const safe = /^[a-z0-9]{1,20}$/i.test(code) ? code : "";
  const live = preview?.status === "open";
  const title = live ? L.title(preview.card) : L.home;
  const description = live ? L.left(preview.left) : L.pitch;
  const target = safe ? `/?s=${safe}` : "/";
  return `<!doctype html><html lang="${L.html}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="robots" content="noindex">
<meta property="og:site_name" content="${esc(L.site)}"><meta property="og:type" content="website"><meta property="og:locale" content="${L.locale}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(origin)}/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(L.imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(target)}"><script>location.replace(${JSON.stringify(target)})</script></head>
<body><a href="${esc(target)}">${esc(L.go)}</a></body></html>`;
}

module.exports = { sharePage };
